import type { Viewer } from "@/domain/viewer";
import { UserFacingError } from "@/lib/actions/user-facing-error";
import { withTransaction } from "@/lib/db-transaction";
import { can, ForbiddenError } from "@/domain/permissions/can";
import { projectRowScope } from "@/domain/projects/visibility";
import { changeProjectStatus, loadStatusChangeFacts, ProjectNotFoundError, teamScopeForProject } from "@/domain/projects/status";
import {
  ApprovalConflictError,
  NotCurrentHolderError,
  prepareReopen,
  reopenApprovedDocument,
  REJECT_REASON_EMPTY_MESSAGE,
  REJECT_REASON_MAX,
  REJECT_REASON_TOO_LONG_MESSAGE,
  type ReopenAuthority,
} from "@/domain/approvals";
import { SETTLEMENT_DOCUMENT_KIND } from "@/domain/settlements";
import { findApprovalGraphByDocument } from "@/repositories/approvals";
import { findProjectInScope } from "@/repositories/projects";
import { findSettlementByProjectId } from "@/repositories/settlement-approvals";

// 07.2-19(PU2 · D-7214~7216 · 07.2 D-7302 카드 11 「다시 결재 받기」): 완료 프로젝트를 사유와 함께 정산으로 되돌린다. 승인된 정산 결재는
// 같은 문서에서 초안(draft)으로 물리고, 담당 PM이 같은 문서를 다시 올려 결재선을 처음부터 다시 탄다(submitSettlement → resubmitDocument).
// 권리 = projects.reopen 쓰기 + 쓰기 범위의 프로젝트 보임(계급 이름 판정 없음). 되돌릴 곳은 정산 하나. 사유는 끌 수 없는 document_reopen
// 로그에만(프로젝트 행 흔적 칸 0 — 마이그레이션 0). 260907(`POST /reopen` · 진행으로 · 사유 선택)과 다르게 정했다(DECISIONS 07.2-05).

const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NOT_FOUND = "존재하지 않는 프로젝트";
// 동시 두 번째 · 화면이 본 뒤 바뀐 상태 — 엔진의 충돌 문구(누가 언제 승인함 · 지금 담당이 아님)를 이 한 문구로 바꾼다(eng D-19 P2).
export const REOPEN_CONFLICT_MESSAGE = "다른 사람이 먼저 바꿈 · 새로 고침";

export class ReopenReasonError extends UserFacingError {}
export class ReopenConflictError extends UserFacingError {
  constructor() {
    super(REOPEN_CONFLICT_MESSAGE);
  }
}

// 프로젝트 전이(trigger reopen)의 표지 — 이 모듈 안 비공개 함수만 만든다(타입만 export · SettlementApprovalAuthority 꼴).
declare const brand: unique symbol;
export type ProjectReopenAuthority = { projectId: string } & { readonly [brand]: true };

// 트랜잭션 전 판정(보임 · projects.reopen · 사유 · 상태 · version)을 모두 지난 뒤에만 부른다. export하지 않는다.
function grantReopen(projectId: string, documentId: string): { project: ProjectReopenAuthority; document: ReopenAuthority } {
  return {
    project: { projectId } as ProjectReopenAuthority,
    document: { kind: SETTLEMENT_DOCUMENT_KIND, documentId } as ReopenAuthority,
  };
}

function validReason(raw: string): string {
  const reason = raw.trim();
  if (reason.length === 0) throw new ReopenReasonError(REJECT_REASON_EMPTY_MESSAGE);
  if (reason.length > REJECT_REASON_MAX) throw new ReopenReasonError(REJECT_REASON_TOO_LONG_MESSAGE);
  return reason;
}

export async function reopenCompletedProject(
  viewer: Viewer,
  input: { projectId: string; reason: string; expectedInstanceVersion: number },
): Promise<{ number: string }> {
  if (!UUID_SHAPE.test(input.projectId)) throw new ProjectNotFoundError(NOT_FOUND);
  // 쓰기 범위(원래 범위 — 07.3 자금 확대 없음) · 보관 제외. 보이지 않으면 권한보다 먼저 없음(존재를 드러내지 않는다).
  const projectRow = await findProjectInScope(viewer, await projectRowScope(viewer, undefined, "write"), input.projectId);
  if (!projectRow || projectRow.archivedAt !== null) throw new ProjectNotFoundError(NOT_FOUND);
  if (!(await can(viewer, "projects.reopen", "write"))) throw new ForbiddenError("완료 되돌리기 권한 없음");
  const reason = validReason(input.reason);
  if (projectRow.status !== "completed") throw new ReopenConflictError();
  const doc = await findSettlementByProjectId(viewer, input.projectId);
  const graph = doc ? await findApprovalGraphByDocument(viewer, { documentKind: SETTLEMENT_DOCUMENT_KIND, documentId: doc.id }) : null;
  if (!doc || !graph || graph.instance.status !== "approved" || graph.instance.version !== input.expectedInstanceVersion) throw new ReopenConflictError();

  // 트랜잭션 전 읽기 — 상태 전이 사실(메뉴 · 업무 범위를 참여 뺀 보임으로 좁힘)과 엔진 사전 읽기(스냅숏 · 로그 켜짐). 잠근 tx 안에서 풀을 부르지 않는다.
  const facts = await loadStatusChangeFacts(viewer);
  const teamScope = await teamScopeForProject(viewer, facts.teamScope, facts.rowScope, input.projectId);
  const prepared = await prepareReopen(viewer);
  const authority = grantReopen(input.projectId, doc.id);

  try {
    await withTransaction(async (tx) => {
      // 인스턴스 먼저(상태 UPDATE가 행을 잡는다) → 프로젝트(loadProjectForGate 잠금) — 승인 경로와 같은 순서(T-05-1106).
      await reopenApprovedDocument(
        viewer,
        { instanceId: graph.instance.id, expectedVersion: input.expectedInstanceVersion, reason, authority: authority.document },
        tx,
        prepared,
      );
      await changeProjectStatus(
        viewer,
        input.projectId,
        { from: "completed", to: "settling", trigger: "reopen" },
        { tx, facts: { ...facts, teamScope }, reopenAuthority: authority.project },
      );
    });
  } catch (error) {
    if (error instanceof ApprovalConflictError || error instanceof NotCurrentHolderError) throw new ReopenConflictError();
    throw error;
  }
  return { number: projectRow.number };
}

// 화면 재료 — 완료 프로젝트 머리 트리거의 확인 창이 싣는 정산 결재 version(낙관적 판정). 보임 · projects.reopen · 완료 · 승인 문서일 때만,
// 아니면 null(트리거를 그리지 않는다). 판정의 정본은 reopenCompletedProject다 — 이 값은 동시 변경을 잡는 재료일 뿐이다.
export async function getReopenTarget(viewer: Viewer, input: { projectId: string }): Promise<{ instanceVersion: number } | null> {
  if (!UUID_SHAPE.test(input.projectId)) return null;
  const projectRow = await findProjectInScope(viewer, await projectRowScope(viewer, undefined, "write"), input.projectId);
  if (!projectRow || projectRow.archivedAt !== null || projectRow.status !== "completed") return null;
  if (!(await can(viewer, "projects.reopen", "write"))) return null;
  const doc = await findSettlementByProjectId(viewer, input.projectId);
  const graph = doc ? await findApprovalGraphByDocument(viewer, { documentKind: SETTLEMENT_DOCUMENT_KIND, documentId: doc.id }) : null;
  if (!graph || graph.instance.status !== "approved") return null;
  return { instanceVersion: graph.instance.version };
}
