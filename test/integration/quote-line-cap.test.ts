import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { and, eq, isNull } from "drizzle-orm";
import { db, pool } from "@/db/client";
import { codeItems, quoteLines, settingsSimple, teams } from "@/db/schema";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { createAccount } from "@/domain/auth/accounts";
import { insertVendor } from "@/repositories/vendors";
import { createProject } from "@/domain/projects";
import { getCurrentQuoteRevision, restoreQuoteLine, saveQuoteLines, type QuoteLineWriteRow } from "@/domain/quotes/lines";
import { deferred, waitForLockWaiter } from "./lock-race";

// 04-26(D-86 · CEO A-19·A-20·A-36 · ENG-D10) — 차수당 견적 줄 상한. 상한은 설정 키
// `quote_line.max_per_revision`이고, 여기서는 3·5로 바꾼 뒤 try/finally로 되돌린다(A-17 — E2E는 바꾸지 않는다).
const CAP_KEY = "quote_line.max_per_revision";

async function withCap<T>(cap: number, run: () => Promise<T>): Promise<T> {
  const [before] = await db.select().from(settingsSimple).where(eq(settingsSimple.key, CAP_KEY));
  await db
    .insert(settingsSimple)
    .values({ key: CAP_KEY, value: cap })
    .onConflictDoUpdate({ target: settingsSimple.key, set: { value: cap } });
  try {
    return await run();
  } finally {
    if (before) {
      await db.update(settingsSimple).set({ value: before.value }).where(eq(settingsSimple.key, CAP_KEY));
    } else {
      await db.delete(settingsSimple).where(eq(settingsSimple.key, CAP_KEY));
    }
  }
}

async function setupRevision() {
  const client = await insertVendor(SYSTEM_VIEWER, {
    name: `거래처-${randomUUID()}`,
    normalizedName: `거래처-${randomUUID()}`,
  });
  const { userId: pmUserId } = await createAccount(SYSTEM_VIEWER, {
    email: `pm-${randomUUID()}@example.test`,
    name: "상한 PM",
    roleId: DEFAULT_ROLE_ID,
  });
  const [team] = await db.select().from(teams).limit(1);
  if (!team) throw new Error("시드된 팀이 없습니다");
  const [subcategory] = await db.select().from(codeItems).where(eq(codeItems.tableKey, "quote_subcategory")).limit(1);
  if (!subcategory) throw new Error("시드된 quote_subcategory 코드 항목이 없습니다");
  const project = await createProject(SYSTEM_VIEWER, {
    clientId: client.id,
    teamId: team.id,
    pmUserId,
    name: `상한-${randomUUID()}`,
  });
  const revision = await getCurrentQuoteRevision(SYSTEM_VIEWER, project.id);
  if (!revision) throw new Error("1차 차수가 없습니다");
  return { revisionId: revision.id, subcategory: subcategory.value };
}

type LineState = "active" | "archived" | "cancelled";

async function seedLines(revisionId: string, subcategory: string, states: LineState[]) {
  const rows = [];
  for (const [index, state] of states.entries()) {
    const [row] = await db
      .insert(quoteLines)
      .values({
        revisionId,
        sortOrder: index,
        subcategory,
        itemName: `상한 줄 ${index + 1}`,
        unitPriceAmountKrw: 100_000,
        executionAmountKrw: 50_000,
        quoteAmountKrw: 100_000,
        profitKrw: 50_000,
        lineStatus: state === "cancelled" ? "cancelled" : "not_started",
        archivedAt: state === "archived" ? new Date() : null,
        archivedBy: state === "archived" ? SYSTEM_VIEWER.id : null,
      })
      .returning();
    if (!row) throw new Error("줄 준비 실패");
    rows.push(row);
  }
  return rows;
}

async function activeCount(revisionId: string): Promise<number> {
  const rows = await db
    .select({ id: quoteLines.id })
    .from(quoteLines)
    .where(and(eq(quoteLines.revisionId, revisionId), isNull(quoteLines.archivedAt)));
  return rows.length;
}

function newLine(subcategory: string, itemName = "새 줄"): QuoteLineWriteRow {
  return {
    id: randomUUID(),
    isNew: true,
    subcategory,
    itemName,
    unitPrice: { currency: "KRW", amount: 100_000, fxRate: 1 },
    execution: { currency: "KRW", amount: 50_000, fxRate: 1 },
  };
}

