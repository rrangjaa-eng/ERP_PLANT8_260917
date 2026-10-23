// 견적 재촉(N13) — 행사 시작 N일 전(기본 7)이 됐는데 어느 차수에도 견적 줄이 없는 프로젝트를 담당 PM에게(사용자 결정 2026-10-23 · 260907과 같은 기준).
// 보관 · 미수주 · 완료 프로젝트 제외(입찰 중은 포함). 독촉 사다리(2회차부터 본인 + 팀장). 꺼 둔 종류.
import type { ConditionKind, NotificationCandidate } from "@/domain/notify/condition-kinds";
import { capRows, ladderCandidates, LADDER_SCAN_DAYS, loadLadderLookup, shiftDate } from "@/domain/notify/kinds/ladder-support";
import { NOTIFY_KIND_EVAL_MAX } from "@/domain/notify/limits";
import { teamLeadsOfRecipientTeam } from "@/domain/notify/recipients";
import { SYSTEM_VIEWER } from "@/domain/viewer";
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
    // 첫 기한 = 시작일 - N — 시작일 창은 그만큼 뒤로 민다.
    const found = await listProjectsWithoutQuote(
      SYSTEM_VIEWER,
      { from: shiftDate(ctx.today, days - LADDER_SCAN_DAYS), to: shiftDate(ctx.today, days) },
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
          firstDue: shiftDate(project.startDate, -days),
          today: ctx.today,
          lookup,
          recipients: [project.pmUserId],
          escalation: teamLeadsOfRecipientTeam(project.pmUserId, snapshot),
          message: `견적 작성 대기 · ${project.name} · 시작 ${days}일 전`,
        }),
      );
    }
    return candidates;
  },
};
