import type { Viewer } from "@/domain/viewer";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { can as defaultCan } from "@/domain/permissions/can";
import { scopeFor } from "@/domain/permissions/scope-for";
import { project, type DtoSpec, type ProjectDeps } from "@/domain/permissions/project";
import { visible as defaultVisible } from "@/domain/permissions/visible";
import { recordAction as defaultRecordAction } from "@/domain/action-log/record";
import { buildChanges } from "@/domain/action-log/changes";
import { registerDto } from "@/domain/permissions/dto-registry";
import {
  createAccount as defaultCreateAccount,
  resetPassword as defaultResetPassword,
  unlockAccount as defaultUnlockAccount,
} from "@/domain/auth/accounts";
import { isLocked, lockoutConfig, windowStart } from "@/domain/auth/lockout";
import { archive as defaultArchive } from "@/domain/archive";
import { revokeAllSessions as defaultRevokeAllSessions } from "@/domain/auth/password";
import { findRoleById as defaultFindRoleById, findRolesByIds as defaultFindRolesByIds } from "@/repositories/roles";
import { findTeamById as defaultFindTeamById } from "@/repositories/teams";
import { findOrgUnitById as repoFindOrgUnitById } from "@/repositories/org-units";
import { UserFacingError } from "@/lib/actions/user-facing-error";
import { kstToday } from "@/lib/kst-date";
import { isCheckViolation } from "@/lib/pg-errors";
import { countOpenFailures, listLockedEmails } from "@/repositories/login-attempts";
import { withTransaction } from "@/lib/db-transaction";
import type { DbOrTx } from "@/repositories/document-counters";
import { assertCanGrantRoles } from "@/domain/permissions/grant-ceiling";
import { assertNotLastAdmin } from "@/domain/permissions/last-admin";
import { listOccupiedTeams, lockSeatKeys, type OccupiedTeamRow } from "@/repositories/seats";
import { assertSeatsFree, newSeats, SeatTakenError } from "@/domain/people/seat-rules";
import { assertNotRetiredInTx, isRetiredOn } from "@/domain/people/retired";
import { loadActionLogGate, recordActionInTx, type TxLogDeps } from "@/domain/approvals/tx-log";
import {
  listUsers as repoListUsers,
  listUsersPage as repoListUsersPage,
  findUsersByLowerEmails as repoFindUsersByLowerEmails,
  findUserById as repoFindUserById,
  updateUserRole as repoUpdateUserRole,
  updateUserHireDate as repoUpdateUserHireDate,
  updateUserResignationDate as repoUpdateUserResignationDate,
  type UserRow,
} from "@/repositories/users";
import {
  teamAtDate as defaultTeamAtDate,
  teamsAtDate as defaultTeamsAtDate,
  assignTeam as defaultAssignTeam,
  listAssignments as defaultListAssignments,
  type TeamAssignmentDto,
  type TeamDto,
} from "@/domain/org";

export class ForbiddenError extends UserFacingError {}
export class ValidationError extends UserFacingError {}
export class SelfRoleChangeError extends UserFacingError {}
export class UserNotFoundError extends UserFacingError {}

// 사용자 결정(2026-09-29 A) — 관리자는 자기 연차 조정 · 입사일 · 퇴직일을 바꾸지 못한다(계급 변경과 같은 규칙).
export const SELF_LEAVE_EDIT_ERROR = "본인 연차·입사일 변경 불가 · 다른 관리자에게 요청";

const PEOPLE_MENU = "admin.people";
const EFFECTIVE_FROM_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// 현재 소속의 「오늘」은 서울 날짜다 — UTC면 KST 0~9시에 오늘 발령이 아직 안 보인다.
export type PeopleReadDeps = { now: () => Date };

function seoulTodayOf(deps?: Partial<PeopleReadDeps>): string {
  return kstToday((deps?.now ?? (() => new Date()))());
}

// MAST-02: 사람 DTO. 03-05 Task 1이 「여기서 spec을 정의한다」고 못박은 대로
// dto-registry가 아니라 이 파일에 둔다(도메인 함수가 이 파일에 있으므로).
// currentTeamId/currentTeamName은 users 표의 컬럼이 아니라 teamAtDate가
// 계산한 값이다 — project()에 넘기는 "row 같은" 객체에 미리 합쳐 둔다.
export type PersonDto = {
  id: string;
  name: string;
  email: string;
  roleId: string | null;
  roleName: string | null;
  archivedAt: Date | null;
  currentTeamId: string | null;
  currentTeamName: string | null;
  firstLoginAt: Date | null;
  passwordIsTemporary: boolean;
  // 07-17 SC-11: 퇴직 낱말(isRetiredOn)과 로그인 잠김(로그인 거부와 같은 판정 — 창 안 열린 실패 수 ≥ 임계).
  resignationDate: string | null;
  locked: boolean;
};

type PersonSource = UserRow & {
  roleName: string | null;
  currentTeamId: string | null;
  currentTeamName: string | null;
  // 잠김을 묻지 않은 호출(listPeople · 기본 getPerson)은 키를 빼서 project가 건너뛴다.
  locked?: boolean;
};

