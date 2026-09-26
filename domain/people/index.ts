import type { Viewer } from "@/domain/viewer";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { can as defaultCan } from "@/domain/permissions/can";
import { scopeFor } from "@/domain/permissions/scope-for";
import { project, type DtoSpec, type ProjectDeps } from "@/domain/permissions/project";
import { visible as defaultVisible } from "@/domain/permissions/visible";
import { recordAction as defaultRecordAction } from "@/domain/action-log/record";
import { registerDto } from "@/domain/permissions/dto-registry";
import { createAccount as defaultCreateAccount } from "@/domain/auth/accounts";
import { archive as defaultArchive } from "@/domain/archive";
import { revokeAllSessions as defaultRevokeAllSessions } from "@/domain/auth/password";
import { findRoleById as defaultFindRoleById, findRolesByIds as defaultFindRolesByIds } from "@/repositories/roles";
import { findTeamById as defaultFindTeamById } from "@/repositories/teams";
import { UserFacingError } from "@/lib/actions/user-facing-error";
import { isCheckViolation } from "@/lib/pg-errors";
import {
  listUsers as repoListUsers,
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

const PEOPLE_MENU = "admin.people";
const EFFECTIVE_FROM_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
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
};

type PersonSource = UserRow & { roleName: string | null; currentTeamId: string | null; currentTeamName: string | null };

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
  deps?: Partial<ProjectDeps>,
): Promise<PersonDto> {
  const source: PersonSource = {
    ...row,
    roleName,
    currentTeamId: team?.id ?? null,
    currentTeamName: team?.name ?? null,
  };
  return (await project(viewer, source, PERSON_DTO_SPEC, deps)) as PersonDto;
}

async function toPersonDto(viewer: Viewer, row: UserRow): Promise<PersonDto> {
  const [team, role] = await Promise.all([
    defaultTeamAtDate(viewer, row.id, todayIsoDate()),
    row.roleId ? defaultFindRoleById(viewer, row.roleId) : Promise.resolve(null),
  ]);
  return projectPerson(viewer, row, team, role?.name ?? null);
}

// 이슈 #56: 사람마다 팀·계급·노출표를 따로 조회하던 N+1을 묶음 조회 + 호출
// 한정 메모로 바꿨다.
// 사람 목록 — 행 필터 서술자를 따르고 보관된 사람은 보관함 권한 없이는
// 보이지 않는다(scopeFor(viewer, "user")가 Phase 1 자리표시를 대신한다).
export async function listPeople(viewer: Viewer): Promise<PersonDto[]> {
  const scope = await scopeFor(viewer, "user");
  const rows = await repoListUsers(viewer, { scope, includeArchived: scope.includeArchived });

  // viewer가 호출 동안 고정이라 infoItem만 키로 쓴다. 캐시는 이 함수 호출
  // 안에만 있고 모듈 전역에 두지 않는다(T-q56-01) — 다른 viewer·계급의
  // 판정이 섞이거나 노출표 변경 뒤 낡은 판정이 쓰이는 것을 막는다.
  const visibleCache = new Map<string, Promise<boolean>>();
  const memoizedVisible = (v: Viewer, infoItem: string): Promise<boolean> => {
    let cached = visibleCache.get(infoItem);
    if (!cached) {
      cached = defaultVisible(v, infoItem);
      visibleCache.set(infoItem, cached);
    }
    return cached;
  };

  const today = todayIsoDate();
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
        { visible: memoizedVisible },
      ),
    ),
  );
}

export async function getPerson(
  viewer: Viewer,
  userId: string,
): Promise<{ person: PersonDto; assignments: TeamAssignmentDto[] } | null> {
  const row = await repoFindUserById(viewer, userId);
  if (!row) return null;

  const person = await toPersonDto(viewer, row);
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
};

