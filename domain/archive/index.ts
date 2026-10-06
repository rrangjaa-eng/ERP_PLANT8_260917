import type { Viewer } from "@/domain/viewer";
import { can as defaultCan } from "@/domain/permissions/can";
import { recordAction as defaultRecordAction } from "@/domain/action-log/record";
import { projectMany, type DtoSpec } from "@/domain/permissions/project";
import { visible } from "@/domain/permissions/visible";
import { registerDto } from "@/domain/permissions/dto-registry";
import {
  ARCHIVABLE_TABLES,
  listArchivedAcrossEntities as defaultListArchivedAcrossEntities,
  type ArchivableEntry,
  type ArchivedItem,
} from "@/repositories/archive";
import { findUserById as defaultFindUserById } from "@/repositories/users";
import { findVendorById, findVendorsByBusinessNoDigits } from "@/repositories/vendors";
import { BUSINESS_NO_UNIQUE_INDEX, businessNoDigits } from "@/domain/vendors";
import { isUniqueViolation } from "@/lib/pg-errors";
import { UserFacingError } from "@/lib/actions/user-facing-error";
import { restoreQuoteLine } from "@/domain/quotes/lines";
import { canViewReserves, restoreReserve } from "@/domain/reserves";
import { HOLIDAYS_MENU, restoreHoliday } from "@/domain/holidays/admin";
import { toKstDate } from "@/domain/holidays/business-day";

// ADMN-12: "지우지 않는다" — archived_at/archived_by 규약의 유일한 진입점.
// 물리 삭제 문장은 이 리포 어디에도 넣지 않는다 — DB 레벨 권한 회수(REVOKE)는
// 이 페이즈 범위 밖이다(운영 DB 권한 변경은 배포 절차 변경을 부르며, 코드에
// 물리 삭제 호출이 0건인 것으로 이 페이즈의 계약은 성립한다).
export class ForbiddenError extends UserFacingError {}
export class UnknownArchivableEntityError extends UserFacingError {}
export class ProtectedRowError extends UserFacingError {}
export class ArchivableRowNotFoundError extends UserFacingError {}

export type ArchiveDeps = {
  can: typeof defaultCan;
  recordAction: typeof defaultRecordAction;
};

const ARCHIVE_MENU = "admin.archive";

function findEntry(entity: string) {
  const entry = ARCHIVABLE_TABLES.find((candidate) => candidate.entity === entity);
  if (!entry) {
    throw new UnknownArchivableEntityError(`등록되지 않은 entity: ${entity}`);
  }
  return entry;
}

async function assertCanWrite(viewer: Viewer, deps?: Partial<ArchiveDeps>): Promise<void> {
  const canFn = deps?.can ?? defaultCan;
  const allowed = await canFn(viewer, ARCHIVE_MENU, "write");
  if (!allowed) {
    throw new ForbiddenError("보관함 쓰기 권한 없음");
  }
}

// 04.5-04(UI-SPEC O21): 항목에 추가 권한 조건(requiredMenu)이 있으면 그 메뉴의 write도 요구한다 — 행 조회 · 쓰기 · 로그 전에.
// 조건 없는 항목은 그대로다. 문구는 보관함 쓰기 거부와 같다(새 문구 없음).
async function assertCanWriteEntry(viewer: Viewer, entry: ArchivableEntry, deps?: Partial<ArchiveDeps>): Promise<void> {
  if (!entry.requiredMenu) return;
  const canFn = deps?.can ?? defaultCan;
  if (!(await canFn(viewer, entry.requiredMenu, "write"))) {
    throw new ForbiddenError("보관함 쓰기 권한 없음");
  }
}