export const PERSON_DTO_SPEC: DtoSpec<PersonSource, PersonDto> = {
  fields: [
    { key: "id", from: "id", infoItem: "person.value" },
    { key: "name", from: "name", infoItem: "person.value" },
    { key: "email", from: "email", infoItem: "person.value" },
    { key: "roleId", from: "roleId", infoItem: "person.value" },
    { key: "roleName", from: "roleName", infoItem: "role.value" },
    { key: "archivedAt", from: "archivedAt", infoItem: "person.value" },
    { key: "currentTeamId", from: "currentTeamId", infoItem: "team.value" },
    { key: "currentTeamName", from: "currentTeamName", infoItem: "team.value" },
    { key: "firstLoginAt", from: "firstLoginAt", infoItem: "person.value" },
    { key: "passwordIsTemporary", from: "passwordIsTemporary", infoItem: "person.value" },
    { key: "resignationDate", from: "resignationDate", infoItem: "person.value" },
    { key: "locked", from: "locked", infoItem: "person.value" },
  ],
};

registerDto({
  name: "PersonDto",
  fields: PERSON_DTO_SPEC.fields.map((field) => ({ key: field.key, infoItem: field.infoItem })),
});

// 목록과 상세가 같은 곳에서 source를 합성하고 투영한다(테스트 2의 deep-equal
// 보장). deps.visible로 호출자가 노출 판정을 메모이즈할 수 있다.
async function projectPerson(
  viewer: Viewer,
  row: UserRow,
  team: TeamDto | null | undefined,
  roleName: string | null,
  locked: boolean | null,
  deps?: Partial<ProjectDeps>,
): Promise<PersonDto> {
  const source: PersonSource = {
    ...row,
    roleName,
    currentTeamId: team?.id ?? null,
    currentTeamName: team?.name ?? null,
    ...(locked === null ? {} : { locked }),
  };
  return (await project(viewer, source, PERSON_DTO_SPEC, deps)) as PersonDto;
}

async function toPersonDto(viewer: Viewer, row: UserRow, today: string, withLock: boolean): Promise<PersonDto> {
  const [team, role, lockedEmails] = await Promise.all([
    defaultTeamAtDate(viewer, row.id, today),
    row.roleId ? defaultFindRoleById(viewer, row.roleId) : Promise.resolve(null),
    withLock ? lockedEmailSet(viewer) : Promise.resolve(null),
  ]);
  return projectPerson(viewer, row, team, role?.name ?? null, lockedEmails ? lockedEmails.has(row.email.toLowerCase()) : null);
}

// 07-17 SC-11: 잠김은 사람 화면(listPeoplePage · 상세 withLock)만 묻는다 — listPeople(카드 · 기록 고르기)에
// 고정 조회 3번(설정 둘 + 잠긴 이메일)을 더하지 않는다(이슈 #56 조회 수 계약).
// 잠김 = 로그인 거부와 같은 판정(임계 · 창은 설정값 — D-723). 한 질의로 잠긴 이메일(소문자) 묶음.
async function lockedEmailSet(viewer: Viewer): Promise<Set<string>> {
  const { threshold, windowMinutes } = await lockoutConfig();
  return listLockedEmails(viewer, { threshold, since: windowStart(new Date(), windowMinutes) });
}

// F24: 퇴직 술어는 domain/org도 부르므로 순환 없는 모듈로 옮겼다 — 기존 import 경로는 그대로 둔다.
export { isRetiredOn } from "@/domain/people/retired";

// 이슈 #56: 사람마다 팀·계급·노출표를 따로 조회하던 N+1을 묶음 조회 + 호출
// 한정 메모로 바꿨다.
// 사람 목록 — 행 필터 서술자를 따르고 보관된 사람은 보관함 권한 없이는
// 보이지 않는다(scopeFor(viewer, "user")가 Phase 1 자리표시를 대신한다).
export async function listPeople(viewer: Viewer, deps?: Partial<PeopleReadDeps>): Promise<PersonDto[]> {
  const scope = await scopeFor(viewer, "user");
  const rows = await repoListUsers(viewer, { scope, includeArchived: scope.includeArchived });
  return projectPeople(viewer, rows, seoulTodayOf(deps), null, memoizeVisible());
}

// viewer가 호출 동안 고정이라 infoItem만 키로 쓴다. 캐시는 이 함수 호출
// 안에만 있고 모듈 전역에 두지 않는다(T-q56-01) — 다른 viewer·계급의
// 판정이 섞이거나 노출표 변경 뒤 낡은 판정이 쓰이는 것을 막는다.
function memoizeVisible(): typeof defaultVisible {
  const visibleCache = new Map<string, Promise<boolean>>();
  return (v: Viewer, infoItem: string): Promise<boolean> => {
    let cached = visibleCache.get(infoItem);
    if (!cached) {
      cached = defaultVisible(v, infoItem);
      visibleCache.set(infoItem, cached);
    }
    return cached;
  };
}

async function projectPeople(
  viewer: Viewer,
  rows: UserRow[],
  today: string,
  lockedEmails: ReadonlySet<string> | null,
  memoizedVisible: typeof defaultVisible,
): Promise<PersonDto[]> {
  const roleIds = [...new Set(rows.map((row) => row.roleId).filter((id): id is string => id !== null))];
  const [teamMap, roleRows] = await Promise.all([
    defaultTeamsAtDate(
      viewer,
      rows.map((row) => row.id),
      today,
      { visible: memoizedVisible },
    ),
    defaultFindRolesByIds(viewer, roleIds),
  ]);
  const roleNameMap = new Map(roleRows.map((role) => [role.id, role.name]));

  return Promise.all(
    rows.map((row) =>
      projectPerson(
        viewer,
        row,
        teamMap.get(row.id),
        row.roleId ? (roleNameMap.get(row.roleId) ?? null) : null,
        lockedEmails ? lockedEmails.has(row.email.toLowerCase()) : null,
        { visible: memoizedVisible },
      ),
    ),
  );
}

