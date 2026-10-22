// 결재 차례(N6 · N15 = N=0 · K17) — 그 단계가 열린 지 N영업일(기본 3, 0 허용 = 결재 도착)에 그 단계 결재 후보 전원에게. 독촉 사다리(N10).
// 결재함(listMyInbox)과 같은 walkRoute로 지금 단계 후보를 푼다(같은 판정 두 벌 금지). 결재 저장소 · 도메인은 읽기 import만(C-P2-3).
import { addBusinessDays, toKstDate } from "@/domain/holidays/business-day";
import { FALLBACK_ROLE_ID, walkRoute } from "@/domain/approvals";
import type { RouteStep, ScopeKind } from "@/domain/approvals/route";
import type { ConditionKind, NotificationCandidate } from "@/domain/notify/condition-kinds";
import { ladderCandidates, loadLadderLookup } from "@/domain/notify/kinds/ladder-support";
import { NOTIFY_KIND_EVAL_MAX } from "@/domain/notify/limits";
import { teamLeadsOfRoute } from "@/domain/notify/recipients";
import { CEO_ROLE_ID } from "@/domain/permissions/roles";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { log } from "@/lib/log";
import { listActiveInstances, type ActiveInstance } from "@/repositories/approvals";
import { listOrgSnapshot } from "@/repositories/org-snapshot";
import { listDocumentTitles } from "@/repositories/notify-sources";

const DEFAULT_DAYS = 3;

// domain/approvals/index.ts toRouteStep(비공개)과 같은 칸 대응 — 그 함수를 export하려면 결재 도메인을 고쳐야 해 여기 둔다.
function toRouteStep(row: ActiveInstance["steps"][number]): RouteStep {
  return {
    stepIndex: row.stepIndex,
    label: row.label,
    roleId: row.roleId,
    scopeKind: row.scopeKind as ScopeKind,
    scopeTargetId: row.scopeTargetId,
    isFallback: row.isFallback,
    actedBy: row.actedBy,
    actedByName: row.actedByName,
    actedAt: row.actedAt,
    action: row.action === "approved" || row.action === "rejected" ? row.action : null,
    selfApproved: row.selfApproved,
  };
}

export const approvalWaitingKind: ConditionKind = {
  kind: "approval-waiting",
  label: "결재 차례",
  dateUnit: "business",
  defaults: { enabled: true, days: DEFAULT_DAYS, emailEnabled: true },
  daysRange: { min: 0, max: 10 },
  ladder: true,
  defaultRecipientLabel: "그 단계 결재자",
  async evaluate(ctx) {
    const days = ctx.params?.days ?? DEFAULT_DAYS;
    let instances = await listActiveInstances(SYSTEM_VIEWER);
    if (instances.length > NOTIFY_KIND_EVAL_MAX) {
      log.warn("notify.condition_capped", { kind: "approval-waiting", max: NOTIFY_KIND_EVAL_MAX, found: instances.length });
      instances = instances.slice(0, NOTIFY_KIND_EVAL_MAX);
    }
    if (instances.length === 0) return [];
    // 한 tick에 조직 스냅숏 한 번 · 진행 중 인스턴스 한 번.
    const snapshot = await listOrgSnapshot(SYSTEM_VIEWER, ctx.today, ctx.tx);
    const lookup = await loadLadderLookup(ctx.today);

    type Waiting = { instance: ActiveInstance; stepId: string; candidateIds: string[]; firstDue: string; escalation: string[] };
    const waiting: Waiting[] = [];
    for (const instance of instances) {
      const walk = walkRoute({
        steps: instance.steps.map(toRouteStep),
        snapshot,
        selfApproval: instance.route.selfApproval as "skip" | "self_approve",
        drafterId: instance.drafterId,
        fallbackRoleId: FALLBACK_ROLE_ID,
        at: "before_action",
      });
      const outcome = walk.outcome;
      if (outcome.kind !== "actionable") continue;
      const currentRow = instance.steps.find((step) => step.stepIndex === outcome.stepIndex);
      if (!currentRow) continue;
      // 열린 시각 = 앞 단계(자기 결재 · 빈 단계 제외)의 가장 늦은 처리 시각, 없으면 상신 시각(DB에 열린 시각 칸이 없어 파생).
      let openedAt = instance.route.submittedAt;
      for (const step of walk.display) {
        if (step.stepIndex >= outcome.stepIndex || step.state !== "approved" || step.selfApproved || step.actedAt === null) continue;
        if (step.actedAt.getTime() > openedAt.getTime()) openedAt = step.actedAt;
      }
      // N=0은 「열린 날이 영업일이면 그날, 아니면 다음 영업일」(addBusinessDays가 0일 때 앞으로 구른다 — P6).
      const firstDue = addBusinessDays(toKstDate(openedAt), days, lookup);
      // 대표 단계는 회차가 올라도 팀장 · 대표를 더하지 않는다(위로 안 올림). 현재 단계 보유자가 팀장이면 겹침은 후보 합집합에서 한 번만.
      const atCeo = currentRow.isFallback || currentRow.roleId === CEO_ROLE_ID;
      const escalation = atCeo ? [] : teamLeadsOfRoute(instance.steps, snapshot);
      waiting.push({ instance, stepId: currentRow.id, candidateIds: outcome.candidateIds, firstDue, escalation });
    }
    if (waiting.length === 0) return [];

    const titles = await listDocumentTitles(
      SYSTEM_VIEWER,
      waiting.map((w) => ({ kind: w.instance.documentKind, id: w.instance.documentId })),
      ctx.tx,
    );
    const candidates: NotificationCandidate[] = [];
    for (const w of waiting) {
      const title = titles.get(`${w.instance.documentKind}:${w.instance.documentId}`) ?? "결재 문서";
      candidates.push(
        ...ladderCandidates({
          entity: "approval-step",
          entityId: w.stepId,
          firstDue: w.firstDue,
          today: ctx.today,
          lookup,
          recipients: w.candidateIds,
          escalation: w.escalation,
          message: `결재 차례 · ${title} · ${days}영업일`,
        }),
      );
    }
    return candidates;
  },
};
