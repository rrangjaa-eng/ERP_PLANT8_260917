import type { Viewer } from "@/domain/viewer";
import { can as defaultCan } from "@/domain/permissions/can";
import { visible as defaultVisible } from "@/domain/permissions/visible";
import { ForbiddenError } from "@/domain/permissions/can";
import { recordAction as defaultRecordAction } from "@/domain/action-log/record";
import { denyWrite } from "@/domain/rules/deny-write";
import { moneyFromRow, moneyToColumns, MoneyInputError, type Currency } from "@/domain/money";
import { rememberFxRate as defaultRememberFxRate } from "@/domain/money/currency";
import { rememberFxAfterCommit, SaveRejectedError, type CellFormatError, type FxToRemember } from "@/domain/quotes/lines";
import { isCalendarDate, FORMAT_ERROR as DATE_FORMAT_ERROR, EMPTY_ERROR as DATE_EMPTY_ERROR } from "@/domain/projects/period";
import { UserFacingError } from "@/lib/actions/user-facing-error";
import { withTransaction } from "@/lib/db-transaction";
import { clampPage, pageCountFrom, LIST_PAGE_SIZE } from "@/lib/paging";
import { projectMany, type DtoSpec } from "@/domain/permissions/project";
import { registerDto } from "@/domain/permissions/dto-registry";
import { formatKrw } from "@/lib/format-number";
import type { DbOrTx } from "@/repositories/document-counters";
import {
  lockReserveClients as repoLockReserveClients,
  listActiveEntriesByClients as repoListActiveEntriesByClients,
  listAllActiveEntries as repoListAllActiveEntries,
  findEntriesByIds as repoFindEntriesByIds,
  findClientNames as repoFindClientNames,
  findProjectClientIds as repoFindProjectClientIds,
  insertEntry as repoInsertEntry,
  updateEntryIfVersionMatches as repoUpdateEntryIfVersionMatches,
  setEntryArchived as repoSetEntryArchived,
  type ReserveEntryPayload,
  type ReserveEntryRow,
} from "@/repositories/reserve-entries";
import { listCodeItems as repoListCodeItems } from "@/repositories/code-tables";

export type ReserveDirection = "deposit" | "withdrawal";

const PNL_MENU = "pnl";
const RESERVE_INFO_ITEM = "reserve.amount";
const RESERVE_ENTITY = "reserve_entry";
const FORBIDDEN_MESSAGE = "리저브 기록 권한 없음";

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
  /** 환율 칸을 이번 저장에서 실제로 고쳤을 때만 true(외화일 때만 의미가 있다 — D-71). */
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
  /** 커밋 뒤 최근 환율 기억(D-71). 테스트가 실패를 주입한다. */
  rememberFxRate: typeof defaultRememberFxRate;
};

const INPUT_RULE = "reserve.input";
const CLIENT_LOCKED_RULE = "reserve.client-locked";
const REPLAY_RULE = "reserve.replay-mismatch";
const NEGATIVE_RULE = "reserve.balance-negative";
const FORBIDDEN_RULE = "reserve.forbidden";
const REPLAY_MISMATCH = "이미 저장된 줄과 값이 다름 · 새로 고침";
const ENTRY_NOT_FOUND = "줄을 찾을 수 없음 · 새로 고침";
const ARCHIVED_ROW = "보관된 줄 · 새로 고침";
const CLIENT_LOCKED = "클라이언트는 첫 저장 뒤 잠김 · 새 줄로 적기";
const CLIENT_NOT_FOUND = "클라이언트 없음 · 클라이언트 다시 고르기";
const PROJECT_CLIENT_MISMATCH = "다른 클라이언트의 프로젝트 · 프로젝트 다시 고르기";
const EVIDENCE_NOT_IN_TABLE = "코드표에 없는 증빙 종류 · 증빙 종류 고르기";
const AMOUNT_NOT_POSITIVE = "금액 0 이하 · 금액 수정";
const DIRECTION_INVALID = "구분 없음 · 구분 고르기";
const VERSION_CONFLICT = "다른 사람이 먼저 이 줄을 바꿈 · 새로 고침";
const DUPLICATE_ROW = "같은 줄 중복 · 새로 고침";
const EVIDENCE_TYPE_TABLE = "evidence_type";
// 리뷰 S3 — id는 uuid 열이다. 모양이 아니면 쿼리 전에 칸 이유로 거부한다(PG 22P02가 되지 않게, domain/projects 선례).
const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

