import { Client } from "pg";
import { and, eq, isNull } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db, pool } from "@/db/client";
import { actionLog, approvalInstances, expenseEvidenceReviews, expenses, files } from "@/db/schema";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { upsertVisibility } from "@/repositories/permissions";
import { completeExpensePayment, getPaymentView, previewPayable } from "@/domain/payments";
import { confirmEvidence, EvidenceReviewConflictError, waiveEvidence } from "@/domain/evidence-reviews";
import { rejectDocument } from "@/domain/approvals";
import { createExpenseFromLines } from "@/domain/expenses";
import { removeEvidence, requestEvidenceUpload, voidEvidence } from "@/domain/evidence";
import { seoulToday } from "@/lib/dates";
import { createMemoryStorage } from "./fakes/memory-storage";
import { deferred, waitForLockWaiter } from "./lock-race";
import { attachEvidence, makeEvidenceManager, setupExpenseProject, submitReadyDraft } from "./fixtures/expenses";
import { approvedExpenseWithEvidence, approvedExpenseWithoutEvidence, makePaymentManager, setEvidenceRequired, type ApprovedExpense } from "./fixtures/payments";

// 06-11(EVID-02 · EVID-03 · EVID-04 · C4 · B-1 · U-4 · X-12 · E-49) — 증빙 수명 주기: 결재 통과 문서의 증빙 추가 · 무효가 확인을 풀고 문서 version을 올린다.
// 06-06 · 06-10 · 05가 이 파일의 `it` 이름으로 다시 본다(이름을 바꾸지 않는다).

beforeEach(async () => {
  await setEvidenceRequired(false);
});

async function makePayer(name?: string): Promise<Viewer> {
  const payer = await makePaymentManager(name);
  if (!payer.roleId) throw new Error("계급 없음");
  for (const infoItem of ["expense.value", "expense.amount"]) await upsertVisibility(SYSTEM_VIEWER, { roleId: payer.roleId, infoItem, visible: true });
  return payer;
}

async function docRow(expenseId: string) {
  const [row] = await db.select({ version: expenses.version, evidenceAmount: expenses.evidenceAmount, evidenceDate: expenses.evidenceDate }).from(expenses).where(eq(expenses.id, expenseId));
  if (!row) throw new Error("지출결의 없음");
  return row;
}

async function reviewOf(expenseId: string) {
  const [row] = await db.select().from(expenseEvidenceReviews).where(eq(expenseEvidenceReviews.expenseId, expenseId));
  return row ?? null;
}

async function instanceVersion(expenseId: string): Promise<number> {
  const [row] = await db.select({ version: approvalInstances.version }).from(approvalInstances).where(eq(approvalInstances.documentId, expenseId));
  if (!row) throw new Error("결재 인스턴스 없음");
  return row.version;
}

async function evidenceLogs(expenseId: string, change: string) {
  const rows = await db.select({ detail: actionLog.detail }).from(actionLog).where(and(eq(actionLog.documentId, expenseId), eq(actionLog.actionType, "document_update")));
  return rows.map((row) => row.detail as Record<string, unknown>).filter((detail) => detail.change === change);
}

// 테스트 준비 전용 — 기안자 입력(06-10)이 있는 문서처럼 증빙 금액을 이 문서 행에만 적는다(version은 그대로).
async function withEvidenceAmount(doc: ApprovedExpense, amountKrw: number, evidenceDate = "2026-09-20"): Promise<ApprovedExpense> {
  await db.update(expenses).set({ evidenceAmount: amountKrw, evidenceDate }).where(eq(expenses.id, doc.expenseId));
  return doc;
}

async function caught(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => undefined,
    (error: unknown) => error,
  );
}

