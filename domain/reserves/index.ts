import type { Viewer } from "@/domain/viewer";
import { can as defaultCan } from "@/domain/permissions/can";
import { visible as defaultVisible } from "@/domain/permissions/visible";
import { ForbiddenError } from "@/domain/permissions/can";
import { recordAction as defaultRecordAction } from "@/domain/action-log/record";
import { denyWrite } from "@/domain/rules/deny-write";
import { moneyFromRow, moneyToColumns, type Currency } from "@/domain/money";
import { SaveRejectedError, type CellFormatError } from "@/domain/quotes/lines";
import { withTransaction } from "@/lib/db-transaction";
import { formatKrw } from "@/lib/format-number";
import type { DbOrTx } from "@/repositories/document-counters";
import {
  lockReserveClients as repoLockReserveClients,
  listActiveEntriesByClients as repoListActiveEntriesByClients,
  listAllActiveEntries as repoListAllActiveEntries,
  findClientNames as repoFindClientNames,
  insertEntry as repoInsertEntry,
  type ReserveEntryPayload,
  type ReserveEntryRow,
} from "@/repositories/reserve-entries";

export type ReserveDirection = "deposit" | "withdrawal";

const PNL_MENU = "pnl";
const RESERVE_INFO_ITEM = "reserve.amount";
const RESERVE_ENTITY = "reserve_entry";
const FORBIDDEN_MESSAGE = "리저브를 기록할 권한이 없습니다";

// ── 잔액(순수) ─────────────────────────────────────────────────────────────

export type BalanceRow = {
  id: string;
  clientId: string;
  entryDate: string;
  direction: ReserveDirection;
  amountKrw: number;
  createdAt: Date;
};