function cellError(index: number, rowId: string, field: string, label: string, reason: string): CellFormatError {
  return { rowIndex: index, rowId, field, label, reason };
}

// 입력 계약(B-17 · 엔지니어링 리뷰 B §2) — 금액은 04-40의 normalizeMoneyInput(moneyToColumns 안) 한 규칙을 지나고, 이
// 경로는 금액 > 0(부호는 구분이 정한다) · 달력 날짜 · 코드표 증빙 종류만 더한다. 걸린 칸은 모아 한 번에 거부한다.
function prepareRows(rows: ReserveWriteRow[], evidenceValues: ReadonlySet<string>, errors: CellFormatError[]): PreparedRow[] {
  const prepared: PreparedRow[] = [];
  rows.forEach((input, index) => {
    const before = errors.length;
    if (!UUID_SHAPE.test(input.id)) errors.push(cellError(index, input.id, "row", "줄", ENTRY_NOT_FOUND));
    if (!UUID_SHAPE.test(input.clientId)) errors.push(cellError(index, input.id, "clientId", "클라이언트", CLIENT_NOT_FOUND));
    if (input.projectId && !UUID_SHAPE.test(input.projectId)) errors.push(cellError(index, input.id, "projectId", "프로젝트", PROJECT_CLIENT_MISMATCH));
    if (input.direction !== "deposit" && input.direction !== "withdrawal") {
      errors.push(cellError(index, input.id, "direction", "구분", DIRECTION_INVALID));
    }
    if (input.entryDate === "") errors.push(cellError(index, input.id, "entryDate", "날짜", DATE_EMPTY_ERROR));
    else if (!isCalendarDate(input.entryDate)) errors.push(cellError(index, input.id, "entryDate", "날짜", DATE_FORMAT_ERROR));
    let columns: ReturnType<typeof moneyToColumns> | null = null;
    try {
      columns = moneyToColumns(input.amount);
      if (columns.amountKrw <= 0 || input.amount.amount <= 0) {
        errors.push(cellError(index, input.id, "amount", "금액", AMOUNT_NOT_POSITIVE));
      }
    } catch (error) {
      if (!(error instanceof MoneyInputError)) throw error;
      errors.push(cellError(index, input.id, error.field, error.field === "fxRate" ? "환율" : "금액", error.message));
    }
    if (input.evidenceType && !evidenceValues.has(input.evidenceType)) {
      errors.push(cellError(index, input.id, "evidenceType", "증빙 종류", EVIDENCE_NOT_IN_TABLE));
    }
    if (errors.length > before || columns === null) return;
    prepared.push({
      index,
      input,
      payload: {
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
      },
    });
  });
  return prepared;
}

function samePayload(stored: ReserveEntryRow, payload: ReserveEntryPayload): boolean {
  return (
    stored.entryDate === payload.entryDate &&
    stored.direction === payload.direction &&
    stored.amountCurrency === payload.amountCurrency &&
    stored.amountForeignAmount === payload.amountForeignAmount &&
    stored.amountFxRate === payload.amountFxRate &&
    stored.amountAmountKrw === payload.amountAmountKrw &&
    stored.projectId === payload.projectId &&
    stored.evidenceType === payload.evidenceType &&
    stored.taxInvoiceNumber === payload.taxInvoiceNumber &&
    stored.note === payload.note
  );
}

async function reserveRights(viewer: Viewer, action: "view" | "write", deps?: Partial<Pick<ReserveWriteDeps, "can" | "visible">>): Promise<boolean> {
  const [allowed, shown] = await Promise.all([
    (deps?.can ?? defaultCan)(viewer, PNL_MENU, action),
    (deps?.visible ?? defaultVisible)(viewer, RESERVE_INFO_ITEM),
  ]);
  return allowed && shown;
}

// 트랜잭션 앞에서 읽는다(04-32 — 잠긴 트랜잭션 안에서 풀 db를 부르지 않는다).
async function evidenceTypeValues(viewer: Viewer, rows: ReserveWriteRow[]): Promise<Set<string>> {
  if (!rows.some((row) => row.evidenceType)) return new Set();
  const items = await repoListCodeItems(viewer, { tableKey: EVIDENCE_TYPE_TABLE, scope: { rows: "all", includeArchived: false }, includeInactive: false });
  return new Set(items.map((item) => item.value));
}