export const PEOPLE_PAGE_SIZE = 50;

export type PeoplePage = {
  rows: PersonDto[];
  total: number;
  /** 잠긴 재직자 수 — 검색 · 쪽과 무관한 권한 범위 전체, 퇴직 · 보관 제외(SC-11 U2). */
  lockedCount: number;
  page: number;
  pageSize: number;
  pageCount: number;
  /** 보는 사람에게 보이는 DTO 키 — 열 노출은 쪽 행이 아니라 노출표로 정한다(결과 0행이어도 같은 열). */
  visibleKeys: ReadonlySet<string>;
};

// 07-17 SC-11(U1 · U2 · U6): 사람 목록 한 쪽(50명) — 이름 · 이메일 검색, `locked`면 잠긴 재직자만(퇴직은 isRetiredOn · 보관 제외).
// T-07-17-03: 검색 · 잠김 거르기 · 잠긴 수는 보는 사람에게 보이는 칸으로만 — 가린 값으로 거르면 그 값이 행 수로 새어 나간다.
export async function listPeoplePage(
  viewer: Viewer,
  query: { q?: string; locked?: boolean; page?: number },
  deps?: Partial<PeopleReadDeps>,
): Promise<PeoplePage> {
  const scope = await scopeFor(viewer, "user");
  const today = seoulTodayOf(deps);
  const memoizedVisible = memoizeVisible();
  const visibleKeys = new Set<string>();
  for (const field of PERSON_DTO_SPEC.fields) {
    const items = typeof field.infoItem === "string" ? [field.infoItem] : field.infoItem;
    const shown = await Promise.all(items.map((item) => memoizedVisible(viewer, item)));
    if (shown.every(Boolean)) visibleKeys.add(field.key);
  }
  const lockedEmails = await lockedEmailSet(viewer);
  const showLocked = visibleKeys.has("locked");
  const lockedPeople =
    scope.rows === "none" || !showLocked
      ? []
      : (await repoFindUsersByLowerEmails(viewer, [...lockedEmails])).filter(
          (row) => row.archivedAt === null && !isRetiredOn(row.resignationDate, today),
        );
  const q = query.q?.trim() ? query.q.trim() : null;
  const { rows, total, page } = await repoListUsersPage(viewer, {
    scope,
    includeArchived: scope.includeArchived,
    search: q ? { q, name: visibleKeys.has("name"), email: visibleKeys.has("email") } : null,
    ids: query.locked && showLocked ? lockedPeople.map((row) => row.id) : null,
    page: query.page ?? 1,
    pageSize: PEOPLE_PAGE_SIZE,
  });
  return {
    rows: await projectPeople(viewer, rows, today, lockedEmails, memoizedVisible),
    total,
    lockedCount: lockedPeople.length,
    page,
    pageSize: PEOPLE_PAGE_SIZE,
    pageCount: Math.max(1, Math.ceil(total / PEOPLE_PAGE_SIZE)),
    visibleKeys,
  };
}

export async function getPerson(
  viewer: Viewer,
  userId: string,
  deps?: Partial<PeopleReadDeps> & { withLock?: boolean },
): Promise<{ person: PersonDto; assignments: TeamAssignmentDto[] } | null> {
  const row = await repoFindUserById(viewer, userId);
  if (!row) return null;

  const person = await toPersonDto(viewer, row, seoulTodayOf(deps), deps?.withLock === true);
  const assignments = await defaultListAssignments(viewer, userId);
  return { person, assignments };
}

export type RegisterPersonInput = {
  name: string;
  email: string;
  roleId: string;
  teamId?: string;
  effectiveFrom?: string;
  // 04.1-03(D-96): 선택 — 필수화는 04.1-06의 폼·액션이 한다(입사일 없는 기존 계정도 받는다).
  hireDate?: string;
};

export type RegisterPersonDeps = {
  can: typeof defaultCan;
  createAccount: typeof defaultCreateAccount;
  assignTeam: typeof defaultAssignTeam;
  archive: typeof defaultArchive;
  findRoleById: typeof defaultFindRoleById;
  findTeamById: typeof defaultFindTeamById;
  recordAction: typeof defaultRecordAction;
  saveHireDate: typeof repoUpdateUserHireDate;
  now: () => Date;
  visible: typeof defaultVisible;
};

