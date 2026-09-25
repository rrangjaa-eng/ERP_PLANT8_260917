import type { Viewer } from "@/domain/viewer";
import { can as defaultCan } from "@/domain/permissions/can";
import { visible as defaultVisible } from "@/domain/permissions/visible";
import { projectMany, type DtoSpec } from "@/domain/permissions/project";
import { recordAction as defaultRecordAction } from "@/domain/action-log/record";
import { registerDto } from "@/domain/permissions/dto-registry";
import { UserFacingError } from "@/lib/actions/user-facing-error";
import { buildCustomFieldsSchema, type FieldDefType } from "@/domain/custom-fields/build-schema";
import { gate, GateBlockedError } from "@/domain/rules/gate";
import "@/domain/rules/register";
import type { ProjectLineEditCtx } from "@/domain/rules/register";
import { denyWrite } from "@/domain/rules/deny-write";
import { loadProjectForGate } from "@/domain/projects/auto-transition";
import { lineCellEditability, QUOTE_LINE_FIELDS, type QuoteCellEditability, type QuoteLineField } from "@/domain/quotes/edit-scope";
import { moneyFromRow, moneyToColumns, quoteAmount, profit, type Money, type Currency } from "@/domain/money";
import { rememberFxRate as defaultRememberFxRate } from "@/domain/money/currency";
import { log } from "@/lib/log";
import { withTransaction } from "@/lib/db-transaction";
import { formatKrw } from "@/lib/format-number";
import type { DbOrTx } from "@/repositories/document-counters";
import {
  listQuoteLinesByRevision as repoListQuoteLinesByRevision,
  insertQuoteLine as repoInsertQuoteLine,
  updateQuoteLineIfVersionMatches as repoUpdateQuoteLineIfVersionMatches,
  findQuoteLinesByIds as repoFindQuoteLinesByIds,
  type QuoteLineRow,
} from "@/repositories/quote-lines";
import {
  findQuoteRevisionById as repoFindQuoteRevisionById,
  findLatestQuoteRevision as repoFindLatestQuoteRevision,
} from "@/repositories/quote-revisions";
import { listFieldDefinitions as repoListFieldDefinitions } from "@/repositories/field-definitions";

export class ForbiddenError extends UserFacingError {}
export class RevisionNotFoundError extends UserFacingError {}

const PROJECTS_MENU = "projects";
const QUOTE_LINE_ENTITY = "quote_line";

export type MoneyInputDto = { currency: Currency; amount: number; fxRate: number };
export type MoneyDto = MoneyInputDto & { amountKrw: number };

function moneyToDto(money: Money): MoneyDto {
  return { currency: money.currency, amount: money.amount, fxRate: money.fxRate, amountKrw: money.amountKrw };
}

// project()가 필드 단위로 투영하는 대상 — quote_lines 행의 접두어 컬럼을
// domain 경계에서 Money로 감싼 뒤 넘긴다(moneyFromRow가 유일한 파서 지점,
// 04-RESEARCH.md Pitfall 4). quantity도 여기서 숫자로 바꾼다(Money가 아닌
// 배수라 domain/money 밖에서 처리 — Money 산술이 아니다).
type QuoteLineProjectable = {
  id: string;
  revisionId: string;
  sortOrder: number;
  subcategory: string;
  itemName: string;
  vendorId: string | null;
  quantity: number;
  unitPrice: MoneyDto;
  execution: MoneyDto;
  quoteAmountKrw: number;
  profitKrw: number;
  lineStatus: string;
  note: string | null;
  copiedFromLineId: string | null;
  version: number;
  customFields: Record<string, unknown>;
  cellEditability: Record<QuoteLineField, QuoteCellEditability>;
};