type Plan = {
  inserts: PreparedRow[];
  updates: { row: PreparedRow; stored: ReserveEntryRow }[];
  archives: ReserveEntryRow[];
};

// 04-07 — 리저브 저장(새 줄 · 수정 · 보관 배치). 순서: 트랜잭션 앞 권한(pnl 쓰기 + reserve.amount — 숫자 없는 거부)·
// 형식·코드표 → 트랜잭션 → 대상 줄의 저장된 클라이언트 → 클라이언트 행 잠금(id 오름차순 FOR NO KEY UPDATE) → 잠긴
// tx로 대상 줄·원장 재조회 → 참조·상태·재전송 판정 → 배치를 메모리에 적용한 원장의 날짜 마감 판정 → 쓰기·로그(같은
// tx) → 커밋 뒤 최근 환율. 모든 거부는 denyWrite 한 지점에서 write.denied를 남긴다(금액 없음).
export async function saveReserves(viewer: Viewer, input: SaveReservesInput, deps?: Partial<ReserveWriteDeps>): Promise<void> {
  const archivedIds = input.archivedIds ?? [];
  const entryIds = [...input.rows.map((row) => row.id), ...archivedIds];
  const requestedClientIds = [...new Set(input.rows.map((row) => row.clientId))];
  if (!(await reserveRights(viewer, "write", deps))) {
    denyWrite(viewer, FORBIDDEN_RULE, { clientIds: requestedClientIds, entryIds }, new ForbiddenError(FORBIDDEN_MESSAGE));
  }
  const formatErrors: CellFormatError[] = [];
  const prepared = prepareRows(input.rows, await evidenceTypeValues(viewer, input.rows), formatErrors);
  for (const id of archivedIds) {
    if (!UUID_SHAPE.test(id)) formatErrors.push(cellError(-1, id, "row", "줄", ENTRY_NOT_FOUND));
  }
  if (formatErrors.length > 0) {
    denyWrite(viewer, INPUT_RULE, { clientIds: requestedClientIds, entryIds }, new SaveRejectedError([], formatErrors));
  }
  const now = deps?.now?.() ?? new Date();

  const fxToRemember = await withTransaction(async (tx) => {
    // 기존 줄의 클라이언트는 바뀌지 않으므로(사용자 D6) 잠글 id를 잠금 전에 읽어도 된다.
    const preStored = await repoFindEntriesByIds(viewer, entryIds, tx);
    const lockIds = [...new Set([...prepared.filter((row) => row.input.isNew).map((row) => row.input.clientId), ...preStored.map((row) => row.clientId)])].sort();
    const locked = new Set(await repoLockReserveClients(viewer, lockIds, tx));
    await deps?.afterLock?.();
    const storedById = new Map((await repoFindEntriesByIds(viewer, entryIds, tx)).map((row) => [row.id, row]));
    const plan = await planBatch(viewer, prepared, archivedIds, storedById, locked, tx);

    const ledger = new Map((await repoListActiveEntriesByClients(viewer, [...locked], tx)).map((row) => [row.id, toBalanceRow(row)]));
    for (const { row, stored } of plan.updates) {
      ledger.set(stored.id, { ...toBalanceRow(stored), entryDate: row.payload.entryDate, direction: row.input.direction, amountKrw: row.payload.amountAmountKrw });
    }
    for (const row of plan.inserts) {
      ledger.set(row.input.id, { id: row.input.id, clientId: row.input.clientId, entryDate: row.payload.entryDate, direction: row.input.direction, amountKrw: row.payload.amountAmountKrw, createdAt: now });
    }
    for (const stored of plan.archives) ledger.delete(stored.id);
    const balance = runningBalance([...ledger.values()]);
    if (balance.firstNegative) await rejectNegative(viewer, balance.firstNegative, prepared, tx);

    return writePlan(viewer, plan, now, tx, deps);
  });
  await rememberFxAfterCommit(fxToRemember, deps?.rememberFxRate);
}

