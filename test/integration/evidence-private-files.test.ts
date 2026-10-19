import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/db/client";
import { codeItems, expenses } from "@/db/schema";
import { createVisibleMemo, loadKindDetails } from "@/domain/approvals";
import { createEvidenceViewUrl, getEvidenceActions, listEvidence, privateEvidenceNotice } from "@/domain/evidence";
import { evidenceSourcesOf, hasEvidence } from "@/domain/evidence/has-evidence";
import { listLinkedEvidence } from "@/domain/evidence-records/linked";
import { EXPENSE_DOCUMENT_KIND } from "@/domain/expenses";
import type { Viewer } from "@/domain/viewer";
import { attachEvidence, setupExpenseProject, type ExpenseFixture } from "./fixtures/expenses";
import { createInReviewExpenseFixture, createIntakeManager, insertLinkFixture, insertRecordFixture } from "./fixtures/evidence";

// 06.1-14(G15 · RP-15 ⑵ · T-061-142 · T-061-147 · T-061-148): 「올린 사람 · 경영관리만 보기」 증빙 종류(개인카드 전표 — 06.1-01 시드,
// 카드 R6로 사용은 꺼져 있다)를 문서 증빙 종류로 가진 지출결의의 05 파일은 올린 사람과 전사 보는 범위만 본다 — 목록 · 보기 주소 ·
// 3차 id · 결재 시트 · 붙은 기록이 같은 판정 하나를 쓴다. 「증빙 있음」 수(지급 · 제출 판정)는 숨김 파일도 그대로 센다.

const PRIVATE_TYPE = "personal_card_receipt";
const PRIVATE_LABEL = "개인카드 전표";
const SHEET_NOTICE = "비공개 증빙 · 경영관리만";

type Doc = { fx: ExpenseFixture; expenseId: string; manager: Viewer; pmFileId: string; managerFileId: string };

async function setEvidenceType(expenseId: string, evidenceType: string): Promise<void> {
  await db.update(expenses).set({ evidenceType }).where(eq(expenses.id, expenseId));
}

async function setPrivateToOwner(value: boolean): Promise<void> {
  await db.update(codeItems).set({ privateToOwner: value }).where(and(eq(codeItems.tableKey, "evidence_type"), eq(codeItems.value, PRIVATE_TYPE)));
}

async function privateTypeItemId(): Promise<string> {
  const [row] = await db
    .select({ id: codeItems.id })
    .from(codeItems)
    .where(and(eq(codeItems.tableKey, "evidence_type"), eq(codeItems.value, PRIVATE_TYPE)));
  if (!row) throw new Error("개인카드 전표 코드 항목 없음");
  return row.id;
}

// 결재 중 문서 하나 — 기안자가 올린 파일 하나 + 경영관리가 붙인 파일 하나, 문서 증빙 종류는 개인카드 전표.
async function privateDoc(): Promise<Doc> {
  const fx = await setupExpenseProject();
  const manager = await createIntakeManager();
  const { expenseId } = await createInReviewExpenseFixture(fx);
  const [pmFile] = await listEvidence(fx.pm, { ownerKind: EXPENSE_DOCUMENT_KIND, ownerId: expenseId });
  const managerFile = await attachEvidence(manager, expenseId, undefined, { name: "경영관리 전표.jpg" });
  await setEvidenceType(expenseId, PRIVATE_TYPE);
  if (!pmFile?.id) throw new Error("기안자 파일 없음");
  return { fx, expenseId, manager, pmFileId: pmFile.id, managerFileId: managerFile.id };
}

const fileIdsFor = async (viewer: Viewer, expenseId: string): Promise<string[]> =>
  (await listEvidence(viewer, { ownerKind: EXPENSE_DOCUMENT_KIND, ownerId: expenseId })).flatMap((file) => (file.id ? [file.id] : []));

