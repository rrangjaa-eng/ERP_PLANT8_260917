import type { Viewer } from "@/domain/viewer";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { can as defaultCan } from "@/domain/permissions/can";
import { scopeFor } from "@/domain/permissions/scope-for";
import { project, type DtoSpec } from "@/domain/permissions/project";
import { recordAction as defaultRecordAction } from "@/domain/action-log/record";
import { registerDto } from "@/domain/permissions/dto-registry";
import { createAccount as defaultCreateAccount } from "@/domain/auth/accounts";
import { archive as defaultArchive } from "@/domain/archive";
import { findRoleById as defaultFindRoleById } from "@/repositories/roles";
import { findTeamById as defaultFindTeamById } from "@/repositories/teams";
import { UserFacingError } from "@/lib/actions/user-facing-error";
import {
  listUsers as repoListUsers,
  findUserById as repoFindUserById,
  updateUserRole as repoUpdateUserRole,
  type UserRow,
} from "@/repositories/users";
import {
  teamAtDate as defaultTeamAtDate,
  assignTeam as defaultAssignTeam,
  listAssignments as defaultListAssignments,
  type TeamAssignmentDto,
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

async function toPersonDto(viewer: Viewer, row: UserRow): Promise<PersonDto> {
  const [team, role] = await Promise.all([
    defaultTeamAtDate(viewer, row.id, todayIsoDate()),
    row.roleId ? defaultFindRoleById(viewer, row.roleId) : Promise.resolve(null),
  ]);
  const source: PersonSource = {
    ...row,
    roleName: role?.name ?? null,
    currentTeamId: team?.id ?? null,
    currentTeamName: team?.name ?? null,
  };
  return (await project(viewer, source, PERSON_DTO_SPEC)) as PersonDto;
}

// 사람 목록 — 행 필터 서술자를 따르고 보관된 사람은 보관함 권한 없이는
// 보이지 않는다(scopeFor(viewer, "user")가 Phase 1 자리표시를 대신한다).
export async function listPeople(viewer: Viewer): Promise<PersonDto[]> {
  const scope = await scopeFor(viewer, "user");
  const rows = await repoListUsers(viewer, { scope, includeArchived: scope.includeArchived });
  return Promise.all(rows.map((row) => toPersonDto(viewer, row)));
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
};

export type RegisterPersonDeps = {
  can: typeof defaultCan;
  createAccount: typeof defaultCreateAccount;
  assignTeam: typeof defaultAssignTeam;
  archive: typeof defaultArchive;
  findRoleById: typeof defaultFindRoleById;
  findTeamById: typeof defaultFindTeamById;
  recordAction: typeof defaultRecordAction;
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

  const recordAction = deps?.recordAction ?? defaultRecordAction;
  await recordAction(viewer, { actionType: "document_create", entity: "user", entityId: userId });

  return { userId, tempPassword };
}

export type ChangePersonRoleDeps = { can: typeof defaultCan; recordAction: typeof defaultRecordAction };

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

  await repoUpdateUserRole(viewer, userId, roleId);

  const recordAction = deps?.recordAction ?? defaultRecordAction;
  await recordAction(viewer, { actionType: "permission_change", entity: "user", entityId: userId });
}
