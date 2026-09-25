import type { Viewer } from "@/domain/viewer";
import { can as defaultCan } from "@/domain/permissions/can";
import { scopeFor, type Scope } from "@/domain/permissions/scope-for";
import type { RoleWorkScope } from "@/domain/permissions/roles";
import { recordAction as defaultRecordAction } from "@/domain/action-log/record";
import { gate, GateBlockedError } from "@/domain/rules/gate";
import "@/domain/rules/register";
import { denyWrite } from "@/domain/rules/deny-write";
import type { ProjectStatus } from "@/domain/projects/status-transitions";
import { withTransaction } from "@/lib/db-transaction";
import { kstToday } from "@/lib/kst-date";
import { UserFacingError } from "@/lib/actions/user-facing-error";
import { findRoleById as defaultFindRoleById } from "@/repositories/roles";
import { findMembershipAtDate as defaultFindMembershipAtDate } from "@/repositories/team-memberships";
import { lockProjectForWrite, updateProjectStatusIfCurrent } from "@/repositories/projects";
import { listCodeItems as repoListCodeItems } from "@/repositories/code-tables";
import type { DbOrTx } from "@/repositories/document-counters";

// 04-20(PROJ-04 · D-44·D-46·D-75·D-79·D-82) — 사람의 상태 전환 넷의 서버 쪽.
// 상태 이름 비교는 전이표(status-transitions.ts)와 게이트 규칙(rules/register.ts)
// 안에만 있다 — 이 파일은 사실을 모아 규칙에 넘기고 결과를 따른다. 호출자를
// 구분하지 않는다: Phase 5는 결재 승인 경로에서 같은 함수를 결재 트랜잭션
// (deps.tx)과 미리 읽은 사실(deps.facts)로 부른다.

const PROJECT_ENTITY = "project";
const STATUS_TABLE_KEY = "project_status";
const TRANSITION_RULE = "project.transition";
const START_DATE_RULE = "project.start-date-required";

export class ProjectNotFoundError extends UserFacingError {}

// 잠근 행의 상태가 화면이 본 상태(from)와 다르다 — 지금 상태 값을 싣는다.
export class StatusChangedError extends UserFacingError {
  constructor(
    message: string,
    readonly status: string,
  ) {
    super(message);
  }
}

// DR-6: 「상태가 {라벨}{으로|로} 바뀜 · {꼬리}」 — 04-22의 저장 거부가 「전부 거부」
// 꼬리로 같은 함수를 쓴다. 조사는 라벨 마지막 글자의 받침으로 고른다(받침 없음·
// ㄹ받침 → 로, 그 밖 → 으로).
export function statusChangedMessage(label: string, tail: "새로 고침" | "전부 거부"): string {
  const last = label.charCodeAt(label.length - 1);
  const HANGUL_START = 0xac00;
  const HANGUL_END = 0xd7a3;
  let particle = "로";
  if (last >= HANGUL_START && last <= HANGUL_END) {
    const final = (last - HANGUL_START) % 28;
    const RIEUL = 8;
    if (final !== 0 && final !== RIEUL) particle = "으로";
  }
  return `상태가 ${label}${particle} 바뀜 · ${tail}`;
}

// ── 업무 범위(사용자 D11·D20 · ENG-D2) ──────────────────────────────────────
// 소속·업무 범위는 권한 판정 사실이라 정보 노출 투영(DTO)을 거치지 않고
// 리포지토리로 직접 읽는다 — 관리자가 「팀 정보」 노출을 꺼도 권리는 그대로다.
export type ActorTeamScope = { workScope: RoleWorkScope; teamId: string | null };

export type TeamScopeDeps = {
  findRoleById: typeof defaultFindRoleById;
  findMembershipAtDate: typeof defaultFindMembershipAtDate;
};

export async function loadActorTeamScope(
  viewer: Viewer,
  opts: { todayKst: string },
  deps?: Partial<TeamScopeDeps>,
): Promise<ActorTeamScope> {
  if (!viewer.roleId) return { workScope: "team", teamId: null };
  const findRoleById = deps?.findRoleById ?? defaultFindRoleById;
  const role = await findRoleById(viewer, viewer.roleId);
  if (role?.workScope === "company") return { workScope: "company", teamId: null };

  // 발령 이력이 없으면 teamId null — 임의의 기본 팀으로 떨어지지 않는다(ARCHITECTURE §4-3).
  const findMembershipAtDate = deps?.findMembershipAtDate ?? defaultFindMembershipAtDate;
  const membership = await findMembershipAtDate(viewer, viewer.id, opts.todayKst);
  return { workScope: "team", teamId: membership?.teamId ?? null };
}

export function coversProjectTeam(scope: ActorTeamScope, projectTeamId: string): boolean {
  if (scope.workScope === "company") return true;
  return scope.teamId !== null && scope.teamId === projectTeamId;
}

// 트랜잭션 밖에서 부르는 곳(화면·갈 곳 목록·04-22 기간 수정 권리)용 합성.
export async function actorCoversProjectTeam(
  viewer: Viewer,
  project: { teamId: string },
  opts: { todayKst: string },
  deps?: Partial<TeamScopeDeps>,
): Promise<boolean> {
  return coversProjectTeam(await loadActorTeamScope(viewer, opts, deps), project.teamId);
}

