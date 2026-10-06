import { describe, expect, it } from "vitest";
import { pairGridId, pairGridValue } from "@/app/(app)/admin/settings/pair-grid-axes";
import { buildCellKey } from "@/ui/permission-grid/PermissionGrid";

// PR #171 Codex 지적 — 칸 키는 `${증빙}::${지급}`인데 코드값은 빈 문자열만 막아(app/(app)/admin/code-tables/actions.ts) `::`를 담을 수 있다.
// 격자 id로 넘길 때 `:`가 남지 않게 바꿔 두 짝(a::b + c, a + b::c)의 칸 키가 겹치지 않게 한다.
describe("pairGridId", () => {
  it("값에 `::`가 있어도 서로 다른 짝의 칸 키가 겹치지 않는다", () => {
    const first = buildCellKey(pairGridId("a::b"), pairGridId("c"));
    const second = buildCellKey(pairGridId("a"), pairGridId("b::c"));
    expect(first).not.toBe(second);
  });

  it("격자 id를 원래 코드값으로 되돌린다", () => {
    for (const value of ["tax_invoice", "a::b", "100%", "카드 전표"]) {
      expect(pairGridValue(pairGridId(value))).toBe(value);
    }
  });
});
