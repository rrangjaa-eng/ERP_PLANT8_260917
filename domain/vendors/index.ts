import type { Viewer } from "@/domain/viewer";
import { can as defaultCan } from "@/domain/permissions/can";
import { visible as defaultVisible } from "@/domain/permissions/visible";
import { scopeFor } from "@/domain/permissions/scope-for";
import { project, type DtoSpec } from "@/domain/permissions/project";
import { recordAction as defaultRecordAction } from "@/domain/action-log/record";
import { registerDto } from "@/domain/permissions/dto-registry";
import { UserFacingError } from "@/lib/actions/user-facing-error";
import { encrypt, decrypt } from "@/lib/crypto";
import { withTransaction } from "@/lib/db-transaction";
import { resolveCustomFieldsWrite, type InputFieldDef } from "@/domain/custom-fields/preserve";
import {
  listVendors as repoListVendors,
  searchVendorsByNormalizedName as repoSearchVendorsByNormalizedName,
  findVendorById as repoFindVendorById,
  findVendorByIdForUpdate as repoFindVendorByIdForUpdate,
  findVendorsByNormalizedName as repoFindVendorsByNormalizedName,
  findVendorsByBusinessNoDigits as repoFindVendorsByBusinessNoDigits,
  insertVendor as repoInsertVendor,
  updateVendor as repoUpdateVendor,
  updateVendorAccountNumber as repoUpdateVendorAccountNumber,
  setVendorHidden as repoSetVendorHidden,
  type VendorRow,
} from "@/repositories/vendors";
import { readVendorFieldAccess } from "@/repositories/permissions";
import type { DbOrTx } from "@/repositories/document-counters";
import { pickVisibleCustomFields, visibleCustomFieldKeys } from "@/domain/custom-fields/visibility";
import { servesSide, vendorKindToAdd, VENDOR_KIND_LABELS, type VendorKind, type VendorSide } from "@/domain/vendors/kind";
import { isUniqueViolation } from "@/lib/pg-errors";

export class ForbiddenError extends UserFacingError {}

// 보관은 사용자에게 "삭제"로 보이는 상태다 — 삭제된 것이 조용히 바뀌면 안 된다.
export class ArchivedVendorError extends UserFacingError {}
// 선검사와 트랜잭션 안 잠금 조회가 같은 문구를 쓴다(경합으로 안에서 잡혀도 같은 원인 — 디자인 교차 리뷰 m-3).
const ARCHIVED_VENDOR_MESSAGE = "보관됐거나 존재하지 않는 거래처는 수정할 수 없음";
const NOT_SAME_BUSINESS_NO_MESSAGE = "같은 사업자번호 거래처 아님 · 다시 저장";

// 사업자번호 중복 막기(260907 vendors_business_number_once와 같은 뜻) — 살아 있는(보관 안 된) 거래처 사이 숫자만 같은 번호는 하나.
// 색인 이름은 마이그레이션(PR B)이 정한다. 선검사가 1차이고 이 색인의 23505는 동시 등록 경합만 잡는다.
export const BUSINESS_NO_UNIQUE_INDEX = "vendors_business_no_live_key";

export type DuplicateBusinessNoExisting = {
  id: string;
  name: string;
  kind: VendorKind;
  hidden: boolean;
  archived: boolean;
};

// 같은 사업자번호 거래처가 있음 — 화면이 칸 아래 문구 · 링크 · 「구분 더하기」를 그리도록 기존 거래처를 싣는다.
// addSide는 새 갈래를 더해야 덮일 때 켤 갈래(보관 · 숨김 · 이미 덮음이면 null).
// existing은 「거래처 정보」(vendor.value)를 못 보는 사람에게는 null — VendorDto처럼 id · 숨김 · 보관까지 그 판정 뒤에만 싣는다.
export class DuplicateBusinessNoError extends UserFacingError {
  constructor(
    readonly existing: DuplicateBusinessNoExisting | null,
    readonly addSide: VendorSide | null,
    message: string,
  ) {
    super(message);
  }
}

// 숫자만 뽑은 사업자번호 — SQL `regexp_replace(…, '[^0-9]', '', 'g')`와 같은 결과. 숫자가 없으면 null.
export function businessNoDigits(raw: string | null | undefined): string | null {
  const digits = (raw ?? "").replace(/\D/g, "");
  return digits === "" ? null : digits;
}