// 보관은 대상 행의 보관 시각이 이미 있으면 그 값을 유지한 채 성공으로
// 돌아온다(멱등 — repositories의 조건부 UPDATE가 보장). 시드 계급은 거부한다
// (isProtected).
export async function archive(
  viewer: Viewer,
  entity: string,
  id: string,
  deps?: Partial<ArchiveDeps>,
): Promise<void> {
  await assertCanWrite(viewer, deps);
  const entry = findEntry(entity);
  await assertCanWriteEntry(viewer, entry, deps);

  const row = await entry.findById(viewer, id);
  if (!row) throw new ArchivableRowNotFoundError("대상 찾을 수 없음");
  if (entry.isProtected?.(row)) {
    throw new ProtectedRowError("보호된 항목은 보관할 수 없음");
  }

  // 04.5-07: 이미 보관된 행(다시 보관 · 동시 보관의 뒤 사람)은 조건부 갱신이 바꾼 행이 없다 — 로그 없이 돌아온다(복원과 같은 꼴).
  if (!(await entry.setArchived(viewer, id, true))) return;

  const recordAction = deps?.recordAction ?? defaultRecordAction;
  await recordAction(viewer, { actionType: "archive", entity, entityId: id });
}

// 04-12(A-19 · OV-2) — 도메인 규칙이 있는 엔티티의 복원은 도메인 함수에 통째로 맡긴다(잠금·게이트·보관 해제·로그를
// 한 트랜잭션에서). 범용 setArchived 경로는 이 표에 없는 엔티티만 탄다(리저브는 04-07 · 그룹 B가 더한다).
const DOMAIN_RESTORERS: Partial<Record<string, (viewer: Viewer, id: string, deps?: Partial<ArchiveDeps>) => Promise<RestoreResult>>> = {
  quote_line: (viewer, id, deps) => restoreQuoteLine(viewer, id, { recordAction: deps?.recordAction }),
  // 04-07(B-04 · T5) — 리저브 복원은 클라이언트 잠금 · pnl 쓰기 + reserve.amount · 날짜 마감 잔액 판정을 한 트랜잭션에서.
  reserve_entry: (viewer, id, deps) => restoreReserve(viewer, id, { recordAction: deps?.recordAction }),
  // quick 261001-hfi(ADMN-12) — 공휴일 복원은 달력 잠금 · admin.holidays 쓰기 · 소급 금지 · 재계산 · 로그를 한 트랜잭션에서.
  holiday: (viewer, id, deps) => restoreHoliday(viewer, id, { recordAction: deps?.recordAction }),
};

export type RestoreResult = { restored: boolean };

// 같은 숫자 사업자번호의 살아 있는 거래처를 찾아 「복원 불가」 문구로 만든다(이름은 「거래처 정보」를 볼 때만).
async function vendorRestoreBlock(viewer: Viewer, id: string): Promise<UserFacingError | null> {
  const row = await findVendorById(viewer, id);
  const digits = businessNoDigits(row?.businessNo);
  const [taker] = digits === null ? [] : await findVendorsByBusinessNoDigits(viewer, digits, { excludeId: id });
  if (!taker) return null;
  const name = (await visible(viewer, "vendor.value")) ? ` · ${taker.name}` : "";
  return new UserFacingError(`같은 사업자번호 거래처 있음${name} · 복원 불가`);
}

