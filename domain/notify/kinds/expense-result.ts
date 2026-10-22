// 결재 결과(N11 · N19 · D-716 · D-744) — 지출결의 기안자에게 `{승인|반려|금액 바뀜|지급 완료|지급 취소} · {문서 제목}`. 꺼 둔 사건 종류(D17 · 시드 끔).
// 지급 완료 · 지급 취소는 따로 된 종류가 아니라 이 종류의 갈래다(D-744) — 규칙 하나가 함께 켜고 끈다. 낱말은 `지급 완료` 하나(K13).
// 사건 종류라 고정 되돌아보기 창(ctx.since) 안 사건을 사건 id 키(entityId = `{지출결의 id}:{사건 id}`)로 모두 돌려주고 중복은 dedup 키가 막는다 —
// 다음 영업일 9시 tick 묶음으로만 나간다(즉시 행 생성 경로 없음, AQ-18). 금액 · 개인정보 없음(SC-07). 일수 칸 없음 · 사다리 없음.
// 기안자 본인 행동(본인 승인 · 본인이 한 지급 · 취소 · 금액 고침)은 알리지 않는다.
import { toKstDate } from "@/domain/holidays/business-day";
import type { ConditionKind, NotificationCandidate } from "@/domain/notify/condition-kinds";
import { capRows } from "@/domain/notify/kinds/ladder-support";
import { NOTIFY_KIND_EVAL_MAX } from "@/domain/notify/limits";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { listOrgSnapshot } from "@/repositories/org-snapshot";
import {
  listDocumentTitles,
  listExpenseAmountChanges,
  listExpenseFinalApprovals,
  listExpensePaymentEvents,
  listExpenseRejections,
  type ExpenseResultEventRow,
} from "@/repositories/notify-sources";

type ResultEvent = ExpenseResultEventRow & { word: string };

export const expenseResultKind: ConditionKind = {
  kind: "expense-result",
  label: "결재 결과",
  dateUnit: "calendar",
  defaults: { enabled: false, emailEnabled: true },
  defaultRecipientLabel: "기안자",
  async evaluate(ctx) {
    if (!ctx.since) return [];
    const since = ctx.since;
    // 갈래마다 평가량 상한(C-P2-13) — 원천은 도메인 표(결재 단계 · 지급 기록)와 끌 수 없는 금액 고침 로그(AQ-24).
    const branch = async (word: string, read: () => Promise<ExpenseResultEventRow[]>): Promise<ResultEvent[]> =>
      capRows("expense-result", await read(), NOTIFY_KIND_EVAL_MAX).map((row) => ({ ...row, word }));
    const events: ResultEvent[] = [
      ...(await branch("승인", () => listExpenseFinalApprovals(SYSTEM_VIEWER, since, NOTIFY_KIND_EVAL_MAX, ctx.tx))),
      ...(await branch("반려", () => listExpenseRejections(SYSTEM_VIEWER, since, NOTIFY_KIND_EVAL_MAX, ctx.tx))),
      ...(await branch("금액 바뀜", () => listExpenseAmountChanges(SYSTEM_VIEWER, since, NOTIFY_KIND_EVAL_MAX, ctx.tx))),
      ...(await branch("지급 완료", () => listExpensePaymentEvents(SYSTEM_VIEWER, { since, cancelled: false }, NOTIFY_KIND_EVAL_MAX, ctx.tx))),
      ...(await branch("지급 취소", () => listExpensePaymentEvents(SYSTEM_VIEWER, { since, cancelled: true }, NOTIFY_KIND_EVAL_MAX, ctx.tx))),
    ];
    if (events.length === 0) return [];
    const active = new Set((await listOrgSnapshot(SYSTEM_VIEWER, ctx.today, ctx.tx)).map((person) => person.id));
    const titles = await listDocumentTitles(SYSTEM_VIEWER, events.map((event) => ({ kind: "expense", id: event.expenseId })), ctx.tx);
    const candidates: NotificationCandidate[] = [];
    for (const event of events) {
      if (!active.has(event.drafterId)) continue;
      candidates.push({
        entity: "expense-result",
        entityId: `${event.expenseId}:${event.eventId}`,
        recipientId: event.drafterId,
        round: 1,
        referenceDate: toKstDate(event.at),
        message: `${event.word} · ${titles.get(`expense:${event.expenseId}`) ?? "지출결의"}`,
      });
    }
    return candidates;
  },
};
