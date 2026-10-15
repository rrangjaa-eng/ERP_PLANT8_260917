import { randomUUID } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as XLSX from "xlsx";
import { db } from "@/db/client";
import { actionLog, expenses, files, quoteLines, users, vendors } from "@/db/schema";
import { voidEvidence } from "@/domain/evidence";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { insertVendor } from "@/repositories/vendors";
import { changeExpensePayeeUser, createExpenseFromLines } from "@/domain/expenses";
import { approveDocument } from "@/domain/approvals";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { listPaymentTargets } from "@/domain/payments/targets";
import { decrypt } from "@/lib/crypto";
import { ForbiddenError } from "@/domain/permissions/can";
import { PayableChangedError, PaymentNotFoundError, previewPayable } from "@/domain/payments";
import { DIFF_REASON_REQUIRED } from "@/domain/payments/action-row";
import { exportBankTransferFile, summarizeTransferPayees } from "@/domain/payments/bank-transfer";
import { BANK_TRANSFER_HEADER } from "@/domain/bank-transfer";
import { seoulToday } from "@/lib/dates";
import { DTO_REGISTRY } from "@/domain/permissions/dto-registry";
import { exportBankTransferFileAction } from "@/app/(app)/expenses/actions";
import { addApprovedRevision, makeEvidenceManager, setupExpenseProject, submitReadyDraft, testVendorAccount, type ExpenseFixture } from "./fixtures/expenses";
import { makePerson } from "./approvals-fixtures";
import { approvedExpenseWithoutEvidence, makePaymentManager, setEvidenceRequired, type ApprovedExpense } from "./fixtures/payments";

// 06.5-06(D-6504 · UI-SPEC V5): 신한 대량이체 파일 — 고정 게이트(지급 쓰기 ∧ 계좌 해제 항목 ∧ 금액 보임) · 재판정 · 문서 지급처 계좌 ·
// 직렬화 전 excel_export 기록(평문 계좌 없음). 문서는 06-15 일괄 지급 픽스처(증빙 0 · 증빙 필수 끔 = P4)로 만든다.

const PLAIN_NUMBER = "110123456789";

