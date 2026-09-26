// /review team-scope-create-review.md P3(1) — 복사 등록의 팀·PM 미리 고르기는
// 팀 범위로 좁힌 옵션에 있을 때만 쓴다(다른 팀 출처 값은 폴백으로 떨어진다).
export function resolveDefaultOptionId(
  candidate: string | undefined,
  options: { id: string }[],
  fallback?: string,
): string | undefined {
  if (candidate && options.some((option) => option.id === candidate)) return candidate;
  return fallback;
}
