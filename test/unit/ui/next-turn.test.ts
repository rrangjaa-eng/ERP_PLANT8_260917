import { describe, expect, it } from "vitest";
import {
  buildNextTurnView,
  NEXT_TURN_TAG_ORDER,
  type NextTurnItem,
} from "../../../ui/next-turn/build-next-turn-view";

// D-24의 계약 고정: 「내 차례」의 표시 계산(정렬·절단·넘침 건수·블록 표시 여부)이
// 렌더와 무관한 순수 함수 하나에 있는지를 검증한다. docs/design/SYSTEM.md §7-4가
// 정본이다 — 최대 6줄, 넘치면 3차 버튼으로 넘침 건수, 태그 순서 고정
// (막힘 → 오늘 → 결재 → 대기), 항목 0이면 블록 자체가 사라짐.

function item(overrides: Partial<NextTurnItem> = {}): NextTurnItem {
  return {
    tag: "대기",
    label: "테스트 항목",
    reason: "이유",
    amount: 1000,
    action: { label: "열기", href: "/x" },
    ...overrides,
  };
}

describe("buildNextTurnView", () => {
  it("항목이 0개면 블록을 렌더하지 않는다", () => {
    const result = buildNextTurnView([]);
    expect(result.visible).toBe(false);
  });

  it("항목이 6개 이하면 전부 보이고 넘침 건수가 0이다", () => {
    const items = Array.from({ length: 6 }, (_, i) => item({ label: `항목 ${i}` }));
    const result = buildNextTurnView(items);
    expect(result.visible).toBe(true);
    if (result.visible) {
      expect(result.items).toHaveLength(6);
      expect(result.overflowCount).toBe(0);
    }
  });

  it("항목이 7개이면 6개만 보이고 넘침 건수가 1이다", () => {
    const items = Array.from({ length: 7 }, (_, i) => item({ label: `항목 ${i}` }));
    const result = buildNextTurnView(items);
    expect(result.visible).toBe(true);
    if (result.visible) {
      expect(result.items).toHaveLength(6);
      expect(result.overflowCount).toBe(1);
    }
  });

  it("항목이 20개이면 6개만 보이고 넘침 건수가 14다", () => {
    const items = Array.from({ length: 20 }, (_, i) => item({ label: `항목 ${i}` }));
    const result = buildNextTurnView(items);
    expect(result.visible).toBe(true);
    if (result.visible) {
      expect(result.items).toHaveLength(6);
      expect(result.overflowCount).toBe(14);
    }
  });

  it("태그가 역순으로 섞인 입력이 막힘 → 오늘 → 결재 → 대기 순으로 나온다", () => {
    const items: NextTurnItem[] = [
      item({ tag: "대기", label: "A" }),
      item({ tag: "결재", label: "B" }),
      item({ tag: "오늘", label: "C" }),
      item({ tag: "막힘", label: "D" }),
    ];
    const result = buildNextTurnView(items);
    expect(result.visible).toBe(true);
    if (result.visible) {
      expect(result.items.map((i) => i.tag)).toEqual(["막힘", "오늘", "결재", "대기"]);
    }
  });

  it("같은 태그 안에서는 입력 순서가 보존된다(안정 정렬)", () => {
    const items: NextTurnItem[] = [item({ tag: "대기", label: "먼저" }), item({ tag: "대기", label: "나중" })];
    const result = buildNextTurnView(items);
    expect(result.visible).toBe(true);
    if (result.visible) {
      expect(result.items.map((i) => i.label)).toEqual(["먼저", "나중"]);
    }
  });

  it("절단은 정렬 뒤에 일어난다 — 막힘 항목이 6줄 밖으로 밀려나지 않는다", () => {
    const trailing = Array.from({ length: 6 }, (_, i) => item({ tag: "대기", label: `대기 ${i}` }));
    const items = [...trailing, item({ tag: "막힘", label: "막힘 항목" })];
    const result = buildNextTurnView(items);
    expect(result.visible).toBe(true);
    if (result.visible) {
      expect(result.items.at(0)?.tag).toBe("막힘");
      expect(result.overflowCount).toBe(1);
    }
  });

  it("같은 입력에 같은 결과를 낸다(결정적)", () => {
    const items = [item({ tag: "오늘" }), item({ tag: "막힘" })];
    const first = buildNextTurnView(items);
    const second = buildNextTurnView(items);
    expect(first).toEqual(second);
  });

  it("입력 배열을 변형하지 않는다", () => {
    const items = [item({ tag: "대기" }), item({ tag: "막힘" })];
    const snapshot = items.map((i) => i.tag);
    buildNextTurnView(items);
    expect(items.map((i) => i.tag)).toEqual(snapshot);
  });

  it("정렬 순서가 모듈 안 단일 상수에서 온다", () => {
    expect(NEXT_TURN_TAG_ORDER).toEqual(["막힘", "오늘", "결재", "대기"]);
  });
});
