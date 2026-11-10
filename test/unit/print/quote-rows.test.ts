import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { QuoteClientPrintDto } from "@/domain/quotes/client-print";
import { quoteRows } from "@/app/print/quotes/[id]/quote-rows";
import { PrintTable } from "@/app/print/_frame/PrintTable";
import styles from "@/app/print/_frame/print-frame.module.css";

// 07.2-10 Task 2 — 고객 견적서 표 행. 순수 함수라 DTO만 넣어 순서 · 합계 · 칸 수를 본다. 합계 셋은 tbody 끝 행이다(tfoot은 쪽마다 되풀이될 수 있다).

const line = (patch: Partial<QuoteClientPrintDto["lines"][number]> & { id: string; item: string; major: string }) => ({
  mid: null,
  quantity: 1,
  unitPriceKrw: 100_000,
  days: 1,
  amountKrw: 100_000,
  remark: null,
  ...patch,
});

function dto(patch: Partial<QuoteClientPrintDto>): QuoteClientPrintDto {
  return {
    ref: "26001-1",
    projectId: "p-1",
    clientName: "고객사",
    eventName: "행사",
    pmName: "PM",
    lines: [],
    groups: [],
    totalKrw: 0,
    commissionLines: [],
    commissionKrw: 0,
    grandTotalKrw: 0,
    ...patch,
  };
}

const text = (cell: unknown): string => renderToStaticMarkup(createElement("div", null, typeof cell === "object" && cell !== null && "content" in cell ? (cell as { content: never }).content : (cell as never))).replace(/<[^>]*>/g, "");

// DTO 줄은 buildQuoteClientPrint가 이미 정렬해 둔 순서(대분류 모음 · 중분류 없는 줄 먼저)다 — quoteRows는 다시 정렬하지 않고 바뀌는 자리에서 머리를 낸다.
const sample = dto({
  lines: [
    line({ id: "b", item: "B", major: "무대·시공" }),
    line({ id: "a", item: "A", major: "무대·시공", mid: "구조물", quantity: 2, days: 3, unitPriceKrw: 100_000, amountKrw: 600_000, remark: "고객 비고" }),
    line({ id: "c", item: "C", major: "인력", amountKrw: 250_000, unitPriceKrw: 250_000 }),
  ],
  groups: [
    { major: "무대·시공", subtotalKrw: 700_000 },
    { major: "인력", subtotalKrw: 250_000 },
  ],
  totalKrw: 950_000,
  commissionLines: [{ id: "k", item: "대행 수수료", amountKrw: 50_000, remark: null }],
  commissionKrw: 50_000,
  grandTotalKrw: 1_000_000,
});

describe("quoteRows — 순서", () => {
  const rows = quoteRows(sample);

  it("대분류 머리 → (중분류 머리) → 줄 → Sub Total, 그다음 Total → 수수료 → Grand Total", () => {
    expect(rows.map((row) => `${row.variant ?? "line"}:${row.key}`)).toEqual([
      "group:group-무대·시공",
      "line:b",
      "subgroup:sub-무대·시공-구조물",
      "line:a",
      "sum:subtotal-무대·시공",
      "group:group-인력",
      "line:c",
      "sum:subtotal-인력",
      "sum:total",
      "line:k",
      "grand:grand",
    ]);
  });

  it("합계 셋은 tbody 끝 행이다 — 표 바닥(foot)을 쓰지 않는다", () => {
    expect(rows.at(-1)?.variant).toBe("grand");
  });

  it("중분류 머리는 중분류가 있을 때만 나온다", () => {
    expect(rows.filter((row) => row.variant === "subgroup")).toHaveLength(1);
  });

  it("줄 0이면 빈 배열이다", () => {
    expect(quoteRows(dto({}))).toEqual([]);
  });

  it("견적 줄이 0이어도 수수료 줄이 있으면 수수료 · Grand Total을 싣는다", () => {
    const only = quoteRows(dto({ commissionLines: [{ id: "c-1", item: "대행 수수료", amountKrw: 100000, remark: null }], commissionKrw: 100000, grandTotalKrw: 100000 }));
    expect(only.some((row) => row.key === "grand")).toBe(true);
    expect(only.some((row) => row.cells.some((cell) => cell === "대행 수수료"))).toBe(true);
  });
});

