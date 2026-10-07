import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { and, eq, isNull } from "drizzle-orm";
import { db, pool } from "@/db/client";
import { corpCards, corpCardUsages, expenses, files, purchaseRequests, quoteLines } from "@/db/schema";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { upsertVisibility } from "@/repositories/permissions";
import { closeExpense, createExpenseFromLines, ExpenseConflictError, ExpenseFieldError, getExpense, listLineDoors, rowActionBlock, saveExpenseDraft, submitExpense } from "@/domain/expenses";
import { findLineLinks } from "@/repositories/quote-line-links";
import { listQuoteLines, saveQuoteLines } from "@/domain/quotes/lines";
import { saveProjectLedger } from "@/domain/projects/ledger";
import { lineStatusWord } from "@/app/(app)/projects/status-display";
import { approveDocument, rejectDocument } from "@/domain/approvals";
import { GateBlockedError } from "@/domain/rules/gate";
import { cancelExpensePayment, completeExpensePayment, previewPayable } from "@/domain/payments";
import { confirmEvidence, waiveEvidence } from "@/domain/evidence-reviews";
import { voidEvidence } from "@/domain/evidence";
import { createCorpCard } from "@/domain/corp-cards";
import { createCardUsage, precheckCardUsage, type CardUsageInput } from "@/domain/corp-card-usages";
import { setSettingValue } from "@/domain/settings/registry";
import { PURCHASE_ONLINE_VENDOR_NAME } from "@/domain/settings/keys";
import { seoulToday } from "@/lib/dates";
import { addApprovedRevision, attachEvidence, makeEvidenceManager, setupExpenseProject, submitReadyDraft, type ExpenseFixture } from "./fixtures/expenses";
import { waitForLockWaiter } from "./lock-race";
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

  // 검토 I-1 — 저장소 거르기(`expense_payments.cancelled_at IS NULL`)를 지나는 경로. 결정 함수 단위 테스트는 `paid`를 직접 넣어 이 조건을 보지 않는다.
  it("[검토 I-1 · D-606] 지급 → 지급 취소 → 지급 전으로 센다: 상태 `paid` 아님 · D-66 이유에 `지급 완료` 없음 · 행 막힘 없음 · B 제출은 05 ④ 문구", async () => {
    const fx = await setupExpenseProject();
    const { payer, paid, staleDraft } = await paidLine(fx);
    await cancelExpensePayment(payer, { expenseId: paid.expenseId, reason: "이체 오류", version: (await expenseRow(paid.expenseId)).version });

    const line = await lineOf(fx.pm, fx.revisionId, fx.lines.withVendor);
    expect(line.linkedStatus).toBe("active");
    expect(line.readonlyReason ?? "").not.toContain("지급 완료");
    const doors = await listLineDoors(fx.pm, { projectId: fx.projectId });
    expect(doors.cells[fx.lines.withVendor]).toMatchObject({ state: "closed" });
    expect(doors.cells[fx.lines.withVendor]?.blocked).toBeUndefined();
    const error = await caught(submitReadyDraft(fx.otherPm, staleDraft));
    expect((error as Error).message).toBe(`이 줄에 지출결의 ${paid.number} 있음 · 지출결의 열기`);
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

// ── Task 2 ─────────────────────────────────────────────────────────────

async function linkedStatusOf(fx: ExpenseFixture, lineId: string, revisionId = fx.revisionId) {
  return (await lineOf(fx.pm, revisionId, lineId)).linkedStatus;
}

// 분할 문서 하나를 제출한다(공급가 3,000,000 — 분할 줄 실행가 10,000,000이라 셋까지 문이 열려 있다).
async function submitInstallment(fx: ExpenseFixture, lineId = fx.lines.split, supply = 3_000_000) {
  const draft = await draftOf(fx.pm, lineId);
  await save(fx.pm, draft, { installment: true, supply: { currency: "KRW", amount: supply, fxRate: 1 } });
  const submitted = await submitReadyDraft(fx.pm, draft);
  if (submitted.kind !== "submitted") throw new Error("제출 안 됨");
  return { ...submitted, expenseId: draft };
}

async function approveAll(fx: ExpenseFixture, doc: { instanceId: string; version: number }) {
  const first = await approveDocument(fx.lead, { instanceId: doc.instanceId, expectedVersion: doc.version });
  await approveDocument(fx.ceo, { instanceId: doc.instanceId, expectedVersion: first.version });
}

async function approvedOf(fx: ExpenseFixture, doc: { expenseId: string; instanceId: string; number: string; version: number }): Promise<ApprovedExpense> {
  await approveAll(fx, doc);
  return { expenseId: doc.expenseId, instanceId: doc.instanceId, number: doc.number, version: (await expenseRow(doc.expenseId)).version };
}

// 선결제 문서 — 증빙 없이 제출(06-10 · 제출 ⑧ 예외).
async function submitPrepaid(fx: ExpenseFixture, lineId = fx.lines.withVendor) {
  const draft = await draftOf(fx.pm, lineId);
  await save(fx.pm, draft, { prepaid: true, prepaidReason: "행사장 선결제 요구" });
  const submitted = await submitExpense(fx.pm, { expenseId: draft, expectedVersion: (await expenseRow(draft)).version });
  if (submitted.kind !== "submitted") throw new Error("제출 안 됨");
  return { ...submitted, expenseId: draft };
}

async function payOn(payer: Viewer, doc: ApprovedExpense, payDate: string): Promise<void> {
  const preview = await previewPayable(payer, { expenseId: doc.expenseId, payDate });
  if (preview.payableKrw === null || preview.payableKrw === undefined) throw new Error("지급 총액 없음");
  await completeExpensePayment(payer, { expenseId: doc.expenseId, payDate, expectedPayableKrw: preview.payableKrw, version: (await expenseRow(doc.expenseId)).version });
}

async function voidAll(expenseId: string): Promise<void> {
  const voider = await makeEvidenceManager("증빙무효", { attach: false, void: true });
  const alive = await db
    .select({ id: files.id })
    .from(files)
    .where(and(eq(files.ownerKind, "expense"), eq(files.ownerId, expenseId), isNull(files.removedAt), isNull(files.voidedAt)));
  for (const file of alive) await voidEvidence(voider, { fileId: file.id, reason: "다른 건 영수증" });
}

async function cardOn(fx: ExpenseFixture, lineId: string, supply = 100_000): Promise<string> {
  const card = await createCorpCard(SYSTEM_VIEWER, {
    issuer: `카드사-${randomUUID().slice(0, 6)}`,
    numberLast4: String(1000 + Math.floor(Math.random() * 9000)),
    label: "개인 카드",
    kind: "personal",
    holderUserId: fx.pm.id,
  });
  if (!card.id) throw new Error("카드 id 없음");
  const input: CardUsageInput = {
    corpCardId: card.id,
    usedOn: seoulToday(),
    merchantVendorId: null,
    total: { currency: "KRW", amount: supply, fxRate: 1 },
    evidenceTypeCode: "invoice",
    linkKind: "quote_line",
    lineId,
    memo: null,
  };
  return (await createCardUsage(fx.pm, input, await precheckCardUsage(fx.pm, input))).id;
}

async function setArchived(usageId: string, archived: boolean, by: string): Promise<void> {
  await db
    .update(corpCardUsages)
    .set(archived ? { archivedAt: new Date(), archivedBy: by } : { archivedAt: null, archivedBy: null })
    .where(eq(corpCardUsages.id, usageId));
}

// 줄 쪽 게이트를 거치지 않는 `신청됨` 구매 요청(상태 파생 입력만 본다 — 입구 게이트는 06-08 통합이 본다).
async function requestOn(fx: ExpenseFixture, lineId: string): Promise<string> {
  const [row] = await db
    .insert(purchaseRequests)
    .values({ number: `26001-Q${randomUUID().slice(0, 8)}`, linkKind: "quote_line", projectId: fx.projectId, quoteLineId: lineId, requestedBy: fx.pm.id, itemName: "현수막", estimateAmountKrw: 110_000 })
    .returning({ id: purchaseRequests.id });
  if (!row) throw new Error("구매 요청 없음");
  return row.id;
}

function addDays(date: string, days: number): string {
  const at = new Date(`${date}T00:00:00Z`);
  at.setUTCDate(at.getUTCDate() + days);
  return at.toISOString().slice(0, 10);
}

describe("우선순위 여덟 값 (SP-2 · O-14)", () => {
  it("반려 + 결재 중 → rejected", async () => {
    const fx = await setupExpenseProject();
    const first = await submitInstallment(fx);
    await rejectDocument(fx.lead, { instanceId: first.instanceId, expectedVersion: first.version, reason: "금액 확인" });
    await submitInstallment(fx);
    expect(await linkedStatusOf(fx, fx.lines.split)).toBe("rejected");
  });

  it("증빙 없는 결재 중(선결제) + 지급 완료 → evidence_missing", async () => {
    const fx = await setupExpenseProject();
    const payer = await makePayer();
    const first = await approvedOf(fx, await submitInstallment(fx));
    await pay(payer, first);
    const second = await draftOf(fx.pm, fx.lines.split);
    await save(fx.pm, second, { supply: { currency: "KRW", amount: 3_000_000, fxRate: 1 }, prepaid: true, prepaidReason: "행사장 선결제 요구" });
    expect((await submitExpense(fx.pm, { expenseId: second, expectedVersion: (await expenseRow(second)).version })).kind).toBe("submitted");
    expect(await linkedStatusOf(fx, fx.lines.split)).toBe("evidence_missing");
  });

  it("결재 중(증빙 있음) + 구매 요청 `신청됨` → active", async () => {
    const fx = await setupExpenseProject();
    await submitInstallment(fx);
    await requestOn(fx, fx.lines.split);
    expect(await linkedStatusOf(fx, fx.lines.split)).toBe("active");
  });

  it("구매 요청 `신청됨` + 지급 완료 → purchase_requested", async () => {
    const fx = await setupExpenseProject();
    const { paid } = await paidLine(fx);
    expect(paid.number).toBeTruthy();
    await requestOn(fx, fx.lines.withVendor);
    expect(await linkedStatusOf(fx, fx.lines.withVendor)).toBe("purchase_requested");
  });

  it("지급 완료 + 카드 사용 → paid", async () => {
    const fx = await setupExpenseProject();
    const usage = await cardOn(fx, fx.lines.withVendor);
    await setArchived(usage, true, fx.pm.id);
    await paidLine(fx);
    await setArchived(usage, false, fx.pm.id);
    expect(await linkedStatusOf(fx, fx.lines.withVendor)).toBe("paid");
  });

  it("카드 사용만 → card_used · 연결 0 → null(미착수)", async () => {
    const fx = await setupExpenseProject();
    await cardOn(fx, fx.lines.withVendor);
    expect(await linkedStatusOf(fx, fx.lines.withVendor)).toBe("card_used");
    const free = await lineOf(fx.pm, fx.revisionId, fx.lines.split);
    expect(free.linkedStatus).toBeNull();
    expect(lineStatusWord(free)).toBe("미착수");
  });

  it("줄 취소 + 무엇이든(카드 사용) → 낱말 `취소`", async () => {
    const fx = await setupExpenseProject();
    await cardOn(fx, fx.lines.withVendor);
    await db.update(quoteLines).set({ lineStatus: "cancelled" }).where(eq(quoteLines.id, fx.lines.withVendor));
    const line = await lineOf(fx.pm, fx.revisionId, fx.lines.withVendor);
    expect(line.linkedStatus).toBe("card_used");
    expect(lineStatusWord(line)).toBe("취소");
  });
});

describe("증빙 없음 판정 (O-14 · C5)", () => {
  it("선결제 · 지급 뒤 · 증빙 0 → evidence_missing, 면제 기록 뒤 → paid", async () => {
    const fx = await setupExpenseProject();
    const payer = await makePayer();
    const doc = await approvedOf(fx, await submitPrepaid(fx));
    await payOn(payer, doc, seoulToday());
    expect(await linkedStatusOf(fx, fx.lines.withVendor)).toBe("evidence_missing");

    await waiveEvidence(payer, { expenseId: doc.expenseId, version: (await expenseRow(doc.expenseId)).version, reason: "업체 폐업" });
    expect(await linkedStatusOf(fx, fx.lines.withVendor)).toBe("paid");
  });

  it("결재 통과 · 무효 파일만 남음 → evidence_missing", async () => {
    const fx = await setupExpenseProject();
    const doc = await approvedExpenseWithEvidence(fx);
    await voidAll(doc.expenseId);
    expect(await linkedStatusOf(fx, fx.lines.withVendor)).toBe("evidence_missing");
  });
});

describe("종결 제외 (C10 · UC-7)", () => {
  async function rejectedLine(fx: ExpenseFixture) {
    const draft = await draftOf(fx.pm, fx.lines.withVendor);
    const submitted = await submitReadyDraft(fx.pm, draft);
    if (submitted.kind !== "submitted") throw new Error("제출 안 됨");
    await rejectDocument(fx.lead, { instanceId: submitted.instanceId, expectedVersion: submitted.version, reason: "금액 확인" });
    return { expenseId: draft, number: submitted.number };
  }

  it("반려 문서만 → rejected · D-66 이유 그 문서 / 종결 → 미착수 · 연결 없음 · 이유 없음 · 금액 셀 편집 · 줄 저장 통과", async () => {
    const fx = await setupExpenseProject();
    const doc = await rejectedLine(fx);
    const before = await lineOf(fx.pm, fx.revisionId, fx.lines.withVendor);
    expect(before.linkedStatus).toBe("rejected");
    expect(before.readonlyReason).toBe(`지출결의 ${doc.number} 연결됨 · 고치려면 새 차수`);

    await closeExpense(fx.pm, { expenseId: doc.expenseId, expectedVersion: (await expenseRow(doc.expenseId)).version, reason: "업체 취소" });
    const after = await lineOf(fx.pm, fx.revisionId, fx.lines.withVendor);
    expect(after.linkedStatus).toBeNull();
    expect(lineStatusWord(after)).toBe("미착수");
    expect(after.hasLinkedDocuments).toBe(false);
    expect(after.readonlyReason).toBeNull();
    expect(after.cellEditability.execution).toBe("edit");

    const [row] = await db.select().from(quoteLines).where(eq(quoteLines.id, fx.lines.withVendor));
    if (!row) throw new Error("줄 없음");
    await saveQuoteLines(fx.pm, fx.revisionId, {
      rows: [
        {
          id: row.id,
          version: row.version,
          subcategory: row.subcategory,
          itemName: row.itemName,
          vendorId: row.vendorId,
          unitPrice: { currency: "KRW", amount: row.unitPriceAmountKrw, fxRate: 1 },
          execution: { currency: "KRW", amount: 12_000_000, fxRate: 1 },
        },
      ],
    });
    const [saved] = await db.select({ execution: quoteLines.executionAmountKrw }).from(quoteLines).where(eq(quoteLines.id, fx.lines.withVendor));
    expect(saved?.execution).toBe(12_000_000);
  });

  it("종결 문서 + 종결 안 된 결재 중 문서 → readonlyReason은 남은 문서 번호", async () => {
    const fx = await setupExpenseProject();
    const closed = await rejectedLine(fx);
    await closeExpense(fx.pm, { expenseId: closed.expenseId, expectedVersion: (await expenseRow(closed.expenseId)).version, reason: "업체 취소" });
    const next = await submitReadyDraft(fx.pm, await draftOf(fx.pm, fx.lines.withVendor));
    if (next.kind !== "submitted") throw new Error("제출 안 됨");
    const line = await lineOf(fx.pm, fx.revisionId, fx.lines.withVendor);
    expect(line.linkedStatus).toBe("active");
    expect(line.readonlyReason).toBe(`지출결의 ${next.number} 연결됨 · 고치려면 새 차수`);
  });
});

describe("선결제 기한 2행", () => {
  it("기한(14일)이 16일 지난 선결제 · 증빙 0 → prepaidOverdueDays 16, 면제 뒤 → null", async () => {
    const fx = await setupExpenseProject();
    const payer = await makePayer();
    const doc = await approvedOf(fx, await submitPrepaid(fx));
    await payOn(payer, doc, addDays(seoulToday(), -30));
    expect((await lineOf(fx.pm, fx.revisionId, fx.lines.withVendor)).prepaidOverdueDays).toBe(16);

    await waiveEvidence(payer, { expenseId: doc.expenseId, version: (await expenseRow(doc.expenseId)).version, reason: "업체 폐업" });
    expect((await lineOf(fx.pm, fx.revisionId, fx.lines.withVendor)).prepaidOverdueDays).toBeNull();
  });
});

describe("새 차수 뒤 같은 상태", () => {
  it("지급 완료 줄 · 카드 사용 줄을 새 차수로 복사 → 복사 줄도 paid · card_used", async () => {
    const fx = await setupExpenseProject();
    await paidLine(fx);
    await cardOn(fx, fx.lines.noVendor);
    const extra = await addApprovedRevision(fx, []);
    expect(await linkedStatusOf(fx, extra.lineIds.get("무대 제작") ?? "", extra.revisionId)).toBe("paid");
    expect(await linkedStatusOf(fx, extra.lineIds.get("현장 진행 인력") ?? "", extra.revisionId)).toBe("card_used");
  });
});

describe("지출결의 쪽 게이트 (EXP-07 · D-609)", () => {
  it("카드 사용 2건 줄에 제출 → `카드 사용 2건 연결됨 · 지출결의는 다른 줄`", async () => {
    const fx = await setupExpenseProject();
    const draft = await draftOf(fx.pm, fx.lines.withVendor);
    await cardOn(fx, fx.lines.withVendor);
    await cardOn(fx, fx.lines.withVendor);
    const error = await caught(submitReadyDraft(fx.pm, draft));
    expect(error).toBeInstanceOf(GateBlockedError);
    expect((error as Error).message).toBe("카드 사용 2건 연결됨 · 지출결의는 다른 줄");
    expect((await expenseRow(draft)).number).toBeNull();
  });

  it("구매 요청 `신청됨` 줄에 제출 → `구매 요청 1건 연결됨 · 지출결의는 다른 줄`", async () => {
    const fx = await setupExpenseProject();
    const draft = await draftOf(fx.pm, fx.lines.withVendor);
    await requestOn(fx, fx.lines.withVendor);
    const error = await caught(submitReadyDraft(fx.pm, draft));
    expect((error as Error).message).toBe("구매 요청 1건 연결됨 · 지출결의는 다른 줄");
  });

  it("온라인구매 협력사 줄에 제출 → purchase.line-door `온라인구매 협력사 줄 · 구매 요청으로`", async () => {
    const fx = await setupExpenseProject();
    const draft = await draftOf(fx.pm, fx.lines.withVendor);
    await setSettingValue(SYSTEM_VIEWER, PURCHASE_ONLINE_VENDOR_NAME, "스테이지원");
    const error = await caught(submitReadyDraft(fx.pm, draft));
    expect(error).toBeInstanceOf(GateBlockedError);
    expect((error as Error).message).toBe("온라인구매 협력사 줄 · 구매 요청으로");
    expect((await expenseRow(draft)).number).toBeNull();
  });

  it("[H-4] 보관된 카드 사용만 있는 줄 → 제출 통과 · 상태에 카드 사용 없음", async () => {
    const fx = await setupExpenseProject();
    const draft = await draftOf(fx.pm, fx.lines.withVendor);
    await setArchived(await cardOn(fx, fx.lines.withVendor), true, fx.pm.id);
    expect(await linkedStatusOf(fx, fx.lines.withVendor)).toBeNull();
    expect((await submitReadyDraft(fx.pm, draft)).kind).toBe("submitted");
    expect(await linkedStatusOf(fx, fx.lines.withVendor)).toBe("active");
  });

  // 검토 S-1(T-06-13-01) — 줄 id는 트랜잭션 전에 읽는다. 프로젝트 행을 쥔 사이 초안의 줄이 바뀌면 잠그지 않은 줄로 판정하지 않고 충돌로 막는다.
  it("[검토 S-1] 사전 조회 뒤 초안의 줄이 바뀜 → ExpenseConflictError · 번호 없음", async () => {
    const fx = await setupExpenseProject();
    const draft = await draftOf(fx.pm, fx.lines.withVendor);
    await attachEvidence(fx.pm, draft);
    const { version } = await expenseRow(draft);
    const holder = await pool.connect();
    let outcome: unknown;
    try {
      await holder.query("BEGIN");
      await holder.query("SELECT id FROM projects WHERE id = $1 FOR UPDATE", [fx.projectId]);
      const submitting = submitExpense(fx.pm, { expenseId: draft, expectedVersion: version });
      await waitForLockWaiter(pool);
      await holder.query("UPDATE expenses SET quote_line_id = $1 WHERE id = $2", [fx.lines.split, draft]);
      await holder.query("COMMIT");
      outcome = await caught(submitting);
    } finally {
      holder.release();
    }
    expect(outcome).toBeInstanceOf(ExpenseConflictError);
    expect((await expenseRow(draft)).number).toBeNull();
  });
});

describe("행 행동 조합 (S14 · rowActionBlock — 06-18 소비 계약)", () => {
  const usage = (lineId: string) => ({ id: randomUUID(), quoteLineId: lineId, supplyKrw: 100_000 });
  const noLinks = { expenses: [], cardUsages: [], purchaseRequests: [] };

  it("조합표 — 온라인구매 × open → 막힘 없음 / 일반 × open × 카드 2건 → 이유 + `카드 사용 등록` / no_vendor · none → 05 그대로", () => {
    expect(rowActionBlock({ lineId: "L", branch: "purchase", door: "open", links: noLinks, paid: [] })).toBeNull();
    expect(rowActionBlock({ lineId: "L", branch: "expense", door: "open", links: { ...noLinks, cardUsages: [usage("L"), usage("L")] }, paid: [] })).toEqual({
      reason: "카드 사용 2건 연결됨 · 지출결의는 다른 줄",
      next: { label: "카드 사용 등록", href: "/cards?new=1&line=L" },
    });
    expect(rowActionBlock({ lineId: "L", branch: "expense", door: "no_vendor", links: { ...noLinks, cardUsages: [usage("L")] }, paid: [] })).toBeNull();
    expect(rowActionBlock({ lineId: "L", branch: "expense", door: "none", links: { ...noLinks, cardUsages: [usage("L")] }, paid: [] })).toBeNull();
  });

  it("조합표 — 온라인구매 × 지출결의 연결 → `지출결의 {번호} 연결됨 · 카드 사용은 다른 줄` / 일반 × closed × 지급 완료 → `지급 완료 {번호} · 새 지출결의 없음`", async () => {
    const fx = await setupExpenseProject();
    const { paid } = await paidLine(fx);
    const links = (await findLineLinks(fx.pm, [fx.lines.withVendor])).get(fx.lines.withVendor);
    if (!links) throw new Error("연결 없음");
    expect(rowActionBlock({ lineId: fx.lines.withVendor, branch: "purchase", door: "closed", links, paid: [] })).toEqual({
      reason: `지출결의 ${paid.number} 연결됨 · 카드 사용은 다른 줄`,
    });
    expect(
      rowActionBlock({ lineId: fx.lines.withVendor, branch: "expense", door: "closed", links, paid: [{ number: paid.number, installment: false, paid: true }] }),
    ).toEqual({ reason: `지급 완료 ${paid.number} · 새 지출결의 없음` });
    expect(rowActionBlock({ lineId: fx.lines.withVendor, branch: "expense", door: "closed", links, paid: [{ number: paid.number, installment: false, paid: false }] })).toBeNull();
  });

  it("listLineDoors — 카드 2건 줄은 막힘 + 다음 한 수, 온라인구매 협력사 줄은 `구매 요청` 문(목적지 `/cards/purchases?new=1&line=`) · 제출 거부와 같은 문자열", async () => {
    const fx = await setupExpenseProject();
    await cardOn(fx, fx.lines.split);
    await cardOn(fx, fx.lines.split);
    const before = await listLineDoors(fx.pm, { projectId: fx.projectId });
    expect(before.cells[fx.lines.split]).toMatchObject({
      state: "open",
      branch: "expense",
      blocked: { reason: "카드 사용 2건 연결됨 · 지출결의는 다른 줄", next: { label: "카드 사용 등록", href: `/cards?new=1&line=${fx.lines.split}` } },
    });
    expect(before.cells[fx.lines.withVendor]).toMatchObject({ state: "open", branch: "expense" });
    expect(before.cells[fx.lines.withVendor]?.blocked).toBeUndefined();
    const rejected = await caught(submitReadyDraft(fx.pm, await draftOf(fx.pm, fx.lines.split)));
    expect((rejected as Error).message).toBe(before.cells[fx.lines.split]?.blocked?.reason);

    await setSettingValue(SYSTEM_VIEWER, PURCHASE_ONLINE_VENDOR_NAME, "스테이지원");
    const after = await listLineDoors(fx.pm, { projectId: fx.projectId });
    expect(after.cells[fx.lines.withVendor]).toMatchObject({ branch: "purchase", purchaseHref: `/cards/purchases?new=1&line=${fx.lines.withVendor}` });
    expect(after.cells[fx.lines.withVendor]?.blocked).toBeUndefined();
    expect(after.cells[fx.lines.noVendor]).toMatchObject({ state: "no_vendor", branch: "expense" });
  });

  it("[감사 D-2] 쓸 카드가 없는 사람에게는 다음 한 수 `카드 사용 등록`을 싣지 않는다 · 이유는 그대로", async () => {
    const fx = await setupExpenseProject();
    await cardOn(fx, fx.lines.split);
    await cardOn(fx, fx.lines.split);
    await db.update(corpCards).set({ active: false }).where(eq(corpCards.holderUserId, fx.pm.id));
    const doors = await listLineDoors(fx.pm, { projectId: fx.projectId });
    expect(doors.cells[fx.lines.split]?.blocked).toEqual({ reason: "카드 사용 2건 연결됨 · 지출결의는 다른 줄" });
  });

  it("[검토 I-2] 온라인구매 줄 막힘 이유 = 카드 사용 등록 서버 거부 문구 `지출결의 {번호} 연결됨 · 카드 사용은 다른 줄`", async () => {
    const fx = await setupExpenseProject();
    const draft = await draftOf(fx.pm, fx.lines.withVendor);
    expect((await submitReadyDraft(fx.pm, draft)).kind).toBe("submitted");
    const { number } = await expenseRow(draft);
    const rejected = await caught(cardOn(fx, fx.lines.withVendor));
    expect((rejected as Error).message).toBe(`지출결의 ${number} 연결됨 · 카드 사용은 다른 줄`);

    await setSettingValue(SYSTEM_VIEWER, PURCHASE_ONLINE_VENDOR_NAME, "스테이지원");
    const doors = await listLineDoors(fx.pm, { projectId: fx.projectId });
    expect(doors.cells[fx.lines.withVendor]).toMatchObject({ branch: "purchase", blocked: { reason: (rejected as Error).message } });
  });
});

describe("카드 붙잡은 줄 저장 응답 (N-3 · S14 — 화면은 저장 응답 줄로 다시 그린다)", () => {
  it("카드 600,000 줄의 실행가를 500,000으로 내려 일괄 저장 → 응답 줄 hasCardSideLinks · executionOverKrw 100,000", async () => {
    const fx = await setupExpenseProject();
    await cardOn(fx, fx.lines.withVendor, 600_000);
    const [row] = await db.select().from(quoteLines).where(eq(quoteLines.id, fx.lines.withVendor));
    if (!row) throw new Error("줄 없음");
    const result = await saveProjectLedger(fx.pm, fx.projectId, {
      seenStatus: "in_progress",
      quoteLines: {
        revisionId: fx.revisionId,
        rows: [
          {
            id: row.id,
            version: row.version,
            subcategory: row.subcategory,
            itemName: row.itemName,
            unitPrice: { currency: "KRW", amount: row.unitPriceAmountKrw, fxRate: 1 },
            execution: { currency: "KRW", amount: 500_000, fxRate: 1 },
          },
        ],
      },
    });
    expect(result.quoteLines?.lines.find((line) => line.id === fx.lines.withVendor)).toMatchObject({ hasCardSideLinks: true, executionOverKrw: 100_000 });
  });
});
