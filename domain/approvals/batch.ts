import type { Viewer } from "@/domain/viewer";
import { approveDocument, isCurrentCandidate, NOT_HOLDER_MESSAGE, NotCurrentHolderError, rejectDocument, validateRejectReason, type ApprovalDeps } from "@/domain/approvals";
import { EXPENSE_DOCUMENT_KIND } from "@/domain/expenses/access";
import { LEAVE_CANCEL_KIND, LEAVE_DOCUMENT_KIND } from "@/domain/leave/access";
import { formatKstTime } from "@/domain/holidays/business-day";
import { UserFacingError } from "@/lib/actions/user-facing-error";
import { seoulToday } from "@/lib/dates";
import { log } from "@/lib/log";
import { findApprovalGraphById } from "@/repositories/approvals";
import { listOrgSnapshot as defaultListOrgSnapshot } from "@/repositories/org-snapshot";

// 07.2-16(PU15 · 16 · 17 · D-7269 · D-7271 · D-7272): 결재함 일괄 승인 · 반려 — 행마다 단건 approveDocument / rejectDocument를
// 화면이 받은 version으로 부른다(판정 로직 복사 0 · 낙관적 잠금 그대로). 이 함수는 트랜잭션을 열지 않는다 — 한 행의 실패는 다른 행을
// 되돌리지 않는다(domain/payments/batch.ts와 같은 부분 성공 모양). 260907 O: server/src/approval-bulk.ts:89(상한 100) · :98-103(한 사유).
// 종류는 서버가 인스턴스를 읽어 판정한다(요청에 종류 칸 없음) — 정산 결재는 프로젝트 완료가 함께 일어나 건별로만(D-7271).

export const APPROVAL_BATCH_LIMIT = 100;
export const BATCH_KINDS: readonly string[] = [EXPENSE_DOCUMENT_KIND, LEAVE_DOCUMENT_KIND, LEAVE_CANCEL_KIND];
export const BATCH_KIND_EXCLUDED = "정산 결재 · 건별 승인";
export const APPROVAL_BATCH_LIMIT_MESSAGE = `${APPROVAL_BATCH_LIMIT}건까지`;

// 예상 밖 실패 행의 글자 — 지급 일괄(`domain/payments/batch.ts` BATCH_ROW_FAILED)과 같은 문구. 지급 모듈을 import하면 지출결의 · 지급 종류
// 등록까지 끌려와(결재 액션 단위 시험의 목이 깨진다) 문구만 같은 값으로 둔다 — 같음은 통합 시험이 지급 상수와 맞대어 지킨다.
export const APPROVAL_BATCH_ROW_FAILED = "처리 실패 · 새로 고침";

export class ApprovalBatchLimitError extends UserFacingError {}

export type ApprovalBatchItem = { instanceId: string; expectedVersion: number };
export type ApprovalBatchResult = {
  processedIds: string[];
  blocked: { id: string; reason: string }[];
  // 결과 글자 `{시:분} 승인 N건 · 막힘 N건`의 시각(서울).
  time: string;
};

// 같은 id는 처음 것만 · 상한은 중복 제거 뒤 — 넘으면 한 건도 처리하지 않는다(D-7272).
function uniqueWithinLimit(items: readonly ApprovalBatchItem[]): ApprovalBatchItem[] {
  const seen = new Set<string>();
  const unique = items.filter((item) => (seen.has(item.instanceId) ? false : (seen.add(item.instanceId), true)));
  if (unique.length > APPROVAL_BATCH_LIMIT) throw new ApprovalBatchLimitError(APPROVAL_BATCH_LIMIT_MESSAGE);
  return unique;
}

async function runBatch(
  viewer: Viewer,
  items: readonly ApprovalBatchItem[],
  deps: ApprovalDeps | undefined,
  single: (item: ApprovalBatchItem, rowDeps: ApprovalDeps) => Promise<unknown>,
): Promise<ApprovalBatchResult> {
  const rows = uniqueWithinLimit(items);
  // 조직 스냅숏은 묶음에 한 번(행마다 같은 날짜 · 같은 소속) — 판정 자체는 행마다 트랜잭션 안 version으로 단건 함수가 한다.
  const snapshot = await (deps?.listOrgSnapshot ?? defaultListOrgSnapshot)(viewer, seoulToday(deps?.now));
  const rowDeps: ApprovalDeps = { ...deps, listOrgSnapshot: () => Promise.resolve(snapshot) };
  const processedIds: string[] = [];
  const blocked: ApprovalBatchResult["blocked"] = [];
  for (const row of rows) {
    try {
      const graph = await findApprovalGraphById(viewer, row.instanceId);
      // 그래프가 없으면 단건 함수가 엔진 판정(지금 담당이 아님)으로 막는다. 일괄 밖 종류는 지금 담당에게만 종류를 알리고,
      // 담당 아닌 사람은 엔진과 같은 글자로 막는다(종류 노출 0 · #377 리뷰 L3) — 어느 쪽이든 단건 함수는 부르지 않는다.
      if (graph && !BATCH_KINDS.includes(graph.instance.documentKind)) {
        if (!(await isCurrentCandidate(viewer, graph, rowDeps))) throw new NotCurrentHolderError(NOT_HOLDER_MESSAGE);
        blocked.push({ id: row.instanceId, reason: BATCH_KIND_EXCLUDED });
        continue;
      }
      await single(row, rowDeps);
      processedIds.push(row.instanceId);
    } catch (error) {
      // 엔진 충돌 · 담당 아님 · 종류 막힘은 사용자 문구 그대로, 그 밖은 한 문구 + 로그(id · 오류 이름만 — 금액 · 개인정보 없음).
      if (error instanceof UserFacingError) {
        blocked.push({ id: row.instanceId, reason: error.message });
      } else {
        log.warn("approval.batch_row_failed", { id: row.instanceId, error: error instanceof Error ? error.name : "unknown" });
        blocked.push({ id: row.instanceId, reason: APPROVAL_BATCH_ROW_FAILED });
      }
    }
  }
  return { processedIds, blocked, time: formatKstTime(deps?.now ?? new Date()) };
}

export async function approveBatch(viewer: Viewer, items: readonly ApprovalBatchItem[], deps?: ApprovalDeps): Promise<ApprovalBatchResult> {
  return runBatch(viewer, items, deps, (item, rowDeps) => approveDocument(viewer, item, rowDeps));
}

// 사유는 묶음 전체에 하나(D-7270) — 상한 · 중복 제거보다 먼저 다듬어 비면 행 루프 없이 전부 거부한다(eng r2 D-16 · 단건 호출 0).
export async function rejectBatch(
  viewer: Viewer,
  items: readonly ApprovalBatchItem[],
  reason: string,
  deps?: ApprovalDeps,
): Promise<ApprovalBatchResult> {
  const trimmed = validateRejectReason(reason);
  return runBatch(viewer, items, deps, (item, rowDeps) => rejectDocument(viewer, { ...item, reason: trimmed }, rowDeps));
}