// 사업자번호 모양 · 검증 숫자 — 비어 있으면 통과(번호는 필수가 아니다). 국세청 규칙(260907과 같다): 앞 아홉 자리 가중합 + 아홉째×5의 십의 자리.
export function businessNoProblem(raw: string | null | undefined): string | null {
  if ((raw ?? "").trim() === "") return null;
  const digits = businessNoDigits(raw);
  if (digits === null || digits.length !== 10) return "사업자번호 10자리 아님";
  const weights = [1, 3, 7, 1, 3, 7, 1, 3, 5];
  const sum = weights.reduce((acc, weight, i) => acc + Number(digits[i]) * weight, 0) + Math.floor((Number(digits[8]) * 5) / 10);
  return (10 - (sum % 10)) % 10 === Number(digits[9]) ? null : "사업자번호 검증 숫자 틀림 · 다시 확인";
}

export class InvalidBusinessNoError extends UserFacingError {}

function assertBusinessNoValid(raw: string | null | undefined): void {
  const problem = businessNoProblem(raw);
  if (problem !== null) throw new InvalidBusinessNoError(problem);
}

const ARCHIVE_MENU = "admin.archive";

function duplicateBusinessNoMessage(existing: DuplicateBusinessNoExisting | null, addSide: VendorSide | null): string {
  if (existing === null) return "같은 사업자번호 거래처 있음";
  if (existing.archived) return `보관함에 같은 사업자번호 거래처 있음 · ${existing.name}`;
  if (existing.hidden) return `같은 사업자번호 거래처 있음 · ${existing.name}(숨김)`;
  if (addSide !== null) return `같은 사업자번호 거래처 있음 · ${existing.name}(${VENDOR_KIND_LABELS[existing.kind]})`;
  return `같은 사업자번호 거래처 있음 · ${existing.name}`;
}

// 선검사 — 같은 숫자 번호의 다른 거래처가 있으면 던진다(없으면 조용히 지난다). wantedKind가 있으면(등록) 「구분 더하기」 갈래도 계산한다.
async function assertBusinessNoFree(
  viewer: Viewer,
  rawBusinessNo: string | null | undefined,
  opts: { excludeId?: string; wantedKind?: VendorKind; tx?: DbOrTx; visible: typeof defaultVisible; can?: typeof defaultCan },
): Promise<void> {
  const digits = businessNoDigits(rawBusinessNo);
  if (digits === null) return;
  const [match] = await repoFindVendorsByBusinessNoDigits(viewer, digits, { excludeId: opts.excludeId }, opts.tx);
  if (!match) return;
  if (!(await opts.visible(viewer, "vendor.value"))) {
    throw new DuplicateBusinessNoError(null, null, duplicateBusinessNoMessage(null, null));
  }
  const archived = match.archivedAt !== null;
  // 보관된 거래처의 이름 · 「보관함에서 복원」 링크는 보관함을 볼 수 있는 사람에게만(못 들어가는 곳을 가리키지 않는다).
  if (archived && !(await (opts.can ?? defaultCan)(viewer, ARCHIVE_MENU, "view"))) {
    throw new DuplicateBusinessNoError(null, null, "보관함에 같은 사업자번호 거래처 있음");
  }
  const existing: DuplicateBusinessNoExisting = { id: match.id, name: match.name, kind: match.kind, hidden: match.hidden, archived };
  // 숨긴 거래처는 「그 거래처 열기」(계획 §8) — 구분을 더해도 숨김이라 고르기에 나오지 않는다.
  const addSide = opts.wantedKind === undefined || match.hidden ? null : vendorKindToAdd(match.kind, opts.wantedKind, archived);
  throw new DuplicateBusinessNoError(existing, addSide, duplicateBusinessNoMessage(existing, addSide));
}

const VENDORS_MENU = "admin.vendors";
const VENDOR_ENTITY = "vendor";
const REVEAL_INFO_ITEM = "vendor.account_number_unmasked";

// MAST-01: 거래처 Dto — 전체 계좌번호(평문) 필드를 두지 않는다. 뒤 4자리
// (accountNumberLast4)만 실어 목록이 마스킹 표시를 그릴 수 있게 하고, 평문은
// 마스킹 해제 함수(파일 아래쪽)의 반환값으로만 나간다.
export type VendorDto = {
  id: string;
  name: string;
  businessNo: string | null;
  hidden: boolean;
  kind: VendorKind;
  defaultEvidenceType: string | null;
  accountBank: string | null;
  accountHolder: string | null;
  accountNumberLast4: string | null;
  customFields: Record<string, unknown>;
  archivedAt: Date | null;
};

