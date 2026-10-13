import { randomBytes, randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { actionLog, approvalInstances, expenseEvidenceReviews, expenses, files, projects, quoteRevisions, reserveEntries, teams } from "@/db/schema";
import { approveDocument } from "@/domain/approvals";
import { createAccount } from "@/domain/auth/accounts";
import { createProject } from "@/domain/projects";
import { createExpenseFromLines, deleteExpenseDraft, ExpenseNotFoundError, restoreExpenseDraft } from "@/domain/expenses";
import {
  completeEvidenceUpload,
  createEvidenceViewUrl,
  EvidenceCheckError,
  EvidenceUploadRefusedError,
  getEvidenceActions,
  getOwnedEvidence,
  listEvidence,
  removeEvidence,
  requestEvidenceUpload,
  restoreEvidence,
} from "@/domain/evidence";
import { EVIDENCE_DUPLICATE_HIDDEN, EVIDENCE_DUPLICATE_SAME_OWNER } from "@/domain/evidence/upload-checks";
import { getCurrentQuoteRevision } from "@/domain/quotes/lines";
import { listReserves, restoreReserve, saveReserves, type ReserveWriteRow } from "@/domain/reserves";
import { customerApprovalColumns, listRevisionSummaries, setCustomerApproval } from "@/domain/quotes/revisions";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { log } from "@/lib/log";
import { insertFile } from "@/repositories/files";
import { insertRole } from "@/repositories/roles";
import { approvalBasis } from "@/repositories/quote-revisions";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { insertVendor } from "@/repositories/vendors";
import { createMemoryStorage, type MemoryStorage } from "./fakes/memory-storage";
import { addApprovedRevision, attachEvidence, setupExpenseProject, submitReadyDraft, type ExpenseFixture } from "./fixtures/expenses";

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

async function caught(promise: Promise<unknown>): Promise<Error> {
  try {
    await promise;
  } catch (error) {
    return error as Error;
  }
  throw new Error("거부되지 않았다");
}

async function logCount(change: string): Promise<number> {
  const rows = await db.select({ detail: actionLog.detail }).from(actionLog).where(eq(actionLog.entity, "file"));
  return rows.filter((row) => (row.detail as { change?: string } | null)?.change === change).length;
}

async function fileRowsOf(ownerKind: string, ownerId: string) {
  return db.select().from(files).where(and(eq(files.ownerKind, ownerKind), eq(files.ownerId, ownerId)));
}

// 계급을 직접 만든 사람 — 노출 · 권한만 재는 계급(행 범위 company).
async function makeViewer(menus: { menu: string; action: "view" | "write" }[], infoItems: string[]): Promise<Viewer & { roleId: string }> {
  const role = await insertRole(SYSTEM_VIEWER, { id: `role-${randomUUID()}`, name: `증빙 계급-${randomUUID()}`, viewScope: "company" });
  const { userId } = await createAccount(SYSTEM_VIEWER, { email: `aev-${randomUUID()}@example.test`, name: "증빙 테스트 사람", roleId: role.id });
  for (const entry of menus) await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: entry.menu, action: entry.action, allowed: true });
  for (const infoItem of infoItems) await upsertVisibility(SYSTEM_VIEWER, { roleId: role.id, infoItem, visible: true });
  return { id: userId, roleId: role.id };
}

const PM_MENUS = [
  { menu: "projects", action: "view" as const },
  { menu: "projects", action: "write" as const },
];

// 담당 PM이 직접 만든 계급인 승인된 1차 프로젝트(진행) — 노출 계급을 바꿔 보는 사례용.
async function approvedProjectOf(pm: Viewer) {
  const client = await insertVendor(SYSTEM_VIEWER, { name: `거래처-${randomUUID()}`, normalizedName: `거래처-${randomUUID()}` });
  const [team] = await db.select().from(teams).limit(1);
  if (!team) throw new Error("시드된 팀이 없습니다");
  const created = await createProject(SYSTEM_VIEWER, { clientId: client.id, teamId: team.id, pmUserId: pm.id, name: `승인증빙-${randomUUID()}` });
  const revision = await getCurrentQuoteRevision(SYSTEM_VIEWER, created.id);
  if (!revision) throw new Error("1차 차수가 없습니다");
  await db.update(quoteRevisions).set(customerApprovalColumns(pm.id, "2026-09-15")).where(eq(quoteRevisions.id, revision.id));
  return { projectId: created.id, revisionId: revision.id };
}

