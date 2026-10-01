import { describe, expect, it } from "vitest";
import { validatePrizeRows, type PrizeRowInput } from "@/domain/certs/prize-rules";
import { KRW_COLUMN_MAX } from "@/domain/money";

// 04.3-10 Task 1 ④ · Task 2 ④ — 경품 줄 셀 판정(순수). 서버(applyPrizeChanges)와 I′3 경품 편집 표가 같은 함수를
// 부른다 — 규칙은 하나다(설계 /cso H-3 · E6 a).

function row(overrides: Partial<PrizeRowInput> = {}): PrizeRowInput {
  return { key: overrides.key ?? "r1", name: "갤럭시 탭 S10", unitValue: "1,290,000", delivery: "현장", winnerCount: "1", ...overrides };
}

function codesOf(rows: PrizeRowInput[]) {
  const result = validatePrizeRows(rows);
  if (result.kind !== "invalid") return [];
  return result.cellErrors.map((error) => `${error.rowKey}:${error.column}:${error.code}`);
}

describe("validatePrizeRows — 셀 오류 코드", () => {
  it("빈 경품명 → required · 81자 → tooLong", () => {
    expect(codesOf([row({ name: "  " })])).toEqual(["r1:name:required"]);
    expect(codesOf([row({ name: "가".repeat(81) })])).toEqual(["r1:name:tooLong"]);
  });

  it("같은 경품명(앞뒤 공백 · NFC 정규형이 같다) 두 줄 → 두 줄 다 duplicateName(줄 수 2)", () => {
    const result = validatePrizeRows([row({ key: "a", name: "다이슨 에어랩" }), row({ key: "b", name: " 다이슨 에어랩 " })]);
    expect(result.kind).toBe("invalid");
    if (result.kind !== "invalid") return;
    expect(result.cellErrors).toEqual([
      { rowKey: "a", column: "name", code: "duplicateName", count: 2 },
      { rowKey: "b", column: "name", code: "duplicateName", count: 2 },
    ]);
  });

  it.each(["0", "1.5", "abc", "", String(KRW_COLUMN_MAX + 1), "-3"])("가액 %j → amount", (unitValue) => {
    expect(codesOf([row({ unitValue })])).toEqual(["r1:unitValue:amount"]);
  });

  it("전달 「우편」 → delivery", () => {
    expect(codesOf([row({ delivery: "우편" })])).toEqual(["r1:delivery:delivery"]);
  });

  it.each(["0", "1000", "abc", "", "1.5"])("당첨 수 %j → winnerCount(1~999 정수 — 설계 /cso H-3)", (winnerCount) => {
    expect(codesOf([row({ winnerCount })])).toEqual(["r1:winnerCount:winnerCount"]);
  });

  it("셀 오류가 여럿이면 줄 순서 · 열 순서로 모두 돌려준다(전부 거부)", () => {
    expect(codesOf([row({ key: "a", name: "", unitValue: "abc" }), row({ key: "b", delivery: "우편" })])).toEqual([
      "a:name:required",
      "a:unitValue:amount",
      "b:delivery:delivery",
    ]);
  });
});

describe("validatePrizeRows — 통과", () => {
  it("쉼표 가액 · 현장/택배 · onsite/parcel · 숫자 값을 정규형으로", () => {
    const result = validatePrizeRows([
      row({ key: "a", unitValue: "1,290,000", delivery: "현장", winnerCount: "3" }),
      row({ key: "b", name: "다이슨 에어랩", unitValue: 599000, delivery: "택배", winnerCount: 999 }),
      row({ key: "c", name: "스타벅스 카드", unitValue: "30000", delivery: "onsite" }),
      row({ key: "d", name: "상품권 묶음(2장)", unitValue: "100,000", delivery: "parcel", winnerCount: "1" }),
    ]);
    expect(result).toEqual({
      kind: "ok",
      rows: [
        { key: "a", name: "갤럭시 탭 S10", unitValueKrw: 1_290_000, delivery: "onsite", winnerCount: 3 },
        { key: "b", name: "다이슨 에어랩", unitValueKrw: 599_000, delivery: "parcel", winnerCount: 999 },
        { key: "c", name: "스타벅스 카드", unitValueKrw: 30_000, delivery: "onsite", winnerCount: 1 },
        { key: "d", name: "상품권 묶음(2장)", unitValueKrw: 100_000, delivery: "parcel", winnerCount: 1 },
      ],
    });
  });

  it("가액 50,000 이하도 오류가 아니다(가정 B1 — 목록에서 빠질 뿐)", () => {
    expect(validatePrizeRows([row({ unitValue: "49,000" })]).kind).toBe("ok");
  });

  it("빈 표는 ok(경품 없음 막힘은 QR 생성의 일 — 저장은 막지 않는다)", () => {
    expect(validatePrizeRows([])).toEqual({ kind: "ok", rows: [] });
  });
});

describe("validatePrizeRows — 읽기 전용 위반은 셀 오류가 아니라 readOnly 갈래(N5 a · 닫힘)", () => {
  const saved = [{ id: "p1", name: "갤럭시 탭 S10", delivery: "onsite" as const }];

  it("제출 있는 줄의 경품명 · 전달을 바꾸면 readOnly, 가액 · 당첨 수만 바꾸면 ok", () => {
    const context = { saved, lockedIds: ["p1"], closed: false };
    expect(validatePrizeRows([row({ key: "p1", id: "p1", name: "갤럭시 탭 S11" })], context).kind).toBe("readOnly");
    expect(validatePrizeRows([row({ key: "p1", id: "p1", delivery: "택배" })], context).kind).toBe("readOnly");
    expect(validatePrizeRows([row({ key: "p1", id: "p1", unitValue: "49,000", winnerCount: "4" })], context).kind).toBe("ok");
  });

  it("제출 있는 줄을 지우면 readOnly", () => {
    expect(validatePrizeRows([], { saved, lockedIds: ["p1"], closed: false, deletedIds: ["p1"] }).kind).toBe("readOnly");
  });

  it("닫힌 행사: 새 줄 · 경품명 · 전달 · 삭제는 readOnly, 가액 · 당첨 수는 ok", () => {
    const context = { saved, lockedIds: [], closed: true };
    expect(validatePrizeRows([row({ key: "p1", id: "p1" }), row({ key: "n1", name: "새 경품" })], context).kind).toBe("readOnly");
    expect(validatePrizeRows([row({ key: "p1", id: "p1", name: "다른 이름" })], context).kind).toBe("readOnly");
    expect(validatePrizeRows([], { ...context, deletedIds: ["p1"] }).kind).toBe("readOnly");
    expect(validatePrizeRows([row({ key: "p1", id: "p1", unitValue: "700,000", winnerCount: "2" })], context).kind).toBe("ok");
  });

  it("셀 오류가 읽기 전용 위반보다 먼저다(전부 거부 문장이 칸을 가리킨다)", () => {
    const context = { saved, lockedIds: ["p1"], closed: false };
    expect(validatePrizeRows([row({ key: "p1", id: "p1", name: "", unitValue: "abc" })], context).kind).toBe("invalid");
  });
});