export const VENDOR_DTO_SPEC: DtoSpec<VendorRow, VendorDto> = {
  fields: [
    { key: "id", from: "id", infoItem: "vendor.value" },
    { key: "name", from: "name", infoItem: "vendor.value" },
    { key: "businessNo", from: "businessNo", infoItem: "vendor.value" },
    { key: "hidden", from: "hidden", infoItem: "vendor.value" },
    { key: "kind", from: "kind", infoItem: "vendor.value" },
    { key: "defaultEvidenceType", from: "defaultEvidenceType", infoItem: "vendor.value" },
    { key: "accountBank", from: "accountBank", infoItem: "vendor.value" },
    { key: "accountHolder", from: "accountHolder", infoItem: "vendor.value" },
    { key: "accountNumberLast4", from: "accountNumberLast4", infoItem: "vendor.value" },
    { key: "customFields", from: "customFields", infoItem: "vendor.value" },
    { key: "archivedAt", from: "archivedAt", infoItem: "vendor.value" },
  ],
};

registerDto({
  name: "VendorDto",
  fields: VENDOR_DTO_SPEC.fields.map((field) => ({ key: field.key, infoItem: field.infoItem })),
});

// 이름 정규화 — NFC + 소문자. 자동완성·중복 후보 탐지 양쪽이 이 함수 하나만
// 쓴다(정본 하나).
export function normalizeVendorName(name: string): string {
  return name.normalize("NFC").trim().toLowerCase();
}

// QA ISSUE-005 (a) — 선택 목록 라벨. 이름이 같은 거래처가 둘 이상일 때만 `이름 · 사업자번호 끝 4자리`(숫자만), 사업자번호가 없으면 이름만.
export function vendorOptionLabels(vendors: readonly { id: string; name: string; businessNo: string | null }[]): Map<string, string> {
  const counts = new Map<string, number>();
  for (const vendor of vendors) counts.set(vendor.name, (counts.get(vendor.name) ?? 0) + 1);
  return new Map(
    vendors.map((vendor) => {
      const last4 = (vendor.businessNo ?? "").replace(/\D/g, "").slice(-4);
      return [vendor.id, (counts.get(vendor.name) ?? 0) > 1 && last4 ? `${vendor.name} · ${last4}` : vendor.name];
    }),
  );
}

// 코드 포인트 기준 길이 — 한글이 서로게이트 쌍이 아니어도 이 기준이 일관된다.
function codePointLength(value: string): number {
  return Array.from(value).length;
}

// 자동완성 일치 점수 — 완전 일치 > 접두어 일치 > 부분 일치. 순수 함수라 DB
// 없이 단위 테스트로 고정한다.
export function scoreVendorNameMatch(normalizedName: string, normalizedQuery: string): number {
  if (normalizedName === normalizedQuery) return 3;
  if (normalizedName.startsWith(normalizedQuery)) return 2;
  if (normalizedName.includes(normalizedQuery)) return 1;
  return 0;
}

// 04.5-03(D10-13 · T-04.5-04): 거래처 DTO의 유일한 출구 — 「거래처 정보」(vendor.value) 판정 뒤 customFields를
// 칸별로 거른다(활성이면서 보는 사람 계급에 cf.vendor.<key> 보임 행이 있는 키만 — 둘 다 켜져야 보인다).
// 보이는 키 집합은 호출자가 한 번 계산해 넘긴다(목록은 행마다 다시 조회하지 않는다).
async function toVendorDto(viewer: Viewer, row: VendorRow, visibleKeys: ReadonlySet<string>): Promise<VendorDto> {
  const dto = (await project(viewer, row, VENDOR_DTO_SPEC)) as VendorDto;
  if (dto.customFields === undefined) return dto;
  return { ...dto, customFields: pickVisibleCustomFields(dto.customFields, visibleKeys) ?? {} };
}

export type VendorListDeps = { can: typeof defaultCan };

export async function listVendors(
  viewer: Viewer,
  opts?: { includeHidden?: boolean },
): Promise<VendorDto[]> {
  const scope = await scopeFor(viewer, VENDOR_ENTITY);
  const rows = await repoListVendors(viewer, { scope, includeHidden: opts?.includeHidden ?? false });
  const visibleKeys = await visibleCustomFieldKeys(viewer, VENDOR_ENTITY);
  return Promise.all(rows.map((row) => toVendorDto(viewer, row, visibleKeys)));
}

