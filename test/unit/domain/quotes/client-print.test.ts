import { describe, expect, it } from "vitest";
import { buildQuoteClientPrint, QUOTE_CLIENT_PRINT_DTO_SPEC, type QuoteClientPrintSourceRow } from "@/domain/quotes/client-print";

// 07.2-10 PU3(D-7221 · D-7224) — 고객 견적서 투영. 감추는 것을 DTO에 아예 싣지 않는다(260907 client-quotation 방식).
// 입력 행은 내부 칸(협력사 · 실행가 · 내부 비고)을 달고 와도 결과에 한 글자도 새지 않는다.

const LABELS: Record<string, string> = { stage_construction: "무대·시공", print_production: "인쇄·제작", staffing: "인력" };
const label = (value: string) => LABELS[value] ?? value;

function row(patch: Partial<QuoteClientPrintSourceRow> & Pick<QuoteClientPrintSourceRow, "id" | "itemName">): QuoteClientPrintSourceRow {
  return {
    lineKind: "quote",
    lineStatus: "not_started",
    subcategory: "stage_construction",
    majorCategory: null,
    midCategory: null,
    quantity: 1,
    days: 1,
    unitPriceKrw: 100_000,
    quoteAmountKrw: 100_000,
    clientRemark: null,
    ...patch,
  };
}

const HEADER = { ref: "26001-2", projectId: "p-1", clientName: "고객사", eventName: "행사명", pmName: "김피엠" };

