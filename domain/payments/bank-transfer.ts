import type { Viewer } from "@/domain/viewer";
import { can, ForbiddenError } from "@/domain/permissions/can";
import { visible } from "@/domain/permissions/visible";
import type { DtoSpec } from "@/domain/permissions/project";
import { registerDto } from "@/domain/permissions/dto-registry";
import { recordAction as defaultRecordAction } from "@/domain/action-log/record";
import { loadPaymentShared } from "@/domain/payments";
import type { BatchPaymentRow } from "@/domain/payments/batch";
import { rejudgePaymentTargets } from "@/domain/payments/targets";
import { BANK_TRANSFER_PAYMENT_METHOD, documentPayee } from "@/domain/expenses/payee";
import { BANK_TRANSFER_HEADER, BANK_TRANSFER_SHEET, bankTransferCells, buildBankTransferRows, type BankTransferSource } from "@/domain/bank-transfer";
import { formatKstTime } from "@/domain/holidays/business-day";
import { findTransferAccounts, type TransferAccountRow } from "@/repositories/payment-targets";
import { registerExport } from "@/lib/actions/registry";
import { decrypt as defaultDecrypt } from "@/lib/crypto";
import { kstToday } from "@/lib/kst-date";
import { buildTextSheetXlsx } from "@/lib/xlsx-server";

// 06.5 D-6504: 신한 대량이체 파일 — 돈 갈 곳은 문서 지급처(06.5-05 documentPayee, 결정 맥락 15 · 옛 O: server/src/payments.ts:323).
// 계좌는 이 호출의 읽기 값으로 판정 · 복호화한다(CH5). 기록은 직렬화 전 — 실패면 파일 없음.
// 버튼은 행 내용과 무관한 고정 게이트(결정 맥락 8 · DM-4): 지급 쓰기 ∧ 계좌 해제 항목 ∧ 금액 보임. 화면 버튼과 이 함수가 같은 판정을 쓴다.

export async function canExportBankTransferFile(viewer: Viewer): Promise<boolean> {
  const [payments, unmasked, amount] = await Promise.all([
    can(viewer, "expenses.payments", "write"),
    visible(viewer, "vendor.account_number_unmasked"),
    visible(viewer, "expense.amount"),
  ]);
  return payments && unmasked && amount;
}

// 파일 한 줄의 칸 → 정보 항목(내보내기 축 누수 스캔이 본다). 파일 바이트는 DTO 행이 아니지만 칸마다 어느 항목을 내보내는지는 이 명세가 정본이다.
export type BankTransferRowDto = { bankCode: string; accountNo: string; holder: string; amount: string; memo: string; key: string };

const BANK_TRANSFER_ROW_DTO_SPEC: DtoSpec<BankTransferRowDto, BankTransferRowDto> = {
  fields: [
    { key: "bankCode", from: "bankCode", infoItem: "vendor.account_number_unmasked" },
    { key: "accountNo", from: "accountNo", infoItem: "vendor.account_number_unmasked" },
    { key: "holder", from: "holder", infoItem: "vendor.value" },
    { key: "amount", from: "amount", infoItem: "expense.amount" },
    { key: "memo", from: "memo", infoItem: "expense.value" },
    { key: "key", from: "key", infoItem: "expense.value" },
  ],
};

registerDto({ name: "BankTransferRowDto", fields: BANK_TRANSFER_ROW_DTO_SPEC.fields.map((field) => ({ key: field.key, infoItem: field.infoItem })) });
registerExport({ name: "bank-transfer.export", menu: "expenses.payments", dtoName: "BankTransferRowDto" });

export type BankTransferBlocked = { expenseId: string; text: string; link: { label: string; href: string } | null };

export type BankTransferFileResult = {
  filename: string;
  base64: string;
  lineCount: number;
  docCount: number;
  blocked: BankTransferBlocked[];
  time: string;
};

export type BankTransferDeps = {
  recordAction: typeof defaultRecordAction;
  decrypt: (ciphertext: string) => string;
  buildXlsx: typeof buildTextSheetXlsx;
  now: Date;
};

type FileLine = { payeeKey: string; expenseIds: string[]; totalKrw: number; source: BankTransferSource; vendorId: string | null; userId: string | null };

