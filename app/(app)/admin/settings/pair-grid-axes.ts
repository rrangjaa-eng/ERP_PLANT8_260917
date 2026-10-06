// 06-02(SP-9 · 검토 P2-2): 짝 격자 한 축 = 코드표의 활성 값(sortOrder 순) + 저장된 짝에 남은 보관 값을 끝에 「(보관됨)」으로.
// 보관 값의 짝은 판정에서 빈 행이 아니므로 화면에서도 보이고 해제할 수 있어야 한다(설정 화면 optionsFor의 「(보관됨)」 선례).
export function pairGridAxis(
  items: readonly { value: string; label: string; active: boolean }[],
  storedValues: readonly string[],
): { value: string; label: string }[] {
  const axis = items.filter((item) => item.active).map((item) => ({ value: item.value, label: item.label }));
  for (const value of new Set(storedValues)) {
    if (axis.some((option) => option.value === value)) continue;
    const label = items.find((item) => item.value === value)?.label ?? value;
    axis.push({ value, label: `${label} (보관됨)` });
  }
  return axis;
}