export async function restore(
  viewer: Viewer,
  entity: string,
  id: string,
  deps?: Partial<ArchiveDeps>,
): Promise<RestoreResult> {
  await assertCanWrite(viewer, deps);
  // 도메인 복원기는 자기 권한 · 형식 판정 뒤 잠금 안에서 「이미 복원됨」({ restored: false })을 가린다(quick 261002-4jn).
  const domainRestorer = DOMAIN_RESTORERS[entity];
  if (domainRestorer) return domainRestorer(viewer, id, deps);
  const entry = findEntry(entity);
  await assertCanWriteEntry(viewer, entry, deps);

  const row = await entry.findById(viewer, id);
  if (!row) throw new ArchivableRowNotFoundError("대상 찾을 수 없음");
  // quick 261002-4jn — 이미 활성인 행(낡은 화면 · 동시 복원의 뒤 사람)은 로그 없이 「이미 복원됨」.
  if (row.archivedAt === null) return { restored: false };

  // 동시 복원은 둘 다 위 판정을 지날 수 있다 — 조건부 갱신이 실제로 바꾼 쪽만 「복원됨」 · 로그(PR #149 리뷰).
  // 거래처는 같은 사업자번호의 살아 있는 거래처가 생겼으면 유일 색인이 막는다 — 사용자 문구로 바꾼다.
  // 색인이 막기 전에도(선검사) 같은 번호의 살아 있는 거래처가 있으면 복원하지 않는다.
  if (entity === "vendor") {
    const blocked = await vendorRestoreBlock(viewer, id);
    if (blocked) throw blocked;
  }
  let reactivated: boolean;
  try {
    reactivated = await entry.setArchived(viewer, id, false);
  } catch (error) {
    if (entity === "vendor" && isUniqueViolation(error, BUSINESS_NO_UNIQUE_INDEX)) throw (await vendorRestoreBlock(viewer, id)) ?? error;
    throw error;
  }
  if (!reactivated) return { restored: false };

  const recordAction = deps?.recordAction ?? defaultRecordAction;
  await recordAction(viewer, { actionType: "restore", entity, entityId: id });
  return { restored: true };
}

// 03-07: 보관함 화면의 domain 진입점 — 새 정보 항목("archive.value")으로
// 게이트한다(기존 정보 항목은 각 마스터 표 전용이라 여러 표를 섞은 목록에
// 맞는 항목이 없었다 — Rule 2, 누락된 핵심 배선).
const ARCHIVE_INFO_ITEM = "archive.value";

export type ArchiveEntryDto = {
  entity: string;
  label: string;
  id: string;
  name: string;
  archivedAt: Date;
  archivedBy: string | null;
  restorable: boolean;
};

export const ARCHIVE_ENTRY_DTO_SPEC: DtoSpec<ArchivedItem & { restorable: boolean }, ArchiveEntryDto> = {
  fields: [
    { key: "entity", from: "entity", infoItem: ARCHIVE_INFO_ITEM },
    { key: "label", from: "label", infoItem: ARCHIVE_INFO_ITEM },
    { key: "id", from: "id", infoItem: ARCHIVE_INFO_ITEM },
    { key: "name", from: "name", infoItem: ARCHIVE_INFO_ITEM },
    { key: "archivedAt", from: "archivedAt", infoItem: ARCHIVE_INFO_ITEM },
    { key: "archivedBy", from: "archivedBy", infoItem: ARCHIVE_INFO_ITEM },
    { key: "restorable", from: "restorable", infoItem: ARCHIVE_INFO_ITEM },
  ],
};

registerDto({
  name: "ArchiveEntryDto",
  fields: ARCHIVE_ENTRY_DTO_SPEC.fields.map((field) => ({ key: field.key, infoItem: field.infoItem })),
});

export type ListArchiveDeps = {
  can: typeof defaultCan;
  listArchivedAcrossEntities: typeof defaultListArchivedAcrossEntities;
  findUserById: typeof defaultFindUserById;
  now: Date;
};

async function entitiesWithoutRequired(viewer: Viewer, canFn: typeof defaultCan, action: "view" | "write"): Promise<Set<string>> {
  const lacking = new Set<string>();
  for (const entry of ARCHIVABLE_TABLES) {
    if (entry.requiredMenu && !(await canFn(viewer, entry.requiredMenu, action))) lacking.add(entry.entity);
  }
  return lacking;
}

