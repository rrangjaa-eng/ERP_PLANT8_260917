import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { actionLog, reserveEntries, teams } from "@/db/schema";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { createAccount } from "@/domain/auth/accounts";
import { insertVendor } from "@/repositories/vendors";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { listReserves, saveReserves, type ReserveWriteRow } from "@/domain/reserves";
import { SaveRejectedError } from "@/domain/quotes/lines";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { createProject } from "@/domain/projects";
import { FX_RECENT_RATE_USD } from "@/domain/settings/keys";
import { getSettingValue } from "@/domain/settings/registry";
import { UserFacingError } from "@/lib/actions/user-facing-error";
import { log } from "@/lib/log";

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

async function createProjectFor(clientId: string) {
  const { userId: pmUserId } = await createAccount(SYSTEM_VIEWER, {
    email: `pm-${randomUUID()}@example.test`,
    name: "통합테스트 PM",
    roleId: DEFAULT_ROLE_ID,
  });
  const [team] = await db.select().from(teams).limit(1);
  if (!team) throw new Error("시드된 팀이 없습니다");
  return createProject(SYSTEM_VIEWER, { clientId, teamId: team.id, pmUserId, name: `프로젝트-${randomUUID()}` });
}

async function storedRow(id: string) {
  const [row] = await db.select().from(reserveEntries).where(eq(reserveEntries.id, id));
  return row;
}

async function reserveLogs(actionType: string) {
  return db
    .select()
    .from(actionLog)
    .where(and(eq(actionLog.entity, "reserve_entry"), eq(actionLog.actionType, actionType)));
}

