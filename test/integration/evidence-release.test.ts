import { randomBytes, randomUUID } from "node:crypto";
import { Client } from "pg";
import { and, eq, isNull } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db, pool } from "@/db/client";
import { actionLog, approvalInstances, expenseEvidenceReviews, expensePayments, expenses, files, projects } from "@/db/schema";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { upsertVisibility } from "@/repositories/permissions";
import { cancelExpensePayment, completeExpensePayment, getPaymentView, previewPayable } from "@/domain/payments";
import { confirmEvidence, EVIDENCE_AMOUNT_PAID_MISMATCH, EvidenceAmountError, EvidenceReviewConflictError, waiveEvidence } from "@/domain/evidence-reviews";
import { approveDocument, rejectDocument } from "@/domain/approvals";
import { createExpenseFromLines, createTeamExpenseDraft, listExpenseFormOptions, saveExpenseDraft } from "@/domain/expenses";
import {
  completeEvidenceUpload,
  EVIDENCE_ADD_DRAFTER_ONLY,
  EVIDENCE_COMPLETED_PROJECT_LOCKED,
  EvidenceCheckError,
  EvidenceLockedError,
  EvidenceUploadRefusedError,
  getEvidenceActions,
  removeEvidence,
  requestEvidenceUpload,
  voidEvidence,
} from "@/domain/evidence";
import { EVIDENCE_DUPLICATE_HIDDEN, evidenceDuplicateElsewhere } from "@/domain/evidence/upload-checks";
import { insertFile } from "@/repositories/files";
import { insertVendor } from "@/repositories/vendors";
import { seoulToday } from "@/lib/dates";
import { createMemoryStorage } from "./fakes/memory-storage";
import { deferred, waitForLockWaiter } from "./lock-race";
import { addApprovedRevision, attachEvidence, makeEvidenceManager, setupExpenseProject, submitReadyDraft } from "./fixtures/expenses";
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

  it("무효(1 → 0) — 증빙 금액 · 증빙일 null · 증빙 없음 · 지급 전 P3 / 지급 뒤 문서도 같다(검토 I-1 — 지급 완료 예외 없음)", async () => {
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
    expect(await docRow(paidDoc.expenseId)).toMatchObject({ evidenceAmount: null, evidenceDate: null });
    expect(await reviewOf(paidDoc.expenseId)).toBeNull();
  });

  // 검토 I-1(안 a) — 마지막 증빙 무효는 지급 여부와 상관없이 증빙 금액 · 증빙일을 지운다. 지급 뒤 다시 채우는 길은 06-10 paidEvidenceAmountRejection이 막는다.
  async function paidDocWithLastEvidenceVoided() {
    const fx = await setupExpenseProject();
    const payer = await makePayer();
    const voider = await makeEvidenceManager("증빙무효", { attach: false, void: true });
    const doc = await withEvidenceAmount(await approvedExpenseWithEvidence(fx), 10_000_000);
    const confirmed = await confirmEvidence(payer, { expenseId: doc.expenseId, version: doc.version });
    const preview = await previewPayable(payer, { expenseId: doc.expenseId, payDate: seoulToday() });
    if (preview.payableKrw === null || preview.payableKrw === undefined) throw new Error("지급 총액 없음");
    const paid = await completeExpensePayment(payer, { expenseId: doc.expenseId, expectedPayableKrw: preview.payableKrw, version: confirmed.version });
    const [payment] = await db.select({ grossSupplyKrw: expensePayments.grossSupplyKrw }).from(expensePayments).where(eq(expensePayments.expenseId, doc.expenseId));
    if (!payment?.grossSupplyKrw) throw new Error("지급 공급가 없음");
    const [file] = await liveFiles(doc.expenseId);
    await voidEvidence(voider, { fileId: file?.id ?? "", reason: "다른 건 영수증" });
    return { fx, payer, doc, paidVersion: paid.version, grossSupplyKrw: payment.grossSupplyKrw };
  }

  it("지급 완료 → 마지막 증빙 무효 → 금액 비어 있음 → 새 증빙 + 다른 금액 확인은 거부 · 지급 공급가와 같은 금액은 통과", async () => {
    const { fx, payer, doc, grossSupplyKrw } = await paidDocWithLastEvidenceVoided();
    const emptied = await docRow(doc.expenseId);
    expect(emptied).toMatchObject({ evidenceAmount: null, evidenceDate: null });
    await attachEvidence(fx.pm, doc.expenseId);
    const version = (await docRow(doc.expenseId)).version;

    const mismatch = await caught(confirmEvidence(payer, { expenseId: doc.expenseId, version, correctedAmountKrw: grossSupplyKrw - 1 }));
    expect(mismatch).toBeInstanceOf(EvidenceReviewConflictError);
    expect((mismatch as Error).message).toBe(EVIDENCE_AMOUNT_PAID_MISMATCH);
    expect((await docRow(doc.expenseId)).evidenceAmount).toBeNull();

    const result = await confirmEvidence(payer, { expenseId: doc.expenseId, version, correctedAmountKrw: grossSupplyKrw });
    expect(result.evidenceStatus).toBe("확인됨");
    expect((await docRow(doc.expenseId)).evidenceAmount).toBe(grossSupplyKrw);
  });

  it("회귀(검토 I-1 P2) — 지급 취소 뒤 새 증빙을 붙여도 옛 금액으로 금액 입력 없이 확인되지 않는다", async () => {
    const { fx, payer, doc, paidVersion } = await paidDocWithLastEvidenceVoided();
    const voidedVersion = (await docRow(doc.expenseId)).version;
    expect(voidedVersion).toBeGreaterThan(paidVersion);
    const cancelled = await cancelExpensePayment(payer, { expenseId: doc.expenseId, reason: "이체 오류", version: voidedVersion });
    expect(await docRow(doc.expenseId)).toMatchObject({ evidenceAmount: null, evidenceDate: null });
    await attachEvidence(fx.pm, doc.expenseId);
    const version = (await docRow(doc.expenseId)).version;
    expect(version).toBeGreaterThan(cancelled.version);

    const failure = await caught(confirmEvidence(payer, { expenseId: doc.expenseId, version }));
    expect(failure).toBeInstanceOf(EvidenceAmountError);
    expect(await reviewOf(doc.expenseId)).toBeNull();
    expect((await docRow(doc.expenseId)).evidenceAmount).toBeNull();
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

// ── Task 3 — 중복 범위 · 완료 프로젝트 · 완료 판정 잠금 ───────────────────────────────────────────

async function expenseNumber(expenseId: string): Promise<string> {
  const [row] = await db.select({ number: expenses.number }).from(expenses).where(eq(expenses.id, expenseId));
  if (!row?.number) throw new Error("문서 번호 없음");
  return row.number;
}

async function insertOtherOwnerFile(ownerKind: "corp_card_usage" | "quote_revision", sha256: string, uploadedBy: string): Promise<void> {
  const id = randomUUID();
  await insertFile(SYSTEM_VIEWER, { id, ownerKind, ownerId: randomUUID(), objectKey: `evidence/${id}`, sha256, sizeBytes: 1000, contentType: "image/jpeg", originalName: "전표.jpg", uploadedBy }, db);
}

const declare = (ownerId: string, sha256: string) => ({ ownerKind: "expense", ownerId, size: 1000, contentType: "image/jpeg", sha256, name: "영수증.jpg" });

describe("중복 범위 (06-11 Task 3)", () => {
  it("중복 범위 — 카드 전표는 같은 종류: 카드 전표에 있는 해시는 번호 없는 문구로 거부 · 차수 승인 증빙에만 있는 해시는 통과 · 읽을 수 있는 지출결의 번호만 싣는다", async () => {
    const fx = await setupExpenseProject();
    const storage = createMemoryStorage();

    // 카드 전표(다른 주인 종류이지만 같은 범위) — 번호 없는 문구.
    const slipSha = randomBytes(32).toString("hex");
    await insertOtherOwnerFile("corp_card_usage", slipSha, fx.pm.id);
    const draftA = (await createExpenseFromLines(fx.pm, { lineIds: [fx.lines.split] })).created[0]?.expenseId ?? "";
    const slip = await caught(requestEvidenceUpload(fx.pm, declare(draftA, slipSha), { storage }));
    expect(slip).toBeInstanceOf(EvidenceCheckError);
    expect((slip as Error).message).toBe(EVIDENCE_DUPLICATE_HIDDEN);

    // 차수 승인 증빙은 다른 범위 — 통과.
    const revisionSha = randomBytes(32).toString("hex");
    await insertOtherOwnerFile("quote_revision", revisionSha, fx.pm.id);
    expect((await requestEvidenceUpload(fx.pm, declare(draftA, revisionSha), { storage })).intentId).toBeTruthy();

    // 다른 지출결의 — 올린 사람이 읽을 수 있으면 번호, 없으면 번호 없는 문구.
    const sharedSha = randomBytes(32).toString("hex");
    const approved = await approvedExpenseWithEvidence(fx);
    await attachEvidence(fx.pm, approved.expenseId, storage, { sha256: sharedSha });
    const seen = await caught(requestEvidenceUpload(fx.pm, declare(draftA, sharedSha), { storage }));
    expect((seen as Error).message).toBe(evidenceDuplicateElsewhere(await expenseNumber(approved.expenseId)));
    const extra = await addApprovedRevision(fx, [{ itemName: "추가 현장", vendorId: fx.stageOneId, execution: { currency: "KRW", amount: 2_000_000, fxRate: 1 } }]);
    const otherDraft = (await createExpenseFromLines(fx.otherPm, { lineIds: [extra.lineIds.get("추가 현장") ?? ""] })).created[0]?.expenseId ?? "";
    const hidden = await caught(requestEvidenceUpload(fx.otherPm, declare(otherDraft, sharedSha), { storage }));
    expect((hidden as Error).message).toBe(EVIDENCE_DUPLICATE_HIDDEN);
  });
});

describe("완료 프로젝트 (06-11 Task 3 · U-4)", () => {
  async function completeProject(projectId: string): Promise<void> {
    await db.update(projects).set({ status: "completed" }).where(eq(projects.id, projectId));
  }

  it("완료 프로젝트 — 기안자 닫힘 · 권한자 열림: 기안자는 거부 · 잠김 표시, 붙이기 권한자는 통과 · 확인 풀림, 무효는 그대로", async () => {
    const fx = await setupExpenseProject();
    const payer = await makePayer();
    const manager = await makeEvidenceManager("경영지원", { void: true });
    const doc = await withEvidenceAmount(await approvedExpenseWithEvidence(fx), 12_400_000);
    await confirmEvidence(payer, { expenseId: doc.expenseId, version: doc.version });

    // 완료가 아닌 프로젝트 — 기안자 열림 · 권한자는 05 그대로 「결재 중 아님 · 증빙은 작성자」.
    expect((await getEvidenceActions(fx.pm, { ownerKind: "expense", ownerId: doc.expenseId })).canAdd).toBe(true);
    const notDrafter = await caught(requestEvidenceUpload(manager, declare(doc.expenseId, randomBytes(32).toString("hex")), { storage: createMemoryStorage() }));
    expect(notDrafter).toBeInstanceOf(EvidenceLockedError);
    expect((notDrafter as Error).message).toBe(EVIDENCE_ADD_DRAFTER_ONLY);

    await completeProject(fx.projectId);

    const locked = await caught(requestEvidenceUpload(fx.pm, declare(doc.expenseId, randomBytes(32).toString("hex")), { storage: createMemoryStorage() }));
    expect(locked).toBeInstanceOf(EvidenceLockedError);
    expect((locked as Error).message).toBe(EVIDENCE_COMPLETED_PROJECT_LOCKED);
    expect(EVIDENCE_COMPLETED_PROJECT_LOCKED).toBe("완료 프로젝트 · 증빙 잠김");
    expect(await getEvidenceActions(fx.pm, { ownerKind: "expense", ownerId: doc.expenseId })).toMatchObject({ canAdd: false, completedProjectLocked: true });

    // 붙이기 권한자는 열림 — 훅으로 확인 풀림.
    expect((await getEvidenceActions(manager, { ownerKind: "expense", ownerId: doc.expenseId })).canAdd).toBe(true);
    await attachEvidence(manager, doc.expenseId);
    expect(await reviewOf(doc.expenseId)).toBeNull();

    // 무효 처리(시스템 관리자)는 완료 프로젝트에서도 된다.
    const [target] = await liveFiles(doc.expenseId);
    await voidEvidence(manager, { fileId: target?.id ?? "", reason: "다른 건 영수증" });
    expect(await liveFiles(doc.expenseId)).toHaveLength(1);
  });

  it("완료 판정은 프로젝트 행 잠금 뒤 — 완료 처리가 프로젝트 행을 쥔 동안 기안자의 완료 통보는 기다렸다가 거부되고 파일 · 확인 기록 · version이 그대로다", async () => {
    const fx = await setupExpenseProject();
    const payer = await makePayer();
    const manager = await makeEvidenceManager("경영지원");
    const doc = await withEvidenceAmount(await approvedExpenseWithEvidence(fx), 12_400_000);
    await confirmEvidence(payer, { expenseId: doc.expenseId, version: doc.version });
    const storage = createMemoryStorage();
    const sha = randomBytes(32).toString("hex");
    const intent = await requestEvidenceUpload(fx.pm, declare(doc.expenseId, sha), { storage });
    storage.put(intent.url, { size: 1000, contentType: "image/jpeg", sha256: sha });
    const before = { files: await allFileCount(doc.expenseId), row: await docRow(doc.expenseId), review: await reviewOf(doc.expenseId) };

    // 결재 중 문서의 붙이기 권한자 추가는 프로젝트 행을 쥔 Client가 있어도 기다리지 않는다(05 잠금 그대로).
    const inReview = (await createExpenseFromLines(fx.pm, { lineIds: [fx.lines.split] })).created[0]?.expenseId ?? "";
    const submitted = await submitReadyDraft(fx.pm, inReview);
    if (submitted.kind !== "submitted") throw new Error("제출 안 됨");

    const lockClient = new Client({ connectionString: process.env.DATABASE_URL });
    await lockClient.connect();
    let txOpen = false;
    let call: Promise<unknown> | undefined;
    try {
      await lockClient.query("BEGIN");
      txOpen = true;
      const { rows: pidRows } = await lockClient.query<{ pid: number }>("SELECT pg_backend_pid() AS pid");
      const lockPid = pidRows[0]?.pid;
      await lockClient.query("SELECT id FROM projects WHERE id = $1 FOR UPDATE", [fx.projectId]);
      await lockClient.query("UPDATE projects SET status = 'completed' WHERE id = $1", [fx.projectId]);

      const reviewAttach = await Promise.race([attachEvidence(manager, inReview).then(() => "done"), new Promise<string>((resolve) => setTimeout(() => resolve("blocked"), 3000))]);
      expect(reviewAttach).toBe("done");

      call = caught(completeEvidenceUpload(fx.pm, { intentId: intent.intentId }, { storage }));
      let blocked = false;
      for (let attempt = 0; attempt < 40 && !blocked; attempt += 1) {
        const { rows } = await lockClient.query<{ count: number }>("SELECT count(*)::int AS count FROM pg_stat_activity WHERE $1 = ANY(pg_blocking_pids(pid))", [lockPid]);
        blocked = (rows[0]?.count ?? 0) > 0;
        if (!blocked) await new Promise((resolve) => setTimeout(resolve, 100));
      }
      expect(blocked, "잠금 순서 조건을 만들지 못했다 — 완료 통보가 프로젝트 행에서 막히지 않았다").toBe(true);

      await lockClient.query("COMMIT");
      txOpen = false;
      const refused = await call;
      expect(refused).toBeInstanceOf(EvidenceUploadRefusedError);
      expect((refused as EvidenceUploadRefusedError).retry).toBe("restart");
      expect(await allFileCount(doc.expenseId)).toBe(before.files);
      expect(await docRow(doc.expenseId)).toEqual(before.row);
      expect(await reviewOf(doc.expenseId)).toEqual(before.review);
    } finally {
      if (txOpen) await lockClient.query("ROLLBACK").catch(() => {});
      await lockClient.end();
    }
  });
});

describe("잠근 사이 결재 통과 (06-11 검토 S-1 · E-49)", () => {
  it("작성 중에 만든 의도로 완료 통보를 하는 사이 최종 승인이 커밋되면 프로젝트 행 없이 통과시키지 않고 다시 하기로 거부한다 · 파일 · version · 확인 기록 그대로", async () => {
    const fx = await setupExpenseProject();
    const created = await createExpenseFromLines(fx.pm, { lineIds: [fx.lines.withVendor] });
    const expenseId = created.created[0]?.expenseId ?? "";
    const storage = createMemoryStorage();
    const sha = randomBytes(32).toString("hex");
    const intent = await requestEvidenceUpload(fx.pm, declare(expenseId, sha), { storage });
    storage.put(intent.url, { size: 1000, contentType: "image/jpeg", sha256: sha });
    const submitted = await submitReadyDraft(fx.pm, expenseId);
    if (submitted.kind !== "submitted") throw new Error("제출 안 됨");
    const before = { files: await allFileCount(expenseId), row: await docRow(expenseId), review: await reviewOf(expenseId) };

    const refused = await caught(
      completeEvidenceUpload(fx.pm, { intentId: intent.intentId }, {
        storage,
        afterLock: async () => {
          const first = await approveDocument(fx.lead, { instanceId: submitted.instanceId, expectedVersion: submitted.version });
          const final = await approveDocument(fx.ceo, { instanceId: submitted.instanceId, expectedVersion: first.version });
          if (final.status !== "approved") throw new Error("결재 통과 안 됨");
        },
      }),
    );

    expect(refused).toBeInstanceOf(EvidenceUploadRefusedError);
    expect((refused as EvidenceUploadRefusedError).retry).toBe("restart");
    expect(await allFileCount(expenseId)).toBe(before.files);
    expect(await reviewOf(expenseId)).toEqual(before.review);
    expect((await docRow(expenseId)).version).toBe(before.row.version);
  });
});

describe("팀 비용 문서(프로젝트 없음) (06-11 검토 S-2)", () => {
  it("결재 통과 팀 비용 문서 — 마지막 증빙 무효가 프로젝트 행 잠금 없이 확인을 풀고 version을 올리며 증빙 금액 · 증빙일을 지운다", async () => {
    const fx = await setupExpenseProject();
    const payer = await makePayer();
    const voider = await makeEvidenceManager("증빙무효", { attach: false, void: true });
    const vendor = await insertVendor(SYSTEM_VIEWER, { name: "회식집", normalizedName: `회식집-${randomUUID()}`, defaultEvidenceType: "tax_invoice" });
    const { expenseId } = await createTeamExpenseDraft(fx.lead, { idempotencyKey: randomUUID(), fields: { teamExpenseKind: "team_overhead", usageDate: "2026-09-26", content: "팀 회식" } });
    const payment = (await listExpenseFormOptions(fx.lead)).payment[0]?.value ?? null;
    await saveExpenseDraft(fx.lead, {
      expenseId,
      expectedVersion: (await docRow(expenseId)).version,
      fields: { vendorId: vendor.id, evidenceType: "tax_invoice", paymentMethod: payment, supply: { currency: "KRW", amount: 440_000, fxRate: 1 } },
    });
    const submitted = await submitReadyDraft(fx.lead, expenseId);
    if (submitted.kind !== "submitted") throw new Error("제출 안 됨");
    const first = await approveDocument(fx.lead, { instanceId: submitted.instanceId, expectedVersion: submitted.version });
    const final = await approveDocument(fx.ceo, { instanceId: submitted.instanceId, expectedVersion: first.version });
    if (final.status !== "approved") throw new Error(`결재 통과 안 됨: ${final.status}`);
    const [teamRow] = await db.select({ projectId: expenses.projectId }).from(expenses).where(eq(expenses.id, expenseId));
    expect(teamRow?.projectId).toBeNull();

    const confirmed = await confirmEvidence(payer, { expenseId, version: (await docRow(expenseId)).version, correctedAmountKrw: 440_000 });
    expect(await reviewOf(expenseId)).toMatchObject({ status: "confirmed" });
    const [target] = await liveFiles(expenseId);

    await voidEvidence(voider, { fileId: target?.id ?? "", reason: "다른 건 영수증" });

    expect(await reviewOf(expenseId)).toBeNull();
    expect(await docRow(expenseId)).toMatchObject({ version: confirmed.version + 1, evidenceAmount: null, evidenceDate: null });
    expect(await evidenceLogs(expenseId, "evidence_void")).toContainEqual({ change: "evidence_void", fileId: target?.id, reasonLength: 8, reviewReleased: "confirmed" });
  });
});