function toProjectable(row: QuoteLineRow, cellEditability: Record<QuoteLineField, QuoteCellEditability>): QuoteLineProjectable {
  return {
    id: row.id,
    revisionId: row.revisionId,
    sortOrder: row.sortOrder,
    subcategory: row.subcategory,
    itemName: row.itemName,
    vendorId: row.vendorId,
    quantity: Number(row.quantity),
    unitPrice: moneyToDto(
      moneyFromRow({
        currency: row.unitPriceCurrency,
        foreignAmount: row.unitPriceForeignAmount,
        fxRate: row.unitPriceFxRate,
        amountKrw: row.unitPriceAmountKrw,
      }),
    ),
    execution: moneyToDto(
      moneyFromRow({
        currency: row.executionCurrency,
        foreignAmount: row.executionForeignAmount,
        fxRate: row.executionFxRate,
        amountKrw: row.executionAmountKrw,
      }),
    ),
    quoteAmountKrw: row.quoteAmountKrw,
    profitKrw: row.profitKrw,
    lineStatus: row.lineStatus,
    note: row.note,
    copiedFromLineId: row.copiedFromLineId,
    version: row.version,
    customFields: row.customFields as Record<string, unknown>,
    cellEditability,
  };
}

// PROJ-02: 견적 줄 Dto. 견적가·차익·단가·실행가는 전부 `quote.amount`
// 정보 항목으로 게이트한다(Task 2 ⑧).
export type QuoteLineDto = {
  id: string;
  revisionId: string;
  sortOrder: number;
  subcategory: string;
  itemName: string;
  vendorId: string | null;
  quantity: number;
  unitPrice: MoneyDto;
  execution: MoneyDto;
  quoteAmountKrw: number;
  profitKrw: number;
  lineStatus: string;
  note: string | null;
  copiedFromLineId: string | null;
  version: number;
  customFields: Record<string, unknown>;
  // 04-12(D-78) — 칸마다 서버가 판정한 편집 단계(화면 반영은 04-30).
  cellEditability: Record<QuoteLineField, QuoteCellEditability>;
};

export const QUOTE_LINE_DTO_SPEC: DtoSpec<QuoteLineProjectable, QuoteLineDto> = {
  fields: [
    { key: "id", from: "id", infoItem: "project.value" },
    { key: "revisionId", from: "revisionId", infoItem: "project.value" },
    { key: "sortOrder", from: "sortOrder", infoItem: "project.value" },
    { key: "subcategory", from: "subcategory", infoItem: "project.value" },
    { key: "itemName", from: "itemName", infoItem: "project.value" },
    { key: "vendorId", from: "vendorId", infoItem: "project.value" },
    { key: "quantity", from: "quantity", infoItem: "project.value" },
    { key: "unitPrice", from: "unitPrice", infoItem: "quote.amount" },
    { key: "execution", from: "execution", infoItem: "quote.amount" },
    { key: "quoteAmountKrw", from: "quoteAmountKrw", infoItem: "quote.amount" },
    { key: "profitKrw", from: "profitKrw", infoItem: "quote.amount" },
    { key: "lineStatus", from: "lineStatus", infoItem: "project.value" },
    { key: "note", from: "note", infoItem: "project.value" },
    { key: "copiedFromLineId", from: "copiedFromLineId", infoItem: "project.value" },
    { key: "version", from: "version", infoItem: "project.value" },
    { key: "customFields", from: "customFields", infoItem: "project.value" },
    { key: "cellEditability", from: "cellEditability", infoItem: "project.value" },
  ],
};

registerDto({
  name: "QuoteLineDto",
  fields: QUOTE_LINE_DTO_SPEC.fields.map((field) => ({ key: field.key, infoItem: field.infoItem })),
});

async function quoteLineCustomFieldsSchema(viewer: Viewer) {
  const defs = await repoListFieldDefinitions(viewer, QUOTE_LINE_ENTITY);
  return buildCustomFieldsSchema(
    defs.map((def) => ({
      key: def.key,
      type: def.type as FieldDefType,
      options: Array.isArray(def.options) ? (def.options as string[]) : undefined,
      required: def.required,
    })),
  );
}

// D-54: 최신 차수만 '현재 차수'. 상세 화면이 이 함수로 그 차수의 id를
// 얻어 listQuoteLines/saveQuoteLines에 넘긴다. 차수 자체의 전체 DTO(승인
// 표시·차수 목록)는 04-02가 만든다 — 이 플랜은 id·seq만 최소로 돌려준다.
export type CurrentQuoteRevisionInfo = { id: string; seq: number; approved: boolean };

export async function getCurrentQuoteRevision(
  viewer: Viewer,
  projectId: string,
): Promise<CurrentQuoteRevisionInfo | null> {
  const revision = await repoFindLatestQuoteRevision(viewer, projectId);
  if (!revision) return null;
  return { id: revision.id, seq: revision.seq, approved: revision.customerApprovedAt !== null };
}

