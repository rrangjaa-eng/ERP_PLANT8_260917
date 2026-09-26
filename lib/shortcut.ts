// D-94 · 엔지 리뷰 C §2 P2 — Ctrl 조합 판정 한 함수. 등록 폼(04-08)의
// project-form.tsx와 견적 표 키보드(04-28)가 같은 함수를 쓴다. 순수 함수,
// import 없음.
export type CtrlComboEvent = {
  ctrlKey: boolean;
  key: string;
  repeat: boolean;
  isComposing?: boolean;
  metaKey?: boolean;
  nativeEvent?: { isComposing?: boolean };
};

export function isCtrlCombo(event: CtrlComboEvent, key: string): boolean {
  if (!event.ctrlKey) return false;
  if (event.key.toLowerCase() !== key.toLowerCase()) return false;
  if (event.repeat) return false;
  if (event.isComposing || event.nativeEvent?.isComposing) return false;
  return true;
}
