import type { Viewer } from "@/domain/viewer";
import { can as defaultCan } from "@/domain/permissions/can";
import { scopeFor, type Scope } from "@/domain/permissions/scope-for";
import type { RoleWorkScope } from "@/domain/permissions/roles";
import { recordAction as defaultRecordAction } from "@/domain/action-log/record";
import { gate, GateBlockedError } from "@/domain/rules/gate";
import "@/domain/rules/register";
import { denyWrite } from "@/domain/rules/deny-write";
import { ALLOWED_TRANSITIONS, PROJECT_STATUSES, type ProjectStatus } from "@/domain/projects/status-transitions";
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
export class ForbiddenError extends UserFacingError {}

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

// ── 상태 코드표 목록(D-93 · S7·S14 · A-10) ────────────────────────────────
// references.ts 선례 — "projects" 보기 하나로 게이트하고 리포지토리를 행 범위
// all로 부른다(코드표 관리 권한이 없는 팀장·대표에게도 온다). 관리자가 비활성으로
// 돌린 값의 라벨도 찾고, 관리자가 더한 값은 싣지 않는다(PROJECT_STATUSES만).
export type ProjectStatusCatalogEntry = { value: ProjectStatus; label: string; description: string | null };

type CatalogDeps = { listCodeItems: typeof repoListCodeItems };

async function readStatusCatalog(viewer: Viewer, deps?: Partial<CatalogDeps>): Promise<ProjectStatusCatalogEntry[]> {
  const listCodeItems = deps?.listCodeItems ?? repoListCodeItems;
  const rows = await listCodeItems(viewer, {
    tableKey: STATUS_TABLE_KEY,
    scope: { rows: "all", includeArchived: false },
    includeInactive: true,
  });
  const known: readonly string[] = PROJECT_STATUSES;
  return rows
    .filter((row) => known.includes(row.value))
    .map((row) => ({ value: row.value as ProjectStatus, label: row.label, description: row.description }));
}

export async function listProjectStatusCatalog(
  viewer: Viewer,
  deps?: Partial<CatalogDeps & { can: typeof defaultCan }>,
): Promise<ProjectStatusCatalogEntry[]> {
  const canFn = deps?.can ?? defaultCan;
  if (!(await canFn(viewer, "projects", "view"))) {
    throw new ForbiddenError("프로젝트 조회 권한이 없습니다.");
  }
  return readStatusCatalog(viewer, deps);
}

async function loadStatusLabels(viewer: Viewer): Promise<Record<string, string>> {
  const catalog = await readStatusCatalog(viewer);
  return Object.fromEntries(catalog.map((entry) => [entry.value, entry.label]));
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
  const [rowScope, actor, labels] = await Promise.all([
    scopeFor(viewer, PROJECT_ENTITY, { can: deps?.can ?? defaultCan }),
    loadActorFacts(viewer, deps),
    loadStatusLabels(viewer),
  ]);
  return { rowScope, ...actor, labels };
}

// ── 판정(게이트 두 규칙) ─────────────────────────────────────────────────────
// 전환 함수·갈 곳 목록이 같은 판정을 쓴다. 상태 이름 비교는 규칙 안에만 있다.
export type ActorFacts = Pick<StatusChangeFacts, "menus" | "teamScope">;

export type TransitionDecision =
  | { allowed: true; fillEndDateFromStart: boolean }
  | { allowed: false; rule: string; reason: string };

export async function evaluateTransition(
  project: { status: string; teamId: string; startDate: string | null },
  to: ProjectStatus,
  facts: ActorFacts,
): Promise<TransitionDecision> {
  const transition = await gate(project, TRANSITION_RULE, {
    from: project.status,
    to,
    actorMenus: facts.menus,
    actorCoversTeam: coversProjectTeam(facts.teamScope, project.teamId),
  });
  if (!transition.allowed) return { allowed: false, rule: TRANSITION_RULE, reason: transition.reason };

  const period = await gate(project, START_DATE_RULE, { to, startDate: project.startDate });
  if (!period.allowed) return { allowed: false, rule: START_DATE_RULE, reason: period.reason };

  // 목적지가 기간을 요구하는지(D-82 — 진행)는 규칙이 정한다: 시작일 없이 물어 막히는
  // 목적지면 빈 종료일을 같은 UPDATE에서 시작일로 채운다.
  const needsPeriod = !(await gate(project, START_DATE_RULE, { to, startDate: null })).allowed;
  return { allowed: true, fillEndDateFromStart: needsPeriod };
}

// ── 갈 곳 목록(S3·S7 · A-09) ────────────────────────────────────────────────
// 그 사람이 지금 상태에서 갈 수 있는 곳과 서버가 판정한 막힘 이유(시작일 없음).
// 권한·팀 범위가 없는 목적지는 싣지 않는다 — 비면 화면이 「상태 바꾸기」를 그리지 않는다.
export type StatusDestination = { to: ProjectStatus; blockedReason: string | null };

export async function statusDestinations(
  viewer: Viewer,
  project: { status: string; teamId: string; startDate: string | null },
  deps?: Partial<StatusChangeFactDeps & { facts: ActorFacts }>,
): Promise<StatusDestination[]> {
  const facts = deps?.facts ?? (await loadActorFacts(viewer, deps));
  const destinations: StatusDestination[] = [];
  for (const transition of ALLOWED_TRANSITIONS) {
    if (transition.from !== project.status) continue;
    const decision = await evaluateTransition(project, transition.to, facts);
    if (decision.allowed) destinations.push({ to: transition.to, blockedReason: null });
    else if (decision.rule === START_DATE_RULE) destinations.push({ to: transition.to, blockedReason: decision.reason });
  }
  return destinations;
}

async function loadActorFacts(viewer: Viewer, deps?: Partial<StatusChangeFactDeps>): Promise<ActorFacts> {
  const canFn = deps?.can ?? defaultCan;
  const now = deps?.now ?? (() => new Date());
  const [status, complete, teamScope] = await Promise.all([
    canFn(viewer, "projects.status", "write"),
    canFn(viewer, "projects.complete", "write"),
    loadActorTeamScope(viewer, { todayKst: kstToday(now()) }, deps),
  ]);
  return { menus: { status, complete }, teamScope };
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

    // 권한(메뉴·팀 범위)을 from 불일치보다 먼저 판정한다 — 불일치 문구에는 지금
    // 상태가 실려, 권한 없는 사람이 틀린 from으로 상태를 알아낼 수 있다(04-20 리뷰 M1).
    const authz = await evaluateTransition({ ...row, status: input.from }, input.to, facts);
    if (!authz.allowed && authz.rule === TRANSITION_RULE) {
      denyWrite(viewer, authz.rule, ids, new GateBlockedError(authz.reason));
    }

    const statusChanged = () =>
      new StatusChangedError(statusChangedMessage(facts.labels[row.status] ?? row.status, "새로 고침"), row.status);
    if (row.status !== input.from) denyWrite(viewer, "project.status-current", ids, statusChanged());

    const decision = await evaluateTransition(row, input.to, facts);
    if (!decision.allowed) denyWrite(viewer, decision.rule, ids, new GateBlockedError(decision.reason));

    const updated = await updateProjectStatusIfCurrent(
      viewer,
      projectId,
      { expectedStatus: input.from, status: input.to, fillEndDateFromStart: decision.fillEndDateFromStart },
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