// 액션 경로 시험(검토 P2-2)은 authedActionClient를 거친다 — 세션만 바꿔 끼운다(payment-batch.test.ts 꼴).
const session = vi.hoisted(() => ({ viewer: null as Viewer | null }));
vi.mock("@/lib/viewer", () => ({
  getSession: () => Promise.resolve(session.viewer ? { viewer: session.viewer, user: { id: session.viewer.id } } : null),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

beforeEach(async () => {
  await setEvidenceRequired(false);
});

async function makeExporter(name?: string, hidden: readonly string[] = []): Promise<Viewer> {
  const payer = await makePaymentManager(name);
  if (!payer.roleId) throw new Error("계급 없음");
  for (const infoItem of ["expense.value", "expense.amount", "vendor.value", "vendor.account_number_unmasked"]) {
    await upsertVisibility(SYSTEM_VIEWER, { roleId: payer.roleId, infoItem, visible: !hidden.includes(infoItem) });
  }
  return payer;
}

async function versionOf(expenseId: string): Promise<number> {
  const [row] = await db.select({ version: expenses.version }).from(expenses).where(eq(expenses.id, expenseId));
  if (!row) throw new Error("지출결의 없음");
  return row.version;
}

async function snapshotOf(payer: Viewer, doc: ApprovedExpense, extra: { transferKrw?: number; diffReason?: string } = {}) {
  const preview = await previewPayable(payer, { expenseId: doc.expenseId, payDate: seoulToday() });
  if (typeof preview.payableKrw !== "number") throw new Error("지급 총액 없음");
  return { expenseId: doc.expenseId, expenseVersion: await versionOf(doc.expenseId), expectedPayableKrw: preview.payableKrw, ...extra };
}

function readFile(base64: string): XLSX.WorkBook {
  return XLSX.read(Buffer.from(base64, "base64"), { type: "buffer", cellNF: true });
}

// SheetJS 시트 색인은 형이 넓다 — 셀 꼴로 좁혀 읽는다.
function cellAt(sheet: XLSX.WorkSheet, ref: string): XLSX.CellObject | undefined {
  return sheet[ref] as XLSX.CellObject | undefined;
}

async function exportLogs(actorId: string) {
  return db
    .select()
    .from(actionLog)
    .where(and(eq(actionLog.actorId, actorId), eq(actionLog.actionType, "excel_export"), eq(actionLog.entity, "bank_transfer")));
}

describe("신한 이체 파일(06.5 D-6504)", () => {
  it("계좌 있는 거래처의 계좌이체 1건 → 입력정보 시트 · 머리글 9칸 · 둘째 줄 A셀 문자열 088 · 서식 @ · D셀 이체액 글자, excel_export 기록 한 줄(평문 · 암호문 없음)", async () => {
    const payer = await makeExporter();
    const fx = await setupExpenseProject();
    const doc = await approvedExpenseWithoutEvidence(fx);
    const snapshot = await snapshotOf(payer, doc);

    const result = await exportBankTransferFile(payer, { rows: [snapshot] });
    expect(result).toMatchObject({ lineCount: 1, docCount: 1, blocked: [], filename: `이체파일_${seoulToday()}.xlsx` });
    expect(result.time).toMatch(/^\d{2}:\d{2}$/);

    const book = readFile(result.base64);
    expect(book.SheetNames).toEqual(["입력정보"]);
    const sheet = book.Sheets["입력정보"];
    if (!sheet) throw new Error("시트 없음");
    const header = BANK_TRANSFER_HEADER.map((_, c) => cellAt(sheet, XLSX.utils.encode_cell({ r: 0, c }))?.v);
    expect(header).toEqual([...BANK_TRANSFER_HEADER]);
    const bankCell = cellAt(sheet, "A2");
    expect(bankCell?.t).toBe("s");
    expect(bankCell?.v).toBe("088");
    expect(bankCell?.z).toBe("@");
    expect(cellAt(sheet, "B2")?.v).toBe(PLAIN_NUMBER);
    expect(cellAt(sheet, "D2")?.t).toBe("s");
    expect(cellAt(sheet, "D2")?.v).toBe(String(snapshot.expectedPayableKrw));
    expect(cellAt(sheet, "A3")).toBeUndefined();

    const logs = await exportLogs(payer.id);
    expect(logs).toHaveLength(1);
    const detail = logs[0]?.detail as Record<string, unknown>;
    expect(detail).toMatchObject({ requestedDocs: 1, expenseIds: [doc.expenseId], vendorIds: [fx.stageOneId], userIds: [] });
    expect(detail.lines).toEqual([{ payeeKey: `v:${fx.stageOneId}`, totalKrw: snapshot.expectedPayableKrw, expenseIds: [doc.expenseId] }]);
    const text = JSON.stringify(logs[0]);
    expect(text).not.toContain(PLAIN_NUMBER);
    expect(text).not.toContain("110-123");
    expect(text).not.toContain("v1:");
  });

  it("기록 함수가 던지면 파일이 없다 — 기록은 직렬화보다 앞", async () => {
    const payer = await makeExporter();
    const fx = await setupExpenseProject();
    const doc = await approvedExpenseWithoutEvidence(fx);
    const snapshot = await snapshotOf(payer, doc);
    const order: string[] = [];

    await expect(
      exportBankTransferFile(
        payer,
        { rows: [snapshot] },
        {
          recordAction: () => {
            order.push("record");
            return Promise.reject(new Error("기록 실패"));
          },
          buildXlsx: () => {
            order.push("build");
            return new Uint8Array();
          },
        },
      ),
    ).rejects.toThrow("기록 실패");
    expect(order).toEqual(["record"]);
  });

  it("고정 게이트 — 지급 쓰기 없음 · 계좌 해제 항목 없음 · 금액 숨김이면 ForbiddenError", async () => {
    const fx = await setupExpenseProject();
    const doc = await approvedExpenseWithoutEvidence(fx);
    const payer = await makeExporter();
    const snapshot = await snapshotOf(payer, doc);

    await expect(exportBankTransferFile(fx.pm, { rows: [snapshot] })).rejects.toBeInstanceOf(ForbiddenError);
    const noReveal = await makeExporter("해제없음", ["vendor.account_number_unmasked"]);
    await expect(exportBankTransferFile(noReveal, { rows: [snapshot] })).rejects.toBeInstanceOf(ForbiddenError);
    const noAmount = await makeExporter("금액숨김", ["expense.amount"]);
    await expect(exportBankTransferFile(noAmount, { rows: [snapshot] })).rejects.toBeInstanceOf(ForbiddenError);
    expect(await exportLogs(noAmount.id)).toHaveLength(0);
  });
});

// 06.5-06 Task 2(UI-SPEC V5 막힌 건 이유 표 1~14 · 결정 맥락 8 · 10 · 11 · 15): 막힌 건은 빼고 나머지를 담는다.
// 문서는 거래처 계좌가 있는 지급처로 결재를 통과시킨 뒤(06.5-05 V4 제출 게이트) 테스트 준비로 문서 행 칸을 바꾼다.

// 고객 승인 차수는 한 번에 하나만 더할 수 있다 — 한 테스트의 줄은 한 차수에 모아 만든다(payment-batch.test.ts extraLines 꼴).
async function linesFor(fx: ExpenseFixture, count: number): Promise<string[]> {
  const names = Array.from({ length: count }, (_, index) => `이체 줄 ${index + 1}-${randomUUID().slice(0, 4)}`);
  const { lineIds } = await addApprovedRevision(
    fx,
    names.map((itemName, index) => ({ itemName, vendorId: fx.stageOneId, execution: { currency: "KRW" as const, amount: 1_000_000 + index * 10_000, fxRate: 1 } })),
  );
  return names.map((name) => {
    const id = lineIds.get(name);
    if (!id) throw new Error(`줄 없음: ${name}`);
    return id;
  });
}

async function docsFor(fx: ExpenseFixture, count: number): Promise<ApprovedExpense[]> {
  const docs: ApprovedExpense[] = [];
  for (const lineId of await linesFor(fx, count)) docs.push(await approvedExpenseWithoutEvidence(fx, lineId));
  return docs;
}

function take<T>(items: readonly T[], index: number): T {
  const item = items[index];
  if (item === undefined) throw new Error("픽스처 모자람");
  return item;
}

async function vendorWith(account: Partial<ReturnType<typeof testVendorAccount>> | null): Promise<string> {
  const suffix = randomUUID().slice(0, 6);
  const row = await insertVendor(SYSTEM_VIEWER, { name: `이체거래처-${suffix}`, normalizedName: `이체거래처-${suffix}`, ...(account ? { ...testVendorAccount(), ...account } : {}) });
  return row.id;
}

async function setDoc(doc: ApprovedExpense, values: Partial<typeof expenses.$inferInsert>): Promise<void> {
  await db.update(expenses).set(values).where(eq(expenses.id, doc.expenseId));
}

function blockedOf(result: { blocked: { expenseId: string; text: string; link: { label: string; href: string } | null }[] }, expenseId: string) {
  return result.blocked.find((item) => item.expenseId === expenseId);
}

// 06-15 일괄 지급 픽스처(payment-batch.test.ts employeePayeeDoc)와 같은 꼴 — 계좌 있는 직원을 지급처로 고른 뒤 결재 통과.
async function employeeDoc(fx: ExpenseFixture, name: string, lineId: string): Promise<{ doc: ApprovedExpense; userId: string }> {
  const person = await makePerson(name, DEFAULT_ROLE_ID, "기획1팀");
  await db.update(users).set(testVendorAccount()).where(eq(users.id, person.id));
  const expenseId = (await createExpenseFromLines(fx.pm, { lineIds: [lineId] })).created[0]?.expenseId;
  if (!expenseId) throw new Error("작성 중 문서를 만들지 못했다");
  await changeExpensePayeeUser(fx.pm, { expenseId, userId: person.id, expectedVersion: await versionOf(expenseId) });
  const submitted = await submitReadyDraft(fx.pm, expenseId);
  if (submitted.kind !== "submitted") throw new Error("제출 안 됨");
  const first = await approveDocument(fx.lead, { instanceId: submitted.instanceId, expectedVersion: submitted.version });
  await approveDocument(fx.ceo, { instanceId: submitted.instanceId, expectedVersion: first.version });
  // 증빙 0 = P4(증빙 필수 끔) — approvedExpenseWithoutEvidence와 같이 붙은 증빙을 무효로 한다.
  const voider = await makeEvidenceManager("증빙무효", { attach: false, void: true });
  const alive = await db
    .select({ id: files.id })
    .from(files)
    .where(and(eq(files.ownerKind, "expense"), eq(files.ownerId, expenseId), isNull(files.removedAt), isNull(files.voidedAt)));
  for (const file of alive) await voidEvidence(voider, { fileId: file.id, reason: "다른 건 영수증" });
  return { doc: { expenseId, instanceId: submitted.instanceId, number: submitted.number, version: await versionOf(expenseId) }, userId: person.id };
}

describe("신한 이체 파일 — 막힌 건(06.5 Task 2)", () => {
  it("6건 섞음 — 정상 1건만 담기고 현금 · 법인카드 · 지급처 없음 · 계좌 없음 · 은행 이름 오류는 이유와 함께 막힌다(평문 없음)", async () => {
    const payer = await makeExporter();
    if (!payer.roleId) throw new Error("계급 없음");
    await upsertPermission(SYSTEM_VIEWER, { roleId: payer.roleId, menu: "admin.vendors", action: "write", allowed: true });
    const fx = await setupExpenseProject();
    const [ok, cash, card, noPayee, noAccount, badBank] = await docsFor(fx, 6);
    if (!ok || !cash || !card || !noPayee || !noAccount || !badBank) throw new Error("픽스처 모자람");
    await setDoc(cash, { paymentMethod: "cash" });
    await setDoc(card, { paymentMethod: "corp_card" });
    await setDoc(noPayee, { vendorId: null });
    const noAccountVendor = await vendorWith(null);
    await setDoc(noAccount, { vendorId: noAccountVendor });
    const badBankVendor = await vendorWith({ accountBank: "없는은행" });
    await setDoc(badBank, { vendorId: badBankVendor });

    const docs = [ok, cash, card, noPayee, noAccount, badBank];
    const result = await exportBankTransferFile(payer, { rows: await Promise.all(docs.map((doc) => snapshotOf(payer, doc))) });
    expect(result.docCount).toBe(1);
    expect(result.lineCount).toBe(1);
    expect(blockedOf(result, cash.expenseId)).toEqual({ expenseId: cash.expenseId, text: "계좌이체 아님", link: null });
    expect(blockedOf(result, card.expenseId)?.text).toBe("계좌이체 아님");
    expect(blockedOf(result, noPayee.expenseId)).toEqual({ expenseId: noPayee.expenseId, text: "지급처 없음", link: { label: "문서 확인", href: `/expenses/${noPayee.expenseId}` } });
    expect(blockedOf(result, noAccount.expenseId)).toEqual({
      expenseId: noAccount.expenseId,
      text: "계좌 없음",
      link: { label: "거래처 계좌 등록", href: `/admin/vendors?editId=${noAccountVendor}` },
    });
    expect(blockedOf(result, badBank.expenseId)).toEqual({
      expenseId: badBank.expenseId,
      text: "은행 코드 없음",
      link: { label: "은행 이름 고치기", href: `/admin/vendors?editId=${badBankVendor}` },
    });
    expect(result.blocked.map((item) => item.expenseId)).toEqual(docs.slice(1).map((doc) => doc.expenseId));
    const text = JSON.stringify({ ...result, base64: "" });
    expect(text).not.toContain(PLAIN_NUMBER);
    expect(text).not.toContain("v1:");
    const logs = await exportLogs(payer.id);
    expect(logs[0]?.detail).toMatchObject({ requestedDocs: 6, expenseIds: [ok.expenseId], vendorIds: [fx.stageOneId] });
  });

  it("예금주 이모지 → 예금주 형식 오류 · 복호화 실패 → 계좌번호 형식 오류(그 행만), 나머지는 파일에 든다 · 결과에 암호문 없음", async () => {
    const payer = await makeExporter();
    if (!payer.roleId) throw new Error("계급 없음");
    await upsertPermission(SYSTEM_VIEWER, { roleId: payer.roleId, menu: "admin.vendors", action: "write", allowed: true });
    const fx = await setupExpenseProject();
    const docs = await docsFor(fx, 3);
    const [ok, emoji, broken] = [take(docs, 0), take(docs, 1), take(docs, 2)];
    await setDoc(emoji, { vendorId: await vendorWith({ accountHolder: "김😀" }) });
    const brokenVendor = await vendorWith({});
    await setDoc(broken, { vendorId: brokenVendor });
    const [brokenRow] = await db.select({ cipher: vendors.accountNumberEncrypted }).from(vendors).where(eq(vendors.id, brokenVendor));
    const badCipher = brokenRow?.cipher ?? "";

    const result = await exportBankTransferFile(
      payer,
      { rows: [await snapshotOf(payer, ok), await snapshotOf(payer, emoji), await snapshotOf(payer, broken)] },
      {
        decrypt: (ciphertext) => {
          if (ciphertext === badCipher) throw new Error("복호화 실패");
          return decrypt(ciphertext);
        },
      },
    );
    expect(result.docCount).toBe(1);
    expect(blockedOf(result, emoji.expenseId)?.text).toBe("예금주 형식 오류");
    expect(blockedOf(result, broken.expenseId)).toMatchObject({ text: "계좌번호 형식 오류", link: { label: "계좌 고치기" } });
    const text = JSON.stringify({ ...result, base64: "" });
    expect(text).not.toContain(badCipher);
    expect(text).not.toContain(PLAIN_NUMBER);
  });

  it("없는 문서 id는 없는 지출결의 문구 · 지급 대상이 아닌 문서는 그 판정 이유로 막히고 그 거래처는 결과 · 기록에 없다 · 같은 id 둘은 한 번만", async () => {
    const payer = await makeExporter();
    const fx = await setupExpenseProject();
    const lines = await linesFor(fx, 2);
    const doc = await approvedExpenseWithoutEvidence(fx, take(lines, 0));
    const otherVendor = await vendorWith({});
    const draftId = (await createExpenseFromLines(fx.pm, { lineIds: [take(lines, 1)] })).created[0]?.expenseId;
    if (!draftId) throw new Error("작성 중 문서 없음");
    await db.update(expenses).set({ vendorId: otherVendor }).where(eq(expenses.id, draftId));
    const snapshot = await snapshotOf(payer, doc);
    const ghost = { expenseId: draftId, expenseVersion: await versionOf(draftId), expectedPayableKrw: snapshot.expectedPayableKrw };

    const missing = { expenseId: randomUUID(), expenseVersion: 1, expectedPayableKrw: snapshot.expectedPayableKrw };

    const result = await exportBankTransferFile(payer, { rows: [snapshot, ghost, missing, snapshot] });
    expect(result.lineCount).toBe(1);
    expect(result.docCount).toBe(1);
    expect(blockedOf(result, missing.expenseId)).toEqual({ expenseId: missing.expenseId, text: new PaymentNotFoundError().message, link: null });
    // 작성 중 문서는 일괄 지급과 같은 재판정 이유(고를 수 없음)로 막힌다(UI-SPEC V5 2번).
    expect(blockedOf(result, draftId)).toEqual({ expenseId: draftId, text: "결재 통과 전 · 제출 전", link: null });
    const sheet = readFile(result.base64).Sheets["입력정보"];
    if (!sheet) throw new Error("시트 없음");
    expect(cellAt(sheet, "D2")?.v).toBe(String(snapshot.expectedPayableKrw));
    expect(cellAt(sheet, "A3")).toBeUndefined();
    const logs = await exportLogs(payer.id);
    expect(JSON.stringify(logs)).not.toContain(otherVendor);
    expect(JSON.stringify({ ...result, base64: "" })).not.toContain(otherVendor);
  });

  it("차이 사유 없는 편집 이체액은 막히고 사유 있는 편집액은 파일 D셀 · 예상 지급액이 낡으면 지급 총액 바뀜 문구", async () => {
    const payer = await makeExporter();
    const fx = await setupExpenseProject();
    const docs = await docsFor(fx, 3);
    const [noReason, withReason, stale] = [take(docs, 0), take(docs, 1), take(docs, 2)];
    const a = await snapshotOf(payer, noReason);
    const b = await snapshotOf(payer, withReason);
    const c = await snapshotOf(payer, stale);

    const result = await exportBankTransferFile(payer, {
      rows: [
        { ...a, transferKrw: a.expectedPayableKrw - 1_000 },
        { ...b, transferKrw: b.expectedPayableKrw - 1_000, diffReason: "수수료" },
        { ...c, expectedPayableKrw: c.expectedPayableKrw + 1 },
      ],
    });
    expect(blockedOf(result, noReason.expenseId)?.text).toBe(DIFF_REASON_REQUIRED);
    expect(blockedOf(result, stale.expenseId)?.text).toBe(new PayableChangedError(c.expectedPayableKrw, seoulToday()).message);
    expect(result.docCount).toBe(1);
    const sheet = readFile(result.base64).Sheets["입력정보"];
    if (!sheet) throw new Error("시트 없음");
    expect(cellAt(sheet, "D2")?.v).toBe(String(b.expectedPayableKrw - 1_000));
  });

  it("액션 경로(검토 P2-2) — 차이 사유 없는 · 공백뿐인 편집 이체액 행은 그 행만 기존 문구로 막히고 나머지 행은 파일에 든다", async () => {
    const payer = await makeExporter();
    const fx = await setupExpenseProject();
    const docs = await docsFor(fx, 3);
    const [noReason, blank, ok] = [take(docs, 0), take(docs, 1), take(docs, 2)];
    const a = await snapshotOf(payer, noReason);
    const b = await snapshotOf(payer, blank);
    const c = await snapshotOf(payer, ok);
    session.viewer = payer;

    const response = await exportBankTransferFileAction({
      rows: [
        { ...a, transferKrw: a.expectedPayableKrw - 1_000 },
        { ...b, transferKrw: b.expectedPayableKrw - 1_000, diffReason: "   " },
        c,
      ],
    });
    expect(response?.validationErrors).toBeUndefined();
    expect(response?.data?.docCount).toBe(1);
    expect(response?.data?.blocked).toEqual([
      { expenseId: noReason.expenseId, text: DIFF_REASON_REQUIRED, link: null },
      { expenseId: blank.expenseId, text: DIFF_REASON_REQUIRED, link: null },
    ]);
    expect((await exportLogs(payer.id))[0]?.detail).toMatchObject({ expenseIds: [ok.expenseId] });
  });

  it("받은 건 0(전부 막힘)이면 파일 · excel_export 기록 · 직렬화가 없고 막힌 건만 돌려준다(검토 P3-1)", async () => {
    const payer = await makeExporter();
    const fx = await setupExpenseProject();
    const [cash] = await docsFor(fx, 1);
    if (!cash) throw new Error("픽스처 모자람");
    await setDoc(cash, { paymentMethod: "cash" });
    let built = 0;

    const result = await exportBankTransferFile(
      payer,
      { rows: [await snapshotOf(payer, cash)] },
      {
        buildXlsx: () => {
          built += 1;
          return new Uint8Array();
        },
      },
    );
    expect(result).toMatchObject({ lineCount: 0, docCount: 0, base64: "", blocked: [{ expenseId: cash.expenseId, text: "계좌이체 아님", link: null }] });
    expect(built).toBe(0);
    expect(await exportLogs(payer.id)).toHaveLength(0);
  });

  it("직원 지급처 — 계좌 권한이 있으면 그 직원 예금주로 담기고 userIds에 실린다 · 없으면 그 행만 막히고 거래처 행은 담긴다", async () => {
    const fx = await setupExpenseProject();
    const lines = await linesFor(fx, 2);
    const { doc: personDoc, userId } = await employeeDoc(fx, "김이체직원", take(lines, 0));
    const vendorDoc = await approvedExpenseWithoutEvidence(fx, take(lines, 1));

    const allowed = await makeExporter("직원계좌");
    if (!allowed.roleId) throw new Error("계급 없음");
    await upsertPermission(SYSTEM_VIEWER, { roleId: allowed.roleId, menu: "admin.people", action: "view", allowed: true });
    await upsertVisibility(SYSTEM_VIEWER, { roleId: allowed.roleId, infoItem: "person.value", visible: true });
    const okResult = await exportBankTransferFile(allowed, { rows: [await snapshotOf(allowed, personDoc)] });
    expect(okResult.docCount).toBe(1);
    const sheet = readFile(okResult.base64).Sheets["입력정보"];
    if (!sheet) throw new Error("시트 없음");
    expect(cellAt(sheet, "C2")?.v).toBe("테스트 예금주");
    expect((await exportLogs(allowed.id))[0]?.detail).toMatchObject({ userIds: [userId], vendorIds: [], lines: [{ payeeKey: `p:${userId}` }] });

    const denied = await makeExporter("직원계좌없음");
    const result = await exportBankTransferFile(denied, { rows: [await snapshotOf(denied, personDoc), await snapshotOf(denied, vendorDoc)] });
    expect(blockedOf(result, personDoc.expenseId)?.text).toBe("직원 계좌 권한 없음 · 권한 설정은 관리자");
    expect(result.docCount).toBe(1);
  });

  it("직원 계좌 권한이 없는 소계 읽기에는 직원 지급처 묶음 · 사용자 id가 없다 · 권한이 있으면 직원 묶음이 든다(검토 P3-4)", async () => {
    const fx = await setupExpenseProject();
    const lines = await linesFor(fx, 2);
    const { doc: personDoc, userId } = await employeeDoc(fx, "김소계직원", take(lines, 0));
    const vendorDoc = await approvedExpenseWithoutEvidence(fx, take(lines, 1));

    const denied = await makeExporter("소계직원없음");
    const deniedGroups = await summarizeTransferPayees(denied, { rows: [await snapshotOf(denied, personDoc), await snapshotOf(denied, vendorDoc)] });
    expect(deniedGroups.map((group) => group.payeeKey)).toEqual([`v:${fx.stageOneId}`]);
    expect(JSON.stringify(deniedGroups)).not.toContain(userId);
    expect(JSON.stringify(deniedGroups)).not.toContain(personDoc.expenseId);

    const allowed = await makeExporter("소계직원");
    if (!allowed.roleId) throw new Error("계급 없음");
    await upsertPermission(SYSTEM_VIEWER, { roleId: allowed.roleId, menu: "admin.people", action: "view", allowed: true });
    await upsertVisibility(SYSTEM_VIEWER, { roleId: allowed.roleId, infoItem: "person.value", visible: true });
    const allowedGroups = await summarizeTransferPayees(allowed, { rows: [await snapshotOf(allowed, personDoc), await snapshotOf(allowed, vendorDoc)] });
    expect(allowedGroups.map((group) => group.payeeKey)).toEqual([`p:${userId}`, `v:${fx.stageOneId}`]);
  });

  it("소계 묶음은 지급처 이름(거래처 vendorName · 직원 payeeUserName)을 싣는다 — 지금 쪽 밖 문서만 있는 지급처도 이름이 선다(검토 P3-2)", async () => {
    const fx = await setupExpenseProject();
    const lines = await linesFor(fx, 2);
    const { doc: personDoc, userId } = await employeeDoc(fx, "김소계이름", take(lines, 0));
    const vendorDoc = await approvedExpenseWithoutEvidence(fx, take(lines, 1));
    const [vendor] = await db.select({ name: vendors.name }).from(vendors).where(eq(vendors.id, fx.stageOneId));
    const viewer = await makeExporter("소계이름");
    if (!viewer.roleId) throw new Error("계급 없음");
    await upsertPermission(SYSTEM_VIEWER, { roleId: viewer.roleId, menu: "admin.people", action: "view", allowed: true });
    await upsertVisibility(SYSTEM_VIEWER, { roleId: viewer.roleId, infoItem: "person.value", visible: true });

    const groups = await summarizeTransferPayees(viewer, { rows: [await snapshotOf(viewer, personDoc), await snapshotOf(viewer, vendorDoc)] });
    expect(groups).toEqual([
      expect.objectContaining({ payeeKey: `p:${userId}`, vendorName: null, payeeUserName: "김소계이름" }),
      expect.objectContaining({ payeeKey: `v:${fx.stageOneId}`, vendorName: vendor?.name, payeeUserName: null }),
    ]);
    const fields = DTO_REGISTRY.find((entry) => entry.name === "TransferPayeeSubtotalDto")?.fields ?? [];
    expect(fields.find((field) => field.key === "payeeUserName")?.infoItem).toBe("person.value");
  });

  it("이체 파일 DTO 명세가 직원 지급처 줄의 정보 항목(person.value)을 적는다 — 내보내기 축 누수 스캔이 본다(검토 P3-5)", () => {
    const fields = DTO_REGISTRY.find((entry) => entry.name === "BankTransferRowDto")?.fields ?? [];
    expect(fields.flatMap((field) => (typeof field.infoItem === "string" ? [field.infoItem] : [...field.infoItem]))).toContain("person.value");
  });

  it("거래처 관리 쓰기 없는 지급 권한자 — 계좌 없음은 링크 없이 평문 담당", async () => {
    const payer = await makeExporter();
    const fx = await setupExpenseProject();
    const doc = take(await docsFor(fx, 1), 0);
    await setDoc(doc, { vendorId: await vendorWith(null) });
    const result = await exportBankTransferFile(payer, { rows: [await snapshotOf(payer, doc)] });
    expect(blockedOf(result, doc.expenseId)).toEqual({ expenseId: doc.expenseId, text: "계좌 없음 · 거래처 수정은 경영관리", link: null });
    expect(result.lineCount).toBe(0);
  });

  it("승인 뒤 견적 줄 거래처를 바꿔도 파일의 예금주 · 계좌는 문서 지급처의 것(결정 맥락 15)", async () => {
    const payer = await makeExporter();
    const fx = await setupExpenseProject();
    const doc = take(await docsFor(fx, 1), 0);
    const [line] = await db.select({ quoteLineId: expenses.quoteLineId }).from(expenses).where(eq(expenses.id, doc.expenseId));
    if (!line?.quoteLineId) throw new Error("줄 없음");
    await db.update(quoteLines).set({ vendorId: await vendorWith({ accountHolder: "다른 예금주" }) }).where(eq(quoteLines.id, line.quoteLineId));
    const result = await exportBankTransferFile(payer, { rows: [await snapshotOf(payer, doc)] });
    const sheet = readFile(result.base64).Sheets["입력정보"];
    if (!sheet) throw new Error("시트 없음");
    expect(cellAt(sheet, "C2")?.v).toBe("테스트 예금주");
    expect((await exportLogs(payer.id))[0]?.detail).toMatchObject({ vendorIds: [fx.stageOneId] });
  });

  it("파일을 받은 뒤 지급 대상 행의 transferFileAt = 받은 시각(HH:mm) · 다른 날 기록은 무시 · 게이트 없는 지급 권한자는 null", async () => {
    const payer = await makeExporter();
    const fx = await setupExpenseProject();
    const docs = await docsFor(fx, 2);
    const [today, yesterday] = [take(docs, 0), take(docs, 1)];
    const result = await exportBankTransferFile(payer, { rows: [await snapshotOf(payer, today)] });
    await exportBankTransferFile(payer, { rows: [await snapshotOf(payer, yesterday)] });
    const [old] = await db
      .select({ seq: actionLog.seq, detail: actionLog.detail })
      .from(actionLog)
      .where(and(eq(actionLog.actorId, payer.id), eq(actionLog.entity, "bank_transfer")))
      .orderBy(actionLog.seq)
      .limit(2)
      .offset(1);
    if (!old) throw new Error("기록 없음");
    await db.update(actionLog).set({ occurredAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) }).where(eq(actionLog.seq, old.seq));

    const rows = (await listPaymentTargets(payer, {})).groups.flatMap((group) => group.rows);
    expect(rows.find((row) => row.id === today.expenseId)?.transferFileAt).toBe(result.time);
    expect(rows.find((row) => row.id === yesterday.expenseId)?.transferFileAt).toBeNull();
    const noGate = await makePaymentManager("게이트없음");
    const plainRows = (await listPaymentTargets(noGate, {})).groups.flatMap((group) => group.rows);
    expect(plainRows.find((row) => row.id === today.expenseId)?.transferFileAt ?? null).toBeNull();
  });
});

// 06.5-06 Task 3(D-6519 · V14 · SP-65-7): 지급처마다 한 줄 · 대화상자 소계 읽기(기록 없음 · 지급 게이트 아님 — R-6).
// 옛 지급처 키 O: /home/user/erp_plant8_260907/server/src/payments.ts:352-361(`v:` · `p:` · `x:{expense}`).
describe("신한 이체 파일 — 지급처 합치기 · 소계(06.5 Task 3)", () => {
  it("같은 거래처 두 문서 + 다른 거래처 한 문서 → 파일 2줄 · 문서 3건 · 금액 합 = 고른 행 합 · 비고는 첫 번호 외 1건 · detail lines는 파일 줄 단위", async () => {
    const payer = await makeExporter();
    const fx = await setupExpenseProject();
    const [first, second, other] = await docsFor(fx, 3);
    if (!first || !second || !other) throw new Error("픽스처 모자람");
    const otherVendor = await vendorWith({});
    await setDoc(other, { vendorId: otherVendor });
    const snapshots = await Promise.all([first, second, other].map((doc) => snapshotOf(payer, doc)));
    const [a, b, c] = snapshots;
    if (!a || !b || !c) throw new Error("스냅숏 없음");

    const result = await exportBankTransferFile(payer, { rows: snapshots });
    expect(result).toMatchObject({ lineCount: 2, docCount: 3, blocked: [] });
    const sheet = readFile(result.base64).Sheets["입력정보"];
    if (!sheet) throw new Error("시트 없음");
    const amounts = [cellAt(sheet, "D2")?.v, cellAt(sheet, "D3")?.v];
    expect(amounts).toEqual([String(a.expectedPayableKrw + b.expectedPayableKrw), String(c.expectedPayableKrw)]);
    expect(cellAt(sheet, "A4")).toBeUndefined();
    expect(cellAt(sheet, "H2")?.v).toBe(`${first.number} 외 1건`);
    expect(cellAt(sheet, "H3")?.v).toBe(other.number);

    const detail = (await exportLogs(payer.id))[0]?.detail as Record<string, unknown>;
    expect(detail).toMatchObject({ requestedDocs: 3, expenseIds: [first.expenseId, second.expenseId, other.expenseId] });
    expect(detail.lines).toEqual([
      { payeeKey: `v:${fx.stageOneId}`, totalKrw: a.expectedPayableKrw + b.expectedPayableKrw, expenseIds: [first.expenseId, second.expenseId] },
      { payeeKey: `v:${otherVendor}`, totalKrw: c.expectedPayableKrw, expenseIds: [other.expenseId] },
    ]);
    expect(JSON.stringify(detail)).not.toContain(PLAIN_NUMBER);
  });

  it("같은 거래처 행 둘 중 하나가 현금이면 그 행만 막히고 나머지는 한 줄 · 계좌 없는 거래처는 두 행 모두 같은 이유로 막힌다", async () => {
    const payer = await makeExporter();
    const fx = await setupExpenseProject();
    const [kept, cash, noA, noB] = await docsFor(fx, 4);
    if (!kept || !cash || !noA || !noB) throw new Error("픽스처 모자람");
    await setDoc(cash, { paymentMethod: "cash" });
    const noAccountVendor = await vendorWith(null);
    await setDoc(noA, { vendorId: noAccountVendor });
    await setDoc(noB, { vendorId: noAccountVendor });

    const result = await exportBankTransferFile(payer, { rows: await Promise.all([kept, cash, noA, noB].map((doc) => snapshotOf(payer, doc))) });
    expect(result).toMatchObject({ lineCount: 1, docCount: 1 });
    expect(blockedOf(result, cash.expenseId)?.text).toBe("계좌이체 아님");
    expect(blockedOf(result, noA.expenseId)?.text).toBe(blockedOf(result, noB.expenseId)?.text);
    expect(blockedOf(result, noA.expenseId)?.text).toContain("계좌 없음");
  });

  it("소계 읽기 — 지급처별 합 · 건수(계좌이체만 · 현금 제외) · 계좌 없는 지급처도 든다 · action_log 0 · 금액 숨김이면 ForbiddenError", async () => {
    const payer = await makeExporter();
    const fx = await setupExpenseProject();
    const [first, second, cash, lonely] = await docsFor(fx, 4);
    if (!first || !second || !cash || !lonely) throw new Error("픽스처 모자람");
    await setDoc(cash, { paymentMethod: "cash" });
    const noAccountVendor = await vendorWith(null);
    await setDoc(lonely, { vendorId: noAccountVendor });
    const snapshots = await Promise.all([first, second, cash, lonely].map((doc) => snapshotOf(payer, doc)));
    const [a, b, , d] = snapshots;
    if (!a || !b || !d) throw new Error("스냅숏 없음");
    const before = await db.select({ seq: actionLog.seq }).from(actionLog).where(eq(actionLog.actorId, payer.id));

    const nameOf = async (id: string) => (await db.select({ name: vendors.name }).from(vendors).where(eq(vendors.id, id)))[0]?.name;
    const groups = await summarizeTransferPayees(payer, { rows: snapshots });
    // 직원 이름 칸(person.value)은 이 계급에 보이지 않아 투영에서 빠진다.
    expect(groups).toEqual([
      { payeeKey: `v:${fx.stageOneId}`, vendorName: await nameOf(fx.stageOneId), expenseIds: [first.expenseId, second.expenseId], totalKrw: a.expectedPayableKrw + b.expectedPayableKrw, count: 2 },
      { payeeKey: `v:${noAccountVendor}`, vendorName: await nameOf(noAccountVendor), expenseIds: [lonely.expenseId], totalKrw: d.expectedPayableKrw, count: 1 },
    ]);
    const after = await db.select({ seq: actionLog.seq }).from(actionLog).where(eq(actionLog.actorId, payer.id));
    expect(after).toHaveLength(before.length);
    expect(JSON.stringify(groups)).not.toContain(PLAIN_NUMBER);

    const hidden = await makeExporter("소계금액숨김", ["expense.amount"]);
    await expect(summarizeTransferPayees(hidden, { rows: snapshots })).rejects.toBeInstanceOf(ForbiddenError);
  });
});
