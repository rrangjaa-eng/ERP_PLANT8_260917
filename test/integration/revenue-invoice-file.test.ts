import { randomBytes, randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { files, revenueEntries, teams } from "@/db/schema";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { createAccount } from "@/domain/auth/accounts";
import { insertVendor } from "@/repositories/vendors";
import { insertRole } from "@/repositories/roles";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { createProject } from "@/domain/projects";
import { completeEvidenceUpload, getOwnedEvidence, listEvidence, requestEvidenceUpload } from "@/domain/evidence";
import { listInvoiceFiles, REVENUE_INVOICE_KIND } from "@/domain/revenue/invoice-file";
import { createMemoryStorage } from "./fakes/memory-storage";

// 07-22(W7 · SC-20) — 매출 발행 줄의 계산서 파일: 한 자리(교체 = 이전 파일 지움 + 새 파일, 한 트랜잭션) · 쓰기 = projects.revenue 쓰기 ∧ 발행 줄,
// 보기 = 발행 줄을 볼 수 있는 사람.

async function makeRole(opts: { revenueWrite: boolean; infoItems: string[] }): Promise<Viewer> {
  const role = await insertRole(SYSTEM_VIEWER, { id: `role-${randomUUID()}`, name: `계산서-${randomUUID().slice(0, 8)}`, workScope: "company", viewScope: "company" });
  await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "projects", action: "view", allowed: true });
  if (opts.revenueWrite) await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "projects.revenue", action: "write", allowed: true });
  for (const infoItem of opts.infoItems) await upsertVisibility(SYSTEM_VIEWER, { roleId: role.id, infoItem, visible: true });
  const { userId } = await createAccount(SYSTEM_VIEWER, { email: `inv-${randomUUID()}@example.test`, name: "계산서 사람", roleId: role.id });
  return { id: userId, roleId: role.id };
}

// 증빙 파일 DTO(getOwnedEvidence · listEvidence) 칸은 05 그대로 expense.value — 리저브 증빙 시험과 같은 전제.
const ALL_ITEMS = ["project.value", "revenue.issued_amount", "revenue.paid_amount", "expense.value"];

async function setup(): Promise<{ projectId: string; issueId: string; paymentId: string }> {
  const client = await insertVendor(SYSTEM_VIEWER, { name: `거래처-${randomUUID()}`, normalizedName: `거래처-${randomUUID()}` });
  const { userId } = await createAccount(SYSTEM_VIEWER, { email: `pm-${randomUUID()}@example.test`, name: "계산서 PM", roleId: DEFAULT_ROLE_ID });
  const [team] = await db.select().from(teams).limit(1);
  if (!team) throw new Error("시드된 팀이 없습니다");
  const project = await createProject(SYSTEM_VIEWER, { clientId: client.id, teamId: team.id, pmUserId: userId, name: `계산서-${randomUUID().slice(0, 8)}` });
  const base = { projectId: project.id, amountCurrency: "KRW", amountFxRate: "1.0000" };
  const [issue] = await db.insert(revenueEntries).values({ ...base, kind: "issue", entryDate: "2026-09-01", amountAmountKrw: 1_000_000 }).returning();
  const [payment] = await db.insert(revenueEntries).values({ ...base, kind: "payment", entryDate: "2026-09-10", amountAmountKrw: 1_100_000 }).returning();
  if (!issue || !payment) throw new Error("매출 줄을 넣지 못했습니다");
  return { projectId: project.id, issueId: issue.id, paymentId: payment.id };
}

async function attach(viewer: Viewer, entryId: string, name = "계산서.pdf") {
  const storage = createMemoryStorage();
  const declared = { size: 90_000, contentType: "application/pdf", sha256: randomBytes(32).toString("hex"), name };
  const intent = await requestEvidenceUpload(viewer, { ownerKind: REVENUE_INVOICE_KIND, ownerId: entryId, ...declared }, { storage });
  storage.put(intent.url, { size: declared.size, contentType: declared.contentType, sha256: declared.sha256 });
  return completeEvidenceUpload(viewer, { intentId: intent.intentId }, { storage });
}

