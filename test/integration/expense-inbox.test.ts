import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { listMyInbox } from "@/domain/approvals";
import { createTeamExpenseDraft, listExpenseFormOptions, saveExpenseDraft } from "@/domain/expenses";
import { submitLeave } from "@/domain/leave";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { insertVendor } from "@/repositories/vendors";
import { NOW_2026 } from "./approvals-fixtures";
import { setupExpenseProject, submitReadyDraft } from "./fixtures/expenses";

// 05-10 Task 2 ① — 결재함 지출결의 요약 값: 숫자 칸 머리글 · measure(원화 + 원래 통화) · 문서 칸 글자.
// 요약 값은 종류가 만들고(describeDocuments) 결재함 화면은 그대로 그리므로, 이 파일은 요약이 화면 재료로 맞는지만 본다.

const TODAY = "2026-09-26";

async function submittedTeamExpense(viewer: Viewer, content: string, supply: { currency: "KRW" | "USD"; amount: number; fxRate: number }): Promise<string> {
  const { expenseId } = await createTeamExpenseDraft(viewer, {
    idempotencyKey: randomUUID(),
    fields: { teamExpenseKind: "team_overhead", usageDate: TODAY, content },
  });
  const vendor = await insertVendor(SYSTEM_VIEWER, { name: `거래처-${randomUUID().slice(0, 6)}`, normalizedName: `거래처-${randomUUID()}`, defaultEvidenceType: "tax_invoice" });
  const payment = (await listExpenseFormOptions(viewer)).payment[0]?.value;
  if (!payment) throw new Error("지급 방식 코드 없음");
  await saveExpenseDraft(viewer, { expenseId, expectedVersion: 1, fields: { vendorId: vendor.id, evidenceType: "tax_invoice", paymentMethod: payment, supply } });
  const result = await submitReadyDraft(viewer, expenseId);
  if (result.kind !== "submitted") throw new Error("제출 실패");
  return expenseId;
}

describe("결재함 — 지출결의 요약 값 (05-10)", () => {
  it("USD 4,200 @1,318.4 팀 비용 + 연차가 함께 있으면 숫자 칸 머리글은 `금액 · 일수`, 지출결의 measure는 원화 환산과 원래 통화를 싣는다", async () => {
    const fx = await setupExpenseProject();
    const expenseId = await submittedTeamExpense(fx.pm, "팀 회식", { currency: "USD", amount: 4200, fxRate: 1318.4 });
    await submitLeave(fx.pm, { kind: "full_day", startDate: "2026-10-05", endDate: "2026-10-05", half: "" }, { now: NOW_2026 });

    const inbox = await listMyInbox(fx.lead, { withDetails: true });

    expect(inbox.measureHeader).toBe("금액 · 일수");
    const item = inbox.mine.find((candidate) => candidate.documentId === expenseId);
    expect(item?.summary?.measure).toEqual({ kind: "money", money: { currency: "USD", amount: 4200, fxRate: 1318.4, amountKrw: 5_537_280 } });
    const leave = inbox.mine.find((candidate) => candidate.documentId !== expenseId);
    expect(leave?.summary?.measure).toMatchObject({ kind: "days", text: "1일" });
  });

  it("팀 비용 문서 칸 글자는 `{종류 라벨} · {팀} · {내용}` — 종류 이름이 두 번 나오지 않는다", async () => {
    const fx = await setupExpenseProject();
    const expenseId = await submittedTeamExpense(fx.pm, "팀 회식", { currency: "KRW", amount: 440_000, fxRate: 1 });

    const inbox = await listMyInbox(fx.lead, { withDetails: true });
    const item = inbox.mine.find((candidate) => candidate.documentId === expenseId);

    expect(item?.summary?.documentText).toBe("기획1팀 · 팀 회식");
    expect([item?.kindLabel, item?.summary?.documentText].filter(Boolean).join(" · ")).toBe("지출결의 · 기획1팀 · 팀 회식");
  });
});