describe("D-56 마감 — 표시 꺼짐 · 완료 · 권리 밖 직접 호출 · 노출", () => {
  it("승인 표시를 취소해도 파일은 남아 읽기만 되고(올리기 거부), 다시 켜면 쓸 수 있다", async () => {
    const fx = await setupExpenseProject();
    const file = await upload(fx.pm, "quote_revision", fx.revisionId);

    await setCustomerApproval(fx.pm, fx.revisionId, null);

    expect(await listEvidence(fx.pm, { ownerKind: "quote_revision", ownerId: fx.revisionId })).toHaveLength(1);
    expect((await getEvidenceActions(fx.pm, { ownerKind: "quote_revision", ownerId: fx.revisionId })).canAdd).toBe(false);
    await expect(requestEvidenceUpload(fx.pm, { ownerKind: "quote_revision", ownerId: fx.revisionId, size: 10, contentType: "application/pdf", sha256: sha(), name: "a.pdf" })).rejects.toThrow("승인 표시 없음 · 증빙 잠김");
    await expect(removeEvidence(fx.pm, { fileId: file.id })).rejects.toThrow("승인 표시 없음 · 증빙 잠김");

    const basis = await approvalBasis(SYSTEM_VIEWER, fx.revisionId);
    await setCustomerApproval(fx.pm, fx.revisionId, { approvedOn: "2026-09-16", seenTotalKrw: basis.totalKrw, contentToken: basis.contentToken });
    expect((await getEvidenceActions(fx.pm, { ownerKind: "quote_revision", ownerId: fx.revisionId })).canAdd).toBe(true);
    const again = await upload(fx.pm, "quote_revision", fx.revisionId);
    expect(again.id).toEqual(expect.any(String));
  });

  it("완료(completed) 프로젝트는 읽기만 — 올리기 · 지우기 거부, 목록은 그대로", async () => {
    const fx = await setupExpenseProject();
    const file = await upload(fx.pm, "quote_revision", fx.revisionId);
    await db.update(projects).set({ status: "completed" }).where(eq(projects.id, fx.projectId));

    expect(await listEvidence(fx.pm, { ownerKind: "quote_revision", ownerId: fx.revisionId })).toHaveLength(1);
    expect((await getOwnedEvidence(fx.pm, { ownerKind: "quote_revision", ownerId: fx.revisionId })).actions.canAdd).toBe(false);
    await expect(upload(fx.pm, "quote_revision", fx.revisionId)).rejects.toThrow("완료 · 보관 프로젝트 · 증빙 잠김");
    await expect(removeEvidence(fx.pm, { fileId: file.id })).rejects.toThrow("완료 · 보관 프로젝트 · 증빙 잠김");
  });

  it("[T-06-78] 담당 PM이 아닌 사람은 요청 · 삭제 · 되살리기를 직접 불러도 거부된다", async () => {
    const fx = await setupExpenseProject();
    const file = await upload(fx.pm, "quote_revision", fx.revisionId);
    const removed = await upload(fx.pm, "quote_revision", fx.revisionId);
    await removeEvidence(fx.pm, { fileId: removed.id });

    for (const outsider of [fx.otherPm, fx.lead]) {
      await expect(requestEvidenceUpload(outsider, { ownerKind: "quote_revision", ownerId: fx.revisionId, size: 10, contentType: "application/pdf", sha256: sha(), name: "a.pdf" })).rejects.toThrow("승인 증빙은 담당 PM만");
      await expect(removeEvidence(outsider, { fileId: file.id })).rejects.toThrow("승인 증빙은 담당 PM만");
      await expect(restoreEvidence(outsider, { fileId: removed.id })).rejects.toThrow("승인 증빙은 담당 PM만");
    }
    expect(await listEvidence(fx.pm, { ownerKind: "quote_revision", ownerId: fx.revisionId })).toHaveLength(1);
  });

  it("[T-06-79] quote.amount 노출이 없는 계급은 요약에 개수 키가 없고 펼침 읽기 · 보기 주소가 비어 있다", async () => {
    const fx = await setupExpenseProject();
    const file = await upload(fx.pm, "quote_revision", fx.revisionId);
    const blind = await makeViewer(PM_MENUS, ["project.value"]);

    const rows = await listRevisionSummaries(blind, fx.projectId);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) expect("approvalEvidenceCount" in row).toBe(false);
    const owned = await getOwnedEvidence(blind, { ownerKind: "quote_revision", ownerId: fx.revisionId });
    expect(owned.files).toEqual([]);
    expect(owned.actions.canAdd).toBe(false);
    expect(await listEvidence(blind, { ownerKind: "quote_revision", ownerId: fx.revisionId })).toEqual([]);
    expect(await createEvidenceViewUrl(blind, { fileId: file.id })).toBeNull();
  });

  it("[DR-3] 지출결의 증빙에 있는 같은 파일은 통과하고, 다른 차수 · 같은 차수 승인 증빙에 있으면 번호 없는 문구로 막힌다", async () => {
    const fx = await setupExpenseProject();
    const draft = (await createExpenseFromLines(fx.pm, { lineIds: [fx.lines.withVendor] })).created[0]?.expenseId ?? "";
    const shared = sha();
    await attachEvidence(fx.pm, draft, createMemoryStorage(), { sha256: shared });
    const first = await upload(fx.pm, "quote_revision", fx.revisionId, createMemoryStorage(), { sha256: shared });
    expect(first.id).toEqual(expect.any(String));

    const second = await addApprovedRevision(fx, [{ itemName: "추가 줄", vendorId: null, execution: { currency: "KRW", amount: 1_000_000, fxRate: 1 } }]);
    const elsewhere = await caught(upload(fx.pm, "quote_revision", second.revisionId, createMemoryStorage(), { sha256: shared }));
    expect(elsewhere).toBeInstanceOf(EvidenceCheckError);
    expect(elsewhere.message).toBe(EVIDENCE_DUPLICATE_HIDDEN);
    const same = await caught(upload(fx.pm, "quote_revision", fx.revisionId, createMemoryStorage(), { sha256: shared }));
    expect(same.message).toBe(EVIDENCE_DUPLICATE_SAME_OWNER);
  });

  it("마지막 파일 삭제는 확인 단계 없이 removeEvidence 한 번으로 끝난다", async () => {
    const fx = await setupExpenseProject();
    const file = await upload(fx.pm, "quote_revision", fx.revisionId);

    await removeEvidence(fx.pm, { fileId: file.id });

    expect(await listEvidence(fx.pm, { ownerKind: "quote_revision", ownerId: fx.revisionId })).toEqual([]);
    expect((await summaryOf(fx.pm, fx)).approvalEvidenceCount).toBe(0);
  });

  it("[E-46] 멱등 갈래 — 읽기 권리 잃으면 거부: 응답에 파일 DTO가 없고 파일 행 수가 그대로다", async () => {
    const pm = await makeViewer(PM_MENUS, ["project.value", "quote.amount"]);
    const project = await approvedProjectOf(pm);
    const storage = createMemoryStorage();
    const declared = { size: 212_000, contentType: "application/pdf", sha256: sha(), name: "메일.pdf" };
    const intent = await requestEvidenceUpload(pm, { ownerKind: "quote_revision", ownerId: project.revisionId, ...declared }, { storage });
    storage.put(intent.url, { size: declared.size, contentType: declared.contentType, sha256: declared.sha256 });
    const first = await completeEvidenceUpload(pm, { intentId: intent.intentId }, { storage });
    expect(first.id).toEqual(expect.any(String));
    const before = (await fileRowsOf("quote_revision", project.revisionId)).length;

    await upsertVisibility(SYSTEM_VIEWER, { roleId: pm.roleId, infoItem: "quote.amount", visible: false });

    const refused = await caught(completeEvidenceUpload(pm, { intentId: intent.intentId }, { storage }));
    expect(refused).toBeInstanceOf(EvidenceUploadRefusedError);
    expect((await fileRowsOf("quote_revision", project.revisionId)).length).toBe(before);
  });
});

