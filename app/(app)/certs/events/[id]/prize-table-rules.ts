import { normalizePrizeName, parsePrizeAmount, type PrizeCellError } from "@/domain/certs/prize-rules";
import { certPrizeListed, certRrnPurgeTarget } from "@/domain/certs/prize-value";
import { contactMissingText } from "../request-rules";

// 04.3-10 — I′3 경품 편집 표의 순수 판정(UI-SPEC I′3 경품 섹션 · 「개정 (2026-10-01 결정 확정)」 T2 · T12). React · DB ·
// 설정을 import하지 않는다. 셀 판정 자체는 서버와 같은 domain/certs/prize-rules.ts(validatePrizeRows)다.

// QR 생성 뒤 같은 화면이 접수 중으로 다시 그려지면 경품 섹션이 QR 섹션 라벨(tabindex -1)로 포커스를 옮긴다.
export const QR_SECTION_LABEL_ID = "cert-qr-section-label";

/** 화면 줄 — 값은 화면 글자(가액 쉼표 · 전달 현장/택배). 저장된 줄은 id · version이 있다. */
export type DraftPrizeRow = {
  key: string;
  id?: string;
  version?: number;
  name: string;
  unitValue: string;
  delivery: string;
  winnerCount: string;
};

export const NEW_PRIZE_DEFAULTS: Omit<DraftPrizeRow, "key"> = { name: "", unitValue: "", delivery: "현장", winnerCount: "1" };

const EDIT_COLUMNS = ["name", "unitValue", "delivery", "winnerCount"] as const;

export type PrizeChangesBody = {
  updates: Array<{ id: string; version: number; name?: string; unitValue?: string; delivery?: string; winnerCount?: string }>;
  inserts: Array<{ key: string; name: string; unitValue: string; delivery: string; winnerCount: string }>;
  deletes: Array<{ id: string; version: number }>;
};

function sameCell(column: (typeof EDIT_COLUMNS)[number], a: string, b: string): boolean {
  if (column === "name") return normalizePrizeName(a) === normalizePrizeName(b);
  if (column === "unitValue") return a.replace(/,/g, "").trim() === b.replace(/,/g, "").trim();
  return a.trim() === b.trim();
}

/** 저장 요청 본문 — 저장된 줄은 바뀐 칸만, 새 줄은 전 칸, 지운 저장 줄은 id · version. */
export function prizeChangesBody(
  saved: readonly DraftPrizeRow[],
  current: readonly DraftPrizeRow[],
  deleted: ReadonlyArray<{ id: string; version: number }>,
): PrizeChangesBody {
  const savedByKey = new Map(saved.map((row) => [row.key, row]));
  const body: PrizeChangesBody = { updates: [], inserts: [], deletes: [...deleted] };
  for (const row of current) {
    const before = savedByKey.get(row.key);
    if (!before || !before.id || before.version === undefined) {
      body.inserts.push({ key: row.key, name: row.name, unitValue: row.unitValue, delivery: row.delivery, winnerCount: row.winnerCount });
      continue;
    }
    const patch: PrizeChangesBody["updates"][number] = { id: before.id, version: before.version };
    let changed = false;
    for (const column of EDIT_COLUMNS) {
      if (!sameCell(column, before[column], row[column])) {
        patch[column] = row[column];
        changed = true;
      }
    }
    if (changed) body.updates.push(patch);
  }
  return body;
}

export type GenerateKey = { key: string; body: string };

// 보낸 본문이 같을 때만 같은 키 — 결과 모름 재시도는 QR 하나. 고쳐 보내면 새 키라 옛 키가 이미 만들었으면 서버가
// alreadyGenerated(표 편집 저장 안 됨을 말함)를 돌려준다(수령자 제출 intake-flow.tsx와 같은 규약).
export function generateKeyFor(prev: GenerateKey | null, body: PrizeChangesBody, newKey: () => string): GenerateKey {
  const text = JSON.stringify(body);
  if (prev && prev.body === text) return prev;
  return { key: newKey(), body: text };
}

