// 계좌 바뀜(N14 · D-716 · SC-07) — 거래처 계좌(은행 · 예금주 · 번호)가 바뀌면 경영관리(지급 처리 쓰기 활성 사용자)에게. 사건 종류라 고정 되돌아보기
// 창(ctx.since — 오늘 KST 00:00 - 14일과 규칙 켠 시각 중 늦은 쪽) 안 변경 기록(07-23 Task 1 vendor_account_changes)을 거래처 · KST 날짜로 묶는다.
// 사건 키 `{거래처}:{날짜}` — 같은 날 여러 번 바뀌어도 한 행, 다음 날 다시 바뀌면 새 행, 다음 tick의 같은 변경은 dedup 키가 막는다.
// 문장에 계좌 숫자 · 금액을 넣지 않는다(V6 — 뒤 4자리도 알림에 싣지 않는다). 꺼 둔 종류 · 일수 칸 · 사다리 없음. 보관 거래처는 읽기에서 빠진다.
import { toKstDate } from "@/domain/holidays/business-day";
import type { ConditionKind, NotificationCandidate } from "@/domain/notify/condition-kinds";
import { capRows } from "@/domain/notify/kinds/ladder-support";
import { NOTIFY_KIND_EVAL_MAX } from "@/domain/notify/limits";
import { paymentManagers } from "@/domain/notify/recipients";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { listAccountChangesSince } from "@/repositories/vendor-details";

const KIND = "vendor-account-changed";

export const vendorAccountChangedKind: ConditionKind = {
  kind: KIND,
  label: "계좌 바뀜",
  dateUnit: "calendar",
  defaults: { enabled: false, emailEnabled: true },
  defaultRecipientLabel: "경영관리",
  async evaluate(ctx) {
    if (!ctx.since) return [];
    const found = await listAccountChangesSince(SYSTEM_VIEWER, ctx.since, NOTIFY_KIND_EVAL_MAX, ctx.tx);
    const rows = capRows(KIND, found, NOTIFY_KIND_EVAL_MAX);
    if (rows.length === 0) return [];
    // 거래처 · KST 날짜마다 한 사건(오래된 순으로 읽었으니 처음 본 줄의 이름).
    const events = new Map<string, { vendorName: string; date: string }>();
    for (const row of rows) {
      const date = toKstDate(row.changedAt);
      const key = `${row.vendorId}:${date}`;
      if (!events.has(key)) events.set(key, { vendorName: row.vendorName, date });
    }
    const recipients = await paymentManagers(ctx.today, ctx.tx);
    const candidates: NotificationCandidate[] = [];
    for (const [entityId, event] of events) {
      for (const recipientId of recipients) {
        candidates.push({ entity: "vendor", entityId, recipientId, round: 1, referenceDate: event.date, message: `계좌 바뀜 · ${event.vendorName}` });
      }
    }
    return candidates;
  },
};
