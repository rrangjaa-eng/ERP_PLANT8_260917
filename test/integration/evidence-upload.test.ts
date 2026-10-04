import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { actionLog, expenses, files, uploadIntents } from "@/db/schema";
import { createExpenseFromLines, submitExpense } from "@/domain/expenses";
import { completeEvidenceUpload, createEvidenceViewUrl, listEvidence, requestEvidenceUpload } from "@/domain/evidence";
import { GateBlockedError } from "@/domain/rules/gate";
import { createMemoryStorage } from "./fakes/memory-storage";
import { attachEvidence, setupExpenseProject, type ExpenseFixture } from "./fixtures/expenses";

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
  it("기안자의 선언은 incoming/{의도 id} 키 · 15분 만료 의도와 서명된 PUT 주소 · 헤더를 돌려준다", async () => {
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
    expect(row?.expiresAt.getTime()).toBe(NOW.getTime() + 15 * 60 * 1000);
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
