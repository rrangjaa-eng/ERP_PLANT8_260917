// Regression: ISSUE-002 — 증빙 E2E 카드 도우미가 무작위 끝 4자리를 앞 케이스 카드와 겹치게 골라 「이미 등록된 카드」로 스펙이 간헐 실패했다
// Found by /qa on 2026-10-17
// Report: /mnt/project-files/06.1-exec/pr-b/qa.md
// 2026-10-22 e2e 연쇄 실패 — 무작위 재시도가 빈 3칸을 30초 안에 못 맞혔고, 본문 안 정리가 돌지 않아 채움 카드가 남았다(원인: /mnt/project-files/07-review/e2e-card-fixture-flake.md).
import { test, expect } from "@playwright/test";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { corpCards } from "@/db/schema";
import { addLotteCard } from "./helpers/evidence";

let filler: string[] = [];

// 시간 초과로 본문이 끊겨도 Playwright는 afterEach를 따로 시간을 주어 돌린다 — 본문 안 정리는 멈춘 반복 안에 있어 돌지 않았다.
test.afterEach(async () => {
  for (let i = 0; i < filler.length; i += 1000) {
    await db.delete(corpCards).where(and(eq(corpCards.issuer, "롯데카드"), inArray(corpCards.numberLast4, filler.slice(i, i + 1000))));
  }
  filler = [];
});

async function fillLotteExcept(keep: number): Promise<string[]> {
  const taken = new Set(
    (await db.select({ last4: corpCards.numberLast4 }).from(corpCards).where(and(eq(corpCards.issuer, "롯데카드"), isNull(corpCards.archivedAt)))).map((row) => row.last4),
  );
  const free = Array.from({ length: 9000 }, (_, i) => String(1000 + i)).filter((last4) => !taken.has(last4));
  filler = free.slice(keep);
  for (let i = 0; i < filler.length; i += 1000) {
    await db.insert(corpCards).values(filler.slice(i, i + 1000).map((last4) => ({ issuer: "롯데카드", numberLast4: last4, label: `채움 ${last4}`, kind: "shared" })));
  }
  return free.slice(0, keep);
}

test("카드 도우미 — 롯데 끝 4자리가 거의 다 차 있어도 비어 있는 번호로 다시 골라 등록한다", async () => {
  const keepFree = await fillLotteExcept(3);
  const last4 = await addLotteCard({ kind: "shared" });
  expect(keepFree).toContain(last4);
});

test("카드 도우미 — 롯데 끝 4자리에 빈 번호가 없으면 다시 고르지 않고 바로 오류로 끝난다", async () => {
  await fillLotteExcept(0);
  const started = Date.now();
  await expect(addLotteCard({ kind: "shared" })).rejects.toThrow(/빈 번호 없음/);
  expect(Date.now() - started).toBeLessThan(5_000);
});
