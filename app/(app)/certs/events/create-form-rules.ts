import type { WinnerRuleCode } from "@/domain/certs/winner-rules";

// 04.3-04 Task 3 ⓪ — I2 행사 만들기 화면의 순수 판정. React · DB · 설정을 import하지 않는다
// (app/(auth)/login/login-error.ts 선례). 화면은 이 함수들만 불러 N · 막힘 이유 · 제출 응답 갈래를 정한다.

export type DraftWinnerRow = {
  key: string;
  name: string;
  phone: string;
  prizeName: string;
  quantity: string;
  delivery: string;
  distinguishLabel: string;
};

export type CreateFormSnapshot = { name: string; wonOn: string; rows: DraftWinnerRow[] };

const DRAFT_COLUMNS = ["name", "phone", "prizeName", "quantity", "delivery", "distinguishLabel"] as const;

export const NEW_ROW_DEFAULTS: Omit<DraftWinnerRow, "key"> = {
  name: "",
  phone: "",
  prizeName: "",
  quantity: "1",
  delivery: "현장",
  distinguishLabel: "",
};

// UI-SPEC 「I2 입력 버리기 확인」 — 처음 값과 다른 칸 수. 새 줄은 기본값과 견준다.
export function countChangedCells(initial: CreateFormSnapshot, current: CreateFormSnapshot): number {
  let changed = 0;
  if (current.name !== initial.name) changed += 1;
  if (current.wonOn !== initial.wonOn) changed += 1;
  const initialRows = new Map(initial.rows.map((row) => [row.key, row]));
  for (const row of current.rows) {
    const baseline = initialRows.get(row.key) ?? NEW_ROW_DEFAULTS;
    for (const column of DRAFT_COLUMNS) if (row[column] !== baseline[column]) changed += 1;
  }
  return changed;
}

export const CERT_CREATE_MAX_WINNERS = 500;

export type BlockReason = { text: string; tone: "block" };

// UI-SPEC 「I2 1차 막힘」 — 한 번에 하나, 이 순서. 내부 폼이라 전부 block(반영 검사 r1 B-1).
// 표 오류 셀은 막힘 이유가 아니다(SYSTEM §7-3 DR-5).
export function createBlockReason(input: {
  contactMissing: boolean;
  canOpenSettings: boolean;
  emptyFields: string[];
  rowCount: number;
}): BlockReason | null {
  if (input.contactMissing) {
    return {
      text: input.canOpenSettings ? "수령자 문의 전화 없음 · 설정 확인증 탭에서 채움" : "수령자 문의 전화 없음 · 등록은 경영관리",
      tone: "block",
    };
  }
  const [first] = input.emptyFields;
  if (first) {
    const fields = input.emptyFields.length > 1 ? `${input.emptyFields.join(" · ")} ${input.emptyFields.length}칸` : first;
    return { text: `${fields} 비어 있음 · ${first} 적기`, tone: "block" };
  }
  if (input.rowCount === 0) return { text: "당첨자 없음 · 첫 줄 만들기", tone: "block" };
  if (input.rowCount > CERT_CREATE_MAX_WINNERS) {
    return { text: `당첨자 ${input.rowCount}명 · ${CERT_CREATE_MAX_WINNERS}명까지 줄이기`, tone: "block" };
  }
  return null;
}

// validateWinnerRows의 11종 + 04.3-10 saveWinners가 만드는 tooManyWinners(E3-35) = 12종.
export type CellErrorCode = WinnerRuleCode | "tooManyWinners";
export type SubmitCellError = { rowKey: string; column: string; code: CellErrorCode; shape?: string; count?: number; total?: number };
export type SubmitFieldErrors = { name?: string; wonOn?: string };

export type SubmitOutcome =
  | { kind: "success"; eventId: string }
  | { kind: "invalid"; cellErrors: SubmitCellError[]; fieldErrors: SubmitFieldErrors }
  | { kind: "contactMissing" }
  | { kind: "failed" };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

