// Regression: ISSUE-002 — 증빙 E2E 카드 도우미가 무작위 끝 4자리를 앞 케이스 카드와 겹치게 골라 「이미 등록된 카드」로 스펙이 간헐 실패했다
// Found by /qa on 2026-10-17
// Report: /mnt/project-files/06.1-exec/pr-b/qa.md
import { test, expect } from "@playwright/test";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { corpCards } from "@/db/schema";
import { addLotteCard } from "./helpers/evidence";

test("카드 도우미 — 롯데 끝 4자리가 거의 다 차 있어도 비어 있는 번호로 다시 골라 등록한다", async () => {
  const taken = new Set(
    (await db.select({ last4: corpCards.numberLast4 }).from(corpCards).where(and(eq(corpCards.issuer, "롯데카드"), isNull(corpCards.archivedAt)))).map((row) => row.last4),
  );
  const free = Array.from({ length: 9000 }, (_, i) => String(1000 + i)).filter((last4) => !taken.has(last4));
  const keepFree = free.slice(0, 3);
  const filler = free.slice(3);
  try {
    for (let i = 0; i < filler.length; i += 1000) {
      await db.insert(corpCards).values(filler.slice(i, i + 1000).map((last4) => ({ issuer: "롯데카드", numberLast4: last4, label: `채움 ${last4}`, kind: "shared" })));
    }
    const last4 = await addLotteCard({ kind: "shared" });
    expect(keepFree).toContain(last4);
  } finally {
    for (let i = 0; i < filler.length; i += 1000) {
      await db.delete(corpCards).where(and(eq(corpCards.issuer, "롯데카드"), inArray(corpCards.numberLast4, filler.slice(i, i + 1000))));
    }
  }
});
