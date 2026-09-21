import type { Viewer } from "@/domain/viewer";
import { can as defaultCan } from "@/domain/permissions/can";
import { visible as defaultVisible } from "@/domain/permissions/visible";
import { scopeFor } from "@/domain/permissions/scope-for";
import { project, type DtoSpec } from "@/domain/permissions/project";
import { recordAction as defaultRecordAction } from "@/domain/action-log/record";
import { registerDto } from "@/domain/permissions/dto-registry";
import { UserFacingError } from "@/lib/actions/user-facing-error";
import { encrypt, decrypt } from "@/lib/crypto";
import { buildCustomFieldsSchema } from "@/domain/custom-fields/build-schema";
import {
  listVendors as repoListVendors,
  searchVendorsByNormalizedName as repoSearchVendorsByNormalizedName,
  findVendorById as repoFindVendorById,
  findVendorsByNormalizedName as repoFindVendorsByNormalizedName,
  insertVendor as repoInsertVendor,
  updateVendor as repoUpdateVendor,
  updateVendorAccountNumber as repoUpdateVendorAccountNumber,
  setVendorHidden as repoSetVendorHidden,
  type VendorRow,
} from "@/repositories/vendors";
import { listFieldDefinitions as repoListFieldDefinitions } from "@/repositories/field-definitions";

export class ForbiddenError extends UserFacingError {}

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

export type VendorListDeps = { can: typeof defaultCan };

export async function listVendors(
  viewer: Viewer,
  opts?: { includeHidden?: boolean },
): Promise<VendorDto[]> {
  const scope = await scopeFor(viewer, VENDOR_ENTITY);
  const rows = await repoListVendors(viewer, { scope, includeHidden: opts?.includeHidden ?? false });
  return Promise.all(rows.map((row) => project(viewer, row, VENDOR_DTO_SPEC))) as Promise<VendorDto[]>;
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

  return Promise.all(scored.map((entry) => project(viewer, entry.row, VENDOR_DTO_SPEC))) as Promise<VendorDto[]>;
}

// 커스텀 필드 정의 Dto — 필드 정의 자체는 사람 단위 민감 정보가 아니라
// "어떤 필드가 있는지"를 알려주는 구조 메타데이터라 project()/정보 노출표를
// 거치지 않는다(계좌번호 등 값과는 다른 종류). *Row 타입을 그대로 반환하지
// 않도록 필드를 다시 매핑한다(plant8/no-row-type-escape).
export type FieldDefinitionDto = {
  id: string;
  key: string;
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

  const defs = await repoListFieldDefinitions(viewer, VENDOR_ENTITY);
  return defs.map((def) => ({
    id: def.id,
    key: def.key,
    type: def.type as FieldDefinitionDto["type"],
    options: Array.isArray(def.options) ? (def.options as string[]) : null,
    required: def.required,
    sortOrder: def.sortOrder,
  }));
}

async function validatedCustomFields(
  viewer: Viewer,
  input: Record<string, unknown> | undefined,
): Promise<Record<string, unknown>> {
  const defs = await repoListFieldDefinitions(viewer, VENDOR_ENTITY);
  const schema = buildCustomFieldsSchema(
    defs.map((def) => ({
      key: def.key,
      type: def.type as "text" | "number" | "date" | "select",
      options: Array.isArray(def.options) ? (def.options as string[]) : undefined,
      required: def.required,
    })),
  );
  return schema.parse(input ?? {}) as Record<string, unknown>;
}

