import { describe, expect, it } from "vitest";
import { pairGridAxis } from "@/app/(app)/admin/settings/pair-grid-axes";

// 06-02 검토 P2-2 — 저장된 짝에 남은 보관 값은 격자 끝에 「(보관됨)」 행 · 열로 보여 해제할 수 있게 한다.
describe("pairGridAxis", () => {
  const items = [
    { value: "tax_invoice", label: "세금계산서", active: false },
    { value: "invoice", label: "계산서", active: true },
    { value: "card_slip", label: "카드 전표", active: true },
    { value: "etc", label: "기타", active: false },
  ];

  it("저장된 짝이 없으면 활성 값만 순서대로다", () => {
    expect(pairGridAxis(items, [])).toEqual([
      { value: "invoice", label: "계산서" },
      { value: "card_slip", label: "카드 전표" },
    ]);
  });

  it("저장된 짝에 있는 비활성 값만 끝에 「(보관됨)」으로 더한다(한 번씩)", () => {
    expect(pairGridAxis(items, ["tax_invoice", "invoice", "tax_invoice"])).toEqual([
      { value: "invoice", label: "계산서" },
      { value: "card_slip", label: "카드 전표" },
      { value: "tax_invoice", label: "세금계산서 (보관됨)" },
    ]);
  });

  it("코드표에서 찾을 수 없는 저장값은 값 그대로 「(보관됨)」으로 더한다", () => {
    expect(pairGridAxis(items, ["gone"])).toEqual([
      { value: "invoice", label: "계산서" },
      { value: "card_slip", label: "카드 전표" },
      { value: "gone", label: "gone (보관됨)" },
    ]);
  });
});
