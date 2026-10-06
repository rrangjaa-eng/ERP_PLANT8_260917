import { randomBytes } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { and, eq, isNull } from "drizzle-orm";
import { db, pool } from "@/db/client";
import { actionLog, approvalInstances, expenses, files, uploadIntents } from "@/db/schema";
import { createExpenseFromLines, deleteExpenseDraft, EXPENSE_DOCUMENT_KIND, ExpenseConflictError, ExpenseNotFoundError, restoreExpenseDraft, submitExpense } from "@/domain/expenses";
import {
  completeEvidenceUpload,
  createEvidenceViewUrl,
  EVIDENCE_LOCKED_IN_REVIEW,
  EvidenceCheckError,
  EvidenceLockedError,
  EvidenceUploadRefusedError,
  listEvidence,
  removeEvidence,
  requestEvidenceUpload,
} from "@/domain/evidence";
import { EVIDENCE_DUPLICATE_HIDDEN, EVIDENCE_UPLOAD_FAILED, evidenceDuplicateElsewhere } from "@/domain/evidence/upload-checks";
import { rejectDocument, withdrawDocument } from "@/domain/approvals";
import { GateBlockedError } from "@/domain/rules/gate";
import { log } from "@/lib/log";
import { createMemoryStorage, type MemoryStorage } from "./fakes/memory-storage";
import { attachEvidence, setupExpenseProject, submitReadyDraft, type ExpenseFixture } from "./fixtures/expenses";
import { deferred, waitForLockWaiter, type Deferred } from "./lock-race";

// 05-04(EVID-01 · EXP-02): 증빙 업로드 경로 — 선언 → 서명 PUT(메모리 가짜) → 완료 통보 → 메타데이터 재확인 → 파일 행.
// 그 파일이 있어야 지출결의가 제출된다(게이트 ⑧).

const NOW = new Date("2026-10-04T01:00:00.000Z");

function sha(): string {
  return randomBytes(32).toString("hex");
}

async function draftOf(fx: ExpenseFixture): Promise<string> {
  const created = await createExpenseFromLines(fx.pm, { lineIds: [fx.lines.withVendor] });
  const expenseId = created.created[0]?.expenseId;
  if (!expenseId) throw new Error("작성 중 문서 없음");
  return expenseId;
}

async function versionOf(expenseId: string): Promise<number> {
  const [row] = await db.select({ version: expenses.version }).from(expenses).where(eq(expenses.id, expenseId));
  if (!row) throw new Error("지출결의 없음");
  return row.version;
}

