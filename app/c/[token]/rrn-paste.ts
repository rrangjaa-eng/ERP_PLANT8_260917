// 04.3-06 Task 2 ① — 주민등록번호 두 칸의 순수 판정(브라우저 API 없음).

// 앞 칸에 붙여 넣은 글 — 숫자가 정확히 13개면 앞 6 · 뒤 7로 나누고, 그 밖은
// 앞 칸에 숫자만(6자리까지) 남긴다.
export function splitRrnPaste(text: string): { front: string; back: string | null } {
  const digits = text.replace(/\D/g, "");
  if (digits.length === 13) return { front: digits.slice(0, 6), back: digits.slice(6) };
  return { front: digits.slice(0, 6), back: null };
}

// 앞 칸 끝에서 글자를 쳐 넣어 6자리가 찰 때만 뒤 칸으로 간다(고치기 · 지우기는 그대로).
export function shouldAdvance(input: { inputType: string; caretAtEnd: boolean; length: number }): boolean {
  return input.inputType === "insertText" && input.caretAtEnd && input.length === 6;
}
