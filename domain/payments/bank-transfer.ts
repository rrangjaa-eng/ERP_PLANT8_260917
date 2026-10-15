import type { Viewer } from "@/domain/viewer";
import { can, ForbiddenError } from "@/domain/permissions/can";
import { canExportBankTransferFile } from "@/domain/payments/transfer-gate";
import { projectMany, type DtoSpec } from "@/domain/permissions/project";
import { visible } from "@/domain/permissions/visible";
import { sumKrw } from "@/domain/money";
import { registerDto } from "@/domain/permissions/dto-registry";
import { recordAction as defaultRecordAction } from "@/domain/action-log/record";
import { judgeTransferAmount, loadPaymentShared, PayableChangedError, PaymentConflictError, PaymentNotFoundError } from "@/domain/payments";
import type { BatchPaymentRow } from "@/domain/payments/batch";
import { rejudgePaymentTargets, type JudgedPaymentTarget } from "@/domain/payments/targets";
import { BANK_TRANSFER_PAYMENT_METHOD, documentPayee, hasUsableAccount } from "@/domain/expenses/payee";
import { canManagePayoutAccount } from "@/domain/people/account";
import { BANK_TRANSFER_HEADER, BANK_TRANSFER_SHEET, bankTransferCells, buildBankTransferRows, mergeTransferLines, payeeKeyOf, type BankTransferSource } from "@/domain/bank-transfer";
import { formatKstTime } from "@/domain/holidays/business-day";
import { findTransferAccounts, type TransferAccountRow } from "@/repositories/payment-targets";
import { registerExport } from "@/lib/actions/registry";
import { decrypt as defaultDecrypt } from "@/lib/crypto";
import { seoulToday } from "@/lib/dates";
import { log } from "@/lib/log";
import { buildTextSheetXlsx } from "@/lib/xlsx-server";

// 06.5 D-6504: 신한 대량이체 파일 — 돈 갈 곳은 문서 지급처(06.5-05 documentPayee, 결정 맥락 15 · 옛 O: server/src/payments.ts:323).
// 계좌는 이 호출의 읽기 값으로 판정 · 복호화한다(CH5). 기록은 직렬화 전 — 실패면 파일 없음.
// 버튼은 행 내용과 무관한 고정 게이트(결정 맥락 8 · DM-4 — transfer-gate.ts). 화면 버튼과 이 함수가 같은 판정을 쓴다.

export { canExportBankTransferFile };

// 파일 한 줄의 칸 → 정보 항목(내보내기 축 누수 스캔이 본다). 파일 바이트는 DTO 행이 아니지만 칸마다 어느 항목을 내보내는지는 이 명세가 정본이다.
// 직원 지급처 줄(`p:`)은 같은 은행 코드 · 계좌번호 · 예금주 칸에 직원 값을 싣는다 — 그 값의 항목은 person.value다(서버 게이트 canManagePayoutAccount).
// 한 칸에 항목 하나라 직원 줄 칸을 따로 적어 스캔이 보게 한다(검토 P3-5).
export type BankTransferRowDto = {
  bankCode: string;
  accountNo: string;
  holder: string;
  amount: string;
  memo: string;
  key: string;
  personBankCode: string;
  personAccountNo: string;
  personHolder: string;
};

