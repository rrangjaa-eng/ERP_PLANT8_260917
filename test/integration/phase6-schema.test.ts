import { randomBytes, randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  corpCards,
  corpCardUsages,
  expenseEvidenceReviews,
  expenses,
  expensePayments,
  files,
  purchaseRequests,
  revenueEntries,
  revenueIssueRequests,
} from "@/db/schema";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { makePerson, teamIdByName } from "./approvals-fixtures";
import { setupExpenseProject } from "./fixtures/expenses";

// 06-27 — Phase 6 표 · 제약이 DB에서 직접 막는지(도메인을 거치지 않는 최후 방어선). 행은 db.insert로 직접 넣는다.
// 단언 규칙(E-42): drizzle 0.45는 pg 오류를 DrizzleQueryError로 감싸 원본을 .cause에 두므로 cause.code · cause.constraint로 본다.

type PgCause = { code?: unknown; constraint?: unknown };

// link_kind_check는 link_check에 포함된다(모르는 종류 값이면 link_check도 거짓) — 그런 행 하나는 두 CHECK를 함께 어기고 PG는
// 이름 순서로 먼저 걸린 link_check를 보고한다. 그래서 거부(23514 · 둘 중 하나)와 link_kind_check 정의 존재를 함께 본다.
async function expectLinkKindRejected(run: () => Promise<unknown>, table: string): Promise<void> {
  let caught: unknown = null;
  try {
    await run();
  } catch (error) {
    caught = error;
  }
  const cause = (caught instanceof Error ? caught.cause : null) as PgCause | null;
  expect(cause?.code).toBe("23514");
  expect([`${table}_link_check`, `${table}_link_kind_check`]).toContain(cause?.constraint);
  const defs = await db.execute<{ def: string }>(
    sql`SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conname = ${`${table}_link_kind_check`}`,
  );
  expect(defs.rows.map((row) => row.def)).toEqual([`CHECK ((link_kind = ANY (ARRAY['quote_line'::text, 'team_cost'::text])))`]);
}

async function expectPgError(run: () => Promise<unknown>, code: string, constraint: string): Promise<void> {
  let caught: unknown = null;
  try {
    await run();
  } catch (error) {
    caught = error;
  }
  const cause = (caught instanceof Error ? caught.cause : null) as PgCause | null;
  expect({ code: cause?.code, constraint: cause?.constraint }).toEqual({ code, constraint });
}

async function makeDraftExpense(): Promise<{ expenseId: string; userId: string }> {
  const drafter = await makePerson("기안자", DEFAULT_ROLE_ID, null);
  const [row] = await db.insert(expenses).values({ drafterId: drafter.id }).returning({ id: expenses.id });
  if (!row) throw new Error("지출결의 없음");
  return { expenseId: row.id, userId: drafter.id };
}

function paymentRow(expenseId: string, userId: string, extra: Partial<typeof expensePayments.$inferInsert> = {}) {
  return {
    expenseId,
    payDate: "2026-10-06",
    transferKrw: 1_100_000,
    payableKrw: 1_100_000,
    diffKrw: 0,
    paymentMethod: "transfer",
    processedBy: userId,
    ...extra,
  } satisfies typeof expensePayments.$inferInsert;
}

