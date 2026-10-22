// 제출 폼의 서버 검증 오류 뒤 포커스를 오류 난 첫 칸으로 옮긴다(07-08 감사 D1). `aria-invalid="true"`인 칸이 없으면(폼 전체 오류) 아무것도 하지 않는다.
// blur 저장 칸(설정 화면)에는 쓰지 않는다 — Tab 이동을 빼앗기 때문이다.
export function focusFirstInvalid(formId: string): void {
  document.getElementById(formId)?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
}
