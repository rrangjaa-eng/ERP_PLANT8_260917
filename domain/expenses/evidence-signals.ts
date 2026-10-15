import type { Viewer } from "@/domain/viewer";
import { ownersWithEvidence } from "@/domain/evidence/has-evidence";
import { listEvidenceVoidSignals } from "@/domain/evidence/signals";
import { evidenceGateDecision } from "@/domain/payments/action-row";
import { prepaidDueInfo } from "@/domain/evidence-reviews/prepaid";
import { EXPENSE_DOCUMENT_KIND } from "@/domain/expenses/access";
import { getSettingValue } from "@/domain/settings/registry";
import { EVIDENCE_PREPAID_DUE_DAYS, EVIDENCE_REQUIRED } from "@/domain/settings/keys";
import { findListPaymentStatusByIds } from "@/repositories/payment-targets";

// 06-23(B-C8 · H-1 · PN-6): 기안자의 승인된 지출결의마다 증빙 신호 하나 — 05 종류 훅(expenseBlockedAfterApproval)이 「내 차례」 [막힘] 한 줄로 낸다.
// 판정은 다시 쓰지 않는다 — 증빙 유무 = 06-03 hasEvidence(살아 있는 파일), 증빙 없음 · 지급 대기 = 06-04 evidenceGateDecision P3, 선결제 기한 = 06-06 prepaidDueInfo, 무효 = 05 listEvidenceVoidSignals.
// 잎 모듈만 값 import한다(@/domain/payments · @/domain/evidence-reviews index는 domain/expenses로 되돌아온다 — import 고리).

export type EvidenceSignalFacts = { prepaidOverdueDays: number | null; missingUnpaid: boolean; voided: boolean };

// 우선순위 판정 한 곳 — 선결제 기한 초과 > 증빙 없음 · 지급 대기 > 증빙 무효.
export function pickExpenseEvidenceSignal(facts: EvidenceSignalFacts): string | null {
  if (facts.prepaidOverdueDays !== null && facts.prepaidOverdueDays > 0) return `선결제 증빙 ${facts.prepaidOverdueDays}일 경과`;
  if (facts.missingUnpaid) return "증빙 없음 · 지급 대기";
  if (facts.voided) return "증빙 무효";
  return null;
}

// ids = 05 엔진이 넘긴 기안자 본인 승인 문서 id. 지급 행 · 선결제 · 면제로 먼저 좁힌 문서만 증빙 유무를 묶음 한 번(ownersWithEvidence)으로 읽는다.
export async function listExpenseEvidenceSignals(viewer: Viewer, input: { ids: readonly string[]; today: string }): Promise<Map<string, { situation: string }>> {
  const signals = new Map<string, { situation: string }>();
  if (input.ids.length === 0) return signals;
  const voided = new Set(await listEvidenceVoidSignals(viewer, { ownerKind: EXPENSE_DOCUMENT_KIND, ownerIds: input.ids }));
  const statuses = await findListPaymentStatusByIds(viewer, input.ids);
  const evidenceRequired = await getSettingValue(EVIDENCE_REQUIRED);
  const candidates = statuses.map((status) => {
    const paid = status.payDate !== null;
    return { status, paid, missingCandidate: !paid && !status.prepaid && !status.waived && evidenceRequired, prepaidCandidate: paid && status.prepaid && !status.waived };
  });
  const candidateIds = candidates.filter((c) => c.missingCandidate || c.prepaidCandidate).map((c) => c.status.id);
  const withEvidence = await ownersWithEvidence(viewer, { ownerKind: EXPENSE_DOCUMENT_KIND, ownerIds: candidateIds });
  let dueDays: number | null = null;
  for (const { status, paid, missingCandidate, prepaidCandidate } of candidates) {
    let missingUnpaid = false;
    let prepaidOverdueDays: number | null = null;
    if (missingCandidate || prepaidCandidate) {
      const has = withEvidence.has(status.id);
      // P3 — 확인 게이트(gates)는 끈다: 증빙이 있으면 기안자 몫이 아니다(`확인 전`은 넣지 않는다).
      missingUnpaid =
        !paid && !evidenceGateDecision({ evidenceRequired, hasEvidence: has, prepaid: status.prepaid, waived: status.waived, confirmation: null, drafterName: "" }, false).allowed;
      if (prepaidCandidate) {
        dueDays ??= await getSettingValue(EVIDENCE_PREPAID_DUE_DAYS);
        prepaidOverdueDays = prepaidDueInfo({ prepaid: true, hasEvidence: has, waived: false, paidOn: status.payDate, dueDays, today: input.today })?.overdueDays ?? null;
      }
    }
    const situation = pickExpenseEvidenceSignal({ prepaidOverdueDays, missingUnpaid, voided: voided.has(status.id) && !status.waived });
    if (situation) signals.set(status.id, { situation });
  }
  return signals;
}
