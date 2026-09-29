import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { db, pool } from "@/db/client";
import { actionLog, codeItems, projects, reserveEntries, teams, vendors } from "@/db/schema";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { createAccount } from "@/domain/auth/accounts";
import { insertVendor } from "@/repositories/vendors";
import { insertCodeItem } from "@/repositories/code-tables";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { listReserveReferences, listReserves, saveReserves, type ReserveWriteRow } from "@/domain/reserves";
import { SaveRejectedError } from "@/domain/quotes/lines";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { createProject } from "@/domain/projects";
import { FX_RECENT_RATE_USD } from "@/domain/settings/keys";
import { getSettingValue } from "@/domain/settings/registry";
import { UserFacingError } from "@/lib/actions/user-facing-error";
import { log } from "@/lib/log";
import { recordAction } from "@/domain/action-log/record";
import { addDays } from "@/lib/kst-date";
import { ForbiddenError } from "@/domain/permissions/can";
import { insertRole } from "@/repositories/roles";
import { archive, listArchive, restore, ProtectedRowError } from "@/domain/archive";
import { listArchivedAcrossEntities } from "@/repositories/archive";
import { restoreReserve, ReserveBalanceRejectedError } from "@/domain/reserves";
import { deferred, waitForLockWaiter } from "./lock-race";

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

    const archiveError = await rejection(saveReserves(finance, { rows: [], archived: [{ id: deposit.id, version: 1 }] }));
    expect(archiveError.formatErrors).toEqual([expect.objectContaining({ rowId: deposit.id, reason: "보관된 줄 · 새로 고침" })]);
    expect((await storedRow(deposit.id))?.amountAmountKrw).toBe(1_000_000);
  });

  it("클라이언트 A 줄에 클라이언트 B 프로젝트를 고르면 `다른 클라이언트의 프로젝트 · 프로젝트 다시 고르기`(PG 오류 아님)", async () => {
    const finance = await createFinanceViewer();
    const clientA = await createClient();
    const clientB = await createClient();
    const projectB = await createProjectFor(clientB.id);
    const row = { ...newRow(clientA.id, "2026-03-01", "deposit", 1_000), projectId: projectB.id };

    const error = await rejection(saveReserves(finance, { rows: [row] }));

    expect(error.formatErrors).toEqual([expect.objectContaining({ rowId: row.id, field: "projectId", reason: "다른 클라이언트의 프로젝트 · 프로젝트 다시 고르기" })]);
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

  it("없는 clientId는 PG 23503이 아니라 `클라이언트 없음 · 클라이언트 다시 고르기`로 거부된다", async () => {
    const finance = await createFinanceViewer();
    const row = newRow(randomUUID(), "2026-03-01", "deposit", 1_000);

    const error = await rejection(saveReserves(finance, { rows: [row] }));

    expect(error.formatErrors).toEqual([expect.objectContaining({ rowId: row.id, field: "clientId", reason: "클라이언트 없음 · 클라이언트 다시 고르기" })]);
    expect(await storedRow(row.id)).toBeUndefined();
  });

  // 묶음 ④ /review R10 — 새 줄의 클라이언트는 고를 수 있는 거래처(보관·숨김 아님)만. 기존 줄은 거래처가 나중에 보관·숨김돼도 고칠 수 있다.
  it.each([
    ["보관된", { archivedAt: new Date() }],
    ["숨긴", { hidden: true }],
  ])("%s 거래처를 새 줄 클라이언트로 보내면 `클라이언트 없음 · 클라이언트 다시 고르기`, 기존 줄 수정은 통과", async (_label, change) => {
    const finance = await createFinanceViewer();
    const client = await createClient();
    const deposit = newRow(client.id, "2026-03-01", "deposit", 1_000_000);
    await saveReserves(finance, { rows: [deposit] });
    await db.update(vendors).set(change).where(eq(vendors.id, client.id));
    const row = newRow(client.id, "2026-03-02", "deposit", 1_000);

    const error = await rejection(saveReserves(finance, { rows: [row] }));

    expect(error.formatErrors).toEqual([expect.objectContaining({ rowId: row.id, field: "clientId", reason: "클라이언트 없음 · 클라이언트 다시 고르기" })]);
    expect(await storedRow(row.id)).toBeUndefined();
    await saveReserves(finance, { rows: [{ ...deposit, isNew: undefined, version: 1, note: "보관 뒤 수정" }] });
    expect((await storedRow(deposit.id))?.note).toBe("보관 뒤 수정");
  });

  it("uuid 모양이 아닌 줄 id·clientId·projectId·archived는 PG 22P02가 아니라 칸 이유로 한 번에 거부된다(리뷰 S3)", async () => {
    const finance = await createFinanceViewer();
    const client = await createClient();
    const badId = { ...newRow(client.id, "2026-03-01", "deposit", 1_000), id: "not-a-uuid" };
    const badClient = newRow("client-x", "2026-03-01", "deposit", 1_000);
    const badProject = { ...newRow(client.id, "2026-03-01", "deposit", 1_000), projectId: "project-x" };

    const error = await expectOneDenied("reserve.input", () =>
      rejection(saveReserves(finance, { rows: [badId, badClient, badProject], archived: [{ id: "archived-x", version: 1 }] })),
    );

    expect(error.formatErrors).toEqual([
      expect.objectContaining({ rowId: "not-a-uuid", field: "row", reason: "줄을 찾을 수 없음 · 새로 고침" }),
      expect.objectContaining({ rowId: badClient.id, field: "clientId", reason: "클라이언트 없음 · 클라이언트 다시 고르기" }),
      expect.objectContaining({ rowId: badProject.id, field: "projectId", reason: "다른 클라이언트의 프로젝트 · 프로젝트 다시 고르기" }),
      expect.objectContaining({ rowId: "archived-x", field: "row", reason: "줄을 찾을 수 없음 · 새로 고침" }),
    ]);
    expect(await countRows(client.id)).toBe(0);
  });

  it("uuid 모양이 아닌 id 복원은 PG 22P02가 아니라 `줄을 찾을 수 없음 · 새로 고침`, write.denied 한 번(리뷰 S3)", async () => {
    const finance = await createFinanceViewer();

    const error = await expectOneDenied("reserve.restore", () => userFacing(restoreReserve(finance, "not-a-uuid")));

    expect(error.message).toBe("줄을 찾을 수 없음 · 새로 고침");
  });

  it("코드표에 없는 증빙 종류는 `코드표에 없는 증빙 종류 · 증빙 종류 고르기`로 거부되고, 코드표 값은 저장된다", async () => {
    const finance = await createFinanceViewer();
    const client = await createClient();
    const bad = { ...newRow(client.id, "2026-03-01", "deposit", 1_000), evidenceType: "not-a-code" };

    const error = await rejection(saveReserves(finance, { rows: [bad] }));
    expect(error.formatErrors).toEqual([expect.objectContaining({ rowId: bad.id, field: "evidenceType", reason: "코드표에 없는 증빙 종류 · 증빙 종류 고르기" })]);

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

  // 묶음 ④ /review T1 — 돈 원장의 낙관적 잠금(version)과 응답을 잃은 수정 재전송(SF-2 선례).
  describe("수정 버전 충돌 · 재전송", () => {
    async function savedDeposit(finance: Viewer) {
      const client = await createClient();
      const deposit = newRow(client.id, "2026-03-01", "deposit", 1_000_000);
      await saveReserves(finance, { rows: [deposit] });
      return deposit;
    }

    it("낡은 version(1)으로 고치면 `다른 사람이 먼저 이 줄을 바꿈 · 새로 고침`, DB는 먼저 저장한 값 그대로", async () => {
      const finance = await createFinanceViewer();
      const deposit = await savedDeposit(finance);
      await saveReserves(finance, { rows: [{ ...deposit, isNew: undefined, version: 1, amount: krw(900_000) }] });

      const error = await expectOneDenied("reserve.version-conflict", () =>
        userFacing(saveReserves(finance, { rows: [{ ...deposit, isNew: undefined, version: 1, note: "낡은 탭" }] })),
      );

      expect(error.message).toBe("다른 사람이 먼저 이 줄을 바꿈 · 새로 고침");
      expect(await storedRow(deposit.id)).toMatchObject({ version: 2, amountAmountKrw: 900_000, note: null });
    });

    it("같은 수정을 같은 version으로 다시 보내면(응답 유실) no-op — version 2 그대로, document_update 한 번", async () => {
      const finance = await createFinanceViewer();
      const deposit = await savedDeposit(finance);
      const edit = { ...deposit, isNew: undefined, version: 1, amount: krw(900_000) };
      await saveReserves(finance, { rows: [edit] });

      await saveReserves(finance, { rows: [edit] });

      expect(await storedRow(deposit.id)).toMatchObject({ version: 2, amountAmountKrw: 900_000 });
      expect((await reserveLogs("document_update")).filter((row) => row.entityId === deposit.id)).toHaveLength(1);
    });

    it("같은 version으로 다른 값을 다시 보내면 버전 충돌, DB는 첫 수정 값 그대로", async () => {
      const finance = await createFinanceViewer();
      const deposit = await savedDeposit(finance);
      await saveReserves(finance, { rows: [{ ...deposit, isNew: undefined, version: 1, amount: krw(900_000) }] });

      const error = await userFacing(saveReserves(finance, { rows: [{ ...deposit, isNew: undefined, version: 1, amount: krw(800_000) }] }));

      expect(error.message).toBe("다른 사람이 먼저 이 줄을 바꿈 · 새로 고침");
      expect(await storedRow(deposit.id)).toMatchObject({ version: 2, amountAmountKrw: 900_000 });
      expect((await reserveLogs("document_update")).filter((row) => row.entityId === deposit.id)).toHaveLength(1);
    });
  });

  it("판정 뒤 조건부 갱신이 경합으로 0행이면 버전 충돌, write.denied 한 번(규칙 reserve.version-conflict), 배치 전체 롤백", async () => {
    const finance = await createFinanceViewer();
    const client = await createClient();
    const deposit = newRow(client.id, "2026-03-01", "deposit", 1_000_000);
    await saveReserves(finance, { rows: [deposit] });
    const added = newRow(client.id, "2026-03-02", "deposit", 10);
    let bumped = false;

    const error = await expectOneDenied("reserve.version-conflict", () =>
      userFacing(
        saveReserves(
          finance,
          { rows: [added, { ...deposit, isNew: undefined, version: 1, note: "경합" }] },
          {
            recordAction: async (...args: Parameters<typeof recordAction>) => {
              if (!bumped) {
                bumped = true;
                await db.update(reserveEntries).set({ version: 2 }).where(eq(reserveEntries.id, deposit.id));
              }
              return recordAction(...args);
            },
          },
        ),
      ),
    );

    expect(error.message).toBe("다른 사람이 먼저 이 줄을 바꿈 · 새로 고침");
    expect(await countRows(client.id)).toBe(1);
  });

  it("기존 줄의 클라이언트를 바꾸면 `클라이언트는 첫 저장 뒤 잠김 · 새 줄로 적기`, DB 무변경(사용자 D6)", async () => {
    const finance = await createFinanceViewer();
    const clientA = await createClient();
    const clientB = await createClient();
    const deposit = newRow(clientA.id, "2026-03-01", "deposit", 1_000_000);
    await saveReserves(finance, { rows: [deposit] });

    const error = await expectOneDenied("reserve.client-locked", () =>
      rejection(saveReserves(finance, { rows: [{ ...deposit, isNew: undefined, version: 1, clientId: clientB.id }] })),
    );

    expect(error.formatErrors).toEqual([expect.objectContaining({ rowId: deposit.id, field: "clientId", reason: "클라이언트는 첫 저장 뒤 잠김 · 새 줄로 적기" })]);
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

// 권한표·노출표를 이 테스트가 직접 채운 새 계급의 사람(시드 계급과 섞이지 않는다).
async function createViewerWith(opts: { permissions: [string, "view" | "write"][]; reserveVisible: boolean }): Promise<Viewer> {
  const roleId = `role-${randomUUID()}`;
  await insertRole(SYSTEM_VIEWER, { id: roleId, name: `계급 ${roleId.slice(5, 13)}` });
  for (const [menu, action] of opts.permissions) await upsertPermission(SYSTEM_VIEWER, { roleId, menu, action, allowed: true });
  await upsertVisibility(SYSTEM_VIEWER, { roleId, infoItem: "reserve.amount", visible: opts.reserveVisible });
  const { userId } = await createAccount(SYSTEM_VIEWER, { email: `u-${randomUUID()}@example.test`, name: "통합테스트 사용자", roleId });
  return { id: userId, roleId };
}

async function caught(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => null,
    (error: unknown) => error,
  );
}

// 한 클라이언트 51줄: 1쪽 첫 줄 = 입금 1,000,000(1/1) · 그 뒤 입금 1원 49줄 · 2쪽(51번째) = 출금 1,000,000.
async function seedFiftyOne(finance: Viewer, clientId: string) {
  const first = newRow(clientId, "2026-01-01", "deposit", 1_000_000);
  const smalls = Array.from({ length: 49 }, (_, i) => newRow(clientId, addDays("2026-01-02", i), "deposit", 1));
  const last = newRow(clientId, "2026-06-01", "withdrawal", 1_000_000);
  await saveReserves(finance, { rows: [first, ...smalls, last] });
  return { first, last };
}

describe("domain/reserves — 권한 · 노출 · 보관/복원 · 페이지 · 경합 (04-07 Task 3)", () => {
  it("pnl 보기만 있는 사람의 저장은 ForbiddenError, DB 무변경, write.denied 한 번", async () => {
    const viewer = await createViewerWith({ permissions: [["pnl", "view"]], reserveVisible: true });
    const client = await createClient();

    const error = await expectOneDenied("reserve.forbidden", () => caught(saveReserves(viewer, { rows: [newRow(client.id, "2026-03-01", "deposit", 1_000)] })));

    expect(error).toBeInstanceOf(ForbiddenError);
    expect(await countRows(client.id)).toBe(0);
  });

  it("pnl 쓰기는 있고 reserve.amount가 꺼진 계급의 저장·복원은 숫자 없는 ForbiddenError — 잔액을 떠볼 수 없다(GAP 3a)", async () => {
    const finance = await createFinanceViewer();
    const viewer = await createViewerWith({ permissions: [["pnl", "view"], ["pnl", "write"], ["admin.archive", "write"]], reserveVisible: false });
    const client = await createClient();
    const deposit = newRow(client.id, "2026-03-01", "deposit", 1_000_000);
    const withdrawal = newRow(client.id, "2026-03-05", "withdrawal", 300_000);
    await saveReserves(finance, { rows: [deposit, withdrawal], archived: [] });
    await saveReserves(finance, { rows: [], archived: [{ id: withdrawal.id, version: 1 }] });

    const saveError = await expectOneDenied("reserve.forbidden", () => caught(saveReserves(viewer, { rows: [newRow(client.id, "2026-03-02", "withdrawal", 5_000_000)] })));
    expect(saveError).toBeInstanceOf(ForbiddenError);
    expect((saveError as Error).message).not.toMatch(/\d/);

    const restoreError = await expectOneDenied("reserve.forbidden", () => caught(restoreReserve(viewer, withdrawal.id)));
    expect(restoreError).toBeInstanceOf(ForbiddenError);
    expect((restoreError as Error).message).not.toMatch(/\d/);
    expect(await countRows(client.id)).toBe(2);
    expect((await storedRow(withdrawal.id))?.archivedAt).not.toBeNull();
  });

  it("admin.archive 없는 경영관리가 배치 archived로 출금 줄을 보관 → 통과, 보관함에 금액 없는 이름으로 나타난다", async () => {
    const finance = await createFinanceViewer();
    const client = await createClient("현대자동차");
    const deposit = newRow(client.id, "2026-03-01", "deposit", 1_000_000);
    const withdrawal = newRow(client.id, "2026-03-05", "withdrawal", 300_000);
    await saveReserves(finance, { rows: [deposit, withdrawal] });

    await saveReserves(finance, { rows: [], archived: [{ id: withdrawal.id, version: 1 }] });

    expect((await storedRow(withdrawal.id))?.archivedAt).not.toBeNull();
    const items = (await listArchivedAcrossEntities(SYSTEM_VIEWER)).filter((item) => item.entity === "reserve_entry");
    expect(items.map((item) => [item.id, item.label, item.name])).toEqual([[withdrawal.id, "리저브", "2026-03-05 현대자동차 출금"]]);
    expect((await reserveLogs("archive")).map((row) => row.entityId)).toEqual([withdrawal.id]);
  });

  // 묶음 ④ /review R9 — 보관(삭제)도 수정처럼 version을 싣고 저장된 version과 비교한다(낡은 탭·복원 초안의 lost update 방지).
  it("보관 요청의 version이 낡았으면 `다른 사람이 먼저 이 줄을 바꿈 · 새로 고침`, 줄은 보관되지 않는다 · 지금 version이면 보관된다", async () => {
    const finance = await createFinanceViewer();
    const client = await createClient();
    const deposit = newRow(client.id, "2026-03-01", "deposit", 1_000_000);
    const withdrawal = newRow(client.id, "2026-03-05", "withdrawal", 300_000);
    await saveReserves(finance, { rows: [deposit, withdrawal] });
    await saveReserves(finance, { rows: [{ ...withdrawal, isNew: undefined, version: 1, amount: krw(250_000) }] });

    const error = await expectOneDenied("reserve.version-conflict", () =>
      userFacing(saveReserves(finance, { rows: [], archived: [{ id: withdrawal.id, version: 1 }] })),
    );

    expect(error.message).toBe("다른 사람이 먼저 이 줄을 바꿈 · 새로 고침");
    expect(await storedRow(withdrawal.id)).toMatchObject({ archivedAt: null, version: 2 });
    expect(await reserveLogs("archive")).toHaveLength(0);

    await saveReserves(finance, { rows: [], archived: [{ id: withdrawal.id, version: 2 }] });
    expect((await storedRow(withdrawal.id))?.archivedAt).not.toBeNull();
  });

  // 묶음 ④ /review R3 — B-15 「줄·건수·날짜까지(부분 노출 금지)」: 보관함 목록도 pnl 보기 + reserve.amount가 없으면
  // 리저브 줄(날짜·클라이언트·구분·건수)을 싣지 않는다. 다른 보관 항목은 그대로다.
  it("보관함 목록은 pnl 보기 + reserve.amount가 없는 보관함 열람자에게 리저브 줄을 빼고, 둘 다 있으면 싣는다", async () => {
    const finance = await createFinanceViewer();
    const client = await createClient();
    const deposit = newRow(client.id, "2026-03-01", "deposit", 1_000_000);
    const withdrawal = newRow(client.id, "2026-03-05", "withdrawal", 300_000);
    await saveReserves(finance, { rows: [deposit, withdrawal] });
    await saveReserves(finance, { rows: [], archived: [{ id: withdrawal.id, version: 1 }] });
    const archiveReader = async (grants: [string, "view" | "write"][], reserveVisible: boolean) => {
      const viewer = await createViewerWith({ permissions: [["admin.archive", "view"], ...grants], reserveVisible });
      if (!viewer.roleId) throw new Error("계급 없는 테스트 사용자");
      await upsertVisibility(SYSTEM_VIEWER, { roleId: viewer.roleId, infoItem: "archive.value", visible: true });
      return viewer;
    };
    const reserveIds = async (viewer: Viewer) => (await listArchive(viewer)).filter((item) => item.entity === "reserve_entry").map((item) => item.id);

    expect(await reserveIds(await archiveReader([], false))).toEqual([]);
    expect(await reserveIds(await archiveReader([["pnl", "view"]], false))).toEqual([]);
    expect(await reserveIds(await archiveReader([], true))).toEqual([]);
    expect(await reserveIds(await archiveReader([["pnl", "view"]], true))).toEqual([withdrawal.id]);
  });

  it("입금 줄 보관으로 중간 날짜가 음수가 되는 배치는 거부되고 DB 무변경", async () => {
    const finance = await createFinanceViewer();
    const client = await createClient();
    const deposit = newRow(client.id, "2026-03-01", "deposit", 1_000_000);
    await saveReserves(finance, { rows: [deposit, newRow(client.id, "2026-03-05", "withdrawal", 300_000), newRow(client.id, "2026-04-01", "deposit", 5_000_000)] });

    const error = await rejection(saveReserves(finance, { rows: [], archived: [{ id: deposit.id, version: 1 }] }));

    expect(error).toBeInstanceOf(ReserveBalanceRejectedError);
    expect(error.formatErrors).toEqual([expect.objectContaining({ field: "amount", reason: "이 줄 뒤 잔액 -300,000 · 금액을 줄이거나 입금 줄 먼저" })]);
    expect((error as ReserveBalanceRejectedError).rejection.entryDate).toBe("2026-03-05");
    expect((await storedRow(deposit.id))?.archivedAt).toBeNull();
  });

  it("같은 줄을 수정(rows)과 보관(archived)에 함께 보내면 잔액 판정을 비켜 가지 못하고 거부, DB 무변경(리뷰 B1)", async () => {
    const finance = await createFinanceViewer();
    const client = await createClient();
    const deposit = newRow(client.id, "2026-03-01", "deposit", 1_000_000);
    const withdrawal = newRow(client.id, "2026-03-05", "withdrawal", 800_000);
    await saveReserves(finance, { rows: [deposit, withdrawal] });

    const error = await expectOneDenied("reserve.input", () =>
      rejection(saveReserves(finance, { rows: [{ ...deposit, isNew: undefined, version: 1 }], archived: [{ id: deposit.id, version: 1 }] })),
    );

    expect(error.formatErrors).toEqual([expect.objectContaining({ rowId: deposit.id, reason: "같은 줄 중복 · 새로 고침" })]);
    expect(await storedRow(deposit.id)).toMatchObject({ archivedAt: null, version: 1 });
    expect((await reserveLogs("archive")).filter((row) => row.entityId === deposit.id)).toEqual([]);
    expect((await reserveLogs("document_update")).filter((row) => row.entityId === deposit.id)).toEqual([]);
  });

  it("archived 안의 같은 id 두 번도 같은 이유로 거부 — archive 로그가 두 줄 남지 않는다(리뷰 N4)", async () => {
    const finance = await createFinanceViewer();
    const client = await createClient();
    const deposit = newRow(client.id, "2026-03-01", "deposit", 1_000_000);
    const withdrawal = newRow(client.id, "2026-03-05", "withdrawal", 300_000);
    await saveReserves(finance, { rows: [deposit, withdrawal] });

    const error = await rejection(saveReserves(finance, { rows: [], archived: [{ id: withdrawal.id, version: 1 }, { id: withdrawal.id, version: 1 }] }));

    expect(error.formatErrors).toEqual([expect.objectContaining({ rowId: withdrawal.id, reason: "같은 줄 중복 · 새로 고침" })]);
    expect((await storedRow(withdrawal.id))?.archivedAt).toBeNull();
    expect((await reserveLogs("archive")).filter((row) => row.entityId === withdrawal.id)).toEqual([]);
  });

  it("범용 archive(관리자, reserve_entry)는 보호 행으로 거부되고 DB 무변경", async () => {
    const finance = await createFinanceViewer();
    const client = await createClient();
    const deposit = newRow(client.id, "2026-03-01", "deposit", 1_000_000);
    await saveReserves(finance, { rows: [deposit] });

    await expect(archive(SYSTEM_VIEWER, "reserve_entry", deposit.id)).rejects.toBeInstanceOf(ProtectedRowError);

    expect((await storedRow(deposit.id))?.archivedAt).toBeNull();
  });

  it("보관함 복원: 음수가 되는 출금 복원은 거부(DB 무변경), 음수가 안 되는 복원은 통과 + restore 로그, pnl 쓰기 없는 사람은 거부", async () => {
    const finance = await createFinanceViewer();
    const client = await createClient();
    const deposit = newRow(client.id, "2026-09-01", "deposit", 1_000_000);
    const small = newRow(client.id, "2026-09-10", "withdrawal", 100_000);
    const big = newRow(client.id, "2026-09-18", "withdrawal", 1_000_000);
    await saveReserves(finance, { rows: [deposit, small] });
    await saveReserves(finance, { rows: [], archived: [{ id: small.id, version: 1 }] });
    await saveReserves(finance, { rows: [big] });
    // 이제 small을 복원하면 9/18 마감이 1,000,000 − 100,000 − 1,000,000 = −100,000.

    const refused = await caught(restore(SYSTEM_VIEWER, "reserve_entry", small.id));
    expect(refused).toBeInstanceOf(UserFacingError);
    expect((refused as Error).message).toBe("복원하면 2026-09-18 잔액 -100,000 · 리저브 대장에서 출금 줄 먼저 고치기");
    expect((await storedRow(small.id))?.archivedAt).not.toBeNull();

    const noPnl = await createViewerWith({ permissions: [["admin.archive", "write"]], reserveVisible: true });
    expect(await caught(restore(noPnl, "reserve_entry", small.id))).toBeInstanceOf(ForbiddenError);

    await saveReserves(finance, { rows: [newRow(client.id, "2026-09-02", "deposit", 500_000)] });
    await restore(SYSTEM_VIEWER, "reserve_entry", small.id);
    expect((await storedRow(small.id))?.archivedAt).toBeNull();
    expect((await reserveLogs("restore")).map((row) => row.entityId)).toEqual([small.id]);
  });

  it("없는 줄 복원은 `줄을 찾을 수 없음 · 새로 고침`, write.denied 한 번(규칙 reserve.restore — 리뷰 S2)", async () => {
    const finance = await createFinanceViewer();
    const missingId = randomUUID();

    const error = await expectOneDenied("reserve.restore", () => userFacing(restoreReserve(finance, missingId)));

    expect(error.message).toBe("줄을 찾을 수 없음 · 새로 고침");
  });

  it("노출(키 집합): 기획 PM과 pnl 보기 + 노출 꺼진 계급은 빈 결과에 건수·그룹 키가 없고, 경영관리는 줄·잔액 전부", async () => {
    const finance = await createFinanceViewer();
    const client = await createClient();
    await saveReserves(finance, { rows: [newRow(client.id, "2026-03-01", "deposit", 1_000_000)] });
    const { userId } = await createAccount(SYSTEM_VIEWER, { email: `pm-${randomUUID()}@example.test`, name: "PM", roleId: DEFAULT_ROLE_ID });
    const hidden = await createViewerWith({ permissions: [["pnl", "view"]], reserveVisible: false });

    for (const viewer of [{ id: userId, roleId: DEFAULT_ROLE_ID }, hidden]) {
      expect(await listReserves(viewer, { page: 1 })).toEqual({ rows: [], page: 1, pageCount: 0 });
    }
    const full = await listReserves(finance, { page: 1 });
    expect(full.rows).toHaveLength(1);
    expect(full.rows[0]).toMatchObject({ clientId: client.id, balanceKrw: 1_000_000, amount: { amountKrw: 1_000_000 } });
    expect(full.total).toBe(1);
  });

  it("페이지: 51줄의 2쪽 첫 줄 잔액은 전체 누적 기준, 그룹 최종 잔액은 두 쪽에서 같고, page=99는 마지막 쪽", async () => {
    const finance = await createFinanceViewer();
    const client = await createClient();
    const { last } = await seedFiftyOne(finance, client.id);

    const page1 = await listReserves(finance, { page: 1 });
    const page2 = await listReserves(finance, { page: 2 });
    expect(page1.rows).toHaveLength(50);
    expect(page2.rows.map((row) => row.id)).toEqual([last.id]);
    expect(page2.rows[0]?.balanceKrw).toBe((page1.rows.at(-1)?.balanceKrw ?? 0) - 1_000_000);
    expect(page1.clientBalances).toEqual(page2.clientBalances);
    expect(page1.clientBalances?.[0]?.balanceKrw).toBe(49);
    expect([page1.pageCount, page1.total]).toEqual([2, 51]);
    expect((await listReserves(finance, { page: 99 })).page).toBe(2);
  });

  it("거부 줄의 쪽 번호(Codex #7): 1쪽 입금을 줄여 2쪽 줄이 음수 → page 2, 새 줄에서 생긴 음수 → page null", async () => {
    const finance = await createFinanceViewer();
    const client = await createClient("현대자동차");
    const { first, last } = await seedFiftyOne(finance, client.id);

    const error = await caught(saveReserves(finance, { rows: [{ ...first, isNew: undefined, version: 1, amount: krw(900_000) }] }));
    expect(error).toBeInstanceOf(ReserveBalanceRejectedError);
    expect((error as ReserveBalanceRejectedError).rejection).toEqual({
      entryId: last.id,
      entryDate: "2026-06-01",
      clientId: client.id,
      clientName: "현대자동차",
      balanceKrw: -99_951,
      page: 2,
    });

    const fresh = newRow(client.id, "2026-07-01", "withdrawal", 100);
    const newError = await caught(saveReserves(finance, { rows: [fresh] }));
    expect((newError as ReserveBalanceRejectedError).rejection).toMatchObject({ entryId: fresh.id, page: null, balanceKrw: -51 });
  });

  it("경합(사용자 D5): A가 잠금을 쥔 동안 B의 같은 클라이언트 출금은 기다렸다가 새 잔액으로 거부 · 다른 클라이언트는 기다리지 않는다", async () => {
    expect(pool.options.max ?? 10).toBeGreaterThanOrEqual(3);
    const finance = await createFinanceViewer();
    const client = await createClient();
    const other = await createClient();
    await saveReserves(finance, { rows: [newRow(client.id, "2026-03-01", "deposit", 1_000_000), newRow(other.id, "2026-03-01", "deposit", 10)] });
    const locked = deferred();
    const release = deferred();

    const first = saveReserves(
      finance,
      { rows: [newRow(client.id, "2026-03-02", "withdrawal", 900_000)] },
      {
        afterLock: async () => {
          locked.resolve();
          await release.promise;
        },
      },
    );
    await locked.promise;
    // 다른 클라이언트의 저장은 A의 잠금을 기다리지 않는다(A를 풀기 전에 끝난다).
    await saveReserves(finance, { rows: [newRow(other.id, "2026-03-02", "withdrawal", 5)] });
    const second = caught(saveReserves(finance, { rows: [newRow(client.id, "2026-03-03", "withdrawal", 200_000)] }));
    try {
      await waitForLockWaiter(pool);
    } finally {
      release.resolve();
    }

    await first;
    const secondError = await second;
    expect(secondError).toBeInstanceOf(SaveRejectedError);
    expect((secondError as SaveRejectedError).formatErrors[0]?.reason).toBe("이 줄 뒤 잔액 -100,000 · 금액을 줄이거나 입금 줄 먼저");
    const list = await listReserves(finance, { page: 1 });
    expect(list.rows.filter((row) => row.clientId === client.id).every((row) => row.balanceKrw >= 0)).toBe(true);
    expect(list.clientBalances?.find((entry) => entry.clientId === client.id)?.balanceKrw).toBe(100_000);
  });
});

// 04-42 리뷰 B1 · S1 — 대장 참조(선택지)는 쓰기 권한자에게만, 거래처·프로젝트는 앱의 다른 곳과 같은 노출·메뉴 범위로 싣는다.
// 읽는 사람의 프로젝트 이름·증빙 종류 이름은 대장 DTO가 싣는다(보관된 프로젝트·비활성 코드도 저장된 값 그대로).
async function createRoleViewer(opts: { permissions: [string, "view" | "write"][]; visible: string[] }): Promise<Viewer> {
  const roleId = `role-${randomUUID()}`;
  await insertRole(SYSTEM_VIEWER, { id: roleId, name: `계급 ${roleId.slice(5, 13)}` });
  for (const [menu, action] of opts.permissions) await upsertPermission(SYSTEM_VIEWER, { roleId, menu, action, allowed: true });
  for (const infoItem of opts.visible) await upsertVisibility(SYSTEM_VIEWER, { roleId, infoItem, visible: true });
  const { userId } = await createAccount(SYSTEM_VIEWER, { email: `r-${randomUUID()}@example.test`, name: "통합테스트 계급", roleId });
  return { id: userId, roleId };
}

const WRITER: [string, "view" | "write"][] = [
  ["pnl", "view"],
  ["pnl", "write"],
  ["projects", "view"],
];

describe("domain/reserves — 대장 참조와 DTO 이름 (04-42 리뷰 B1 · S1)", () => {
  it("쓰기 권한이 없는 읽는 사람(pnl 보기 + reserve.amount)은 선택지가 전부 비어 있다", async () => {
    const client = await createClient();
    await createProjectFor(client.id);
    const reader = await createRoleViewer({ permissions: [["pnl", "view"], ["projects", "view"]], visible: ["reserve.amount", "vendor.value", "project.value"] });
    expect(await listReserveReferences(reader)).toEqual({ clients: [], projects: [], evidenceTypes: [] });
  });

  it("vendor.value가 꺼진 쓰기 권한자는 클라이언트 선택지가 비고, projects 보기나 project.value가 없으면 프로젝트 선택지가 빈다", async () => {
    const client = await createClient();
    await createProjectFor(client.id);
    const noVendor = await createRoleViewer({ permissions: WRITER, visible: ["reserve.amount", "project.value"] });
    const noVendorRefs = await listReserveReferences(noVendor);
    expect(noVendorRefs.clients).toEqual([]);
    expect(noVendorRefs.projects).toHaveLength(1);

    const noProjectsMenu = await createRoleViewer({ permissions: [["pnl", "view"], ["pnl", "write"]], visible: ["reserve.amount", "vendor.value", "project.value"] });
    expect((await listReserveReferences(noProjectsMenu)).projects).toEqual([]);
    const noProjectValue = await createRoleViewer({ permissions: WRITER, visible: ["reserve.amount", "vendor.value"] });
    const noProjectRefs = await listReserveReferences(noProjectValue);
    expect(noProjectRefs.projects).toEqual([]);
    expect(noProjectRefs.clients.map((option) => option.id)).toContain(client.id);
  });

  it("모두 있는 쓰기 권한자는 클라이언트(id·이름) · 프로젝트(id·이름·클라이언트) · 증빙 종류를 받는다", async () => {
    const client = await createClient();
    const project = await createProjectFor(client.id);
    const writer = await createRoleViewer({ permissions: WRITER, visible: ["reserve.amount", "vendor.value", "project.value"] });
    const refs = await listReserveReferences(writer);
    expect(refs.clients).toContainEqual({ id: client.id, name: client.name, label: client.name });
    expect(refs.projects).toEqual([{ id: project.id, name: project.name, clientId: client.id }]);
    expect(refs.evidenceTypes.map((option) => option.value)).toContain("tax_invoice");
  });

  it("대장 DTO가 보관된 프로젝트 이름과 비활성 증빙 종류 이름을 싣고, project.value가 없으면 프로젝트 이름 키가 없다", async () => {
    const finance = await createFinanceViewer();
    const client = await createClient();
    const project = await createProjectFor(client.id);
    const code = await insertCodeItem(SYSTEM_VIEWER, { tableKey: "evidence_type", value: `old-${randomUUID().slice(0, 8)}`, label: "옛 증빙" });
    await saveReserves(finance, { rows: [{ ...newRow(client.id, "2026-03-01", "deposit", 1_000), projectId: project.id, evidenceType: code.value }] });
    await db.update(projects).set({ archivedAt: new Date() }).where(eq(projects.id, project.id));
    await db.update(codeItems).set({ active: false }).where(eq(codeItems.id, code.id));

    const [row] = (await listReserves(finance, { page: 1 })).rows;
    expect(row).toMatchObject({ projectId: project.id, projectName: project.name, evidenceType: code.value, evidenceLabel: "옛 증빙" });

    const noProjectValue = await createRoleViewer({ permissions: [["pnl", "view"], ["projects", "view"]], visible: ["reserve.amount"] });
    const [hiddenRow] = (await listReserves(noProjectValue, { page: 1 })).rows;
    expect(hiddenRow).toMatchObject({ projectId: project.id, evidenceLabel: "옛 증빙" });
    expect(hiddenRow).not.toHaveProperty("projectName");
  });
});