function asInput(row: typeof quoteLines.$inferSelect, patch: Partial<QuoteLineWriteRow> = {}): QuoteLineWriteRow {
  return {
    id: row.id,
    version: row.version,
    subcategory: row.subcategory,
    itemName: row.itemName,
    quantity: Number(row.quantity),
    unitPrice: { currency: "KRW", amount: row.unitPriceAmountKrw, fxRate: 1 },
    execution: { currency: "KRW", amount: row.executionAmountKrw, fxRate: 1 },
    lineStatus: row.lineStatus,
    ...patch,
  };
}

describe("차수당 견적 줄 상한(04-26 · D-86, 실제 Postgres)", () => {
  it("(1) 상한 3 · 줄 3에서 새 줄 1개 저장은 「3줄 상한을 넘음 · 전부 거부」이고 DB 줄 수는 3 그대로다", async () => {
    const { revisionId, subcategory } = await setupRevision();
    await seedLines(revisionId, subcategory, ["active", "active", "active"]);

    await withCap(3, async () => {
      await expect(saveQuoteLines(SYSTEM_VIEWER, revisionId, { rows: [newLine(subcategory)] })).rejects.toThrow(
        "3줄 상한을 넘음 · 전부 거부",
      );
    });
    expect(await activeCount(revisionId)).toBe(3);
  });

  it("(2) 상한 3 · 줄 3 중 1개 보관 + 새 줄 1개는 통과한다 — 보관 줄은 세지 않는다", async () => {
    const { revisionId, subcategory } = await setupRevision();
    const [first] = await seedLines(revisionId, subcategory, ["active", "active", "active"]);

    await withCap(3, () => saveQuoteLines(SYSTEM_VIEWER, revisionId, { rows: [newLine(subcategory)], archivedLineIds: [first!.id] }));
    expect(await activeCount(revisionId)).toBe(3);
  });

  it("(3) 상한 3 · 활성 2 + 취소 1에서 새 줄은 거부된다 — 취소 줄도 센다", async () => {
    const { revisionId, subcategory } = await setupRevision();
    await seedLines(revisionId, subcategory, ["active", "active", "cancelled"]);

    await withCap(3, async () => {
      await expect(saveQuoteLines(SYSTEM_VIEWER, revisionId, { rows: [newLine(subcategory)] })).rejects.toThrow(
        "3줄 상한을 넘음 · 전부 거부",
      );
    });
    expect(await activeCount(revisionId)).toBe(3);
  });

  it("(4) 상한 설정을 5로 바꾸면 같은 저장이 통과한다 — 상한은 설정 값에서 온다", async () => {
    const { revisionId, subcategory } = await setupRevision();
    await seedLines(revisionId, subcategory, ["active", "active", "active"]);

    await withCap(5, () => saveQuoteLines(SYSTEM_VIEWER, revisionId, { rows: [newLine(subcategory)] }));
    expect(await activeCount(revisionId)).toBe(4);
  });

  it("(5) 상한 3 · 줄 5(상한을 낮춘 뒤) — 실행가만 고친 저장 · 한 줄 보관 저장은 통과, 새 줄은 거부(A-20)", async () => {
    const { revisionId, subcategory } = await setupRevision();
    const rows = await seedLines(revisionId, subcategory, ["active", "active", "active", "active", "active"]);

    await withCap(3, async () => {
      await saveQuoteLines(SYSTEM_VIEWER, revisionId, {
        rows: [asInput(rows[0]!, { execution: { currency: "KRW", amount: 70_000, fxRate: 1 } })],
      });
      await saveQuoteLines(SYSTEM_VIEWER, revisionId, { rows: [], archivedLineIds: [rows[1]!.id] });
      await expect(saveQuoteLines(SYSTEM_VIEWER, revisionId, { rows: [newLine(subcategory)] })).rejects.toThrow(
        "3줄 상한을 넘음 · 전부 거부",
      );
    });
    const [edited] = await db.select().from(quoteLines).where(eq(quoteLines.id, rows[0]!.id));
    expect(edited?.executionAmountKrw).toBe(70_000);
    expect(await activeCount(revisionId)).toBe(4);
  });

  it("(6) 상한 3 · 활성 3 + 보관 1 — 복원은 거부, 활성 2이면 복원은 통과한다(A-19)", async () => {
    const full = await setupRevision();
    const fullRows = await seedLines(full.revisionId, full.subcategory, ["active", "active", "active", "archived"]);
    const roomy = await setupRevision();
    const roomyRows = await seedLines(roomy.revisionId, roomy.subcategory, ["active", "active", "archived"]);

    await withCap(3, async () => {
      await expect(restoreQuoteLine(SYSTEM_VIEWER, fullRows[3]!.id)).rejects.toThrow("3줄 상한을 넘음 · 전부 거부");
      await restoreQuoteLine(SYSTEM_VIEWER, roomyRows[2]!.id);
    });
    expect(await activeCount(full.revisionId)).toBe(3);
    expect(await activeCount(roomy.revisionId)).toBe(3);
  });

  it("(7) 상한 3 · 활성 2에서 새 줄 1개 저장 뒤 같은 배치(같은 uuid)를 다시 보내도 성공하고 활성 줄은 3이다(ENG-D10)", async () => {
    const { revisionId, subcategory } = await setupRevision();
    await seedLines(revisionId, subcategory, ["active", "active"]);
    const batch = { rows: [newLine(subcategory, "재전송 줄")] };

    await withCap(3, async () => {
      await saveQuoteLines(SYSTEM_VIEWER, revisionId, batch);
      await saveQuoteLines(SYSTEM_VIEWER, revisionId, batch);
    });
    expect(await activeCount(revisionId)).toBe(3);
  });

  it("(8) 클라이언트 판정을 거치지 않고 상한을 넘는 새 줄 두 개를 직접 실은 배치는 전부 거부된다(서버 방어)", async () => {
    const { revisionId, subcategory } = await setupRevision();
    await seedLines(revisionId, subcategory, ["active", "active"]);

    await withCap(3, async () => {
      await expect(
        saveQuoteLines(SYSTEM_VIEWER, revisionId, { rows: [newLine(subcategory, "우회 1"), newLine(subcategory, "우회 2")] }),
      ).rejects.toThrow("3줄 상한을 넘음 · 전부 거부");
    });
    expect(await activeCount(revisionId)).toBe(2);
  });

  // A-36 · OV-3 — 연결 A가 잠금을 쥔 채 멈추고 연결 B가 잠금 대기에 든 것을 확인한 뒤 A를 푼다(sleep 없음).
  async function raceTwoAdds(first: QuoteLineWriteRow, second: QuoteLineWriteRow, revisionId: string) {
    const locked = deferred();
    const release = deferred();
    const a = saveQuoteLines(SYSTEM_VIEWER, revisionId, { rows: [first] }, {
      afterLock: async () => {
        locked.resolve();
        await release.promise;
      },
    });
    await locked.promise;
    const b = saveQuoteLines(SYSTEM_VIEWER, revisionId, { rows: [second] });
    try {
      await waitForLockWaiter(pool);
    } finally {
      release.resolve();
    }
    return Promise.allSettled([a, b]);
  }

  it("(9) 상한 3 · 활성 2에서 두 연결이 각각 새 줄 1개를 저장하면 먼저 잠근 쪽만 성공하고 활성 줄은 3이다(두 순서 모두)", async () => {
    const { revisionId, subcategory } = await setupRevision();
    await seedLines(revisionId, subcategory, ["active", "active"]);
    const other = await setupRevision();
    await seedLines(other.revisionId, other.subcategory, ["active", "active"]);

    await withCap(3, async () => {
      const [a1, b1] = await raceTwoAdds(newLine(subcategory, "경합 A"), newLine(subcategory, "경합 B"), revisionId);
      expect(a1.status).toBe("fulfilled");
      expect(b1.status).toBe("rejected");
      if (b1.status === "rejected") expect(String(b1.reason)).toContain("3줄 상한을 넘음 · 전부 거부");

      // 반대 순서 — B의 줄이 먼저 잠근다.
      const [b2, a2] = await raceTwoAdds(newLine(other.subcategory, "경합 B"), newLine(other.subcategory, "경합 A"), other.revisionId);
      expect(b2.status).toBe("fulfilled");
      expect(a2.status).toBe("rejected");
      if (a2.status === "rejected") expect(String(a2.reason)).toContain("3줄 상한을 넘음 · 전부 거부");
    });
    expect(await activeCount(revisionId)).toBe(3);
    expect(await activeCount(other.revisionId)).toBe(3);
  });
});