// 04-07(엔지니어링 리뷰 B §2) — 리저브 줄 순서의 유일한 정의: 날짜 → 구분(입금 먼저) → created_at → id.
// listReserves·잔액 판정·쪽 번호 계산이 이 함수 하나를 쓴다.
export function compareReserveRows(a: BalanceRow, b: BalanceRow): number {
  if (a.entryDate !== b.entryDate) return a.entryDate < b.entryDate ? -1 : 1;
  if (a.direction !== b.direction) return a.direction === "deposit" ? -1 : 1;
  const time = a.createdAt.getTime() - b.createdAt.getTime();
  if (time !== 0) return time;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export type NegativeClosing = { clientId: string; date: string; balanceKrw: number; lastRowId: string };

export type RunningBalanceResult = {
  rows: { id: string; clientId: string; balanceKrw: number }[];
  closingByDate: { clientId: string; date: string; balanceKrw: number; lastRowId: string }[];
  firstNegative: NegativeClosing | null;
};

// 잔액은 저장값이 아니라 클라이언트 원장 전체에서 계산한다(D-60). 판정은 **날짜마다 그날 마감 잔액 < 0** 하나다(사용자
// D19-2) — 같은 날 안의 입력 순서가 판정을 바꾸지 않는다.
export function runningBalance(rows: BalanceRow[]): RunningBalanceResult {
  const byClient = new Map<string, BalanceRow[]>();
  for (const row of rows) {
    const list = byClient.get(row.clientId) ?? [];
    list.push(row);
    byClient.set(row.clientId, list);
  }
  const result: RunningBalanceResult = { rows: [], closingByDate: [], firstNegative: null };
  for (const clientId of [...byClient.keys()].sort()) {
    const sorted = [...(byClient.get(clientId) ?? [])].sort(compareReserveRows);
    let balance = 0;
    sorted.forEach((row, index) => {
      balance += row.direction === "deposit" ? row.amountKrw : -row.amountKrw;
      result.rows.push({ id: row.id, clientId, balanceKrw: balance });
      const next = sorted[index + 1];
      if (!next || next.entryDate !== row.entryDate) {
        result.closingByDate.push({ clientId, date: row.entryDate, balanceKrw: balance, lastRowId: row.id });
        if (balance < 0 && result.firstNegative === null) {
          result.firstNegative = { clientId, date: row.entryDate, balanceKrw: balance, lastRowId: row.id };
        }
      }
    });
  }
  return result;
}

// ── 쓰기 ─────────────────────────────────────────────────────────────────

export type ReserveWriteRow = {
  /** 새 줄은 화면이 만든 uuid(ENG-D10), 기존 줄은 저장된 id. */
  id: string;
  isNew?: true;
  version?: number;
  clientId: string;
  entryDate: string;
  direction: ReserveDirection;
  amount: { currency: Currency; amount: number; fxRate: number };
  fxRateTouched?: boolean;
  projectId?: string | null;
  evidenceType?: string | null;
  taxInvoiceNumber?: string | null;
  note?: string | null;
};

export type SaveReservesInput = { rows: ReserveWriteRow[]; archivedIds?: string[] };

export type ReserveWriteDeps = {
  can: typeof defaultCan;
  visible: typeof defaultVisible;
  now: () => Date;
  /** 04-20 규약 — 잠금 직후 경합 테스트가 멈춰 세우는 주입 지점. */
  afterLock: () => Promise<void>;
  recordAction: typeof defaultRecordAction;
};

function balanceReason(balanceKrw: number): string {
  return `이 줄 뒤 잔액 ${formatKrw(balanceKrw)} · 금액을 줄이거나 입금 줄 먼저`;
}

function toBalanceRow(row: ReserveEntryRow): BalanceRow {
  return {
    id: row.id,
    clientId: row.clientId,
    entryDate: row.entryDate,
    direction: row.direction as ReserveDirection,
    amountKrw: row.amountAmountKrw,
    createdAt: row.createdAt,
  };
}

type PreparedRow = { index: number; input: ReserveWriteRow; payload: ReserveEntryPayload };

function preparePayload(input: ReserveWriteRow): ReserveEntryPayload {
  const columns = moneyToColumns(input.amount);
  return {
    entryDate: input.entryDate,
    direction: input.direction,
    amountCurrency: columns.currency,
    amountForeignAmount: columns.foreignAmount,
    amountFxRate: columns.fxRate,
    amountAmountKrw: columns.amountKrw,
    projectId: input.projectId ?? null,
    evidenceType: input.evidenceType ?? null,
    taxInvoiceNumber: input.taxInvoiceNumber ?? null,
    note: input.note ?? null,
  };
}

async function reserveRights(viewer: Viewer, action: "view" | "write", deps?: Partial<ReserveWriteDeps>): Promise<boolean> {
  const [allowed, shown] = await Promise.all([
    (deps?.can ?? defaultCan)(viewer, PNL_MENU, action),
    (deps?.visible ?? defaultVisible)(viewer, RESERVE_INFO_ITEM),
  ]);
  return allowed && shown;
}

// 04-07 — 리저브 저장(새 줄 · 수정 · 보관 배치). 권한은 트랜잭션 앞에서, 잠금 뒤 읽기·쓰기·로그는 전부 같은 tx로 —
// 잠긴 트랜잭션 안에서 풀 db를 부르지 않는다(04-32 규칙).
export async function saveReserves(viewer: Viewer, input: SaveReservesInput, deps?: Partial<ReserveWriteDeps>): Promise<void> {
  const clientIds = [...new Set(input.rows.map((row) => row.clientId))];
  const entryIds = input.rows.map((row) => row.id);
  if (!(await reserveRights(viewer, "write", deps))) {
    denyWrite(viewer, "reserve.forbidden", { clientIds, entryIds }, new ForbiddenError(FORBIDDEN_MESSAGE));
  }
  const prepared: PreparedRow[] = input.rows.map((row, index) => ({ index, input: row, payload: preparePayload(row) }));
  const now = deps?.now?.() ?? new Date();

  await withTransaction(async (tx) => {
    const locked = await repoLockReserveClients(viewer, clientIds, tx);
    await deps?.afterLock?.();
    const ledger = (await repoListActiveEntriesByClients(viewer, locked, tx)).map(toBalanceRow);
    const incoming: BalanceRow[] = prepared.map(({ input: row, payload }) => ({
      id: row.id,
      clientId: row.clientId,
      entryDate: payload.entryDate,
      direction: row.direction,
      amountKrw: payload.amountAmountKrw,
      createdAt: now,
    }));
    const balance = runningBalance([...ledger, ...incoming]);
    if (balance.firstNegative) {
      rejectNegative(viewer, balance.firstNegative, prepared);
    }
    await writeRows(viewer, prepared, now, tx, deps);
  });
}

function rejectNegative(viewer: Viewer, negative: NegativeClosing, prepared: PreparedRow[]): never {
  const index = prepared.find((row) => row.input.id === negative.lastRowId)?.index ?? -1;
  const cell: CellFormatError = { rowIndex: index, rowId: negative.lastRowId, field: "amount", label: "금액", reason: balanceReason(negative.balanceKrw) };
  return denyWrite(viewer, "reserve.balance-negative", { clientIds: [negative.clientId], entryIds: [negative.lastRowId] }, new SaveRejectedError([], [cell]));
}

async function writeRows(viewer: Viewer, prepared: PreparedRow[], now: Date, tx: DbOrTx, deps?: Partial<ReserveWriteDeps>): Promise<void> {
  const recordAction = deps?.recordAction ?? defaultRecordAction;
  for (const { input, payload } of prepared) {
    await repoInsertEntry(viewer, { id: input.id, clientId: input.clientId, createdAt: now, ...payload }, tx);
    await recordAction(viewer, { actionType: "document_create", entity: RESERVE_ENTITY, entityId: input.id, detail: { entryId: input.id, clientId: input.clientId } }, { tx });
  }
}

// ── 읽기 ─────────────────────────────────────────────────────────────────

export type ReserveEntryDto = {
  id: string;
  version: number;
  clientId: string;
  clientName: string;
  entryDate: string;
  direction: ReserveDirection;
  amount: { currency: Currency; amount: number; fxRate: number; amountKrw: number };
  projectId: string | null;
  evidenceType: string | null;
  taxInvoiceNumber: string | null;
  note: string | null;
  balanceKrw: number;
};

export type ReserveListResult = {
  rows: ReserveEntryDto[];
  clientBalances?: { clientId: string; clientName: string; balanceKrw: number }[];
};

export async function listReserves(viewer: Viewer, opts: { page?: number | string }): Promise<ReserveListResult> {
  void opts;
  const rows = await repoListAllActiveEntries(viewer);
  const names = await repoFindClientNames(viewer, [...new Set(rows.map((row) => row.clientId))]);
  const balance = runningBalance(rows.map(toBalanceRow));
  const balanceById = new Map(balance.rows.map((row) => [row.id, row.balanceKrw]));
  const byId = new Map(rows.map((row) => [row.id, row]));
  const dtos: ReserveEntryDto[] = balance.rows.map(({ id }) => {
    const row = byId.get(id) as ReserveEntryRow;
    const money = moneyFromRow({ currency: row.amountCurrency, foreignAmount: row.amountForeignAmount, fxRate: row.amountFxRate, amountKrw: row.amountAmountKrw });
    return {
      id: row.id,
      version: row.version,
      clientId: row.clientId,
      clientName: names.get(row.clientId) ?? "",
      entryDate: row.entryDate,
      direction: row.direction as ReserveDirection,
      amount: { currency: money.currency, amount: money.amount, fxRate: money.fxRate, amountKrw: money.amountKrw },
      projectId: row.projectId,
      evidenceType: row.evidenceType,
      taxInvoiceNumber: row.taxInvoiceNumber,
      note: row.note,
      balanceKrw: balanceById.get(row.id) ?? 0,
    };
  });
  const clientBalances = balance.closingByDate.reduce<Map<string, number>>((acc, closing) => acc.set(closing.clientId, closing.balanceKrw), new Map());
  return {
    rows: dtos,
    clientBalances: [...clientBalances].map(([clientId, balanceKrw]) => ({ clientId, clientName: names.get(clientId) ?? "", balanceKrw })),
  };
}
