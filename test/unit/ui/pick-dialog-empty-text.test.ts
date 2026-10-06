import { describe, expect, it } from "vitest";
import { pickEmptyText } from "@/ui/pick-dialog/PickDialog";

// 05 /review B2: 골라내기 빈 목록 문구의 조사 — 받침 없는 `거래처`는 `가`, 받침 있는 `줄`은 `이`.
describe("pickEmptyText", () => {
  it("조건에 맞는 항목이 없을 때 이름 받침에 맞는 조사를 쓴다", () => {
    expect(pickEmptyText("거래처", "no-match")).toBe("조건에 맞는 거래처가 없습니다");
    expect(pickEmptyText("줄", "no-match")).toBe("조건에 맞는 줄이 없습니다");
  });

  it("모두 고를 수 없을 때는 고르는 대상 이름을 따른다", () => {
    expect(pickEmptyText("거래처", "none-selectable")).toBe("고를 수 있는 거래처가 없습니다");
    expect(pickEmptyText("줄", "none-selectable")).toBe("고를 수 있는 줄이 없습니다");
  });
});