// 04-12(D-78 · ENG-D3 ②) — 셀 단계는 게이트와 같은 lineCellEditability로 줄마다 계산하고, 투영은 projectMany
// 한 번(노출 조회가 줄 수가 아니라 정보 항목 수만큼).
export type QuoteLineListCtx = { status: string; canWrite: boolean };

async function projectLines(viewer: Viewer, rows: QuoteLineRow[], ctx: QuoteLineListCtx): Promise<QuoteLineDto[]> {
  const cells = lineCellEditability({ status: ctx.status, canWrite: ctx.canWrite, hasLinkedDocuments: false, isNewLine: false });
  return (await projectMany(viewer, rows.map((row) => toProjectable(row, cells)), QUOTE_LINE_DTO_SPEC)) as QuoteLineDto[];
}

export async function listQuoteLines(viewer: Viewer, revisionId: string, ctx: QuoteLineListCtx): Promise<QuoteLineDto[]> {
  const rows = await repoListQuoteLinesByRevision(viewer, revisionId);
  return projectLines(viewer, rows, ctx);
}

// 화면이 보내는 줄 하나 — 모든 줄이 id(uuid)를 싣는다. `isNew`면 화면이 만든 id로 넣는 새 줄
// (ENG-D10), 아니면 기존 줄 갱신(version 필수). **quoteAmountKrw·profitKrw 필드를 받지 않는다** — 클라이언트가
// 뭘 보내든 서버는 이 타입에 없는 값을 읽지 않는다(PROJ-02, D-63).
// 04-04 Task 2 ② — 이 줄을 불러왔을 때(version을 읽은 시점) 클라이언트가
// 본 값의 스냅샷. `id`가 있는 기존 줄에서만 의미가 있고, 저장 시점 버전이
// 그대로면 쓰이지 않는다. 버전이 달라졌을 때만 이 값과 서버의 현재 값을
// 셀 단위로 비교해 **실제로 달라진 셀만** 충돌로 판정한다(D-65) — 그냥
// "버전이 다르다"만으로 그 줄 전체를 충돌 처리하지 않는다.
export type QuoteLineBaseline = {
  subcategory: string;
  itemName: string;
  vendorId: string | null;
  quantity: number;
  unitPriceAmountKrw: number;
  executionAmountKrw: number;
  lineStatus: string;
  note: string | null;
};

export type QuoteLineWriteRow = {
  id: string;
  isNew?: true;
  version?: number;
  subcategory: string;
  itemName: string;
  vendorId?: string | null;
  quantity?: number;
  unitPrice: MoneyInputDto;
  /** 04-02(D-71) — 단가 환율 칸을 이번 저장에서 실제로 고쳤을 때만 true. */
  unitPriceFxRateTouched?: boolean;
  execution: MoneyInputDto;
  lineStatus?: string;
  note?: string | null;
  customFields?: Record<string, unknown>;
  baseline?: QuoteLineBaseline;
};

type CompareField = keyof QuoteLineBaseline;

const FIELD_LABELS: Record<CompareField, string> = {
  subcategory: "소분류",
  itemName: "항목",
  vendorId: "거래처",
  quantity: "수량",
  unitPriceAmountKrw: "단가",
  executionAmountKrw: "실행가",
  lineStatus: "상태",
  note: "비고",
};

const COMPARE_FIELDS: CompareField[] = [
  "subcategory",
  "itemName",
  "vendorId",
  "quantity",
  "unitPriceAmountKrw",
  "executionAmountKrw",
  "lineStatus",
  "note",
];

function currentFieldValue(row: QuoteLineRow, field: CompareField): string | number | null {
  switch (field) {
    case "subcategory":
      return row.subcategory;
    case "itemName":
      return row.itemName;
    case "vendorId":
      return row.vendorId;
    case "quantity":
      return Number(row.quantity);
    case "unitPriceAmountKrw":
      return row.unitPriceAmountKrw;
    case "executionAmountKrw":
      return row.executionAmountKrw;
    case "lineStatus":
      return row.lineStatus;
    case "note":
      return row.note;
  }
}

function formatFieldValue(field: CompareField, value: string | number | null): string {
  if (field === "unitPriceAmountKrw" || field === "executionAmountKrw") {
    return formatKrw(Number(value ?? 0));
  }
  return value === null || value === "" ? "—" : String(value);
}