describe("F10 되살리기 — restoreEvidence", () => {
  it("삭제 → 되살리기: 살아 있는 파일 1 · 로그 한 줄 · 지출결의 version 불변, 이미 살아 있는 파일은 그대로(로그 증가 없음)", async () => {
    const fx = await setupExpenseProject();
    const file = await upload(fx.pm, "quote_revision", fx.revisionId);
    await removeEvidence(fx.pm, { fileId: file.id });
    expect(await listEvidence(fx.pm, { ownerKind: "quote_revision", ownerId: fx.revisionId })).toEqual([]);

    await restoreEvidence(fx.pm, { fileId: file.id });
    expect(await listEvidence(fx.pm, { ownerKind: "quote_revision", ownerId: fx.revisionId })).toHaveLength(1);
    expect(await logCount("evidence_restore")).toBe(1);
    expect((await summaryOf(fx.pm, fx)).approvalEvidenceCount).toBe(1);

    const rowsBefore = (await fileRowsOf("quote_revision", fx.revisionId)).length;
    await restoreEvidence(fx.pm, { fileId: file.id });
    expect(await logCount("evidence_restore")).toBe(1);
    expect((await fileRowsOf("quote_revision", fx.revisionId)).length).toBe(rowsBefore);
  });

  it("그사이 같은 파일이 같은 차수에 다시 붙었으면 되살리지 않는다(번호 없는 중복 문구) — 조회가 아니라 조건 UPDATE가 판정한다", async () => {
    const fx = await setupExpenseProject();
    const shared = sha();
    const file = await upload(fx.pm, "quote_revision", fx.revisionId, createMemoryStorage(), { sha256: shared });
    await removeEvidence(fx.pm, { fileId: file.id });
    await upload(fx.pm, "quote_revision", fx.revisionId, createMemoryStorage(), { sha256: shared });

    const refused = await caught(restoreEvidence(fx.pm, { fileId: file.id }));
    expect(refused).toBeInstanceOf(EvidenceCheckError);
    expect(refused.message).toBe(EVIDENCE_DUPLICATE_HIDDEN);
    expect(await listEvidence(fx.pm, { ownerKind: "quote_revision", ownerId: fx.revisionId })).toHaveLength(1);
    expect(await logCount("evidence_restore")).toBe(0);
  });

  it("expense 주인 파일은 되살리지 않는다(결재 문서의 증빙 이력)", async () => {
    const fx = await setupExpenseProject();
    const draft = (await createExpenseFromLines(fx.pm, { lineIds: [fx.lines.withVendor] })).created[0]?.expenseId ?? "";
    const file = await attachEvidence(fx.pm, draft);
    await removeEvidence(fx.pm, { fileId: file.id });

    await expect(restoreEvidence(fx.pm, { fileId: file.id })).rejects.toBeInstanceOf(ExpenseNotFoundError);
    expect((await fileRowsOf("expense", draft)).filter((row) => row.removedAt === null)).toHaveLength(0);
  });

  it("[C4 · X-2] 삭제 · 되살리기도 지출결의 version · 인스턴스 version · 확인 기록을 건드리지 않는다", async () => {
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

    const file = await upload(fx.pm, "quote_revision", fx.revisionId);
    await removeEvidence(fx.pm, { fileId: file.id });
    await restoreEvidence(fx.pm, { fileId: file.id });

    expect(await snapshot()).toEqual(before);
  });

  it("[drift ⑸] 되돌리기 — 카드 전표에 붙은 같은 영수증은 되살리지 않는다(묶음 안), 묶음 밖 종류에 붙은 같은 파일은 되살린다", async () => {
    const fx = await setupExpenseProject();
    const draft = (await createExpenseFromLines(fx.pm, { lineIds: [fx.lines.withVendor] })).created[0]?.expenseId ?? "";
    const takenSha = sha();
    const otherSha = sha();
    const ownSha = sha();
    await attachEvidence(fx.pm, draft, createMemoryStorage(), { sha256: takenSha });
    await attachEvidence(fx.pm, draft, createMemoryStorage(), { sha256: otherSha });
    await attachEvidence(fx.pm, draft, createMemoryStorage(), { sha256: ownSha });
    const [draftRow] = await db.select({ version: expenses.version }).from(expenses).where(eq(expenses.id, draft));
    await deleteExpenseDraft(fx.pm, { expenseId: draft, expectedVersion: draftRow?.version ?? 1 });
    const direct = (sha256: string, ownerKind: string) =>
      db.transaction((tx) =>
        insertFile(fx.pm, { id: randomUUID(), ownerKind, ownerId: randomUUID(), objectKey: `evidence/${randomUUID()}`, sha256, sizeBytes: 1000, contentType: "image/jpeg", originalName: "x.jpg", uploadedBy: fx.pm.id }, tx),
      );
    // 카드 전표(corp_card_usage)는 지출결의와 한 중복 묶음, 차수 승인 증빙은 묶음 밖이다.
    await direct(takenSha, "corp_card_usage");
    await direct(otherSha, "quote_revision");

    await restoreExpenseDraft(fx.pm, { expenseId: draft });

    const alive = await db.select({ sha256: files.sha256 }).from(files).where(and(eq(files.ownerKind, "expense"), eq(files.ownerId, draft), isNull(files.removedAt)));
    expect(alive.map((row) => row.sha256).sort()).toEqual([otherSha, ownSha].sort());
  });
});