// 잠긴 tx 안의 참조·상태·재전송 판정. 칸 이유는 모아 한 번에 거부하고, 재전송 불일치·버전 충돌은 배치 전체 거부다.
async function planBatch(
  viewer: Viewer,
  prepared: PreparedRow[],
  archivedIds: string[],
  storedById: Map<string, ReserveEntryRow>,
  locked: Set<string>,
  tx: DbOrTx,
): Promise<Plan> {
  const errors: CellFormatError[] = [];
  let clientLocked = false;
  const plan: Plan = { inserts: [], updates: [], archives: [] };
  const projectIds = [...new Set(prepared.map((row) => row.payload.projectId).filter((id): id is string => id !== null))];
  const projectClients = await repoFindProjectClientIds(viewer, projectIds, tx);

  // 리뷰 B1 — 한 배치에서 같은 id가 두 번(수정 + 보관, 보관 두 번 등) 오면 원장 판정과 쓰기가 어긋난다. 그 id는 거부한다.
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const id of [...prepared.map((row) => row.input.id), ...archivedIds]) (seen.has(id) ? duplicates : seen).add(id);
  for (const id of duplicates) {
    const index = prepared.find((row) => row.input.id === id)?.index ?? -1;
    errors.push(cellError(index, id, "row", "줄", DUPLICATE_ROW));
  }

  for (const row of prepared) {
    const { input, payload, index } = row;
    if (duplicates.has(input.id)) continue;
    const stored = storedById.get(input.id);
    if (input.isNew) {
      if (stored) {
        // 응답을 잃은 재전송(ENG-D10): 같은 클라이언트의 활성 줄이고 값이 같을 때만 no-op — 잔액을 두 번 반영하지 않는다.
        if (stored.clientId !== input.clientId || stored.archivedAt !== null || !samePayload(stored, payload)) {
          denyWrite(viewer, REPLAY_RULE, { clientIds: [input.clientId], entryIds: [input.id] }, new UserFacingError(REPLAY_MISMATCH));
        }
        continue;
      }
      if (!locked.has(input.clientId)) {
        errors.push(cellError(index, input.id, "clientId", "클라이언트", CLIENT_NOT_FOUND));
        continue;
      }
    } else {
      if (!stored) denyWrite(viewer, INPUT_RULE, { entryIds: [input.id] }, new UserFacingError(ENTRY_NOT_FOUND));
      if (stored.archivedAt !== null) {
        errors.push(cellError(index, input.id, "row", "줄", ARCHIVED_ROW));
        continue;
      }
      if (stored.clientId !== input.clientId) {
        clientLocked = true;
        errors.push(cellError(index, input.id, "clientId", "클라이언트", CLIENT_LOCKED));
        continue;
      }
      if (input.version === undefined || stored.version !== input.version) {
        // SF-2 선례 — 첫 커밋이 version을 하나 올렸고 값이 같으면 응답을 잃은 재전송이다.
        if (input.version !== undefined && stored.version === input.version + 1 && samePayload(stored, payload)) continue;
        throw new UserFacingError(VERSION_CONFLICT);
      }
    }
    if (payload.projectId !== null && projectClients.get(payload.projectId) !== input.clientId) {
      errors.push(cellError(index, input.id, "projectId", "프로젝트", PROJECT_CLIENT_MISMATCH));
      continue;
    }
    if (input.isNew) plan.inserts.push(row);
    else if (stored) plan.updates.push({ row, stored });
  }

  for (const id of archivedIds) {
    if (duplicates.has(id)) continue;
    const stored = storedById.get(id);
    if (!stored) denyWrite(viewer, INPUT_RULE, { entryIds: [id] }, new UserFacingError(ENTRY_NOT_FOUND));
    if (stored.archivedAt !== null) {
      errors.push(cellError(-1, id, "row", "줄", ARCHIVED_ROW));
      continue;
    }
    plan.archives.push(stored);
  }

  if (errors.length > 0) {
    const clientIds = [...new Set(prepared.map((row) => row.input.clientId))];
    const entryIds = errors.map((error) => error.rowId).filter((id): id is string => id !== undefined);
    denyWrite(viewer, clientLocked ? CLIENT_LOCKED_RULE : INPUT_RULE, { clientIds, entryIds }, new SaveRejectedError([], errors));
  }
  return plan;
}

export type ReserveBalanceRejection = {
  entryId: string;
  entryDate: string;
  clientId: string;
  clientName: string;
  balanceKrw: number;
  /** 그 줄이 지금 목록(listReserves와 같은 정렬)에서 놓인 쪽 — 새 줄(DB에 없음)이면 null(Codex #7). */
  page: number | null;
};