// E3-22 — 액션 응답(또는 호출이 던졌을 때 "unreachable")을 네 갈래로. 결과를 알 수 없는 것은 전부 failed.
export function createSubmitOutcome(response: unknown): SubmitOutcome {
  if (!isRecord(response) || response.serverError !== undefined || response.validationErrors !== undefined) {
    return { kind: "failed" };
  }
  const data = response.data;
  if (!isRecord(data)) return { kind: "failed" };
  if (typeof data.eventId === "string" && (data.kind === undefined || data.kind === "ok")) {
    return { kind: "success", eventId: data.eventId };
  }
  if (data.kind === "invalid" && Array.isArray(data.cellErrors)) {
    return {
      kind: "invalid",
      cellErrors: data.cellErrors as SubmitCellError[],
      fieldErrors: isRecord(data.fieldErrors) ? data.fieldErrors : {},
    };
  }
  if (data.kind === "contactMissing") return { kind: "contactMissing" };
  return { kind: "failed" };
}

// 셀 오류 문장 — 사용자 결정 A(2026-09-29 PR #88): 내부 화면 오류는 명사형 「원인 · 다음 행동」
// (DECISIONS 2026-09-26). UI-SPEC 「I2 셀 오류」 문장의 뜻을 그대로 옮긴다. 반환은 문장 맵뿐(tone 없음).
const COLUMN_LABEL: Record<string, string> = {
  name: "이름",
  phone: "전화번호",
  prizeName: "경품명",
  quantity: "수량",
  delivery: "전달",
  distinguishLabel: "구별 표시",
};

const CELL_ERROR_TEXT: Record<Exclude<CellErrorCode, "required" | "shapeDuplicate" | "tooManyWinners">, string> = {
  phoneFormat: "전화번호 형식 아님 · 010-0000-0000처럼 입력",
  quantity: "1 이상 정수 아님 · 1처럼 입력",
  delivery: "현장 또는 택배 아님 · 둘 중 하나로 입력",
  duplicatePerson: "같은 이름·전화번호 이미 있음 · 한 줄 수정",
  nameTooLong: "40자 초과 · 40자 안으로",
  prizeTooLong: "80자 초과 · 80자 안으로",
  labelTooLong: "10자 초과 · 10자 안으로",
  labelDigits: "숫자 3개 이상 이어짐 · 전화번호 말고 오전 조처럼 입력",
  labelName: "당첨자 이름 들어 있음 · 이름 말고 오전 조처럼 입력",
};

function cellErrorText(error: SubmitCellError): string {
  switch (error.code) {
    case "required":
      return `${COLUMN_LABEL[error.column] ?? error.column} 비어 있음 · 입력`;
    case "shapeDuplicate":
      return `수령자 목록에 ${error.shape ?? ""} ${error.count ?? 0}줄 · 구별 표시를 서로 다르게 입력(예: 오전 조)`;
    case "tooManyWinners":
      return `당첨자 ${error.total ?? 0}명 · ${CERT_CREATE_MAX_WINNERS}명까지 줄이기`;
    default:
      return CELL_ERROR_TEXT[error.code];
  }
}

export function pinCellErrors(cellErrors: SubmitCellError[]): Record<string, string> {
  const pinned: Record<string, string> = {};
  for (const error of cellErrors) pinned[`${error.rowKey}:${error.column}`] = cellErrorText(error);
  return pinned;
}

export function cellErrorSummary(count: number): string {
  return `오류 ${count}칸 · 전부 거부`;
}

export function pinFieldErrors(fieldErrors: SubmitFieldErrors): { name?: string; wonOn?: string } {
  const pinned: { name?: string; wonOn?: string } = {};
  if (fieldErrors.name === "required") pinned.name = "행사 이름 비어 있음 · 입력";
  else if (fieldErrors.name === "tooLong") pinned.name = "80자 초과 · 80자 안으로";
  if (fieldErrors.wonOn === "required") pinned.wonOn = "당첨일 비어 있음 · 입력";
  return pinned;
}