describe("expense_payments", () => {
  it("같은 문서에 살아 있는 지급 둘째 행은 expense_payments_live_uniq로 거부된다", async () => {
    const { expenseId, userId } = await makeDraftExpense();
    await db.insert(expensePayments).values(paymentRow(expenseId, userId));
    await expectPgError(() => db.insert(expensePayments).values(paymentRow(expenseId, userId)), "23505", "expense_payments_live_uniq");
  });

  it("첫 지급을 취소한 뒤에는 같은 문서에 새 살아 있는 지급이 들어간다", async () => {
    const { expenseId, userId } = await makeDraftExpense();
    const [first] = await db.insert(expensePayments).values(paymentRow(expenseId, userId)).returning({ id: expensePayments.id });
    if (!first) throw new Error("지급 없음");
    await db
      .update(expensePayments)
      .set({ cancelledAt: new Date(), cancelledBy: userId, cancelReason: "금액 착오" })
      .where(eq(expensePayments.id, first.id));
    await expect(db.insert(expensePayments).values(paymentRow(expenseId, userId)).returning({ id: expensePayments.id })).resolves.toHaveLength(1);
  });

  it("차이가 있는데 사유가 없거나 공백뿐이면 expense_payments_diff_reason_check로 거부되고 사유가 있으면 들어간다", async () => {
    const { expenseId, userId } = await makeDraftExpense();
    await expectPgError(
      () => db.insert(expensePayments).values(paymentRow(expenseId, userId, { transferKrw: 1_096_700, diffKrw: -3300, diffReason: null })),
      "23514",
      "expense_payments_diff_reason_check",
    );
    await expectPgError(
      () => db.insert(expensePayments).values(paymentRow(expenseId, userId, { transferKrw: 1_096_700, diffKrw: -3300, diffReason: "   " })),
      "23514",
      "expense_payments_diff_reason_check",
    );
    await expect(
      db
        .insert(expensePayments)
        .values(paymentRow(expenseId, userId, { transferKrw: 1_096_700, diffKrw: -3300, diffReason: "계좌 수수료" }))
        .returning({ id: expensePayments.id }),
    ).resolves.toHaveLength(1);
  });

  it("취소 칸 중 취소 시각만 채우면 expense_payments_cancel_check로 거부된다", async () => {
    const { expenseId, userId } = await makeDraftExpense();
    await expectPgError(
      () => db.insert(expensePayments).values(paymentRow(expenseId, userId, { cancelledAt: new Date() })),
      "23514",
      "expense_payments_cancel_check",
    );
  });

  it("차이가 이체액 − 지급 총액과 다르면 expense_payments_diff_check로 거부된다", async () => {
    const { expenseId, userId } = await makeDraftExpense();
    await expectPgError(
      () => db.insert(expensePayments).values(paymentRow(expenseId, userId, { transferKrw: 1_096_700, diffKrw: 3300, diffReason: "계좌 수수료" })),
      "23514",
      "expense_payments_diff_check",
    );
  });

  it("이체액이 음수면 expense_payments_transfer_krw_check로 거부된다", async () => {
    const { expenseId, userId } = await makeDraftExpense();
    await expectPgError(
      () => db.insert(expensePayments).values(paymentRow(expenseId, userId, { transferKrw: -1, payableKrw: 0, diffKrw: -1, diffReason: "착오" })),
      "23514",
      "expense_payments_transfer_krw_check",
    );
  });

  it("지급 총액이 음수면 expense_payments_payable_krw_check로 거부된다", async () => {
    const { expenseId, userId } = await makeDraftExpense();
    await expectPgError(
      () => db.insert(expensePayments).values(paymentRow(expenseId, userId, { transferKrw: 0, payableKrw: -1, diffKrw: 1, diffReason: "착오" })),
      "23514",
      "expense_payments_payable_krw_check",
    );
  });
});

// ── Task 2 ──────────────────────────────────────────────────────────────────────────────────────────
// 견적 줄 · 프로젝트 · 사람은 05 픽스처(setupExpenseProject)로, 카드 · 발행 줄 · 표 행은 db.insert로 직접 만든다.

function uniqueLast4(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}

async function insertCard(values: { kind: string; holderUserId?: string | null; teamId?: string | null }) {
  return db
    .insert(corpCards)
    .values({ issuer: `카드사-${randomUUID()}`, numberLast4: uniqueLast4(), label: "카드", ...values })
    .returning({ id: corpCards.id });
}

async function base() {
  const fx = await setupExpenseProject();
  const teamId = await teamIdByName("기획1팀");
  const [card] = await insertCard({ kind: "personal", holderUserId: fx.pm.id });
  if (!card) throw new Error("카드 없음");
  return { fx, teamId, cardId: card.id, userId: fx.pm.id, quoteLineId: fx.lines.noVendor };
}

type Base = Awaited<ReturnType<typeof base>>;

function usageRow(b: Base, extra: Partial<typeof corpCardUsages.$inferInsert> = {}) {
  return {
    corpCardId: b.cardId,
    usedOn: "2026-10-01",
    totalAmountKrw: 110_000,
    supplyKrw: 100_000,
    vatKrw: 10_000,
    evidenceTypeCode: "card_slip",
    linkKind: "quote_line",
    quoteLineId: b.quoteLineId,
    usedByUserId: b.userId,
    registeredBy: b.userId,
    registeredVia: "self",
    ...extra,
  } satisfies typeof corpCardUsages.$inferInsert;
}

