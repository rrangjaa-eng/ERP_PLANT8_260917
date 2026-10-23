// 견적 재촉(N13) — 행사 시작 N일 전(기본 7)이 됐는데 어느 차수에도 견적 줄이 없는 프로젝트를 담당 PM에게(사용자 결정 2026-10-23 · 260907과 같은 기준).
// 보관 · 미수주 · 완료 프로젝트 제외(입찰 중은 포함). 독촉 사다리(2회차부터 본인 + 팀장). 꺼 둔 종류.
// 늦게 등록돼 시작 - N일이 이미 지난 프로젝트도 첫 알림은 1회차(담당 PM만) — 사다리 기준일은 1회차를 보낸 날(없으면 오늘)이다.
// 문장은 실제 거리로 `시작 N일 전` · `오늘 시작` · `시작한 지 N일`(260907 server/src/notices.ts:2393-2397).
import type { ConditionKind, NotificationCandidate } from "@/domain/notify/condition-kinds";
import { capRows, ladderCandidates, LADDER_SCAN_DAYS, loadLadderLookup, shiftDate } from "@/domain/notify/kinds/ladder-support";
import { NOTIFY_KIND_EVAL_MAX } from "@/domain/notify/limits";
import { teamLeadsOfRecipientTeam } from "@/domain/notify/recipients";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { listFirstRoundDates } from "@/repositories/notifications";
import { listOrgSnapshot } from "@/repositories/org-snapshot";
import { listProjectsWithoutQuote } from "@/repositories/notify-sources";

const DEFAULT_DAYS = 7;

// 오늘 기준 행사 시작까지(전) · 시작한 뒤(지남)를 말로 — 날짜 산술은 UTC 자정(shiftDate와 같은 관례).
function startDistanceText(startDate: string, today: string): string {
  const sinceStart = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / 86_400_000);
  if (sinceStart < 0) return `시작 ${-sinceStart}일 전`;
  if (sinceStart === 0) return "오늘 시작";
  return `시작한 지 ${sinceStart}일`;
}

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
    // 대상 = 시작일 ≤ 오늘 + N(시작 N일 전이 됐거나 지남) — 창 아래쪽은 사다리 스캔 길이만큼.
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
    const firstSent = await listFirstRoundDates(SYSTEM_VIEWER, { kind: "quote-nudge", entity: "project", entityIds: projects.map((project) => project.id) }, ctx.tx);
    const candidates: NotificationCandidate[] = [];
    for (const project of projects) {
      if (!active.has(project.pmUserId)) continue;
      candidates.push(
        ...ladderCandidates({
          entity: "project",
          entityId: project.id,
          firstDue: firstSent.get(project.id) ?? ctx.today,
          today: ctx.today,
          lookup,
          recipients: [project.pmUserId],
          escalation: teamLeadsOfRecipientTeam(project.pmUserId, snapshot),
          message: `견적 작성 대기 · ${project.name} · ${startDistanceText(project.startDate, ctx.today)}`,
        }),
      );
    }
    return candidates;
  },
};