// 잔액 음수 거부 — 그 날짜 마지막 줄의 금액 칸 오류와 함께 배치 수준 정보를 싣는다(화면 04-42가 다른 쪽의 줄로 옮겨 간다).
export class ReserveBalanceRejectedError extends SaveRejectedError {
  constructor(
    cell: CellFormatError,
    readonly rejection: ReserveBalanceRejection,
  ) {
    super([], [cell]);
  }
}

async function rejectNegative(viewer: Viewer, negative: NegativeClosing, prepared: PreparedRow[], tx: DbOrTx): Promise<never> {
  // 잠긴 tx로 지금 목록(보관 제외)을 읽어 listReserves와 같은 정렬로 그 줄의 위치를 구한다 — 정렬 정의는 하나다.
  const active = (await repoListAllActiveEntries(viewer, tx)).map(toBalanceRow);
  const names = await repoFindClientNames(viewer, [...new Set([...active.map((row) => row.clientId), negative.clientId])], tx);
  const position = sortForList(active, names).findIndex((row) => row.id === negative.lastRowId);
  const index = prepared.find((row) => row.input.id === negative.lastRowId)?.index ?? -1;
  const cell = cellError(index, negative.lastRowId, "amount", "금액", balanceReason(negative.balanceKrw));
  const rejection: ReserveBalanceRejection = {
    entryId: negative.lastRowId,
    entryDate: negative.date,
    clientId: negative.clientId,
    clientName: names.get(negative.clientId) ?? "",
    balanceKrw: negative.balanceKrw,
    page: position < 0 ? null : Math.floor(position / LIST_PAGE_SIZE) + 1,
  };
  return denyWrite(viewer, NEGATIVE_RULE, { clientIds: [negative.clientId], entryIds: [negative.lastRowId] }, new ReserveBalanceRejectedError(cell, rejection));
}

// 수정 로그(B-16 · ENG-D8) — 바뀐 금액(원화)·날짜·구분만 [전, 후]로, 값을 가리지 않는다(활동 기록은 기본값으로 시스템관리자만).
function changedFields(stored: ReserveEntryRow, payload: ReserveEntryPayload): Record<string, [unknown, unknown]> {
  const changed: Record<string, [unknown, unknown]> = {};
  if (stored.amountAmountKrw !== payload.amountAmountKrw) changed.amount = [stored.amountAmountKrw, payload.amountAmountKrw];
  if (stored.entryDate !== payload.entryDate) changed.entryDate = [stored.entryDate, payload.entryDate];
  if (stored.direction !== payload.direction) changed.direction = [stored.direction, payload.direction];
  return changed;
}

async function writePlan(viewer: Viewer, plan: Plan, now: Date, tx: DbOrTx, deps?: Partial<ReserveWriteDeps>): Promise<FxToRemember[]> {
  const recordAction = deps?.recordAction ?? defaultRecordAction;
  const fxToRemember: FxToRemember[] = [];
  const rememberIfTouched = (row: PreparedRow) => {
    if (row.payload.amountCurrency !== "KRW" && row.input.fxRateTouched) {
      fxToRemember.push({ currency: row.payload.amountCurrency as Currency, rate: Number(row.payload.amountFxRate) });
    }
  };
  for (const row of plan.inserts) {
    const inserted = await repoInsertEntry(viewer, { id: row.input.id, clientId: row.input.clientId, createdAt: now, ...row.payload }, tx);
    if (!inserted) denyWrite(viewer, REPLAY_RULE, { clientIds: [row.input.clientId], entryIds: [row.input.id] }, new UserFacingError(REPLAY_MISMATCH));
    await recordAction(viewer, { actionType: "document_create", entity: RESERVE_ENTITY, entityId: row.input.id, detail: { entryId: row.input.id, clientId: row.input.clientId } }, { tx });
    rememberIfTouched(row);
  }
  for (const { row, stored } of plan.updates) {
    const updated = await repoUpdateEntryIfVersionMatches(viewer, stored.id, stored.version, stored.clientId, row.payload, tx);
    if (!updated) throw new UserFacingError(VERSION_CONFLICT);
    await recordAction(
      viewer,
      { actionType: "document_update", entity: RESERVE_ENTITY, entityId: stored.id, detail: { entryId: stored.id, clientId: stored.clientId, changed: changedFields(stored, row.payload) } },
      { tx },
    );
    rememberIfTouched(row);
  }
  for (const stored of plan.archives) {
    await repoSetEntryArchived(viewer, stored.id, true, tx);
    await recordAction(viewer, { actionType: "archive", entity: RESERVE_ENTITY, entityId: stored.id, detail: { entryId: stored.id, clientId: stored.clientId } }, { tx });
  }
  return fxToRemember;
}