function purchaseRow(b: Base, extra: Partial<typeof purchaseRequests.$inferInsert> = {}) {
  return {
    number: `26001-C${randomUUID().slice(0, 8)}`,
    linkKind: "quote_line",
    projectId: b.fx.projectId,
    quoteLineId: b.quoteLineId,
    requestedBy: b.userId,
    itemName: "현수막",
    estimateAmountKrw: 50_000,
    ...extra,
  } satisfies typeof purchaseRequests.$inferInsert;
}

describe("expense_evidence_reviews", () => {
  it("그냥 확인 한 줄은 들어간다", async () => {
    const { expenseId, userId } = await makeDraftExpense();
    await expect(
      db.insert(expenseEvidenceReviews).values({ expenseId, status: "confirmed", reviewedBy: userId }).returning({ id: expenseEvidenceReviews.id }),
    ).resolves.toHaveLength(1);
  });

  it("모르는 상태는 expense_evidence_reviews_status_check로 거부된다", async () => {
    const { expenseId, userId } = await makeDraftExpense();
    await expectPgError(
      () => db.insert(expenseEvidenceReviews).values({ expenseId, status: "pending", reviewedBy: userId }),
      "23514",
      "expense_evidence_reviews_status_check",
    );
  });

  it("면제인데 사유가 없으면 expense_evidence_reviews_waive_reason_check로 거부된다", async () => {
    const { expenseId, userId } = await makeDraftExpense();
    await expectPgError(
      () => db.insert(expenseEvidenceReviews).values({ expenseId, status: "waived", reviewedBy: userId }),
      "23514",
      "expense_evidence_reviews_waive_reason_check",
    );
  });

  it("고친 금액이 한쪽만 있으면 expense_evidence_reviews_amount_pair_check로 거부된다", async () => {
    const { expenseId, userId } = await makeDraftExpense();
    await expectPgError(
      () => db.insert(expenseEvidenceReviews).values({ expenseId, status: "confirmed", amountBeforeKrw: 1_000_000, reviewedBy: userId }),
      "23514",
      "expense_evidence_reviews_amount_pair_check",
    );
  });

  it("같은 문서 둘째 확인 줄은 expense_evidence_reviews_expense_uniq로 거부된다", async () => {
    const { expenseId, userId } = await makeDraftExpense();
    await db.insert(expenseEvidenceReviews).values({ expenseId, status: "confirmed", reviewedBy: userId });
    await expectPgError(
      () => db.insert(expenseEvidenceReviews).values({ expenseId, status: "waived", waiveReason: "영수증 분실", reviewedBy: userId }),
      "23505",
      "expense_evidence_reviews_expense_uniq",
    );
  });
});