/**
 * 「일괄 저장 Ctrl+S N」의 N — 화면 전체 dirty 칸 수(§7-3 (사)): 저장된 줄의 바뀐 칸 + 새 줄의 기본값과 다른 칸(방금 만든 빈 새
 * 줄도 1) + 지운 줄 1.
 */
export function dirtyCellCount(body: PrizeChangesBody): number {
  const updated = body.updates.reduce((sum, patch) => sum + EDIT_COLUMNS.filter((column) => patch[column] !== undefined).length, 0);
  const inserted = body.inserts.reduce(
    (sum, row) => sum + Math.max(1, EDIT_COLUMNS.filter((column) => !sameCell(column, row[column], NEW_PRIZE_DEFAULTS[column])).length),
    0,
  );
  return updated + inserted + body.deletes.length;
}

// ── 제출 셀 미리 보기(편집 중 가액 — 판정은 저장 때 서버, G0 DR-2 · 「개정 (2026-10-01)」 T4) ─────────────────

export type SubmitCell =
  | { kind: "count"; n: number }
  | { kind: "noCert" }
  | { kind: "purge"; n: number; p: number }
  | { kind: "missing"; n: number; k: number };

// 한 칸에 하나: ① 그 줄 제출 가운데 가액 × 수량 ≤ 50,000인 건 p ≥ 1 → `{N} · 파기 대상 {p}` ② 1개 가액 ≤ 50,000 ∧ N = 0 →
// `확인증 없음` ③ 닫힘 ∧ 1개 가액 > 50,000 ∧ N < 당첨 수 M → `{N} · 미제출 {k}`(k = M − N — 04.3-17 E9 c · UD-3 a · DR-4) ④ 그 밖
// `{N}`. N · p는 대조 제외를 뺀 수(서버가 준 quantityCounts). 편집 중 값이 금액이 아니면 저장된 가액, 당첨 수 칸이 정수가 아니면
// 미제출을 세지 않는다. 접수 중 · 신청됨(closed 아님)에는 미제출이 서지 않는다(행사 중 모자람은 정상).
export function submitCellPreview(input: {
  unitValue: string;
  savedUnitValueKrw?: number;
  submittedCount: number;
  quantityCounts: ReadonlyArray<{ quantity: number; count: number }>;
  closed?: boolean;
  winnerCount?: string;
}): SubmitCell {
  const amount = parsePrizeAmount(input.unitValue) ?? input.savedUnitValueKrw ?? null;
  if (amount === null) return { kind: "count", n: input.submittedCount };
  const p = input.quantityCounts.filter((q) => certRrnPurgeTarget(amount, q.quantity)).reduce((sum, q) => sum + q.count, 0);
  if (p > 0) return { kind: "purge", n: input.submittedCount, p };
  if (!certPrizeListed(amount) && input.submittedCount === 0) return { kind: "noCert" };
  const winners = /^\d+$/.test((input.winnerCount ?? "").trim()) ? Number(input.winnerCount) : null;
  if (input.closed && certPrizeListed(amount) && winners !== null && input.submittedCount < winners) {
    return { kind: "missing", n: input.submittedCount, k: winners - input.submittedCount };
  }
  return { kind: "count", n: input.submittedCount };
}

export function submitCellText(cell: SubmitCell): string {
  if (cell.kind === "noCert") return "확인증 없음";
  if (cell.kind === "purge") return `${cell.n} · 파기 대상 ${cell.p}`;
  if (cell.kind === "missing") return `${cell.n} · 미제출 ${cell.k}`;
  return String(cell.n);
}

