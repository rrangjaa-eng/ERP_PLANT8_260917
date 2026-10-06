import { describe, expect, it } from "vitest";
import { expenseNumberFormat } from "@/domain/document-numbering";

// 05-03 — 지출결의 번호 `{프로젝트 번호}{구분자}{순번}`(사용자 결정 2026-09-26 #6). 순번 시작값은 표시 오프셋이고
// 자릿수를 넘친 순번은 자르지 않는다(documentNumberFormat과 같은 규칙).
const FORMAT = { separator: "-", seqDigits: 4, seqStart: 1 };

describe("expenseNumberFormat", () => {
  it("프로젝트 26001의 넷째 순번은 26001-0004다", () => {
    expect(expenseNumberFormat("26001", 4, FORMAT)).toBe("26001-0004");
  });

  it("순번 시작값 101이면 넷째 순번은 26001-0104다", () => {
    expect(expenseNumberFormat("26001", 4, { ...FORMAT, seqStart: 101 })).toBe("26001-0104");
  });

  it("순번이 자릿수를 넘으면 자르지 않는다 — 26001-10000", () => {
    expect(expenseNumberFormat("26001", 10000, FORMAT)).toBe("26001-10000");
  });
});