// 사람 등록 — 계정 발급과 초기 비밀번호 생성을 같은 흐름에서 부른다.
//
// 원자성의 실제 형태는 트랜잭션이 아니라 "부분 상태 없음"이다(better-auth
// internalAdapter와 Drizzle이 같은 연결을 쓰지 않는다). 그래서 (a) 입력 때문에
// 실패할 수 있는 조건은 전부 계정 생성 전에 거부하고(이메일 중복·계급/팀
// 실재와 보관 여부·발령일 형식), (b) 남는 인프라 오류 창에서만 방금 만든
// 계정을 보상 보관한다.
// 06.4(D-6404 · Pitfall 2): 상한 · 자리 검사도 (a)에 든다 — 생성 전 tx에서 끝낸다. 잠금이 풀린 뒤 생성 · 발령 사이 창은
// assignTeam의 재검사가 두 번째로 거르고, 그때는 보상 보관 뒤 자리 문구를 그대로 던진다.
export async function registerPerson(
  viewer: Viewer,
  input: RegisterPersonInput,
  deps?: Partial<RegisterPersonDeps>,
): Promise<{ userId: string; tempPassword: string }> {
  const canFn = deps?.can ?? defaultCan;
  if (!(await canFn(viewer, PEOPLE_MENU, "write"))) {
    throw new ForbiddenError("사람 등록 권한 없음");
  }

  const findRoleById = deps?.findRoleById ?? defaultFindRoleById;
  const role = await findRoleById(viewer, input.roleId);
  if (!role || role.archivedAt) {
    throw new ValidationError(`존재하지 않거나 보관된 계급: ${input.roleId}`);
  }

  let seat: { teamId: string; orgUnitId: string; effectiveFrom: string } | null = null;
  if (input.teamId) {
    if (!input.effectiveFrom || !EFFECTIVE_FROM_PATTERN.test(input.effectiveFrom)) {
      throw new ValidationError("발령일 형식 오류 — YYYY-MM-DD로");
    }
    const findTeamById = deps?.findTeamById ?? defaultFindTeamById;
    const team = await findTeamById(viewer, input.teamId);
    if (!team || team.archivedAt) {
      throw new ValidationError(`존재하지 않거나 보관된 팀: ${input.teamId}`);
    }
    seat = { teamId: team.id, orgUnitId: team.orgUnitId, effectiveFrom: input.effectiveFrom };
  }

  if (input.hireDate !== undefined && !isCalendarDate(input.hireDate)) {
    throw new ValidationError(HIRE_DATE_FORMAT_ERROR);
  }

  // 상한 → 자리(Pitfall 2). 사람이 아직 없어 사람 키 없이 도착 팀 · 본부 키만 잡는다. 보관 본부는 점유 구간 함수처럼 본부 없음.
  const today = seoulTodayOf(deps);
  const showNames = await (deps?.visible ?? defaultVisible)(viewer, "person.value");
  const orgUnit = seat ? await repoFindOrgUnitById(viewer, seat.orgUnitId) : null;
  await withTransaction(async (tx) => {
    await assertCanGrantRoles(viewer, [input.roleId], tx);
    if (!seat) return;
    const occupied: OccupiedTeamRow = {
      teamId: seat.teamId,
      orgUnitId: orgUnit && !orgUnit.archivedAt ? orgUnit.id : null,
      from: seat.effectiveFrom > today ? seat.effectiveFrom : today,
      to: null,
    };
    const seats = newSeats({
      roleBefore: null,
      roleAfter: input.roleId,
      employedBefore: null,
      employedAfter: { archivedAt: null, resignationDate: null },
      occupiedBefore: [],
      occupiedAfter: [occupied],
    });
    await assertSeatsFree(viewer, { roleId: input.roleId, seats, today, showNames }, tx);
  });

  const createAccount = deps?.createAccount ?? defaultCreateAccount;
  const { userId, tempPassword } = await createAccount(viewer, {
    email: input.email,
    name: input.name,
    roleId: input.roleId,
  });

  if (input.teamId && input.effectiveFrom) {
    const assignTeam = deps?.assignTeam ?? defaultAssignTeam;
    try {
      await assignTeam(viewer, { userId, teamId: input.teamId, effectiveFrom: input.effectiveFrom }, deps?.now ? { now: deps.now } : undefined);
    } catch (error) {
      // (b) 잔여 창 — 발령이 실패하면(인프라 오류, 또는 06.4 사전 검사 뒤 자리가
      // 먼저 찬 SeatTakenError) 방금 만든 계정을 보상 보관한다. 관리자의 보관함 권한과 무관하게 실행되도록 SYSTEM_VIEWER로
      // 부른다. 초기 비밀번호는 반환되지 않으므로 그 계정으로 로그인할 수
      // 있는 사람이 없다.
      const archive = deps?.archive ?? defaultArchive;
      await archive(SYSTEM_VIEWER, "user", userId, {
        // 06.4: 보관기가 tx로 로그를 쓴다 — 세 번째 인자를 버리지 않는다.
        recordAction: async (v, entry, options) =>
          (deps?.recordAction ?? defaultRecordAction)(
            v,
            {
              ...entry,
              detail: { reason: "register_person_rollback", requestedBy: viewer.id },
            },
            options,
          ),
      });
      if (error instanceof SeatTakenError) throw error;
      throw new UserFacingError(
        "발령 실패 · 계정은 발급됨 — 보관함에서 복원 후 발령 추가",
      );
    }
  }

  if (input.hireDate !== undefined) {
    const saveHireDate = deps?.saveHireDate ?? repoUpdateUserHireDate;
    try {
      await saveHireDate(viewer, userId, input.hireDate);
    } catch {
      // (b) 잔여 창 — 발령 실패와 같은 보상(입사일 없는 새 계정이 조용히 남지 않는다).
      const archive = deps?.archive ?? defaultArchive;
      await archive(SYSTEM_VIEWER, "user", userId, {
        // 06.4: 보관기가 tx로 로그를 쓴다 — 세 번째 인자를 버리지 않는다.
        recordAction: async (v, entry, options) =>
          (deps?.recordAction ?? defaultRecordAction)(
            v,
            {
              ...entry,
              detail: { reason: "register_person_rollback", requestedBy: viewer.id },
            },
            options,
          ),
      });
      throw new UserFacingError(
        "입사일 저장 실패 · 계정은 발급됨 — 보관함에서 복원 후 사람 상세에서 입사일 넣기",
      );
    }
  }

  const recordAction = deps?.recordAction ?? defaultRecordAction;
  await recordAction(viewer, { actionType: "document_create", entity: "user", entityId: userId });

  return { userId, tempPassword };
}