describe("quoteRows — 칸", () => {
  const rows = quoteRows(sample);
  const byKey = (key: string) => rows.find((row) => row.key === key);

  it("머리 행은 6열을 한 칸으로 합친다", () => {
    expect(byKey("group-무대·시공")?.cells).toEqual([{ span: 6, content: "무대·시공" }]);
    expect(byKey("sub-무대·시공-구조물")?.cells).toEqual([{ span: 6, content: "구조물" }]);
  });

  it("줄 행은 ITEM · QTY · COST/UNIT · DAY/SET · AMOUNT · REMARK 여섯 칸이다", () => {
    expect(byKey("a")?.cells).toEqual(["A", "2", "100,000", "3", "600,000", "고객 비고"]);
    expect(byKey("b")?.cells.at(-1)).toBe("");
  });

  it("Sub Total · Total은 라벨이 ITEM 칸, 금액이 AMOUNT 칸이다", () => {
    expect(byKey("subtotal-무대·시공")?.cells).toEqual(["Sub Total", "", "", "", "700,000", ""]);
    expect(byKey("total")?.cells).toEqual(["Total", "", "", "", "950,000", ""]);
  });

  it("수수료 줄은 항목명 그대로 · 금액만이다", () => {
    expect(byKey("k")?.cells).toEqual(["대행 수수료", "", "", "", "50,000", ""]);
  });

  it("Grand Total 행은 라벨 한 칸 + QTY~AMOUNT 합친 칸(span 4) + 빈 REMARK로 칸 수 합이 6이다", () => {
    const cells = byKey("grand")?.cells ?? [];
    expect(cells).toHaveLength(3);
    expect(text(cells[0])).toBe("Grand Total");
    expect(cells[1]).toMatchObject({ span: 4 });
    expect(text(cells[1])).toBe("1,000,000VAT excluded");
    expect(cells[2]).toBe("");
  });

  it("견적가 0 줄(F.O.C)도 싣고 REMARK는 고객 비고다", () => {
    const foc = quoteRows(dto({ lines: [line({ id: "f", item: "서비스", major: "무대·시공", amountKrw: 0, unitPriceKrw: 0, remark: "F.O.C" })], groups: [{ major: "무대·시공", subtotalKrw: 0 }] }));
    expect(foc.find((row) => row.key === "f")?.cells).toEqual(["서비스", "1", "0", "1", "0", "F.O.C"]);
  });
});

describe("PrintTable — 행 변형 · 폭 · 줄바꿈 머리", () => {
  const columns = [
    { label: "ITEM" },
    { label: "QTY", width: "14mm", align: "end" },
    { label: "COST/UNIT", width: "26mm", align: "end" },
    { label: "NO. of DAY/SET", width: "18mm", align: "end", wrapLabel: true },
    { label: "AMOUNT", width: "36mm", align: "end" },
    { label: "REMARK", width: "30mm" },
  ] as const;

  it("변형이 없는 행은 <tr>에 class가 없다(07.4 마크업 그대로)", () => {
    const html = renderToStaticMarkup(createElement(PrintTable, { caption: "x", columns, rows: [{ key: "r", cells: ["a", "1", "2", "3", "4", "5"] }] }));
    expect(html).toContain("<tr><td");
    expect(html).not.toMatch(/<tbody><tr class/);
  });

  it("변형 행은 각 클래스를 단다", () => {
    for (const [variant, name] of [["group", "groupRow"], ["subgroup", "subgroupRow"], ["sum", "sumRow"], ["grand", "grandRow"]] as const) {
      const html = renderToStaticMarkup(createElement(PrintTable, { caption: "x", columns, rows: [{ key: "r", variant, cells: ["a", "", "", "", "", ""] }] }));
      expect(html, variant).toContain(`<tr class="${styles[name]}">`);
    }
  });

  it("wrapLabel은 그 열 머리에만 붙고 새 폭 클래스가 col · th · td에 붙는다", () => {
    const html = renderToStaticMarkup(createElement(PrintTable, { caption: "x", columns, rows: [{ key: "r", cells: ["a", "1", "2", "3", "4", "5"] }] }));
    expect(html.match(new RegExp(styles.wrapLabel ?? "wrapLabel", "g"))).toHaveLength(1);
    expect(html).toMatch(new RegExp(`<col class="${styles.w14}"`));
    expect(html).toMatch(new RegExp(`<th[^>]*class="[^"]*${styles.w18}`));
    expect(html).toMatch(new RegExp(`<td[^>]*class="[^"]*${styles.w26}`));
  });
});
