import { describe, expect, it } from "vitest";
import { pickEmptyText, pickFootLine, pickManyCapReached, pickManyPrimaryLabel, pickOutcomeOf, pickRejectionClears, pickTruncatedText } from "@/ui/pick-dialog/PickDialog";

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

// 06.2 SP-62-1 — 다중 변형: noun `사람`의 조사(받침 있는 `줄`과 같은 `이`)와 1차 라벨 `{동작} N`(0이면 숫자 없음).
describe("pickEmptyText — noun 사람 (06.2 SP-62-1)", () => {
  it("사람은 조사 `이`를 쓰고 기존 이름의 조사는 그대로다", () => {
    expect(pickEmptyText("사람", "no-match")).toBe("조건에 맞는 사람이 없습니다");
    expect(pickEmptyText("사람", "none-selectable")).toBe("고를 수 있는 사람이 없습니다");
    expect(pickEmptyText("줄", "no-match")).toBe("조건에 맞는 줄이 없습니다");
    expect(pickEmptyText("거래처", "no-match")).toBe("조건에 맞는 거래처가 없습니다");
    expect(pickEmptyText("프로젝트", "none-selectable")).toBe("고를 수 있는 프로젝트가 없습니다");
  });
});

describe("pickManyPrimaryLabel — 1차 `{동작} N` (06.2 SP-62-1)", () => {
  it("0이면 라벨 그대로, 1 이상이면 숫자가 뒤에 붙는다", () => {
    expect(pickManyPrimaryLabel("참여자 더하기", 0)).toBe("참여자 더하기");
    expect(pickManyPrimaryLabel("참여자 더하기", 1)).toBe("참여자 더하기 1");
    expect(pickManyPrimaryLabel("참여자 더하기", 3)).toBe("참여자 더하기 3");
  });
});

// 06.5 V12 — noun `지급처`(거래처 또는 직원)는 받침 없는 `거래처`와 같은 조사 `가`.
describe("pickEmptyText — noun 지급처 (06.5 V12)", () => {
  it("두 꼴 모두 조사 `가`", () => {
    expect(pickEmptyText("지급처", "no-match")).toBe("조건에 맞는 지급처가 없습니다");
    expect(pickEmptyText("지급처", "none-selectable")).toBe("고를 수 있는 지급처가 없습니다");
  });
});

// 06.1-03 Task 3 (SP-6106 · G-4 · RP-18) — 확장 다섯: 낱말 셋(받침 조사) · 다중 상한 · 단일 거부 결과 · 넘침 한도. 컴포넌트 상태 · 비동기 첫 조회는 E2E(dev-components) 몫이다.
describe("pickEmptyText — noun 문서 · 증빙 · 카드 사용 (06.1 SP-6106)", () => {
  it("마지막 글자 받침으로 조사를 고른다(문서 가 · 증빙 이 · 카드 사용 이)", () => {
    expect(pickEmptyText("증빙", "no-match")).toBe("조건에 맞는 증빙이 없습니다");
    expect(pickEmptyText("문서", "no-match")).toBe("조건에 맞는 문서가 없습니다");
    expect(pickEmptyText("카드 사용", "none-selectable")).toBe("고를 수 있는 카드 사용이 없습니다");
    expect(pickEmptyText("문서", "none-selectable")).toBe("고를 수 있는 문서가 없습니다");
    expect(pickEmptyText("증빙", "none-selectable")).toBe("고를 수 있는 증빙이 없습니다");
    expect(pickEmptyText("카드 사용", "no-match")).toBe("조건에 맞는 카드 사용이 없습니다");
  });

  it("기존 다섯 낱말의 두 갈래 글자는 지금과 같다", () => {
    expect(pickEmptyText("줄", "no-match")).toBe("조건에 맞는 줄이 없습니다");
    expect(pickEmptyText("줄", "none-selectable")).toBe("고를 수 있는 줄이 없습니다");
    expect(pickEmptyText("거래처", "no-match")).toBe("조건에 맞는 거래처가 없습니다");
    expect(pickEmptyText("거래처", "none-selectable")).toBe("고를 수 있는 거래처가 없습니다");
    expect(pickEmptyText("프로젝트", "no-match")).toBe("조건에 맞는 프로젝트가 없습니다");
    expect(pickEmptyText("프로젝트", "none-selectable")).toBe("고를 수 있는 프로젝트가 없습니다");
    expect(pickEmptyText("사람", "no-match")).toBe("조건에 맞는 사람이 없습니다");
    expect(pickEmptyText("사람", "none-selectable")).toBe("고를 수 있는 사람이 없습니다");
    expect(pickEmptyText("지급처", "no-match")).toBe("조건에 맞는 지급처가 없습니다");
    expect(pickEmptyText("지급처", "none-selectable")).toBe("고를 수 있는 지급처가 없습니다");
  });
});