describe("corp_card_usages", () => {
  it("견적 줄에 연결된 사용 · 팀 비용 사용은 들어간다", async () => {
    const b = await base();
    await expect(db.insert(corpCardUsages).values(usageRow(b)).returning({ id: corpCardUsages.id })).resolves.toHaveLength(1);
    await expect(
      db
        .insert(corpCardUsages)
        .values(usageRow(b, { linkKind: "team_cost", quoteLineId: null, teamId: b.teamId }))
        .returning({ id: corpCardUsages.id }),
    ).resolves.toHaveLength(1);
  });

  it("공급가 + 부가세가 원화 합계와 다르면 corp_card_usages_amount_sum_check로 거부된다", async () => {
    const b = await base();
    await expectPgError(() => db.insert(corpCardUsages).values(usageRow(b, { vatKrw: 9_999 })), "23514", "corp_card_usages_amount_sum_check");
  });

  it("공급가와 부가세의 부호가 엇갈리면 corp_card_usages_sign_check로 거부된다", async () => {
    const b = await base();
    await expectPgError(
      () => db.insert(corpCardUsages).values(usageRow(b, { supplyKrw: 120_000, vatKrw: -10_000 })),
      "23514",
      "corp_card_usages_sign_check",
    );
  });

  it("카드 취소(공급가 · 부가세 모두 음수)와 면세 취소(부가세 0)는 들어간다", async () => {
    const b = await base();
    await expect(
      db
        .insert(corpCardUsages)
        .values(usageRow(b, { totalAmountKrw: -110_000, supplyKrw: -100_000, vatKrw: -10_000 }))
        .returning({ id: corpCardUsages.id }),
    ).resolves.toHaveLength(1);
    await expect(
      db
        .insert(corpCardUsages)
        .values(usageRow(b, { totalAmountKrw: -50_000, supplyKrw: -50_000, vatKrw: 0 }))
        .returning({ id: corpCardUsages.id }),
    ).resolves.toHaveLength(1);
  });

  it("본인 등록인데 사용자와 등록자가 다르면 corp_card_usages_self_check로 거부되고 대리 등록은 들어간다", async () => {
    const b = await base();
    const other = await makePerson("대리 등록자", DEFAULT_ROLE_ID, null);
    await expectPgError(
      () => db.insert(corpCardUsages).values(usageRow(b, { registeredBy: other.id })),
      "23514",
      "corp_card_usages_self_check",
    );
    await expect(
      db
        .insert(corpCardUsages)
        .values(usageRow(b, { registeredBy: other.id, registeredVia: "proxy" }))
        .returning({ id: corpCardUsages.id }),
    ).resolves.toHaveLength(1);
  });

  it("모르는 연결 종류는 거부되고 corp_card_usages_link_kind_check가 정의돼 있다", async () => {
    const b = await base();
    await expectLinkKindRejected(() => db.insert(corpCardUsages).values(usageRow(b, { linkKind: "none" })), "corp_card_usages");
  });

  it("연결이 없으면 corp_card_usages_link_check로 거부된다", async () => {
    const b = await base();
    await expectPgError(() => db.insert(corpCardUsages).values(usageRow(b, { quoteLineId: null })), "23514", "corp_card_usages_link_check");
  });

  it("견적 줄과 팀을 둘 다 가지면 corp_card_usages_link_check로 거부된다", async () => {
    const b = await base();
    await expectPgError(() => db.insert(corpCardUsages).values(usageRow(b, { teamId: b.teamId })), "23514", "corp_card_usages_link_check");
  });

  it("모르는 등록 경로는 corp_card_usages_registered_via_check로 거부된다", async () => {
    const b = await base();
    await expectPgError(
      () => db.insert(corpCardUsages).values(usageRow(b, { registeredVia: "import" })),
      "23514",
      "corp_card_usages_registered_via_check",
    );
  });

  it("구매 경로인데 요청 id가 없으면 corp_card_usages_purchase_link_check로 거부된다", async () => {
    const b = await base();
    await expectPgError(
      () => db.insert(corpCardUsages).values(usageRow(b, { registeredVia: "purchase" })),
      "23514",
      "corp_card_usages_purchase_link_check",
    );
  });

  it("같은 구매 요청의 둘째 카드 사용은 corp_card_usages_purchase_request_uniq로 거부된다", async () => {
    const b = await base();
    const [request] = await db.insert(purchaseRequests).values(purchaseRow(b)).returning({ id: purchaseRequests.id });
    if (!request) throw new Error("구매 요청 없음");
    await db.insert(corpCardUsages).values(usageRow(b, { registeredVia: "purchase", purchaseRequestId: request.id }));
    await expectPgError(
      () => db.insert(corpCardUsages).values(usageRow(b, { registeredVia: "purchase", purchaseRequestId: request.id })),
      "23505",
      "corp_card_usages_purchase_request_uniq",
    );
  });

  it("공용 카드(kind shared · 소지자 · 팀 없음)에 카드 사용이 들어간다", async () => {
    const b = await base();
    const [shared] = await insertCard({ kind: "shared" });
    if (!shared) throw new Error("공용 카드 없음");
    await expect(
      db.insert(corpCardUsages).values(usageRow(b, { corpCardId: shared.id })).returning({ id: corpCardUsages.id }),
    ).resolves.toHaveLength(1);
  });

  it("등록자 · 등록 시각 인덱스가 (registered_by, created_at) 순서로 있다", async () => {
    const result = await db.execute<{ indexdef: string }>(
      sql`SELECT indexdef FROM pg_indexes WHERE indexname = 'corp_card_usages_registered_by_created_idx'`,
    );
    expect(result.rows.map((row) => row.indexdef.replace(/^.*USING btree /, ""))).toEqual(["(registered_by, created_at)"]);
  });
});