describe("트레이서 — 선언에서 제출까지", () => {
  it("기안자의 선언은 incoming/{의도 id} 키 · 30분 만료 의도(서명 PUT 15분보다 길다)와 서명된 PUT 주소 · 헤더를 돌려준다", async () => {
    const fx = await setupExpenseProject();
    const expenseId = await draftOf(fx);
    const storage = createMemoryStorage();
    const sha256 = sha();

    const intent = await requestEvidenceUpload(
      fx.pm,
      { ownerKind: "expense", ownerId: expenseId, size: 212_000, contentType: "image/jpeg", sha256, name: "세금계산서.jpg" },
      { storage, now: NOW },
    );

    expect(intent.method).toBe("PUT");
    expect(intent.url).toMatch(/^memory:\/\/put\/incoming\//);
    expect(intent.headers).toEqual({
      "Content-Type": "image/jpeg",
      "X-Goog-Content-Length-Range": `1,${10 * 1024 * 1024}`,
      "x-goog-meta-sha256": sha256,
    });
    const [row] = await db.select().from(uploadIntents).where(eq(uploadIntents.id, intent.intentId));
    expect(row).toMatchObject({
      ownerKind: "expense",
      ownerId: expenseId,
      objectKey: `incoming/${intent.intentId}`,
      declaredSize: 212_000,
      declaredContentType: "image/jpeg",
      declaredSha256: sha256,
      originalName: "세금계산서.jpg",
      createdBy: fx.pm.id,
      completedAt: null,
    });
    expect(row?.expiresAt.getTime()).toBe(NOW.getTime() + 30 * 60 * 1000);
  });

  it("PUT 뒤 완료 통보는 evidence/{파일 id}로 옮기고 파일 행 · 보존 표식 · 의도 완료 · 행동 로그를 남긴다", async () => {
    const fx = await setupExpenseProject();
    const expenseId = await draftOf(fx);
    const storage = createMemoryStorage();
    const sha256 = sha();
    const intent = await requestEvidenceUpload(
      fx.pm,
      { ownerKind: "expense", ownerId: expenseId, size: 212_000, contentType: "image/jpeg", sha256, name: "세금계산서.jpg" },
      { storage, now: NOW },
    );
    storage.put(intent.url, { size: 212_000, contentType: "image/jpeg", sha256 });

    const file = await completeEvidenceUpload(fx.pm, { intentId: intent.intentId }, { storage, now: NOW });

    const rows = await db.select().from(files).where(and(eq(files.ownerKind, "expense"), eq(files.ownerId, expenseId)));
    expect(rows).toHaveLength(1);
    const [fileRow] = rows;
    expect(fileRow).toMatchObject({
      id: file.id,
      objectKey: `evidence/${file.id}`,
      sha256,
      sizeBytes: 212_000,
      contentType: "image/jpeg",
      originalName: "세금계산서.jpg",
      uploadedBy: fx.pm.id,
      removedAt: null,
      voidedAt: null,
    });
    expect(storage.objects.has(`incoming/${intent.intentId}`)).toBe(false);
    expect(storage.objects.get(`evidence/${file.id}`)).toEqual({ size: 212_000, contentType: "image/jpeg", sha256 });
    expect(storage.moves).toEqual([{ from: `incoming/${intent.intentId}`, to: `evidence/${file.id}` }]);
    expect(storage.retains).toEqual([`evidence/${file.id}`]);

    const [intentRow] = await db.select().from(uploadIntents).where(eq(uploadIntents.id, intent.intentId));
    expect(intentRow?.completedAt).not.toBeNull();

    const logs = await db.select().from(actionLog).where(and(eq(actionLog.actionType, "document_update"), eq(actionLog.documentId, expenseId)));
    expect(logs).toHaveLength(1);
    expect(logs[0]?.detail).toEqual({ change: "evidence_add", fileId: file.id });

    const listed = await listEvidence(fx.pm, { ownerKind: "expense", ownerId: expenseId });
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({ id: file.id, originalName: "세금계산서.jpg", sizeBytes: 212_000, contentType: "image/jpeg" });
  });

  it("증빙 없이 제출하면 `증빙 없음 · 증빙 올리기 Ctrl+U`로 막히고 번호가 없다 — 붙인 뒤 제출하면 번호가 붙는다", async () => {
    const fx = await setupExpenseProject();
    const expenseId = await draftOf(fx);

    const blocked = submitExpense(fx.pm, { expenseId, expectedVersion: await versionOf(expenseId) });
    await expect(blocked).rejects.toBeInstanceOf(GateBlockedError);
    await expect(blocked).rejects.toThrow("증빙 없음 · 증빙 올리기 Ctrl+U");
    const [before] = await db.select({ number: expenses.number }).from(expenses).where(eq(expenses.id, expenseId));
    expect(before?.number).toBeNull();

    await attachEvidence(fx.pm, expenseId);
    const submitted = await submitExpense(fx.pm, { expenseId, expectedVersion: await versionOf(expenseId) });
    expect(submitted).toMatchObject({ kind: "submitted", number: `${fx.projectNumber}-0001` });
  });

  it("기안자는 5분짜리 보기 주소를 받고 무관한 PM은 null이다", async () => {
    const fx = await setupExpenseProject();
    const expenseId = await draftOf(fx);
    const storage = createMemoryStorage();
    const file = await attachEvidence(fx.pm, expenseId, storage);

    const view = await createEvidenceViewUrl(fx.pm, { fileId: file.id }, { storage });
    expect(view?.url).toMatch(/^memory:\/\/get\/evidence\//);
    expect(storage.signedGets).toEqual([{ key: `evidence/${file.id}`, expiresSec: 300, filename: "세금계산서.jpg", disposition: "inline" }]);

    expect(await createEvidenceViewUrl(fx.otherPm, { fileId: file.id }, { storage })).toBeNull();
    expect(storage.signedGets).toHaveLength(1);
  });
});

// ── Task 3 — 거부 · 다시 올리기 갈래 · 잠금 경합 ─────────────────────

type Declared = { size: number; contentType: string; sha256: string; name: string };

function declared(overrides: Partial<Declared> = {}): Declared {
  return { size: 212_000, contentType: "image/jpeg", sha256: sha(), name: "세금계산서.jpg", ...overrides };
}

// 선언 → 메모리 가짜 PUT까지(완료 통보 전).
async function uploaded(viewer: ExpenseFixture["pm"], expenseId: string, storage: MemoryStorage, file: Declared = declared()) {
  const intent = await requestEvidenceUpload(viewer, { ownerKind: "expense", ownerId: expenseId, ...file }, { storage, now: NOW });
  storage.put(intent.url, { size: file.size, contentType: file.contentType, sha256: file.sha256 });
  return intent;
}

async function fileRowsOf(expenseId: string) {
  return db.select().from(files).where(and(eq(files.ownerKind, "expense"), eq(files.ownerId, expenseId)));
}

async function activeFilesOf(expenseId: string) {
  return db
    .select()
    .from(files)
    .where(and(eq(files.ownerKind, "expense"), eq(files.ownerId, expenseId), isNull(files.removedAt)));
}

function keysWithPrefix(storage: MemoryStorage, prefix: string): string[] {
  return [...storage.objects.keys()].filter((key) => key.startsWith(prefix));
}

async function expectRefused(promise: Promise<unknown>, retry: "complete" | "restart") {
  const error = await promise.then(
    () => null,
    (reason: unknown) => reason,
  );
  expectRefusal(error, retry);
}

function expectRefusal(error: unknown, retry: "complete" | "restart") {
  expect(error).toBeInstanceOf(EvidenceUploadRefusedError);
  expect((error as EvidenceUploadRefusedError).retry).toBe(retry);
  expect((error as Error).message).toBe(EVIDENCE_UPLOAD_FAILED);
}

async function instanceOf(expenseId: string) {
  const [row] = await db
    .select()
    .from(approvalInstances)
    .where(and(eq(approvalInstances.documentKind, EXPENSE_DOCUMENT_KIND), eq(approvalInstances.documentId, expenseId)));
  if (!row) throw new Error("결재 인스턴스 없음");
  return row;
}

// A가 잠금을 잡은 채 멈추면 B를 시작하고, B가 잠금을 기다리는 것을 확인한 뒤 A를 푼다(05-14 raceSubmits와 같은 모양).
function holdAtLock(): { hold: { locked: Deferred<void>; release: Deferred<void> }; afterLock: () => Promise<void> } {
  const hold = { locked: deferred(), release: deferred() };
  return {
    hold,
    afterLock: async () => {
      hold.locked.resolve();
      await hold.release.promise;
    },
  };
}

async function race(a: () => Promise<unknown>, b: () => Promise<unknown>, hold: { locked: Deferred<void>; release: Deferred<void> }, between?: () => void) {
  const first = a();
  const reachedLock = await Promise.race([hold.locked.promise.then(() => true), first.then(() => false, () => false)]);
  expect(reachedLock).toBe(true);
  between?.();
  const second = b();
  try {
    await waitForLockWaiter(pool);
  } finally {
    hold.release.resolve();
  }
  return Promise.allSettled([first, second]);
}

describe("거부 — 의도 · 메타데이터 · 상태 · 권한 · 중복", () => {
  it("남의 의도 id로 완료하면 `올리지 못함 · 다시 올리기`(restart) · 파일 행 0", async () => {
    const fx = await setupExpenseProject();
    const expenseId = await draftOf(fx);
    const storage = createMemoryStorage();
    const intent = await uploaded(fx.pm, expenseId, storage);

    await expectRefused(completeEvidenceUpload(fx.otherPm, { intentId: intent.intentId }, { storage, now: NOW }), "restart");
    expect(await fileRowsOf(expenseId)).toHaveLength(0);
  });

  it("만료된 의도(31분 뒤)는 restart로 거부 · 파일 행 0", async () => {
    const fx = await setupExpenseProject();
    const expenseId = await draftOf(fx);
    const storage = createMemoryStorage();
    const intent = await uploaded(fx.pm, expenseId, storage);

    await expectRefused(completeEvidenceUpload(fx.pm, { intentId: intent.intentId }, { storage, now: new Date(NOW.getTime() + 31 * 60 * 1000) }), "restart");
    expect(await fileRowsOf(expenseId)).toHaveLength(0);
  });

  it("(A10 · F7) 서명 PUT 만료(15분) 무렵 시작해 20분에 끝난 업로드의 완료 통보는 의도가 살아 있어 성공한다", async () => {
    const fx = await setupExpenseProject();
    const expenseId = await draftOf(fx);
    const storage = createMemoryStorage();
    const intent = await uploaded(fx.pm, expenseId, storage);

    await completeEvidenceUpload(fx.pm, { intentId: intent.intentId }, { storage, now: new Date(NOW.getTime() + 20 * 60 * 1000) });
    expect(await fileRowsOf(expenseId)).toHaveLength(1);
  });

  it("(A10) 같은 의도를 두 번 완료하면(응답 유실 뒤 재시도) 두 번째도 같은 파일로 성공 · 파일 행 1 · evidence/ 객체는 파일 행의 키 하나", async () => {
    const fx = await setupExpenseProject();
    const expenseId = await draftOf(fx);
    const storage = createMemoryStorage();
    const intent = await uploaded(fx.pm, expenseId, storage);

    const file = await completeEvidenceUpload(fx.pm, { intentId: intent.intentId }, { storage, now: NOW });
    const again = await completeEvidenceUpload(fx.pm, { intentId: intent.intentId }, { storage, now: NOW });
    expect(again).toEqual(file);

    expect(await fileRowsOf(expenseId)).toHaveLength(1);
    expect(keysWithPrefix(storage, "evidence/")).toEqual([`evidence/${file.id}`]);
    // 그 파일을 뗀 뒤의 재시도는 처음부터 다시(restart).
    await removeEvidence(fx.pm, { fileId: file.id });
    await expectRefused(completeEvidenceUpload(fx.pm, { intentId: intent.intentId }, { storage, now: NOW }), "restart");
  });

  it("같은 의도의 두 완료가 겹쳐 둘째가 옮긴 뒤 잠금에서 거부되면, 둘째의 보상 삭제는 자기 객체만 지운다", async () => {
    const fx = await setupExpenseProject();
    const expenseId = await draftOf(fx);
    const storage = createMemoryStorage();
    const file = declared();
    const intent = await uploaded(fx.pm, expenseId, storage, file);
    const { hold, afterLock } = holdAtLock();

    // 첫째가 옮긴 뒤 잠금을 쥔 사이 같은 서명 주소로 다시 올려(만료 전 서명 PUT은 다시 쓸 수 있다) 둘째도 옮기게 한다.
    const [a, b] = await race(
      () => completeEvidenceUpload(fx.pm, { intentId: intent.intentId }, { storage, now: NOW, afterLock }),
      () => completeEvidenceUpload(fx.pm, { intentId: intent.intentId }, { storage, now: NOW }),
      hold,
      () => storage.put(intent.url, { size: file.size, contentType: file.contentType, sha256: file.sha256 }),
    );

    expect(a.status).toBe("fulfilled");
    expect(b.status).toBe("rejected");
    if (b.status === "rejected") expectRefusal(b.reason, "restart");
    const rows = await fileRowsOf(expenseId);
    expect(rows).toHaveLength(1);
    expect(keysWithPrefix(storage, "evidence/")).toEqual([rows[0]?.objectKey]);
    expect(storage.moves).toHaveLength(2);
    expect(storage.deletes).toEqual([storage.moves[1]?.to]);
  });

  it("저장소 메타데이터 크기가 선언과 다르면 restart 거부 · incoming/ 객체가 지워지고 운영 로그가 남는다", async () => {
    const fx = await setupExpenseProject();
    const expenseId = await draftOf(fx);
    const storage = createMemoryStorage();
    const intent = await uploaded(fx.pm, expenseId, storage);
    storage.tamper(`incoming/${intent.intentId}`, { size: 999_999 });
    const warn = vi.spyOn(log, "warn");

    try {
      await expectRefused(completeEvidenceUpload(fx.pm, { intentId: intent.intentId }, { storage, now: NOW }), "restart");
      expect(storage.objects.has(`incoming/${intent.intentId}`)).toBe(false);
      expect(await fileRowsOf(expenseId)).toHaveLength(0);
      expect(warn).toHaveBeenCalledWith("evidence.upload_metadata_mismatch", { intentId: intent.intentId, ownerKind: "expense", ownerId: expenseId, reason: "size" });
    } finally {
      warn.mockRestore();
    }
  });

  it("보존 표식이 실패해도 완료는 성공 · 파일 행 1 · evidence.retain_failed 경고 1", async () => {
    const fx = await setupExpenseProject();
    const expenseId = await draftOf(fx);
    const storage = createMemoryStorage();
    const intent = await uploaded(fx.pm, expenseId, storage);
    storage.failRetain = true;
    const warn = vi.spyOn(log, "warn");

    try {
      const file = await completeEvidenceUpload(fx.pm, { intentId: intent.intentId }, { storage, now: NOW });
      expect(await fileRowsOf(expenseId)).toHaveLength(1);
      expect(warn.mock.calls.filter(([event]) => event === "evidence.retain_failed")).toEqual([["evidence.retain_failed", { fileId: file.id, reason: "Error" }]]);
    } finally {
      warn.mockRestore();
    }
  });

  it("반려 · 회수된 문서에는 업로드 요청이 열리고 결재 중 문서는 기안자에게 `결재 중 · 증빙 잠김`이다(05-09 — 결재 중 붙이기는 경영관리 권한자만)", async () => {
    const fx = await setupExpenseProject();
    const storage = createMemoryStorage();
    const pending = await draftOf(fx);
    await submitReadyDraft(fx.pm, pending);

    await expect(requestEvidenceUpload(fx.pm, { ownerKind: "expense", ownerId: pending, ...declared() }, { storage, now: NOW })).rejects.toThrow(
      new EvidenceLockedError(EVIDENCE_LOCKED_IN_REVIEW),
    );

    const submitted = await instanceOf(pending);
    await rejectDocument(fx.lead, { instanceId: submitted.id, expectedVersion: submitted.version, reason: "금액 확인" });
    await expect(requestEvidenceUpload(fx.pm, { ownerKind: "expense", ownerId: pending, ...declared() }, { storage, now: NOW })).resolves.toMatchObject({
      method: "PUT",
    });

    const second = (await createExpenseFromLines(fx.pm, { lineIds: [fx.lines.split] })).created[0]?.expenseId ?? "";
    await submitReadyDraft(fx.pm, second);
    const secondInstance = await instanceOf(second);
    await withdrawDocument(fx.pm, { instanceId: secondInstance.id, expectedVersion: secondInstance.version });
    await expect(requestEvidenceUpload(fx.pm, { ownerKind: "expense", ownerId: second, ...declared() }, { storage, now: NOW })).resolves.toMatchObject({
      method: "PUT",
    });
  });

  it("무관한 PM의 업로드 요청은 404(문서 없음)", async () => {
    const fx = await setupExpenseProject();
    const expenseId = await draftOf(fx);

    await expect(
      requestEvidenceUpload(fx.otherPm, { ownerKind: "expense", ownerId: expenseId, ...declared() }, { storage: createMemoryStorage(), now: NOW }),
    ).rejects.toBeInstanceOf(ExpenseNotFoundError);
  });

  it("다른 PM의 작성 중 문서에 같은 sha256이 있으면 번호 없이 `이미 첨부된 파일 · 다른 파일 고르기`", async () => {
    const fx = await setupExpenseProject();
    const mine = await draftOf(fx);
    const theirs = (await createExpenseFromLines(fx.otherPm, { lineIds: [fx.lines.withVendor] })).created[0]?.expenseId ?? "";
    const shared = sha();
    await attachEvidence(fx.otherPm, theirs, createMemoryStorage(), { sha256: shared });

    const refused = requestEvidenceUpload(fx.pm, { ownerKind: "expense", ownerId: mine, ...declared({ sha256: shared }) }, { storage: createMemoryStorage(), now: NOW });
    await expect(refused).rejects.toBeInstanceOf(EvidenceCheckError);
    await expect(refused).rejects.toThrow(EVIDENCE_DUPLICATE_HIDDEN);
  });

  it("내가 볼 수 있는 제출 문서에 같은 sha256이 있으면 그 번호를 말한다 · 삭제된 파일의 sha256은 중복이 아니다", async () => {
    const fx = await setupExpenseProject();
    const submitted = await draftOf(fx);
    const shared = sha();
    await attachEvidence(fx.pm, submitted, createMemoryStorage(), { sha256: shared });
    await submitExpense(fx.pm, { expenseId: submitted, expectedVersion: await versionOf(submitted) });
    const draft = (await createExpenseFromLines(fx.pm, { lineIds: [fx.lines.split] })).created[0]?.expenseId ?? "";

    await expect(
      requestEvidenceUpload(fx.pm, { ownerKind: "expense", ownerId: draft, ...declared({ sha256: shared }) }, { storage: createMemoryStorage(), now: NOW }),
    ).rejects.toThrow(evidenceDuplicateElsewhere(`${fx.projectNumber}-0001`));

    const removedSha = sha();
    const removed = await attachEvidence(fx.pm, draft, createMemoryStorage(), { sha256: removedSha });
    await removeEvidence(fx.pm, { fileId: removed.id });
    await expect(
      requestEvidenceUpload(fx.pm, { ownerKind: "expense", ownerId: draft, ...declared({ sha256: removedSha }) }, { storage: createMemoryStorage(), now: NOW }),
    ).resolves.toMatchObject({ method: "PUT" });
  });
});

describe("지운 작성 중 문서의 증빙 (A3 · red-team)", () => {
  it("증빙 있는 작성 중 문서를 지우면 같은 영수증을 새 문서에 올릴 수 있고, 되돌리기는 그 증빙도 되살린다", async () => {
    const fx = await setupExpenseProject();
    const deleted = await draftOf(fx);
    const shared = sha();
    await attachEvidence(fx.pm, deleted, createMemoryStorage(), { sha256: shared });
    await deleteExpenseDraft(fx.pm, { expenseId: deleted, expectedVersion: await versionOf(deleted) });

    const next = (await createExpenseFromLines(fx.pm, { lineIds: [fx.lines.split] })).created[0]?.expenseId ?? "";
    await expect(
      requestEvidenceUpload(fx.pm, { ownerKind: "expense", ownerId: next, ...declared({ sha256: shared }) }, { storage: createMemoryStorage(), now: NOW }),
    ).resolves.toMatchObject({ method: "PUT" });

    await restoreExpenseDraft(fx.pm, { expenseId: deleted });
    expect(await listEvidence(fx.pm, { ownerKind: "expense", ownerId: deleted })).toHaveLength(1);
  });

  // C3(adversarial F3): 지운 사이 같은 영수증을 다른 문서에 붙였으면 되돌리기가 그 파일만 되살리지 않는다 — 한 영수증이 두 문서에 붙지 않는다.
  it("되돌리기는 그 사이 다른 문서에 붙은 같은 영수증은 되살리지 않고 나머지 증빙만 되살린다", async () => {
    const fx = await setupExpenseProject();
    const deleted = await draftOf(fx);
    const shared = sha();
    const own = sha();
    await attachEvidence(fx.pm, deleted, createMemoryStorage(), { sha256: shared });
    await attachEvidence(fx.pm, deleted, createMemoryStorage(), { sha256: own });
    await deleteExpenseDraft(fx.pm, { expenseId: deleted, expectedVersion: await versionOf(deleted) });

    const next = (await createExpenseFromLines(fx.pm, { lineIds: [fx.lines.split] })).created[0]?.expenseId ?? "";
    await attachEvidence(fx.pm, next, createMemoryStorage(), { sha256: shared });

    await restoreExpenseDraft(fx.pm, { expenseId: deleted });
    const restored = await db.select().from(files).where(and(eq(files.ownerId, deleted), isNull(files.removedAt)));
    expect(restored.map((file) => file.sha256)).toEqual([own]);
    expect(await listEvidence(fx.pm, { ownerKind: "expense", ownerId: next })).toHaveLength(1);
  });

  it("지운 문서에 살아 있는 파일 행이 남아 있어도(고치기 전 데이터) 중복으로 세지 않는다", async () => {
    const fx = await setupExpenseProject();
    const deleted = await draftOf(fx);
    const shared = sha();
    await attachEvidence(fx.pm, deleted, createMemoryStorage(), { sha256: shared });
    await db.update(expenses).set({ deletedAt: new Date(), deletedBy: fx.pm.id }).where(eq(expenses.id, deleted));

    const next = (await createExpenseFromLines(fx.pm, { lineIds: [fx.lines.split] })).created[0]?.expenseId ?? "";
    await expect(
      requestEvidenceUpload(fx.pm, { ownerKind: "expense", ownerId: next, ...declared({ sha256: shared }) }, { storage: createMemoryStorage(), now: NOW }),
    ).resolves.toMatchObject({ method: "PUT" });
  });
});

describe("다시 올리기 갈래", () => {
  it("옮기기만 실패하면 retry `complete` · 파일 행 0 · 의도 열림 · incoming/ 객체 그대로 — 같은 의도로 다시 완료하면 성공", async () => {
    const fx = await setupExpenseProject();
    const expenseId = await draftOf(fx);
    const storage = createMemoryStorage();
    const intent = await uploaded(fx.pm, expenseId, storage);
    storage.failNextMove();

    await expectRefused(completeEvidenceUpload(fx.pm, { intentId: intent.intentId }, { storage, now: NOW }), "complete");
    expect(await fileRowsOf(expenseId)).toHaveLength(0);
    const [open] = await db.select().from(uploadIntents).where(eq(uploadIntents.id, intent.intentId));
    expect(open?.completedAt).toBeNull();
    expect(storage.objects.has(`incoming/${intent.intentId}`)).toBe(true);

    const file = await completeEvidenceUpload(fx.pm, { intentId: intent.intentId }, { storage, now: NOW });

    expect(await fileRowsOf(expenseId)).toHaveLength(1);
    expect(keysWithPrefix(storage, "incoming/")).toEqual([]);
    expect(keysWithPrefix(storage, "evidence/")).toEqual([`evidence/${file.id}`]);
  });
});

describe("잠금 — 제출과 증빙 삭제", () => {
  it("ⓐ 제출이 잠근 사이 마지막 증빙 삭제 → 제출 성공(번호) · 삭제는 잠금 뒤 재확인에서 거부 · 살아 있는 증빙 1", async () => {
    const fx = await setupExpenseProject();
    const expenseId = await draftOf(fx);
    const file = await attachEvidence(fx.pm, expenseId);
    const { hold, afterLock } = holdAtLock();

    const [submit, remove] = await race(
      async () => submitExpense(fx.pm, { expenseId, expectedVersion: await versionOf(expenseId) }, { afterLock }),
      () => removeEvidence(fx.pm, { fileId: file.id }),
      hold,
    );

    expect(submit.status).toBe("fulfilled");
    if (submit.status === "fulfilled") expect(submit.value).toMatchObject({ kind: "submitted", number: `${fx.projectNumber}-0001` });
    expect(remove.status).toBe("rejected");
    if (remove.status === "rejected") expect(remove.reason).toBeInstanceOf(ExpenseConflictError);
    expect(await activeFilesOf(expenseId)).toHaveLength(1);
  });

  it("ⓑ 삭제가 잠근 사이 제출 → 삭제 성공 · 제출은 `증빙 없음 · 증빙 올리기 Ctrl+U` · 번호 없음", async () => {
    const fx = await setupExpenseProject();
    const expenseId = await draftOf(fx);
    const file = await attachEvidence(fx.pm, expenseId);
    const version = await versionOf(expenseId);
    const { hold, afterLock } = holdAtLock();

    const [remove, submit] = await race(
      () => removeEvidence(fx.pm, { fileId: file.id }, { afterLock }),
      () => submitExpense(fx.pm, { expenseId, expectedVersion: version }),
      hold,
    );

    expect(remove.status).toBe("fulfilled");
    expect(submit.status).toBe("rejected");
    if (submit.status === "rejected") {
      expect(submit.reason).toBeInstanceOf(GateBlockedError);
      expect((submit.reason as Error).message).toBe("증빙 없음 · 증빙 올리기 Ctrl+U");
    }
    const [row] = await db.select({ number: expenses.number }).from(expenses).where(eq(expenses.id, expenseId));
    expect(row?.number).toBeNull();
    expect(await activeFilesOf(expenseId)).toHaveLength(0);
  });

  it("ⓒ 같은 파일을 두 탭에서 지우면 둘 다 오류 없이 끝나고 removed_at 한 번 · evidence_remove 로그 1건", async () => {
    const fx = await setupExpenseProject();
    const expenseId = await draftOf(fx);
    const file = await attachEvidence(fx.pm, expenseId);
    const { hold, afterLock } = holdAtLock();

    const [first, second] = await race(
      () => removeEvidence(fx.pm, { fileId: file.id }, { afterLock }),
      () => removeEvidence(fx.pm, { fileId: file.id }),
      hold,
    );

    expect([first.status, second.status]).toEqual(["fulfilled", "fulfilled"]);
    const [row] = await db.select().from(files).where(eq(files.id, file.id));
    expect(row?.removedAt).not.toBeNull();
    const logs = await db.select().from(actionLog).where(and(eq(actionLog.actionType, "document_update"), eq(actionLog.documentId, expenseId)));
    expect(logs.filter((entry) => (entry.detail as { change?: string } | null)?.change === "evidence_remove")).toHaveLength(1);
  });
});
