import { and, eq, ne } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/db/client";
import { expenses, files } from "@/db/schema";
import { createVisibleMemo, loadKindDetails } from "@/domain/approvals";
import { createEvidenceViewUrl, listEvidence, privateEvidenceNotice } from "@/domain/evidence";
import { fileVisibilityFor } from "@/domain/evidence/private-files";
import { EXPENSE_DOCUMENT_KIND } from "@/domain/expenses";
import type { Viewer } from "@/domain/viewer";
import { createDraftExpenseFixture, createIntakeManager } from "../fixtures/evidence";
import { attachEvidence, setupExpenseProject, submitReadyDraft, type ExpenseFixture } from "../fixtures/expenses";

// 07-27(R20 · C-65 · D-726 · AQ-15): 비공개 증빙 종류로 올린 파일은 업로드 완료 때 `files.private_to_owner = true`로 찍히고,
// 그 뒤 문서 증빙 종류를 공개로 바꿔도 올린 사람 · 전사 보는 범위만 본다 — 보임 = 파일 칸 OR 지금 문서 종류.

const PRIVATE_TYPE = "personal_card_receipt";
const PUBLIC_TYPE = "card_receipt";
const PRIVATE_LABEL = "개인카드 전표";
const SHEET_NOTICE = "비공개 증빙 · 경영관리만";
const OWNER = (expenseId: string) => ({ ownerKind: EXPENSE_DOCUMENT_KIND, ownerId: expenseId });

async function setEvidenceType(expenseId: string, evidenceType: string): Promise<void> {
  await db.update(expenses).set({ evidenceType }).where(eq(expenses.id, expenseId));
}

type Doc = { fx: ExpenseFixture; expenseId: string; manager: Viewer; fileId: string };

// 종류를 정한 뒤 기안자(pm)가 파일을 올린다. 비공개 종류(카드 R6로 사용은 꺼져 있다)는 제출 게이트가 고르지 못하게 하므로, 제출은
// 공개 종류로 공용 도우미(`submitReadyDraft` — 공개 파일 하나를 더 붙인다)로 하고 제출 뒤 종류를 다시 정한다. 결재자 lead는 전사 범위가 아니다.
async function docUploadedAs(evidenceType: string): Promise<Doc> {
  const fx = await setupExpenseProject();
  const manager = await createIntakeManager();
  const expenseId = await createDraftExpenseFixture(fx);
  await setEvidenceType(expenseId, evidenceType);
  const attached = await attachEvidence(fx.pm, expenseId, undefined, { name: "대상 전표.jpg" });
  await setEvidenceType(expenseId, PUBLIC_TYPE);
  await submitReadyDraft(fx.pm, expenseId);
  await setEvidenceType(expenseId, evidenceType);
  return { fx, expenseId, manager, fileId: attached.id };
}

const flagOf = async (fileId: string): Promise<boolean> => {
  const [row] = await db.select({ flag: files.privateToOwner }).from(files).where(eq(files.id, fileId));
  if (!row) throw new Error("파일 행 없음");
  return row.flag;
};

const idsFor = async (viewer: Viewer, expenseId: string): Promise<string[]> =>
  (await listEvidence(viewer, OWNER(expenseId))).flatMap((file) => (file.id ? [file.id] : []));

describe("07-27 트레이서 — 비공개 종류로 올린 파일은 종류를 바꿔도 숨는다", () => {
  it("비공개 종류 업로드는 private_to_owner = true로 찍히고, 종류를 공개로 바꿔도 결재자는 못 보며 기안자 · 전사 범위는 본다", async () => {
    const doc = await docUploadedAs(PRIVATE_TYPE);
    expect(await flagOf(doc.fileId)).toBe(true);
    expect(await idsFor(doc.fx.lead, doc.expenseId)).not.toContain(doc.fileId);

    await setEvidenceType(doc.expenseId, PUBLIC_TYPE);

    expect(await idsFor(doc.fx.lead, doc.expenseId)).not.toContain(doc.fileId);
    expect(await idsFor(doc.fx.pm, doc.expenseId)).toContain(doc.fileId);
    expect(await idsFor(doc.manager, doc.expenseId)).toContain(doc.fileId);
  });

  it("공개 종류 업로드는 false로 찍히고 결재자가 본다", async () => {
    const doc = await docUploadedAs(PUBLIC_TYPE);

    expect(await flagOf(doc.fileId)).toBe(false);
    expect(await idsFor(doc.fx.lead, doc.expenseId)).toContain(doc.fileId);
  });

  it("공개 종류로 올린 파일은 종류를 비공개로 바꾸면 그때부터 숨는다(지금 동작 유지)", async () => {
    const doc = await docUploadedAs(PUBLIC_TYPE);
    await setEvidenceType(doc.expenseId, PRIVATE_TYPE);

    expect(await idsFor(doc.fx.lead, doc.expenseId)).not.toContain(doc.fileId);
    expect(await idsFor(doc.fx.pm, doc.expenseId)).toContain(doc.fileId);
  });
});

