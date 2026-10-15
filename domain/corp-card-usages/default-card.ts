// 06-33(G-06-B · 사용자 카드 2026-10-06 20:42 KST 「카드 기본값 순서 더하기」): 카드 사용 새 건의 카드 기본값 순서 — 순수 함수(DB · 권한을 읽지 않는다).
// ① 직전 등록의 카드가 옵션에 있으면 그 카드 ② 본인 개인 카드가 정확히 한 장이면 그 카드 ③ 오늘 소속 팀의 팀 카드가 정확히 한 장이면 그 카드
// ④ 옵션이 한 장뿐이면 그 카드 ⑤ 아니면 빈칸. 개인 카드가 여럿이면 팀 카드로 내려가지 않고 빈칸이다(A-1) — 잘못된 카드가 미리 골라지는 것보다 고르게 하는 편이 낫다.
// 공용 카드는 ④(옵션 한 장)에서만 채워진다(A-3). 옵션은 서버가 자격으로 거른 카드뿐이라 기본값도 그 밖으로 나가지 않는다.

export type DefaultCardOption = { id: string; kind: string; own: boolean };

export function pickDefaultCardId(input: { options: readonly DefaultCardOption[]; lastCardId: string | null }): string | null {
  const { options, lastCardId } = input;
  if (lastCardId !== null && options.some((option) => option.id === lastCardId)) return lastCardId;
  const ownPersonal = options.filter((option) => option.own && option.kind === "personal");
  if (ownPersonal.length > 0) return ownPersonal.length === 1 ? (ownPersonal[0]?.id ?? null) : null;
  const ownTeam = options.filter((option) => option.own && option.kind === "team");
  if (ownTeam.length > 0) return ownTeam.length === 1 ? (ownTeam[0]?.id ?? null) : null;
  return options.length === 1 ? (options[0]?.id ?? null) : null;
}
