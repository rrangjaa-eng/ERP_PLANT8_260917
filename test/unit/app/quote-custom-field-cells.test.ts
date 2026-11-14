import { describe, expect, it } from "vitest";
import {
  customColumnKey,
  customFieldCellText,
  customFieldCopyText,
  customFieldDateInput,
  customFieldDuplicateValues,
  customFieldEditValues,
  customFieldKeyOf,
  customFieldSheetItems,
  type QuoteLineCustomColumn,
} from "@/app/(app)/projects/[id]/custom-field-cells";

// 07.5-03(S4 · D-7518 · D-7519 · D-7521 · eng B-7 · B-12) — 견적 표 추가 칸 셀의 순수 함수.
const text: QuoteLineCustomColumn = { key: "cf_text0001", label: "장비 규격", type: "text", options: [], required: false };
const num: QuoteLineCustomColumn = { key: "cf_num00001", label: "설치 높이", type: "number", options: [], required: false };
const date: QuoteLineCustomColumn = { key: "cf_date0001", label: "반입일", type: "date", options: [], required: false };
const select: QuoteLineCustomColumn = { key: "cf_sel00001", label: "설치 구분", type: "select", options: ["실내", "실외"], required: false };
const COLUMNS = [text, select, date];

describe("열 키", () => {
  it("cf_ 접두를 붙이고 벗긴다", () => {
    expect(customColumnKey("cf_text0001")).toBe("cf_cf_text0001");
    expect(customFieldKeyOf("cf_cf_text0001")).toBe("cf_text0001");
    expect(customFieldKeyOf("note")).toBeNull();
  });
});

describe("편집 원문(eng B-7)", () => {
  it("날짜는 앞 10자 · 숫자는 쉼표 없는 글자 · 텍스트 · 선택은 그대로 · 없음은 빈 글자", () => {
    expect(
      customFieldEditValues([text, num, date, select], {
        cf_text0001: "LED 3x2m",
        cf_num00001: 1234.5,
        cf_date0001: "2026-11-04T00:00:00.000Z",
      }),
    ).toEqual({ cf_text0001: "LED 3x2m", cf_num00001: "1234.5", cf_date0001: "2026-11-04", cf_sel00001: "" });
  });

  it("값 객체가 없으면(project.value 꺼짐) 모든 칸이 빈 글자", () => {
    expect(customFieldEditValues([text], undefined)).toEqual({ cf_text0001: "" });
  });
});

describe("셀 표시 글자", () => {
  it("숫자는 수량 꼴(쉼표 · 소수 2자리까지)", () => {
    expect(customFieldCellText(num, "1234.5")).toBe("1,234.5");
    expect(customFieldCellText(num, "1000000")).toBe("1,000,000");
  });

  it("날짜는 그대로 · 활성 선택지는 그대로 · 보관 선택지는 (보관됨) · 없음은 —", () => {
    expect(customFieldCellText(date, "2026-11-04")).toBe("2026-11-04");
    expect(customFieldCellText(select, "실내")).toBe("실내");
    expect(customFieldCellText(select, "옛 구분")).toBe("옛 구분 (보관됨)");
    expect(customFieldCellText(text, "")).toBe("—");
    expect(customFieldCellText(num, "")).toBe("—");
  });

  it("TSV 글자 = 화면 글자, 보관 선택지는 값 글자만", () => {
    expect(customFieldCopyText(num, "1234.5")).toBe("1,234.5");
    expect(customFieldCopyText(select, "옛 구분")).toBe("옛 구분");
    expect(customFieldCopyText(text, "")).toBe("—");
  });
});

describe("날짜 셀 판정(D-7521)", () => {
  it("앞뒤 공백을 지운 엄격 YYYY-MM-DD만 통과", () => {
    expect(customFieldDateInput(" 2026-11-04 ")).toEqual({ value: "2026-11-04" });
    expect(customFieldDateInput("")).toEqual({ value: "" });
    expect(customFieldDateInput("  ")).toEqual({ value: "" });
  });

  it.each(["2026-02-31", "11/4/2026", "2026-1-4"])("%s → 「날짜 아님 · 2026-11-04처럼」", (raw) => {
    expect(customFieldDateInput(raw)).toEqual({ error: "날짜 아님 · 2026-11-04처럼" });
  });
});

describe("복제 원문(D-7518 · eng B-12)", () => {
  it("보관 선택지 값만 빼고 나머지는 그대로 · 입력을 바꾸지 않는다", () => {
    const values = { cf_text0001: "LED", cf_sel00001: "옛 구분", cf_date0001: "2026-11-04" };
    const copy = customFieldDuplicateValues(COLUMNS, values);
    expect(copy).toEqual({ cf_text0001: "LED", cf_sel00001: "", cf_date0001: "2026-11-04" });
    expect(values.cf_sel00001).toBe("옛 구분");
    expect(customFieldDuplicateValues(COLUMNS, { cf_sel00001: "실외" })).toMatchObject({ cf_sel00001: "실외" });
  });
});

describe("폰 행 시트 항목", () => {
  it("열 순서대로 { 칸 이름, 화면 글자 } · 없으면 —", () => {
    expect(customFieldSheetItems(COLUMNS, { cf_text0001: "LED", cf_sel00001: "옛 구분" })).toEqual([
      { label: "장비 규격", value: "LED" },
      { label: "설치 구분", value: "옛 구분 (보관됨)" },
      { label: "반입일", value: "—" },
    ]);
  });

  it("열 0개면 빈 배열", () => {
    expect(customFieldSheetItems([], { cf_text0001: "LED" })).toEqual([]);
  });
});
