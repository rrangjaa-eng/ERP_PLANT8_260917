import { normalizePrizeName, type PrizeCellError } from "@/domain/certs/prize-rules";
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

/** 1차 라벨 · 「일괄 저장 N」의 N — 바뀐 줄 + 새 줄 + 지운 줄. */
export function dirtyRowCount(body: PrizeChangesBody): number {
  return body.updates.length + body.inserts.length + body.deletes.length;
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
  | { kind: "conflict" }
  | { kind: "forbidden" }
  | { kind: "notFound" }
  | { kind: "failed" };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

// ForbiddenError 문장(domain CERT_FORBIDDEN_MESSAGE) — serverError로 온다.
const FORBIDDEN_SERVER_ERROR = "권한 없음";

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
    case "conflict":
    case "notFound":
      return { kind: data.kind };
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