describe("증빙 수명 주기 트레이서 (06-11 Task 1)", () => {
  it("승인 뒤 기안자가 증빙을 더하면 확인됨 → 확인 전 · 확인 기록 지움 · 문서 version + 1 · 결재 인스턴스 version + 1 · 로그 reviewReleased", async () => {
    const fx = await setupExpenseProject();
    const payer = await makePayer();
    const doc = await withEvidenceAmount(await approvedExpenseWithEvidence(fx), 12_400_000);
    const confirmed = await confirmEvidence(payer, { expenseId: doc.expenseId, version: doc.version });
    expect(await reviewOf(doc.expenseId)).toMatchObject({ status: "confirmed" });
    const instanceBefore = await instanceVersion(doc.expenseId);

    const file = await attachEvidence(fx.pm, doc.expenseId);

    expect(await reviewOf(doc.expenseId)).toBeNull();
    expect((await docRow(doc.expenseId)).version).toBe(confirmed.version + 1);
    expect(await instanceVersion(doc.expenseId)).toBe(instanceBefore + 1);
    expect(await evidenceLogs(doc.expenseId, "evidence_add")).toContainEqual({ change: "evidence_add", fileId: file.id, reviewReleased: "confirmed" });
  });

  it("증빙 변경 뒤 옛 version 확인 거부 — 확인 기록이 없던 문서여도 열어 둔 화면의 옛 version 확인 · 면제 · 지급 완료가 거부되고 새 version은 통과한다", async () => {
    const fx = await setupExpenseProject();
    const payer = await makePayer();
    const doc = await withEvidenceAmount(await approvedExpenseWithEvidence(fx), 12_400_000);
    const preview = await previewPayable(payer, { expenseId: doc.expenseId, payDate: seoulToday() });
    if (preview.payableKrw === null || preview.payableKrw === undefined) throw new Error("지급 총액 없음");

    await attachEvidence(fx.pm, doc.expenseId);
    const fresh = (await docRow(doc.expenseId)).version;
    expect(fresh).toBe(doc.version + 1);

    expect(await caught(confirmEvidence(payer, { expenseId: doc.expenseId, version: doc.version }))).toBeInstanceOf(EvidenceReviewConflictError);
    expect(await caught(waiveEvidence(payer, { expenseId: doc.expenseId, version: doc.version, reason: "사유" }))).toBeInstanceOf(EvidenceReviewConflictError);
    expect(await caught(completeExpensePayment(payer, { expenseId: doc.expenseId, expectedPayableKrw: preview.payableKrw, version: doc.version }))).toBeDefined();
    expect(await reviewOf(doc.expenseId)).toBeNull();

    const confirmed = await confirmEvidence(payer, { expenseId: doc.expenseId, version: fresh });
    expect(confirmed.evidenceStatus).toBe("확인됨");
  });

  it("결재 중 추가는 문서 version 그대로 — 인스턴스 version만 + 1 · 작성 중 · 반려 문서의 추가 · 삭제도 문서 version 그대로", async () => {
    const fx = await setupExpenseProject();
    const manager = await makeEvidenceManager();

    // 결재 중 — 붙이기 권한자.
    const created = await createExpenseFromLines(fx.pm, { lineIds: [fx.lines.withVendor] });
    const inReviewId = created.created[0]?.expenseId ?? "";
    const submitted = await submitReadyDraft(fx.pm, inReviewId);
    if (submitted.kind !== "submitted") throw new Error("제출 안 됨");
    const versionBefore = (await docRow(inReviewId)).version;
    const instanceBefore = await instanceVersion(inReviewId);
    await attachEvidence(manager, inReviewId);
    expect((await docRow(inReviewId)).version).toBe(versionBefore);
    expect(await instanceVersion(inReviewId)).toBe(instanceBefore + 1);

    // 작성 중 · 반려 — 기안자 추가 · 삭제.
    const draft = await createExpenseFromLines(fx.pm, { lineIds: [fx.lines.split] });
    const draftId = draft.created[0]?.expenseId ?? "";
    const draftBefore = (await docRow(draftId)).version;
    const added = await attachEvidence(fx.pm, draftId);
    expect((await docRow(draftId)).version).toBe(draftBefore);
    const draftSubmitted = await submitReadyDraft(fx.pm, draftId);
    if (draftSubmitted.kind !== "submitted") throw new Error("제출 안 됨");
    await rejectDocument(fx.lead, { instanceId: draftSubmitted.instanceId, expectedVersion: draftSubmitted.version, reason: "금액 확인" });
    const rejectedBefore = (await docRow(draftId)).version;
    await attachEvidence(fx.pm, draftId);
    await removeEvidence(fx.pm, { fileId: added.id });
    expect((await docRow(draftId)).version).toBe(rejectedBefore);
  });
});