describe("purchase_requests", () => {
  it("견적 줄 요청 · 팀 비용 요청은 들어간다", async () => {
    const b = await base();
    await expect(db.insert(purchaseRequests).values(purchaseRow(b)).returning({ id: purchaseRequests.id })).resolves.toHaveLength(1);
    await expect(
      db
        .insert(purchaseRequests)
        .values(purchaseRow(b, { number: `TC26-${randomUUID().slice(0, 8)}`, linkKind: "team_cost", projectId: null, quoteLineId: null, linkUrl: "https://shop.example.com/a" }))
        .returning({ id: purchaseRequests.id }),
    ).resolves.toHaveLength(1);
  });

  it("같은 번호 둘째 요청은 purchase_requests_number_uniq로 거부된다", async () => {
    const b = await base();
    await db.insert(purchaseRequests).values(purchaseRow(b, { number: "26001-C0001" }));
    await expectPgError(() => db.insert(purchaseRequests).values(purchaseRow(b, { number: "26001-C0001" })), "23505", "purchase_requests_number_uniq");
  });

  it("모르는 연결 종류는 거부되고 purchase_requests_link_kind_check가 정의돼 있다", async () => {
    const b = await base();
    await expectLinkKindRejected(() => db.insert(purchaseRequests).values(purchaseRow(b, { linkKind: "none" })), "purchase_requests");
  });

  it("팀 비용인데 견적 줄이 있으면 purchase_requests_link_check로 거부된다", async () => {
    const b = await base();
    await expectPgError(
      () => db.insert(purchaseRequests).values(purchaseRow(b, { linkKind: "team_cost", projectId: null })),
      "23514",
      "purchase_requests_link_check",
    );
  });

  it("javascript: 링크는 purchase_requests_link_url_check로 거부된다", async () => {
    const b = await base();
    await expectPgError(
      () => db.insert(purchaseRequests).values(purchaseRow(b, { linkUrl: "javascript:alert(1)" })),
      "23514",
      "purchase_requests_link_url_check",
    );
  });

  it("모르는 상태는 purchase_requests_status_check로 거부된다", async () => {
    const b = await base();
    await expectPgError(() => db.insert(purchaseRequests).values(purchaseRow(b, { status: "lost" })), "23514", "purchase_requests_status_check");
  });

  it("구매 완료인데 완료 칸이 없으면 purchase_requests_completed_check로 거부된다", async () => {
    const b = await base();
    await expectPgError(() => db.insert(purchaseRequests).values(purchaseRow(b, { status: "purchased" })), "23514", "purchase_requests_completed_check");
  });

  it("취소인데 취소 칸이 없으면 purchase_requests_cancelled_check로 거부된다", async () => {
    const b = await base();
    await expectPgError(() => db.insert(purchaseRequests).values(purchaseRow(b, { status: "cancelled" })), "23514", "purchase_requests_cancelled_check");
  });

  it("예상 금액이 음수면 purchase_requests_estimate_amount_krw_check로 거부된다", async () => {
    const b = await base();
    await expectPgError(
      () => db.insert(purchaseRequests).values(purchaseRow(b, { estimateAmountKrw: -1 })),
      "23514",
      "purchase_requests_estimate_amount_krw_check",
    );
  });
});

