import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  formatKrw,
  formatForeignAmount,
  formatFxRate,
  formatQuantity,
  formatPercent,
  formatCount,
  formatForeignLine,
  stripNumberInput,
  parseNumberInput,
  formatNumberInput,
  numberInputRejectionReason,
} from "@/lib/format-number";

function read(...parts: string[]): string {
  return readFileSync(resolve(process.cwd(), ...parts), "utf8");
}

// D-95 — 숫자는 모두 천 단위 쉼표. 04-UI-SPEC.md rev 5 `## Typography`
// 「숫자 서식(D-95)」 237–245행의 표시 규칙 원문을 그대로 고정한다.
describe("format-number — 표시 서식", () => {
  it("formatKrw — 쉼표, 소수 없음", () => {
    expect(formatKrw(12400000)).toBe("12,400,000");
    expect(formatKrw(-120000)).toBe("-120,000");
    expect(formatKrw(0)).toBe("0");
  });

  it("formatForeignAmount — 쉼표 + 소수 2 고정", () => {
    expect(formatForeignAmount(4400)).toBe("4,400.00");
    expect(formatForeignAmount(1000000)).toBe("1,000,000.00");
  });

  it("formatFxRate — 쉼표 + 끝의 0을 뗀 최대 4자리", () => {
    expect(formatFxRate(1350)).toBe("1,350");
    expect(formatFxRate(1318.18)).toBe("1,318.18");
    expect(formatFxRate(1318.1818)).toBe("1,318.1818");
  });

  it("formatQuantity — 쉼표 + 끝의 0을 뗀 최대 2자리", () => {
    expect(formatQuantity(1)).toBe("1");
    expect(formatQuantity(1.5)).toBe("1.5");
    expect(formatQuantity(1200)).toBe("1,200");
  });

  it("formatPercent — 소수 1자리 + %, null이면 —", () => {
    expect(formatPercent(25.24)).toBe("25.2%");
    expect(formatPercent(-3.44)).toBe("-3.4%");
    expect(formatPercent(null)).toBe("—");
  });

  it("formatCount — 쉼표 정수", () => {
    expect(formatCount(1250)).toBe("1,250");
  });

  it("formatForeignLine — 외화 2행 한 줄, KRW면 null", () => {
    expect(formatForeignLine({ currency: "USD", amount: 4400, fxRate: 1318.1818 })).toBe("USD 4,400.00 @1,318.1818");
    expect(formatForeignLine({ currency: "KRW", amount: 1000, fxRate: 1 })).toBe(null);
  });

  it("(C-15) 비유한 값은 — 로 보인다", () => {
    expect(formatKrw(NaN)).toBe("—");
    expect(formatKrw(Infinity)).toBe("—");
    expect(formatForeignAmount(-Infinity)).toBe("—");
    expect(formatPercent(NaN)).toBe("—");
  });

  it("(C-15) -0과 반올림 뒤 0이 되는 음수는 부호 없이 0", () => {
    expect(formatKrw(-0)).toBe("0");
    expect(formatPercent(-0.04)).toBe("0.0%");
    expect(formatQuantity(-0)).toBe("0");
  });
});

