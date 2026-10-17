import { randomBytes, randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { approvalInstances, evidenceImportBatches, evidenceRecordLinks, evidenceRecords, expenses } from "@/db/schema";
import { createAccount } from "@/domain/auth/accounts";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { registerEvidenceFile, type EvidenceImportSuccess, type RegisterEvidenceDeps } from "@/domain/evidence-import";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { seoulToday } from "@/lib/dates";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { insertRole } from "@/repositories/roles";
import { insertMembership } from "@/repositories/team-memberships";
import { rejectDocument } from "@/domain/approvals";
import { createExpenseFromLines, submitExpense } from "@/domain/expenses";
import { attachEvidence, makeEvidenceManager, type ExpenseFixture } from "./expenses";

// 06.1-04: 증빙 등록 권한 계급 · 등록 도우미 — 06.1-05 · 06 · 09 · 11이 다시 쓴다.
// 계급은 새로 만든다 — 시드 계급의 권한을 바꾸면 누수 스캔 · 권한표 단언이 흔들린다(시드는 어느 계급에도 등록을 켜지 않는다).
export async function createIntakeViewer(): Promise<Viewer> {
  const roleId = `role-evidence-intake-${randomUUID().slice(0, 8)}`;
  await insertRole(SYSTEM_VIEWER, { id: roleId, name: `증빙 등록 ${roleId.slice(-8)}` });
  await upsertPermission(SYSTEM_VIEWER, { roleId, menu: "evidence.intake", action: "write", allowed: true });
  await upsertPermission(SYSTEM_VIEWER, { roleId, menu: "evidence", action: "view", allowed: true });
  await upsertVisibility(SYSTEM_VIEWER, { roleId, infoItem: "evidence.value", visible: true });
  await upsertVisibility(SYSTEM_VIEWER, { roleId, infoItem: "evidence.amount", visible: true });
  const { userId } = await createAccount(SYSTEM_VIEWER, { email: `intake-${randomUUID()}@example.test`, name: "증빙 등록자", roleId });
  return { id: userId, roleId };
}

// 픽스처 바이트 하나를 등록한다. 거절이면 던진다 — 거절 자체를 보는 테스트는 registerEvidenceFile을 바로 부른다.
export async function registerFixtureFile(
  viewer: Viewer,
  bytes: Uint8Array,
  name = "증빙.xls",
  deps?: Partial<RegisterEvidenceDeps>,
): Promise<EvidenceImportSuccess> {
  const result = await registerEvidenceFile(viewer, { bytes, fileName: name }, deps);
  if (result.refused) throw new Error(`등록 거절 — ${result.refused.headline}`);
  return result;
}

// 06.1-05: 행 범위 · 필터 실측용 — 화면 · 도메인 경로가 아직 없는 상태(붙임 · 보관 · 종류 바꾸기)를 표에 직접 만든다. 테스트 전용이다.

/** 공개 범위를 저장한 줄로 만든다 — `visibility_saved_at`도 찍는다(C1 — 저장한 줄은 다시 제안되지 않는다). */
export async function setRecordVisibilityFixture(
  id: string,
  target: { visibility: "private" } | { visibility: "team"; teamId: string } | { visibility: "division"; orgUnitId: string },
): Promise<void> {
  await db
    .update(evidenceRecords)
    .set({
      visibility: target.visibility,
      visibleTeamId: target.visibility === "team" ? target.teamId : null,
      visibleOrgUnitId: target.visibility === "division" ? target.orgUnitId : null,
      visibilitySavedAt: sql`now()`,
    })
    .where(eq(evidenceRecords.id, id));
}

/** 살아 있는 붙임 한 줄(`detached_at IS NULL`) — 06.1-06 전이라 붙이기 경로가 없다. 문서 id는 아무 값(외래 키 없음). */
export async function insertLiveLinkFixture(recordId: string, attachedBy: string): Promise<void> {
  await db.insert(evidenceRecordLinks).values({ evidenceRecordId: recordId, ownerKind: "expense", ownerId: randomUUID(), attachMode: "registrar", attachedBy });
}

/** 보관한 줄(C2 — `archived_at` · `archived_by` 짝). */
export async function setRecordArchivedFixture(id: string, archivedBy: string): Promise<void> {
  await db.update(evidenceRecords).set({ archivedAt: sql`now()`, archivedBy }).where(eq(evidenceRecords.id, id));
}

/** 줄의 증빙 종류를 바꾼다 — G15(「올린 사람 · 경영관리만」 종류) 줄을 만든다. */
export async function setRecordTypeFixture(id: string, evidenceType: string): Promise<void> {
  await db.update(evidenceRecords).set({ evidenceType }).where(eq(evidenceRecords.id, id));
}

/** 기획 PM(시드 계급 role-pm — 06.1-01 시드가 `evidence` 보기를 준다). 팀을 주면 그 날짜(기본 오늘)부터 그 팀 발령. */
export async function createPmInTeam(teamId: string | null, effectiveFrom?: string): Promise<Viewer> {
  const { userId } = await createAccount(SYSTEM_VIEWER, { email: `evidence-pm-${randomUUID()}@example.test`, name: "증빙 PM", roleId: DEFAULT_ROLE_ID });
  if (teamId !== null) await insertMembership(SYSTEM_VIEWER, { userId, teamId, effectiveFrom: effectiveFrom ?? seoulToday() });
  return { id: userId, roleId: DEFAULT_ROLE_ID };
}

// ── 06.1-06 붙이기 픽스처 ──────────────────────────────────────────────────────────────────────────────────

/**
 * 경영관리(05 makeEvidenceManager 감싸기 — 전사 범위 · 지출결의 보기 · 붙이기 · 무효 키) + 증빙 등록(evidence.intake 쓰기) + 증빙 · 지출결의
 * 정보 항목. `payments`면 지급 처리 쓰기도(카드 R2 — 자동 확인 저장 갈래).
 */
export async function createIntakeManager(name = "경영관리", perms: { attach?: boolean; void?: boolean; payments?: boolean } = {}): Promise<Viewer> {
  const manager = await makeEvidenceManager(name, { attach: perms.attach, void: perms.void });
  const roleId = manager.roleId;
  if (!roleId) throw new Error("계급 없음");
  await upsertPermission(SYSTEM_VIEWER, { roleId, menu: "evidence.intake", action: "write", allowed: true });
  await upsertPermission(SYSTEM_VIEWER, { roleId, menu: "evidence", action: "view", allowed: true });
  if (perms.payments) await upsertPermission(SYSTEM_VIEWER, { roleId, menu: "expenses.payments", action: "write", allowed: true });
  for (const infoItem of ["evidence.value", "evidence.amount", "expense.value", "expense.amount"]) await upsertVisibility(SYSTEM_VIEWER, { roleId, infoItem, visible: true });
  return manager;
}

/** 붙지 않은 증빙 기록 한 줄(등록 묶음과 함께 — 06.1-01 스키마). 합계 = 공급가 + 세액(CHECK). */
export async function insertRecordFixture(
  by: Viewer,
  input: { evidenceType?: string; supplyKrw?: number; vatKrw?: number; businessNoDigits?: string | null; issuedOn?: string; nameOnDocument?: string } = {},
): Promise<string> {
  const [batch] = await db
    .insert(evidenceImportBatches)
    .values({ format: "hometax-tax-invoice", originalName: "매입 세금계산서.xls", fileSha256: randomBytes(32).toString("hex"), rowCount: 1, registeredCount: 1, skippedDuplicateCount: 0, uploadedBy: by.id })
    .returning({ id: evidenceImportBatches.id });
  if (!batch) throw new Error("등록 묶음 없음");
  const supplyKrw = input.supplyKrw ?? 12_400_000;
  const vatKrw = input.vatKrw ?? 0;
  const [record] = await db
    .insert(evidenceRecords)
    .values({
      batchId: batch.id,
      format: "hometax-tax-invoice",
      evidenceType: input.evidenceType ?? "tax_invoice",
      dedupeKey: `test:${randomUUID()}`,
      issuedOn: input.issuedOn ?? "2026-09-20",
      supplyKrw,
      vatKrw,
      totalKrw: supplyKrw + vatKrw,
      businessNoDigits: input.businessNoDigits ?? null,
      nameOnDocument: input.nameOnDocument ?? "스테이지원",
      createdBy: by.id,
    })
    .returning({ id: evidenceRecords.id });
  if (!record) throw new Error("증빙 기록 없음");
  return record.id;
}

/** 붙임 한 줄을 표에 직접(작성자 붙임 · 경합 시험 — 06.1-08 작성자 경로 전). */
export async function insertLinkFixture(input: { recordId: string; ownerKind?: "expense" | "purchase_request" | "corp_card_usage"; ownerId: string; attachMode?: "registrar" | "author"; attachedBy: string }): Promise<string> {
  const [link] = await db
    .insert(evidenceRecordLinks)
    .values({ evidenceRecordId: input.recordId, ownerKind: input.ownerKind ?? "expense", ownerId: input.ownerId, attachMode: input.attachMode ?? "registrar", attachedBy: input.attachedBy })
    .returning({ id: evidenceRecordLinks.id });
  if (!link) throw new Error("붙임 없음");
  return link.id;
}

/** 작성 중(번호 없음) 지출결의 하나. */
export async function createDraftExpenseFixture(fx: ExpenseFixture, lineId: string = fx.lines.withVendor): Promise<string> {
  const created = await createExpenseFromLines(fx.pm, { lineIds: [lineId] });
  const expenseId = created.created[0]?.expenseId;
  if (!expenseId) throw new Error("지출결의를 만들지 못했다");
  return expenseId;
}

async function expenseVersionOf(expenseId: string): Promise<number> {
  const [row] = await db.select({ version: expenses.version }).from(expenses).where(eq(expenses.id, expenseId));
  if (!row) throw new Error("지출결의 없음");
  return row.version;
}

/**
 * 결재 중(번호 있음) 지출결의 — 05 제출 ⑧(증빙 있어야 올라간다) 때문에 기본은 05 파일 한 장을 붙여 올린다. `linkRecordId`를 주면 파일 대신 그 기록을
 * 붙임 행(경영관리 붙임 · 직접 INSERT)으로 붙여 올린다(05 파일 0인 문서 — 떼기 미리 보기 `expected` 갈래).
 */
export async function createInReviewExpenseFixture(
  fx: ExpenseFixture,
  opts: { lineId?: string; linkRecordId?: string; linkedBy?: string } = {},
): Promise<{ expenseId: string; instanceId: string; number: string }> {
  const expenseId = await createDraftExpenseFixture(fx, opts.lineId);
  if (opts.linkRecordId) await insertLinkFixture({ recordId: opts.linkRecordId, ownerId: expenseId, attachedBy: opts.linkedBy ?? fx.pm.id });
  else await attachEvidence(fx.pm, expenseId);
  const submitted = await submitExpense(fx.pm, { expenseId, expectedVersion: await expenseVersionOf(expenseId) });
  if (submitted.kind !== "submitted") throw new Error("제출 안 됨");
  return { expenseId, instanceId: submitted.instanceId, number: submitted.number };
}

/** 번호 있는 반려 지출결의(RP-8 — 05 제출 뒤 05 반려 domain 함수). */
export async function createReturnedExpenseFixture(fx: ExpenseFixture, opts: { lineId?: string; linkRecordId?: string; linkedBy?: string } = {}): Promise<{ expenseId: string; number: string }> {
  const doc = await createInReviewExpenseFixture(fx, opts);
  const [instance] = await db.select({ version: approvalInstances.version }).from(approvalInstances).where(eq(approvalInstances.id, doc.instanceId));
  if (!instance) throw new Error("결재 인스턴스 없음");
  await rejectDocument(fx.lead, { instanceId: doc.instanceId, expectedVersion: instance.version, reason: "공급가 다시" });
  return { expenseId: doc.expenseId, number: doc.number };
}