describe("G15 05 파일 — 목록 · 보기 주소 · 3차 id", () => {
  it("기안자는 자기 파일만, 결재자(팀장)는 0, 전사 보는 범위는 둘을 본다", async () => {
    const doc = await privateDoc();

    expect(await fileIdsFor(doc.fx.pm, doc.expenseId)).toEqual([doc.pmFileId]);
    expect(await fileIdsFor(doc.fx.lead, doc.expenseId)).toEqual([]);
    expect((await fileIdsFor(doc.manager, doc.expenseId)).sort()).toEqual([doc.pmFileId, doc.managerFileId].sort());
  });

  it("결재자는 남의 파일 보기 주소를 받지 못하고(null → 404) 전사 범위는 받는다", async () => {
    const doc = await privateDoc();

    expect(await createEvidenceViewUrl(doc.fx.lead, { fileId: doc.pmFileId })).toBeNull();
    expect(await createEvidenceViewUrl(doc.fx.pm, { fileId: doc.pmFileId })).not.toBeNull();
    expect(await createEvidenceViewUrl(doc.manager, { fileId: doc.pmFileId })).not.toBeNull();
  });

  it("3차 id 목록(지울 · 무효 처리)에 보이지 않는 파일 id가 없다", async () => {
    const doc = await privateDoc();

    const lead = await getEvidenceActions(doc.fx.lead, { ownerKind: EXPENSE_DOCUMENT_KIND, ownerId: doc.expenseId });
    expect([...lead.deletableFileIds, ...lead.voidableFileIds]).toEqual([]);
    const manager = await getEvidenceActions(doc.manager, { ownerKind: EXPENSE_DOCUMENT_KIND, ownerId: doc.expenseId });
    expect([...manager.deletableFileIds, ...manager.voidableFileIds]).not.toContain(doc.pmFileId);
  });

  it("「증빙 있음」 수는 숨김 파일도 그대로 센다 — 지급 · 제출 판정은 바뀌지 않는다", async () => {
    const doc = await privateDoc();
    const owner = { ownerKind: EXPENSE_DOCUMENT_KIND, ownerId: doc.expenseId };

    expect(await hasEvidence(doc.fx.lead, owner)).toBe(true);
    const sources = await evidenceSourcesOf(doc.fx.lead, { ownerKind: EXPENSE_DOCUMENT_KIND, ownerIds: [doc.expenseId] });
    expect(sources.get(doc.expenseId)?.fileCount).toBe(2);
  });

  it("속성을 끄면 결재자도 둘을 보고, 코드 항목이 보관 · 사용 꺼짐이어도 속성이 켜져 있으면 0이다", async () => {
    const doc = await privateDoc();
    const itemId = await privateTypeItemId();

    await setPrivateToOwner(false);
    expect(await fileIdsFor(doc.fx.lead, doc.expenseId)).toHaveLength(2);

    await setPrivateToOwner(true);
    await db.update(codeItems).set({ archivedAt: new Date(), archivedBy: doc.manager.id }).where(eq(codeItems.id, itemId));
    expect(await fileIdsFor(doc.fx.lead, doc.expenseId)).toEqual([]);
    await db.update(codeItems).set({ archivedAt: null, archivedBy: null }).where(eq(codeItems.id, itemId));
  });

  it("문서 증빙 종류가 다른 종류(카드 전표)면 결재자도 둘을 본다", async () => {
    const doc = await privateDoc();
    await setEvidenceType(doc.expenseId, "card_receipt");

    expect(await fileIdsFor(doc.fx.lead, doc.expenseId)).toHaveLength(2);
  });
});

describe("G15 문서 화면 잠김 줄", () => {
  it("숨긴 파일이 있는 결재자에게 `{종류 이름} · 경영관리만`, 전사 보는 범위에게 null", async () => {
    const doc = await privateDoc();
    const owner = { ownerKind: EXPENSE_DOCUMENT_KIND, ownerId: doc.expenseId };

    expect(await privateEvidenceNotice(doc.fx.lead, owner)).toBe(`${PRIVATE_LABEL} · 경영관리만`);
    expect(await privateEvidenceNotice(doc.manager, owner)).toBeNull();
  });

  it("자기 파일만 있는 문서의 기안자에게는 null(숨은 파일이 없다)", async () => {
    const fx = await setupExpenseProject();
    const { expenseId } = await createInReviewExpenseFixture(fx);
    await setEvidenceType(expenseId, PRIVATE_TYPE);
    const owner = { ownerKind: EXPENSE_DOCUMENT_KIND, ownerId: expenseId };

    expect(await privateEvidenceNotice(fx.pm, owner)).toBeNull();
    expect(await privateEvidenceNotice(fx.lead, owner)).toBe(`${PRIVATE_LABEL} · 경영관리만`);
  });
});

