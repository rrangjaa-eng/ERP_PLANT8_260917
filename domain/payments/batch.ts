import type { Viewer } from "@/domain/viewer";
import { can, ForbiddenError } from "@/domain/permissions/can";
import { completeExpensePayment, loadPaymentShared, PayableChangedError, type PaymentSharedDeps } from "@/domain/payments";
import { rejudgePaymentTargets } from "@/domain/payments/targets";
import { formatKstTime } from "@/domain/holidays/business-day";
import { UserFacingError } from "@/lib/actions/user-facing-error";
import { log } from "@/lib/log";

// 06-15(AS1 · D-604 부분 성공 · S2): 일괄 지급 — 행마다 06-03 · 06-04 단건 경로(completeExpensePayment)를 그 함수의 트랜잭션으로 부른다.
// 이 함수는 트랜잭션을 열지 않는다(06-03 tx 규약 — 행마다 사전 조회 → 트랜잭션). 권한은 루프 전 한 번, 문서와 무관한 사전 읽기(코드표 ·
// 기준일 · 증빙 필수 · 짝 · 날짜별 세율 캐시)도 루프 전 loadPaymentShared 한 번(E-34). 한 행의 실패는 다른 행의 기록을 되돌리지 않는다.
// 스냅숏(R-2)의 version이 잠근 행과 다르면 단건 경로가 동시성으로 막는다 — 같은 요청을 다시 보내도 지급 기록이 늘지 않는다(E-5).
// 막힌 행은 루프 뒤 id 묶음 한 번 다시 읽어 응답 순간의 「지금 고를 수 있음」을 싣는다(H-3).

export type BatchPaymentRow = {
  expenseId: string;
  expenseVersion: number;
  expectedPayableKrw: number;
  transferKrw?: number;
  diffReason?: string | null;
};

// selectable · selectableReason = 응답 순간 재판정(H-3) — 고를 수 없으면 선택 칸 이유(판정표 이유 또는 상태 낱말).
export type BatchBlockedRow = { expenseId: string; reason: string; newPayableKrw: number | null; selectable: boolean; selectableReason: string | null };

export type BatchPaymentResult = {
  processed: number;
  processedIds: string[];
  blocked: BatchBlockedRow[];
  // 결과 글자 `{시:분} 지급 완료 N건`의 시각(서울).
  time: string;
};

export const BATCH_ROW_FAILED = "처리 실패 · 새로 고침";

// 오류 → 행 결과(DB 없음). 게이트 · 동시성 · 이미 지급 · 입력 문구는 사용자 문구(UserFacingError) 그대로, 지급일 세율로 지급 총액이 바뀌면
// 새 지급 총액을 싣는다. 모르는 오류는 한 문구만 내보낸다(상세는 서버 로그 — 금액 · 개인정보 없음).
export function batchRowOutcome(error: unknown): { reason: string; newPayableKrw: number | null } {
  if (error instanceof PayableChangedError) return { reason: error.message, newPayableKrw: error.payableKrw };
  if (error instanceof UserFacingError) return { reason: error.message, newPayableKrw: null };
  return { reason: BATCH_ROW_FAILED, newPayableKrw: null };
}

export async function completePaymentsBatch(
  viewer: Viewer,
  input: { payDate: string; rows: readonly BatchPaymentRow[] },
  deps?: Partial<Pick<PaymentSharedDeps, "loadTaxRates">> & { now?: Date },
): Promise<BatchPaymentResult> {
  if (!(await can(viewer, "expenses.payments", "write"))) throw new ForbiddenError("지급 처리 권한 없음");
  const seen = new Set<string>();
  const rows = input.rows.filter((row) => (seen.has(row.expenseId) ? false : (seen.add(row.expenseId), true)));
  const shared = await loadPaymentShared(viewer, deps?.loadTaxRates ? { loadTaxRates: deps.loadTaxRates } : undefined);

  const processedIds: string[] = [];
  const failures: { expenseId: string; reason: string; newPayableKrw: number | null }[] = [];
  for (const row of rows) {
    try {
      await completeExpensePayment(
        viewer,
        {
          expenseId: row.expenseId,
          payDate: input.payDate,
          expectedPayableKrw: row.expectedPayableKrw,
          version: row.expenseVersion,
          ...(row.transferKrw === undefined ? {} : { transferKrw: row.transferKrw }),
          ...(row.diffReason === undefined ? {} : { diffReason: row.diffReason }),
        },
        { shared, ...(deps?.now ? { now: deps.now } : {}) },
      );
      processedIds.push(row.expenseId);
    } catch (error) {
      const outcome = batchRowOutcome(error);
      if (outcome.reason === BATCH_ROW_FAILED) log.error("일괄 지급 행 처리 실패", { expenseId: row.expenseId, error: error instanceof Error ? error.name : "unknown" });
      failures.push({ expenseId: row.expenseId, ...outcome });
    }
  }

  const rejudged = await rejudgePaymentTargets(
    viewer,
    failures.map((failure) => failure.expenseId),
    { shared },
  );
  return {
    processed: processedIds.length,
    processedIds,
    blocked: failures.map((failure) => {
      const now = rejudged.get(failure.expenseId);
      // 다시 읽히지 않은 행(지워짐 · 안 보임)은 고를 수 없다.
      return { ...failure, selectable: now?.selectable ?? false, selectableReason: now ? now.reason : "없는 지출결의" };
    }),
    time: formatKstTime(deps?.now ?? new Date()),
  };
}
