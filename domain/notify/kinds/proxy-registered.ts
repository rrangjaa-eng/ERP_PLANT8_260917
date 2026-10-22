// 대리 등록(N9 · D-710 · D-716) — 남이 대신 등록한 법인카드 사용을 담당 PM에게. 사건 종류라 고정 되돌아보기 창(ctx.since) 안 사건을 사건 id 키로 모두 돌려주고
// 중복은 dedup 키가 막는다(주말 · 연휴 뒤에도 한 번 나간다). 일수 칸 없음 · 사다리 없음.
import { toKstDate } from "@/domain/holidays/business-day";
import type { ConditionKind, NotificationCandidate } from "@/domain/notify/condition-kinds";
import { capRows } from "@/domain/notify/kinds/ladder-support";
import { NOTIFY_KIND_EVAL_MAX } from "@/domain/notify/limits";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { listOrgSnapshot } from "@/repositories/org-snapshot";
import { listProxyRegistrations } from "@/repositories/notify-sources";

export const proxyRegisteredKind: ConditionKind = {
  kind: "proxy-registered",
  label: "대리 등록",
  dateUnit: "calendar",
  defaults: { enabled: true, emailEnabled: true },
  defaultRecipientLabel: "담당 PM",
  async evaluate(ctx) {
    if (!ctx.since) return [];
    const found = await listProxyRegistrations(SYSTEM_VIEWER, ctx.since, NOTIFY_KIND_EVAL_MAX, ctx.tx);
    const rows = capRows("proxy-registered", found, NOTIFY_KIND_EVAL_MAX);
    if (rows.length === 0) return [];
    const active = new Set((await listOrgSnapshot(SYSTEM_VIEWER, ctx.today, ctx.tx)).map((person) => person.id));
    const candidates: NotificationCandidate[] = [];
    for (const row of rows) {
      if (!active.has(row.pmUserId)) continue;
      candidates.push({
        entity: "card-usage",
        entityId: row.id,
        recipientId: row.pmUserId,
        round: 1,
        referenceDate: toKstDate(row.createdAt),
        message: `대리 등록 · ${row.projectName} · ${row.number ?? row.usedOn.slice(5)}`,
      });
    }
    return candidates;
  },
};