// ---- Task 3 · D-60 리저브 줄 증빙 ----

const PNL_WRITE = [
  { menu: "pnl", action: "view" as const },
  { menu: "pnl", action: "write" as const },
];
const PNL_VIEW = [{ menu: "pnl", action: "view" as const }];

function reserveRow(clientId: string, entryDate: string, direction: ReserveWriteRow["direction"], amount: number): ReserveWriteRow {
  return { id: randomUUID(), isNew: true, clientId, entryDate, direction, amount: { currency: "KRW", amount, fxRate: 1 } };
}

// 리저브 쓰기 권리자(pnl 쓰기 + reserve.amount · 선택지 vendor.value · 증빙 파일 DTO expense.value — 05 증빙 DTO 칸 그대로) · 입금 줄 하나.
async function reserveFixture() {
  const writer = await makeViewer(PNL_WRITE, ["reserve.amount", "vendor.value", "expense.value"]);
  const vendor = await insertVendor(SYSTEM_VIEWER, { name: `리저브-${randomUUID()}`, normalizedName: `리저브-${randomUUID()}` });
  const row = reserveRow(vendor.id, "2026-03-01", "deposit", 1_000_000);
  await saveReserves(writer, { rows: [row] });
  return { writer, clientId: vendor.id, entryId: row.id };
}