// 자동완성 — 검색어를 NFC 정규화 + 소문자로 낮춘 뒤 normalizedName의 부분
// 일치로 후보를 좁히고, 점수(완전>접두어>부분)로 다시 정렬한다. 점수가 같으면
// normalizedName, 그다음 id로 정렬해 순서가 결정적이다. 같은 이름 둘은 둘 다
// 돌아온다 — 이름에 unique 제약이 없다.
export async function searchVendors(viewer: Viewer, query: string, limit = 10): Promise<VendorDto[]> {
  const normalizedQuery = normalizeVendorName(query);
  if (codePointLength(normalizedQuery) === 0) return [];

  const scope = await scopeFor(viewer, VENDOR_ENTITY);
  const rows = await repoSearchVendorsByNormalizedName(viewer, { normalizedQuery, scope });

  const scored = rows
    .map((row) => ({ row, score: scoreVendorNameMatch(row.normalizedName, normalizedQuery) }))
    .filter((entry) => entry.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.row.normalizedName.localeCompare(b.row.normalizedName) ||
        a.row.id.localeCompare(b.row.id),
    )
    .slice(0, limit);

  const visibleKeys = await visibleCustomFieldKeys(viewer, VENDOR_ENTITY);
  return Promise.all(scored.map((entry) => toVendorDto(viewer, entry.row, visibleKeys)));
}

// 커스텀 필드 정의 Dto — 필드 정의 자체는 사람 단위 민감 정보가 아니라
// "어떤 필드가 있는지"를 알려주는 구조 메타데이터라 project()/정보 노출표를
// 거치지 않는다(계좌번호 등 값과는 다른 종류). *Row 타입을 그대로 반환하지
// 않도록 필드를 다시 매핑한다(plant8/no-row-type-escape).
export type FieldDefinitionDto = {
  id: string;
  key: string;
  label: string;
  type: "text" | "number" | "date" | "select";
  options: string[] | null;
  required: boolean;
  sortOrder: number;
};

export type VendorFieldDefinitionsDeps = { can: typeof defaultCan };

// 거래처 폼(Task 3)이 커스텀 필드 입력을 동적으로 그리는 데 쓴다. 거래처
// 메뉴를 볼 수 없으면 빈 배열 — 화면 진입 자체가 이미 그 판정을 거친다.
export async function listVendorFieldDefinitions(
  viewer: Viewer,
  deps?: Partial<VendorFieldDefinitionsDeps>,
): Promise<FieldDefinitionDto[]> {
  const canFn = deps?.can ?? defaultCan;
  if (!(await canFn(viewer, VENDORS_MENU, "view"))) return [];

  // 04.5-05: 폼이 그리는 칸 = 서버 저장 판정의 입력 칸 집합(같은 함수) — 보관 제외(D10-12) · 칸별 보임(D10-13) · 「거래처 정보」 AND.
  const { inputDefs } = await vendorInputFieldKeys(viewer);
  return inputDefs.map((def) => ({
    id: def.id,
    key: def.key,
    label: def.label,
    type: def.type,
    options: def.optionsColumn,
    required: def.required,
    sortOrder: def.sortOrder,
  }));
}

type VendorInputFieldDef = InputFieldDef & { id: string; sortOrder: number; optionsColumn: string[] | null };

// 04.5-05: 보는 사람의 거래처 입력 칸 집합 하나 — 「거래처 정보」(vendor.value)가 보이면 활성 ∩ 칸별 보임(03의
// visibleCustomFieldKeys와 같은 규칙), 아니면 빈 집합. knownKeys는 정의 전체 키(보관 · 노출 행 없는 칸 포함).
// 정의 · 두 보임을 SQL 한 문(한 스냅숏)으로 읽는다(T-04.5-44). tx는 받은 그대로 넘긴다(domain은 db를 import하지 않는다).
async function vendorInputFieldKeys(
  viewer: Viewer,
  tx?: DbOrTx,
): Promise<{ inputDefs: VendorInputFieldDef[]; knownKeys: Set<string> }> {
  const access = await readVendorFieldAccess(viewer, viewer.roleId, tx);
  const inputDefs = access.vendorValueVisible
    ? access.definitions
        .filter((def) => def.archivedAt === null && access.visibleFieldKeys.has(def.key))
        .map((def) => {
          const optionsColumn = Array.isArray(def.options) ? (def.options as string[]) : null;
          return {
            id: def.id,
            key: def.key,
            label: def.label,
            type: def.type as FieldDefinitionDto["type"],
            options: optionsColumn ?? [],
            archivedOptions: def.archivedOptions,
            required: def.required,
            sortOrder: def.sortOrder,
            optionsColumn,
          };
        })
    : [];
  return { inputDefs, knownKeys: new Set(access.definitions.map((def) => def.key)) };
}

