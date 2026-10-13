import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { approvalInstances, expenseEvidenceReviews, expenses } from "@/db/schema";
import { approveDocument } from "@/domain/approvals";
import { createExpenseFromLines } from "@/domain/expenses";
import { completeEvidenceUpload, listEvidence, requestEvidenceUpload } from "@/domain/evidence";
import { listRevisionSummaries } from "@/domain/quotes/revisions";
import type { Viewer } from "@/domain/viewer";
import { createMemoryStorage, type MemoryStorage } from "./fakes/memory-storage";
import { attachEvidence, setupExpenseProject, submitReadyDraft, type ExpenseFixture } from "./fixtures/expenses";

// 06-16(D-56 · D-60 · EVID-03): 차수 고객 승인 증빙(quote_revision) · 리저브 줄 증빙(reserve_entry) — 05 domain/evidence 주인 표 두 줄.
// 권리 · 노출은 04 사실(담당 PM · projects 쓰기 · quote.amount / pnl 쓰기 · reserve.amount)을 서버가 주인 행으로 다시 읽어 판정한다.

function sha(): string {
  return randomBytes(32).toString("hex");
}

type OwnerKind = "quote_revision" | "reserve_entry";

async function upload(viewer: Viewer, ownerKind: OwnerKind, ownerId: string, storage: MemoryStorage = createMemoryStorage(), file: { sha256?: string; name?: string } = {}) {
  const declared = { size: 212_000, contentType: "application/pdf", sha256: file.sha256 ?? sha(), name: file.name ?? "고객 승인 메일.pdf" };
  const intent = await requestEvidenceUpload(viewer, { ownerKind, ownerId, ...declared }, { storage });
  storage.put(intent.url, { size: declared.size, contentType: declared.contentType, sha256: declared.sha256 });
  return completeEvidenceUpload(viewer, { intentId: intent.intentId }, { storage });
}

async function summaryOf(viewer: Viewer, fx: ExpenseFixture) {
  const rows = await listRevisionSummaries(viewer, fx.projectId);
  const row = rows.find((candidate) => candidate.revisionId === fx.revisionId);
  if (!row) throw new Error("차수 요약 없음");
  return row;
}

describe("트레이서 — 차수 승인 증빙 한 장", () => {
  it("담당 PM이 승인된 차수에 PDF를 붙이면 listEvidence 1 · 차수 요약 approvalEvidenceCount 1", async () => {
    const fx = await setupExpenseProject();
    expect((await summaryOf(fx.pm, fx)).approvalEvidenceCount).toBe(0);

    const file = await upload(fx.pm, "quote_revision", fx.revisionId);

    const listed = await listEvidence(fx.pm, { ownerKind: "quote_revision", ownerId: fx.revisionId });
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({ id: file.id, originalName: "고객 승인 메일.pdf", ownerKind: "quote_revision", ownerId: fx.revisionId });
    expect((await summaryOf(fx.pm, fx)).approvalEvidenceCount).toBe(1);
  });

  it("[C4 · X-2] 같은 업로드 전후로 결재 통과 지출결의의 version · 인스턴스 version · 확인 기록 수가 같다", async () => {
    const fx = await setupExpenseProject();
    const created = await createExpenseFromLines(fx.pm, { lineIds: [fx.lines.withVendor] });
    const expenseId = created.created[0]?.expenseId ?? "";
    await attachEvidence(fx.pm, expenseId);
    const submitted = await submitReadyDraft(fx.pm, expenseId);
    if (submitted.kind !== "submitted") throw new Error("제출 안 됨");
    const first = await approveDocument(fx.lead, { instanceId: submitted.instanceId, expectedVersion: 1 });
    await approveDocument(fx.ceo, { instanceId: submitted.instanceId, expectedVersion: first.version });

    const snapshot = async () => {
      const [expense] = await db.select({ version: expenses.version }).from(expenses).where(eq(expenses.id, expenseId));
      const [instance] = await db.select({ version: approvalInstances.version }).from(approvalInstances).where(eq(approvalInstances.id, submitted.instanceId));
      const reviews = await db.select({ id: expenseEvidenceReviews.id }).from(expenseEvidenceReviews).where(eq(expenseEvidenceReviews.expenseId, expenseId));
      return { expense: expense?.version, instance: instance?.version, reviews: reviews.length };
    };
    const before = await snapshot();

    await upload(fx.pm, "quote_revision", fx.revisionId);

    expect(await snapshot()).toEqual(before);
  });
});
