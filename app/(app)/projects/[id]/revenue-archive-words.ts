// 07.6-01(design r1 G2 · G6 · r2 N2): 매출 칸 줄 지우기 · 되돌리기 화면 낱말 — 순수 함수(member-words.ts 꼴).
// 일반 서버 오류(lib/actions/handle-server-error.ts와 같은 글자 — 단위 시험이 고정)는 다시 해 보면 될 수 있는 실패라 연결 실패와 같이
// 버튼을 남긴다(retry). 버튼을 치우는 것은 원인이 있는 도메인 거부뿐이다(SYSTEM.md §7-8 결과 줄).
const SERVER_GENERIC = "처리 중 오류 · 잠시 후 다시 시도";

export type RevenueActionFailure = { text: string; retry: boolean };

export function revenueRemovedLine(kind: "issue" | "payment", date: string): string {
  return `${kind === "issue" ? "발행" : "입금"} 줄 ${date} 삭제됨`;
}

// 지우기 거부는 비활성 `삭제`가 그 자리에 남으니 원인의 마지막 ` · ` 앞부분만 쓴다(delete-holiday.tsx deleteFailure 꼴 — 「삭제 불가」 · 「새로 고침」 꼬리를 겹쳐 쓰지 않는다).
export function revenueDeleteFailure(serverError: string | null): RevenueActionFailure {
  if (serverError === null || serverError === SERVER_GENERIC) return { text: "삭제 실패 · 다시 시도", retry: true };
  const cut = serverError.lastIndexOf(" · ");
  return { text: `삭제 실패 · ${cut < 0 ? serverError : serverError.slice(0, cut)}`, retry: false };
}

// 되돌리기 거부는 버튼이 사라지므로 원인의 꼬리가 다음 한 수다 — 자르지 않는다.
export function revenueUndoFailure(serverError: string | null): RevenueActionFailure {
  if (serverError === null || serverError === SERVER_GENERIC) return { text: "되돌리기 실패 · 다시 시도", retry: true };
  return { text: `되돌리기 실패 · ${serverError}`, retry: false };
}