export async function exportBankTransferFile(
  viewer: Viewer,
  input: { rows: readonly BatchPaymentRow[] },
  deps?: Partial<BankTransferDeps>,
): Promise<BankTransferFileResult> {
  if (!(await canExportBankTransferFile(viewer))) throw new ForbiddenError("이체 파일 권한 없음");
  const now = deps?.now ?? new Date();
  // 같은 문서 id는 첫 행만 센다(CB3 — 일괄 지급 domain/payments/batch.ts와 같은 규칙).
  const seen = new Set<string>();
  const rows = input.rows.filter((row) => (seen.has(row.expenseId) ? false : (seen.add(row.expenseId), true)));
  const shared = await loadPaymentShared(viewer);
  const judged = await rejudgePaymentTargets(
    viewer,
    rows.map((row) => row.expenseId),
    { shared },
  );

  const passed: { row: BatchPaymentRow; vendorId: string | null; userId: string | null; number: string; transferKrw: number }[] = [];
  for (const row of rows) {
    const target = judged.get(row.expenseId);
    if (!target || !target.selectable || target.payableKrw === null) continue;
    if (target.row.paymentMethod !== BANK_TRANSFER_PAYMENT_METHOD) continue;
    const payee = documentPayee(target.row);
    if (!payee) continue;
    passed.push({
      row,
      vendorId: payee.kind === "vendor" ? payee.id : null,
      userId: payee.kind === "user" ? payee.id : null,
      number: target.row.number ?? "",
      transferKrw: row.transferKrw ?? target.payableKrw,
    });
  }

  const accounts = await findTransferAccounts(viewer, {
    vendorIds: [...new Set(passed.flatMap((item) => (item.vendorId ? [item.vendorId] : [])))],
    userIds: [...new Set(passed.flatMap((item) => (item.userId ? [item.userId] : [])))],
  });
  const vendorAccounts = new Map(accounts.vendors.map((account) => [account.id, account]));
  const userAccounts = new Map(accounts.users.map((account) => [account.id, account]));
  const decrypt = deps?.decrypt ?? defaultDecrypt;

  const lines: FileLine[] = passed.map((item) => {
    const account: TransferAccountRow | undefined = item.vendorId ? vendorAccounts.get(item.vendorId) : item.userId ? userAccounts.get(item.userId) : undefined;
    const payeeKey = item.vendorId ? `v:${item.vendorId}` : `p:${item.userId ?? ""}`;
    return {
      payeeKey,
      expenseIds: [item.row.expenseId],
      totalKrw: item.transferKrw,
      vendorId: item.vendorId,
      userId: item.userId,
      source: {
        key: payeeKey,
        bank: account?.bank ?? "",
        holder: account?.holder ?? "",
        accountNumber: account?.accountNumberEncrypted ? decrypt(account.accountNumberEncrypted) : null,
        transferKrw: item.transferKrw,
        memo: item.number,
      },
    };
  });

  const built = buildBankTransferRows(lines.map((line) => line.source));
  const okKeys = new Set(built.rows.map((entry) => entry.key));
  const fileLines = lines.filter((line) => okKeys.has(line.payeeKey));
  const expenseIds = fileLines.flatMap((line) => line.expenseIds);

  // 직렬화 전에 기록한다 — 기록이 실패하면 복호화한 값은 버려지고 파일이 없다(excel_export는 끌 수 없는 핵심 로그). 평문 계좌는 싣지 않는다.
  await (deps?.recordAction ?? defaultRecordAction)(viewer, {
    actionType: "excel_export",
    entity: "bank_transfer",
    entityId: null,
    documentId: null,
    detail: {
      requestedDocs: rows.length,
      expenseIds,
      vendorIds: [...new Set(fileLines.flatMap((line) => (line.vendorId ? [line.vendorId] : [])))],
      userIds: [...new Set(fileLines.flatMap((line) => (line.userId ? [line.userId] : [])))],
      lines: fileLines.map((line) => ({ payeeKey: line.payeeKey, totalKrw: line.totalKrw, expenseIds: line.expenseIds })),
    },
  });

  const bytes = (deps?.buildXlsx ?? buildTextSheetXlsx)(BANK_TRANSFER_SHEET, [BANK_TRANSFER_HEADER, ...built.rows.map((entry) => bankTransferCells(entry.row))]);
  return {
    filename: `이체파일_${kstToday(now)}.xlsx`,
    base64: Buffer.from(bytes).toString("base64"),
    lineCount: built.rows.length,
    docCount: expenseIds.length,
    blocked: [],
    time: formatKstTime(now),
  };
}