async function reserveListRow(viewer: Viewer, entryId: string) {
  const list = await listReserves(viewer, { page: 1 });
  return list.rows.find((candidate) => candidate.id === entryId);
}

describe("D-60 리저브 줄 증빙 — 권리 · 보관 · 노출", () => {
  it("쓰기 권리자: 올리기 → 삭제 → 되살리기, 대장 개수가 따라가고 금액 · 잔액 · 줄 version은 그대로다", async () => {
    const { writer, entryId } = await reserveFixture();
    const before = await reserveListRow(writer, entryId);
    expect(before).toMatchObject({ evidenceCount: 0, evidenceWritable: true });

    const file = await upload(writer, "reserve_entry", entryId, createMemoryStorage(), { name: "세금계산서.pdf" });
    expect((await reserveListRow(writer, entryId))?.evidenceCount).toBe(1);
    await removeEvidence(writer, { fileId: file.id });
    expect((await reserveListRow(writer, entryId))?.evidenceCount).toBe(0);
    await restoreEvidence(writer, { fileId: file.id });

    const after = await reserveListRow(writer, entryId);
    expect(after?.evidenceCount).toBe(1);
    expect(after).toMatchObject({ version: before?.version, amount: before?.amount, balanceKrw: before?.balanceKrw });
  });

  it("보관된 줄: 파일은 읽히지만 올리기 · 지우기 · 되살리기는 거부되고, 줄을 복원하면 파일 그대로 다시 쓸 수 있다", async () => {
    const { writer, entryId } = await reserveFixture();
    const kept = await upload(writer, "reserve_entry", entryId);
    const removed = await upload(writer, "reserve_entry", entryId);
    await removeEvidence(writer, { fileId: removed.id });
    const [stored] = await db.select({ version: reserveEntries.version }).from(reserveEntries).where(eq(reserveEntries.id, entryId));
    await saveReserves(writer, { rows: [], archived: [{ id: entryId, version: stored?.version ?? 1 }] });

    expect((await listEvidence(writer, { ownerKind: "reserve_entry", ownerId: entryId })).map((file) => file.id)).toEqual([kept.id]);
    const owned = await getOwnedEvidence(writer, { ownerKind: "reserve_entry", ownerId: entryId });
    expect(owned.files).toHaveLength(1);
    expect(owned.actions.canAdd).toBe(false);
    expect(owned.actions.deletableFileIds).toEqual([]);
    await expect(requestEvidenceUpload(writer, { ownerKind: "reserve_entry", ownerId: entryId, size: 10, contentType: "application/pdf", sha256: sha(), name: "a.pdf" })).rejects.toThrow("리저브 기록 권한 없음");
    await expect(removeEvidence(writer, { fileId: kept.id })).rejects.toThrow("리저브 기록 권한 없음");
    await expect(restoreEvidence(writer, { fileId: removed.id })).rejects.toThrow("리저브 기록 권한 없음");

    await restoreReserve(writer, entryId);

    expect((await getOwnedEvidence(writer, { ownerKind: "reserve_entry", ownerId: entryId })).actions.canAdd).toBe(true);
    expect((await reserveListRow(writer, entryId))?.evidenceCount).toBe(1);
    const again = await upload(writer, "reserve_entry", entryId);
    expect(again.id).toEqual(expect.any(String));
  });

  it("[T-06-80] pnl 보기만 있는 계급은 읽기만 된다 — 직접 호출은 거부 경고가 한 번, 오류 문구 · 로그 객체에 금액 키가 없다", async () => {
    const { writer, entryId } = await reserveFixture();
    const file = await upload(writer, "reserve_entry", entryId);
    const reader = await makeViewer(PNL_VIEW, ["reserve.amount", "expense.value"]);

    expect((await listEvidence(reader, { ownerKind: "reserve_entry", ownerId: entryId })).map((candidate) => candidate.id)).toEqual([file.id]);
    expect(await reserveListRow(reader, entryId)).toMatchObject({ evidenceCount: 1, evidenceWritable: false });
    const owned = await getOwnedEvidence(reader, { ownerKind: "reserve_entry", ownerId: entryId });
    expect(owned.actions.canAdd).toBe(false);
    const viewed = await createEvidenceViewUrl(reader, { fileId: file.id });
    expect(typeof viewed?.url).toBe("string");

    const warn = vi.spyOn(log, "warn");
    try {
      for (const run of [
        () => requestEvidenceUpload(reader, { ownerKind: "reserve_entry", ownerId: entryId, size: 10, contentType: "application/pdf", sha256: sha(), name: "a.pdf" }),
        () => removeEvidence(reader, { fileId: file.id }),
      ]) {
        warn.mockClear();
        const refused = await caught(run());
        expect(refused.message).toBe("리저브 기록 권한 없음");
        expect(refused.message).not.toMatch(/\d/);
        const denied = warn.mock.calls.filter(([event]) => event === "write.denied");
        expect(denied).toHaveLength(1);
        const fields = denied[0]?.[1] as Record<string, unknown>;
        expect(fields.rule).toBe("reserve.forbidden");
        expect(Object.keys(fields).filter((key) => /amount|balance|krw|note/i.test(key))).toEqual([]);
      }
    } finally {
      warn.mockRestore();
    }
    expect(await fileRowsOf("reserve_entry", entryId)).toHaveLength(1);
  });

  it("[T-06-79] reserve.amount 노출이 없는 계급은 대장 행도 펼침 읽기도 보기 주소도 비어 있다", async () => {
    const { writer, entryId } = await reserveFixture();
    const file = await upload(writer, "reserve_entry", entryId);
    const blind = await makeViewer(PNL_WRITE, ["project.value"]);

    expect(await reserveListRow(blind, entryId)).toBeUndefined();
    const owned = await getOwnedEvidence(blind, { ownerKind: "reserve_entry", ownerId: entryId });
    expect(owned.files).toEqual([]);
    expect(owned.actions.canAdd).toBe(false);
    expect(await listEvidence(blind, { ownerKind: "reserve_entry", ownerId: entryId })).toEqual([]);
    expect(await createEvidenceViewUrl(blind, { fileId: file.id })).toBeNull();
  });

  it("[E-46] 보관 뒤 완료 재시도 = 같은 파일 · 새 행 0", async () => {
    const { writer, entryId } = await reserveFixture();
    const storage = createMemoryStorage();
    const declared = { size: 212_000, contentType: "application/pdf", sha256: sha(), name: "세금계산서.pdf" };
    const intent = await requestEvidenceUpload(writer, { ownerKind: "reserve_entry", ownerId: entryId, ...declared }, { storage });
    storage.put(intent.url, { size: declared.size, contentType: declared.contentType, sha256: declared.sha256 });
    const first = await completeEvidenceUpload(writer, { intentId: intent.intentId }, { storage });
    const [stored] = await db.select({ version: reserveEntries.version }).from(reserveEntries).where(eq(reserveEntries.id, entryId));
    await saveReserves(writer, { rows: [], archived: [{ id: entryId, version: stored?.version ?? 1 }] });
    const before = (await fileRowsOf("reserve_entry", entryId)).length;

    const retried = await completeEvidenceUpload(writer, { intentId: intent.intentId }, { storage });

    expect(retried.id).toBe(first.id);
    expect((await fileRowsOf("reserve_entry", entryId)).length).toBe(before);
  });

  it("[DR-3] 같은 파일을 다른 리저브 줄에 올리면 번호 없는 문구로 막히고, 지출결의 증빙에만 있으면 통과한다", async () => {
    const { writer, clientId, entryId } = await reserveFixture();
    const other = reserveRow(clientId, "2026-03-02", "deposit", 500_000);
    await saveReserves(writer, { rows: [other] });
    const fx = await setupExpenseProject();
    const draft = (await createExpenseFromLines(fx.pm, { lineIds: [fx.lines.withVendor] })).created[0]?.expenseId ?? "";
    const shared = sha();
    await attachEvidence(fx.pm, draft, createMemoryStorage(), { sha256: shared });

    const first = await upload(writer, "reserve_entry", entryId, createMemoryStorage(), { sha256: shared });
    expect(first.id).toEqual(expect.any(String));

    const elsewhere = await caught(upload(writer, "reserve_entry", other.id, createMemoryStorage(), { sha256: shared }));
    expect(elsewhere).toBeInstanceOf(EvidenceCheckError);
    expect(elsewhere.message).toBe(EVIDENCE_DUPLICATE_HIDDEN);
    const same = await caught(upload(writer, "reserve_entry", entryId, createMemoryStorage(), { sha256: shared }));
    expect(same.message).toBe(EVIDENCE_DUPLICATE_SAME_OWNER);
  });
});
