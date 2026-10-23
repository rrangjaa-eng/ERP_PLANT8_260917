import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
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
import { listProjectIdsInScope } from "@/repositories/projects";
import { projectRowScope } from "@/domain/projects/visibility";
import { findVendorById, findVendorsByBusinessNoDigits } from "@/repositories/vendors";
import { BUSINESS_NO_UNIQUE_INDEX, businessNoDigits } from "@/domain/vendors";
import { isUniqueViolation } from "@/lib/pg-errors";
import { UserFacingError } from "@/lib/actions/user-facing-error";
import { restoreQuoteLine } from "@/domain/quotes/lines";
import { canViewReserves, restoreReserve } from "@/domain/reserves";
import { HOLIDAYS_MENU, restoreHoliday } from "@/domain/holidays/admin";
import { toKstDate } from "@/domain/holidays/business-day";
import { restoreUser } from "@/domain/people/restore";
import { relinkUnknownCardRecords as defaultRelinkUnknownCardRecords } from "@/domain/evidence-import/card-relink";
import { assertCanEditRole, assertCanGrantRoles } from "@/domain/permissions/grant-ceiling";
import { assertNotLastAdmin } from "@/domain/permissions/last-admin";
import { lockSeatKeys } from "@/repositories/seats";
import { setUserArchived } from "@/repositories/users";
import { countActiveMembersOfRole, findRoleById, lockRoleForUpdate, setRoleArchived } from "@/repositories/roles";
import { findTeamById, setTeamArchived } from "@/repositories/teams";
import { setOrgUnitArchived } from "@/repositories/org-units";
import { assertNoSeatDuplicates, SeatTakenError, seatDuplicateBaseline } from "@/domain/people/seat-rules";
import { withTransaction } from "@/lib/db-transaction";
import { kstToday } from "@/lib/kst-date";

// ADMN-12: "지우지 않는다" — archived_at/archived_by 규약의 유일한 진입점.
// 물리 삭제 문장은 이 리포 어디에도 넣지 않는다 — DB 레벨 권한 회수(REVOKE)는
// 이 페이즈 범위 밖이다(운영 DB 권한 변경은 배포 절차 변경을 부르며, 코드에
// 물리 삭제 호출이 0건인 것으로 이 페이즈의 계약은 성립한다).
export class ForbiddenError extends UserFacingError {}
export class UnknownArchivableEntityError extends UserFacingError {}
export class ProtectedRowError extends UserFacingError {}
export class ArchivableRowNotFoundError extends UserFacingError {}
// 같은 숫자 사업자번호의 살아 있는 거래처가 있어 거래처를 복원할 수 없음 — 화면이 원인을 토스트에 싣도록 따로 둔다.
export class VendorBusinessNoTakenError extends UserFacingError {}
// 06-37(G-06-A): 같은 발급사 · 뒤 4자리의 살아 있는 카드가 있어 보관 카드를 복원할 수 없음 — 부분 유일 색인 위반을 사용자 문구로.
export class CorpCardLast4TakenError extends UserFacingError {}
const CORP_CARD_LAST4_UNIQUE_INDEX = "corp_cards_issuer_last4_key";
// 06.4 D-6416(문구 표(D3) 본인 보관 행 — `SELF_LEAVE_EDIT_ERROR` 꼴).
export class SelfArchiveError extends UserFacingError {}
export const SELF_ARCHIVE_MESSAGE = "본인 보관 불가 · 다른 관리자에게 요청";
// 07-15(R17): 소속 활성 사람이 남은 계급은 보관하지 않는다 — 화면은 count로 문구를 만든다.
export class RoleHasMembersError extends UserFacingError {
  constructor(readonly count: number) {
    super(`소속 ${count}명 · 먼저 다른 계급으로 옮기기`);
  }
}