// Task 2 — 표시 지점 다섯(NextTurn·quote-table·revenue-section·
// projects-table·domain/quotes/lines의 formatFieldValue)과 ui/pagination의
// 개별 로캘 변환 호출이 전부 lib/format-number로 이관됐는지 소스 문자열로
// 고정한다(admin-table-caption.test.ts 선례 — 컴포넌트 렌더 없이 단언).
describe("표시 지점 스캔", () => {
  const displayFiles: string[][] = [
    ["ui", "next-turn", "NextTurn.tsx"],
    ["app", "(app)", "projects", "[id]", "quote-table.tsx"],
    ["app", "(app)", "projects", "[id]", "revenue-section.tsx"],
    ["app", "(app)", "projects", "projects-table.tsx"],
  ];

  it.each(displayFiles)("%s에 개별 로캘 변환 호출(toLocaleString)이 없다", (...path) => {
    expect(read(...path)).not.toMatch(/\.toLocaleString\(/);
  });

  it("ui/pagination/page-window.ts에 Intl.NumberFormat 생성이 없다(04-29 이관)", () => {
    expect(read("ui", "pagination", "page-window.ts")).not.toMatch(/new Intl\.NumberFormat/);
  });

  it("domain/quotes/lines.ts의 formatFieldValue 함수 범위에 개별 로캘 변환 호출이 없다 — 저장 직렬화 줄은 같은 파일 다른 함수에 있어 스캔 대상이 아니다", () => {
    const source = read("domain", "quotes", "lines.ts");
    const match = source.match(/function formatFieldValue\([\s\S]*?\n}\n/);
    expect(match).not.toBeNull();
    expect(match![0]).not.toMatch(/\.toLocaleString\(/);
  });

  it("domain/money/index.ts의 저장 직렬화 고정 소수(toFixed)는 그대로 있다(스캔 대상 아님)", () => {
    expect(read("domain", "money", "index.ts")).toMatch(/\.toFixed\(/);
  });
});

// Task 3 — 입력 쉼표 도우미(C-02·D-95·UI-SPEC S15). 순수 함수만 — 훅(use-
// comma-input.ts)은 이 함수들을 부를 뿐 자체 판단 로직을 갖지 않는다.
describe("stripNumberInput — 서버·붙여넣기 공용 제거 규칙", () => {
  it("쉼표를 지운다", () => {
    expect(stripNumberInput("1,200,000")).toBe("1200000");
  });

  it("공백·통화 기호(₩)를 지운다", () => {
    expect(stripNumberInput(" ₩1,200,000 ")).toBe("1200000");
  });
});

describe("parseNumberInput", () => {
  it("쉼표 섞인 문자열을 숫자로 읽는다", () => {
    expect(parseNumberInput("1,200,000")).toBe(1200000);
  });

  it("빈 문자열은 null이다", () => {
    expect(parseNumberInput("")).toBe(null);
  });

  it("숫자가 아니면 NaN을 그대로 돌려준다(대체값 없음)", () => {
    expect(parseNumberInput("1,2a")).toBeNaN();
  });
});

describe("formatNumberInput — 타이핑 중 쉼표 삽입 + 커서 보존", () => {
  it("정수부 끝에 이어 치면 쉼표가 들어가고 커서가 그만큼 밀린다", () => {
    expect(formatNumberInput({ raw: "1200000", caret: 7, kind: "krw" })).toEqual({ text: "1,200,000", caret: 9 });
  });

  it("가운데 삽입 — 커서가 친 글자 바로 뒤에 남는다", () => {
    expect(formatNumberInput({ raw: "1,2003", caret: 6, kind: "krw" })).toEqual({ text: "12,003", caret: 6 });
  });

  it("kind krw에서 소수점을 한 글자 치면 받지 않는다(텍스트에 .이 들어가지 않는다)", () => {
    const result = formatNumberInput({ raw: "1,200.", caret: 6, kind: "krw", prev: "1,200" });
    expect(result.text).not.toContain(".");
    expect(result.text).toBe("1,200");
    expect(result.rejected).toBeUndefined();
  });

  it("kind foreign — 한 글자씩 쳐서 소수 셋째 자리를 치면 그 글자만 받지 않는다(자리 상한, 타이핑은 무시만)", () => {
    const result = formatNumberInput({ raw: "4,400.005", caret: 9, kind: "foreign", prev: "4,400.00" });
    expect(result.text).toBe("4,400.00");
    expect(result.rejected).toBeUndefined();
  });

  it("(C-02·C-20) 쉼표 바로 뒤 커서로 Backspace — 쉼표만 지워지고 숫자가 남는 상태가 생기지 않는다", () => {
    // "1,234"에서 caret=2(쉼표 바로 뒤)로 Backspace하면 네이티브 동작은 쉼표만
    // 지운 "1234"(caret=1)를 onChange에 넘긴다 — 그대로 반영하면 숫자가 하나도
    //안 지워진 것처럼 보인다. 커서에 인접한 숫자까지 지워야 사용자 의도와 맞는다.
    expect(formatNumberInput({ raw: "1234", caret: 1, kind: "krw", prev: "1,234" })).toEqual({ text: "234", caret: 0 });
  });

  it("Backspace로 '-'를 지워도 숫자가 그대로 남는다(쉼표 뒤 규칙이 '-' 삭제에는 적용되지 않는다)", () => {
    expect(formatNumberInput({ raw: "1,234", caret: 0, kind: "krw", prev: "-1,234" })).toEqual({
      text: "1,234",
      caret: 0,
    });
  });

  it("Backspace로 '.'을 지워도 숫자가 그대로 남는다(쉼표 뒤 규칙이 '.' 삭제에는 적용되지 않는다)", () => {
    const result = formatNumberInput({ raw: "4,40050", caret: 5, kind: "foreign", prev: "4,400.50" });
    expect(result.text).toBe("440,050");
  });

  it("- 는 맨 앞 하나만 받는다(가운데·중복 - 는 무시된다)", () => {
    const result = formatNumberInput({ raw: "12-3", caret: 4, kind: "krw", prev: "123" });
    expect(result.text).toBe("123");
  });

  it("(C-02, 문자열 통째) kind krw에 1,234.00이 한 번에 들어오면 소수부가 전부 0이라 뗀다", () => {
    const result = formatNumberInput({ raw: "1,234.00", caret: 8, kind: "krw", prev: "0" });
    expect(result).toEqual({ text: "1,234", caret: 5, rejected: undefined });
  });

  it("(C-02) kind krw에 1234.56이 한 번에 들어오면 거부되고 이전 값 그대로다", () => {
    const result = formatNumberInput({ raw: "1234.56", caret: 7, kind: "krw", prev: "9,800,000" });
    expect(result.rejected).toBe("krw-fraction");
    expect(result.text).toBe("9,800,000");
  });

  it("(C-02) kind krw에 ₩1,234가 한 번에 들어오면 통화 기호를 지우고 받는다", () => {
    const result = formatNumberInput({ raw: "₩1,234", caret: 6, kind: "krw", prev: "0" });
    expect(result.text).toBe("1,234");
    expect(result.rejected).toBeUndefined();
  });

  it("(C-02) kind krw에 abc가 한 번에 들어오면 숫자가 아니라 거부되고 이전 값 그대로다", () => {
    const result = formatNumberInput({ raw: "abc", caret: 3, kind: "krw", prev: "1,234" });
    expect(result).toEqual({ text: "1,234", caret: 5, rejected: "not-number" });
  });

  it("(C-02) kind foreign에 4400.005가 한 번에 들어오면 거부되고 4,400.00으로 잘리지 않는다(이전 값 그대로)", () => {
    const result = formatNumberInput({ raw: "4400.005", caret: 8, kind: "foreign", prev: "1,000.00" });
    expect(result.rejected).toBe("precision");
    expect(result.text).toBe("1,000.00");
  });

  it("kind fxRate — 소수 다섯째 자리 통째 입력은 거부된다", () => {
    const result = formatNumberInput({ raw: "1318.18189", caret: 10, kind: "fxRate", prev: "1,318.1818" });
    expect(result.rejected).toBe("precision");
  });

  it("kind quantity — 소수 셋째 자리 통째 입력은 거부된다", () => {
    const result = formatNumberInput({ raw: "1.567", caret: 5, kind: "quantity", prev: "1.5" });
    expect(result.rejected).toBe("precision");
  });
});

describe("numberInputRejectionReason — UI-SPEC rev 5 Copywriting 원문", () => {
  it("krw · krw-fraction → 원화는 소수점 없이 적어 주세요", () => {
    expect(numberInputRejectionReason("krw", "krw-fraction")).toBe("원화는 소수점 없이 적어 주세요");
  });

  it("foreign · precision → 외화는 소수 2자리까지", () => {
    expect(numberInputRejectionReason("foreign", "precision")).toBe("외화는 소수 2자리까지");
  });

  it("fxRate · precision → 환율은 소수 4자리까지", () => {
    expect(numberInputRejectionReason("fxRate", "precision")).toBe("환율은 소수 4자리까지");
  });

  it("quantity · precision → 수량은 소수 2자리까지", () => {
    expect(numberInputRejectionReason("quantity", "precision")).toBe("수량은 소수 2자리까지");
  });

  it("아무 kind · not-number → 숫자가 아닙니다 · 12,400,000처럼 적어 주세요", () => {
    expect(numberInputRejectionReason("krw", "not-number")).toBe("숫자가 아닙니다 · 12,400,000처럼 적어 주세요");
    expect(numberInputRejectionReason("quantity", "not-number")).toBe("숫자가 아닙니다 · 12,400,000처럼 적어 주세요");
  });
});
