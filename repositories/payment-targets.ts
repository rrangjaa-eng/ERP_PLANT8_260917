import { and, asc, desc, eq, inArray, isNull, sql, type SQL } from "drizzle-orm";
import { db } from "@/db/client";
import { approvalInstances, expenseEvidenceReviews, expensePayments, expenses, projects, quoteLines, teams, users, vendors } from "@/db/schema";
import type { Viewer } from "@/domain/viewer";
import type { ExpenseRow } from "@/repositories/expenses";

// 06-15(S1 · AS1): 지급 대상 원천 — 결재 통과 ∧ 살아 있는 지급 없음 ∧ 종결 아님 ∧ 삭제 아님(∧ 문서 팀). 쪽을 자르지 않는다(E-25 —
// 판정 · 증빙 필터 뒤 쪽 자르기는 domain/payments/targets.ts 한 곳). 판정 재료(결재 상태 · 확인 기록 · 기안자 이름)를 한 쿼리로 같이 읽는다.
// 증빙 유무는 여기서 세지 않는다 — domain이 06-03 ownersWithEvidence로 묶음 판정한다(C5).
// 행은 ExpenseRow 칸을 그대로 싣는다 — prepaid도 같은 이름으로 실려 evidenceGateInputs의 lockedDoc 자리로 간다(06-10 · R4-F1).

export type PaymentTargetRow = ExpenseRow & {
  drafterName: string;
  projectName: string | null;
  itemName: string | null;
  teamName: string | null;
  vendorName: string | null;
  approvalStatus: string | null;
  paid: boolean;
  review: { status: string; reviewedAt: Date } | null;
};

// 문서의 팀 = 견적 줄 문서는 프로젝트 팀, 팀 비용은 귀속 팀(repositories/expenses.ts 목록 보임 범위와 같은 식).
const docTeamId = sql`case when ${expenses.projectId} is not null then ${projects.teamId} else ${expenses.attributedTeamId} end`;
const livePayment = sql<boolean>`exists (select 1 from ${expensePayments} where ${expensePayments.expenseId} = ${expenses.id} and ${expensePayments.cancelledAt} is null)`;

async function selectRows(where: SQL | undefined, documentKind: string): Promise<PaymentTargetRow[]> {
  const rows = await db
    .select({
      expense: expenses,
      drafterName: users.name,
      projectName: projects.name,
      itemName: quoteLines.itemName,
      teamName: teams.name,
      vendorName: vendors.name,
      approvalStatus: approvalInstances.status,
      paid: livePayment,
      reviewStatus: expenseEvidenceReviews.status,
      reviewedAt: expenseEvidenceReviews.reviewedAt,
    })
    .from(expenses)
    .innerJoin(users, eq(users.id, expenses.drafterId))
    .leftJoin(projects, eq(projects.id, expenses.projectId))
    .leftJoin(quoteLines, eq(quoteLines.id, expenses.quoteLineId))
    .leftJoin(teams, eq(teams.id, expenses.attributedTeamId))
    .leftJoin(vendors, eq(vendors.id, expenses.vendorId))
    .leftJoin(approvalInstances, and(eq(approvalInstances.documentKind, documentKind), eq(approvalInstances.documentId, expenses.id)))
    .leftJoin(expenseEvidenceReviews, eq(expenseEvidenceReviews.expenseId, expenses.id))
    .where(where)
    .orderBy(sql`${expenses.scheduledPaymentDate} asc nulls last`, asc(expenses.number), asc(expenses.id));
  return rows.map((row) => ({
    ...row.expense,
    drafterName: row.drafterName,
    projectName: row.projectName,
    itemName: row.itemName,
    teamName: row.teamName,
    vendorName: row.vendorName,
    approvalStatus: row.approvalStatus,
    paid: Boolean(row.paid),
    review: row.reviewStatus && row.reviewedAt ? { status: row.reviewStatus, reviewedAt: row.reviewedAt } : null,
  }));
}

