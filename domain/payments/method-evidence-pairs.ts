// 06-02(Q4 · SP-9): 지급 방식 × 증빙 종류 짝 판정 — 순수 함수. 설정(`payment.method_evidence_pairs`)을 스스로 읽지 않는다.
// 06-04 지급 게이트가 값을 트랜잭션 전에 읽어 넘긴다. 짝 목록이 비거나 그 지급 방식의 짝이 하나도 없으면 검사 없음(빈 행).

export type MethodEvidencePair = { method: string; evidence: string };

export function isMethodEvidencePairAllowed(
  pairs: readonly MethodEvidencePair[],
  input: { method: string; evidenceType: string },
): boolean {
  const ofMethod = pairs.filter((pair) => pair.method === input.method);
  if (ofMethod.length === 0) return true;
  return ofMethod.some((pair) => pair.evidence === input.evidenceType);
}