const BANK_TRANSFER_ROW_DTO_SPEC: DtoSpec<BankTransferRowDto, BankTransferRowDto> = {
  fields: [
    { key: "bankCode", from: "bankCode", infoItem: "vendor.account_number_unmasked" },
    { key: "accountNo", from: "accountNo", infoItem: "vendor.account_number_unmasked" },
    { key: "holder", from: "holder", infoItem: "vendor.value" },
    { key: "amount", from: "amount", infoItem: "expense.amount" },
    { key: "memo", from: "memo", infoItem: "expense.value" },
    { key: "key", from: "key", infoItem: "expense.value" },
    { key: "personBankCode", from: "personBankCode", infoItem: "person.value" },
    { key: "personAccountNo", from: "personAccountNo", infoItem: "person.value" },
    { key: "personHolder", from: "personHolder", infoItem: "person.value" },
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

const NOT_BANK_TRANSFER = "계좌이체 아님";
const NO_PAYEE = "지급처 없음";
const TRANSFER_ZERO = "이체액 0 · 이체액 고치기";
const NO_PERSON_ACCOUNT_RIGHT = "직원 계좌 권한 없음 · 권한 설정은 관리자";
const VENDOR_FIX_OWNER = "거래처 수정은 경영관리";
const NO_ACCOUNT = "계좌 없음";

type Passed = { row: BatchPaymentRow; payee: { kind: "vendor" | "user"; id: string }; number: string; transferKrw: number };

// 계좌 칸 이유(V5 9~14) → 행 아래 줄. 거래처는 거래처 관리 쓰기가 있으면 고치러 가는 링크, 없으면 평문 담당(결정 맥락 10).
// 직원은 8번(canManagePayoutAccount)을 지났으니 늘 링크다.
function accountBlocked(expenseId: string, payee: Passed["payee"], cause: string, fix: string, canEditVendors: boolean): BankTransferBlocked {
  if (payee.kind === "user") return { expenseId, text: cause, link: { label: fix, href: `/admin/people/${payee.id}?editAccount=1` } };
  if (!canEditVendors) return { expenseId, text: `${cause} · ${VENDOR_FIX_OWNER}`, link: null };
  return { expenseId, text: cause, link: { label: fix, href: `/admin/vendors?editId=${payee.id}` } };
}

// 행 고유 이유(V5 1~7) — 파일과 소계가 같이 쓴다. 통과하면 돈 갈 곳(문서 지급처)과 보낼 이체액.
function judgeRow(
  row: BatchPaymentRow,
  target: JudgedPaymentTarget | undefined,
  today: string,
): { ok: true; passed: Passed } | { ok: false; text: string; link: BankTransferBlocked["link"] } {
  const expenseId = row.expenseId;
  if (!target) return { ok: false, text: new PaymentNotFoundError().message, link: null };
  if (!target.selectable || target.payableKrw === null) return { ok: false, text: target.reason ?? new PaymentNotFoundError().message, link: null };
  if (target.row.version !== row.expenseVersion) {
    return { ok: false, text: new PaymentConflictError(`다른 사람이 ${formatKstTime(target.row.updatedAt)}에 바꿈 · 새로 고침`).message, link: null };
  }
  if (target.payableKrw !== row.expectedPayableKrw) return { ok: false, text: new PayableChangedError(target.payableKrw, today).message, link: null };
  if (target.row.paymentMethod !== BANK_TRANSFER_PAYMENT_METHOD) return { ok: false, text: NOT_BANK_TRANSFER, link: null };
  const payee = documentPayee(target.row);
  if (!payee) return { ok: false, text: NO_PAYEE, link: { label: "문서 확인", href: `/expenses/${expenseId}` } };
  const amount = judgeTransferAmount({ payableKrw: target.payableKrw, transferKrw: row.transferKrw, diffReason: row.diffReason });
  if (!amount.ok) return { ok: false, text: amount.reason, link: null };
  if (amount.transferKrwToSend <= 0) return { ok: false, text: TRANSFER_ZERO, link: null };
  return { ok: true, passed: { row, payee, number: target.row.number ?? "", transferKrw: amount.transferKrwToSend } };
}

// 같은 문서 id는 첫 행만 센다(CB3 — 일괄 지급 domain/payments/batch.ts와 같은 규칙).
function firstOfEach(rows: readonly BatchPaymentRow[]): BatchPaymentRow[] {
  const seen = new Set<string>();
  return rows.filter((row) => (seen.has(row.expenseId) ? false : (seen.add(row.expenseId), true)));
}

export async function exportBankTransferFile(
  viewer: Viewer,
  input: { rows: readonly BatchPaymentRow[] },
  deps?: Partial<BankTransferDeps>,
): Promise<BankTransferFileResult> {
  if (!(await canExportBankTransferFile(viewer))) throw new ForbiddenError("이체 파일 권한 없음");
  const now = deps?.now ?? new Date();
  const today = seoulToday(now);
  const rows = firstOfEach(input.rows);
  const shared = await loadPaymentShared(viewer);
  const judged = await rejudgePaymentTargets(
    viewer,
    rows.map((row) => row.expenseId),
    { shared, today },
  );
  const [canEditVendors, canPersonAccounts] = await Promise.all([can(viewer, "admin.vendors", "write"), canManagePayoutAccount(viewer)]);

  // 행 고유 이유(V5 1~8) — 위에서부터 첫 해당 하나. 범위 밖 id는 계좌를 읽기 전에 거른다(EP2-C4).
  const blocked: BankTransferBlocked[] = [];
  const passed: Passed[] = [];
  for (const row of rows) {
    const judgedRow = judgeRow(row, judged.get(row.expenseId), today);
    if (!judgedRow.ok) {
      blocked.push({ expenseId: row.expenseId, text: judgedRow.text, link: judgedRow.link });
      continue;
    }
    if (judgedRow.passed.payee.kind === "user" && !canPersonAccounts) {
      blocked.push({ expenseId: row.expenseId, text: NO_PERSON_ACCOUNT_RIGHT, link: null });
      continue;
    }
    passed.push(judgedRow.passed);
  }

  // 계좌는 이 호출의 읽기 값으로 판정한다(CH5) — 문서 지급처의 계좌만 읽는다(돈 갈 곳 = 문서 지급처, 결정 맥락 15).
  const accounts = await findTransferAccounts(viewer, {
    vendorIds: [...new Set(passed.flatMap((item) => (item.payee.kind === "vendor" ? [item.payee.id] : [])))],
    userIds: [...new Set(passed.flatMap((item) => (item.payee.kind === "user" ? [item.payee.id] : [])))],
  });
  const accountOf = new Map<string, TransferAccountRow>([
    ...accounts.vendors.map((account): [string, TransferAccountRow] => [`v:${account.id}`, account]),
    ...accounts.users.map((account): [string, TransferAccountRow] => [`p:${account.id}`, account]),
  ]);
  const decrypt = deps?.decrypt ?? defaultDecrypt;
  // 복호화는 지급처 줄마다 try — 실패는 그 지급처만 「계좌번호 형식 오류」로 막는다(EP3-C3). 로그 · 결과에 암호문을 싣지 않는다.
  function plainNumber(ciphertext: string): string | null {
    try {
      return decrypt(ciphertext);
    } catch (error) {
      log.error("이체 파일 계좌번호 복호화 실패", { error: error instanceof Error ? error.name : "unknown" });
      return null;
    }
  }

  // 행 고유 이유를 지난 행만 지급처마다 한 줄로 합친다(D-6519). 지급처 계좌 문제(V5 9~14)는 그 지급처의 모든 문서를 같은 이유로 막는다.
  const payeeOf = new Map(passed.map((item) => [item.row.expenseId, item.payee]));
  const merged = mergeTransferLines(
    passed.map((item) => ({
      expenseId: item.row.expenseId,
      vendorId: item.payee.kind === "vendor" ? item.payee.id : null,
      payeeUserId: item.payee.kind === "user" ? item.payee.id : null,
      number: item.number,
      transferKrw: item.transferKrw,
    })),
  );
  const lines: FileLine[] = [];
  for (const line of merged) {
    const payee = payeeOf.get(line.expenseIds[0] ?? "");
    if (!payee) continue;
    const account = accountOf.get(line.payeeKey);
    if (!account || !hasUsableAccount({ bank: account.bank, hasNumber: account.accountNumberEncrypted !== null })) {
      for (const expenseId of line.expenseIds)
        blocked.push(accountBlocked(expenseId, payee, NO_ACCOUNT, payee.kind === "vendor" ? "거래처 계좌 등록" : "직원 계좌 등록", canEditVendors));
      continue;
    }
    lines.push({
      payeeKey: line.payeeKey,
      expenseIds: line.expenseIds,
      totalKrw: line.totalKrw,
      vendorId: payee.kind === "vendor" ? payee.id : null,
      userId: payee.kind === "user" ? payee.id : null,
      source: {
        key: line.payeeKey,
        bank: account.bank ?? "",
        holder: account.holder ?? "",
        accountNumber: account.accountNumberEncrypted ? plainNumber(account.accountNumberEncrypted) : null,
        transferKrw: line.totalKrw,
        memo: line.memo,
      },
    });
  }

  const built = buildBankTransferRows(lines.map((line) => line.source));
  const problemOf = new Map(built.blocked.map((entry) => [entry.key, entry.problem]));
  for (const line of lines) {
    const problem = problemOf.get(line.payeeKey);
    if (!problem) continue;
    const payee = line.vendorId ? { kind: "vendor" as const, id: line.vendorId } : { kind: "user" as const, id: line.userId ?? "" };
    for (const expenseId of line.expenseIds) blocked.push(accountBlocked(expenseId, payee, problem.cause, problem.fix, canEditVendors));
  }
  const fileLines = lines.filter((line) => !problemOf.has(line.payeeKey));
  const expenseIds = fileLines.flatMap((line) => line.expenseIds);
  // 화면이 요청 차례대로 행 아래 줄을 찾으므로 막힌 건도 요청 차례로 돌려준다.
  const order = new Map(rows.map((row, index) => [row.expenseId, index]));
  blocked.sort((a, b) => (order.get(a.expenseId) ?? 0) - (order.get(b.expenseId) ?? 0));
  // 받은 건 0이면 파일이 없다(V5 「전부 막힘」) — 나가지 않은 파일을 반출 기록으로 남기지 않는다(검토 P3-1).
  if (fileLines.length === 0) return { filename: `이체파일_${today}.xlsx`, base64: "", lineCount: 0, docCount: 0, blocked, time: formatKstTime(now) };

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

  const okKeys = new Set(fileLines.map((line) => line.payeeKey));
  const fileRows = built.rows.filter((entry) => okKeys.has(entry.key));
  const bytes = (deps?.buildXlsx ?? buildTextSheetXlsx)(BANK_TRANSFER_SHEET, [BANK_TRANSFER_HEADER, ...fileRows.map((entry) => bankTransferCells(entry.row))]);
  return {
    filename: `이체파일_${today}.xlsx`,
    base64: Buffer.from(bytes).toString("base64"),
    lineCount: fileRows.length,
    docCount: expenseIds.length,
    blocked,
    time: formatKstTime(now),
  };
}

// 06.5-06(V14 · SP-65-7 · R-6): `지급 완료` 대화상자의 지급처 소계 — 행 고유 거르기(중복 · 재판정 · 계좌이체만 · 지급처 · 이체액)를 지난 행을
// 지급처 키로 묶은 합. 계좌 판정 · 복호화 · 기록이 없는 읽기다 — 지급 게이트가 아니라 계좌 문제가 있는 지급처도 든다.
// 지급처 이름은 서버가 싣는다(검토 P3-2) — 화면 행에서 찾으면 지금 쪽 밖 문서만 있는 지급처가 `—`로 선다. 항목은 지급 대상 DTO와 같다
// (거래처 이름 expense.value · 직원 이름 person.value). 묶음의 지급처 쪽 칸만 채우고 다른 쪽은 null이다.
export type TransferPayeeSubtotalDto = {
  payeeKey: string;
  vendorName: string | null;
  payeeUserName: string | null;
  expenseIds: string[];
  totalKrw: number;
  count: number;
};

const TRANSFER_PAYEE_SUBTOTAL_DTO_SPEC: DtoSpec<TransferPayeeSubtotalDto, TransferPayeeSubtotalDto> = {
  fields: [
    { key: "payeeKey", from: "payeeKey", infoItem: "expense.value" },
    { key: "vendorName", from: "vendorName", infoItem: "expense.value" },
    { key: "payeeUserName", from: "payeeUserName", infoItem: "person.value" },
    { key: "expenseIds", from: "expenseIds", infoItem: "expense.value" },
    { key: "totalKrw", from: "totalKrw", infoItem: "expense.amount" },
    { key: "count", from: "count", infoItem: "expense.value" },
  ],
};

registerDto({ name: "TransferPayeeSubtotalDto", fields: TRANSFER_PAYEE_SUBTOTAL_DTO_SPEC.fields.map((field) => ({ key: field.key, infoItem: field.infoItem })) });

export async function summarizeTransferPayees(viewer: Viewer, input: { rows: readonly BatchPaymentRow[] }): Promise<Partial<TransferPayeeSubtotalDto>[]> {
  const [payments, amount, canPersonAccounts] = await Promise.all([can(viewer, "expenses.payments", "write"), visible(viewer, "expense.amount"), canManagePayoutAccount(viewer)]);
  if (!payments || !amount) throw new ForbiddenError("지급처 소계 권한 없음");
  const rows = firstOfEach(input.rows);
  const today = seoulToday();
  const judged = await rejudgePaymentTargets(
    viewer,
    rows.map((row) => row.expenseId),
    { shared: await loadPaymentShared(viewer), today },
  );
  const groups = new Map<string, TransferPayeeSubtotalDto>();
  for (const row of rows) {
    const judgedRow = judgeRow(row, judged.get(row.expenseId), today);
    if (!judgedRow.ok) continue;
    const { payee, transferKrw } = judgedRow.passed;
    // 직원 계좌 권한이 없으면 직원 지급처 묶음(`p:{userId}`)을 내지 않는다 — 이체 파일에서도 그 행은 막힌다(V5 8번 · 검토 P3-4).
    if (payee.kind === "user" && !canPersonAccounts) continue;
    const payeeKey = payeeKeyOf({ expenseId: row.expenseId, vendorId: payee.kind === "vendor" ? payee.id : null, payeeUserId: payee.kind === "user" ? payee.id : null });
    const target = judged.get(row.expenseId)?.row;
    const group = groups.get(payeeKey) ?? {
      payeeKey,
      vendorName: payee.kind === "vendor" ? (target?.vendorName ?? null) : null,
      payeeUserName: payee.kind === "user" ? (target?.payeeUserName ?? null) : null,
      expenseIds: [],
      totalKrw: 0,
      count: 0,
    };
    groups.set(payeeKey, { ...group, expenseIds: [...group.expenseIds, row.expenseId], totalKrw: sumKrw([group.totalKrw, transferKrw]), count: group.count + 1 });
  }
  return projectMany(viewer, [...groups.values()], TRANSFER_PAYEE_SUBTOTAL_DTO_SPEC);
}
