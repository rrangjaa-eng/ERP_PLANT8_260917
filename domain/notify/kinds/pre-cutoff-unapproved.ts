// 마감 전 미승인(N12 · C-P2-1 · D-715) — 결재 중(최종 승인 전) 지출결의마다 그 주 결재 마감을 resolvePaySchedule 결과(loadPaySchedules)로만 얻고,
// `마감 날 − N영업일 ≤ 오늘 ≤ 마감 날`인 첫 tick에서 기안자에게 (지출결의, 마감 날)마다 한 번(entityId `{지출결의 id}:{마감 날}`) — 그날 tick을 놓쳐도
// 마감 날까지는 나가고, 마감이 다음 주로 밀리면 새 키로 다시 한 번. 꺼 둔 종류(D17 · 시드 끔). 마감 시각을 이 파일에서 다시 셈하지 않는다.
import { addBusinessDays, formatKstMinute, toKstDate } from "@/domain/holidays/business-day";
import type { ConditionKind, NotificationCandidate } from "@/domain/notify/condition-kinds";
import { loadLadderLookup } from "@/domain/notify/kinds/ladder-support";
import { NOTIFY_KIND_EVAL_MAX } from "@/domain/notify/limits";
import { EXPENSE_DOCUMENT_KIND } from "@/domain/expenses/access";
import { loadPaySchedules } from "@/domain/payments/pay-schedule-load";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { log } from "@/lib/log";
import { listOrgSnapshot } from "@/repositories/org-snapshot";
import { listDocumentTitles } from "@/repositories/notify-sources";
import { listApprovingPaymentTargetRows } from "@/repositories/payment-targets";

const DEFAULT_DAYS = 0;

export const preCutoffUnapprovedKind: ConditionKind = {
  kind: "pre-cutoff-unapproved",
  label: "마감 전 미승인",
  dateUnit: "business",
  defaults: { enabled: false, days: DEFAULT_DAYS, emailEnabled: true },
  daysRange: { min: 0, max: 3 },
  defaultRecipientLabel: "기안자",
  async evaluate(ctx) {
    const days = ctx.params?.days ?? DEFAULT_DAYS;
    // 결재 중 지급 대상(지금 승인되면 들어갈 건)과 일정 로더는 풀 연결로 읽는다 — 지급 예정일 임박 종류(pay-week-alert)와 같은 꼴.
    let rows = await listApprovingPaymentTargetRows(SYSTEM_VIEWER, { documentKind: EXPENSE_DOCUMENT_KIND });
    if (rows.length > NOTIFY_KIND_EVAL_MAX) {
      log.warn("notify.condition_capped", { kind: "pre-cutoff-unapproved", max: NOTIFY_KIND_EVAL_MAX, found: rows.length });
      rows = rows.slice(0, NOTIFY_KIND_EVAL_MAX);
    }
    if (rows.length === 0) return [];
    const schedules = await loadPaySchedules(SYSTEM_VIEWER, rows, { today: ctx.today, now: new Date(`${ctx.today}T09:00:00+09:00`) });
    const lookup = await loadLadderLookup(ctx.today);

    const due: Array<{ expenseId: string; drafterId: string; cutoffDate: string; cutoffAt: Date }> = [];
    for (const row of rows) {
      const schedule = schedules.get(row.id);
      // 일정 계산이 실패한 행(R15)은 틀린 시각으로 알리지 않는다.
      if (!schedule || schedule.failed) continue;
      const cutoffDate = toKstDate(schedule.cutoffAt);
      const from = days === 0 ? cutoffDate : addBusinessDays(cutoffDate, -days, lookup);
      if (from > ctx.today || ctx.today > cutoffDate) continue;
      due.push({ expenseId: row.id, drafterId: row.drafterId, cutoffDate, cutoffAt: schedule.cutoffAt });
    }
    if (due.length === 0) return [];

    const active = new Set((await listOrgSnapshot(SYSTEM_VIEWER, ctx.today, ctx.tx)).map((person) => person.id));
    const titles = await listDocumentTitles(SYSTEM_VIEWER, due.map((item) => ({ kind: "expense", id: item.expenseId })), ctx.tx);
    const candidates: NotificationCandidate[] = [];
    for (const item of due) {
      if (!active.has(item.drafterId)) continue;
      candidates.push({
        entity: "expense",
        entityId: `${item.expenseId}:${item.cutoffDate}`,
        recipientId: item.drafterId,
        round: 1,
        referenceDate: item.cutoffDate,
        message: `마감 전 미승인 · ${titles.get(`expense:${item.expenseId}`) ?? "지출결의"} · ${formatKstMinute(item.cutoffAt).slice(5)}`,
      });
    }
    return candidates;
  },
};
