import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { expenses } from "@/db/schema";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { upsertVisibility } from "@/repositories/permissions";
import { createExpenseFromLines, ExpenseFieldError, getExpense, saveExpenseDraft } from "@/domain/expenses";
import { listQuoteLines } from "@/domain/quotes/lines";
import { GateBlockedError } from "@/domain/rules/gate";
import { completeExpensePayment, previewPayable } from "@/domain/payments";
import { confirmEvidence } from "@/domain/evidence-reviews";
import { seoulToday } from "@/lib/dates";
import { addApprovedRevision, setupExpenseProject, submitReadyDraft, type ExpenseFixture } from "./fixtures/expenses";
import { approvedExpenseWithEvidence, makePaymentManager, setEvidenceRequired, type ApprovedExpense } from "./fixtures/payments";

// 06-13(EXP-06 · EXP-07 · SP-2 · O-14 · C10 · X-3): 견적 줄 상태 파생과 지출결의 쪽 입구 — 지급 완료 잠금 · 이중 연결 · 온라인구매 문.
// 줄 상태는 서버 한 함수(`domain/quotes/lines.ts`)가 파생하고, 제출 게이트는 프로젝트 행 → 견적 줄 → 문서 행 잠금 뒤에 판정한다.

const LIST_CTX = { status: "in_progress", canWrite: true } as const;

beforeEach(async () => {
  await setEvidenceRequired(false);
});

async function makePayer(): Promise<Viewer> {
  const payer = await makePaymentManager();
  if (!payer.roleId) throw new Error("계급 없음");
  for (const infoItem of ["expense.value", "expense.amount"]) await upsertVisibility(SYSTEM_VIEWER, { roleId: payer.roleId, infoItem, visible: true });
  return payer;
}

async function expenseRow(id: string) {
  const [row] = await db.select().from(expenses).where(eq(expenses.id, id));
  if (!row) throw new Error("지출결의 행 없음");
  return row;
}

async function draftOf(viewer: Viewer, lineId: string): Promise<string> {
  const created = await createExpenseFromLines(viewer, { lineIds: [lineId] });
  const expenseId = created.created[0]?.expenseId;
  if (!expenseId) throw new Error(`작성 중 문서 없음: ${JSON.stringify(created.blocked)}`);
  return expenseId;
}

async function save(viewer: Viewer, expenseId: string, fields: Parameters<typeof saveExpenseDraft>[1]["fields"]) {
  const { version } = await expenseRow(expenseId);
  await saveExpenseDraft(viewer, { expenseId, expectedVersion: version, fields });
}

// 결재 통과 · 증빙 있음 문서를 증빙 확인(06-06) 뒤 지급 완료(06-03)한다.
async function pay(payer: Viewer, doc: ApprovedExpense): Promise<void> {
  const row = await expenseRow(doc.expenseId);
  await db.update(expenses).set({ evidenceAmount: row.supplyAmountKrw }).where(eq(expenses.id, doc.expenseId));
  const confirmed = await confirmEvidence(payer, { expenseId: doc.expenseId, version: row.version });
  const preview = await previewPayable(payer, { expenseId: doc.expenseId, payDate: seoulToday() });
  if (preview.payableKrw === null || preview.payableKrw === undefined) throw new Error("지급 총액 없음");
  await completeExpensePayment(payer, { expenseId: doc.expenseId, expectedPayableKrw: preview.payableKrw, version: confirmed.version });
}

async function lineOf(viewer: Viewer, revisionId: string, lineId: string) {
  const line = (await listQuoteLines(viewer, revisionId, LIST_CTX)).find((row) => row.id === lineId);
  if (!line) throw new Error("견적 줄 없음");
  return line;
}

async function caught(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => {
      throw new Error("거부되지 않음");
    },
    (error: unknown) => error,
  );
}

// 줄 L에 작성 중 B(무관 PM)를 먼저 만들어 두고 A(담당 PM)를 결재 통과 → 지급 완료한다.
async function paidLine(fx: ExpenseFixture) {
  const payer = await makePayer();
  const staleDraft = await draftOf(fx.otherPm, fx.lines.withVendor);
  const paid = await approvedExpenseWithEvidence(fx);
  await pay(payer, paid);
  return { payer, paid, staleDraft };
}