describe("buildQuoteClientPrint — 투영", () => {
  it("견적 줄 · 수수료 줄만 싣고 조정 · 취소 · 견적 외 비용 줄은 싣지 않는다", () => {
    const dto = buildQuoteClientPrint(
      HEADER,
      [
        row({ id: "q1", itemName: "무대" }),
        row({ id: "q2", itemName: "취소된 줄", lineStatus: "cancelled", quoteAmountKrw: 0 }),
        row({ id: "o1", itemName: "견적 외 비용 줄", lineKind: "out_of_quote", quoteAmountKrw: 0, unitPriceKrw: 0 }),
        row({ id: "a1", itemName: "조정 줄", lineKind: "adjustment", quoteAmountKrw: 0, unitPriceKrw: 0 }),
        row({ id: "c1", itemName: "대행 수수료", lineKind: "commission", subcategory: "commission", quantity: 1, unitPriceKrw: 30_000, quoteAmountKrw: 30_000 }),
      ],
      label,
    );
    expect(dto.lines.map((line) => line.item)).toEqual(["무대"]);
    expect(dto.commissionLines.map((line) => line.item)).toEqual(["대행 수수료"]);
    const text = JSON.stringify(dto);
    for (const hidden of ["취소된 줄", "견적 외 비용 줄", "조정 줄"]) expect(text).not.toContain(hidden);
  });

  it("행 필드는 항목 · 수량 · 단가 · 일수 · 금액 · 고객 비고 · 대분류 · 중분류뿐이고 협력사 · 실행가 · 내부 비고가 샐 곳이 없다", () => {
    const withInternals = {
      ...row({ id: "q1", itemName: "무대", clientRemark: "고객 비고 글자" }),
      vendorId: "vendor-secret-id",
      vendorName: "비밀 협력사",
      execution: { amountKrw: 7_777_777 },
      executionAmountKrw: 7_777_777,
      profitKrw: 123_456,
      note: "내부 비고 글자",
    };
    const dto = buildQuoteClientPrint(HEADER, [withInternals], label);
    expect(Object.keys(dto.lines[0] ?? {}).sort()).toEqual(["amountKrw", "days", "id", "item", "major", "mid", "quantity", "remark", "unitPriceKrw"]);
    const text = JSON.stringify(dto);
    for (const leaked of ["vendor-secret-id", "비밀 협력사", "7777777", "123456", "내부 비고 글자", "execution", "profit", "vendor"]) {
      expect(text, leaked).not.toContain(leaked);
    }
    expect(dto.lines[0]?.remark).toBe("고객 비고 글자");
  });

  it("그룹 머리는 저장 대분류, 없으면 소분류 코드표 이름이다(코드 값이 아니다)", () => {
    const dto = buildQuoteClientPrint(
      HEADER,
      [row({ id: "q1", itemName: "무대", subcategory: "stage_construction" }), row({ id: "q2", itemName: "현수막", majorCategory: "홍보물" })],
      label,
    );
    expect(dto.lines.map((line) => line.major)).toEqual(["무대·시공", "홍보물"]);
    expect(JSON.stringify(dto)).not.toContain("stage_construction");
  });

  it("합계: 그룹 소계 · Total(견적 줄 합) · 수수료 합 · Grand Total = Total + 수수료, 금액은 저장 견적가 그대로", () => {
    const dto = buildQuoteClientPrint(
      HEADER,
      [
        row({ id: "q1", itemName: "무대", quantity: 2, days: 3, unitPriceKrw: 100_000, quoteAmountKrw: 600_000 }),
        row({ id: "q2", itemName: "조명", quoteAmountKrw: 400_000, unitPriceKrw: 400_000 }),
        row({ id: "q3", itemName: "진행요원", subcategory: "staffing", quoteAmountKrw: 250_000, unitPriceKrw: 250_000 }),
        row({ id: "c1", itemName: "수수료", lineKind: "commission", unitPriceKrw: 50_000, quoteAmountKrw: 50_000 }),
      ],
      label,
    );
    expect(dto.lines[0]).toMatchObject({ quantity: 2, days: 3, unitPriceKrw: 100_000, amountKrw: 600_000 });
    expect(dto.groups).toEqual([
      { major: "무대·시공", subtotalKrw: 1_000_000 },
      { major: "인력", subtotalKrw: 250_000 },
    ]);
    expect(dto.totalKrw).toBe(1_250_000);
    expect(dto.commissionKrw).toBe(50_000);
    expect(dto.grandTotalKrw).toBe(1_300_000);
  });

  it("같은 대분류는 처음 나온 자리에 모이고, 중분류 없는 줄이 먼저 오며 중분류는 처음 나온 순서다", () => {
    const dto = buildQuoteClientPrint(
      HEADER,
      [
        row({ id: "q1", itemName: "A", midCategory: "구조물" }),
        row({ id: "q2", itemName: "B", subcategory: "staffing" }),
        row({ id: "q3", itemName: "C" }),
        row({ id: "q4", itemName: "D", midCategory: "전기" }),
        row({ id: "q5", itemName: "E", midCategory: "구조물" }),
      ],
      label,
    );
    expect(dto.lines.map((line) => `${line.major}/${line.mid ?? "-"}/${line.item}`)).toEqual([
      "무대·시공/-/C",
      "무대·시공/구조물/A",
      "무대·시공/구조물/E",
      "무대·시공/전기/D",
      "인력/-/B",
    ]);
  });

  it("줄 0이면 합계 0 · 그룹 없음", () => {
    const dto = buildQuoteClientPrint(HEADER, [], label);
    expect(dto).toMatchObject({ lines: [], groups: [], commissionLines: [], totalKrw: 0, commissionKrw: 0, grandTotalKrw: 0 });
  });

  it("머리는 그대로 싣는다 — ref · projectId · 고객사 · 행사명 · 담당 PM", () => {
    expect(buildQuoteClientPrint(HEADER, [], label)).toMatchObject(HEADER);
  });
});

describe("QUOTE_CLIENT_PRINT_DTO_SPEC", () => {
  it("금액이 들어간 칸은 quote.amount, 머리 글자 칸은 project.value다", () => {
    const itemOf = (key: string) => QUOTE_CLIENT_PRINT_DTO_SPEC.fields.find((field) => field.key === key)?.infoItem;
    for (const key of ["lines", "groups", "totalKrw", "commissionLines", "commissionKrw", "grandTotalKrw"]) expect(itemOf(key), key).toBe("quote.amount");
    for (const key of ["ref", "projectId", "clientName", "eventName", "pmName"]) expect(itemOf(key), key).toBe("project.value");
  });

  it("명세 칸 이름에 내부 칸(실행가 · 협력사 · 차익 · 내부 비고)이 없다", () => {
    const keys = QUOTE_CLIENT_PRINT_DTO_SPEC.fields.map((field) => field.key).join(",");
    expect(keys).not.toMatch(/vendor|execution|profit|note|adjust/i);
  });
});
