import { describe, expect, it } from "vitest";
import { pairGridAxis } from "@/app/(app)/admin/settings/pair-grid-axes";

// Regression: ISSUE-001 — 「삭제」(보관, archivedAt)된 코드 값이 짝 격자에 잠기지 않은 보통 행 · 열로 나와
// 새 짝을 체크하면 서버(assertNewPairsActive)가 거부했다. 보관함 보기 권한이 있으면 listCodeItems가 보관 행도 준다.
// Found by /qa on 2026-10-06 (PR #171)
describe("pairGridAxis — 보관(archivedAt) 값", () => {
  const archivedAt = new Date("2026-10-01T00:00:00Z");
  const items = [
    { value: "bank_transfer", label: "계좌이체", active: true, archivedAt: null },
    { value: "cash", label: "현금", active: true, archivedAt },
  ];

  it("저장된 짝이 없으면 보관 값은 축에 없다", () => {
    expect(pairGridAxis(items, [])).toEqual([{ value: "bank_transfer", label: "계좌이체" }]);
  });

  it("저장된 짝의 보관 값은 끝에 「(보관됨)」 잠긴 칸으로 더한다", () => {
    expect(pairGridAxis(items, ["cash"])).toEqual([
      { value: "bank_transfer", label: "계좌이체" },
      { value: "cash", label: "현금 (보관됨)", archived: true },
    ]);
  });
});
