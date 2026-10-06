import { describe, expect, it } from "vitest";
import { pickEmptyText, pickFootLine } from "@/ui/pick-dialog/PickDialog";

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

// 06-29(E-24 · SP-8) — 바닥 줄 한 자리의 우선순위와 새 이름 `프로젝트`의 조사.
describe("pickFootLine — 바닥 줄 우선순위(E-24)", () => {
  it("결과 줄 > 고를 수 있는 줄 없음 이유 > 고른 것 없음 순이고 셋 다 없으면 null이다", () => {
    expect(pickFootLine("결과", "이을 수 있는 줄 없음", "고른 줄 없음")).toBe("결과");
    expect(pickFootLine(null, "이을 수 있는 줄 없음", "고른 줄 없음")).toBe("이을 수 있는 줄 없음");
    expect(pickFootLine(null, undefined, "고른 줄 없음")).toBe("고른 줄 없음");
    expect(pickFootLine(null, null, null)).toBeNull();
  });

  it("noun `프로젝트`도 받침으로 조사를 고른다", () => {
    expect(pickEmptyText("프로젝트", "no-match")).toBe("조건에 맞는 프로젝트가 없습니다");
  });
});