// 04-07(B-04 · T5 · OV-2) — 보관함 복원(domain/archive의 DOMAIN_RESTORERS가 위임). 권한은 트랜잭션 앞에서 저장과 같은
// pnl 쓰기 + reserve.amount(숫자 없는 거부) — 보관함 권한(admin.archive)은 위임 앞의 restore()가 이미 판정했다. 그 뒤
// 클라이언트 잠금 → 잠긴 tx로 원장 + 이 줄의 날짜 마감 판정 → 보관 해제 + restore 로그(같은 tx).
export async function restoreReserve(
  viewer: Viewer,
  id: string,
  deps?: Partial<Pick<ReserveWriteDeps, "can" | "visible" | "afterLock" | "recordAction">>,
): Promise<void> {
  if (!(await reserveRights(viewer, "write", deps))) {
    denyWrite(viewer, FORBIDDEN_RULE, { entryIds: [id] }, new ForbiddenError(FORBIDDEN_MESSAGE));
  }
  if (!UUID_SHAPE.test(id)) denyWrite(viewer, "reserve.restore", { entryIds: [id] }, new UserFacingError(ENTRY_NOT_FOUND));
  const recordAction = deps?.recordAction ?? defaultRecordAction;
  await withTransaction(async (tx) => {
    const [before] = await repoFindEntriesByIds(viewer, [id], tx);
    if (!before) denyWrite(viewer, "reserve.restore", { entryIds: [id] }, new UserFacingError(ENTRY_NOT_FOUND));
    // 클라이언트는 첫 저장 뒤 바뀌지 않으므로 잠금 전에 읽어도 된다(사용자 D6).
    await repoLockReserveClients(viewer, [before.clientId], tx);
    await deps?.afterLock?.();
    const [current] = await repoFindEntriesByIds(viewer, [id], tx);
    if (!current || current.archivedAt === null) return;
    const ledger = (await repoListActiveEntriesByClients(viewer, [current.clientId], tx)).map(toBalanceRow);
    const negative = runningBalance([...ledger, toBalanceRow(current)]).firstNegative;
    if (negative) {
      const reason = `복원하면 ${negative.date} 잔액 ${formatKrw(negative.balanceKrw)} · 리저브 대장에서 출금 줄 먼저 고치기`;
      denyWrite(viewer, "reserve.restore", { clientIds: [current.clientId], entryIds: [id] }, new UserFacingError(reason));
    }
    await repoSetEntryArchived(viewer, id, false, tx);
    await recordAction(viewer, { actionType: "restore", entity: RESERVE_ENTITY, entityId: id, detail: { entryId: id, clientId: current.clientId } }, { tx });
  });
}

// ── 읽기 ─────────────────────────────────────────────────────────────────

// 목록 순서: 클라이언트 이름 → 클라이언트 id → compareReserveRows. listReserves와 거부 줄의 쪽 번호가 같이 쓴다.
function sortForList(rows: BalanceRow[], names: Map<string, string>): BalanceRow[] {
  return [...rows].sort((a, b) => {
    if (a.clientId !== b.clientId) {
      const byName = (names.get(a.clientId) ?? "").localeCompare(names.get(b.clientId) ?? "", "ko");
      if (byName !== 0) return byName;
      return a.clientId < b.clientId ? -1 : 1;
    }
    return compareReserveRows(a, b);
  });
}

export type ReserveCellEditability = "edit" | "readonly" | "locked";
export type ReserveCellField = "clientId" | "entryDate" | "direction" | "amount" | "fxRate" | "projectId" | "evidenceType" | "taxInvoiceNumber" | "note" | "balanceKrw";
const RESERVE_CELL_FIELDS: ReserveCellField[] = ["clientId", "entryDate", "direction", "amount", "fxRate", "projectId", "evidenceType", "taxInvoiceNumber", "note", "balanceKrw"];