// ── Task 2 — 무효 훅 · 잠금 · 면제 풀림 · 의도만 있는 업로드 ───────────────────────────────────────────

async function liveFiles(expenseId: string) {
  return db.select({ id: files.id }).from(files).where(and(eq(files.ownerKind, "expense"), eq(files.ownerId, expenseId), isNull(files.removedAt), isNull(files.voidedAt)));
}

async function allFileCount(expenseId: string): Promise<number> {
  return (await db.select({ id: files.id }).from(files).where(and(eq(files.ownerKind, "expense"), eq(files.ownerId, expenseId)))).length;
}

describe("증빙 무효 훅 (06-11 Task 2)", () => {
  it("무효(살아 있는 파일 2 → 1) — 확인 기록 줄 지움 · 문서 version + 1 · 증빙 금액 그대로 · 확인 전 · 로그 reviewReleased", async () => {
    const fx = await setupExpenseProject();
    const payer = await makePayer();
    const voider = await makeEvidenceManager("증빙무효", { attach: false, void: true });
    const doc = await withEvidenceAmount(await approvedExpenseWithEvidence(fx), 12_400_000);
    await attachEvidence(fx.pm, doc.expenseId);
    const confirmed = await confirmEvidence(payer, { expenseId: doc.expenseId, version: (await docRow(doc.expenseId)).version });
    const [target] = await liveFiles(doc.expenseId);

    await voidEvidence(voider, { fileId: target?.id ?? "", reason: "다른 건 영수증" });

    expect(await reviewOf(doc.expenseId)).toBeNull();
    const row = await docRow(doc.expenseId);
    expect(row.version).toBe(confirmed.version + 1);
    expect(row.evidenceAmount).toBe(12_400_000);
    expect((await getPaymentView(payer, doc.expenseId))?.evidenceStatus).toBe("확인 전");
    expect(await evidenceLogs(doc.expenseId, "evidence_void")).toContainEqual({ change: "evidence_void", fileId: target?.id, reasonLength: 8, reviewReleased: "confirmed" });
  });

  it("무효(1 → 0) — 증빙 금액 · 증빙일 null · 증빙 없음 · 지급 전 P3 / 지급 뒤 문서는 증빙 금액을 지우지 않는다(지급 뒤 증빙 금액 수정 막기)", async () => {
    const fx = await setupExpenseProject();
    const payer = await makePayer();
    const voider = await makeEvidenceManager("증빙무효", { attach: false, void: true });

    // 지급 전.
    await setEvidenceRequired(true);
    const doc = await withEvidenceAmount(await approvedExpenseWithEvidence(fx), 12_400_000);
    const [only] = await liveFiles(doc.expenseId);
    await voidEvidence(voider, { fileId: only?.id ?? "", reason: "다른 건 영수증" });
    const row = await docRow(doc.expenseId);
    expect(row).toMatchObject({ evidenceAmount: null, evidenceDate: null });
    const view = await getPaymentView(payer, doc.expenseId);
    expect(view?.evidenceStatus).toBe("증빙 없음");
    expect(view?.row).toMatchObject({ row: "P3" });

    // 지급 뒤 — 지급 공급가와 같은 증빙 금액을 장부에 남긴다.
    await setEvidenceRequired(false);
    const paidDoc = await withEvidenceAmount(await approvedExpenseWithEvidence(fx, fx.lines.split), 10_000_000);
    const confirmed = await confirmEvidence(payer, { expenseId: paidDoc.expenseId, version: paidDoc.version });
    const preview = await previewPayable(payer, { expenseId: paidDoc.expenseId, payDate: seoulToday() });
    if (preview.payableKrw === null || preview.payableKrw === undefined) throw new Error("지급 총액 없음");
    await completeExpensePayment(payer, { expenseId: paidDoc.expenseId, expectedPayableKrw: preview.payableKrw, version: confirmed.version });
    const [paidFile] = await liveFiles(paidDoc.expenseId);
    await voidEvidence(voider, { fileId: paidFile?.id ?? "", reason: "다른 건 영수증" });
    expect(await docRow(paidDoc.expenseId)).toMatchObject({ evidenceAmount: 10_000_000, evidenceDate: "2026-09-20" });
    expect(await reviewOf(paidDoc.expenseId)).toBeNull();
  });

  it("면제 풀림 — 면제된 문서에 승인 뒤 기안자가 증빙을 올리면 확인 전 · 면제 로그는 남는다", async () => {
    const fx = await setupExpenseProject();
    const payer = await makePayer();
    const doc = await approvedExpenseWithoutEvidence(fx);
    const waived = await waiveEvidence(payer, { expenseId: doc.expenseId, version: doc.version, reason: "거래처 폐업" });
    expect(await reviewOf(doc.expenseId)).toMatchObject({ status: "waived" });

    const file = await attachEvidence(fx.pm, doc.expenseId);

    expect(await reviewOf(doc.expenseId)).toBeNull();
    expect((await docRow(doc.expenseId)).version).toBe(waived.version + 1);
    expect((await getPaymentView(payer, doc.expenseId))?.evidenceStatus).toBe("확인 전");
    expect(await evidenceLogs(doc.expenseId, "evidence_add")).toContainEqual({ change: "evidence_add", fileId: file.id, reviewReleased: "waived" });
    const waiveLogs = await db.select({ id: actionLog.seq }).from(actionLog).where(and(eq(actionLog.entityId, doc.expenseId), eq(actionLog.actionType, "evidence_waive")));
    expect(waiveLogs).toHaveLength(1);
  });

  it("의도만 있는 업로드 — 완료 통보가 없으면 파일 행 · 증빙 유무 · 확인 기록 · 문서 version이 그대로다", async () => {
    const fx = await setupExpenseProject();
    const payer = await makePayer();
    const doc = await withEvidenceAmount(await approvedExpenseWithEvidence(fx), 12_400_000);
    await confirmEvidence(payer, { expenseId: doc.expenseId, version: doc.version });
    const before = { files: await allFileCount(doc.expenseId), row: await docRow(doc.expenseId), review: await reviewOf(doc.expenseId) };

    const intent = await requestEvidenceUpload(
      fx.pm,
      { ownerKind: "expense", ownerId: doc.expenseId, size: 1000, contentType: "image/jpeg", sha256: "a".repeat(64), name: "새 영수증.jpg" },
      { storage: createMemoryStorage() },
    );
    expect(intent.intentId).toBeTruthy();

    expect(await allFileCount(doc.expenseId)).toBe(before.files);
    expect(await docRow(doc.expenseId)).toEqual(before.row);
    expect(await reviewOf(doc.expenseId)).toEqual(before.review);
  });
});