export type VendorWriteDeps = {
  can: typeof defaultCan;
  visible: typeof defaultVisible;
  findVendorById: typeof repoFindVendorById;
  recordAction: typeof defaultRecordAction;
};

export type VendorInput = {
  name: string;
  businessNo?: string | null;
  defaultEvidenceType?: string | null;
  accountBank?: string | null;
  accountHolder?: string | null;
  /**
   * 평문 계좌번호 — 저장 전 이 함수 안에서 즉시 암호화한다.
   * updateVendor에서는 세 값이 서로 다르게 해석된다(M-5):
   * undefined = 안 바꿈(기존 암호문·뒤 4자리 유지) · null = 지움(두 컬럼 모두 null) ·
   * 문자열 = 새 값으로 교체. createVendor에서는 undefined·null·빈 문자열 모두
   * "계좌번호 없음"으로 같다 — 지울 기존 값이 없다.
   */
  accountNumber?: string | null;
  /**
   * updateVendor에서 undefined면 기존 customFields를 건드리지 않는다(M-5). 객체를
   * 보내면 04.5-05 쓰기 판정(resolveCustomFieldsWrite)으로 합친다 — 키 없음 = 안 바꿈 ·
   * 빈 값 = 비움 · 입력 칸 밖 키는 저장값 유지 · 정의에 없는 키는 거부. createVendor에서는
   * 키 없음 = 빈칸으로 판정한다.
   */
  customFields?: Record<string, unknown>;
  /** 갈래 — createVendor에서 undefined = DB 기본 'both' · updateVendor에서 undefined = 안 바꿈(M-5와 같은 결). */
  kind?: VendorKind;
};

// MAST-01 리뷰 M-5 — 계좌번호 갱신 계획을 순수 함수로 뽑는다. undefined(안 바꿈) ·
// null(지움) · 문자열(새 값)을 구분해, ""가 "지움"으로 잘못 해석돼 암호문·뒤 4자리를
// 함께 날리던 landmine을 없앤다. encryptFn을 주입받아 암호화 키 없이도(단위 테스트)
// 이 분기를 고정할 수 있다.
export type AccountNumberPlan =
  | { kind: "keep" }
  | { kind: "clear" }
  | { kind: "set"; accountNumberEncrypted: string; accountNumberLast4: string };

export function planAccountNumberUpdate(
  accountNumber: string | null | undefined,
  encryptFn: (plaintext: string) => string = encrypt,
): AccountNumberPlan {
  if (accountNumber === undefined) return { kind: "keep" };
  if (accountNumber === null) return { kind: "clear" };

  const trimmed = accountNumber.trim();
  // 빈 문자열(공백만 있는 값 포함)은 "지움"이 아니라 "안 바꿈"이다 — 편집 폼에서
  // 칸을 비워 두는 가장 자연스러운 방법이 곧 "지움"이 되어서는 안 된다. 명시적으로
  // 지우려면 null을 보낸다(편집 폼의 「계좌번호 지우기」 체크박스).
  if (trimmed === "") return { kind: "keep" };

  return {
    kind: "set",
    accountNumberEncrypted: encryptFn(trimmed),
    accountNumberLast4: trimmed.slice(-4),
  };
}

export type CreateVendorResult = { vendor: VendorDto; duplicateCount: number };