// 셀 오류 문장(명사형 — UI-SPEC Copywriting 새 흐름 I′3 셀 오류 · T2).
export function prizeCellErrorText(error: Pick<PrizeCellError, "code" | "count">): string {
  switch (error.code) {
    case "required":
      return "비어 있음 · 경품명 적기";
    case "tooLong":
      return "80자 넘음 · 80자 안으로 줄이기";
    case "duplicateName":
      return `같은 경품명 ${error.count ?? 2}줄 · 한 줄 고치기`;
    case "amount":
      return "금액 아님 · 1,290,000처럼 적기";
    case "delivery":
      return "현장·택배 아님 · 둘 중 하나 고르기";
    case "winnerCount":
      return "1~999 정수 아님 · 1처럼 적기";
  }
}

export function pinPrizeCellErrors(errors: readonly PrizeCellError[]): Record<string, string> {
  const pinned: Record<string, string> = {};
  for (const error of errors) pinned[`${error.rowKey}:${error.column}`] = prizeCellErrorText(error);
  return pinned;
}

export function cellErrorSummary(count: number): string {
  return `오류 ${count}칸 · 전부 거부`;
}

export type QrBlock = { text: string; tone: "block" };

// 「QR 생성」 막힘 한 번에 하나, 이 순서(DR-12): 문의 전화 없음(I′2와 같은 두 문장) → 경품 없음 → 50,000 넘는 경품 없음.
export function qrBlockReason(input: {
  contactMissing: boolean;
  canOpenSettings: boolean;
  rowCount: number;
  listedCount: number;
}): QrBlock | null {
  if (input.contactMissing) return { text: contactMissingText(input.canOpenSettings), tone: "block" };
  if (input.rowCount === 0) return { text: "경품 없음 · 첫 줄 만들기", tone: "block" };
  if (input.listedCount === 0) return { text: "50,000 넘는 경품 없음 · 가액 확인", tone: "block" };
  return null;
}

// 결과 불명 — 신청과 같은 이유로 명사형(옛 I2 선례 꼴, /design-review 확인 요청).
export const GENERATE_UNKNOWN_TEXT = "생성 결과 모름 · 다시 누르기";

export type GenerateOutcome =
  | { kind: "ok" }
  | { kind: "alreadyGenerated" }
  | { kind: "blocked"; reason: "contactMissing" | "noPrize" | "noListedPrize" }
  | { kind: "invalid"; cellErrors: PrizeCellError[] }
  | { kind: "readOnly" }
  | { kind: "conflict"; prizes: Array<Record<string, unknown>> }
  | { kind: "forbidden" }
  | { kind: "notFound" }
  | { kind: "failed" };

// 다른 키로 이미 생성됨 — 성공 토스트가 아니라 사실 한 줄(화면은 서버가 다시 그린다 — 독립 검토 W3, /design-review 확인).
export const ALREADY_GENERATED_TEXT = "이미 QR 생성 · 표 편집 저장 안 됨";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

// ForbiddenError 문장(domain CERT_FORBIDDEN_MESSAGE) — serverError로 온다.
export const FORBIDDEN_SERVER_ERROR = "권한 없음";

// 액션 응답(또는 "unreachable")을 갈래로. 모르는 모양 · 연결 끊김 · 그 밖 serverError는 결과 불명(failed — 같은 요청 키로 다시).
export function generateOutcome(response: unknown): GenerateOutcome {
  if (!isRecord(response) || response.validationErrors !== undefined) return { kind: "failed" };
  if (response.serverError !== undefined) return response.serverError === FORBIDDEN_SERVER_ERROR ? { kind: "forbidden" } : { kind: "failed" };
  const data = response.data;
  if (!isRecord(data)) return { kind: "failed" };
  switch (data.kind) {
    case "ok":
    case "alreadyGenerated":
    case "readOnly":
    case "notFound":
      return { kind: data.kind };
    case "conflict":
      return Array.isArray(data.prizes) ? { kind: "conflict", prizes: data.prizes as Array<Record<string, unknown>> } : { kind: "failed" };
    case "blocked":
      return data.reason === "contactMissing" || data.reason === "noPrize" || data.reason === "noListedPrize"
        ? { kind: "blocked", reason: data.reason }
        : { kind: "failed" };
    case "invalid":
      return Array.isArray(data.cellErrors) ? { kind: "invalid", cellErrors: data.cellErrors as PrizeCellError[] } : { kind: "failed" };
    default:
      return { kind: "failed" };
  }
}