describe("07-27 남은 판정 길", () => {
  it("숨긴 파일 id로 결재자가 열기 · 내려받기를 하면 없음 응답, 기안자 · 전사 범위는 열린다", async () => {
    const doc = await docUploadedAs(PRIVATE_TYPE);
    await setEvidenceType(doc.expenseId, PUBLIC_TYPE);

    expect(await createEvidenceViewUrl(doc.fx.lead, { fileId: doc.fileId })).toBeNull();
    expect(await createEvidenceViewUrl(doc.fx.pm, { fileId: doc.fileId })).not.toBeNull();
    expect(await createEvidenceViewUrl(doc.manager, { fileId: doc.fileId })).not.toBeNull();
  });

  it("종류가 공개로 바뀐 뒤에도 결재 시트에는 숨긴 파일 이름이 없고 잠김 한 줄만 있다", async () => {
    const doc = await docUploadedAs(PRIVATE_TYPE);
    await setEvidenceType(doc.expenseId, PUBLIC_TYPE);
    // 제출용으로 붙은 공개 파일은 떼어, 보이는 파일이 0인 문서(잠김 한 줄만 서는 갈래)로 만든다.
    await db.update(files).set({ removedAt: new Date() }).where(and(eq(files.ownerId, doc.expenseId), ne(files.id, doc.fileId)));

    const rows = (await loadKindDetails(doc.fx.lead, EXPENSE_DOCUMENT_KIND, [doc.expenseId], { visible: createVisibleMemo() })).get(doc.expenseId)?.rows ?? [];
    expect(rows.filter((row) => row.label === "증빙")).toEqual([{ label: "증빙", value: SHEET_NOTICE, tone: "muted" }]);
    expect(JSON.stringify(rows)).not.toContain("대상 전표.jpg");
  });

  it("종류가 공개인데 파일 칸으로 숨긴 파일이 있으면 결재자에게 기존 문구, 기안자에게 null · 종류가 비공개면 종류 이름 꼴", async () => {
    const doc = await docUploadedAs(PRIVATE_TYPE);
    await setEvidenceType(doc.expenseId, PUBLIC_TYPE);

    expect(await privateEvidenceNotice(doc.fx.lead, OWNER(doc.expenseId))).toBe(SHEET_NOTICE);
    expect(await privateEvidenceNotice(doc.fx.pm, OWNER(doc.expenseId))).toBeNull();
    expect(await privateEvidenceNotice(doc.manager, OWNER(doc.expenseId))).toBeNull();

    await setEvidenceType(doc.expenseId, PRIVATE_TYPE);
    expect(await privateEvidenceNotice(doc.fx.lead, OWNER(doc.expenseId))).toBe(`${PRIVATE_LABEL} · 경영관리만`);
  });

  it("분할 틈 — 07-27 전에 올려 false로 남은 파일도 종류가 비공개인 동안은 숨는다", async () => {
    const doc = await docUploadedAs(PRIVATE_TYPE);
    await db.update(files).set({ privateToOwner: false }).where(eq(files.id, doc.fileId));

    expect(await idsFor(doc.fx.lead, doc.expenseId)).not.toContain(doc.fileId);
    expect(await idsFor(doc.fx.pm, doc.expenseId)).toContain(doc.fileId);
  });

  it("지출결의가 아닌 주인(카드 전표 등) 파일은 칸 값과 상관없이 다 보인다", async () => {
    const doc = await docUploadedAs(PRIVATE_TYPE);
    const visibility = await fileVisibilityFor(doc.fx.lead, { ownerKind: "corp_card_usage", evidenceType: null });

    expect(visibility.visible({ uploadedBy: doc.manager.id, privateToOwner: true })).toBe(true);
    expect(visibility.privateTypeName).toBeNull();
  });
});