// 거래처 등록 — 쓰기 권한 확인 → 커스텀 필드 검증 → 계좌번호가 있으면 암호화 +
// 뒤 4자리를 함께 만들어 저장 → recordAction 기록. 이름에 unique 제약이
// 없으므로 같은 정규화 이름의 기존 행을 미리 찾아 duplicateCount로 돌려주되
// 등록 자체는 막지 않는다.
export async function createVendor(
  viewer: Viewer,
  input: VendorInput,
  deps?: Partial<VendorWriteDeps>,
): Promise<CreateVendorResult> {
  const canFn = deps?.can ?? defaultCan;
  if (!(await canFn(viewer, VENDORS_MENU, "write"))) {
    throw new ForbiddenError("거래처 등록 권한 없음");
  }

  // 04.5-05: 행 삽입보다 먼저 판정한다(실패 시 행 없음). 새 행이라 경합이 없어 트랜잭션을 더하지 않는다.
  const { inputDefs, knownKeys } = await vendorInputFieldKeys(viewer);
  const customFields = resolveCustomFieldsWrite({
    mode: "create",
    inputDefs,
    knownKeys,
    stored: {},
    submitted: input.customFields ?? {},
  });
  const normalizedName = normalizeVendorName(input.name);
  const visibleFn = deps?.visible ?? defaultVisible;
  assertBusinessNoValid(input.businessNo);
  await assertBusinessNoFree(viewer, input.businessNo, { wantedKind: input.kind ?? "both", visible: visibleFn, can: canFn });
  const duplicates = await repoFindVendorsByNormalizedName(viewer, normalizedName);

  // create에는 "안 바꿈" 개념이 없다 — keep이든 clear든 지울 기존 값이 없으므로
  // 둘 다 "계좌번호 없음"으로 같다.
  const accountNumberPlan = planAccountNumberUpdate(input.accountNumber);
  const accountNumberEncrypted = accountNumberPlan.kind === "set" ? accountNumberPlan.accountNumberEncrypted : null;
  const accountNumberLast4 = accountNumberPlan.kind === "set" ? accountNumberPlan.accountNumberLast4 : null;

  let row: VendorRow;
  try {
    row = await repoInsertVendor(viewer, {
      name: input.name,
      normalizedName,
      businessNo: input.businessNo ?? null,
      defaultEvidenceType: input.defaultEvidenceType ?? null,
      accountBank: input.accountBank ?? null,
      accountHolder: input.accountHolder ?? null,
      accountNumberEncrypted,
      accountNumberLast4,
      customFields,
      kind: input.kind,
    });
  } catch (error) {
    // 조회와 삽입 사이 경합으로 유일 색인이 먼저 걸리면 같은 조회로 같은 오류로 바꾼다(domain/custom-fields/admin.ts 선례).
    if (isUniqueViolation(error, BUSINESS_NO_UNIQUE_INDEX)) {
      await assertBusinessNoFree(viewer, input.businessNo, { wantedKind: input.kind ?? "both", visible: visibleFn, can: canFn });
    }
    throw error;
  }

  const recordAction = deps?.recordAction ?? defaultRecordAction;
  await recordAction(viewer, { actionType: "document_create", entity: VENDOR_ENTITY, entityId: row.id });

  const vendor = await toVendorDto(viewer, row, await visibleCustomFieldKeys(viewer, VENDOR_ENTITY));
  return { vendor, duplicateCount: duplicates.length };
}

