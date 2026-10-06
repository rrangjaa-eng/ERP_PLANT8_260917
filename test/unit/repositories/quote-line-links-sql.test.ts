import { describe, expect, it } from "vitest";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "@/db/schema";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { lineChains, lockQuoteLinesQuery } from "@/repositories/quote-line-links";

// 06-07(B-1 · CROSS E-5): 견적 줄 잠금은 줄 id 오름차순 `FOR UPDATE` 한 빌더로만 — 결과 행으로는 잠금 순서를 볼 수 없어
// DB 없이 `.toSQL()`로 고정한다. (X-1 · E-44) 계보 사슬 순수 해석.

describe("lockQuoteLinesQuery", () => {
  it("줄 id 순서(order by quote_lines.id)로 잠근다 — 받은 순서와 무관", () => {
    const { sql } = lockQuoteLinesQuery(SYSTEM_VIEWER, ["3", "1", "2"], drizzle.mock({ schema })).toSQL();
    expect(sql).toMatch(/order by "quote_lines"\."id"( asc)?/);
  });

  it("for update로 끝난다", () => {
    const { sql } = lockQuoteLinesQuery(SYSTEM_VIEWER, ["3", "1", "2"], drizzle.mock({ schema })).toSQL();
    expect(sql).toMatch(/for update( of "quote_lines")?$/);
  });
});

describe("lineChains", () => {
  // L1(차수 1) → L2(차수 2) → L3(차수 3). L9는 차수 2에만 있다(차수 3에서 빠짐). L8은 차수 1 → L9의 원본.
  const lines = [
    { id: "L1", revisionSeq: 1, copiedFromLineId: null },
    { id: "L2", revisionSeq: 2, copiedFromLineId: "L1" },
    { id: "L3", revisionSeq: 3, copiedFromLineId: "L2" },
    { id: "L8", revisionSeq: 1, copiedFromLineId: null },
    { id: "L9", revisionSeq: 2, copiedFromLineId: "L8" },
  ];

  it("현재 줄 L3 — 사슬 {L1, L2, L3} · 현재 줄 L3", () => {
    const chain = lineChains(SYSTEM_VIEWER, lines, ["L3"]).get("L3");
    expect(chain?.currentLineId).toBe("L3");
    expect([...(chain?.chainLineIds ?? [])].sort()).toEqual(["L1", "L2", "L3"]);
  });

  it("앞 차수 줄 L1 · L2도 현재 줄 L3의 사슬로 풀린다", () => {
    const chains = lineChains(SYSTEM_VIEWER, lines, ["L1", "L2"]);
    for (const id of ["L1", "L2"]) {
      expect(chains.get(id)?.currentLineId).toBe("L3");
      expect([...(chains.get(id)?.chainLineIds ?? [])].sort()).toEqual(["L1", "L2", "L3"]);
    }
  });

  it("빠진 줄 L9 — 사슬 {L8, L9} · 현재 줄 없음(05에 없는 갈래 — 역참조)", () => {
    const chain = lineChains(SYSTEM_VIEWER, lines, ["L9"]).get("L9");
    expect(chain?.currentLineId).toBeNull();
    expect([...(chain?.chainLineIds ?? [])].sort()).toEqual(["L8", "L9"]);
  });

  it("빠진 줄의 앞 차수 줄 L8 — 가장 늦은 후손 L9부터 뿌리까지 · 현재 줄 없음", () => {
    const chain = lineChains(SYSTEM_VIEWER, lines, ["L8"]).get("L8");
    expect(chain?.currentLineId).toBeNull();
    expect([...(chain?.chainLineIds ?? [])].sort()).toEqual(["L8", "L9"]);
  });
});