describe("무효 ∥ 지급 완료 · 잠금 순서 (06-11 Task 2)", () => {
  async function payableDoc() {
    const fx = await setupExpenseProject();
    const payer = await makePayer();
    const voider = await makeEvidenceManager("증빙무효", { attach: false, void: true });
    const approved = await withEvidenceAmount(await approvedExpenseWithEvidence(fx), 12_400_000);
    const confirmed = await confirmEvidence(payer, { expenseId: approved.expenseId, version: approved.version });
    const doc = { ...approved, version: confirmed.version };
    const preview = await previewPayable(payer, { expenseId: doc.expenseId, payDate: seoulToday() });
    if (preview.payableKrw === null || preview.payableKrw === undefined) throw new Error("지급 총액 없음");
    const [file] = await liveFiles(doc.expenseId);
    return { payer, voider, doc, expectedPayableKrw: preview.payableKrw, fileId: file?.id ?? "" };
  }

  async function paymentCount(expenseId: string): Promise<number> {
    const { rows } = await pool.query<{ n: number }>("SELECT count(*)::int AS n FROM expense_payments WHERE expense_id = $1", [expenseId]);
    return rows[0]?.n ?? 0;
  }

  it("무효 ∥ 지급 완료 — 무효 먼저 잠금: 무효가 문서 행을 쥔 동안 시작한 지급 완료는 기다렸다가 거부되고 지급 기록은 0이다", async () => {
    const { payer, voider, doc, expectedPayableKrw, fileId } = await payableDoc();
    const locked = deferred();
    const release = deferred();
    const voiding = voidEvidence(voider, { fileId, reason: "다른 건 영수증" }, {
      afterLock: async () => {
        locked.resolve();
        await release.promise;
      },
    });
    await locked.promise;
    const paying = completeExpensePayment(payer, { expenseId: doc.expenseId, expectedPayableKrw, version: doc.version });
    try {
      await waitForLockWaiter(pool);
    } finally {
      release.resolve();
    }
    const [voided, paid] = await Promise.allSettled([voiding, paying]);
    expect(voided.status).toBe("fulfilled");
    expect(paid.status).toBe("rejected");
    expect(await paymentCount(doc.expenseId)).toBe(0);
    expect(await liveFiles(doc.expenseId)).toHaveLength(0);
  });

  it("무효 ∥ 지급 완료 — 지급 먼저 잠금: 지급이 문서 행을 쥔 동안 시작한 무효는 기다렸다가 지급 뒤에 성공한다(교착 · 타임아웃 없음)", async () => {
    const { payer, voider, doc, expectedPayableKrw, fileId } = await payableDoc();
    const locked = deferred();
    const release = deferred();
    const paying = completeExpensePayment(
      payer,
      { expenseId: doc.expenseId, expectedPayableKrw, version: doc.version },
      {
        afterLock: async () => {
          locked.resolve();
          await release.promise;
        },
      },
    );
    await locked.promise;
    const voiding = voidEvidence(voider, { fileId, reason: "다른 건 영수증" });
    try {
      await waitForLockWaiter(pool);
    } finally {
      release.resolve();
    }
    const [paid, voided] = await Promise.allSettled([paying, voiding]);
    expect(paid.status).toBe("fulfilled");
    expect(voided.status).toBe("fulfilled");
    expect(await paymentCount(doc.expenseId)).toBe(1);
    expect(await liveFiles(doc.expenseId)).toHaveLength(0);
  });

  it("무효는 프로젝트 행을 먼저 잡는다 — 프로젝트 행을 쥔 Client가 있는 동안 무효는 기다리고 문서 행은 아직 잡지 않는다", async () => {
    const fx = await setupExpenseProject();
    const voider = await makeEvidenceManager("증빙무효", { attach: false, void: true });
    const doc = await approvedExpenseWithEvidence(fx);
    const [file] = await liveFiles(doc.expenseId);
    const fileId = file?.id ?? "";

    const lockClient = new Client({ connectionString: process.env.DATABASE_URL });
    const probeClient = new Client({ connectionString: process.env.DATABASE_URL });
    await lockClient.connect();
    await probeClient.connect();
    let txOpen = false;
    let call: Promise<unknown> | undefined;
    try {
      await lockClient.query("BEGIN");
      txOpen = true;
      const { rows: pidRows } = await lockClient.query<{ pid: number }>("SELECT pg_backend_pid() AS pid");
      const lockPid = pidRows[0]?.pid;
      await lockClient.query("SELECT id FROM projects WHERE id = $1 FOR UPDATE", [fx.projectId]);
      call = caught(voidEvidence(voider, { fileId, reason: "다른 건 영수증" }));

      let blocked = false;
      for (let attempt = 0; attempt < 40 && !blocked; attempt += 1) {
        const { rows } = await lockClient.query<{ count: number }>("SELECT count(*)::int AS count FROM pg_stat_activity WHERE $1 = ANY(pg_blocking_pids(pid))", [lockPid]);
        blocked = (rows[0]?.count ?? 0) > 0;
        if (!blocked) await new Promise((resolve) => setTimeout(resolve, 100));
      }
      expect(blocked, "잠금 순서 조건을 만들지 못했다 — 무효가 프로젝트 행에서 막히지 않았다").toBe(true);
      expect(await liveFiles(doc.expenseId)).toHaveLength(1);

      // 무효가 문서 행을 아직 잡지 않았다 = 프로젝트가 먼저다.
      await probeClient.query("BEGIN");
      await probeClient.query("SELECT id FROM expenses WHERE id = $1 FOR UPDATE NOWAIT", [doc.expenseId]);
      await probeClient.query("ROLLBACK");

      await lockClient.query("COMMIT");
      txOpen = false;
      expect(await call).toBeUndefined();
      expect(await liveFiles(doc.expenseId)).toHaveLength(0);
    } finally {
      if (txOpen) await lockClient.query("ROLLBACK").catch(() => {});
      await probeClient.query("ROLLBACK").catch(() => {});
      await lockClient.end();
      await probeClient.end();
    }
  });
});