export type ArchiveDeps = {
  can: typeof defaultCan;
  recordAction: typeof defaultRecordAction;
  now: () => Date;
  visible: typeof visible;
  relinkUnknownCardRecords: typeof defaultRelinkUnknownCardRecords;
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

// 06.4(D-6403 · D-6408 · D-6411 · D-6412): 사람 보관은 `archivePerson` · 보관함 · 등록 보상 세 호출이 모두 여기로 온다 — 사람 ·
// 관리자 키 뒤 재조회로 대상 계급 상한 → 마지막 재직 관리자 순으로 막는다. SYSTEM_VIEWER는 마지막 관리자만 면제(06.4-01 모듈 —
// 등록 보상 · 테스트 훅, Pitfall 4), 상한은 시드 성질로 통과. 260907은 퇴사 라우트 하나였고 마지막 관리자
// (`O: server/src/people.ts:1087`) · 본인(`:1095`)만 막았다 — 관리자가 회사에 한 명(`O: db/schema/030_constraints_indexes.sql:1145`)
// 이라 상한이 필요 없었다.
async function archiveUser(viewer: Viewer, id: string, deps?: Partial<ArchiveDeps>): Promise<void> {
  // 06.4 D-6416(K-R1b · eng 재검토 R1) 사용자 확정(2026-10-12 카드): 본인 보관 막기 — 260907 `O: server/src/people.ts:1095-1098`
  // 「실수로 누르면 그 자리에서 못 돌아온다」와 같은 동작. 잠금 전 — 판정에 DB가 필요 없다. SYSTEM_VIEWER는 id `system`이라 해당 없음.
  if (viewer.id === id) throw new SelfArchiveError(SELF_ARCHIVE_MESSAGE);
  // 06.4 /review(사용자 결정): 복원(`domain/people/restore.ts`)과 같이 보관함 쓰기에 더해 사람 쓰기. 등록 보상(SYSTEM_VIEWER)은 면제.
  if (viewer.id !== SYSTEM_VIEWER.id && !(await (deps?.can ?? defaultCan)(viewer, "admin.people", "write"))) {
    throw new ForbiddenError("사람 보관 권한 없음 · 시스템 관리자");
  }
  const today = kstToday((deps?.now ?? (() => new Date()))());
  const recordAction = deps?.recordAction ?? defaultRecordAction;
  await withTransaction(async (tx) => {
    await lockSeatKeys(viewer, { personIds: [id], admin: true }, tx);
    const row = await defaultFindUserById(viewer, id, tx);
    if (!row) throw new ArchivableRowNotFoundError("대상 찾을 수 없음");
    // 이미 보관됨 — 범용 경로의 「바꾼 행 없음 → 로그 없이」와 같은 뜻, 판정 전에 끝.
    if (row.archivedAt !== null) return;
    // K-R1 사용자 확정(2026-10-11 카드 「막기」) · D-6411: 대상 계급 C가 내 상한 밖이면 보관하지 못한다 — 마지막 관리자 검사보다
    // 먼저(관리자가 여럿이어도 위임받은 사람이 관리자를 보관해 접속을 끊는 길, `N: lib/viewer.ts:45`). 보관 관문은 `admin.archive` 쓰기 그대로.
    await assertCanGrantRoles(viewer, [row.roleId], tx);
    // 남은 쪽 = 퇴직일 NULL(06.4-01 D-6412).
    await assertNotLastAdmin(viewer, { userId: id, asOf: today }, tx);
    if (!(await setUserArchived(viewer, id, true, tx))) return;
    await recordAction(viewer, { actionType: "archive", entity: "user", entityId: id }, { tx });
  });
}

// 07-15(R16 · R17): 계급 보관 — 시드 계급 보호 → 상한(위임자는 상한 밖 계급을 못 보관) → 계급 행 잠금 뒤 활성 소속 수.
// 잠금 뒤 세어 보관 중 다른 저장이 끼어도 보관 쪽 판정은 커밋된 값을 본다. SYSTEM_VIEWER(테스트 훅 · CLI)는 소속 막기만 면제
// (last-admin O4 선례) — 상한은 시드 성질로 통과.
async function archiveRole(viewer: Viewer, id: string, deps?: Partial<ArchiveDeps>): Promise<void> {
  const row = await findRoleById(viewer, id);
  if (!row) throw new ArchivableRowNotFoundError("대상 찾을 수 없음");
  if (row.isSeed) throw new ProtectedRowError("보호된 항목은 보관할 수 없음");
  await assertCanEditRole(viewer, id, (before) => before);
  const today = kstToday((deps?.now ?? (() => new Date()))());
  const recordAction = deps?.recordAction ?? defaultRecordAction;
  await withTransaction(async (tx) => {
    const locked = await lockRoleForUpdate(viewer, id, tx);
    if (!locked || locked.archivedAt !== null) return;
    if (viewer.id !== SYSTEM_VIEWER.id) {
      const count = await countActiveMembersOfRole(viewer, id, today, tx);
      if (count > 0) throw new RoleHasMembersError(count);
    }
    if (!(await setRoleArchived(viewer, id, true, tx))) return;
    await recordAction(viewer, { actionType: "archive", entity: "roles", entityId: id }, { tx });
  });
}

const DOMAIN_ARCHIVERS: Partial<Record<string, (viewer: Viewer, id: string, deps?: Partial<ArchiveDeps>) => Promise<void>>> = {
  user: archiveUser,
  roles: archiveRole,
};

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
  const domainArchiver = DOMAIN_ARCHIVERS[entity];
  if (domainArchiver) return domainArchiver(viewer, id, deps);

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
  // 06.4(D-6406): 사람 복원은 사람 쓰기 · 상한 · 자리 재검사를 한 tx에서.
  user: (viewer, id, deps) => restoreUser(viewer, id, { can: deps?.can, recordAction: deps?.recordAction, now: deps?.now, visible: deps?.visible }),
};

