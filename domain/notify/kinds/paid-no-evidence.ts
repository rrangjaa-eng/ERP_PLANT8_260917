// 증빙 없음 재촉(N7) — 지급일 +N일(기본 7) 지났는데 붙은 증빙이 0인 지출결의를 기안자에게. 선결제 · 면제 · 지급 취소는 제외. 독촉 사다리.
import type { ConditionKind } from "@/domain/notify/condition-kinds";
import { evaluatePaidExpenseLadder } from "@/domain/notify/kinds/paid-expense-ladder";

const DEFAULT_DAYS = 7;

export const paidNoEvidenceKind: ConditionKind = {
  kind: "paid-no-evidence",
  label: "증빙 없음 재촉",
  dateUnit: "calendar",
  defaults: { enabled: true, days: DEFAULT_DAYS, emailEnabled: true },
  daysRange: { min: 1, max: 30 },
  ladder: true,
  defaultRecipientLabel: "기안자",
  evaluate(ctx) {
    const days = ctx.params?.days ?? DEFAULT_DAYS;
    return evaluatePaidExpenseLadder(ctx, { kind: "paid-no-evidence", prepaid: false, days, message: (title) => `증빙 없음 · ${title} · 지급 후 ${days}일` });
  },
};