describe("revenue_issue_requests", () => {
  async function issueEntry(projectId: string) {
    const [entry] = await db
      .insert(revenueEntries)
      .values({ projectId, kind: "issue", entryDate: "2026-10-10", amountAmountKrw: 5_000_000 })
      .returning({ id: revenueEntries.id });
    if (!entry) throw new Error("발행 줄 없음");
    return entry.id;
  }

  function requestRow(projectId: string, userId: string, extra: Partial<typeof revenueIssueRequests.$inferInsert> = {}) {
    return { projectId, desiredIssueDate: "2026-10-10", amountAmountKrw: 5_000_000, requestedBy: userId, ...extra } satisfies typeof revenueIssueRequests.$inferInsert;
  }

  it("신청 · 발행된 요청은 들어간다", async () => {
    const b = await base();
    const entryId = await issueEntry(b.fx.projectId);
    await expect(db.insert(revenueIssueRequests).values(requestRow(b.fx.projectId, b.userId)).returning({ id: revenueIssueRequests.id })).resolves.toHaveLength(1);
    await expect(
      db
        .insert(revenueIssueRequests)
        .values(requestRow(b.fx.projectId, b.userId, { status: "issued", issuedEntryId: entryId }))
        .returning({ id: revenueIssueRequests.id }),
    ).resolves.toHaveLength(1);
  });

  it("모르는 상태는 revenue_issue_requests_status_check로 거부된다", async () => {
    const b = await base();
    await expectPgError(
      () => db.insert(revenueIssueRequests).values(requestRow(b.fx.projectId, b.userId, { status: "draft" })),
      "23514",
      "revenue_issue_requests_status_check",
    );
  });

  it("발행됨인데 발행 줄이 없으면 revenue_issue_requests_issued_check로 거부된다", async () => {
    const b = await base();
    await expectPgError(
      () => db.insert(revenueIssueRequests).values(requestRow(b.fx.projectId, b.userId, { status: "issued" })),
      "23514",
      "revenue_issue_requests_issued_check",
    );
  });

  it("발행되지 않았는데 발행 줄이 있으면 revenue_issue_requests_issued_check로 거부된다", async () => {
    const b = await base();
    const entryId = await issueEntry(b.fx.projectId);
    await expectPgError(
      () => db.insert(revenueIssueRequests).values(requestRow(b.fx.projectId, b.userId, { issuedEntryId: entryId })),
      "23514",
      "revenue_issue_requests_issued_check",
    );
  });

  it("취소인데 취소 칸이 없거나, 취소가 아닌데 취소 칸이 있으면 revenue_issue_requests_cancelled_check로 거부되고 취소 칸을 갖춘 취소는 들어간다", async () => {
    const b = await base();
    await expectPgError(
      () => db.insert(revenueIssueRequests).values(requestRow(b.fx.projectId, b.userId, { status: "cancelled", cancelledAt: new Date() })),
      "23514",
      "revenue_issue_requests_cancelled_check",
    );
    await expectPgError(
      () => db.insert(revenueIssueRequests).values(requestRow(b.fx.projectId, b.userId, { cancelledAt: new Date(), cancelledBy: b.userId })),
      "23514",
      "revenue_issue_requests_cancelled_check",
    );
    await expect(
      db
        .insert(revenueIssueRequests)
        .values(requestRow(b.fx.projectId, b.userId, { status: "cancelled", cancelledAt: new Date(), cancelledBy: b.userId }))
        .returning({ id: revenueIssueRequests.id }),
    ).resolves.toHaveLength(1);
  });

  it("같은 발행 줄의 둘째 요청은 revenue_issue_requests_issued_entry_uniq로 거부된다", async () => {
    const b = await base();
    const entryId = await issueEntry(b.fx.projectId);
    await db.insert(revenueIssueRequests).values(requestRow(b.fx.projectId, b.userId, { status: "issued", issuedEntryId: entryId }));
    await expectPgError(
      () => db.insert(revenueIssueRequests).values(requestRow(b.fx.projectId, b.userId, { status: "issued", issuedEntryId: entryId })),
      "23505",
      "revenue_issue_requests_issued_entry_uniq",
    );
  });
});