// PROJ-02·D-65 — 줄 버전 충돌·셀 단위 판정 결과. `reason`은 Copywriting
// Contract "Error — 셀(충돌)" 형식 그대로: "다른 사람이 HH:mm에 값으로
// 바꿈 · 덮어쓰기 / 그 값으로".
export type CellConflict = {
  rowId: string;
  field: CompareField;
  label: string;
  reason: string;
  theirValue: string;
  /** 04-28 거부 봉투 — 서버 현재 원값(표시 글자 theirValue와 별개)과 그 줄의 서버 현재 version. */
  theirRaw: string | number | null;
  theirVersion: number;
};

export type CellFormatError = {
  rowIndex: number;
  rowId?: string;
  field: string;
  label: string;
  reason: string;
};

// PROJ-02·D-65·UX-04 — 배치 저장이 충돌·형식 오류를 이유로 전부 거부할 때
// 던지는 구조화된 오류. `.message`는 next-safe-action의 handleServerError를
// 거쳐 화면 alert 문자열이 되고, `.conflicts`/`.formatErrors`는 이 함수를
// 직접 호출하는(도메인 계층) 테스트가 셀 단위 판정을 검증할 때 쓴다.
export class SaveRejectedError extends UserFacingError {
  readonly conflicts: CellConflict[];
  readonly formatErrors: CellFormatError[];
  /** 04-28 — 합계 행 요약(`충돌 N줄 · 전부 거부` / `오류 N칸 · 전부 거부`). */
  readonly summary: string;

  constructor(conflicts: CellConflict[], formatErrors: CellFormatError[]) {
    const summaryParts: string[] = [];
    if (conflicts.length > 0) {
      const rowCount = new Set(conflicts.map((c) => c.rowId)).size;
      summaryParts.push(`충돌 ${rowCount}줄 · 전부 거부`);
    }
    if (formatErrors.length > 0) {
      summaryParts.push(`오류 ${formatErrors.length}칸 · 전부 거부`);
    }
    const summary = summaryParts.join(" · ");
    const detail = [...conflicts, ...formatErrors].map((issue) => `[${issue.label}] ${issue.reason}`).join(" · ");
    super(`${summary}${detail ? " · " + detail : ""}`);
    this.summary = summary;
    this.conflicts = conflicts;
    this.formatErrors = formatErrors;
  }
}

export type QuoteLineComputedAmounts = {
  unitPriceColumns: ReturnType<typeof moneyToColumns>;
  executionColumns: ReturnType<typeof moneyToColumns>;
  quoteAmountKrw: number;
  profitKrw: number;
};

// PROJ-02·D-63 — DB에 닿지 않는 순수 계산이라 단위 테스트가 이 함수를
// 직접 부른다(test/unit/domain/quote-lines.test.ts). 입력 타입
// (`{quantity, unitPrice, execution}`)에는 애초에 quoteAmountKrw·profitKrw
// 필드가 없다 — 클라이언트가 그 값을 실어 보내도(조작된 raw 페이로드를
// 흉내낸 호출이라도) 이 함수는 읽지 않고 domain/money로 다시 계산한다.
export function computeQuoteLineAmounts(input: {
  quantity?: number;
  unitPrice: MoneyInputDto;
  execution: MoneyInputDto;
}): QuoteLineComputedAmounts {
  const unitPriceMoney = moneyFromRow(moneyToColumns(input.unitPrice));
  const executionMoney = moneyFromRow(moneyToColumns(input.execution));
  const quoteAmountKrw = quoteAmount(input.quantity, unitPriceMoney);
  const profitKrw = profit(quoteAmountKrw, executionMoney);

  return {
    unitPriceColumns: moneyToColumns(input.unitPrice),
    executionColumns: moneyToColumns(input.execution),
    quoteAmountKrw,
    profitKrw,
  };
}