describe("pickManyCapReached — 다중 상한 (06.1 SP-6106 ⑶)", () => {
  it("고른 수가 상한에 닿았을 때만 참이고 상한이 없으면 늘 거짓이다", () => {
    expect(pickManyCapReached(19, 20)).toBe(false);
    expect(pickManyCapReached(20, 20)).toBe(true);
    expect(pickManyCapReached(3, undefined)).toBe(false);
  });
});

describe("pickOutcomeOf — 단일 1차 결과 가르기 (06.1 SP-6106 ⑷)", () => {
  it("undefined · true · { ok: true }는 닫고 false는 거부 없이 열어 둔다", () => {
    expect(pickOutcomeOf(undefined)).toBe("close");
    expect(pickOutcomeOf(true)).toBe("close");
    expect(pickOutcomeOf({ ok: true })).toBe("close");
    expect(pickOutcomeOf(false)).toBe("keep");
  });

  it("{ ok: false, reason, retryable }는 그 값 그대로 거부로 돌려준다", () => {
    expect(pickOutcomeOf({ ok: false, reason: "이미 다른 문서에 붙음 · 새로 고침", retryable: false })).toEqual({
      reject: { reason: "이미 다른 문서에 붙음 · 새로 고침", retryable: false },
    });
    expect(pickOutcomeOf({ ok: false, reason: "붙이지 못함 · 다시 시도", retryable: true })).toEqual({
      reject: { reason: "붙이지 못함 · 다시 시도", retryable: true },
    });
  });
});

describe("pickTruncatedText — 넘침 바닥 줄 (06.1 SP-6106 ⑸)", () => {
  it("한도를 안 주면 기존 50건 글자 그대로이고 주면 그 수가 들어간다", () => {
    expect(pickTruncatedText(undefined)).toBe("50건 넘음 · 검색으로 좁히기");
    expect(pickTruncatedText(20)).toBe("20건 넘음 · 검색으로 좁히기");
  });
});

// 디자인 검토 결함 F — 단일 거부는 「다른 고를 수 있는 행」을 가리킬 때만 걷힌다(막힌 행을 눌렀다 원래 행으로 돌아와도 1차가 풀리지 않는다).
describe("pickRejectionClears — 단일 거부를 걷는 때 (06.1 SP-6106 ⑷)", () => {
  const row = (id: string, selectable: boolean) => ({ type: "row" as const, id, title: id, selectable });

  it("다른 고를 수 있는 행을 가리킬 때만 참이다", () => {
    expect(pickRejectionClears("d5", row("d2", true))).toBe(true);
    expect(pickRejectionClears(null, row("d2", true))).toBe(true);
    // d5가 거부된 뒤 막힌 d3를 거쳐 d5로 돌아와도(거부된 행 그대로) 풀리지 않는다.
    expect(pickRejectionClears("d5", row("d5", true))).toBe(false);
  });

  it("막힌 행 · 같은 행 · 가리키는 행 없음은 거짓이다", () => {
    expect(pickRejectionClears("d5", row("d3", false))).toBe(false);
    expect(pickRejectionClears("d5", row("d5", true))).toBe(false);
    expect(pickRejectionClears("d5", null)).toBe(false);
  });
});