// ── 저장 결과(「일괄 저장」 · Ctrl+S) ─────────────────────────────────────────────

export type SaveOutcome =
  | { kind: "saved"; rows: number }
  | { kind: "invalid"; cellErrors: PrizeCellError[] }
  | { kind: "readOnly"; prizes?: Array<Record<string, unknown>> }
  | { kind: "conflict"; prizes: Array<Record<string, unknown>> }
  | { kind: "forbidden" }
  | { kind: "notFound" }
  | { kind: "failed" };

export function saveOutcome(response: unknown): SaveOutcome {
  if (!isRecord(response) || response.validationErrors !== undefined) return { kind: "failed" };
  if (response.serverError !== undefined) return response.serverError === FORBIDDEN_SERVER_ERROR ? { kind: "forbidden" } : { kind: "failed" };
  const data = response.data;
  if (!isRecord(data)) return { kind: "failed" };
  switch (data.kind) {
    case "saved":
      return typeof data.rows === "number" ? { kind: "saved", rows: data.rows } : { kind: "failed" };
    case "invalid":
      return Array.isArray(data.cellErrors) ? { kind: "invalid", cellErrors: data.cellErrors as PrizeCellError[] } : { kind: "failed" };
    case "conflict":
      return Array.isArray(data.prizes) ? { kind: "conflict", prizes: data.prizes as Array<Record<string, unknown>> } : { kind: "failed" };
    case "readOnly":
      return Array.isArray(data.prizes) ? { kind: "readOnly", prizes: data.prizes as Array<Record<string, unknown>> } : { kind: "readOnly" };
    case "notFound":
      return { kind: data.kind };
    default:
      return { kind: "failed" };
  }
}

const KST_TIME = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

// 합계 행 오른쪽 한 줄(§7-3). 저장 거부는 사실만(G10 a — 「다시 시도」 없음). 셀 오류 · 충돌 요약은 표가 센다.
export function saveResultText(outcome: SaveOutcome, at: Date): string | null {
  switch (outcome.kind) {
    case "saved":
      return `저장됨 ${outcome.rows}줄 ${KST_TIME.format(at)}`;
    case "forbidden":
      return "저장 안 됨 · 권한 없음";
    case "notFound":
      return "저장 안 됨 · 없는 행사";
    case "readOnly":
      return READ_ONLY_REASON;
    case "failed":
      return SAVE_UNKNOWN_TEXT;
    default:
      return null;
  }
}

// 제출 있는 줄의 경품명 · 전달 읽기 전용 이유(N5 a + E6 a — DR-2).
export const READ_ONLY_REASON = "제출 있음 · 가액 · 당첨 수만 고침";
// 결과 불명 — 신청 · 생성과 같은 명사형(옛 I2 선례 꼴, /design-review 확인 요청).
export const SAVE_UNKNOWN_TEXT = "저장 결과 모름 · 다시 누르기";

// ── 버전 충돌(§7-3 (나) — 그 줄에서 실제로 값이 달라진 칸만 고정, 이유에 값 · 사람 · 시각, 다음 한 수 둘) ─────────────────

const CONFLICT_NEXT = " · 덮어쓰기 / 그 값으로";
// 서버가 지운 줄을 내가 고쳤다 — 덮어쓰기는 새 줄로, 그 값으로는 빼기(독립 검토 W4 ⓒ, /design-review 확인).
export const SERVER_DELETED_REASON = `다른 사람이 지움${CONFLICT_NEXT}`;

