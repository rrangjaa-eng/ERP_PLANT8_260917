import type { PersonDto } from "@/domain/people";

// D8-07 · UI-SPEC 배지 조합 규칙: 사람 목록 「상태」 칸의 판정. 보관된 사람은 「보관됨」만 보이고 로그인 배지는
// 억제한다. 두 배지는 칼럼마다 독립이고 순서는 고정이다. 정보 노출표가 가린 필드는 DTO에 키가 없으므로
// 키가 있을 때만 판정한다 — 없음을 NULL/false로 오인하지 않는다.
export type PersonLoginBadge = "첫 로그인 전" | "임시 비밀번호 사용 중";

export type PersonLoginStatus = { kind: "archived" } | { kind: "badges"; badges: PersonLoginBadge[] };

export function personLoginStatus(
  person: Partial<Pick<PersonDto, "archivedAt" | "firstLoginAt" | "passwordIsTemporary">>,
): PersonLoginStatus {
  if (person.archivedAt) return { kind: "archived" };
  const badges: PersonLoginBadge[] = [];
  if ("firstLoginAt" in person && person.firstLoginAt === null) badges.push("첫 로그인 전");
  if (person.passwordIsTemporary === true) badges.push("임시 비밀번호 사용 중");
  return { kind: "badges", badges };
}
