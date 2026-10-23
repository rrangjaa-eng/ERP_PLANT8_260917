// 종료 후 지출결의 없음(N4) — 종료일 +N일(기본 7)에 담당 PM에게. 보관 · 미수주 · 완료 프로젝트와 지출결의가 하나라도 있는 프로젝트는 제외. 독촉 사다리.
import type { ConditionKind, NotificationCandidate } from "@/domain/notify/condition-kinds";
import { capRows, ladderCandidates, LADDER_SCAN_DAYS, loadLadderLookup, shiftDate } from "@/domain/notify/kinds/ladder-support";
import { NOTIFY_KIND_EVAL_MAX } from "@/domain/notify/limits";
import { teamLeadsOfRecipientTeam } from "@/domain/notify/recipients";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { listOrgSnapshot } from "@/repositories/org-snapshot";
import { listProjectsEndedWithoutExpense } from "@/repositories/notify-sources";

const DEFAULT_DAYS = 7;

export const projectEndNoExpenseKind: ConditionKind = {
  kind: "project-end-no-expense",
  label: "종료 후 지출결의 없음",
  dateUnit: "calendar",
  defaults: { enabled: true, days: DEFAULT_DAYS, emailEnabled: true },
  daysRange: { min: 1, max: 30 },
  ladder: true,
  defaultRecipientLabel: "담당 PM",
  async evaluate(ctx) {
    const days = ctx.params?.days ?? DEFAULT_DAYS;
    const found = await listProjectsEndedWithoutExpense(
      SYSTEM_VIEWER,
      { from: shiftDate(ctx.today, -days - LADDER_SCAN_DAYS), to: shiftDate(ctx.today, -days) },
      NOTIFY_KIND_EVAL_MAX,
      ctx.tx,
    );
    const projects = capRows("project-end-no-expense", found, NOTIFY_KIND_EVAL_MAX);
    if (projects.length === 0) return [];
    const snapshot = await listOrgSnapshot(SYSTEM_VIEWER, ctx.today, ctx.tx);
    const active = new Set(snapshot.map((person) => person.id));
    const lookup = await loadLadderLookup(ctx.today);
    const candidates: NotificationCandidate[] = [];
    for (const project of projects) {
      if (!active.has(project.pmUserId)) continue;
      candidates.push(
        ...ladderCandidates({
          entity: "project",
          entityId: project.id,
          firstDue: shiftDate(project.endDate, days),
          today: ctx.today,
          lookup,
          recipients: [project.pmUserId],
          escalation: teamLeadsOfRecipientTeam(project.pmUserId, snapshot),
          message: `지출결의 없음 · ${project.name} · 종료 ${days}일`,
        }),
      );
    }
    return candidates;
  },
};
