import { describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db, pool } from "@/db/client";
import { actionLog, approvalInstances, documentCounters, expenses } from "@/db/schema";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { GateBlockedError } from "@/domain/rules/gate";
import { createExpenseFromLines, EXPENSE_DOCUMENT_KIND, ExpenseConflictError, saveExpenseDraft, submitExpense } from "@/domain/expenses";
import { deferred, waitForLockWaiter, type Deferred } from "./lock-race";
import { makePerson } from "./approvals-fixtures";
import { addApprovedRevision, setupExpenseProject, submitReadyDraft, type ExpenseFixture } from "./fixtures/expenses";

// 05-14 Task 2 — 제출 가장자리(EXP-01 · EXP-14). 제출 tx: 프로젝트 행 잠금 → 지출결의 행 잠금 → 이미 제출됨 →
// version → 줄의 번호 있는 문서를 tx로 다시 읽어 재판정 → 스냅숏 → 결재 인스턴스 → 마지막 쓰기로 번호(카운터).
// 경합은 타이밍 대기 없이 deps.afterLock + lock-race.ts로 순서를 고정한다.

async function expenseRow(id: string) {
  const [row] = await db.select().from(expenses).where(eq(expenses.id, id));
  if (!row) throw new Error("지출결의 행 없음");
  return row;
}

async function counterValue(projectNumber: string): Promise<number | null> {
  const [row] = await db
    .select({ value: documentCounters.value })
    .from(documentCounters)
    .where(and(eq(documentCounters.counterKey, "expense"), eq(documentCounters.period, projectNumber)));
  return row?.value ?? null;
}

async function draftFor(fx: ExpenseFixture, viewer: ExpenseFixture["pm"], lineId: string): Promise<string> {
  const created = await createExpenseFromLines(viewer, { lineIds: [lineId] });
  const expenseId = created.created[0]?.expenseId;
  if (!expenseId) throw new Error(`작성 중 문서 없음: ${JSON.stringify(created.blocked)} (${fx.projectNumber})`);
  return expenseId;
}

// A가 두 잠금을 잡은 채 멈추면 B를 시작하고, B가 잠금을 기다리는 것을 확인한 뒤 A를 푼다.
async function raceSubmits(a: () => Promise<unknown>, b: () => Promise<unknown>, hold: { locked: Deferred<void>; release: Deferred<void> }) {
  const first = a();
  // A가 afterLock에 닿지 않고 끝나면(훅 없음) 경합을 만들 수 없다 — 기다리지 않고 단언으로 실패한다.
  const reachedLock = await Promise.race([hold.locked.promise.then(() => true), first.then(() => false, () => false)]);
  expect(reachedLock).toBe(true);
  const second = b();
  try {
    await waitForLockWaiter(pool);
  } finally {
    hold.release.resolve();
  }
  return Promise.allSettled([first, second]);
}

describe("동시 제출 번호", () => {
  it("같은 프로젝트의 서로 다른 줄 여섯을 기안자 여섯이 동시에 제출하면 기본 풀에서 전부 끝나고 번호가 26001-0001~0006으로 서로 다르다", async () => {
    const fx = await setupExpenseProject();
    const extra = await addApprovedRevision(
      fx,
      ["음향", "조명", "영상 송출", "케이터링"].map((itemName) => ({ itemName, vendorId: fx.stageOneId, execution: { currency: "KRW" as const, amount: 2_000_000, fxRate: 1 } })),
    );
    const lineNames = ["무대 제작", "영상 제작(분할)", "음향", "조명", "영상 송출", "케이터링"];
    const drafters = [fx.pm, fx.otherPm];
    for (const name of ["기획PM3", "기획PM4", "기획PM5", "기획PM6"]) drafters.push(await makePerson(name, DEFAULT_ROLE_ID, "기획1팀"));
    const drafts = await Promise.all(
      lineNames.map((name, i) => draftFor(fx, drafters[i] ?? fx.pm, extra.lineIds.get(name) ?? "")),
    );

    const results = await Promise.all(drafts.map((expenseId, i) => submitReadyDraft(drafters[i] ?? fx.pm, expenseId)));
    expect(results.every((result) => result.kind === "submitted")).toBe(true);
    expect(results.map((result) => result.number).sort()).toEqual(["26001-0001", "26001-0002", "26001-0003", "26001-0004", "26001-0005", "26001-0006"]);
    expect(await counterValue("26001")).toBe(6);
  });
});