export type ChangePersonRoleDeps = {
  can: typeof defaultCan;
  findRoleById: typeof defaultFindRoleById;
  recordAction: typeof defaultRecordAction;
  now: () => Date;
  visible: typeof defaultVisible;
};

// 자기 자신의 계급 변경은 거부한다 — D-33이 순위(rank) 컬럼을 두지 않기로
// 했으므로 "낮추는" 요청만 가려낼 방법이 없다. 마지막 관리자가 자기 계급을
// 바꾸면 복구 경로가 없다는 위험은 방향과 무관하게 같으므로, 자기 계급
// 변경 자체를 전부 거부한다(03-03의 자기 권한표 잠금과 같은 결의 보수적
// 선택 — SUMMARY 「실행자가 판단한 것」 참고).
export async function changePersonRole(
  viewer: Viewer,
  userId: string,
  roleId: string,
  deps?: Partial<ChangePersonRoleDeps>,
): Promise<void> {
  const canFn = deps?.can ?? defaultCan;
  if (!(await canFn(viewer, PEOPLE_MENU, "write"))) {
    throw new ForbiddenError("계급 변경 권한 없음");
  }

  if (viewer.id === userId) {
    throw new SelfRoleChangeError("자기 자신의 계급은 이 화면에서 바꿀 수 없음");
  }

  // registerPerson과 같은 검사를 여기에도 둔다(T-03-30). 외래키는 없는
  // 식별자만 막고 보관된 계급은 통과시키는데, findPermission이
  // roles.archived_at을 보지 않으므로 은퇴한 계급의 권한 행이 사용자
  // 단위로 되살아난다.
  const findRoleById = deps?.findRoleById ?? defaultFindRoleById;
  const role = await findRoleById(viewer, roleId);
  if (!role || role.archivedAt) {
    throw new ValidationError(`존재하지 않거나 보관된 계급: ${roleId}`);
  }

  // 06.4(D-6402 · D-6403 · D-6404 · D-6408): 잠금 순서 사람 → 관리자 → (점유를 읽은 뒤) 팀 → 본부. 판정은 전부 잠금 뒤 tx 재조회.
  const today = seoulTodayOf(deps);
  const showNames = await (deps?.visible ?? defaultVisible)(viewer, "person.value");
  const recordAction = deps?.recordAction ?? defaultRecordAction;
  await withTransaction(async (tx) => {
    await lockSeatKeys(viewer, { personIds: [userId], admin: true }, tx);
    await assertNotRetiredInTx(viewer, userId, today, tx);
    const row = await repoFindUserById(viewer, userId, tx);
    if (!row) throw new UserNotFoundError("사람 찾을 수 없음");
    await assertCanGrantRoles(viewer, [roleId, row.roleId], tx);
    await assertNotLastAdmin(viewer, { userId, asOf: today, nextRoleId: roleId }, tx);
    const occupied = await listOccupiedTeams(viewer, userId, today, tx);
    const seats = newSeats({
      roleBefore: row.roleId,
      roleAfter: roleId,
      employedBefore: row,
      employedAfter: row,
      occupiedBefore: occupied,
      occupiedAfter: occupied,
    });
    await assertSeatsFree(viewer, { userId, roleId, seats, today, showNames }, tx);
    await repoUpdateUserRole(viewer, userId, roleId, tx);
    await recordAction(
      viewer,
      {
        actionType: "permission_change",
        entity: "user",
        entityId: userId,
        detail: { changes: buildChanges({ roleId: row.roleId }, { roleId }) },
      },
      { tx },
    );
  });
}

export type ArchivePersonDeps = {
  archive: typeof defaultArchive;
  revokeAllSessions: typeof defaultRevokeAllSessions;
};

// 03-07: 사람 삭제는 보관 + 세션 만료 둘이다. 보관은 archive()의 사람 메뉴
// 쓰기 권한 판정(admin.archive write)에 위임하고, 세션 만료는
// revokeAllSessions(admin.people write)를 따른다. 보관된 사람의 로그인
// 재차단은 domain/auth/hooks.ts의 before 훅이 담당한다(별도 조건).
export async function archivePerson(
  viewer: Viewer,
  userId: string,
  deps?: Partial<ArchivePersonDeps>,
): Promise<void> {
  const archive = deps?.archive ?? defaultArchive;
  await archive(viewer, "user", userId);

  const revokeAllSessions = deps?.revokeAllSessions ?? defaultRevokeAllSessions;
  await revokeAllSessions(viewer, userId);
}

