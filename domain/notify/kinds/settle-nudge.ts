// 정산 상신 재촉(N13) — 정산 중(settling)인데 정산 결재가 올라가지 않은 프로젝트를 정산 가능일(종료일 다음 날) +N일(기본 14)에 담당 PM에게.
// 상신(제출 · 결재 중 · 승인)하면 다음 회차 없음. 보관 프로젝트 제외. 독촉 사다리(2회차부터 본인 + 팀장). 꺼 둔 종류(시드 끔).
import type { ConditionKind, NotificationCandidate } from "@/domain/notify/condition-kinds";
import { capRows, ladderCandidates, LADDER_SCAN_DAYS, loadLadderLookup, shiftDate } from "@/domain/notify/kinds/ladder-support";
import { NOTIFY_KIND_EVAL_MAX } from "@/domain/notify/limits";
import { teamLeadsOfRecipientTeam } from "@/domain/notify/recipients";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { listOrgSnapshot } from "@/repositories/org-snapshot";
import { listSettlingProjectsNotSubmitted } from "@/repositories/notify-sources";

const DEFAULT_DAYS = 14;

export const settleNudgeKind: ConditionKind = {
  kind: "settle-nudge",
  label: "정산 상신 재촉",
  dateUnit: "calendar",
  defaults: { enabled: false, days: DEFAULT_DAYS, emailEnabled: true },
  daysRange: { min: 1, max: 60 },
  ladder: true,
  defaultRecipientLabel: "담당 PM",
  async evaluate(ctx) {
    const days = ctx.params?.days ?? DEFAULT_DAYS;
    // 첫 기한 = 종료일 + 1 + N — 종료일 창은 그만큼 앞으로 민다.
    const found = await listSettlingProjectsNotSubmitted(
      SYSTEM_VIEWER,
      { from: shiftDate(ctx.today, -days - 1 - LADDER_SCAN_DAYS), to: shiftDate(ctx.today, -days - 1) },
      NOTIFY_KIND_EVAL_MAX,
      ctx.tx,
    );
    const projects = capRows("settle-nudge", found, NOTIFY_KIND_EVAL_MAX);
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
          firstDue: shiftDate(project.endDate, 1 + days),
          today: ctx.today,
          lookup,
          recipients: [project.pmUserId],
          escalation: teamLeadsOfRecipientTeam(project.pmUserId, snapshot),
          message: `정산 상신 대기 · ${project.name} · ${days}일`,
        }),
      );
    }
    return candidates;
  },
};
