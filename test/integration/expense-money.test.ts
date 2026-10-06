import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { approvalInstances, expenses } from "@/db/schema";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { rejectDocument, withdrawDocument } from "@/domain/approvals";
import { createTeamExpenseDraft, EXPENSE_DOCUMENT_KIND, listExpenseFormOptions, saveExpenseDraft } from "@/domain/expenses";
import { listExpenses, type ExpenseListStatus } from "@/domain/expenses/list";
import { insertVendor } from "@/repositories/vendors";
import { setupExpenseProject, submitReadyDraft } from "./fixtures/expenses";

// 05-08 Task 2(UI-SPEC S8 · M2): 목록의 돈 · 쪽 계약 — 외화는 원화 환산 + 원래 통화 2행 재료, 합계 줄은 원화 합만,
// 50건 쪽, 쪽 경계를 넘는 그룹의 머리글 반복, 그리고 정렬은 SQL 한 곳(ORDER BY group_rank, 그룹별 키, id → LIMIT)이라
// 작은 쪽을 이어 붙인 순서가 한 쪽에 전부 담은 순서와 같다.

const TODAY = "2026-09-26";
const T0 = Date.parse("2026-09-20T00:00:00Z");
const at = (hours: number) => new Date(T0 + hours * 3_600_000);

type Supply = { currency: "KRW" | "USD"; amount: number; fxRate: number };

async function versionOf(id: string): Promise<number> {
  const [row] = await db.select({ version: expenses.version }).from(expenses).where(eq(expenses.id, id));
  if (!row) throw new Error("지출결의 없음");
  return row.version;
}

async function instanceOf(expenseId: string) {
  const [row] = await db
    .select()
    .from(approvalInstances)
    .where(and(eq(approvalInstances.documentKind, EXPENSE_DOCUMENT_KIND), eq(approvalInstances.documentId, expenseId)));
  if (!row) throw new Error("결재 인스턴스 없음");
  return row;
}

async function draft(viewer: Viewer, content: string): Promise<string> {
  const { expenseId } = await createTeamExpenseDraft(viewer, { idempotencyKey: randomUUID(), fields: { teamExpenseKind: "team_overhead", usageDate: TODAY, content } });
  return expenseId;
}

async function submitted(viewer: Viewer, vendorId: string, content: string, supply: Supply = { currency: "KRW", amount: 440_000, fxRate: 1 }): Promise<string> {
  const expenseId = await draft(viewer, content);
  const payment = (await listExpenseFormOptions(viewer)).payment[0]?.value;
  if (!payment) throw new Error("지급 방식 코드 없음");
  await saveExpenseDraft(viewer, {
    expenseId,
    expectedVersion: await versionOf(expenseId),
    fields: { vendorId, evidenceType: "tax_invoice", paymentMethod: payment, supply },
  });
  const result = await submitReadyDraft(viewer, expenseId);
  if (result.kind !== "submitted") throw new Error("제출 실패");
  return expenseId;
}

async function vendorId(): Promise<string> {
  return (await insertVendor(SYSTEM_VIEWER, { name: `거래처-${randomUUID().slice(0, 6)}`, normalizedName: `거래처-${randomUUID()}`, defaultEvidenceType: "tax_invoice" })).id;
}

async function readPage(viewer: Viewer, status: ExpenseListStatus, page: number, pageSize: number) {
  return listExpenses(viewer, { status, page }, { today: TODAY, pageSize });
}

const idsOf = (list: Awaited<ReturnType<typeof listExpenses>>) => list.groups.flatMap((group) => group.rows.map((row) => row.id ?? ""));
const shapeOf = (list: Awaited<ReturnType<typeof listExpenses>>) => list.groups.map((group) => [group.label, group.rows.map((row) => row.id ?? "")]);

describe("지출결의 목록 — 외화 · 합계", () => {
  it("USD 4,200.00 @1,318.4 문서는 원화 5,537,280 + 원래 통화 재료로 오고, 합계 줄은 원화 합만이다", async () => {
    const fx = await setupExpenseProject();
    const vendor = await vendorId();
    const usdId = await submitted(fx.pm, vendor, "해외 장비 렌탈", { currency: "USD", amount: 4200, fxRate: 1318.4 });
    await submitted(fx.pm, vendor, "팀 회식");

    const list = await listExpenses(fx.pm, { status: "open" }, { today: TODAY });
    const row = list.groups.flatMap((group) => group.rows).find((r) => r.id === usdId);
    expect(row?.supply).toMatchObject({ currency: "USD", amount: 4200, fxRate: 1318.4, amountKrw: 5_537_280 });
    expect(list.total).toEqual({ count: 2, sumKrw: 5_537_280 + 440_000 });
  });
});