async function liveFiles(entryId: string) {
  return db
    .select({ id: files.id })
    .from(files)
    .where(and(eq(files.ownerKind, REVENUE_INVOICE_KIND), eq(files.ownerId, entryId), isNull(files.removedAt)));
}

describe("발행 줄 계산서 파일", () => {
  it("쓰기 권한자가 붙이면 줄에 살아 있는 파일 하나 · 다시 붙이면 이전 파일이 빠지고 여전히 하나", async () => {
    const { projectId, issueId } = await setup();
    const finance = await makeRole({ revenueWrite: true, infoItems: ALL_ITEMS });

    const first = await attach(finance, issueId, "계산서-1.pdf");
    expect((await liveFiles(issueId)).map((row) => row.id)).toEqual([first.id]);
    expect(await listInvoiceFiles(finance, projectId)).toEqual({ [issueId]: { fileId: first.id, name: "계산서-1.pdf" } });

    const second = await attach(finance, issueId, "계산서-2.pdf");
    expect((await liveFiles(issueId)).map((row) => row.id)).toEqual([second.id]);
    expect(await listInvoiceFiles(finance, projectId)).toEqual({ [issueId]: { fileId: second.id, name: "계산서-2.pdf" } });

    const owned = await getOwnedEvidence(finance, { ownerKind: REVENUE_INVOICE_KIND, ownerId: issueId });
    expect(owned.files.map((file) => file.id)).toEqual([second.id]);
    expect(owned.actions.canAdd).toBe(true);
  });

  it("입금 줄에는 붙이지 못한다", async () => {
    const { paymentId } = await setup();
    const finance = await makeRole({ revenueWrite: true, infoItems: ALL_ITEMS });
    await expect(attach(finance, paymentId)).rejects.toThrow();
    expect(await liveFiles(paymentId)).toEqual([]);
  });

  it("projects.revenue 쓰기가 없으면 붙이기 거부 · 보기는 된다", async () => {
    const { projectId, issueId } = await setup();
    const finance = await makeRole({ revenueWrite: true, infoItems: ALL_ITEMS });
    const file = await attach(finance, issueId);
    const reader = await makeRole({ revenueWrite: false, infoItems: ALL_ITEMS });

    await expect(attach(reader, issueId)).rejects.toThrow();
    expect((await liveFiles(issueId)).map((row) => row.id)).toEqual([file.id]);
    const owned = await getOwnedEvidence(reader, { ownerKind: REVENUE_INVOICE_KIND, ownerId: issueId });
    expect(owned.files.map((row) => row.id)).toEqual([file.id]);
    expect(owned.actions.canAdd).toBe(false);
    expect(await listInvoiceFiles(reader, projectId)).toEqual({ [issueId]: { fileId: file.id, name: "계산서.pdf" } });
  });

  it("발행 줄을 못 보는 사람에게는 파일 목록 · 링크 재료가 없다", async () => {
    const { projectId, issueId } = await setup();
    const finance = await makeRole({ revenueWrite: true, infoItems: ALL_ITEMS });
    await attach(finance, issueId);
    const blind = await makeRole({ revenueWrite: true, infoItems: ["project.value", "expense.value"] });

    expect(await listEvidence(blind, { ownerKind: REVENUE_INVOICE_KIND, ownerId: issueId })).toEqual([]);
    expect(await listInvoiceFiles(blind, projectId)).toEqual({});
    await expect(attach(blind, issueId)).rejects.toThrow();
  });

  it("보관된 발행 줄에는 붙이지 못한다", async () => {
    const { issueId } = await setup();
    const finance = await makeRole({ revenueWrite: true, infoItems: ALL_ITEMS });
    await db.update(revenueEntries).set({ archivedAt: new Date(), archivedBy: "system" }).where(eq(revenueEntries.id, issueId));
    await expect(attach(finance, issueId)).rejects.toThrow();
  });
});
