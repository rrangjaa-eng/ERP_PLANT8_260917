import { describe, expect, it } from "vitest";
import { documentNumberFormat, type DocumentNumberFormat } from "@/domain/document-numbering";

// 04-05(ADMN-09) Task 2 ③④ — 서식 조립 순수 함수. 설정·DB 없이 돈다.
const DEFAULT_FORMAT: DocumentNumberFormat = {
  prefix: "",
  yearDigits: 2,
  seqDigits: 3,
  separator: "",
  seqStart: 1,
};

describe("documentNumberFormat", () => {
  it("기본 서식으로 2026년 첫 순번은 26001이다", () => {
    expect(documentNumberFormat({ year: 2026, seq: 1 }, DEFAULT_FORMAT)).toBe("26001");
  });

  it("순번 자릿수를 4로 바꾸면 260001 형태가 된다", () => {
    expect(documentNumberFormat({ year: 2026, seq: 1 }, { ...DEFAULT_FORMAT, seqDigits: 4 })).toBe("260001");
  });

  it("접두어를 넣으면 그 값이 번호 맨 앞에 붙는다", () => {
    expect(documentNumberFormat({ year: 2026, seq: 1 }, { ...DEFAULT_FORMAT, prefix: "PRJ" })).toBe("PRJ26001");
  });

  it("구분자를 넣으면 연도와 순번 사이에 들어간다", () => {
    expect(documentNumberFormat({ year: 2026, seq: 1 }, { ...DEFAULT_FORMAT, separator: "-" })).toBe("26-001");
  });

  it("연도 자릿수 4는 연도 전체를 그대로 쓴다", () => {
    expect(documentNumberFormat({ year: 2026, seq: 1 }, { ...DEFAULT_FORMAT, yearDigits: 4 })).toBe("2026001");
  });

  it("연도가 바뀌면(2027) 순번 1부터 다시 시작한 값이 27001이다", () => {
    expect(documentNumberFormat({ year: 2027, seq: 1 }, DEFAULT_FORMAT)).toBe("27001");
  });

  it("순번 시작값을 100으로 바꾸면 카운터 값 1이 100으로 표시된다", () => {
    expect(documentNumberFormat({ year: 2026, seq: 1 }, { ...DEFAULT_FORMAT, seqStart: 100 })).toBe("26100");
  });

  it("순번이 자릿수(3)를 넘치면(1000) 잘리지 않고 자릿수가 늘어난 문자열이 나온다", () => {
    expect(documentNumberFormat({ year: 2026, seq: 1000 }, DEFAULT_FORMAT)).toBe("261000");
  });

  it("접두어·구분자·자릿수를 함께 바꾼 조합도 정확히 조립된다", () => {
    const format: DocumentNumberFormat = { prefix: "P-", yearDigits: 4, seqDigits: 5, separator: "-", seqStart: 1 };
    expect(documentNumberFormat({ year: 2026, seq: 7 }, format)).toBe("P-2026-00007");
  });
});