async function userFacing(promise: Promise<unknown>): Promise<UserFacingError> {
  const error = await promise.then(
    () => null,
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(UserFacingError);
  return error as UserFacingError;
}

// 거부 한 번마다 write.denied 경고가 정확히 한 번, 금액·메모 키 없이 남는다(사용자 D19-3 · B-26).
async function expectOneDenied<T>(rule: string, run: () => Promise<T>): Promise<T> {
  const warn = vi.spyOn(log, "warn");
  try {
    const result = await run();
    const denied = warn.mock.calls.filter(([event]) => event === "write.denied");
    expect(denied).toHaveLength(1);
    const fields = denied[0]?.[1] as Record<string, unknown>;
    expect(fields.rule).toBe(rule);
    expect(Object.keys(fields).filter((key) => /amount|balance|krw|note/i.test(key))).toEqual([]);
    return result;
  } finally {
    warn.mockRestore();
  }
}

describe("domain/reserves — 입력 계약 · 재전송 · 환율 · 수정 로그 · 거부 경고 (04-07 Task 2)", () => {
  it("KRW 줄에 환율 1,350을 실어도 원화 = 금액 × 1, 환율 1로 저장된다", async () => {
    const finance = await createFinanceViewer();
    const client = await createClient();
    const forged = { ...newRow(client.id, "2026-03-01", "deposit", 1_000), amount: { currency: "KRW" as const, amount: 1_000, fxRate: 1_350 } };

    await saveReserves(finance, { rows: [forged] });

    const stored = await storedRow(forged.id);
    expect(stored?.amountAmountKrw).toBe(1_000);
    expect(stored?.amountFxRate).toBe("1.0000");
  });

  it.each([
    ["USD 환율 0", { currency: "USD" as const, amount: 100, fxRate: 0 }, "fxRate"],
    ["금액 0", { currency: "KRW" as const, amount: 0, fxRate: 1 }, "amount"],
    ["음수 금액(음수 출금으로 입금 흉내)", { currency: "KRW" as const, amount: -5_000, fxRate: 1 }, "amount"],
    ["원화 환산 상한(1조 원) 이상", { currency: "KRW" as const, amount: 1_000_000_000_000, fxRate: 1 }, "amount"],
  ])("%s → 그 칸 이유로 거부, DB 무변경", async (_label, amount, field) => {
    const finance = await createFinanceViewer();
    const client = await createClient();
    const bad = { ...newRow(client.id, "2026-03-01", "withdrawal", 1), amount };

    const error = await expectOneDenied("reserve.input", () => rejection(saveReserves(finance, { rows: [bad] })));

    expect(error.formatErrors).toEqual([expect.objectContaining({ rowId: bad.id, field })]);
    expect(await countRows(client.id)).toBe(0);
  });

  it("날짜 2026-02-30은 PG 22008이 아니라 날짜 칸 이유로 거부된다", async () => {
    const finance = await createFinanceViewer();
    const client = await createClient();
    const bad = newRow(client.id, "2026-02-30", "deposit", 1_000);

    const error = await rejection(saveReserves(finance, { rows: [bad] }));

    expect(error.formatErrors).toEqual([expect.objectContaining({ rowId: bad.id, field: "entryDate", reason: "날짜 형식 오류 · 2026-09-18처럼" })]);
    expect(await countRows(client.id)).toBe(0);
  });

  it("이미 보관된 줄을 고치는 배치와 다시 보관하는 배치는 `보관된 줄 · 새로 고침`으로 거부된다", async () => {
    const finance = await createFinanceViewer();
    const client = await createClient();
    const deposit = newRow(client.id, "2026-03-01", "deposit", 1_000_000);
    await saveReserves(finance, { rows: [deposit] });
    await db.update(reserveEntries).set({ archivedAt: new Date() }).where(eq(reserveEntries.id, deposit.id));

    const edit = { ...deposit, isNew: undefined, version: 1, amount: krw(2_000_000) };
    const editError = await rejection(saveReserves(finance, { rows: [edit] }));
    expect(editError.formatErrors).toEqual([expect.objectContaining({ rowId: deposit.id, reason: "보관된 줄 · 새로 고침" })]);

    const archiveError = await rejection(saveReserves(finance, { rows: [], archivedIds: [deposit.id] }));
    expect(archiveError.formatErrors).toEqual([expect.objectContaining({ rowId: deposit.id, reason: "보관된 줄 · 새로 고침" })]);
    expect((await storedRow(deposit.id))?.amountAmountKrw).toBe(1_000_000);
  });

  it("클라이언트 A 줄에 클라이언트 B 프로젝트를 고르면 `이 프로젝트의 클라이언트가 아닙니다`(PG 오류 아님)", async () => {
    const finance = await createFinanceViewer();
    const clientA = await createClient();
    const clientB = await createClient();
    const projectB = await createProjectFor(clientB.id);
    const row = { ...newRow(clientA.id, "2026-03-01", "deposit", 1_000), projectId: projectB.id };

    const error = await rejection(saveReserves(finance, { rows: [row] }));

    expect(error.formatErrors).toEqual([expect.objectContaining({ rowId: row.id, field: "projectId", reason: "이 프로젝트의 클라이언트가 아닙니다" })]);
    expect(await countRows(clientA.id)).toBe(0);
  });

  it("같은 클라이언트의 프로젝트를 고르면 저장된다", async () => {
    const finance = await createFinanceViewer();
    const client = await createClient();
    const project = await createProjectFor(client.id);
    const row = { ...newRow(client.id, "2026-03-01", "deposit", 1_000), projectId: project.id };

    await saveReserves(finance, { rows: [row] });

    expect((await storedRow(row.id))?.projectId).toBe(project.id);
  });

  it("없는 clientId는 PG 23503이 아니라 `클라이언트를 찾을 수 없습니다`로 거부된다", async () => {
    const finance = await createFinanceViewer();
    const row = newRow(randomUUID(), "2026-03-01", "deposit", 1_000);

    const error = await rejection(saveReserves(finance, { rows: [row] }));

    expect(error.formatErrors).toEqual([expect.objectContaining({ rowId: row.id, field: "clientId", reason: "클라이언트를 찾을 수 없습니다" })]);
    expect(await storedRow(row.id)).toBeUndefined();
  });

  it("코드표에 없는 증빙 종류는 `증빙 종류를 고르세요`로 거부되고, 코드표 값은 저장된다", async () => {
    const finance = await createFinanceViewer();
    const client = await createClient();
    const bad = { ...newRow(client.id, "2026-03-01", "deposit", 1_000), evidenceType: "not-a-code" };

    const error = await rejection(saveReserves(finance, { rows: [bad] }));
    expect(error.formatErrors).toEqual([expect.objectContaining({ rowId: bad.id, field: "evidenceType", reason: "증빙 종류를 고르세요" })]);

    const good = { ...newRow(client.id, "2026-03-01", "deposit", 1_000), evidenceType: "tax_invoice", taxInvoiceNumber: "20260301-0001" };
    await saveReserves(finance, { rows: [good] });
    expect((await storedRow(good.id))?.evidenceType).toBe("tax_invoice");
  });

  it("재전송(ENG-D10): 같은 배치를 두 번 보내도 한 행 · 잔액 한 번 · document_create 한 번", async () => {
    const finance = await createFinanceViewer();
    const client = await createClient();
    const deposit = newRow(client.id, "2026-03-01", "deposit", 1_000_000);

    await saveReserves(finance, { rows: [deposit] });
    await saveReserves(finance, { rows: [deposit] });

    expect(await countRows(client.id)).toBe(1);
    const list = await listReserves(finance, { page: 1 });
    expect(list.clientBalances?.find((entry) => entry.clientId === client.id)?.balanceKrw).toBe(1_000_000);
    expect((await reserveLogs("document_create")).filter((row) => row.entityId === deposit.id)).toHaveLength(1);
  });

  it("같은 id에 다른 금액, 또는 남의 클라이언트 줄 id를 새 줄로 보내면 `이미 저장된 줄과 값이 다름 · 새로 고침`", async () => {
    const finance = await createFinanceViewer();
    const clientA = await createClient();
    const clientB = await createClient();
    const deposit = newRow(clientA.id, "2026-03-01", "deposit", 1_000_000);
    await saveReserves(finance, { rows: [deposit] });

    const changed = await expectOneDenied("reserve.replay-mismatch", () =>
      userFacing(saveReserves(finance, { rows: [{ ...deposit, amount: krw(900_000) }] })),
    );
    expect(changed.message).toBe("이미 저장된 줄과 값이 다름 · 새로 고침");
    expect((await storedRow(deposit.id))?.amountAmountKrw).toBe(1_000_000);

    const foreign = await userFacing(saveReserves(finance, { rows: [{ ...deposit, clientId: clientB.id }] }));
    expect(foreign.message).toBe("이미 저장된 줄과 값이 다름 · 새로 고침");
    expect(await countRows(clientB.id)).toBe(0);
  });

  it("기존 줄의 클라이언트를 바꾸면 `클라이언트는 첫 저장 뒤 잠김 · 새 줄로 적어 주세요`, DB 무변경(사용자 D6)", async () => {
    const finance = await createFinanceViewer();
    const clientA = await createClient();
    const clientB = await createClient();
    const deposit = newRow(clientA.id, "2026-03-01", "deposit", 1_000_000);
    await saveReserves(finance, { rows: [deposit] });

    const error = await expectOneDenied("reserve.client-locked", () =>
      rejection(saveReserves(finance, { rows: [{ ...deposit, isNew: undefined, version: 1, clientId: clientB.id }] })),
    );

    expect(error.formatErrors).toEqual([expect.objectContaining({ rowId: deposit.id, field: "clientId", reason: "클라이언트는 첫 저장 뒤 잠김 · 새 줄로 적어 주세요" })]);
    expect((await storedRow(deposit.id))?.clientId).toBe(clientA.id);
  });

  it("서버 셀 단계: 기존 줄 클라이언트 칸은 locked, 새 줄 클라이언트 칸은 edit, 잔액 칸은 readonly", async () => {
    const finance = await createFinanceViewer();
    const client = await createClient();
    await saveReserves(finance, { rows: [newRow(client.id, "2026-03-01", "deposit", 1_000)] });

    const list = await listReserves(finance, { page: 1 });

    expect(list.rows[0]?.cellEditability).toMatchObject({ clientId: "locked", amount: "edit", balanceKrw: "readonly" });
    expect(list.newRowCellEditability).toMatchObject({ clientId: "edit", balanceKrw: "readonly" });
  });

  it("환율을 고친 USD 저장만 커밋 뒤 최근 환율을 갱신하고, 고치지 않은 저장·거부된 배치는 설정을 바꾸지 않는다(B-12 · GAP 3e)", async () => {
    const finance = await createFinanceViewer();
    const client = await createClient();
    const before = await getSettingValue(FX_RECENT_RATE_USD, {});
    const untouched = { ...newRow(client.id, "2026-03-01", "deposit", 1), amount: { currency: "USD" as const, amount: 1_000, fxRate: 1_370 } };

    await saveReserves(finance, { rows: [untouched] });
    expect(await getSettingValue(FX_RECENT_RATE_USD, {})).toBe(before);

    const touchedButRejected = { ...newRow(client.id, "2026-03-02", "deposit", 1), amount: { currency: "USD" as const, amount: 10, fxRate: 1_380 }, fxRateTouched: true };
    const overdraw = newRow(client.id, "2026-03-02", "withdrawal", 999_999_999);
    await rejection(saveReserves(finance, { rows: [touchedButRejected, overdraw] }));
    expect(await getSettingValue(FX_RECENT_RATE_USD, {})).toBe(before);

    await saveReserves(finance, { rows: [{ ...touchedButRejected, id: randomUUID() }] });
    expect(await getSettingValue(FX_RECENT_RATE_USD, {})).toBe(1_380);
  });

  it("수정 로그(ENG-D8): 금액 300,000 → 250,000 · 날짜 3/5 → 3/6이 document_update detail에 가려지지 않은 값으로 남는다", async () => {
    const finance = await createFinanceViewer();
    const client = await createClient();
    const deposit = newRow(client.id, "2026-03-01", "deposit", 1_000_000);
    const withdrawal = newRow(client.id, "2026-03-05", "withdrawal", 300_000);
    await saveReserves(finance, { rows: [deposit, withdrawal] });

    await saveReserves(finance, { rows: [{ ...withdrawal, isNew: undefined, version: 1, entryDate: "2026-03-06", amount: krw(250_000) }] });

    const updates = (await reserveLogs("document_update")).filter((row) => row.entityId === withdrawal.id);
    expect(updates).toHaveLength(1);
    expect(updates[0]?.detail).toEqual({
      entryId: withdrawal.id,
      clientId: client.id,
      changed: { amount: [300_000, 250_000], entryDate: ["2026-03-05", "2026-03-06"] },
    });
    expect((await storedRow(withdrawal.id))?.version).toBe(2);
  });

  it("잔액 음수 거부도 write.denied 한 번(규칙 reserve.balance-negative, 금액 없음)", async () => {
    const finance = await createFinanceViewer();
    const client = await createClient();

    await expectOneDenied("reserve.balance-negative", () => rejection(saveReserves(finance, { rows: [newRow(client.id, "2026-03-01", "withdrawal", 1)] })));
  });
});