// 거래처 수정 — 계좌번호를 바꿀 때만 암호문·뒤 4자리 두 컬럼을 같은 UPDATE
// 문에서 교체한다(updateVendorAccountNumber, planAccountNumberUpdate로 판정).
// 계좌번호를 안 바꾸는 갱신(accountNumber === undefined)은 두 컬럼을 건드리지
// 않는다. customFields도 같은 규칙 — undefined면 기존 값을 그대로 둔다(M-5).
export async function updateVendor(
  viewer: Viewer,
  id: string,
  input: VendorInput,
  deps?: Partial<VendorWriteDeps>,
): Promise<VendorDto | null> {
  const canFn = deps?.can ?? defaultCan;
  if (!(await canFn(viewer, VENDORS_MENU, "write"))) {
    throw new ForbiddenError("거래처 수정 권한 없음");
  }

  // 목록이 보관된 행에 「수정」 링크를 감추는 것만으로는 부족하다 —
  // /admin/vendors?editId=<보관된 id>를 직접 열면 화면은 수정 모드로 뜨고
  // 저장까지 됐다(DOM 감사 실측). 판정은 화면이 아니라 여기서 한다.
  const findVendorById = deps?.findVendorById ?? repoFindVendorById;
  const existing = await findVendorById(viewer, id);
  if (!existing || existing.archivedAt !== null) {
    throw new ArchivedVendorError(ARCHIVED_VENDOR_MESSAGE);
  }

  const normalizedName = normalizeVendorName(input.name);
  const visibleFn = deps?.visible ?? defaultVisible;
  // 저장된 번호에서 숫자가 바뀔 때만 검사한다 — 이미 있는 중복을 둔 채 이름 · 계좌만 고치는 저장은 막지 않는다.
  const numberChanged = businessNoDigits(input.businessNo) !== businessNoDigits(existing.businessNo);
  if (numberChanged) {
    assertBusinessNoValid(input.businessNo);
    await assertBusinessNoFree(viewer, input.businessNo, { excludeId: id, visible: visibleFn, can: canFn });
  }

  const updatePayload: Parameters<typeof repoUpdateVendor>[2] = {
    name: input.name,
    normalizedName,
    businessNo: input.businessNo ?? null,
    defaultEvidenceType: input.defaultEvidenceType ?? null,
    accountBank: input.accountBank ?? null,
    accountHolder: input.accountHolder ?? null,
    ...(input.kind !== undefined ? { kind: input.kind } : {}),
  };
  // customFields를 보내지 않으면(undefined) 커스텀 열을 건드리지 않는다(M-5) — 경합이 없어 트랜잭션도 없다.
  // 보내면(04.5-05 · T-04.5-41/44) 행을 잠가 읽은 저장값으로 판정 · 합치고 같은 트랜잭션에서 쓴다. 입력 칸 집합도
  // 잠금 뒤 같은 tx의 한 문으로 읽는다 — 그 문의 스냅숏에 커밋된 정의 · 보임 변경을 한꺼번에 본다. 거래처 행을
  // 건드리지 않는 정의 · 보임 변경과의 순서까지 행 잠금이 정하지는 않는다(같은 tx 한 문 스냅숏).
  const submitted = input.customFields;
  try {
    if (submitted === undefined) {
      await repoUpdateVendor(viewer, id, updatePayload);
    } else {
      await withTransaction(async (tx) => {
        const locked = await repoFindVendorByIdForUpdate(viewer, id, tx);
        if (!locked || locked.archivedAt !== null) throw new ArchivedVendorError(ARCHIVED_VENDOR_MESSAGE);
        const { inputDefs, knownKeys } = await vendorInputFieldKeys(viewer, tx);
        const customFields = resolveCustomFieldsWrite({
          mode: "update",
          inputDefs,
          knownKeys,
          stored: locked.customFields as Record<string, unknown>,
          submitted,
        });
        await repoUpdateVendor(viewer, id, { ...updatePayload, customFields }, tx);
      });
    }
  } catch (error) {
    if (isUniqueViolation(error, BUSINESS_NO_UNIQUE_INDEX)) {
      await assertBusinessNoFree(viewer, input.businessNo, { excludeId: id, visible: visibleFn, can: canFn });
    }
    throw error;
  }

  const accountNumberPlan = planAccountNumberUpdate(input.accountNumber);
  if (accountNumberPlan.kind === "clear") {
    await repoUpdateVendorAccountNumber(viewer, id, { accountNumberEncrypted: null, accountNumberLast4: null });
  } else if (accountNumberPlan.kind === "set") {
    await repoUpdateVendorAccountNumber(viewer, id, {
      accountNumberEncrypted: accountNumberPlan.accountNumberEncrypted,
      accountNumberLast4: accountNumberPlan.accountNumberLast4,
    });
  }
  // kind === "keep" → 두 컬럼 모두 건드리지 않는다.

  // 결함 3: 수정을 document_create로 남기면 생성 9건처럼 보인다(독립 감사가
  // 실측 — 수정 8건이 document_create 9건으로 나타났다). 수정 전용 종류로 남긴다.
  const recordAction = deps?.recordAction ?? defaultRecordAction;
  await recordAction(viewer, { actionType: "document_update", entity: VENDOR_ENTITY, entityId: id });

  const updated = await repoFindVendorById(viewer, id);
  return updated ? toVendorDto(viewer, updated, await visibleCustomFieldKeys(viewer, VENDOR_ENTITY)) : null;
}

