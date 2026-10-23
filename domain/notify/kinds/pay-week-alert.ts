// 지급 예정일 임박(N5 · D-701 · D-702 · EXP-12) — 그 주 지급일의 alertDate(마감 전 영업일)부터 결재 마감 날까지의 9시 tick 중
// 처음 도는 tick에서 경영관리에게 지급일마다 한 건. 하루 놓쳐도 마감 날 tick이 보낸다(C-P2-1). 기준일은 resolvePaySchedule 결과에서만(D-715).
import type { ConditionKind, NotificationCandidate } from "@/domain/notify/condition-kinds";
import { NOTIFY_KIND_EVAL_MAX } from "@/domain/notify/limits";
import { paymentManagers } from "@/domain/notify/recipients";
import { EXPENSE_DOCUMENT_KIND } from "@/domain/expenses/access";
import { toKstDate } from "@/domain/holidays/business-day";
import { payWeekdayChar } from "@/domain/payments/pay-schedule";
import { loadPaySchedules } from "@/domain/payments/pay-schedule-load";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { log } from "@/lib/log";
import { listPaymentTargetRows } from "@/repositories/payment-targets";

export const payWeekAlertKind: ConditionKind = {
  kind: "pay-week-alert",
  label: "지급 예정일 임박",
  dateUnit: "business",
  defaults: { enabled: true, emailEnabled: true },
  defaultRecipientLabel: "경영관리",
  async evaluate(ctx) {
    // 지급 대상 목록 · 일정 로더는 풀 연결로 읽는다(남의 읽기 — 잠금 tx + 1을 넘지 않는다).
    let targets = await listPaymentTargetRows(SYSTEM_VIEWER, { documentKind: EXPENSE_DOCUMENT_KIND });
    if (targets.length > NOTIFY_KIND_EVAL_MAX) {
      log.warn("notify.condition_capped", { kind: "pay-week-alert", max: NOTIFY_KIND_EVAL_MAX, found: targets.length });
      targets = targets.slice(0, NOTIFY_KIND_EVAL_MAX);
    }
    if (targets.length === 0) return [];
    const schedules = await loadPaySchedules(SYSTEM_VIEWER, targets, { today: ctx.today, now: new Date(`${ctx.today}T09:00:00+09:00`) });

    // 일정 계산이 실패한 행(R15)은 틀린 날짜로 알리지 않도록 뺀다.
    const groups = new Map<string, { count: number; alertDate: string }>();
    for (const target of targets) {
      const schedule = schedules.get(target.id);
      if (!schedule || schedule.failed) continue;
      if (schedule.alertDate > ctx.today || ctx.today > toKstDate(schedule.cutoffAt)) continue;
      const group = groups.get(schedule.payDate) ?? { count: 0, alertDate: schedule.alertDate };
      group.count += 1;
      groups.set(schedule.payDate, group);
    }
    if (groups.size === 0) return [];

    const recipients = await paymentManagers(ctx.today, ctx.tx);
    const candidates: NotificationCandidate[] = [];
    for (const [payDate, group] of groups) {
      for (const recipientId of recipients) {
        candidates.push({
          entity: "pay-week",
          entityId: payDate,
          recipientId,
          round: 1,
          referenceDate: group.alertDate,
          message: `지급 예정 · ${payDate.slice(5)} ${payWeekdayChar(payDate)} · ${group.count}건`,
        });
      }
    }
    return candidates;
  },
};