// 마지막 글자 받침 — 한글 음절이면 그 글자, 숫자면 읽는 소리(영 · 일 · 삼 · 육 · 칠 · 팔 받침), 그 밖은 받침 있음으로 둔다.
function finalConsonant(text: string): "none" | "rieul" | "other" {
  const last = text.trim().slice(-1);
  const digit = "0123456789".indexOf(last);
  if (digit !== -1) return (["other", "rieul", "none", "other", "none", "none", "other", "rieul", "rieul", "none"] as const)[digit] ?? "other";
  const code = last.charCodeAt(0);
  if (code < 0xac00 || code > 0xd7a3) return "other";
  const jong = (code - 0xac00) % 28;
  return jong === 0 ? "none" : jong === 8 ? "rieul" : "other";
}

function conflictText(meta: { updatedAt?: string | null; updatedByName?: string | null }, value: string): string {
  const who = meta.updatedByName ? `${meta.updatedByName}${finalConsonant(meta.updatedByName) === "none" ? "가" : "이"}` : "다른 사람이";
  const at = meta.updatedAt ? ` ${KST_TIME.format(new Date(meta.updatedAt))}에` : "";
  const to = finalConsonant(value) === "other" ? "으로" : "로";
  return `${who}${at} ${value}${to} 바꿈${CONFLICT_NEXT}`;
}

export type ServerPrize<T extends DraftPrizeRow> = { row: T; updatedAt?: string | null; updatedByName?: string | null };
export type PrizeConflict<T extends DraftPrizeRow> = {
  /** 서버의 지금 줄 — 서버가 지웠으면 null. */
  server: T | null;
  /** 고정할 칸과 그 이유. */
  cells: Partial<Record<(typeof EDIT_COLUMNS)[number], string>>;
  /** 내가 지운 줄을 다른 사람이 바꿔 되살렸다. */
  deletedByMe: boolean;
};
export type ConflictState<T extends DraftPrizeRow> = {
  saved: T[];
  rows: T[];
  deleted: Array<{ id: string; version: number }>;
  conflicts: Record<string, PrizeConflict<T>>;
};

/**
 * 충돌 응답의 서버 줄로 표를 맞춘다. 표에 있는 줄 가운데 버전이 다른 줄은 기준(saved)과 달라진 칸만 고정하고 내 편집은 남긴다.
 * 서버에만 있는 줄(다른 사람이 더한 줄)은 표 · 기준에 더한다. 내가 지운 줄의 버전이 달라졌으면 서버 값으로 되살려 고정한다.
 * 서버가 지운 줄은 내가 고쳤으면 고정하고, 안 고쳤으면 조용히 뺀다.
 */
export function mergeConflict<T extends DraftPrizeRow>(input: {
  saved: readonly T[];
  rows: readonly T[];
  deleted: ReadonlyArray<{ id: string; version: number }>;
  server: ReadonlyArray<ServerPrize<T>>;
}): ConflictState<T> {
  const serverByKey = new Map(input.server.map((entry) => [entry.row.key, entry]));
  const savedByKey = new Map(input.saved.map((row) => [row.key, row]));
  const conflicts: Record<string, PrizeConflict<T>> = {};
  const changedCells = (before: T | undefined, entry: ServerPrize<T>) => {
    const cells: PrizeConflict<T>["cells"] = {};
    for (const column of EDIT_COLUMNS) {
      if (!before || !sameCell(column, before[column], entry.row[column])) cells[column] = conflictText(entry, entry.row[column]);
    }
    return Object.keys(cells).length > 0 ? cells : { name: conflictText(entry, entry.row.name) };
  };

  const rows: T[] = [];
  const dropped = new Set<string>();
  for (const row of input.rows) {
    const before = savedByKey.get(row.key);
    if (!row.id || !before) {
      rows.push(row);
      continue;
    }
    const entry = serverByKey.get(row.key);
    if (!entry) {
      const edited = EDIT_COLUMNS.some((column) => !sameCell(column, before[column], row[column]));
      if (edited) {
        conflicts[row.key] = { server: null, cells: { name: SERVER_DELETED_REASON }, deletedByMe: false };
        rows.push(row);
      } else {
        dropped.add(row.key);
      }
      continue;
    }
    if (entry.row.version !== before.version) conflicts[row.key] = { server: entry.row, cells: changedCells(before, entry), deletedByMe: false };
    rows.push(row);
  }

  const inTable = new Set(input.rows.map((row) => row.key));
  const deletedById = new Map(input.deleted.map((d) => [d.id, d]));
  const deleted: Array<{ id: string; version: number }> = [];
  const added: T[] = [];
  for (const entry of input.server) {
    if (inTable.has(entry.row.key)) continue;
    const mine = entry.row.id ? deletedById.get(entry.row.id) : undefined;
    if (mine && mine.version === entry.row.version) continue;
    added.push(entry.row);
    if (mine) conflicts[entry.row.key] = { server: entry.row, cells: changedCells(savedByKey.get(entry.row.key), entry), deletedByMe: true };
  }
  for (const d of input.deleted) {
    const entry = serverByKey.get(d.id);
    if (entry && entry.row.version === d.version) deleted.push(d);
  }

  const saved = [
    ...input.saved.filter((row) => !dropped.has(row.key) && (serverByKey.has(row.key) || conflicts[row.key])),
    ...added.filter((row) => !savedByKey.has(row.key)),
  ];
  return { saved, rows: [...rows, ...added], deleted, conflicts };
}

