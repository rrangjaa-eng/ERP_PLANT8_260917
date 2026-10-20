import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/db/client";
import { approvalInstances, codeItems, expenses } from "@/db/schema";
import { approveDocument, createVisibleMemo, loadKindDetails, rejectDocument } from "@/domain/approvals";
import { createEvidenceViewUrl, getEvidenceActions, listEvidence, privateEvidenceNotice, removeEvidence, voidEvidence } from "@/domain/evidence";
import { evidenceSourcesOf, hasEvidence } from "@/domain/evidence/has-evidence";
import { listLinkedEvidence, listLinkedEvidenceForOwners } from "@/domain/evidence-records/linked";
import { getPaymentView } from "@/domain/payments";
import { EXPENSE_DOCUMENT_KIND } from "@/domain/expenses";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { upsertPermission } from "@/repositories/permissions";
import { insertRole } from "@/repositories/roles";
import { makePerson } from "./approvals-fixtures";
import { purchaseProject, request as createPurchaseRequestFixture } from "./fixtures/purchase-requests";
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
  // 06.1-14 독립 검토 P3-4 — 구매 요청 목록 길(listLinkedEvidenceForOwners)도 같은 거름을 쓴다: 요청마다 「보이는 첫 기록」 하나.
  it("구매 요청 목록 — 요청자는 먼저 붙은 G15 기록을 건너뛰고 공개 기록을, 경영관리는 G15 기록을 첫 기록으로 본다", async () => {
    const pfx = await purchaseProject();
    const manager = await createIntakeManager();
    if (!manager.roleId) throw new Error("계급 없음");
    await upsertPermission(SYSTEM_VIEWER, { roleId: manager.roleId, menu: "projects", action: "view", allowed: true });
    const created = await createPurchaseRequestFixture(pfx, pfx.onlineLine, 110_000);
    const privateRecord = await insertRecordFixture(manager, { evidenceType: PRIVATE_TYPE, nameOnDocument: "개인카드사", supplyKrw: 100_000, vatKrw: 10_000 });
    const publicRecord = await insertRecordFixture(manager, { evidenceType: "card_receipt", nameOnDocument: "스테이지원", supplyKrw: 100_000, vatKrw: 10_000 });
    await insertLinkFixture({ recordId: privateRecord, ownerKind: "purchase_request", ownerId: created.id, attachedBy: manager.id });
    await insertLinkFixture({ recordId: publicRecord, ownerKind: "purchase_request", ownerId: created.id, attachedBy: manager.id });

    const requester = await listLinkedEvidenceForOwners(pfx.pm, { kind: "purchase_request", ids: [created.id] });
    expect(requester[created.id]?.recordId).toBe(publicRecord);
    expect(JSON.stringify(requester)).not.toContain("개인카드사");

    const managed = await listLinkedEvidenceForOwners(manager, { kind: "purchase_request", ids: [created.id] });
    expect(managed[created.id]?.recordId).toBe(privateRecord);
  });

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

// 06.1-14 독립 검토 P2-1 — 승인 문서의 지급 패널 보기(getPaymentView)는 클라이언트 컴포넌트로 통째로 넘어간다.
// 증빙 지문이 파일 id를 이어 붙인 글자면 숨긴 파일 id · 건수가 RSC 페이로드로 샌다.
describe("G15 지급 패널 보기(getPaymentView)", () => {
  it("결재자 · 기안자의 보기 직렬화에 보이지 않는 파일 id가 없다", async () => {
    const fx = await setupExpenseProject();
    const manager = await createIntakeManager();
    const { expenseId, instanceId } = await createInReviewExpenseFixture(fx);
    const [pmFile] = await listEvidence(fx.pm, { ownerKind: EXPENSE_DOCUMENT_KIND, ownerId: expenseId });
    const managerFile = await attachEvidence(manager, expenseId, undefined, { name: "경영관리 전표.jpg" });
    await setEvidenceType(expenseId, PRIVATE_TYPE);
    const [instance] = await db.select({ version: approvalInstances.version }).from(approvalInstances).where(eq(approvalInstances.id, instanceId));
    const first = await approveDocument(fx.lead, { instanceId, expectedVersion: instance?.version ?? 0 });
    const final = await approveDocument(fx.ceo, { instanceId, expectedVersion: first.version });
    expect(final.status).toBe("approved");
    if (!pmFile?.id) throw new Error("기안자 파일 없음");

    const lead = JSON.stringify(await getPaymentView(fx.lead, expenseId));
    expect(lead).not.toContain(pmFile.id);
    expect(lead).not.toContain(managerFile.id);
    expect(JSON.stringify(await getPaymentView(fx.pm, expenseId))).not.toContain(managerFile.id);
  });
});

