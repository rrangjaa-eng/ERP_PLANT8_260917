// 선결제 증빙 독촉(N8) — 선결제 지출결의의 기준 지급일 + 설정 evidence.prepaid_due_days(14, 규칙 일수 칸이 비면 설정값)에 기안자에게. 독촉 사다리.
import type { ConditionKind } from "@/domain/notify/condition-kinds";
import { evaluatePaidExpenseLadder } from "@/domain/notify/kinds/paid-expense-ladder";
import { EVIDENCE_PREPAID_DUE_DAYS } from "@/domain/settings/keys";
import { getSettingValue } from "@/domain/settings/registry";

export const prepaidEvidenceKind: ConditionKind = {
  kind: "prepaid-evidence",
  label: "선결제 증빙 독촉",
  dateUnit: "calendar",
  // 일수 기본값은 코드에 두지 않는다 — 칸을 비우면 설정 evidence.prepaid_due_days를 읽는다(FA-1).
  defaults: { enabled: true, emailEnabled: true },
  daysRange: { min: 1, max: 60 },
  ladder: true,
  defaultRecipientLabel: "기안자",
  async evaluate(ctx) {
    const days = ctx.params?.days ?? (await getSettingValue(EVIDENCE_PREPAID_DUE_DAYS));
    return evaluatePaidExpenseLadder(ctx, { kind: "prepaid-evidence", prepaid: true, days, message: (title) => `선결제 증빙 없음 · ${title} · ${days}일` });
  },
};