// 07-17 독립 검토 L1 · /review(풀 고갈): 잠금 풀기 · 초기화는 사람 키(seat:person:)를 쥔 짧은 tx 안에서 대상을 다시 읽고 상한을
// 본 뒤 키를 놓고 나서 외부 단계(07-09 unlockAccount · resetPassword)를 부른다 — 계급 변경(`changePersonRole`)이 같은 키를 쥐므로
// 진행 중인 올리기 · 내리기의 커밋을 기다려 새 계급으로 판정한다(assignTeam과 같은 「잠금 → 재조회 → 상한」 순서). 키를 쥔 채
// 외부 단계가 풀에서 연결을 하나 더 빌리면 풀 크기 이상 동시 요청이 5초 뒤 실패하므로 쥐지 않는다(연결은 한 번에 하나).
type PersonLock = <T>(viewer: Viewer, personId: string, fn: (tx: DbOrTx) => Promise<T>) => Promise<T>;

async function defaultWithPersonLock<T>(viewer: Viewer, personId: string, fn: (tx: DbOrTx) => Promise<T>): Promise<T> {
  return withTransaction(async (tx) => {
    await lockSeatKeys(viewer, { personIds: [personId] }, tx);
    return fn(tx);
  });
}

export type UnlockPersonDeps = {
  can: typeof defaultCan;
  withPersonLock: PersonLock;
  loadTarget: (
    viewer: Viewer,
    personId: string,
    tx: DbOrTx,
  ) => Promise<Pick<UserRow, "id" | "email" | "roleId" | "resignationDate" | "archivedAt"> | null>;
  assertCanGrantRoles: (viewer: Viewer, roleIds: (string | null)[], tx: DbOrTx) => Promise<void>;
  lockedNow: (email: string, tx: DbOrTx) => Promise<boolean>;
  unlockAccount: (viewer: Viewer, email: string, opts: { recordAction: typeof defaultRecordAction }) => Promise<{ resolved: number }>;
  now: () => Date;
};

// 07-17 SC-11 · SC-12 · D-728 · R11: 사람 화면의 잠금 풀기 — `admin.people` 쓰기 · 대상 상한 안 · 퇴직자 아님을 본 뒤
// 07-09 `unlockAccount`(해소 + account_unlock 기록 · 상한 재확인)를 부른다. 퇴직 거부는 여기(domain)에만 있다 —
// `unlockAccount` 자체와 CLI 경로는 퇴직을 보지 않는다(PR-AUTH 범위, 관리자 화면 경로만 막는다).
// 07-17 독립 검토 L3: 지금 잠긴 사람만 푼다(화면이 `잠금 풀기`를 그리는 조건과 같은 판정) — 잠기지 않았으면 아무것도 하지 않고
// `{ unlocked: false }`(account_unlock 「해소 0건」 기록 · 임계 미만 실패 지우기 없음). 두 관리자가 동시에 누르면 뒤 요청은 판정
// tx(사람 키) 또는 해소 tx(이메일 키 · 해소 0건)에서 이미 풀린 것을 본다.
export async function unlockPerson(
  viewer: Viewer,
  personId: string,
  deps?: Partial<UnlockPersonDeps>,
): Promise<{ unlocked: boolean }> {
  const canFn = deps?.can ?? defaultCan;
  if (!(await canFn(viewer, PEOPLE_MENU, "write"))) {
    throw new ForbiddenError("잠금 풀기 권한 없음");
  }
  const loadTarget = deps?.loadTarget ?? ((v: Viewer, id: string, tx: DbOrTx) => repoFindUserById(v, id, tx));
  const today = seoulTodayOf(deps);
  // 설정 읽기는 잠금 전에 — 잠금 중에는 tx로만 센다(로그인 거부와 같은 임계 · 창).
  const lockedNow = deps?.lockedNow ?? (await defaultLockedNow(deps?.now?.() ?? new Date()));
  const email = await (deps?.withPersonLock ?? defaultWithPersonLock)(viewer, personId, async (tx) => {
    const target = await loadTarget(viewer, personId, tx);
    if (!target) throw new UserNotFoundError("사람 찾을 수 없음");
    // 07-17 독립 검토 L2: 보관된 사람은 화면이 행동을 그리지 않는다 — 직접 호출도 거부(260907 `archived_at is null`과 같은 판정).
    if (target.archivedAt) throw new ForbiddenError("보관된 사람 · 잠금 풀기 없음");
    if (isRetiredOn(target.resignationDate, today)) {
      throw new ForbiddenError("퇴직한 사람 · 잠금 풀기 없음");
    }
    await (deps?.assertCanGrantRoles ?? assertCanGrantRoles)(viewer, [target.roleId], tx);
    return (await lockedNow(target.email, tx)) ? target.email : null;
  });
  if (email === null) return { unlocked: false };
  // 해소 tx 안 재판정 — 07-09 `unlockAccount`의 account_unlock 기록 자리(해소와 같은 tx)에서 사람 키를 잡고 다시 읽어 상한을 본다.
  // 판정 뒤 올라간 대상이면 해소째 되돌린다. 그 사이 다른 요청이 이미 풀었으면(해소 0건) 기록 없이 되돌린다(L3).
  const assertCeiling = deps?.assertCanGrantRoles ?? assertCanGrantRoles;
  const recheckThenRecord: typeof defaultRecordAction = async (v, entry, options) => {
    const tx = options?.tx;
    if (!tx) throw new Error("account_unlock 기록은 해소 tx 안이어야 함");
    await lockSeatKeys(viewer, { personIds: [personId] }, tx);
    const target = await loadTarget(viewer, personId, tx);
    if (!target) throw new UserNotFoundError("사람 찾을 수 없음");
    await assertCeiling(viewer, [target.roleId], tx);
    if (entry.detail?.resolved === 0) throw new AlreadyUnlocked();
    return defaultRecordAction(v, entry, options);
  };
  try {
    await (deps?.unlockAccount ?? defaultUnlockAccount)(viewer, email, { recordAction: recheckThenRecord });
  } catch (error) {
    if (error instanceof AlreadyUnlocked) return { unlocked: false };
    throw error;
  }
  return { unlocked: true };
}