// 보관함 메뉴 보기 권한 확인 → 여러 표를 훑는 조회(repositories/archive의
// ARCHIVABLE_TABLES 순회) → 보관한 사람 id를 이름으로 합성 → 투영. 새 표
// 목록을 이 함수가 만들지 않는다 — 정본은 ARCHIVABLE_TABLES 하나다.
// archivedBy는 raw id가 아니라 이름으로 화면에 낸다(내부 식별자를 그대로
// 사용자에게 보이지 않는다 — 지난 웨이브 UI 감사가 잡은 결함과 같은 종류를
// 미리 막는다).
export async function listArchive(viewer: Viewer, deps?: Partial<ListArchiveDeps>): Promise<ArchiveEntryDto[]> {
  const canFn = deps?.can ?? defaultCan;
  if (!(await canFn(viewer, ARCHIVE_MENU, "view"))) {
    throw new ForbiddenError("보관함 열람 권한 없음");
  }
  // DEF-1 — 보관함 정보(archive.value)를 못 보면 행마다 빈 투영이라 화면이 깨지고 행 수가 샌다 — 조회 없이 빈 목록(평소 빈 상태).
  const showInfo = await visible(viewer, ARCHIVE_INFO_ITEM);
  if (!showInfo) return [];

  const listFn = deps?.listArchivedAcrossEntities ?? defaultListArchivedAcrossEntities;
  // 묶음 ④ /review R3 — 리저브 줄은 리저브를 볼 수 있는 사람에게만(pnl 보기 + reserve.amount, B-15).
  const showReserves = await canViewReserves(viewer);
  // 04.5-04(O21) — 추가 권한 조건이 있는 항목은 그 메뉴 보기 권한이 없으면 행을 뺀다(항목마다 한 번 판정).
  const hiddenEntities = await entitiesWithoutRequired(viewer, canFn, "view");
  const rows = (await listFn(viewer)).filter((row) => (row.entity !== "reserve_entry" || showReserves) && !hiddenEntities.has(row.entity));

  // 독립 검토(#138) — 복원할 수 없는 공휴일 행은 「복원」을 내놓지 않는다(§7). 공휴일 복원은 공휴일 쓰기 권한과
  // 소급 금지(오늘 이후 날짜) · 그 날짜에 다른 공휴일(대체일 제외) 없음을 요구한다(restoreHoliday) — 같은 판정을 목록에서 미리 한다.
  const holidayWritable = rows.some((row) => row.entity === "holiday") && (await canFn(viewer, HOLIDAYS_MENU, "write"));
  const today = toKstDate(deps?.now ?? new Date());
  // 추가 권한 조건(requiredMenu)의 쓰기가 없는 항목의 행은 복원 불가(항목마다 한 번 판정 — restore()의 assertCanWriteEntry와 같은 조건).
  const unwritableEntities = await entitiesWithoutRequired(viewer, canFn, "write");
  const isRestorable = (row: ArchivedItem) =>
    !unwritableEntities.has(row.entity) &&
    (row.entity !== "holiday" || (holidayWritable && row.date !== undefined && row.date > today && !row.dateTaken)) &&
    (row.entity !== "vendor" || !row.businessNoTaken);

  const findUserById = deps?.findUserById ?? defaultFindUserById;
  const archivedByIds = [...new Set(rows.map((row) => row.archivedBy).filter((id): id is string => id !== null))];
  const namesById = new Map(
    await Promise.all(
      archivedByIds.map(async (id) => [id, (await findUserById(viewer, id))?.name ?? id] as const),
    ),
  );

  // 조회 중 archive.value가 바뀌어도 행 투영이 빈 객체가 되지 않게 처음 판정(showInfo)을 그대로 쓴다.
  const rowsWithExtras = rows.map((row) => ({
    ...row,
    archivedBy: row.archivedBy ? (namesById.get(row.archivedBy) ?? row.archivedBy) : null,
    restorable: isRestorable(row),
  }));
  return projectMany(viewer, rowsWithExtras, ARCHIVE_ENTRY_DTO_SPEC, {
    visible: async (v, item) => (item === ARCHIVE_INFO_ITEM ? showInfo : visible(v, item)),
  }) as Promise<ArchiveEntryDto[]>;
}