// 「구분 더하기」 — 같은 사업자번호 거래처의 갈래만 켠다(옛 260907 onAddSide와 같이 입력 중이던 다른 칸은 옮기지 않는다).
// 이미 덮으면 그대로, 보관된 거래처는 거부.
export async function addVendorKind(
  viewer: Viewer,
  id: string,
  side: VendorSide,
  businessNo: string,
  deps?: Partial<Pick<VendorWriteDeps, "can" | "recordAction">>,
): Promise<VendorDto | null> {
  const canFn = deps?.can ?? defaultCan;
  if (!(await canFn(viewer, VENDORS_MENU, "write"))) {
    throw new ForbiddenError("거래처 수정 권한 없음");
  }

  const changed = await withTransaction(async (tx) => {
    const locked = await repoFindVendorByIdForUpdate(viewer, id, tx);
    if (!locked || locked.archivedAt !== null) throw new ArchivedVendorError(ARCHIVED_VENDOR_MESSAGE);
    // PR #178 Codex — 충돌을 알린 뒤 그 사이 번호가 바뀌었거나 숨겨진 거래처는 바꾸지 않는다(잠근 행으로 다시 확인).
    const digits = businessNoDigits(businessNo);
    if (locked.hidden || digits === null || businessNoDigits(locked.businessNo) !== digits) {
      throw new UserFacingError(NOT_SAME_BUSINESS_NO_MESSAGE);
    }
    if (servesSide(locked.kind, side)) return false;
    await repoUpdateVendor(viewer, id, { kind: "both" }, tx);
    return true;
  });
  if (changed) {
    const recordAction = deps?.recordAction ?? defaultRecordAction;
    await recordAction(viewer, { actionType: "document_update", entity: VENDOR_ENTITY, entityId: id });
  }

  const row = await repoFindVendorById(viewer, id);
  return row ? toVendorDto(viewer, row, await visibleCustomFieldKeys(viewer, VENDOR_ENTITY)) : null;
}

// 숨김 플래그 — 보관함(archived)과는 다른 메커니즘이다(03-UI-SPEC.md 비활성화
// 표현 규칙). 되돌릴 수 있는 상태 변경이라 OPS-05 핵심 행동 종류에 대응하는
// 항목이 없어 recordAction을 부르지 않는다(setCodeItemActive·
// setCorpCardActive와 같은 결).
export async function setVendorHidden(
  viewer: Viewer,
  id: string,
  hidden: boolean,
  deps?: Partial<Pick<VendorWriteDeps, "can">>,
): Promise<VendorDto | null> {
  const canFn = deps?.can ?? defaultCan;
  if (!(await canFn(viewer, VENDORS_MENU, "write"))) {
    throw new ForbiddenError("거래처 상태 변경 권한 없음");
  }

  const current = await repoFindVendorById(viewer, id);
  if (!current) return null;
  const visibleKeys = await visibleCustomFieldKeys(viewer, VENDOR_ENTITY);
  if (current.hidden === hidden) {
    return toVendorDto(viewer, current, visibleKeys);
  }

  await repoSetVendorHidden(viewer, id, hidden);
  const updated = await repoFindVendorById(viewer, id);
  return updated ? toVendorDto(viewer, updated, visibleKeys) : null;
}

export type RevealAccountNumberDeps = { visible: typeof defaultVisible; recordAction: typeof defaultRecordAction };

// 마스킹 해제 — 정보 노출표의 vendor.account_number_unmasked 항목을 노출
// 판정으로 확인하고 거짓이면 ForbiddenError. 통과하면 먼저 recordAction으로
// 기록하고 그 다음에 복호화한다(기록이 실패하면 평문을 돌려주지 않는다 —
// 순서가 바뀌면 기록 없이 열람되는 창이 생긴다). 계좌번호가 없는 거래처는
// 빈 문자열을 돌려주고 복호화를 호출하지 않는다(기록도 남기지 않는다 — 열
// 것이 없다).
export async function revealAccountNumber(
  viewer: Viewer,
  id: string,
  deps?: Partial<RevealAccountNumberDeps>,
): Promise<string> {
  const visibleFn = deps?.visible ?? defaultVisible;
  if (!(await visibleFn(viewer, REVEAL_INFO_ITEM))) {
    throw new ForbiddenError("계좌번호 마스킹 해제 권한 없음");
  }

  const row = await repoFindVendorById(viewer, id);
  if (!row?.accountNumberEncrypted) return "";

  const recordAction = deps?.recordAction ?? defaultRecordAction;
  await recordAction(viewer, { actionType: "mask_reveal", entity: VENDOR_ENTITY, entityId: id });

  return decrypt(row.accountNumberEncrypted);
}