class AlreadyUnlocked extends Error {}

async function defaultLockedNow(now: Date): Promise<(email: string, tx: DbOrTx) => Promise<boolean>> {
  const { threshold, windowMinutes } = await lockoutConfig();
  const since = windowStart(now, windowMinutes);
  return async (email, tx) => isLocked(await countOpenFailures(SYSTEM_VIEWER, email, since, tx), threshold);
}

// 07-17 SC-12 · D-P2-7: 비밀번호 초기화 결과 — 행 DTO가 아니라 일회성 비밀이라 `…Dto`로 짓지 않고 `registerDto`도 하지 않는다
// (정보 노출표로 가릴 값이 아니라 `admin.people` 쓰기 + 상한 안 + 자기 제외로만 나간다). 키는 `tempPassword` 하나.
export type TempPasswordResult = { tempPassword: string };

export type ResetPersonPasswordDeps = {
  can: typeof defaultCan;
  withPersonLock: PersonLock;
  loadTarget: (
    viewer: Viewer,
    personId: string,
    tx: DbOrTx,
  ) => Promise<Pick<UserRow, "id" | "email" | "roleId" | "archivedAt" | "resignationDate"> | null>;
  assertCanGrantRoles: (viewer: Viewer, roleIds: (string | null)[], tx: DbOrTx) => Promise<void>;
  resetPassword: (viewer: Viewer, email: string) => Promise<{ tempPassword: string }>;
  now: () => Date;
};

// 권한 · 대상 · 자기 제외 · 상한을 본 뒤 07-09 `resetPassword`(새 임시 비밀번호 · 세션 만료 · 잠금 해소 + password_reset 기록)를 부른다.
export async function resetPersonPassword(
  viewer: Viewer,
  personId: string,
  deps?: Partial<ResetPersonPasswordDeps>,
): Promise<TempPasswordResult> {
  const canFn = deps?.can ?? defaultCan;
  if (!(await canFn(viewer, PEOPLE_MENU, "write"))) {
    throw new ForbiddenError("비밀번호 초기화 권한 없음");
  }
  const loadTarget = deps?.loadTarget ?? ((v: Viewer, id: string, tx: DbOrTx) => repoFindUserById(v, id, tx));
  const today = seoulTodayOf(deps);
  const email = await (deps?.withPersonLock ?? defaultWithPersonLock)(viewer, personId, async (tx) => {
    const target = await loadTarget(viewer, personId, tx);
    if (!target) throw new UserNotFoundError("사람 찾을 수 없음");
    if (target.archivedAt) throw new ForbiddenError("보관된 사람 · 비밀번호 초기화 없음");
    // 사용자 결정(2026-10-23): 퇴직한 사람은 초기화하지 않는다 — 260907 409와 같은 판정. 초기화는 잠금도 풀므로 D-728 우회도 막는다.
    if (isRetiredOn(target.resignationDate, today)) throw new ForbiddenError("퇴직한 사람 · 비밀번호 초기화 없음");
    if (target.id === viewer.id) throw new ForbiddenError("본인 비밀번호 초기화 없음 · 내 계정에서 변경");
    await (deps?.assertCanGrantRoles ?? assertCanGrantRoles)(viewer, [target.roleId], tx);
    return target.email;
  });
  const { tempPassword } = await (deps?.resetPassword ?? defaultResetPassword)(viewer, email);
  return { tempPassword };
}

// 04.1-03(D-96 · D-97): 입사일·퇴직일. 쓰기 권한 · 날짜 형식 · 퇴직일 ≥ 입사일(같은 날 허용)을
// 검증하고 쓴 뒤 행동 로그를 남긴다(Phase 3 사람 도메인 규약 — 쓰기 뒤 recordAction). 두 함수가
// 동시에 옛 상대값으로 검증을 통과해도 users CHECK(23514)가 막고, 같은 ValidationError가 된다(A2-02).
const HIRE_DATE_FORMAT_ERROR = "입사일 형식 오류 — YYYY-MM-DD로";
const RESIGNATION_DATE_FORMAT_ERROR = "퇴직일 형식 오류 — YYYY-MM-DD로";
const DATES_INVERTED_ERROR = "퇴직일이 입사일보다 빠름 · 날짜 확인";
const DATES_CHECK_CONSTRAINT = "users_resignation_on_or_after_hire_check";

