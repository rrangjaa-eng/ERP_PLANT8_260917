import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { actionLog, files, projectDocuments, projects, quoteLines, quoteRevisions, teams } from "@/db/schema";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { createAccount } from "@/domain/auth/accounts";
import { insertVendor } from "@/repositories/vendors";
import { insertRole } from "@/repositories/roles";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { approvalBasis } from "@/repositories/quote-revisions";
import { hasProjectDocument } from "@/repositories/project-documents";
import { createProject } from "@/domain/projects";
import { getCurrentQuoteRevision } from "@/domain/quotes/lines";
import { setCustomerApproval, listRevisionSummaries } from "@/domain/quotes/revisions";
import { firstSelectableSubcategory } from "@/test/support/quote-subcategory";

// 07-18 Task 3 (W6 · S4) — 고객 승인 표시가 근거(발주서 · 이메일 · 구두)와 메모를 받는다. 새 승인은 근거 필수, 취소는 둘 다 비우고,
// 옛 승인(근거 NULL)은 그대로 읽힌다. 발주서 서류 유무는 repositories/project-documents.ts 한 읽기가 판정한다.

const NOW = () => new Date("2026-09-20T03:00:00.000Z");

async function makePm(): Promise<Viewer> {
  const role = await insertRole(SYSTEM_VIEWER, { id: `role-${randomUUID()}`, name: `승인 근거 계급-${randomUUID()}`, viewScope: "company" });
  const { userId } = await createAccount(SYSTEM_VIEWER, { email: `basis-${randomUUID()}@example.test`, name: "근거 테스트 PM", roleId: role.id });
  for (const action of ["view", "write"] as const) await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "projects", action, allowed: true });
  for (const infoItem of ["project.value", "quote.amount"]) await upsertVisibility(SYSTEM_VIEWER, { roleId: role.id, infoItem, visible: true });
  return { id: userId, roleId: role.id };
}

async function setup() {
  const pm = await makePm();
  const client = await insertVendor(SYSTEM_VIEWER, { name: `거래처-${randomUUID()}`, normalizedName: `거래처-${randomUUID()}` });
  const [team] = await db.select().from(teams).limit(1);
  if (!team) throw new Error("시드된 팀이 없습니다");
  await firstSelectableSubcategory();
  const project = await createProject(SYSTEM_VIEWER, { clientId: client.id, teamId: team.id, pmUserId: pm.id, name: `근거-${randomUUID()}` });
  const revision = await getCurrentQuoteRevision(SYSTEM_VIEWER, project.id);
  if (!revision) throw new Error("1차 차수가 없습니다");
  await db.insert(quoteLines).values({
    revisionId: revision.id,
    subcategory: "기타",
    itemName: `항목-${randomUUID()}`,
    unitPriceAmountKrw: 100_000,
    executionAmountKrw: 40_000,
    quoteAmountKrw: 100_000,
    profitKrw: 60_000,
  });
  await db.update(projects).set({ status: "in_progress" }).where(eq(projects.id, project.id));
  return { projectId: project.id, revisionId: revision.id, pm };
}

async function seen(revisionId: string) {
  const basis = await approvalBasis(SYSTEM_VIEWER, revisionId);
  return { seenTotalKrw: basis.totalKrw, contentToken: basis.contentToken };
}

async function storedOf(revisionId: string) {
  const [row] = await db.select().from(quoteRevisions).where(eq(quoteRevisions.id, revisionId));
  return { at: row?.customerApprovedAt ?? null, basis: row?.customerApprovalBasis ?? null, memo: row?.customerApprovalMemo ?? null };
}

