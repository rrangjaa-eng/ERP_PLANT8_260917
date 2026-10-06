import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { and, eq, isNull, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db/client";
import { actionLog, corpCardUsages, corpCards, expenseEvidenceReviews, expenses, files, quoteLines } from "@/db/schema";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { upsertVisibility } from "@/repositories/permissions";
import { completeExpensePayment, getPaymentView, loadEvidenceOverrun, previewPayable } from "@/domain/payments";
import { confirmEvidence, EvidenceReviewConflictError } from "@/domain/evidence-reviews";
import { approveDocument } from "@/domain/approvals";
import { createExpenseFromLines, saveExpenseDraft } from "@/domain/expenses";
import { voidEvidence } from "@/domain/evidence";
import { GateBlockedError } from "@/domain/rules/gate";
import { ACTION_LOG_OPTIONAL_TYPES } from "@/domain/settings/keys";
import { upsertSimpleValue } from "@/repositories/settings";
import { ForbiddenError } from "@/domain/permissions/can";
import { seoulToday } from "@/lib/dates";
import { confirmEvidenceAction } from "@/app/(app)/expenses/[id]/actions";
import { addApprovedRevision, attachEvidence, makeEvidenceManager, setupExpenseProject, submitReadyDraft, type ExpenseFixture } from "./fixtures/expenses";
import { approvedExpenseWithEvidence, makePaymentManager, setEvidenceRequired, type ApprovedExpense } from "./fixtures/payments";

// 06-06(EVID-02 · EVID-03 · D-601 · D-602 · O-2) — 경영관리의 증빙 확인(S4). 확인 기록(06-27 expense_evidence_reviews) · 금액 고쳐 확인 ·
// 확인 전 지급 막힘 · 증빙 지문 · Q-F 초과 한 줄(표시만) · EA-1. 06-11 · 06-15 · 06-17이 아래 `it` 이름으로 다시 본다.

const session = vi.hoisted(() => ({ viewer: null as Viewer | null }));
vi.mock("@/lib/viewer", () => ({
  getSession: () => Promise.resolve(session.viewer ? { viewer: session.viewer, user: { id: session.viewer.id } } : null),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

// 06-06 검토 S-1 — 확인 tx의 행동 로그 뒤 마지막 읽기(findLivePayment)를 한 번 실패시켜 「tx가 되돌려지면 로그도 없다」를 본다. 평소에는 원본 그대로.
const failAfterLog = vi.hoisted(() => ({ on: false }));
vi.mock("@/repositories/expense-payments", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/repositories/expense-payments")>();
  return {
    ...original,
    findLivePayment: (...args: Parameters<typeof original.findLivePayment>) => {
      if (failAfterLog.on) return Promise.reject(new Error("확인 tx 강제 실패"));
      return original.findLivePayment(...args);
    },
  };
});

beforeEach(async () => {
  await setEvidenceRequired(false);
});

// 지급 권한자 + 금액 · 값 정보 항목 노출.
async function makePayer(name?: string): Promise<Viewer> {
  const payer = await makePaymentManager(name);
  if (!payer.roleId) throw new Error("계급 없음");
  for (const infoItem of ["expense.value", "expense.amount"]) await upsertVisibility(SYSTEM_VIEWER, { roleId: payer.roleId, infoItem, visible: true });
  return payer;
}

async function docRow(expenseId: string) {
  const [row] = await db
    .select({ version: expenses.version, evidenceAmount: expenses.evidenceAmount, supplyAmountKrw: expenses.supplyAmountKrw })
    .from(expenses)
    .where(eq(expenses.id, expenseId));
  if (!row) throw new Error("지출결의 없음");
  return row;
}

async function reviewOf(expenseId: string) {
  const [row] = await db.select().from(expenseEvidenceReviews).where(eq(expenseEvidenceReviews.expenseId, expenseId));
  return row ?? null;
}

async function logsOf(expenseId: string, actionType: string) {
  return db
    .select({ detail: actionLog.detail, actorId: actionLog.actorId })
    .from(actionLog)
    .where(and(eq(actionLog.entityId, expenseId), eq(actionLog.actionType, actionType)))
    .orderBy(actionLog.occurredAt);
}

// 테스트 준비 전용 — 기안자 입력(06-10)이 아직 없어 증빙 금액을 이 문서 행에만 직접 적는다(version은 그대로).
async function withEvidenceAmount(doc: ApprovedExpense, amountKrw: number): Promise<ApprovedExpense> {
  await db.update(expenses).set({ evidenceAmount: amountKrw }).where(eq(expenses.id, doc.expenseId));
  return doc;
}

async function caught(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => undefined,
    (error: unknown) => error,
  );
}

describe("증빙 확인 트레이서 (06-06 Task 1)", () => {
  it("금액 고침 없는 확인 → 확인 기록 confirmed · document_update · version + 1 · 응답 { version, evidenceStatus: 확인됨, actionRow: P4 }", async () => {
    const payer = await makePayer();
    const doc = await withEvidenceAmount(await approvedExpenseWithEvidence(await setupExpenseProject()), 12_400_000);

    const result = await confirmEvidence(payer, { expenseId: doc.expenseId, version: doc.version });

    const row = await docRow(doc.expenseId);
    expect(result.version).toBe(doc.version + 1);
    expect(row.version).toBe(result.version);
    expect(result.evidenceStatus).toBe("확인됨");
    expect(result.actionRow).toMatchObject({ row: "P4", primary: "pay" });
    const review = await reviewOf(doc.expenseId);
    expect(review).toMatchObject({ status: "confirmed", amountBeforeKrw: null, amountAfterKrw: null, reviewedBy: payer.id, waiveReason: null });
    expect((await logsOf(doc.expenseId, "document_update")).at(-1)).toMatchObject({ actorId: payer.id, detail: { field: "evidenceReview", status: "confirmed" } });
    expect(row.evidenceAmount).toBe(12_400_000);
  });

  it("확인한 문서는 이어서 지급 완료된다 — 증빙 금액이 지급 총액의 기준", async () => {
    const payer = await makePayer();
    const doc = await withEvidenceAmount(await approvedExpenseWithEvidence(await setupExpenseProject()), 12_000_000);
    const confirmed = await confirmEvidence(payer, { expenseId: doc.expenseId, version: doc.version });
    const preview = await previewPayable(payer, { expenseId: doc.expenseId, payDate: seoulToday() });
    if (preview.payableKrw === null || preview.payableKrw === undefined) throw new Error("지급 총액 없음");

    const paid = await completeExpensePayment(payer, { expenseId: doc.expenseId, expectedPayableKrw: preview.payableKrw, version: confirmed.version });
    expect(paid.version).toBe(confirmed.version + 1);
  });

  it("confirmEvidenceAction — 액션이 도메인 응답 { version, evidenceStatus, actionRow }를 그대로 돌려준다", async () => {
    const payer = await makePayer();
    const doc = await withEvidenceAmount(await approvedExpenseWithEvidence(await setupExpenseProject()), 12_400_000);
    session.viewer = payer;

    const result = await confirmEvidenceAction({ expenseId: doc.expenseId, version: doc.version });
    expect(result?.serverError).toBeUndefined();
    expect(result?.data).toMatchObject({ version: doc.version + 1, evidenceStatus: "확인됨", actionRow: { row: "P4" } });
  });

  it("getPaymentView — 확인 전 문서는 P2(1차 `증빙 확인` · 3차 `바꾸기`)와 증빙 상태 · 증빙 금액 · 입력자를 싣는다", async () => {
    const payer = await makePayer();
    const doc = await withEvidenceAmount(await approvedExpenseWithEvidence(await setupExpenseProject()), 12_400_000);

    const view = await getPaymentView(payer, doc.expenseId);
    expect(view?.row).toMatchObject({ row: "P2", primary: "confirm", tertiary: "change" });
    expect(view?.evidenceStatus).toBe("확인 전");
    expect(view?.evidenceAmountKrw).toBe(12_400_000);
    expect(view?.evidenceAmountDisplay).toMatchObject({ valueKrw: 12_400_000, enteredByName: "박서연" });

    const confirmed = await confirmEvidence(payer, { expenseId: doc.expenseId, version: doc.version });
    const after = await getPaymentView(payer, doc.expenseId);
    expect(after?.version).toBe(confirmed.version);
    expect(after?.evidenceStatus).toBe("확인됨");
    expect(after?.row).toMatchObject({ row: "P4", primary: "pay" });
    expect(after?.reviewLine).toMatchObject({ byName: "경영관리" });
  });

  it("지급 권한 없는 기안자 → 확인 거부 · 확인 기록 없음 · version 그대로(D-601)", async () => {
    const fx = await setupExpenseProject();
    const doc = await withEvidenceAmount(await approvedExpenseWithEvidence(fx), 12_400_000);
    const error = await caught(confirmEvidence(fx.pm, { expenseId: doc.expenseId, version: doc.version }));
    expect(error).toBeInstanceOf(ForbiddenError);
    expect(await reviewOf(doc.expenseId)).toBeNull();
    expect((await docRow(doc.expenseId)).version).toBe(doc.version);
  });

  it("확인 기록 upsert는 문서당 한 줄(ON CONFLICT) — 다시 확인해도 줄이 늘지 않고 기록 version이 오른다", async () => {
    const payer = await makePayer();
    const doc = await withEvidenceAmount(await approvedExpenseWithEvidence(await setupExpenseProject()), 12_400_000);
    const first = await confirmEvidence(payer, { expenseId: doc.expenseId, version: doc.version });
    await confirmEvidence(payer, { expenseId: doc.expenseId, version: first.version });
    const [count] = await db
      .select({ n: sql<number>`count(*)::int`, version: sql<number>`max(${expenseEvidenceReviews.version})::int` })
      .from(expenseEvidenceReviews)
      .where(eq(expenseEvidenceReviews.expenseId, doc.expenseId));
    expect(count).toEqual({ n: 1, version: 2 });
  });
});

async function liveFileIds(expenseId: string): Promise<string[]> {
  const rows = await db
    .select({ id: files.id })
    .from(files)
    .where(and(eq(files.ownerKind, "expense"), eq(files.ownerId, expenseId), isNull(files.removedAt), isNull(files.voidedAt)));
  return rows.map((row) => row.id);
}

async function errorOf(promise: Promise<unknown>): Promise<Error> {
  const error = await caught(promise);
  if (!(error instanceof Error)) throw new Error("거부되지 않음");
  return error;
}

describe("증빙 확인 — 금액 고쳐 확인 · F2 · 거부 (06-06 Task 3)", () => {
  it("고쳐 확인 → 확인됨 유지 — evidence_amount = 새 값 · 확인 기록 전 · 후 · 끌 수 없는 로그 evidence_amount_change · 공급가액 그대로", async () => {
    await upsertSimpleValue(SYSTEM_VIEWER, ACTION_LOG_OPTIONAL_TYPES.key, [], null);
    try {
      const payer = await makePayer();
      const doc = await withEvidenceAmount(await approvedExpenseWithEvidence(await setupExpenseProject()), 12_400_000);
      const before = await docRow(doc.expenseId);

      const result = await confirmEvidence(payer, { expenseId: doc.expenseId, version: doc.version, correctedAmountKrw: 12_000_000 });

      expect(result.evidenceStatus).toBe("확인됨");
      const row = await docRow(doc.expenseId);
      expect(row.evidenceAmount).toBe(12_000_000);
      expect(row.supplyAmountKrw).toBe(before.supplyAmountKrw);
      expect(await reviewOf(doc.expenseId)).toMatchObject({ status: "confirmed", amountBeforeKrw: 12_400_000, amountAfterKrw: 12_000_000 });
      expect(await logsOf(doc.expenseId, "evidence_amount_change")).toEqual([{ actorId: payer.id, detail: { before: 12_400_000, after: 12_000_000 } }]);
      const view = await getPaymentView(payer, doc.expenseId);
      expect(view?.evidenceStatus).toBe("확인됨");
      expect(view?.reviewAmounts).toEqual({ beforeKrw: 12_400_000, afterKrw: 12_000_000 });
      expect(view?.evidenceAmountDisplay).toMatchObject({ valueKrw: 12_000_000, enteredByName: "경영관리" });
    } finally {
      await upsertSimpleValue(SYSTEM_VIEWER, ACTION_LOG_OPTIONAL_TYPES.key, ACTION_LOG_OPTIONAL_TYPES.default ?? [], null);
    }
  });

  it("고쳐 확인 tx가 로그 뒤에 실패하면 evidence_amount_change 로그 · 증빙 금액 · 확인 기록 · version이 모두 되돌려진다(같은 tx)", async () => {
    const payer = await makePayer();
    const doc = await withEvidenceAmount(await approvedExpenseWithEvidence(await setupExpenseProject()), 12_400_000);

    failAfterLog.on = true;
    let error: unknown;
    try {
      error = await caught(confirmEvidence(payer, { expenseId: doc.expenseId, version: doc.version, correctedAmountKrw: 12_000_000 }));
    } finally {
      failAfterLog.on = false;
    }

    expect(error).toBeInstanceOf(Error);
    expect(await logsOf(doc.expenseId, "evidence_amount_change")).toEqual([]);
    const row = await docRow(doc.expenseId);
    expect(row.evidenceAmount).toBe(12_400_000);
    expect(row.version).toBe(doc.version);
    expect(await reviewOf(doc.expenseId)).toBeNull();
  });

  it("빈 증빙 금액 · 고침 없음 → 거부 `증빙 금액 없음`(F2 — 공급가액으로 채우지 않는다) · 고친 값이면 확인", async () => {
    const payer = await makePayer();
    const doc = await approvedExpenseWithEvidence(await setupExpenseProject());
    await db.update(expenses).set({ evidenceAmount: null }).where(eq(expenses.id, doc.expenseId));

    const error = await errorOf(confirmEvidence(payer, { expenseId: doc.expenseId, version: doc.version }));
    expect(error.message).toBe("증빙 금액 없음");
    expect(await reviewOf(doc.expenseId)).toBeNull();
    expect((await docRow(doc.expenseId)).evidenceAmount).toBeNull();

    const result = await confirmEvidence(payer, { expenseId: doc.expenseId, version: doc.version, correctedAmountKrw: 12_400_000 });
    expect(result.evidenceStatus).toBe("확인됨");
    expect((await docRow(doc.expenseId)).evidenceAmount).toBe(12_400_000);
    // 06-27 CHECK(전 · 후 둘 다 null이거나 둘 다 값) — 이전 값이 비었으면 확인 기록은 전 · 후 없이, 로그는 전 null · 후 값.
    expect(await reviewOf(doc.expenseId)).toMatchObject({ amountBeforeKrw: null, amountAfterKrw: null });
    expect(await logsOf(doc.expenseId, "evidence_amount_change")).toEqual([{ actorId: payer.id, detail: { before: null, after: 12_400_000 } }]);
  });

  it("증빙 금액(expense.amount)을 못 보는 지급 권한자 — 고친 금액을 실으면 거부 · 금액 · 확인 기록 · version 그대로, 고침 없이는 확인된다(PR #180 Codex P1)", async () => {
    const blind = await makePaymentManager("가림");
    if (!blind.roleId) throw new Error("계급 없음");
    await upsertVisibility(SYSTEM_VIEWER, { roleId: blind.roleId, infoItem: "expense.value", visible: true });
    await upsertVisibility(SYSTEM_VIEWER, { roleId: blind.roleId, infoItem: "expense.amount", visible: false });
    const doc = await withEvidenceAmount(await approvedExpenseWithEvidence(await setupExpenseProject()), 12_400_000);

    const error = await caught(confirmEvidence(blind, { expenseId: doc.expenseId, version: doc.version, correctedAmountKrw: 12_000_000 }));
    expect(error).toBeInstanceOf(ForbiddenError);
    expect(await docRow(doc.expenseId)).toMatchObject({ version: doc.version, evidenceAmount: 12_400_000 });
    expect(await reviewOf(doc.expenseId)).toBeNull();

    const result = await confirmEvidence(blind, { expenseId: doc.expenseId, version: doc.version });
    expect(result.evidenceStatus).toBe("확인됨");
    expect((await docRow(doc.expenseId)).evidenceAmount).toBe(12_400_000);
  });

  it("version 불일치 → 「거부 — 문서 화면 동시성」 · 결재 통과 전 문서 → 거부", async () => {
    const payer = await makePayer();
    const fx = await setupExpenseProject();
    const doc = await withEvidenceAmount(await approvedExpenseWithEvidence(fx), 12_400_000);
    const stale = await errorOf(confirmEvidence(payer, { expenseId: doc.expenseId, version: doc.version - 1 }));
    expect(stale).toBeInstanceOf(EvidenceReviewConflictError);
    expect(stale.message).toMatch(/^다른 사람이 \d{2}:\d{2}에 바꿈 · 새로 고침$/);

    const other = await setupExpenseProject();
    const created = await createExpenseFromLines(other.pm, { lineIds: [other.lines.withVendor] });
    const draftId = created.created[0]?.expenseId;
    if (!draftId) throw new Error(`작성 중 문서 없음: ${JSON.stringify(created.blocked)}`);
    const submitted = await submitReadyDraft(other.pm, draftId);
    if (submitted.kind !== "submitted") throw new Error("제출 안 됨");
    const pending = await errorOf(confirmEvidence(payer, { expenseId: draftId, version: (await docRow(draftId)).version }));
    expect(pending).toBeInstanceOf(GateBlockedError);
    expect(pending.message).toMatch(/^결재 통과 전/);
    expect(await reviewOf(draftId)).toBeNull();
  });

  it("증빙 있음 · 확인 전 문서의 지급 완료 → 거부 `증빙 확인 전 · 증빙 확인`(증빙 필수 off여도 — O-2)", async () => {
    const payer = await makePayer();
    const doc = await withEvidenceAmount(await approvedExpenseWithEvidence(await setupExpenseProject()), 12_400_000);
    const preview = await previewPayable(payer, { expenseId: doc.expenseId, payDate: seoulToday() });
    const error = await errorOf(completeExpensePayment(payer, { expenseId: doc.expenseId, expectedPayableKrw: preview.payableKrw ?? 0, version: doc.version }));
    expect(error).toBeInstanceOf(GateBlockedError);
    expect(error.message).toBe("증빙 확인 전 · 증빙 확인");
  });

  it("확인 응답에 새 version — 금액 없는 확인 · 금액 고친 확인 둘 다 응답 version = DB version, 그 version으로 지급 통과 · 확인 전 version은 동시성 거부", async () => {
    const payer = await makePayer();
    for (const corrected of [undefined, 12_000_000]) {
      const doc = await withEvidenceAmount(await approvedExpenseWithEvidence(await setupExpenseProject()), 12_400_000);
      const result = await confirmEvidence(payer, { expenseId: doc.expenseId, version: doc.version, ...(corrected === undefined ? {} : { correctedAmountKrw: corrected }) });
      expect(result.version).toBe((await docRow(doc.expenseId)).version);
      const preview = await previewPayable(payer, { expenseId: doc.expenseId, payDate: seoulToday() });
      const payableKrw = preview.payableKrw ?? 0;
      const stale = await errorOf(completeExpensePayment(payer, { expenseId: doc.expenseId, expectedPayableKrw: payableKrw, version: doc.version }));
      expect(stale.message).toMatch(/바꿈 · 새로 고침$/);
      const paid = await completeExpensePayment(payer, { expenseId: doc.expenseId, expectedPayableKrw: payableKrw, version: result.version });
      expect(paid.version).toBe(result.version + 1);
    }
  });

  it("무효 섞인 10개 — 살아 있는 파일만: 10개 중 9개 무효 → 확인 전, 10개 모두 무효 → 증빙 없음", async () => {
    const payer = await makePayer();
    const fx = await setupExpenseProject();
    const doc = await withEvidenceAmount(await approvedExpenseWithEvidence(fx), 12_400_000);
    for (let index = 0; index < 9; index += 1) await attachEvidence(fx.pm, doc.expenseId);
    const ids = await liveFileIds(doc.expenseId);
    expect(ids).toHaveLength(10);
    const voider = await makeEvidenceManager("증빙무효", { attach: false, void: true });
    for (const id of ids.slice(0, 9)) await voidEvidence(voider, { fileId: id, reason: "다른 건 영수증" });
    expect((await getPaymentView(payer, doc.expenseId))?.evidenceStatus).toBe("확인 전");
    await voidEvidence(voider, { fileId: ids[9] ?? "", reason: "다른 건 영수증" });
    expect((await getPaymentView(payer, doc.expenseId))?.evidenceStatus).toBe("증빙 없음");
  });

  it("살아 있는 증빙 0(모두 무효) → 확인 거부 `확인할 증빙 없음 · 새로 고침` · 확인 기록 없음 · version 그대로", async () => {
    const payer = await makePayer();
    const fx = await setupExpenseProject();
    const doc = await withEvidenceAmount(await approvedExpenseWithEvidence(fx), 12_400_000);
    const voider = await makeEvidenceManager("증빙무효", { attach: false, void: true });
    for (const id of await liveFileIds(doc.expenseId)) await voidEvidence(voider, { fileId: id, reason: "다른 건 영수증" });
    const version = (await docRow(doc.expenseId)).version;

    const error = await errorOf(confirmEvidence(payer, { expenseId: doc.expenseId, version }));
    expect(error.message).toBe("확인할 증빙 없음 · 새로 고침");
    expect(await reviewOf(doc.expenseId)).toBeNull();
    expect((await docRow(doc.expenseId)).version).toBe(version);
  });

  it(
    "05 증빙 무효는 확인과 같은 순서로 지출결의 행을 먼저 잠근다 — 행을 쥔 tx가 끝날 때까지 무효가 기다린다(06-06 검토 S-7)",
    async () => {
      const fx = await setupExpenseProject();
      const doc = await withEvidenceAmount(await approvedExpenseWithEvidence(fx), 12_400_000);
      const [fileId] = await liveFileIds(doc.expenseId);
      if (!fileId) throw new Error("증빙 파일 없음");
      const voider = await makeEvidenceManager("증빙무효", { attach: false, void: true });

      const lockClient = new Client({ connectionString: process.env.DATABASE_URL });
      await lockClient.connect();
      let txOpen = false;
      let call: Promise<unknown> | undefined;
      try {
        await lockClient.query("BEGIN");
        txOpen = true;
        const { rows: pidRows } = await lockClient.query<{ pid: number }>("SELECT pg_backend_pid() AS pid");
        const lockPid = pidRows[0]?.pid;
        // 확인 tx가 하는 첫 잠금과 같은 것 — lockExpenseForUpdate(지출결의 행 FOR UPDATE).
        await lockClient.query("SELECT id FROM expenses WHERE id = $1 FOR UPDATE", [doc.expenseId]);
        call = caught(voidEvidence(voider, { fileId, reason: "다른 건 영수증" }));

        let blocked = false;
        for (let attempt = 0; attempt < 40 && !blocked; attempt += 1) {
          const { rows } = await lockClient.query<{ count: number }>("SELECT count(*)::int AS count FROM pg_stat_activity WHERE $1 = ANY(pg_blocking_pids(pid))", [
            lockPid,
          ]);
          blocked = (rows[0]?.count ?? 0) > 0;
          if (!blocked) await new Promise((resolve) => setTimeout(resolve, 100));
        }
        expect(blocked, "증빙 무효가 지출결의 행 잠금에서 막히지 않았다").toBe(true);
        expect(await liveFileIds(doc.expenseId)).toContain(fileId);

        await lockClient.query("COMMIT");
        txOpen = false;
        expect(await call).toBeUndefined();
        expect(await liveFileIds(doc.expenseId)).not.toContain(fileId);
      } finally {
        if (txOpen) await lockClient.query("ROLLBACK").catch(() => {});
        await lockClient.end();
        if (call) await call;
      }
    },
    30_000,
  );

  it("증빙 지문 다름 → 확인 거부 — 지금 version + 옛 지문은 동시성 거부 · 확인 기록 없음, 새 지문이면 확인됨, 지문 없으면 version만", async () => {
    const payer = await makePayer();
    const fx = await setupExpenseProject();
    const doc = await withEvidenceAmount(await approvedExpenseWithEvidence(fx), 12_400_000);
    const oldStamp = (await getPaymentView(payer, doc.expenseId))?.evidenceStamp;
    expect(typeof oldStamp).toBe("string");
    await attachEvidence(fx.pm, doc.expenseId);

    const current = (await docRow(doc.expenseId)).version;
    const error = await errorOf(confirmEvidence(payer, { expenseId: doc.expenseId, version: current, evidenceStamp: oldStamp ?? "" }));
    expect(error).toBeInstanceOf(EvidenceReviewConflictError);
    expect(error.message).toMatch(/에 (바꿈|증빙을 바꿈) · 새로 고침$/);
    expect(await reviewOf(doc.expenseId)).toBeNull();

    const freshStamp = (await getPaymentView(payer, doc.expenseId))?.evidenceStamp;
    expect(freshStamp).not.toBe(oldStamp);
    const result = await confirmEvidence(payer, { expenseId: doc.expenseId, version: current, evidenceStamp: freshStamp ?? "" });
    expect(result.evidenceStatus).toBe("확인됨");
  });
});

// Q-F · EA-1 픽스처 — 이 테스트 문서 행 · 견적 줄 행만 직접 고친다(승인 공급가 · 실행가 준비 — 다른 경로 없음).
async function setSupply(expenseId: string, supplyAmountKrw: number) {
  await db.update(expenses).set({ supplyAmountKrw }).where(eq(expenses.id, expenseId));
}

async function setExecution(lineId: string, executionAmountKrw: number) {
  await db.update(quoteLines).set({ executionAmountKrw }).where(eq(quoteLines.id, lineId));
}

async function expenseOf(expenseId: string) {
  const [row] = await db.select().from(expenses).where(eq(expenses.id, expenseId));
  if (!row) throw new Error("지출결의 없음");
  return row;
}

async function approvedInstallment(fx: ExpenseFixture, lineId: string, supplyKrw: number): Promise<string> {
  const created = await createExpenseFromLines(fx.pm, { lineIds: [lineId] });
  const expenseId = created.created[0]?.expenseId;
  if (!expenseId) throw new Error(`작성 중 문서 없음: ${JSON.stringify(created.blocked)}`);
  await saveExpenseDraft(fx.pm, {
    expenseId,
    expectedVersion: (await docRow(expenseId)).version,
    fields: { installment: true, supply: { currency: "KRW", amount: supplyKrw, fxRate: 1 } },
  });
  const submitted = await submitReadyDraft(fx.pm, expenseId);
  if (submitted.kind !== "submitted") throw new Error("제출 안 됨");
  const first = await approveDocument(fx.lead, { instanceId: submitted.instanceId, expectedVersion: submitted.version });
  const final = await approveDocument(fx.ceo, { instanceId: submitted.instanceId, expectedVersion: first.version });
  if (final.status !== "approved") throw new Error(`결재 통과 안 됨: ${final.status}`);
  return expenseId;
}

describe("증빙 금액 초과(Q-F 표시만) · 부가세 포함 금액(EA-1) (06-06 Task 3)", () => {
  it("초과 증빙 금액도 확인된다(Q-F 표시만) — 승인액 12,000,000 · 실행가 12,250,000에 12,400,000 → 확인됨 · 한 줄 · 지급도 막히지 않는다", async () => {
    const payer = await makePayer();
    const fx = await setupExpenseProject();
    const doc = await approvedExpenseWithEvidence(fx);
    await setSupply(doc.expenseId, 12_000_000);
    await setExecution(fx.lines.withVendor, 12_250_000);

    const result = await confirmEvidence(payer, { expenseId: doc.expenseId, version: doc.version, correctedAmountKrw: 12_400_000 });
    expect(result.evidenceStatus).toBe("확인됨");
    expect((await docRow(doc.expenseId)).evidenceAmount).toBe(12_400_000);
    const view = await getPaymentView(payer, doc.expenseId);
    expect(view?.evidenceOverrun).toBe("승인액보다 +400,000 · 실행가 초과 150,000");
    expect(view?.row).toMatchObject({ row: "P4", primary: "pay", blockReason: null });
    const preview = await previewPayable(payer, { expenseId: doc.expenseId, payDate: seoulToday() });
    const paid = await completeExpensePayment(payer, { expenseId: doc.expenseId, expectedPayableKrw: preview.payableKrw ?? 0, version: result.version });
    expect(paid.version).toBe(result.version + 1);
  });

  it("Q-F 계보 — 앞 차수 줄의 문서 · 카드 사용도 남은 실행가에서 빠진다", async () => {
    const payer = await makePayer();
    const fx = await setupExpenseProject();
    const docA = await approvedInstallment(fx, fx.lines.split, 5_000_000);
    const extra = await addApprovedRevision(fx, []);
    const lineL2 = extra.lineIds.get("영상 제작(분할)") ?? "";
    await setExecution(lineL2, 13_000_000);
    const docB = await approvedInstallment(fx, lineL2, 7_600_000);

    expect(await loadEvidenceOverrun(payer, await expenseOf(docB), 8_100_000)).toBe("승인액보다 +500,000 · 실행가 초과 100,000");
    expect(await loadEvidenceOverrun(payer, await expenseOf(docA), 5_400_000)).toBe("승인액보다 +400,000");

    const [card] = await db
      .insert(corpCards)
      .values({ issuer: `카드사-${randomUUID()}`, numberLast4: String(1000 + Math.floor(Math.random() * 9000)), label: "카드", kind: "personal", holderUserId: fx.pm.id })
      .returning({ id: corpCards.id });
    if (!card) throw new Error("카드 없음");
    const usage = (supplyKrw: number, archived: boolean) => ({
      corpCardId: card.id,
      usedOn: "2026-10-01",
      totalAmountKrw: supplyKrw + supplyKrw / 10,
      supplyKrw,
      vatKrw: supplyKrw / 10,
      evidenceTypeCode: "card_slip",
      linkKind: "quote_line",
      quoteLineId: fx.lines.split,
      usedByUserId: fx.pm.id,
      registeredBy: fx.pm.id,
      registeredVia: "self",
      ...(archived ? { archivedAt: new Date(), archivedBy: fx.pm.id } : {}),
    });
    await db.insert(corpCardUsages).values([usage(300_000, false), usage(1_000_000, true)]);
    expect(await loadEvidenceOverrun(payer, await expenseOf(docB), 8_100_000)).toBe("승인액보다 +500,000 · 실행가 초과 400,000");
  });

  it("부가세 포함 금액으로 고쳐 확인 → 거부(EA-1) — 기록 · 금액 · version 그대로, 13,200,001은 확인됨", async () => {
    const payer = await makePayer();
    const fx = await setupExpenseProject();
    const doc = await withEvidenceAmount(await approvedExpenseWithEvidence(fx), 12_000_000);
    await setSupply(doc.expenseId, 12_000_000);

    const error = await errorOf(confirmEvidence(payer, { expenseId: doc.expenseId, version: doc.version, correctedAmountKrw: 13_200_000 }));
    expect(error.message).toBe("부가세 포함 금액 · 공급가로 입력");
    expect(await reviewOf(doc.expenseId)).toBeNull();
    const row = await docRow(doc.expenseId);
    expect(row.evidenceAmount).toBe(12_000_000);
    expect(row.version).toBe(doc.version);

    const result = await confirmEvidence(payer, { expenseId: doc.expenseId, version: doc.version, correctedAmountKrw: 13_200_001 });
    expect(result.evidenceStatus).toBe("확인됨");
  });
});
