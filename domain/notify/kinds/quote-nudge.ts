// 견적 재촉(N13) — 만든 지 N일(기본 7) 지나도 어느 차수에도 견적 줄이 없는 프로젝트를 담당 PM에게.
// 보관 · 미수주 · 완료 프로젝트 제외(입찰 중은 포함). 독촉 사다리(2회차부터 본인 + 팀장). 꺼 둔 종류.
import { toKstDate } from "@/domain/holidays/business-day";
import type { ConditionKind, NotificationCandidate } from "@/domain/notify/condition-kinds";
import { capRows, ladderCandidates, LADDER_SCAN_DAYS, loadLadderLookup, shiftDate } from "@/domain/notify/kinds/ladder-support";
import { NOTIFY_KIND_EVAL_MAX } from "@/domain/notify/limits";
import { teamLeadsOfRecipientTeam } from "@/domain/notify/recipients";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { kstDayStart } from "@/lib/kst-date";
import { listOrgSnapshot } from "@/repositories/org-snapshot";
import { listProjectsWithoutQuote } from "@/repositories/notify-sources";

const DEFAULT_DAYS = 7;

export const quoteNudgeKind: ConditionKind = {
  kind: "quote-nudge",
  label: "견적 재촉",
  dateUnit: "calendar",
  defaults: { enabled: false, days: DEFAULT_DAYS, emailEnabled: true },
  daysRange: { min: 1, max: 30 },
  ladder: true,
  defaultRecipientLabel: "담당 PM",
  async evaluate(ctx) {
    const days = ctx.params?.days ?? DEFAULT_DAYS;
    const found = await listProjectsWithoutQuote(
      SYSTEM_VIEWER,
      { from: kstDayStart(shiftDate(ctx.today, -days - LADDER_SCAN_DAYS)), before: kstDayStart(shiftDate(ctx.today, -days + 1)) },
      NOTIFY_KIND_EVAL_MAX,
      ctx.tx,
    );
    const projects = capRows("quote-nudge", found, NOTIFY_KIND_EVAL_MAX);
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
          firstDue: shiftDate(toKstDate(project.createdAt), days),
          today: ctx.today,
          lookup,
          recipients: [project.pmUserId],
          escalation: teamLeadsOfRecipientTeam(project.pmUserId, snapshot),
          message: `견적 작성 대기 · ${project.name} · ${days}일`,
        }),
      );
    }
    return candidates;
  },
};
