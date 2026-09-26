// 04-21(DR-6 · B-03 · ENG-D9) — UI-SPEC rev 5 Copywriting 「막힘 — 미저장 편집」. 상태 전환 트리거와
// 그룹 B의 새 차수·고객 승인 모달(04-24)이 같은 함수 · 같은 글자를 쓴다.
export function unsavedEditsReason(count: number): string | null {
  return count >= 1 ? `저장 안 한 편집 ${count}칸 · 먼저 일괄 저장` : null;
}
