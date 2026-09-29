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

export type SubmitCellError = { rowKey: string; column: string; code: string; shape?: string; count?: number; total?: number };
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
