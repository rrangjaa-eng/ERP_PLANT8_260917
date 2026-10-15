import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { db } from "@/db/client";
import { actionLog, expenses } from "@/db/schema";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { upsertVisibility } from "@/repositories/permissions";
import { ForbiddenError } from "@/domain/permissions/can";
import { previewPayable } from "@/domain/payments";
import { exportBankTransferFile } from "@/domain/payments/bank-transfer";
import { BANK_TRANSFER_HEADER } from "@/domain/bank-transfer";
import { seoulToday } from "@/lib/dates";
import { setupExpenseProject } from "./fixtures/expenses";
import { approvedExpenseWithoutEvidence, makePaymentManager, setEvidenceRequired, type ApprovedExpense } from "./fixtures/payments";

// 06.5-06(D-6504 · UI-SPEC V5): 신한 대량이체 파일 — 고정 게이트(지급 쓰기 ∧ 계좌 해제 항목 ∧ 금액 보임) · 재판정 · 문서 지급처 계좌 ·
// 직렬화 전 excel_export 기록(평문 계좌 없음). 문서는 06-15 일괄 지급 픽스처(증빙 0 · 증빙 필수 끔 = P4)로 만든다.

const PLAIN_NUMBER = "110123456789";

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