// 06.1-14 독립 검토 P3-1 — 지우기 · 무효 처리 쓰기 길도 보기와 같은 G15 판정을 쓴다. 볼 수 없는 파일 id로 부르면 「없는 지출결의」와
// 같은 글자로 거부하고, 이미 무효인 숨김 파일이어도 처리한 사람 이름 · 시각을 내지 않는다.
describe("G15 쓰기 길 — 지우기 · 무효 처리(P3-1)", () => {
  const NOT_FOUND = "없는 지출결의 · 새로 고침";

  const instanceOf = async (expenseId: string) => {
    const [row] = await db.select({ id: approvalInstances.id, version: approvalInstances.version }).from(approvalInstances).where(eq(approvalInstances.documentId, expenseId));
    if (!row) throw new Error("결재 인스턴스 없음");
    return row;
  };

  const liveIdsOf = async (viewer: Viewer, expenseId: string) =>
    (await listEvidence(viewer, { ownerKind: EXPENSE_DOCUMENT_KIND, ownerId: expenseId })).filter((file) => !file.voidedAt).map((file) => file.id);

  // 팀 보는 범위 + 무효 처리 권한(전사 범위가 아니라 G15 숨김 파일을 못 본다).
  async function teamVoider(): Promise<Viewer> {
    const role = await insertRole(SYSTEM_VIEWER, { id: `role-${randomUUID()}`, name: `팀무효-${randomUUID().slice(0, 8)}`, workScope: "team", viewScope: "team" });
    await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "expenses", action: "view", allowed: true });
    await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "expenses.evidence_void", action: "write", allowed: true });
    return makePerson("팀무효", role.id, "기획1팀");
  }

  it("반려된 문서의 기안자는 경영관리 숨김 파일을 id로 지우지 못하고(없는 지출결의) 자기 파일은 지운다", async () => {
    const doc = await privateDoc();
    const instance = await instanceOf(doc.expenseId);
    await rejectDocument(doc.fx.lead, { instanceId: instance.id, expectedVersion: instance.version, reason: "공급가 다시" });

    await expect(removeEvidence(doc.fx.pm, { fileId: doc.managerFileId })).rejects.toThrow(NOT_FOUND);
    expect(await liveIdsOf(doc.manager, doc.expenseId)).toContain(doc.managerFileId);
    await expect(removeEvidence(doc.fx.pm, { fileId: doc.pmFileId })).resolves.toBeUndefined();
  });

  it("전사 범위가 아닌 무효 처리 권한자는 숨김 파일을 무효로 만들지 못하고, 이미 무효인 숨김 파일에도 처리한 사람이 나오지 않는다", async () => {
    const doc = await privateDoc();
    const instance = await instanceOf(doc.expenseId);
    const first = await approveDocument(doc.fx.lead, { instanceId: instance.id, expectedVersion: instance.version });
    expect((await approveDocument(doc.fx.ceo, { instanceId: instance.id, expectedVersion: first.version })).status).toBe("approved");
    const voider = await teamVoider();

    await expect(voidEvidence(voider, { fileId: doc.pmFileId, reason: "잘못 붙음" })).rejects.toThrow(NOT_FOUND);
    expect(await liveIdsOf(doc.manager, doc.expenseId)).toContain(doc.pmFileId);

    await voidEvidence(doc.manager, { fileId: doc.pmFileId, reason: "잘못 붙음" });
    const error = await voidEvidence(voider, { fileId: doc.pmFileId, reason: "잘못 붙음" }).then(
      () => null,
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe(NOT_FOUND);
  });
});
