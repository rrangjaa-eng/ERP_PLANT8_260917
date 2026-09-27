import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { reserveEntries } from "@/db/schema";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { createAccount } from "@/domain/auth/accounts";
import { insertVendor } from "@/repositories/vendors";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { listReserves, saveReserves, type ReserveWriteRow } from "@/domain/reserves";
import { SaveRejectedError } from "@/domain/quotes/lines";

// 04-07 — 리저브 대장(RSV-01) 서버 쪽. 「경영관리」 페르소나는 SEED_ROLES에 없는 조직상 역할이라 revenue-entries.test.ts와
// 같은 결로 role-ceo에 이 테스트가 `pnl` 쓰기·보기와 `reserve.amount` 노출을 명시로 준다.
async function createFinanceViewer(): Promise<Viewer> {
  const { userId } = await createAccount(SYSTEM_VIEWER, {
    email: `finance-${randomUUID()}@example.test`,
    name: "통합테스트 경영관리",
    roleId: "role-ceo",
  });
  await upsertPermission(SYSTEM_VIEWER, { roleId: "role-ceo", menu: "pnl", action: "view", allowed: true });
  await upsertPermission(SYSTEM_VIEWER, { roleId: "role-ceo", menu: "pnl", action: "write", allowed: true });
  await upsertVisibility(SYSTEM_VIEWER, { roleId: "role-ceo", infoItem: "reserve.amount", visible: true });
  return { id: userId, roleId: "role-ceo" };
}

async function createClient(name = `클라이언트-${randomUUID()}`) {
  return insertVendor(SYSTEM_VIEWER, { name, normalizedName: name.toLowerCase() });
}

function krw(amount: number) {
  return { currency: "KRW" as const, amount, fxRate: 1 };
}

function newRow(clientId: string, entryDate: string, direction: ReserveWriteRow["direction"], amount: number): ReserveWriteRow {
  return { id: randomUUID(), isNew: true, clientId, entryDate, direction, amount: krw(amount) };
}

async function countRows(clientId: string): Promise<number> {
  const rows = await db.select().from(reserveEntries).where(eq(reserveEntries.clientId, clientId));
  return rows.length;
}

async function rejection(promise: Promise<unknown>): Promise<SaveRejectedError> {
  const error = await promise.then(
    () => null,
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(SaveRejectedError);
  return error as SaveRejectedError;
}

describe("domain/reserves — 트레이서: 잔액 계산 · 날짜 마감 음수 거부 (04-07, 실제 Postgres)", () => {
  it("입금 1,000,000(3/1) · 출금 300,000(3/5)을 한 배치로 저장하면 줄 잔액 1,000,000 → 700,000, 최종 잔액 700,000", async () => {
    const finance = await createFinanceViewer();
    const client = await createClient();
    const deposit = newRow(client.id, "2026-03-01", "deposit", 1_000_000);
    const withdrawal = newRow(client.id, "2026-03-05", "withdrawal", 300_000);

    await saveReserves(finance, { rows: [deposit, withdrawal] });

    const list = await listReserves(finance, { page: 1 });
    const mine = list.rows.filter((row) => row.clientId === client.id);
    expect(mine.map((row) => [row.id, row.balanceKrw])).toEqual([
      [deposit.id, 1_000_000],
      [withdrawal.id, 700_000],
    ]);
    expect(list.clientBalances?.find((entry) => entry.clientId === client.id)?.balanceKrw).toBe(700_000);
    expect(await countRows(client.id)).toBe(2);
  });

  it("이어서 마감 잔액을 음수로 만드는 출금 800,000(3/10)은 그 줄 금액 칸 오류로 전부 거부되고 DB가 그대로다", async () => {
    const finance = await createFinanceViewer();
    const client = await createClient();
    await saveReserves(finance, {
      rows: [newRow(client.id, "2026-03-01", "deposit", 1_000_000), newRow(client.id, "2026-03-05", "withdrawal", 300_000)],
    });
    const over = newRow(client.id, "2026-03-10", "withdrawal", 800_000);

    const error = await rejection(saveReserves(finance, { rows: [over] }));

    expect(error.formatErrors).toEqual([
      expect.objectContaining({ rowId: over.id, field: "amount", reason: "이 줄 뒤 잔액 -100,000 · 금액을 줄이거나 입금 줄 먼저" }),
    ]);
    expect(await countRows(client.id)).toBe(2);
  });

  it("입금 1,000,000(3/1) · 출금 800,000(2/1) 한 배치 — 마지막 잔액(200,000)이 아니라 2/1 마감 음수로 거부된다", async () => {
    const finance = await createFinanceViewer();
    const client = await createClient();
    const early = newRow(client.id, "2026-02-01", "withdrawal", 800_000);

    const error = await rejection(saveReserves(finance, { rows: [newRow(client.id, "2026-03-01", "deposit", 1_000_000), early] }));

    expect(error.formatErrors).toEqual([expect.objectContaining({ rowId: early.id, field: "amount", reason: "이 줄 뒤 잔액 -800,000 · 금액을 줄이거나 입금 줄 먼저" })]);
    expect(await countRows(client.id)).toBe(0);
  });
});
