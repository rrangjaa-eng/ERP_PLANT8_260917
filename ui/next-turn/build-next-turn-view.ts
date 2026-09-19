// D-24: 「내 차례」 표시 계약 — 렌더와 무관한 순수 함수. DOM·React 의존 없음.
// docs/design/SYSTEM.md §7-4(L673-679)가 정본이다: 최대 6줄, 넘치면 3차 버튼으로
// 남은 건수, 태그 순서 고정(막힘 → 오늘 → 결재 → 대기), 항목 0이면 블록 자체가
// 사라진다.

/** §7-4가 고정한 태그 순서. 정렬 기준은 이 배열 하나뿐이다 — 비교 함수 안에
 * 태그 이름을 흩어 놓지 않는다. */
export const NEXT_TURN_TAG_ORDER = ["막힘", "오늘", "결재", "대기"] as const;

export type NextTurnTag = (typeof NEXT_TURN_TAG_ORDER)[number];

export type NextTurnAction = {
  label: string;
  href: string;
};

export type NextTurnItem = {
  tag: NextTurnTag;
  /** 대상 — 상황. 예: "아이오닉9 쇼케이스 — 무대설치 지출결의" */
  label: string;
  /** 이유. §7-4: 이유와 다음 한 수는 반드시 같은 줄에 있다. */
  reason: string;
  amount: number;
  action: NextTurnAction;
};

const MAX_VISIBLE_ITEMS = 6;

export type NextTurnView =
  | { visible: false }
  | { visible: true; items: NextTurnItem[]; overflowCount: number };

function tagRank(tag: NextTurnTag): number {
  return NEXT_TURN_TAG_ORDER.indexOf(tag);
}

/**
 * 「내 차례」 표시 계약(D-24). 항목 배열을 받아 보일 항목·넘침 건수·블록 렌더
 * 여부를 계산한다. 입력을 변형하지 않고, 같은 입력엔 항상 같은 결과를 낸다.
 */
export function buildNextTurnView(items: readonly NextTurnItem[]): NextTurnView {
  if (items.length === 0) {
    return { visible: false };
  }

  // 정렬(안정 정렬) 뒤에 절단 — 이 순서가 뒤집히면 막힘 항목이 「더 보기」 뒤로 숨는다.
  const sorted = [...items].sort((a, b) => tagRank(a.tag) - tagRank(b.tag));
  const visible = sorted.slice(0, MAX_VISIBLE_ITEMS);
  const overflowCount = Math.max(0, sorted.length - MAX_VISIBLE_ITEMS);

  return { visible: true, items: visible, overflowCount };
}