// 서버 셀 단계(사용자 D6) — 기존 줄의 클라이언트 칸은 잠김, 잔액은 계산값이라 누구에게나 읽기 전용, 쓰기 권한이 없으면 전부 잠김.
function reserveCellEditability(isNew: boolean, canWrite: boolean): Record<ReserveCellField, ReserveCellEditability> {
  const cells = {} as Record<ReserveCellField, ReserveCellEditability>;
  for (const field of RESERVE_CELL_FIELDS) {
    if (field === "balanceKrw") cells[field] = "readonly";
    else if (field === "clientId" && !isNew) cells[field] = "locked";
    else cells[field] = canWrite ? "edit" : "locked";
  }
  return cells;
}

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
  cellEditability: Record<ReserveCellField, ReserveCellEditability>;
};

export type ReserveListResult = {
  rows: ReserveEntryDto[];
  page: number;
  pageCount: number;
  total?: number;
  newRowCellEditability?: Record<ReserveCellField, ReserveCellEditability>;
  clientBalances?: { clientId: string; clientName: string; balanceKrw: number }[];
};

// D-59 · CEO 리뷰 B-15 — 대장 전체가 숨김 정보다. 모든 필드를 reserve.amount로 게이트한다(날짜·메모만 싣는 부분 노출 없음).
export const RESERVE_DTO_SPEC: DtoSpec<ReserveEntryDto, ReserveEntryDto> = {
  fields: (
    ["id", "version", "clientId", "clientName", "entryDate", "direction", "amount", "projectId", "evidenceType", "taxInvoiceNumber", "note", "balanceKrw", "cellEditability"] as const
  ).map((key) => ({ key, from: key, infoItem: RESERVE_INFO_ITEM })),
};

registerDto({
  name: "ReserveEntryDto",
  fields: RESERVE_DTO_SPEC.fields.map((field) => ({ key: field.key, infoItem: field.infoItem })),
});

// 50건 번호 페이지(D-91). `pnl` 보기와 reserve.amount가 둘 다 있을 때만 줄을 싣고, 하나라도 없으면 건수·그룹 키 없는
// 빈 결과다(B-15). 잔액은 클라이언트 원장 전체로 계산한 **뒤** 쪽을 자른다 — 몇 쪽을 보든 같은 잔액이다.
export async function listReserves(viewer: Viewer, opts: { page?: number | string }): Promise<ReserveListResult> {
  if (!(await reserveRights(viewer, "view"))) return { rows: [], page: 1, pageCount: 0 };
  const canWrite = await reserveRights(viewer, "write");
  const rows = await repoListAllActiveEntries(viewer);
  const names = await repoFindClientNames(viewer, [...new Set(rows.map((row) => row.clientId))]);
  const balance = runningBalance(rows.map(toBalanceRow));
  const balanceById = new Map(balance.rows.map((row) => [row.id, row.balanceKrw]));
  const finalByClient = new Map(balance.closingByDate.map((closing) => [closing.clientId, closing.balanceKrw]));
  const byId = new Map(rows.map((row) => [row.id, row]));
  const sorted = sortForList(rows.map(toBalanceRow), names);
  const pageCount = pageCountFrom(sorted.length, LIST_PAGE_SIZE);
  const page = clampPage(opts.page, pageCount);
  const pageRows = sorted.slice((page - 1) * LIST_PAGE_SIZE, page * LIST_PAGE_SIZE).map(({ id }) => {
    const row = byId.get(id) as ReserveEntryRow;
    const money = moneyFromRow({ currency: row.amountCurrency, foreignAmount: row.amountForeignAmount, fxRate: row.amountFxRate, amountKrw: row.amountAmountKrw });
    const dto: ReserveEntryDto = {
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
      cellEditability: reserveCellEditability(false, canWrite),
    };
    return dto;
  });
  const pageClientIds = [...new Set(pageRows.map((row) => row.clientId))];
  return {
    rows: (await projectMany(viewer, pageRows, RESERVE_DTO_SPEC)) as ReserveEntryDto[],
    page,
    pageCount,
    total: sorted.length,
    newRowCellEditability: reserveCellEditability(true, canWrite),
    clientBalances: pageClientIds.map((clientId) => ({ clientId, clientName: names.get(clientId) ?? "", balanceKrw: finalByClient.get(clientId) ?? 0 })),
  };
}
