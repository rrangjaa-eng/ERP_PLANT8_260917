// 반려 방치 재촉(N13) — 반려된 채 다시 제출 · 회수 · 종결 · 삭제되지 않은 지출결의를 반려 +N일(기본 7)에 기안자에게.
// 반려 사건마다 따로 센다(entityId = `{지출결의 id}:{반려 단계 id}` — 다시 반려되면 새 사다리). 2회차 팀장은 그 문서 결재 경로의 팀장(AQ-04). 꺼 둔 종류.
import { toKstDate } from "@/domain/holidays/business-day";
import { EXPENSE_DOCUMENT_KIND } from "@/domain/expenses/access";
import type { ConditionKind, NotificationCandidate } from "@/domain/notify/condition-kinds";
import { capRows, ladderCandidates, LADDER_SCAN_DAYS, loadLadderLookup, shiftDate } from "@/domain/notify/kinds/ladder-support";
import { NOTIFY_KIND_EVAL_MAX } from "@/domain/notify/limits";
import { teamLeadsOfRoute } from "@/domain/notify/recipients";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { kstDayStart } from "@/lib/kst-date";
import { listOrgSnapshot } from "@/repositories/org-snapshot";
import { listCurrentRouteSteps, listDocumentTitles, listRejectedIdleExpenses } from "@/repositories/notify-sources";

const DEFAULT_DAYS = 7;

export const rejectedIdleKind: ConditionKind = {
  kind: "rejected-idle",
  label: "반려 방치 재촉",
  dateUnit: "calendar",
  defaults: { enabled: false, days: DEFAULT_DAYS, emailEnabled: true },
  daysRange: { min: 1, max: 30 },
  ladder: true,
  defaultRecipientLabel: "기안자",
  async evaluate(ctx) {
    const days = ctx.params?.days ?? DEFAULT_DAYS;
    // 반려 시각(KST 날짜)이 [오늘 − N − 창, 오늘 − N]인 것.
    const found = await listRejectedIdleExpenses(
      SYSTEM_VIEWER,
      { from: kstDayStart(shiftDate(ctx.today, -days - LADDER_SCAN_DAYS)), before: kstDayStart(shiftDate(ctx.today, -days + 1)) },
      NOTIFY_KIND_EVAL_MAX,
      ctx.tx,
    );
    const rows = capRows("rejected-idle", found, NOTIFY_KIND_EVAL_MAX);
    if (rows.length === 0) return [];
    const snapshot = await listOrgSnapshot(SYSTEM_VIEWER, ctx.today, ctx.tx);
    const active = new Set(snapshot.map((person) => person.id));
    const ids = rows.map((row) => row.expenseId);
    const routes = await listCurrentRouteSteps(SYSTEM_VIEWER, EXPENSE_DOCUMENT_KIND, ids, ctx.tx);
    const titles = await listDocumentTitles(SYSTEM_VIEWER, ids.map((id) => ({ kind: EXPENSE_DOCUMENT_KIND, id })), ctx.tx);
    const lookup = await loadLadderLookup(ctx.today);
    const candidates: NotificationCandidate[] = [];
    for (const row of rows) {
      if (!active.has(row.drafterId)) continue;
      candidates.push(
        ...ladderCandidates({
          entity: EXPENSE_DOCUMENT_KIND,
          entityId: `${row.expenseId}:${row.stepId}`,
          firstDue: shiftDate(toKstDate(row.rejectedAt), days),
          today: ctx.today,
          lookup,
          recipients: [row.drafterId],
          escalation: teamLeadsOfRoute(routes.get(row.expenseId) ?? [], snapshot),
          message: `반려 방치 · ${titles.get(`${EXPENSE_DOCUMENT_KIND}:${row.expenseId}`) ?? "지출결의"} · ${days}일`,
        }),
      );
    }
    return candidates;
  },
};
