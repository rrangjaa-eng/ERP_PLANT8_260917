// 증빙 없음 재촉(N7) · 선결제 증빙 독촉(N8)이 같이 쓰는 평가 — 지급이 있고 증빙이 0인 지출결의를 기안자에게, 독촉 사다리.
// 증빙 유무는 domain/evidence/has-evidence.ts 한 판정(CMP-C8)을, 2회차 팀장은 그 문서 결재 경로의 팀장 단계 보유자(AQ-04)를 쓴다.
import { EXPENSE_DOCUMENT_KIND } from "@/domain/expenses/access";
import { ownersWithEvidence } from "@/domain/evidence/has-evidence";
import type { EvaluateContext, NotificationCandidate } from "@/domain/notify/condition-kinds";
import { capRows, ladderCandidates, LADDER_SCAN_DAYS, loadLadderLookup, shiftDate } from "@/domain/notify/kinds/ladder-support";
import { NOTIFY_KIND_EVAL_MAX } from "@/domain/notify/limits";
import { teamLeadsOfRoute } from "@/domain/notify/recipients";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { listOrgSnapshot } from "@/repositories/org-snapshot";
import { listCurrentRouteSteps, listDocumentTitles, listPaidExpenseCandidates } from "@/repositories/notify-sources";

export async function evaluatePaidExpenseLadder(
  ctx: EvaluateContext,
  spec: { kind: string; prepaid: boolean; days: number; message: (title: string) => string },
): Promise<NotificationCandidate[]> {
  const found = await listPaidExpenseCandidates(
    SYSTEM_VIEWER,
    { prepaid: spec.prepaid, payDateFrom: shiftDate(ctx.today, -spec.days - LADDER_SCAN_DAYS), payDateTo: shiftDate(ctx.today, -spec.days) },
    NOTIFY_KIND_EVAL_MAX,
    ctx.tx,
  );
  const rows = capRows(spec.kind, found, NOTIFY_KIND_EVAL_MAX);
  if (rows.length === 0) return [];
  const withEvidence = await ownersWithEvidence(SYSTEM_VIEWER, { ownerKind: EXPENSE_DOCUMENT_KIND, ownerIds: rows.map((row) => row.expenseId) }, ctx.tx);
  const missing = rows.filter((row) => !withEvidence.has(row.expenseId));
  if (missing.length === 0) return [];

  const snapshot = await listOrgSnapshot(SYSTEM_VIEWER, ctx.today, ctx.tx);
  const active = new Set(snapshot.map((person) => person.id));
  const ids = missing.map((row) => row.expenseId);
  const routes = await listCurrentRouteSteps(SYSTEM_VIEWER, EXPENSE_DOCUMENT_KIND, ids, ctx.tx);
  const titles = await listDocumentTitles(SYSTEM_VIEWER, ids.map((id) => ({ kind: EXPENSE_DOCUMENT_KIND, id })), ctx.tx);
  const lookup = await loadLadderLookup(ctx.today);

  const candidates: NotificationCandidate[] = [];
  for (const row of missing) {
    if (!active.has(row.drafterId)) continue;
    candidates.push(
      ...ladderCandidates({
        entity: EXPENSE_DOCUMENT_KIND,
        entityId: row.expenseId,
        firstDue: shiftDate(row.payDate, spec.days),
        today: ctx.today,
        lookup,
        recipients: [row.drafterId],
        escalation: teamLeadsOfRoute(routes.get(row.expenseId) ?? [], snapshot),
        message: spec.message(titles.get(`${EXPENSE_DOCUMENT_KIND}:${row.expenseId}`) ?? "지출결의"),
      }),
    );
  }
  return candidates;
}