// 04-04 Task 2 ② — 버전이 다른 줄 하나의 칸 단위 충돌. baseline과 서버
// 현재 값이 실제로 다른 칸만 담는다. baseline이 없으면(방어적 폴백 — 정상
// 클라이언트는 항상 보낸다) 줄 전체를 itemName 한 칸의 충돌로 본다.
function cellConflictsFor(rowId: string, baseline: QuoteLineBaseline | undefined, current: QuoteLineRow): CellConflict[] {
  if (!baseline) {
    return [
      {
        rowId,
        field: "itemName",
        label: FIELD_LABELS.itemName,
        reason: "다른 사람이 이 줄을 바꿨습니다 · 덮어쓰기 / 그 값으로",
        theirValue: current.itemName,
        theirRaw: current.itemName,
        theirVersion: current.version,
      },
    ];
  }

  const changedAt = current.updatedAt.toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Seoul",
  });

  const conflicts: CellConflict[] = [];
  for (const field of COMPARE_FIELDS) {
    const baselineValue = baseline[field];
    const currentValue = currentFieldValue(current, field);
    if (baselineValue === currentValue) continue; // 값이 실제로 같으면 충돌이 아니다.
    const theirValue = formatFieldValue(field, currentValue);
    conflicts.push({
      rowId,
      field,
      label: FIELD_LABELS[field],
      reason: `다른 사람이 ${changedAt}에 ${theirValue}으로 바꿈 · 덮어쓰기 / 그 값으로`,
      theirValue,
      theirRaw: currentValue,
      theirVersion: current.version,
    });
  }
  return conflicts;
}


export type SaveQuoteLinesResult = { lines: QuoteLineDto[] };

// 저장 입력 — 차수의 줄 배치.
export type QuoteLinesWriteInput = { rows: QuoteLineWriteRow[] };

export type QuoteLineWriteDeps = {
  can: typeof defaultCan;
  recordAction: typeof defaultRecordAction;
  // 테스트 전용 주입 — 날짜(자동 정산 판정)와 잠금 획득 직후 호출(경합 재현, sleep 없이).
  now: () => Date;
  afterLock: () => Promise<void>;
  rememberFxRate: typeof defaultRememberFxRate;
};

const LINE_EDIT_RULE = "project.line-edit";
const MEMBERSHIP_RULE = "quote.line-membership";
// UI-SPEC rev 5 `Error — 저장(순서·소속, 방어)`.
const MEMBERSHIP_MISMATCH = "차수와 프로젝트가 맞지 않음 · 새로 고침";

type QuoteLineCustomFieldsSchema = Awaited<ReturnType<typeof quoteLineCustomFieldsSchema>>;

// ① 트랜잭션 전(ENG-D3 ① · ARCHITECTURE §4-8) — 잠근 행과 무관한 사실: 권한·금액 노출·차수의 프로젝트(바뀌지
// 않는 사실)·사용자 정의 필드 스키마. 여기서만 풀을 부른다.
export type PreparedQuoteLineSave = {
  revisionId: string;
  projectId: string;
  customFieldsSchema: QuoteLineCustomFieldsSchema;
};

export async function prepareQuoteLineSave(
  viewer: Viewer,
  revisionId: string,
  deps?: Partial<Pick<QuoteLineWriteDeps, "can">>,
): Promise<PreparedQuoteLineSave> {
  const canFn = deps?.can ?? defaultCan;
  if (!(await canFn(viewer, PROJECTS_MENU, "write"))) {
    throw new ForbiddenError("견적 줄 저장 권한이 없습니다.");
  }
  // 금액을 볼 수 없는 사람은 줄을 저장하지 못한다 — 화면은 금액 없이 줄을
  // 받으므로, 저장을 허용하면 단가·실행가가 0으로 덮인다(/ship 리뷰).
  if (!(await defaultVisible(viewer, "quote.amount"))) {
    throw new ForbiddenError("견적 금액을 볼 수 없어 견적 줄을 저장할 수 없습니다.");
  }

  const revision = await repoFindQuoteRevisionById(viewer, revisionId);
  if (!revision) throw new RevisionNotFoundError("존재하지 않는 차수입니다.");

  return { revisionId, projectId: revision.projectId, customFieldsSchema: await quoteLineCustomFieldsSchema(viewer) };
}