// 필터 전체 행 — 예정일 오름차순 · 없음 끝 · 번호 순. 팀은 선택 인자(문서 팀).
export async function listPaymentTargetRows(viewer: Viewer, input: { documentKind: string; teamId?: string | null }): Promise<PaymentTargetRow[]> {
  void viewer;
  const conditions: SQL[] = [
    isNull(expenses.deletedAt),
    isNull(expenses.closedAt),
    eq(approvalInstances.status, "approved"),
    sql`not ${livePayment}`,
  ];
  if (input.teamId) conditions.push(sql`${docTeamId} = ${input.teamId}::uuid`);
  return selectRows(and(...conditions), input.documentKind);
}

// id 묶음 다시 읽기(H-3) — 일괄 처리 뒤 막힌 행을 응답 순간 값으로 다시 판정한다. 지급 · 종결 · 결재 상태와 관계없이 읽는다(판정은 domain).
export async function findPaymentTargetRowsByIds(viewer: Viewer, input: { documentKind: string; ids: readonly string[] }): Promise<PaymentTargetRow[]> {
  void viewer;
  if (input.ids.length === 0) return [];
  return selectRows(and(isNull(expenses.deletedAt), inArray(expenses.id, [...input.ids])), input.documentKind);
}

// 06-20(S3 「지급 완료」 보기) — 살아 있는 지급 기록(cancelled_at IS NULL) + 지출결의(삭제 아님). 지급일 내림차순 → 번호 → id.
// 계좌 칸(은행 · 번호 · 예금주)은 싣지 않는다(O-17 — 대표가 이 목록을 읽는다). 팀 조건은 S1과 같은 문서 팀 식(docTeamId).
// 쪽 자르기 · 합계 · 주 그룹은 domain(listPaidPayments) 한 곳 — 쿼리는 달 하나를 다 읽는다(S1 E-25와 같은 꼴). 범위 조건 없음 — 06.5 카드 ③(통과한 viewer는 전부).
export type PaidPaymentRow = {
  id: string;
  number: string | null;
  version: number;
  projectId: string | null;
  quoteLineId: string | null;
  content: string | null;
  installment: boolean;
  installmentSeq: number | null;
  prepaid: boolean;
  projectName: string | null;
  itemName: string | null;
  teamName: string | null;
  vendorName: string | null;
  payDate: string;
  transferKrw: number;
  payableKrw: number;
  diffKrw: number;
  diffReason: string | null;
  paymentMethod: string;
  processedByName: string;
  review: { status: string } | null;
};

const paidMonthOf = sql<string>`to_char(${expensePayments.payDate}, 'YYYY-MM')`;

function paidConditions(input: { teamId?: string | null; month?: string | null }): SQL | undefined {
  const conditions: SQL[] = [isNull(expensePayments.cancelledAt), isNull(expenses.deletedAt)];
  if (input.teamId) conditions.push(sql`${docTeamId} = ${input.teamId}::uuid`);
  // 달 = 지급일 범위(달 첫날 ≤ 지급일 < 다음 달 첫날). 모양은 domain이 검사한다.
  if (input.month) conditions.push(sql`${expensePayments.payDate} >= (${input.month} || '-01')::date and ${expensePayments.payDate} < ((${input.month} || '-01')::date + interval '1 month')`);
  return and(...conditions);
}

