import { isRetiredOn, type PersonDto } from "@/domain/people";
import { kstToday } from "@/lib/kst-date";

// D8-07 · UI-SPEC 배지 조합 규칙: 사람 목록 「상태」 칸의 판정. 보관된 사람은 「보관됨」만 보이고 로그인 배지는
// 억제한다. 두 배지는 칼럼마다 독립이고 순서는 고정이다. 정보 노출표가 가린 필드는 DTO에 키가 없으므로
// 키가 있을 때만 판정한다 — 없음을 NULL/false로 오인하지 않는다.
// 07-17 SC-11(U2 · D-728): 퇴직 > 잠김 > 위 두 배지 — `퇴직` · `잠김`은 한 값만(퇴직자는 잠겨 있어도 `퇴직`).
export type PersonLoginBadge = "첫 로그인 전" | "임시 비밀번호 사용 중";

export type PersonLoginStatus =
  | { kind: "archived" }
  | { kind: "word"; word: "퇴직" | "잠김" }
  | { kind: "badges"; badges: PersonLoginBadge[] };

export function personLoginStatus(
  person: Partial<Pick<PersonDto, "archivedAt" | "firstLoginAt" | "passwordIsTemporary" | "resignationDate" | "locked">>,
  today: string = kstToday(new Date()),
): PersonLoginStatus {
  if (person.archivedAt) return { kind: "archived" };
  if (person.resignationDate !== undefined && isRetiredOn(person.resignationDate, today)) return { kind: "word", word: "퇴직" };
  if (person.locked === true) return { kind: "word", word: "잠김" };
  const badges: PersonLoginBadge[] = [];
  if ("firstLoginAt" in person && person.firstLoginAt === null) badges.push("첫 로그인 전");
  if (person.passwordIsTemporary === true) badges.push("임시 비밀번호 사용 중");
  return { kind: "badges", badges };
}

// 07-17 SC-12: 상세 로그인 섹션 `로그인 상태` 한 값 — 목록 판정을 그대로 쓰고 배지가 둘이면 앞의 것(첫 로그인 전), 없으면 `정상`.
export type PersonLoginWord = "보관됨" | "퇴직" | "잠김" | PersonLoginBadge | "정상";

export function personLoginWord(status: PersonLoginStatus): PersonLoginWord {
  if (status.kind === "archived") return "보관됨";
  if (status.kind === "word") return status.word;
  return status.badges[0] ?? "정상";
}