// 쓰기 페이로드 — 판정(바뀐 칸 비교)과 쓰기가 같은 정규화를 거친 값을 쓴다(A-21): 수량 고정 소수 · 금액 열
// (통화·외화 금액·환율·원화) · 빈 비고 null.
function writePayload(row: QuoteLineWriteRow) {
  const { unitPriceColumns, executionColumns, quoteAmountKrw, profitKrw } = computeQuoteLineAmounts(row);
  const quantity = row.quantity && row.quantity > 0 ? row.quantity : 1;
  return {
    subcategory: row.subcategory,
    itemName: row.itemName,
    vendorId: row.vendorId ?? null,
    quantity: quantity.toFixed(2),
    unitPriceCurrency: unitPriceColumns.currency,
    unitPriceForeignAmount: unitPriceColumns.foreignAmount,
    unitPriceFxRate: unitPriceColumns.fxRate,
    unitPriceAmountKrw: unitPriceColumns.amountKrw,
    executionCurrency: executionColumns.currency,
    executionForeignAmount: executionColumns.foreignAmount,
    executionFxRate: executionColumns.fxRate,
    executionAmountKrw: executionColumns.amountKrw,
    quoteAmountKrw,
    profitKrw,
    lineStatus: row.lineStatus ?? "not_started",
    note: row.note ? row.note : null,
  };
}

type QuoteLineWritePayload = ReturnType<typeof writePayload>;

const FIELD_COLUMNS: Record<QuoteLineField, readonly (keyof QuoteLineWritePayload & keyof QuoteLineRow)[]> = {
  subcategory: ["subcategory"],
  itemName: ["itemName"],
  vendorId: ["vendorId"],
  quantity: ["quantity"],
  unitPrice: ["unitPriceCurrency", "unitPriceForeignAmount", "unitPriceFxRate", "unitPriceAmountKrw"],
  execution: ["executionCurrency", "executionForeignAmount", "executionFxRate", "executionAmountKrw"],
  lineStatus: ["lineStatus"],
  note: ["note"],
};

// A-21 — DB 현재 값과 정규화된 쓰기 페이로드를 같은 표현끼리 비교한다(클라이언트 baseline을 믿지 않는다).
function changedFields(current: QuoteLineRow, payload: QuoteLineWritePayload): QuoteLineField[] {
  return QUOTE_LINE_FIELDS.filter((field) => FIELD_COLUMNS[field].some((column) => current[column] !== payload[column]));
}

function rowFormatErrors(input: QuoteLineWriteRow, rowIndex: number): CellFormatError[] {
  const errors: CellFormatError[] = [];
  if (input.quantity !== undefined && input.quantity <= 0) {
    errors.push({ rowIndex, rowId: input.id, field: "quantity", label: "수량", reason: "숫자가 아닙니다 · 0보다 큰 수를 적어 주세요" });
  }
  if (input.unitPrice.amount < 0) {
    errors.push({ rowIndex, rowId: input.id, field: "unitPrice", label: "단가", reason: "숫자가 아닙니다 · 12,400,000처럼 적어 주세요" });
  }
  if (input.execution.amount < 0) {
    errors.push({ rowIndex, rowId: input.id, field: "execution", label: "실행가", reason: "숫자가 아닙니다 · 12,400,000처럼 적어 주세요" });
  }
  return errors;
}

const CELL_LABELS: Record<QuoteLineField, string> = {
  subcategory: "소분류",
  itemName: "항목",
  vendorId: "거래처",
  quantity: "수량",
  unitPrice: "단가",
  execution: "실행가",
  lineStatus: "상태",
  note: "비고",
};

export type FxToRemember = { currency: Currency; rate: number };

// ② 트랜잭션 안 쓰기 단계의 결과 — 커밋 뒤 단계(투영·최근 환율 기억)의 입력.
export type WrittenQuoteLines = {
  projectStatus: string;
  activeRows: QuoteLineRow[];
  fxToRemember: FxToRemember[];
};