describe("setCustomerApproval 근거 · 메모 (07-18 Task 3)", () => {
  it("근거 없이 새 승인을 켜면 「근거 선택」으로 거부하고 아무것도 저장하지 않는다", async () => {
    const s = await setup();
    const input = { approvedOn: "2026-09-19", ...(await seen(s.revisionId)) };
    // 근거 없는 입력 — 타입이 막는 호출이라 단언으로 돌린다(화면 밖 호출을 흉내).
    await expect(setCustomerApproval(s.pm, s.revisionId, input as never, { now: NOW })).rejects.toThrow("근거 선택");
    expect(await storedOf(s.revisionId)).toEqual({ at: null, basis: null, memo: null });
  });

  it("발주서 근거 + 메모를 저장하고 다시 읽으면 근거 · 메모가 그대로이며 행동 로그 상세에도 근거가 남는다", async () => {
    const s = await setup();
    const input = { approvedOn: "2026-09-19", approvalBasis: "purchase_order" as const, approvalMemo: "  PO 메일 첨부 확인  ", ...(await seen(s.revisionId)) };
    await setCustomerApproval(s.pm, s.revisionId, input, { now: NOW });
    const stored = await storedOf(s.revisionId);
    expect(stored.basis).toBe("purchase_order");
    expect(stored.memo).toBe("PO 메일 첨부 확인");
    const summaries = await listRevisionSummaries(s.pm, s.projectId);
    const current = summaries.find((row) => row.revisionId === s.revisionId);
    expect(current?.approvalBasis).toBe("purchase_order");
    expect(current?.approvalMemo).toBe("PO 메일 첨부 확인");
    const logs = await db.select().from(actionLog).where(eq(actionLog.entityId, s.revisionId));
    expect(logs.map((row) => row.detail)).toEqual([{ kind: "customer_approval", revisionSeq: 1, approvedOn: "2026-09-19", approvalBasis: "purchase_order" }]);
  });

  it("메모를 비우면 NULL이고, 501자 메모는 거부한다", async () => {
    const s = await setup();
    const base = { approvedOn: "2026-09-19", approvalBasis: "email" as const, ...(await seen(s.revisionId)) };
    await expect(setCustomerApproval(s.pm, s.revisionId, { ...base, approvalMemo: "가".repeat(501) }, { now: NOW })).rejects.toThrow("메모 500자 이하");
    await setCustomerApproval(s.pm, s.revisionId, { ...base, approvalMemo: "   " }, { now: NOW });
    expect(await storedOf(s.revisionId)).toMatchObject({ basis: "email", memo: null });
  });

  it("승인을 취소하면 근거 · 메모도 비운다", async () => {
    const s = await setup();
    await setCustomerApproval(s.pm, s.revisionId, { approvedOn: "2026-09-19", approvalBasis: "verbal", approvalMemo: "구두 확인", ...(await seen(s.revisionId)) }, { now: NOW });
    await setCustomerApproval(s.pm, s.revisionId, null, { now: NOW });
    expect(await storedOf(s.revisionId)).toEqual({ at: null, basis: null, memo: null });
  });

  it("옛 승인(근거 NULL)은 읽기에서 근거 · 메모가 null로 그대로 읽힌다", async () => {
    const s = await setup();
    await db.update(quoteRevisions).set({ customerApprovedAt: new Date("2026-09-18T15:00:00.000Z"), customerApprovedBy: s.pm.id }).where(eq(quoteRevisions.id, s.revisionId));
    const summaries = await listRevisionSummaries(s.pm, s.projectId);
    const current = summaries.find((row) => row.revisionId === s.revisionId);
    expect(current?.approvedOn).toBe("2026-09-19");
    expect(current?.approvalBasis).toBeNull();
    expect(current?.approvalMemo).toBeNull();
  });
});

describe("hasProjectDocument (07-18 Task 3)", () => {
  it("서류 행이 없으면 거짓, 발주서가 있으면 참, 지운 서류와 다른 종류는 세지 않는다", async () => {
    const s = await setup();
    expect(await hasProjectDocument(s.pm, s.projectId, "purchase_order")).toBe(false);
    await db.insert(projectDocuments).values({ projectId: s.projectId, kind: "other", createdBy: s.pm.id });
    expect(await hasProjectDocument(s.pm, s.projectId, "purchase_order")).toBe(false);
    await db.insert(projectDocuments).values({ projectId: s.projectId, kind: "purchase_order", createdBy: s.pm.id, removedAt: new Date(), removedBy: s.pm.id });
    expect(await hasProjectDocument(s.pm, s.projectId, "purchase_order")).toBe(false);
    // 07-22(W3): 파일 없는 서류 행(올리기를 끝내지 않은 시도)은 세지 않는다 — 살아 있는 파일이 붙어야 참.
    const [doc] = await db.insert(projectDocuments).values({ projectId: s.projectId, kind: "purchase_order", createdBy: s.pm.id }).returning();
    if (!doc) throw new Error("서류 행을 넣지 못했습니다");
    expect(await hasProjectDocument(s.pm, s.projectId, "purchase_order")).toBe(false);
    const fileId = randomUUID();
    await db.insert(files).values({
      id: fileId,
      ownerKind: "project_document",
      ownerId: doc.id,
      objectKey: `evidence/${fileId}`,
      sha256: "0".repeat(64),
      sizeBytes: 120_000,
      contentType: "application/pdf",
      originalName: "발주서.pdf",
      uploadedBy: s.pm.id,
    });
    expect(await hasProjectDocument(s.pm, s.projectId, "purchase_order")).toBe(true);
  });
});