// 사람 등록 — 계정 발급과 초기 비밀번호 생성을 같은 흐름에서 부른다.
//
// 원자성의 실제 형태는 트랜잭션이 아니라 "부분 상태 없음"이다(better-auth
// internalAdapter와 Drizzle이 같은 연결을 쓰지 않는다). 그래서 (a) 입력 때문에
// 실패할 수 있는 조건은 전부 계정 생성 전에 거부하고(이메일 중복·계급/팀
// 실재와 보관 여부·발령일 형식), (b) 남는 인프라 오류 창에서만 방금 만든
// 계정을 보상 보관한다.
export async function registerPerson(
  viewer: Viewer,
  input: RegisterPersonInput,
  deps?: Partial<RegisterPersonDeps>,
): Promise<{ userId: string; tempPassword: string }> {
  const canFn = deps?.can ?? defaultCan;
  if (!(await canFn(viewer, PEOPLE_MENU, "write"))) {
    throw new ForbiddenError("사람 등록 권한이 없습니다.");
  }

  const findRoleById = deps?.findRoleById ?? defaultFindRoleById;
  const role = await findRoleById(viewer, input.roleId);
  if (!role || role.archivedAt) {
    throw new ValidationError(`존재하지 않거나 보관된 계급입니다: ${input.roleId}`);
  }

  if (input.teamId) {
    if (!input.effectiveFrom || !EFFECTIVE_FROM_PATTERN.test(input.effectiveFrom)) {
      throw new ValidationError("발령일 형식이 올바르지 않습니다 — YYYY-MM-DD로 적어 주세요.");
    }
    const findTeamById = deps?.findTeamById ?? defaultFindTeamById;
    const team = await findTeamById(viewer, input.teamId);
    if (!team || team.archivedAt) {
      throw new ValidationError(`존재하지 않거나 보관된 팀입니다: ${input.teamId}`);
    }
  }

  if (input.hireDate !== undefined && !isCalendarDate(input.hireDate)) {
    throw new ValidationError(HIRE_DATE_FORMAT_ERROR);
  }

  const createAccount = deps?.createAccount ?? defaultCreateAccount;
  const { userId, tempPassword } = await createAccount(viewer, {
    email: input.email,
    name: input.name,
    roleId: input.roleId,
  });

  if (input.teamId && input.effectiveFrom) {
    const assignTeam = deps?.assignTeam ?? defaultAssignTeam;
    try {
      await assignTeam(viewer, { userId, teamId: input.teamId, effectiveFrom: input.effectiveFrom });
    } catch {
      // (b) 잔여 창 — 인프라 오류로 발령이 실패하면 방금 만든 계정을 보상
      // 보관한다. 관리자의 보관함 권한과 무관하게 실행되도록 SYSTEM_VIEWER로
      // 부른다. 초기 비밀번호는 반환되지 않으므로 그 계정으로 로그인할 수
      // 있는 사람이 없다.
      const archive = deps?.archive ?? defaultArchive;
      await archive(SYSTEM_VIEWER, "user", userId, {
        recordAction: async (v, entry) =>
          (deps?.recordAction ?? defaultRecordAction)(v, {
            ...entry,
            detail: { reason: "register_person_rollback", requestedBy: viewer.id },
          }),
      });
      throw new UserFacingError(
        "계정 발급은 됐으나 발령이 실패해 보관함으로 보냈습니다 · 보관함에서 복원한 뒤 사람 상세에서 발령을 추가하세요",
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
        recordAction: async (v, entry) =>
          (deps?.recordAction ?? defaultRecordAction)(v, {
            ...entry,
            detail: { reason: "register_person_rollback", requestedBy: viewer.id },
          }),
      });
      throw new UserFacingError(
        "계정 발급은 됐으나 입사일 저장이 실패해 보관함으로 보냈습니다 · 보관함에서 복원한 뒤 사람 상세에서 입사일을 넣으세요",
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
    throw new ForbiddenError("계급 변경 권한이 없습니다.");
  }

  if (viewer.id === userId) {
    throw new SelfRoleChangeError("자기 자신의 계급은 이 화면에서 바꿀 수 없습니다.");
  }

  // registerPerson과 같은 검사를 여기에도 둔다(T-03-30). 외래키는 없는
  // 식별자만 막고 보관된 계급은 통과시키는데, findPermission이
  // roles.archived_at을 보지 않으므로 은퇴한 계급의 권한 행이 사용자
  // 단위로 되살아난다.
  const findRoleById = deps?.findRoleById ?? defaultFindRoleById;
  const role = await findRoleById(viewer, roleId);
  if (!role || role.archivedAt) {
    throw new ValidationError(`존재하지 않거나 보관된 계급입니다: ${roleId}`);
  }

  await repoUpdateUserRole(viewer, userId, roleId);

  const recordAction = deps?.recordAction ?? defaultRecordAction;
  await recordAction(viewer, { actionType: "permission_change", entity: "user", entityId: userId });
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

// 04.1-03(D-96 · D-97): 입사일·퇴직일. 쓰기 권한 · 날짜 형식 · 퇴직일 ≥ 입사일(같은 날 허용)을
// 검증하고 쓴 뒤 행동 로그를 남긴다(Phase 3 사람 도메인 규약 — 쓰기 뒤 recordAction). 두 함수가
// 동시에 옛 상대값으로 검증을 통과해도 users CHECK(23514)가 막고, 같은 ValidationError가 된다(A2-02).
const HIRE_DATE_FORMAT_ERROR = "입사일 형식이 올바르지 않습니다 — YYYY-MM-DD로 적어 주세요.";
const RESIGNATION_DATE_FORMAT_ERROR = "퇴직일 형식이 올바르지 않습니다 — YYYY-MM-DD로 적어 주세요.";
const DATES_INVERTED_ERROR = "퇴직일이 입사일보다 빠름 · 날짜 확인";
const DATES_CHECK_CONSTRAINT = "users_resignation_on_or_after_hire_check";

function isCalendarDate(value: string): boolean {
  if (!EFFECTIVE_FROM_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export type EmploymentDateDeps = {
  can: typeof defaultCan;
  recordAction: typeof defaultRecordAction;
};

async function setEmploymentDate(
  viewer: Viewer,
  userId: string,
  field: "hire_date" | "resignation_date",
  value: string | null,
  deps?: Partial<EmploymentDateDeps>,
): Promise<void> {
  const canFn = deps?.can ?? defaultCan;
  if (!(await canFn(viewer, PEOPLE_MENU, "write"))) {
    throw new ForbiddenError(field === "hire_date" ? "입사일을 바꿀 권한이 없습니다." : "퇴직일을 바꿀 권한이 없습니다.");
  }
  if (value !== null && !isCalendarDate(value)) {
    throw new ValidationError(field === "hire_date" ? HIRE_DATE_FORMAT_ERROR : RESIGNATION_DATE_FORMAT_ERROR);
  }

  const row = await repoFindUserById(viewer, userId);
  if (!row) throw new UserNotFoundError("사람을 찾을 수 없습니다.");
  const hireDate = field === "hire_date" ? value : row.hireDate;
  const resignationDate = field === "resignation_date" ? value : row.resignationDate;
  if (hireDate !== null && resignationDate !== null && resignationDate < hireDate) {
    throw new ValidationError(DATES_INVERTED_ERROR);
  }

  try {
    if (field === "hire_date") await repoUpdateUserHireDate(viewer, userId, value);
    else await repoUpdateUserResignationDate(viewer, userId, value);
  } catch (error) {
    if (isCheckViolation(error, DATES_CHECK_CONSTRAINT)) throw new ValidationError(DATES_INVERTED_ERROR);
    throw error;
  }

  const recordAction = deps?.recordAction ?? defaultRecordAction;
  await recordAction(viewer, { actionType: "document_update", entity: "user", entityId: userId, detail: { field } });
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