// ② 트랜잭션 안(A-06 · OV-3 · A-21 · A-03 · B-01 · B-26) — 순서: (a) 프로젝트 행 배타 잠금(loadProjectForGate —
// 합성 저장에서는 재판정 뒤 새 행) (b) 줄 소속(그 차수의 줄만) (c) 줄마다 쓰기 페이로드를 먼저 만들고 DB 현재 값과
// 비교해 바뀐 칸 (d) 버전 충돌·형식 오류·게이트(바뀐 칸이 있는 줄만) — 게이트·소속 거부는 denyWrite 한 지점에서
// 전부 거부, 형식·충돌은 로그 없이 전부 거부 (e) 쓰기 — 기존 줄의 sort_order는 그대로, 새 줄은 차수 끝(max + 1)
// (f) 행동 로그(같은 tx — 되돌린 저장은 로그도 없다) (g) 활성 줄 전체. 이 단계는 풀을 부르지 않는다 — 모든
// 리포지토리 호출이 tx를 받는다.
export async function writeQuoteLinesInTx(
  viewer: Viewer,
  prepared: PreparedQuoteLineSave,
  input: QuoteLinesWriteInput,
  tx: DbOrTx,
  deps?: Partial<Pick<QuoteLineWriteDeps, "now" | "afterLock" | "recordAction">>,
): Promise<WrittenQuoteLines> {
  const recordAction = deps?.recordAction ?? defaultRecordAction;
  const { revisionId, projectId, customFieldsSchema } = prepared;
  const denyIds = { projectId, revisionId, lineIds: input.rows.map((row) => row.id) };

  // (a)
  const projectRow = await loadProjectForGate(viewer, projectId, { now: deps?.now, tx, afterLock: deps?.afterLock }, { recordAction });
  if (!projectRow) throw new RevisionNotFoundError("연결된 프로젝트를 찾을 수 없습니다.");
  const status = projectRow.status;

  // (b)
  const existingIds = [...new Set(input.rows.filter((row) => !row.isNew).map((row) => row.id))];
  const currentRows = await repoFindQuoteLinesByIds(viewer, existingIds, { revisionId }, tx);
  const currentById = new Map(currentRows.map((row) => [row.id, row] as const));

  let denial: { rule: string; error: Error } | null = null;
  if (currentRows.length !== existingIds.length) {
    denial = { rule: MEMBERSHIP_RULE, error: new UserFacingError(MEMBERSHIP_MISMATCH) };
  }

  // (c)(d)
  const conflicts: CellConflict[] = [];
  const formatErrors: CellFormatError[] = [];
  const gateErrors: CellFormatError[] = [];
  const planned: { input: QuoteLineWriteRow; payload: QuoteLineWritePayload; customFields: Record<string, unknown> }[] = [];

  if (!denial) {
    for (const [rowIndex, row] of input.rows.entries()) {
      formatErrors.push(...rowFormatErrors(row, rowIndex));
      const payload = writePayload(row);
      const customFields = customFieldsSchema.parse(row.customFields ?? {}) as Record<string, unknown>;
      planned.push({ input: row, payload, customFields });

      if (row.isNew) {
        const ctx = { status, hasLinkedDocuments: false, change: { kind: "insert", quoteCellsZero: false } } satisfies ProjectLineEditCtx;
        const decision = await gate(projectRow, LINE_EDIT_RULE, ctx);
        if (!decision.allowed && !denial) denial = { rule: LINE_EDIT_RULE, error: new GateBlockedError(decision.reason) };
        continue;
      }

      if (row.version === undefined) {
        throw new UserFacingError("기존 줄을 저장하려면 버전 정보가 필요합니다 · 화면을 새로고침해 주세요");
      }
      const current = currentById.get(row.id);
      if (!current) continue; // (b)가 이미 막았다.
      if (current.version !== row.version) conflicts.push(...cellConflictsFor(row.id, row.baseline, current));

      // 바뀐 칸마다 판정해 칸 오류로 싣는다(이유 = 표 위 한 줄과 같은 문자열). 바뀐 칸이 없으면 게이트를 부르지 않는다.
      for (const field of changedFields(current, payload)) {
        const ctx = { status, hasLinkedDocuments: false, change: { kind: "update", fields: [field] } } satisfies ProjectLineEditCtx;
        const decision = await gate(projectRow, LINE_EDIT_RULE, ctx);
        if (!decision.allowed) gateErrors.push({ rowIndex, rowId: row.id, field, label: CELL_LABELS[field], reason: decision.reason });
      }
    }
    if (!denial && gateErrors.length > 0) {
      denial = { rule: LINE_EDIT_RULE, error: new SaveRejectedError(conflicts, [...formatErrors, ...gateErrors]) };
    }
  }

  // B-26 — 게이트·소속 거부의 한 지점(운영 로그 write.denied, 금액 없음). 뒤 플랜의 규칙도 이 지점을 지난다.
  if (denial) denyWrite(viewer, denial.rule, denyIds, denial.error);
  if (conflicts.length > 0 || formatErrors.length > 0) throw new SaveRejectedError(conflicts, formatErrors);

  // (e)
  const activeBefore = await repoListQuoteLinesByRevision(viewer, revisionId, tx);
  let nextSortOrder = activeBefore.reduce((max, row) => Math.max(max, row.sortOrder), -1) + 1;
  const fxToRemember: FxToRemember[] = [];

  for (const { input: row, payload, customFields } of planned) {
    // D-71 — 환율 칸을 실제로 고친 저장에서만 그 통화의 최근 환율을 기억한다(커밋 뒤 — 트랜잭션을 연 쪽이).
    if (payload.unitPriceCurrency !== "KRW" && row.unitPriceFxRateTouched) {
      fxToRemember.push({ currency: payload.unitPriceCurrency, rate: Number(payload.unitPriceFxRate) });
    }

    if (row.isNew) {
      await repoInsertQuoteLine(viewer, { id: row.id, revisionId, sortOrder: nextSortOrder, ...payload, customFields }, tx);
      nextSortOrder += 1;
      continue;
    }

    // input.version은 위 판정에서 undefined가 아님을 이미 확인했다.
    const updated = await repoUpdateQuoteLineIfVersionMatches(viewer, row.id, row.version!, { revisionId }, payload, tx);
    if (!updated) {
      // 사전 판정과 실제 쓰기 사이의 드문 경합 — 같은 구조화 오류로 거부한다(아직 커밋 전이라 전체가 되돌아간다).
      // 04-28 — 같은 트랜잭션에서 서버 현재 행을 다시 읽어, 실제로 달라진 칸만 서버 값·버전으로 싣는다.
      const [current] = await repoFindQuoteLinesByIds(viewer, [row.id], { revisionId }, tx);
      if (!current) throw new UserFacingError(MEMBERSHIP_MISMATCH);
      const raceConflicts = cellConflictsFor(row.id, row.baseline, current);
      throw new SaveRejectedError(raceConflicts.length > 0 ? raceConflicts : cellConflictsFor(row.id, undefined, current), []);
    }
  }

  // (f) 엔지 리뷰 A §1 P2 — 같은 tx(합성 저장이 뒤에서 거부되면 이 로그도 되돌아간다).
  await recordAction(
    viewer,
    { actionType: "document_update", entity: QUOTE_LINE_ENTITY, entityId: revisionId, detail: { lineIds: denyIds.lineIds } },
    { tx },
  );

  // (g) 엔지 리뷰 A §2 P2 — 결과는 차수의 활성 줄 전체(표시 순서).
  return { projectStatus: status, activeRows: await repoListQuoteLinesByRevision(viewer, revisionId, tx), fxToRemember };
}

