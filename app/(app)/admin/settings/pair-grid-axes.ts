// 06-02(SP-9 · 검토 P2-2): 짝 격자 한 축 = 코드표의 활성 값(sortOrder 순) + 저장된 짝에 남은 보관 값을 끝에 「(보관됨)」으로.
// 보관 = 비활성 또는 「삭제」(archivedAt) — 보관함 보기 권한이 있으면 listCodeItems가 archivedAt 행도 준다(QA ISSUE-001).
// 보관 값의 짝은 판정에서 빈 행이 아니므로 화면에서도 보이고 해제할 수 있어야 한다(설정 화면 optionsFor의 「(보관됨)」 선례).
export function pairGridAxis(
  items: readonly { value: string; label: string; active: boolean; archivedAt?: Date | null }[],
  storedValues: readonly string[],
): { value: string; label: string; archived?: true }[] {
  const axis: { value: string; label: string; archived?: true }[] = items.filter((item) => item.active && !item.archivedAt).map((item) => ({ value: item.value, label: item.label }));
  for (const value of new Set(storedValues)) {
    if (axis.some((option) => option.value === value)) continue;
    const label = items.find((item) => item.value === value)?.label ?? value;
    axis.push({ value, label: `${label} (보관됨)`, archived: true });
  }
  return axis;
}