describe("다른 프로젝트 카운터", () => {
  it("다른 프로젝트 26002의 첫 제출은 26002-0001이다 — 카운터 period가 프로젝트마다 따로다", async () => {
    const first = await setupExpenseProject();
    await submitReadyDraft(first.pm, await draftFor(first, first.pm, first.lines.withVendor));
    const second = await setupExpenseProject();
    expect(second.projectNumber).toBe("26002");

    const result = await submitReadyDraft(second.pm, await draftFor(second, second.pm, second.lines.withVendor));
    expect(result).toMatchObject({ kind: "submitted", number: "26002-0001" });
    expect(await counterValue("26001")).toBe(1);
    expect(await counterValue("26002")).toBe(1);
  });
});

describe("같은 줄 경합", () => {
  it("같은 비분할 줄의 작성 중 문서 둘을 동시에 제출하면 먼저 잠근 쪽만 번호를 받고 늦은 쪽은 그 번호로 거부된다(두 순서)", async () => {
    for (const order of ["pm-first", "other-first"] as const) {
      const fx = await setupExpenseProject();
      const [winner, loser] = order === "pm-first" ? [fx.pm, fx.otherPm] : [fx.otherPm, fx.pm];
      const winnerDraft = await draftFor(fx, winner, fx.lines.withVendor);
      const loserDraft = await draftFor(fx, loser, fx.lines.withVendor);
      const hold = { locked: deferred(), release: deferred() };

      const [a, b] = await raceSubmits(
        () =>
          submitReadyDraft(winner, winnerDraft, {
            afterLock: async () => {
              hold.locked.resolve();
              await hold.release.promise;
            },
          }),
        () => submitReadyDraft(loser, loserDraft),
        hold,
      );
      expect(a.status).toBe("fulfilled");
      if (a.status === "fulfilled") expect(a.value).toMatchObject({ kind: "submitted", number: `${fx.projectNumber}-0001` });
      expect(b.status).toBe("rejected");
      if (b.status === "rejected") {
        expect(b.reason).toBeInstanceOf(GateBlockedError);
        expect((b.reason as Error).message).toBe(`이 줄에 지출결의 ${fx.projectNumber}-0001 있음 · 지출결의 열기`);
      }
      expect((await expenseRow(loserDraft)).number).toBeNull();
      expect(await counterValue(fx.projectNumber)).toBe(1);
    }
  });
});

describe("같은 문서 두 번 제출", () => {
  async function evidenceOf(expenseId: string) {
    const instances = await db
      .select({ id: approvalInstances.id })
      .from(approvalInstances)
      .where(and(eq(approvalInstances.documentKind, EXPENSE_DOCUMENT_KIND), eq(approvalInstances.documentId, expenseId)));
    const submits = await db
      .select({ seq: actionLog.seq })
      .from(actionLog)
      .where(and(eq(actionLog.documentId, expenseId), eq(actionLog.actionType, "document_submit")));
    return { instances: instances.length, submits: submits.length };
  }

  it("같은 version으로 차례로 두 번 제출하면 번호 하나 · 카운터 1이고 두 번째는 already_submitted다", async () => {
    const fx = await setupExpenseProject();
    const expenseId = await draftFor(fx, fx.pm, fx.lines.withVendor);
    const { version } = await expenseRow(expenseId);

    const first = await submitReadyDraft(fx.pm, expenseId);
    const second = await submitExpense(fx.pm, { expenseId, expectedVersion: version });
    expect(first).toMatchObject({ kind: "submitted", number: "26001-0001" });
    expect(second).toEqual({ kind: "already_submitted", expenseId, number: "26001-0001" });
    expect(await counterValue("26001")).toBe(1);
    expect(await evidenceOf(expenseId)).toEqual({ instances: 1, submits: 1 });
  });

  it("같은 version으로 동시에 두 번 제출(Promise.all)해도 번호 하나 · 카운터 1이고 충돌 오류 없이 하나는 already_submitted다", async () => {
    const fx = await setupExpenseProject();
    const expenseId = await draftFor(fx, fx.pm, fx.lines.withVendor);

    const results = await Promise.allSettled([submitReadyDraft(fx.pm, expenseId), submitReadyDraft(fx.pm, expenseId)]);
    expect(results.map((result) => result.status)).toEqual(["fulfilled", "fulfilled"]);
    const values = results.flatMap((result) => (result.status === "fulfilled" ? [result.value] : []));
    expect(values.map((value) => value.kind).sort()).toEqual(["already_submitted", "submitted"]);
    expect(values.map((value) => value.number)).toEqual(["26001-0001", "26001-0001"]);
    expect(values.find((value) => value.kind === "already_submitted")).toEqual({ kind: "already_submitted", expenseId, number: "26001-0001" });
    expect(await counterValue("26001")).toBe(1);
    expect(await evidenceOf(expenseId)).toEqual({ instances: 1, submits: 1 });
  });
});