export type VendorWriteDeps = { can: typeof defaultCan; recordAction: typeof defaultRecordAction };

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
   * updateVendor에서 undefined면 기존 customFields를 건드리지 않는다(M-5와 같은
   * 이유 — 필드 정의가 늘어난 뒤 일부 값만 보내는 경우를 생각하면, 전체를 무조건
   * 교체하는 편이 "보내지 않은 값은 지운다"는 뜻이 되어 위험하다). 객체를 보내면
   * (빈 객체 포함) 그 값으로 통째로 교체한다. createVendor에서는 항상 검증해
   * 저장한다.
   */
  customFields?: Record<string, unknown>;
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
    throw new ForbiddenError("거래처 등록 권한이 없습니다.");
  }

  const customFields = await validatedCustomFields(viewer, input.customFields);
  const normalizedName = normalizeVendorName(input.name);
  const duplicates = await repoFindVendorsByNormalizedName(viewer, normalizedName);

  // create에는 "안 바꿈" 개념이 없다 — keep이든 clear든 지울 기존 값이 없으므로
  // 둘 다 "계좌번호 없음"으로 같다.
  const accountNumberPlan = planAccountNumberUpdate(input.accountNumber);
  const accountNumberEncrypted = accountNumberPlan.kind === "set" ? accountNumberPlan.accountNumberEncrypted : null;
  const accountNumberLast4 = accountNumberPlan.kind === "set" ? accountNumberPlan.accountNumberLast4 : null;

  const row = await repoInsertVendor(viewer, {
    name: input.name,
    normalizedName,
    businessNo: input.businessNo ?? null,
    defaultEvidenceType: input.defaultEvidenceType ?? null,
    accountBank: input.accountBank ?? null,
    accountHolder: input.accountHolder ?? null,
    accountNumberEncrypted,
    accountNumberLast4,
    customFields,
  });

  const recordAction = deps?.recordAction ?? defaultRecordAction;
  await recordAction(viewer, { actionType: "document_create", entity: VENDOR_ENTITY, entityId: row.id });

  const vendor = (await project(viewer, row, VENDOR_DTO_SPEC)) as VendorDto;
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
    throw new ForbiddenError("거래처 수정 권한이 없습니다.");
  }

  const normalizedName = normalizeVendorName(input.name);

  const updatePayload: Parameters<typeof repoUpdateVendor>[2] = {
    name: input.name,
    normalizedName,
    businessNo: input.businessNo ?? null,
    defaultEvidenceType: input.defaultEvidenceType ?? null,
    accountBank: input.accountBank ?? null,
    accountHolder: input.accountHolder ?? null,
  };
  // customFields를 보내지 않으면(undefined) 기존 값을 그대로 둔다 — 무조건
  // validatedCustomFields(viewer, undefined)를 태우면 필드 정의가 늘어난 뒤
  // 빈 값으로 검증되어 기존에 입력된 값을 조용히 지울 수 있다.
  if (input.customFields !== undefined) {
    updatePayload.customFields = await validatedCustomFields(viewer, input.customFields);
  }
  await repoUpdateVendor(viewer, id, updatePayload);

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

  const recordAction = deps?.recordAction ?? defaultRecordAction;
  await recordAction(viewer, { actionType: "document_create", entity: VENDOR_ENTITY, entityId: id });

  const updated = await repoFindVendorById(viewer, id);
  return updated ? ((await project(viewer, updated, VENDOR_DTO_SPEC)) as VendorDto) : null;
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
    throw new ForbiddenError("거래처 상태 변경 권한이 없습니다.");
  }

  const current = await repoFindVendorById(viewer, id);
  if (!current) return null;
  if (current.hidden === hidden) {
    return (await project(viewer, current, VENDOR_DTO_SPEC)) as VendorDto;
  }

  await repoSetVendorHidden(viewer, id, hidden);
  const updated = await repoFindVendorById(viewer, id);
  return updated ? ((await project(viewer, updated, VENDOR_DTO_SPEC)) as VendorDto) : null;
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
    throw new ForbiddenError("계좌번호 마스킹 해제 권한이 없습니다.");
  }

  const row = await repoFindVendorById(viewer, id);
  if (!row?.accountNumberEncrypted) return "";

  const recordAction = deps?.recordAction ?? defaultRecordAction;
  await recordAction(viewer, { actionType: "mask_reveal", entity: VENDOR_ENTITY, entityId: id });

  return decrypt(row.accountNumberEncrypted);
}