/** 충돌 한 줄 풀기 — mine(덮어쓰기: 내 뜻을 서버의 지금 버전 위에) · theirs(그 값으로). */
export function resolveConflict<T extends DraftPrizeRow>(state: ConflictState<T>, key: string, choice: "mine" | "theirs"): ConflictState<T> {
  const conflict = state.conflicts[key];
  if (!conflict) return state;
  const conflicts = Object.fromEntries(Object.entries(state.conflicts).filter(([k]) => k !== key));
  const { server } = conflict;
  if (!server) {
    // 서버가 지운 줄 — 덮어쓰기는 같은 값의 새 줄, 그 값으로는 표에서 뺀다.
    const saved = state.saved.filter((row) => row.key !== key);
    if (choice === "theirs") return { ...state, saved, rows: state.rows.filter((row) => row.key !== key), conflicts };
    const rows = state.rows.map((row) => {
      if (row.key !== key) return row;
      const fresh = { ...row };
      delete fresh.id;
      delete fresh.version;
      return fresh;
    });
    return { ...state, saved, rows, conflicts };
  }
  const saved = state.saved.some((row) => row.key === key)
    ? state.saved.map((row) => (row.key === key ? server : row))
    : [...state.saved, server];
  if (conflict.deletedByMe && choice === "mine" && server.id && server.version !== undefined) {
    return {
      saved,
      rows: state.rows.filter((row) => row.key !== key),
      deleted: [...state.deleted, { id: server.id, version: server.version }],
      conflicts,
    };
  }
  const rows = choice === "theirs" ? state.rows.map((row) => (row.key === key ? server : row)) : state.rows;
  return { ...state, saved, rows, conflicts };
}

/** 「일괄 저장」 readOnly 뒤 — 서버 줄의 잠김 · 제출 수를 표 줄에 옮긴다(값은 그대로 — 독립 검토 W4 ⓐ). */
export function withServerLocks<T extends { key: string; locked: boolean; submittedCount: number }>(
  rows: readonly T[],
  server: ReadonlyArray<{ id?: unknown; locked?: unknown; submittedCount?: unknown }>,
): T[] {
  const byId = new Map(server.flatMap((prize) => (typeof prize.id === "string" ? [[prize.id, prize] as const] : [])));
  return rows.map((row) => {
    const prize = byId.get(row.key);
    if (!prize) return row;
    return {
      ...row,
      locked: prize.locked === true,
      submittedCount: typeof prize.submittedCount === "number" ? prize.submittedCount : row.submittedCount,
    };
  });
}