describe("expenses 06 칸", () => {
  async function numberedExpense(drafterId: string): Promise<string> {
    const [row] = await db
      .insert(expenses)
      .values({ drafterId, number: `26001-E${randomUUID().slice(0, 8)}`, supplyAmountKrw: 1_000_000 })
      .returning({ id: expenses.id });
    if (!row) throw new Error("지출결의 없음");
    return row.id;
  }

  it("선결제인데 사유가 없으면 expenses_prepaid_reason_check로 거부된다", async () => {
    const { userId } = await makeDraftExpense();
    await expectPgError(() => db.insert(expenses).values({ drafterId: userId, prepaid: true }), "23514", "expenses_prepaid_reason_check");
  });

  it("증빙 금액이 음수면 expenses_evidence_amount_check로 거부된다", async () => {
    const { userId } = await makeDraftExpense();
    await expectPgError(() => db.insert(expenses).values({ drafterId: userId, evidenceAmount: -1 }), "23514", "expenses_evidence_amount_check");
  });

  it("번호 없는 문서를 종결하면 expenses_closed_check로 거부된다", async () => {
    const { expenseId, userId } = await makeDraftExpense();
    await expectPgError(
      () => db.update(expenses).set({ closedAt: new Date(), closedBy: userId, closedReason: "재기안" }).where(eq(expenses.id, expenseId)),
      "23514",
      "expenses_closed_check",
    );
  });

  it("번호 있는 문서의 종결 · 선결제 사유 · 증빙 금액 · 증빙일은 들어간다", async () => {
    const { userId } = await makeDraftExpense();
    const expenseId = await numberedExpense(userId);
    await expect(
      db
        .update(expenses)
        .set({ closedAt: new Date(), closedBy: userId, closedReason: "재기안", prepaid: true, prepaidReason: "현장 선결제", evidenceAmount: 0, evidenceDate: "2026-10-01" })
        .where(eq(expenses.id, expenseId))
        .returning({ id: expenses.id }),
    ).resolves.toHaveLength(1);
  });

  it("없는 사람을 종결자로 두면 expenses_closed_by_users_id_fk로 거부된다", async () => {
    const { userId } = await makeDraftExpense();
    const expenseId = await numberedExpense(userId);
    await expectPgError(
      () => db.update(expenses).set({ closedAt: new Date(), closedBy: `nobody-${randomUUID()}`, closedReason: "재기안" }).where(eq(expenses.id, expenseId)),
      "23503",
      "expenses_closed_by_users_id_fk",
    );
  });
});

describe("files 주인 종류", () => {
  function fileRow(ownerKind: string, userId: string) {
    return {
      ownerKind,
      ownerId: randomUUID(),
      objectKey: `evidence/${randomUUID()}`,
      sha256: randomBytes(32).toString("hex"),
      sizeBytes: 1024,
      contentType: "image/jpeg",
      originalName: "카드전표.jpg",
      uploadedBy: userId,
    } satisfies typeof files.$inferInsert;
  }

  it("corp_card_usage 주인 파일은 들어간다", async () => {
    const { userId } = await makeDraftExpense();
    await expect(db.insert(files).values(fileRow("corp_card_usage", userId)).returning({ id: files.id })).resolves.toHaveLength(1);
  });

  it("모르는 주인 종류는 files_owner_kind_check로 거부된다", async () => {
    const { userId } = await makeDraftExpense();
    await expectPgError(() => db.insert(files).values(fileRow("unknown", userId)), "23514", "files_owner_kind_check");
  });
});

describe("corp_cards 주인 CHECK", () => {
  type Owner = "holder" | "team" | "both" | "none";

  async function ownerValues(owner: Owner) {
    const holder = owner === "holder" || owner === "both" ? (await makePerson("카드 소지자", DEFAULT_ROLE_ID, null)).id : null;
    const team = owner === "team" || owner === "both" ? await teamIdByName("기획1팀") : null;
    return { holderUserId: holder, teamId: team };
  }

  it.each([
    ["personal", "holder"],
    ["team", "team"],
    ["shared", "none"],
  ] as const)("%s + %s 카드는 들어간다", async (kind, owner) => {
    await expect(insertCard({ kind, ...(await ownerValues(owner)) })).resolves.toHaveLength(1);
  });

  it.each([
    ["personal", "both"],
    ["personal", "none"],
    ["team", "holder"],
    ["shared", "team"],
    ["shared", "holder"],
    ["unknown", "holder"],
  ] as const)("%s + %s 카드는 corp_cards_owner_kind_check로 거부된다", async (kind, owner) => {
    const values = await ownerValues(owner);
    await expectPgError(() => insertCard({ kind, ...values }), "23514", "corp_cards_owner_kind_check");
  });

  it("옛 이름 corp_cards_owner_xor_check는 pg_constraint에 없다", async () => {
    const result = await db.execute<{ conname: string }>(sql`SELECT conname FROM pg_constraint WHERE conname = 'corp_cards_owner_xor_check'`);
    expect(result.rows).toHaveLength(0);
  });
});
