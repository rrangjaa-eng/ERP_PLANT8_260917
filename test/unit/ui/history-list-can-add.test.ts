import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HistoryList, type HistoryListProps } from "../../../ui/history-list/HistoryList";

// 07-17 R15: 상한 밖 대상 상세에서는 쓰기 버튼을 그리지 않는다 — `canAdd={false}`면 「새 이력 추가」가 표 아래 · 빈 화면 둘 다 없다.
function render(props: Partial<HistoryListProps>) {
  const base: HistoryListProps = {
    entries: [],
    valueKind: { kind: "text" },
    onAdd: async () => {},
    onCancel: async () => {},
    idPrefix: "t",
    caption: "이력",
  };
  return renderToStaticMarkup(createElement(HistoryList, { ...base, ...props }));
}

const ENTRY = { effectiveFrom: "2026-01-01", displayValue: "가", status: "active" as const };

describe("HistoryList canAdd(07-17 R15)", () => {
  it("기본은 지금 그대로 — 빈 화면 · 표 아래 둘 다 「새 이력 추가」", () => {
    expect(render({})).toContain("새 이력 추가");
    expect(render({ entries: [ENTRY] })).toContain("새 이력 추가");
  });

  it("canAdd=false면 빈 화면 문구만 · 표 아래 버튼 없음", () => {
    const empty = render({ canAdd: false });
    expect(empty).toContain("이 값의 이력이 없습니다");
    expect(empty).not.toContain("새 이력 추가");
    expect(render({ entries: [ENTRY], canAdd: false })).not.toContain("새 이력 추가");
  });

  // F24 DOM 감사 P1: 쓸 수 없는 목록(canAdd=false — 퇴직자 · 상한 밖 · 보기만)에서는 예정 발령 「취소」도 그리지 않는다.
  it("canAdd=false면 예정 줄 「취소」도 없다 · 기본은 그대로 있다", () => {
    const scheduled = { effectiveFrom: "2099-01-01", displayValue: "나", status: "scheduled" as const };
    expect(render({ entries: [scheduled] })).toContain("취소");
    expect(render({ entries: [scheduled], canAdd: false })).not.toContain("취소");
  });
});