// ── 트랜잭션 전 사실(ENG-D3 ① — ARCHITECTURE §4-8) ─────────────────────────
export type StatusChangeFacts = {
  rowScope: Scope;
  menus: { status: boolean; complete: boolean };
  teamScope: ActorTeamScope;
  // 코드표 라벨(관리자가 바꿀 수 있다) — 「상태가 … 바뀜」 문구용. 비활성 값 포함.
  labels: Record<string, string>;
};

async function loadStatusLabels(viewer: Viewer): Promise<Record<string, string>> {
  const rows = await repoListCodeItems(viewer, {
    tableKey: STATUS_TABLE_KEY,
    scope: { rows: "all", includeArchived: false },
    includeInactive: true,
  });
  return Object.fromEntries(rows.map((row) => [row.value, row.label]));
}

export type StatusChangeFactDeps = TeamScopeDeps & {
  can: typeof defaultCan;
  now: () => Date;
};

// Phase 5 결재 호출자는 자기 트랜잭션을 열기 전에 이 함수로 사실을 읽어
// deps.facts로 넘긴다 — 잠근 트랜잭션 안에서 풀을 부르지 않기 위해서다.
export async function loadStatusChangeFacts(
  viewer: Viewer,
  deps?: Partial<StatusChangeFactDeps>,
): Promise<StatusChangeFacts> {
  const canFn = deps?.can ?? defaultCan;
  const now = deps?.now ?? (() => new Date());
  const [rowScope, status, complete, teamScope, labels] = await Promise.all([
    scopeFor(viewer, PROJECT_ENTITY, { can: canFn }),
    canFn(viewer, "projects.status", "write"),
    canFn(viewer, "projects.complete", "write"),
    loadActorTeamScope(viewer, { todayKst: kstToday(now()) }, deps),
    loadStatusLabels(viewer),
  ]);
  return { rowScope, menus: { status, complete }, teamScope, labels };
}

// ── 전환 ───────────────────────────────────────────────────────────────────
export type ChangeProjectStatusDeps = StatusChangeFactDeps & {
  // 바깥 트랜잭션(Phase 5 결재) — 있으면 그 안에서 돈다.
  tx: DbOrTx;
  facts: StatusChangeFacts;
  // 테스트 전용 주입 지점 — 잠금 획득 직후 호출(경합 재현, sleep 없이).
  afterLock: () => Promise<void>;
  recordAction: typeof defaultRecordAction;
};

export async function changeProjectStatus(
  viewer: Viewer,
  projectId: string,
  input: { from: ProjectStatus; to: ProjectStatus },
  deps?: Partial<ChangeProjectStatusDeps>,
): Promise<void> {
  const ids = { projectId, from: input.from, to: input.to };
  const facts = deps?.facts ?? (await loadStatusChangeFacts(viewer, deps));
  if (facts.rowScope.rows === "none") {
    denyWrite(viewer, "projects.view", ids, new ProjectNotFoundError("존재하지 않는 프로젝트입니다."));
  }

  const recordAction = deps?.recordAction ?? defaultRecordAction;

  const run = async (tx: DbOrTx): Promise<void> => {
    const row = await lockProjectForWrite(viewer, projectId, tx);
    if (!row) throw new ProjectNotFoundError("존재하지 않는 프로젝트입니다.");
    if (row.archivedAt !== null && !facts.rowScope.includeArchived) {
      denyWrite(viewer, "projects.view", ids, new ProjectNotFoundError("존재하지 않는 프로젝트입니다."));
    }
    await deps?.afterLock?.();

    const statusChanged = () =>
      new StatusChangedError(statusChangedMessage(facts.labels[row.status] ?? row.status, "새로 고침"), row.status);
    if (row.status !== input.from) denyWrite(viewer, "project.status-current", ids, statusChanged());

    const transition = await gate(row, TRANSITION_RULE, {
      from: row.status,
      to: input.to,
      actorMenus: facts.menus,
      actorCoversTeam: coversProjectTeam(facts.teamScope, row.teamId),
    });
    if (!transition.allowed) denyWrite(viewer, TRANSITION_RULE, ids, new GateBlockedError(transition.reason));

    const period = await gate(row, START_DATE_RULE, { to: input.to, startDate: row.startDate });
    if (!period.allowed) denyWrite(viewer, START_DATE_RULE, ids, new GateBlockedError(period.reason));

    // 목적지가 기간을 요구하는지(D-82 — 진행)는 규칙이 정한다: 시작일 없이 물어 막히는
    // 목적지면 빈 종료일을 같은 UPDATE에서 시작일로 채운다.
    const needsPeriod = !(await gate(row, START_DATE_RULE, { to: input.to, startDate: null })).allowed;
    const updated = await updateProjectStatusIfCurrent(
      viewer,
      projectId,
      { expectedStatus: input.from, status: input.to, fillEndDateFromStart: needsPeriod },
      tx,
    );
    if (!updated) denyWrite(viewer, "project.status-current", ids, statusChanged());

    await recordAction(
      viewer,
      {
        actionType: "status_change",
        entity: PROJECT_ENTITY,
        entityId: projectId,
        detail: { from: input.from, to: input.to, trigger: "manual" },
      },
      { tx },
    );
  };

  if (deps?.tx) await run(deps.tx);
  else await withTransaction(run);
}
