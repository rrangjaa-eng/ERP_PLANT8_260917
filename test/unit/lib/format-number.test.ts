import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { formatKrw, formatForeignAmount, formatFxRate, formatQuantity, formatPercent, formatCount, formatForeignLine } from "@/lib/format-number";

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