describe("지급 완료 줄 (06-13 Task 1)", () => {
  it("결재 통과 + 지급 완료 → 줄 상태 `paid` · D-66 이유 `지출결의 {번호} 지급 완료 · 고치려면 새 차수`", async () => {
    const fx = await setupExpenseProject();
    const { paid } = await paidLine(fx);

    const line = await lineOf(fx.pm, fx.revisionId, fx.lines.withVendor);
    expect(line.linkedStatus).toBe("paid");
    expect(line.readonlyReason).toBe(`지출결의 ${paid.number} 지급 완료 · 고치려면 새 차수`);
  });

  it("같은 줄의 작성 중 B 제출 → `지급 완료 {A 번호} · 새 지출결의 없음`(05 ④ 문구가 아님) · B는 작성 중 그대로", async () => {
    const fx = await setupExpenseProject();
    const { paid, staleDraft } = await paidLine(fx);

    const error = await caught(submitReadyDraft(fx.otherPm, staleDraft));
    expect(error).toBeInstanceOf(GateBlockedError);
    expect((error as Error).message).toBe(`지급 완료 ${paid.number} · 새 지출결의 없음`);
    expect((error as Error).message).not.toBe(`이 줄에 지출결의 ${paid.number} 있음 · 지출결의 열기`);
    expect((await expenseRow(staleDraft)).number).toBeNull();
  });
});

// X-3(R-7 · E-5) — 05 93cb3470이 제출의 번호 문서를 계보 사슬 전체로 읽는다. 회귀 가드(처음부터 초록일 수 있다).
describe("새 차수 복사 줄 (X-3 회귀 가드)", () => {
  it("지급 완료 줄 L → 차수 2(L → L′) → L′의 작성 중 C 제출 → `지급 완료 {A 번호} · 새 지출결의 없음` · C는 작성 중", async () => {
    const fx = await setupExpenseProject();
    const { paid, staleDraft } = await paidLine(fx);
    const copied = (await addApprovedRevision(fx, [])).lineIds.get("무대 제작") ?? "";
    // 화면 문은 L′에서도 닫혀 새 초안을 만들 수 없다 — 오래된(또는 위조한) 초안을 L′로 옮긴 꼴로 서버 게이트만 본다.
    await db.update(expenses).set({ quoteLineId: copied }).where(eq(expenses.id, staleDraft));

    const error = await caught(submitReadyDraft(fx.otherPm, staleDraft));
    expect(error).toBeInstanceOf(GateBlockedError);
    expect((error as Error).message).toBe(`지급 완료 ${paid.number} · 새 지출결의 없음`);
    expect((await expenseRow(staleDraft)).number).toBeNull();
  });

  it("분할 줄 M 1회차 6,000,000 → 차수 2(M → M′) → M′ 분할 D: 폼 글자 2회차 · 4,000,001 거부 · 4,000,000 통과 2회차", async () => {
    const fx = await setupExpenseProject();
    const first = await draftOf(fx.pm, fx.lines.split);
    await save(fx.pm, first, { installment: true, supply: { currency: "KRW", amount: 6_000_000, fxRate: 1 } });
    expect(await submitReadyDraft(fx.pm, first)).toMatchObject({ kind: "submitted" });
    const copied = (await addApprovedRevision(fx, [])).lineIds.get("영상 제작(분할)") ?? "";

    const second = await draftOf(fx.pm, copied);
    expect((await getExpense(fx.pm, { expenseId: second }))?.installmentText).toMatch(/^2회차/);
    await save(fx.pm, second, { supply: { currency: "KRW", amount: 4_000_001, fxRate: 1 } });
    const error = await caught(submitReadyDraft(fx.pm, second));
    expect(error).toBeInstanceOf(ExpenseFieldError);
    expect((error as Error).message).toBe("남은 실행가 4,000,000 넘음 · 공급가액 고치기");

    await save(fx.pm, second, { supply: { currency: "KRW", amount: 4_000_000, fxRate: 1 } });
    expect(await submitReadyDraft(fx.pm, second)).toMatchObject({ kind: "submitted" });
    expect(await expenseRow(second)).toMatchObject({ installment: true, installmentSeq: 2 });
  });
});