describe("G15 결재 시트(Round 2 P1-6 · 카드 G-N2)", () => {
  const rowsOf = async (viewer: Viewer, expenseId: string) =>
    (await loadKindDetails(viewer, EXPENSE_DOCUMENT_KIND, [expenseId], { visible: createVisibleMemo() })).get(expenseId)?.rows ?? [];

  it("결재자 시트에는 파일 갈래 행이 없고 라벨 「증빙」 행 하나가 muted 잠김 글자다", async () => {
    const doc = await privateDoc();

    const rows = await rowsOf(doc.fx.lead, doc.expenseId);
    const evidence = rows.filter((row) => row.label === "증빙");
    expect(evidence).toEqual([{ label: "증빙", value: SHEET_NOTICE, tone: "muted" }]);
    expect(JSON.stringify(rows)).not.toContain("경영관리 전표.jpg");
  });

  it("전사 보는 범위 계급은 파일 이름 둘 · 잠김 행 없음", async () => {
    const doc = await privateDoc();

    const evidence = (await rowsOf(doc.manager, doc.expenseId)).filter((row) => row.label === "증빙");
    expect(evidence).toHaveLength(1);
    expect(evidence[0]?.files).toHaveLength(2);
    expect(evidence[0]?.value).not.toBe(SHEET_NOTICE);
  });

  it("보이는 파일이 하나 남는 기안자에게는 파일 행 하나 · 잠김 행 없음", async () => {
    const doc = await privateDoc();

    const evidence = (await rowsOf(doc.fx.pm, doc.expenseId)).filter((row) => row.label === "증빙");
    expect(evidence).toHaveLength(1);
    expect(evidence[0]?.files).toHaveLength(1);
  });

  it("다른 종류 문서는 결재자도 파일 둘 · 잠김 행 없음", async () => {
    const doc = await privateDoc();
    await setEvidenceType(doc.expenseId, "card_receipt");

    const evidence = (await rowsOf(doc.fx.lead, doc.expenseId)).filter((row) => row.label === "증빙");
    expect(evidence).toHaveLength(1);
    expect(evidence[0]?.files).toHaveLength(2);
  });
});

describe("G15 붙은 증빙 기록(PA-G15-LINKED)", () => {
  it("결재자는 G15 종류 기록 행을 못 보고(공개 종류 하나만) 경영관리는 둘을 보며, 잠김 줄은 숨긴 기록도 센다", async () => {
    const fx = await setupExpenseProject();
    const manager = await createIntakeManager();
    const { expenseId } = await createInReviewExpenseFixture(fx);
    await setEvidenceType(expenseId, "card_receipt");
    const privateRecord = await insertRecordFixture(manager, { evidenceType: PRIVATE_TYPE, nameOnDocument: "개인카드사" });
    const publicRecord = await insertRecordFixture(manager, { evidenceType: "card_receipt", nameOnDocument: "스테이지원" });
    await insertLinkFixture({ recordId: privateRecord, ownerId: expenseId, attachedBy: manager.id });
    await insertLinkFixture({ recordId: publicRecord, ownerId: expenseId, attachedBy: manager.id });

    const lead = await listLinkedEvidence(fx.lead, { kind: "expense", id: expenseId });
    expect(lead.items.map((item) => item.recordId)).toEqual([publicRecord]);
    expect(JSON.stringify(lead.items)).not.toContain("개인카드사");

    const managed = await listLinkedEvidence(manager, { kind: "expense", id: expenseId });
    expect(managed.items.map((item) => item.recordId).sort()).toEqual([privateRecord, publicRecord].sort());

    expect(await privateEvidenceNotice(fx.lead, { ownerKind: EXPENSE_DOCUMENT_KIND, ownerId: expenseId })).toBe(`${PRIVATE_LABEL} · 경영관리만`);
  });
});