// ③ 커밋 뒤 — 최근 환율 기억(편의 기억 — 실패해도 저장은 끝났다, 오류 로그만).
export async function rememberFxAfterCommit(
  entries: FxToRemember[],
  remember: typeof defaultRememberFxRate = defaultRememberFxRate,
): Promise<void> {
  for (const entry of entries) {
    try {
      await remember(entry.currency, entry.rate);
    } catch {
      log.error("fx.remember_failed", { currency: entry.currency });
    }
  }
}

// ③ 커밋 뒤 — projectMany 투영(ENG-D3 ②). 쓰기를 통과한 사람이라 쓰기 권한 참.
export async function finishQuoteLineSave(viewer: Viewer, written: WrittenQuoteLines): Promise<SaveQuoteLinesResult> {
  return { lines: await projectLines(viewer, written.activeRows, { status: written.projectStatus, canWrite: true }) };
}

// PROJ-02·D-65·D-66·UX-04 — 단독 배치 저장. 세 단계를 차례로 부른다(합성 저장은 domain/projects/ledger.ts가
// 같은 세 단계를 자기 트랜잭션 순서 안에서 부른다).
export async function saveQuoteLines(
  viewer: Viewer,
  revisionId: string,
  input: QuoteLinesWriteInput,
  deps?: Partial<QuoteLineWriteDeps>,
): Promise<SaveQuoteLinesResult> {
  const prepared = await prepareQuoteLineSave(viewer, revisionId, deps);
  const written = await withTransaction((tx) => writeQuoteLinesInTx(viewer, prepared, input, tx, deps));
  await rememberFxAfterCommit(written.fxToRemember, deps?.rememberFxRate);
  return finishQuoteLineSave(viewer, written);
}