function isCalendarDate(value: string): boolean {
  if (!EFFECTIVE_FROM_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export type EmploymentDateDeps = { can: typeof defaultCan; now: () => Date; visible: typeof defaultVisible } & TxLogDeps;

async function setEmploymentDate(
  viewer: Viewer,
  userId: string,
  field: "hire_date" | "resignation_date",
  value: string | null,
  deps?: Partial<EmploymentDateDeps>,
): Promise<void> {
  const canFn = deps?.can ?? defaultCan;
  if (!(await canFn(viewer, PEOPLE_MENU, "write"))) {
    throw new ForbiddenError(field === "hire_date" ? "입사일 변경 권한 없음" : "퇴직일 변경 권한 없음");
  }
  if (viewer.id === userId) throw new ForbiddenError(SELF_LEAVE_EDIT_ERROR);
  if (value !== null && !isCalendarDate(value)) {
    throw new ValidationError(field === "hire_date" ? HIRE_DATE_FORMAT_ERROR : RESIGNATION_DATE_FORMAT_ERROR);
  }

  const row = await repoFindUserById(viewer, userId);
  if (!row) throw new UserNotFoundError("사람 찾을 수 없음");
  const hireDate = field === "hire_date" ? value : row.hireDate;
  const resignationDate = field === "resignation_date" ? value : row.resignationDate;
  if (hireDate !== null && resignationDate !== null && resignationDate < hireDate) {
    throw new ValidationError(DATES_INVERTED_ERROR);
  }

  // 날짜는 연차 발생 일수 · 결재자 판정을 바꾼다 — 값과 행동 로그는 같은 tx(연차 조정과 같은 규칙, /review).
  const gate = await loadActionLogGate();
  // 잠금 중 노출 판정이 풀에서 따로 빌리지 않게 tx 전에 정한다(06.4-02와 같은 규칙).
  const today = seoulTodayOf(deps);
  const showNames = field === "resignation_date" ? await (deps?.visible ?? defaultVisible)(viewer, "person.value") : false;
  try {
    await withTransaction(async (tx) => {
      // 06.4(D-6411 · O3 · D-6412 · D-6404 퇴직일 진입점 · D-6415 — eng E2 · Codex B1 · 재검토 R4): 퇴직일 분기는 값과 무관하게
      // 잠금 → 재조회 → 대상 계급 상한 → (값이 있으면) 마지막 관리자 → 자리 구간(늘어난 날짜만). 퇴직일을 지우거나 늦춰 구간이
      // 늘어나는 사람은 260907 재개와 같은 자리 검사를 받는다(`O: server/src/people-rules.ts:68-78` `rejoinSeatWhy`, 문구 :75 ·
      // 재개 라우트 `people.ts:1155` 인덱스 충돌 409 `:1258-1264`). O3 사용자 확정(2026-10-11 카드): 마지막 재직 관리자에게는
      // 어떤 날짜의 퇴직일도 넣지 않는다 — 미래 날짜는 시간 경과로 0명이 되는 시한폭탄(RESEARCH Pitfall 7).
      // 07-17 독립 검토 M1: 입사일도 같은 잠금 → 재조회 → 대상 계급 상한(관리자 키는 마지막 관리자 판정이 있는 퇴직일만).
      await lockSeatKeys(viewer, { personIds: [userId], admin: field === "resignation_date" }, tx);
      // F24: 입사일은 퇴직자면 거부. 퇴직일은 재입사 경로라 막지 않는다(260907 `people.ts:1155` rejoin).
      if (field === "hire_date") await assertNotRetiredInTx(viewer, userId, today, tx);
      const fresh = await repoFindUserById(viewer, userId, tx);
      if (!fresh) throw new UserNotFoundError("사람 찾을 수 없음");
      // K-R1 사용자 확정(2026-10-11 카드 「막기」) · D-6411: 대상 계급 C가 내 상한 밖이면 날짜를 넣지도 지우지도 못한다.
      await assertCanGrantRoles(viewer, [fresh.roleId], tx);
      if (field === "resignation_date") {
        if (value !== null) await assertNotLastAdmin(viewer, { userId, asOf: today }, tx);
        if (fresh.roleId !== null) {
          // 조건 분기 없이 늘 계산 — newSeats가 늘어난 날짜만 돌려주므로 당기기 · 같은 값은 빈 결과로 잠금 · 쿼리 없이 지나간다.
          const occupied = await listOccupiedTeams(viewer, userId, today, tx);
          const seats = newSeats({
            roleBefore: fresh.roleId,
            roleAfter: fresh.roleId,
            employedBefore: fresh,
            employedAfter: { archivedAt: fresh.archivedAt, resignationDate: value },
            occupiedBefore: occupied,
            occupiedAfter: occupied,
          });
          await assertSeatsFree(viewer, { userId, roleId: fresh.roleId, seats, today, showNames }, tx);
        }
      }
      if (field === "hire_date") await repoUpdateUserHireDate(viewer, userId, value, tx);
      else await repoUpdateUserResignationDate(viewer, userId, value, tx);
      await recordActionInTx(
        viewer,
        { actionType: "document_update", entity: "user", entityId: userId, detail: { field } },
        tx,
        gate,
        { appendActionLog: deps?.appendActionLog },
      );
    });
  } catch (error) {
    if (isCheckViolation(error, DATES_CHECK_CONSTRAINT)) throw new ValidationError(DATES_INVERTED_ERROR);
    throw error;
  }
}

export async function setHireDate(
  viewer: Viewer,
  userId: string,
  hireDate: string | null,
  deps?: Partial<EmploymentDateDeps>,
): Promise<void> {
  await setEmploymentDate(viewer, userId, "hire_date", hireDate, deps);
}

export async function setResignationDate(
  viewer: Viewer,
  userId: string,
  resignationDate: string | null,
  deps?: Partial<EmploymentDateDeps>,
): Promise<void> {
  await setEmploymentDate(viewer, userId, "resignation_date", resignationDate, deps);
}
