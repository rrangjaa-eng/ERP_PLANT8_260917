import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/db/client";
import { codeItems } from "@/db/schema";
import { QUOTE_SUBCATEGORY_TABLE_KEY } from "@/domain/projects/references";
import { firstSelectableSubcategory } from "@/test/support/quote-subcategory";

const setRow = (value: string, set: Partial<typeof codeItems.$inferInsert>) =>
  db.update(codeItems).set(set).where(and(eq(codeItems.tableKey, QUOTE_SUBCATEGORY_TABLE_KEY), eq(codeItems.value, value)));

describe("firstSelectableSubcategory", () => {
  it("아무것도 폐기되지 않았으면 정렬 첫 항목이다", async () => {
    expect((await firstSelectableSubcategory()).value).toBe("stage_construction");
  });

  it("비활성·보관 항목은 건너뛴다", async () => {
    await setRow("stage_construction", { active: false });
    await setRow("print_production", { archivedAt: new Date() });
    expect((await firstSelectableSubcategory()).value).toBe("staffing");
  });
});