describe("금액 0과 빈 칸", () => {
  it("공급가액이 빈 칸이면 `공급가액 비어 있음 · 공급가액 적기`로 제출이 거부되고 번호가 없다", async () => {
    const fx = await setupExpenseProject();
    const expenseId = await draftFor(fx, fx.pm, fx.lines.withVendor);
    await saveExpenseDraft(fx.pm, { expenseId, expectedVersion: 1, fields: { supply: null } });

    const error = await submitReadyDraft(fx.pm, expenseId).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(GateBlockedError);
    expect((error as Error).message).toBe("공급가액 비어 있음 · 공급가액 적기");
    expect((await expenseRow(expenseId)).number).toBeNull();
    expect(await counterValue("26001")).toBeNull();
  });

  it("공급가액이 0이면 `공급가액이 0 · 0보다 크게`로 제출이 거부되고 번호가 없다", async () => {
    const fx = await setupExpenseProject();
    const expenseId = await draftFor(fx, fx.pm, fx.lines.withVendor);
    await saveExpenseDraft(fx.pm, { expenseId, expectedVersion: 1, fields: { supply: { currency: "KRW", amount: 0, fxRate: 1 } } });

    const error = await submitReadyDraft(fx.pm, expenseId).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(GateBlockedError);
    expect((error as Error).message).toBe("공급가액이 0 · 0보다 크게");
    expect((await expenseRow(expenseId)).number).toBeNull();
  });

  it("음수 공급가액은 임시 저장이 검증 오류로 거부되고 행은 그대로다", async () => {
    const fx = await setupExpenseProject();
    const expenseId = await draftFor(fx, fx.pm, fx.lines.withVendor);

    await expect(saveExpenseDraft(fx.pm, { expenseId, expectedVersion: 1, fields: { supply: { currency: "KRW", amount: -1, fxRate: 1 } } })).rejects.toThrow();
    expect(await expenseRow(expenseId)).toMatchObject({ supplyAmountKrw: 12_400_000, version: 1 });
  });

  it("번호 있는 행의 공급가액을 0으로 바꾸는 UPDATE는 DB CHECK 위반(23514)으로 실패한다", async () => {
    const fx = await setupExpenseProject();
    const expenseId = await draftFor(fx, fx.pm, fx.lines.withVendor);
    await submitReadyDraft(fx.pm, expenseId);

    const error = await db
      .update(expenses)
      .set({ supplyAmountKrw: 0 })
      .where(eq(expenses.id, expenseId))
      .then(
        () => null,
        (e: unknown) => e,
      );
    expect(error).toBeInstanceOf(Error);
    expect((error as Error & { cause?: { code?: string } }).cause?.code).toBe("23514");
    expect((await expenseRow(expenseId)).supplyAmountKrw).toBe(12_400_000);
  });
});

describe("두 창", () => {
  it("같은 작성 중 문서를 version 1로 두 번 저장하면 두 번째가 `HH:MM에 다른 곳에서 저장됨 · 새로 고침`으로 거부되고 덮어쓰지 않는다", async () => {
    const fx = await setupExpenseProject();
    const expenseId = await draftFor(fx, fx.pm, fx.lines.withVendor);

    await saveExpenseDraft(fx.pm, { expenseId, expectedVersion: 1, fields: { note: "첫 창" } });
    const error = await saveExpenseDraft(fx.pm, { expenseId, expectedVersion: 1, fields: { note: "둘째 창" } }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ExpenseConflictError);
    expect((error as Error).message).toMatch(/^\d{2}:\d{2}에 다른 곳에서 저장됨 · 새로 고침$/);
    expect(await expenseRow(expenseId)).toMatchObject({ note: "첫 창", version: 2 });
  });
});