export type RestoreResult = { restored: boolean };

// 같은 숫자 사업자번호의 살아 있는 거래처를 찾아 「복원 불가」 문구로 만든다(이름은 「거래처 정보」를 볼 때만).
async function vendorRestoreBlock(viewer: Viewer, id: string): Promise<UserFacingError | null> {
  const row = await findVendorById(viewer, id);
  const digits = businessNoDigits(row?.businessNo);
  // 보관된 같은 번호끼리는 막지 않는다(살아 있는 행만 겹치면 안 된다 · 보관함 목록 · 유일 색인과 같은 기준).
  const taker = digits === null ? undefined : (await findVendorsByBusinessNoDigits(viewer, digits, { excludeId: id })).find((row) => row.archivedAt === null);
  if (!taker) return null;
  const name = (await visible(viewer, "vendor.value")) ? ` · ${taker.name}` : "";
  return new VendorBusinessNoTakenError(`같은 사업자번호 거래처 있음${name} · 복원 불가`);
}

// 06.4 /review: 팀 · 본부를 되살리면 그 안의 팀장 · 본부 책임자 자리가 다시 생긴다 — 보관 동안 자리 검사가 그 팀 · 본부를
// 보지 않아 둘째 보유자가 생겼을 수 있다. 팀 · 본부 키를 잡고 보관을 푼 뒤 겹치면 tx째 되돌린다(자동 강등 없음 · 사람 복원과
// 같은 꼴). 팀은 그 팀의 본부 책임자 자리도 되살아나므로 본부 키 · 검사까지. 날짜 · 이름 노출은 tx 전에(풀에서 따로 빌리지 않게).
async function restoreSeatedOrg(viewer: Viewer, entity: "team" | "org_unit", id: string, deps?: Partial<ArchiveDeps>): Promise<RestoreResult> {
  const teamIds = entity === "team" ? [id] : [];
  const orgUnitId = entity === "org_unit" ? id : ((await findTeamById(viewer, id))?.orgUnitId ?? null);
  const orgUnitIds = orgUnitId === null ? [] : [orgUnitId];
  const today = kstToday((deps?.now ?? (() => new Date()))());
  const showNames = await (deps?.visible ?? visible)(viewer, "person.value");
  const recordAction = deps?.recordAction ?? defaultRecordAction;
  return withTransaction(async (tx) => {
    await lockSeatKeys(viewer, { teamIds, orgUnitIds }, tx);
    const baseline = await seatDuplicateBaseline(viewer, today, tx);
    const reactivated = entity === "team" ? await setTeamArchived(viewer, id, false, tx) : await setOrgUnitArchived(viewer, id, false, tx);
    if (!reactivated) return { restored: false };
    try {
      await assertNoSeatDuplicates(viewer, { teamIds, orgUnitIds, today, showNames, baseline }, tx);
    } catch (error) {
      // 보관함 토스트가 마지막 「 · 」 앞까지 자른다 — 사람 복원(`domain/people/restore.ts`)처럼 ` · 복원 불가`로 끝낸다.
      if (error instanceof SeatTakenError) throw new SeatTakenError(`${error.message} · 복원 불가`);
      throw error;
    }
    await recordAction(viewer, { actionType: "restore", entity, entityId: id }, { tx });
    return { restored: true };
  });
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

  if (entity === "team" || entity === "org_unit") return restoreSeatedOrg(viewer, entity, id, deps);

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
    if (entity === "corp_card" && isUniqueViolation(error, CORP_CARD_LAST4_UNIQUE_INDEX)) {
      throw new CorpCardLast4TakenError("같은 발급사와 뒤 4자리 카드 있음 · 복원 불가");
    }
    throw error;
  }
  if (!reactivated) return { restored: false };
  // 06.1-04 G11: 되살린 카드의 끝 4자리 「카드 미등록」 증빙 기록을 다시 잇는다(실제로 되살린 때만).
  if (entity === "corp_card") await (deps?.relinkUnknownCardRecords ?? defaultRelinkUnknownCardRecords)(viewer, id);

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
  const listed = (await listFn(viewer)).filter((row) => (row.entity !== "reserve_entry" || showReserves) && !hiddenEntities.has(row.entity));
  // 06.2(I-2): 보관된 견적 줄은 그 줄의 프로젝트를 볼 수 있는 사람에게만 — 범위 밖 프로젝트의 품목 이름이 보관함으로 새지 않게.
  // 보관함 메뉴는 관리자 화면이지만 줄 이름은 프로젝트 정보다 — 예외로 두지 않고 거른다(06.2-03 독립 검토 I-2).
  const lineProjectIds = [...new Set(listed.flatMap((row) => (row.entity === "quote_line" && row.projectId ? [row.projectId] : [])))];
  const seenProjects =
    lineProjectIds.length > 0 ? await listProjectIdsInScope(viewer, await projectRowScope(viewer, deps?.can ? { can: deps.can } : undefined), lineProjectIds) : new Set<string>();
  const rows = listed.filter((row) => row.entity !== "quote_line" || (row.projectId !== undefined && seenProjects.has(row.projectId)));

  // 독립 검토(#138) — 복원할 수 없는 공휴일 행은 「복원」을 내놓지 않는다(§7). 공휴일 복원은 공휴일 쓰기 권한과
  // 소급 금지(오늘 이후 날짜) · 그 날짜에 다른 공휴일(대체일 제외) 없음을 요구한다(restoreHoliday) — 같은 판정을 목록에서 미리 한다.
  const holidayWritable = rows.some((row) => row.entity === "holiday") && (await canFn(viewer, HOLIDAYS_MENU, "write"));
  // 06.4 D-6406 사용자 확정(2026-10-12 카드): 사람 쓰기가 없으면 사람 행 「복원」을 내놓지 않는다(§7 할 수 없는 선택지 숨김).
  // 상한 · 자리 위반은 행마다 미리 보지 않고 복원 때 원인 토스트로(Pitfall 8).
  const peopleWritable = rows.some((row) => row.entity === "user") && (await canFn(viewer, "admin.people", "write"));
  const today = toKstDate(deps?.now ?? new Date());
  // 추가 권한 조건(requiredMenu)의 쓰기가 없는 항목의 행은 복원 불가(항목마다 한 번 판정 — restore()의 assertCanWriteEntry와 같은 조건).
  const unwritableEntities = await entitiesWithoutRequired(viewer, canFn, "write");
  const isRestorable = (row: ArchivedItem) =>
    !unwritableEntities.has(row.entity) &&
    (row.entity !== "holiday" || (holidayWritable && row.date !== undefined && row.date > today && !row.dateTaken)) &&
    (row.entity !== "vendor" || !row.businessNoTaken) &&
    (row.entity !== "user" || peopleWritable);

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