describe("지출결의 목록 — 쪽 나눔 × 그룹(M2)", () => {
  it("작성 중 3 · 반려 1 · 회수 1 · 결재 중 4를 쪽 크기 4로 읽으면 두 그룹이 쪽 경계를 넘고, 이어 붙인 순서 = 한 쪽 순서", async () => {
    const fx = await setupExpenseProject();
    const vendor = await vendorId();

    // 결재 중 넷 — 만든 순서와 제출 순서가 반대(S1이 가장 늦게 제출), 고친 시각은 작성 중보다 늦다.
    const inReview = [];
    for (const name of ["S1", "S2", "S3", "S4"]) inReview.push(await submitted(fx.pm, vendor, name));
    const rejected = await submitted(fx.pm, vendor, "R");
    const withdrawn = await submitted(fx.pm, vendor, "W");
    const rejectedInstance = await instanceOf(rejected);
    await rejectDocument(fx.lead, { instanceId: rejectedInstance.id, expectedVersion: rejectedInstance.version, reason: "증빙 다시" });
    const withdrawnInstance = await instanceOf(withdrawn);
    await withdrawDocument(fx.pm, { instanceId: withdrawnInstance.id, expectedVersion: withdrawnInstance.version });
    const drafts = [await draft(fx.pm, "D1"), await draft(fx.pm, "D2"), await draft(fx.pm, "D3")];

    // 시각을 엇갈리게 고정 — 작성 중: D2 > D3 > D1(고친 시각 내림차순) · 반려 · 회수: W > R(날짜 내림차순) · 결재 중: S4 < S3 < S2 < S1(제출 오름차순).
    const [d1, d2, d3] = drafts as [string, string, string];
    const [s1, s2, s3, s4] = inReview as [string, string, string, string];
    for (const [id, hours] of [[d1, 1], [d2, 3], [d3, 2]] as const) await db.update(expenses).set({ updatedAt: at(hours) }).where(eq(expenses.id, id));
    await db.update(approvalInstances).set({ updatedAt: at(10) }).where(eq(approvalInstances.id, rejectedInstance.id));
    await db.update(approvalInstances).set({ updatedAt: at(11) }).where(eq(approvalInstances.id, withdrawnInstance.id));
    for (const [id, hours] of [[s1, 24], [s2, 23], [s3, 22], [s4, 21]] as const) {
      await db.update(expenses).set({ submittedAt: at(hours), updatedAt: at(40) }).where(eq(expenses.id, id));
    }

    const page1 = await readPage(fx.pm, "open", 1, 4);
    const page2 = await readPage(fx.pm, "open", 2, 4);
    const page3 = await readPage(fx.pm, "open", 3, 4);
    expect(shapeOf(page1)).toEqual([
      ["작성 중", [d2, d3, d1]],
      ["반려 · 회수", [withdrawn]],
    ]);
    expect(shapeOf(page2)).toEqual([
      ["반려 · 회수", [rejected]],
      ["결재 중", [s4, s3, s2]],
    ]);
    expect(shapeOf(page3)).toEqual([["결재 중", [s1]]]);
    expect(page1.page).toMatchObject({ page: 1, pageCount: 3, total: 9 });

    const whole = await readPage(fx.pm, "open", 1, 50);
    expect([...idsOf(page1), ...idsOf(page2), ...idsOf(page3)]).toEqual(idsOf(whole));
  });

  it("51건 → 1쪽 50행 · 2쪽 1행 · 합계 건수 51 · 2쪽 첫 행 앞에 같은 그룹 머리글", async () => {
    const fx = await setupExpenseProject();
    for (let i = 0; i < 51; i += 1) await draft(fx.pm, `작성 ${i}`);

    const page1 = await listExpenses(fx.pm, { status: "open", page: 1 }, { today: TODAY });
    const page2 = await listExpenses(fx.pm, { status: "open", page: 2 }, { today: TODAY });
    expect(idsOf(page1)).toHaveLength(50);
    expect(idsOf(page2)).toHaveLength(1);
    expect(page1.page).toMatchObject({ pageCount: 2, total: 51, pageSize: 50 });
    expect(page2.groups.map((group) => group.label)).toEqual(["작성 중"]);
    expect(new Set([...idsOf(page1), ...idsOf(page2)]).size).toBe(51);
  });
});
