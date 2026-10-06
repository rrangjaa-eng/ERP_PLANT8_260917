import { randomUUID } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { expenses, files } from "@/db/schema";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { approveDocument } from "@/domain/approvals";
import { createExpenseFromLines } from "@/domain/expenses";
import { voidEvidence } from "@/domain/evidence";
import { EVIDENCE_REQUIRED } from "@/domain/settings/keys";
import { insertRole } from "@/repositories/roles";
import { upsertPermission } from "@/repositories/permissions";
import { upsertSimpleValue } from "@/repositories/settings";
import { makePerson } from "../approvals-fixtures";
import { makeEvidenceManager, submitReadyDraft, type ExpenseFixture } from "./expenses";

// 06-03 지급 통합 픽스처 — 결재 통과 지출결의(증빙 있음 · 증빙 0)와 지급 권한자 계정을 도메인 함수로 만든다(SQL 직접 삽입 없음).
// 05 제출 게이트 ⑧(증빙 0이면 제출 막힘) 때문에 증빙 0 결재 통과 문서는 제출만으로 못 만든다 — 증빙을 붙여 제출 · 승인한 뒤
// 05 voidEvidence로 무효 처리한다(A#19). 06-04 · 06-06 · 06-10 · 06-15가 쓴다.

export type ApprovedExpense = { expenseId: string; instanceId: string; number: string; version: number };

// 테스트 계급 「경영관리」 — 전사 업무 범위 · 지출결의 보기 + 지급 처리(expenses.payments) 쓰기. 팀 발령 없음.
export async function makePaymentManager(name = "경영관리"): Promise<Viewer> {
  const role = await insertRole(SYSTEM_VIEWER, { id: `role-${randomUUID()}`, name: `지급-${randomUUID().slice(0, 8)}`, workScope: "company" });
  await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "expenses", action: "view", allowed: true });
  await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "expenses.payments", action: "write", allowed: true });
  return makePerson(name, role.id, null);
}

// 증빙 필수 설정 — 증빙 0 문서를 지급 대상으로 쓰는 테스트가 끈다(06-04 증빙 게이트 · 06-06 확인 게이트가 붙어도 P4가 유지되게).
export async function setEvidenceRequired(value: boolean): Promise<void> {
  await upsertSimpleValue(SYSTEM_VIEWER, EVIDENCE_REQUIRED.key, value, null);
}

async function versionOf(expenseId: string): Promise<number> {
  const [row] = await db.select({ version: expenses.version }).from(expenses).where(eq(expenses.id, expenseId));
  if (!row) throw new Error("지출결의 없음");
  return row.version;
}

// 증빙 한 장 붙여 제출 → 팀장 · 대표 승인(approved). 줄은 기본 「무대 제작」(부가세 규칙 세금계산서).
export async function approvedExpenseWithEvidence(fx: ExpenseFixture, lineId: string = fx.lines.withVendor): Promise<ApprovedExpense> {
  const created = await createExpenseFromLines(fx.pm, { lineIds: [lineId] });
  const expenseId = created.created[0]?.expenseId;
  if (!expenseId) throw new Error("지출결의를 만들지 못했다");
  const submitted = await submitReadyDraft(fx.pm, expenseId);
  if (submitted.kind !== "submitted") throw new Error("제출 안 됨");
  const first = await approveDocument(fx.lead, { instanceId: submitted.instanceId, expectedVersion: submitted.version });
  const final = await approveDocument(fx.ceo, { instanceId: submitted.instanceId, expectedVersion: first.version });
  if (final.status !== "approved") throw new Error(`결재 통과 안 됨: ${final.status}`);
  return { expenseId, instanceId: submitted.instanceId, number: submitted.number, version: await versionOf(expenseId) };
}

// 결재 통과 뒤 살아 있는 증빙을 전부 무효 처리한 문서(증빙 0).
export async function approvedExpenseWithoutEvidence(fx: ExpenseFixture, lineId: string = fx.lines.withVendor): Promise<ApprovedExpense> {
  const approved = await approvedExpenseWithEvidence(fx, lineId);
  const voider = await makeEvidenceManager("증빙무효", { attach: false, void: true });
  const alive = await db
    .select({ id: files.id })
    .from(files)
    .where(and(eq(files.ownerKind, "expense"), eq(files.ownerId, approved.expenseId), isNull(files.removedAt), isNull(files.voidedAt)));
  for (const file of alive) await voidEvidence(voider, { fileId: file.id, reason: "다른 건 영수증" });
  return { ...approved, version: await versionOf(approved.expenseId) };
}