export async function listPaidPaymentRows(viewer: Viewer, input: { teamId?: string | null; month: string }): Promise<PaidPaymentRow[]> {
  void viewer;
  const rows = await db
    .select({
      id: expenses.id,
      number: expenses.number,
      version: expenses.version,
      projectId: expenses.projectId,
      quoteLineId: expenses.quoteLineId,
      content: expenses.content,
      installment: expenses.installment,
      installmentSeq: expenses.installmentSeq,
      prepaid: expenses.prepaid,
      projectName: projects.name,
      itemName: quoteLines.itemName,
      teamName: teams.name,
      vendorName: vendors.name,
      payDate: expensePayments.payDate,
      transferKrw: expensePayments.transferKrw,
      payableKrw: expensePayments.payableKrw,
      diffKrw: expensePayments.diffKrw,
      diffReason: expensePayments.diffReason,
      paymentMethod: expensePayments.paymentMethod,
      processedByName: users.name,
      reviewStatus: expenseEvidenceReviews.status,
    })
    .from(expensePayments)
    .innerJoin(expenses, eq(expenses.id, expensePayments.expenseId))
    .innerJoin(users, eq(users.id, expensePayments.processedBy))
    .leftJoin(projects, eq(projects.id, expenses.projectId))
    .leftJoin(quoteLines, eq(quoteLines.id, expenses.quoteLineId))
    .leftJoin(teams, eq(teams.id, expenses.attributedTeamId))
    .leftJoin(vendors, eq(vendors.id, expenses.vendorId))
    .leftJoin(expenseEvidenceReviews, eq(expenseEvidenceReviews.expenseId, expenses.id))
    .where(paidConditions(input))
    .orderBy(desc(expensePayments.payDate), asc(expenses.number), asc(expenses.id));
  return rows.map(({ reviewStatus, ...row }) => ({ ...row, payDate: String(row.payDate), review: reviewStatus ? { status: reviewStatus } : null }));
}

// 월 select 값 재료 — 살아 있는 지급 기록의 (문서 id, 지급 달). 목록과 같은 조건(범위 조건 없음 — 06.5 카드 ③).
export async function listPaidMonthRows(viewer: Viewer, input: { teamId?: string | null }): Promise<{ id: string; month: string }[]> {
  void viewer;
  return db
    .select({ id: expenses.id, month: paidMonthOf })
    .from(expensePayments)
    .innerJoin(expenses, eq(expenses.id, expensePayments.expenseId))
    .leftJoin(projects, eq(projects.id, expenses.projectId))
    .where(paidConditions({ teamId: input.teamId ?? null }));
}

// 06-20(O-17): 지급 권한자에게만 가는 계좌 칸 — 거래처 id 묶음 한 번. 평문 번호(accountNumberEncrypted)는 읽지 않는다(해제는 03 경로 하나).
export type VendorAccountRow = { vendorId: string; bank: string | null; holder: string | null; last4: string | null };

export async function findVendorAccountsByIds(viewer: Viewer, vendorIds: readonly string[]): Promise<VendorAccountRow[]> {
  if (vendorIds.length === 0) return [];
  return db
    .select({ vendorId: vendors.id, bank: vendors.accountBank, holder: vendors.accountHolder, last4: vendors.accountNumberLast4 })
    .from(vendors)
    .where(inArray(vendors.id, [...vendorIds]));
}

// 06-20(UA-605): Phase 5 목록 상태 열 재료 — 쪽의 결재 통과 행 id 묶음 한 번. 살아 있는 지급 기록의 지급일 · 선결제 · 면제 기록 유무.
// 증빙 유무는 여기서 세지 않는다(domain이 ownersWithEvidence 한 번 — C5).
export type ListPaymentStatusRow = { id: string; payDate: string | null; prepaid: boolean; waived: boolean };

export async function findListPaymentStatusByIds(viewer: Viewer, ids: readonly string[]): Promise<ListPaymentStatusRow[]> {
  void viewer;
  if (ids.length === 0) return [];
  const rows = await db
    .select({ id: expenses.id, payDate: expensePayments.payDate, prepaid: expenses.prepaid, reviewStatus: expenseEvidenceReviews.status })
    .from(expenses)
    .leftJoin(expensePayments, and(eq(expensePayments.expenseId, expenses.id), isNull(expensePayments.cancelledAt)))
    .leftJoin(expenseEvidenceReviews, eq(expenseEvidenceReviews.expenseId, expenses.id))
    .where(inArray(expenses.id, [...ids]));
  return rows.map((row) => ({ id: row.id, payDate: row.payDate, prepaid: row.prepaid, waived: row.reviewStatus === "waived" }));
}
