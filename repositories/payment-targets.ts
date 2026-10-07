import { and, asc, eq, inArray, isNull, sql, type SQL } from "drizzle-orm";
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
