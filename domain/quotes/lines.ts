import { z } from "zod";
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
import type { ProjectLineEditCtx, QuoteLineCapCtx } from "@/domain/rules/register";
import { denyWrite } from "@/domain/rules/deny-write";
import { loadProjectForGate } from "@/domain/projects/auto-transition";
import { resolveLinkedDocumentsByLineage } from "@/domain/quotes/lineage";
import {
  lineCellEditability,
  linkedDocumentReason,
  orderChange,
  quoteCellsZero,
  QUOTE_LINE_FIELDS,
  QUOTE_LINE_KINDS,
  QUOTE_LINE_STATUSES,
  type QuoteCellEditability,
  type QuoteLineField,
  type QuoteLineKind,
} from "@/domain/quotes/edit-scope";
import {
  moneyFromRow,
  moneyToColumns,
  normalizeMoneyInput,
  MoneyInputError,
  quoteAmount,
  quoteAmountWithinBound,
  profit,
  type Money,
  type Currency,
} from "@/domain/money";
import { rememberFxRate as defaultRememberFxRate } from "@/domain/money/currency";
import { log } from "@/lib/log";
import { withTransaction } from "@/lib/db-transaction";
import { formatKrw } from "@/lib/format-number";
import type { DbOrTx } from "@/repositories/document-counters";
import {
  listQuoteLinesByRevision as repoListQuoteLinesByRevision,
  insertQuoteLineIfAbsent as repoInsertQuoteLineIfAbsent,
  updateQuoteLineIfVersionMatches as repoUpdateQuoteLineIfVersionMatches,
  findQuoteLinesByIds as repoFindQuoteLinesByIds,
  findQuoteLineById as repoFindQuoteLineById,
  setQuoteLineSortOrders as repoSetQuoteLineSortOrders,
  archiveQuoteLines as repoArchiveQuoteLines,
  restoreQuoteLineRow as repoRestoreQuoteLineRow,
  countActiveLinesByRevision as repoCountActiveLinesByRevision,
  type QuoteLineRow,
} from "@/repositories/quote-lines";
import {
  findQuoteRevisionById as repoFindQuoteRevisionById,
  findLatestQuoteRevision as repoFindLatestQuoteRevision,
} from "@/repositories/quote-revisions";
import { listFieldDefinitions as repoListFieldDefinitions } from "@/repositories/field-definitions";
import { getSettingValue } from "@/domain/settings/registry";
import { QUOTE_LINE_MAX_PER_REVISION } from "@/domain/settings/keys";

export class ForbiddenError extends UserFacingError {}
export class RevisionNotFoundError extends UserFacingError {}

const PROJECTS_MENU = "projects";
const ADJUSTMENT_MENU = "projects.adjustment";
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
  lineKind: string;
  note: string | null;
  copiedFromLineId: string | null;
  version: number;
  customFields: Record<string, unknown>;
  cellEditability: Record<QuoteLineField, QuoteCellEditability>;
  hasLinkedDocuments: boolean;
  readonlyReason: string | null;
};

type LineEditFacts = {
  cellEditability: Record<QuoteLineField, QuoteCellEditability>;
  hasLinkedDocuments: boolean;
  readonlyReason: string | null;
};

function toProjectable(row: QuoteLineRow, facts: LineEditFacts): QuoteLineProjectable {
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
    lineKind: row.lineKind,
    note: row.note,
    copiedFromLineId: row.copiedFromLineId,
    version: row.version,
    customFields: row.customFields as Record<string, unknown>,
    ...facts,
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
  // 04-13(D-48 · D-83) — 줄 종류(quote · out_of_quote · adjustment). 화면(04-23)이 그룹·행 모양을 이것으로 그린다.
  lineKind: string;
  note: string | null;
  copiedFromLineId: string | null;
  version: number;
  customFields: Record<string, unknown>;
  // 04-12(D-78) — 칸마다 서버가 판정한 편집 단계(화면 반영은 04-30).
  cellEditability: Record<QuoteLineField, QuoteCellEditability>;
  // 04-12(D-66 · DR-35) — 연결 문서가 있는 줄의 읽기 전용 이유(04-30이 편집 시도의 이유 줄로 쓴다).
  hasLinkedDocuments: boolean;
  readonlyReason: string | null;
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
    { key: "lineKind", from: "lineKind", infoItem: "project.value" },
    { key: "note", from: "note", infoItem: "project.value" },
    { key: "copiedFromLineId", from: "copiedFromLineId", infoItem: "project.value" },
    { key: "version", from: "version", infoItem: "project.value" },
    { key: "customFields", from: "customFields", infoItem: "project.value" },
    { key: "cellEditability", from: "cellEditability", infoItem: "project.value" },
    { key: "hasLinkedDocuments", from: "hasLinkedDocuments", infoItem: "project.value" },
    { key: "readonlyReason", from: "readonlyReason", infoItem: "project.value" },
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

// 잠긴 트랜잭션 안에서 부를 때는 tx를 넘긴다(04-32 — 잠금 안 전역 db 호출 금지).
export async function getCurrentQuoteRevision(
  viewer: Viewer,
  projectId: string,
  tx?: DbOrTx,
): Promise<CurrentQuoteRevisionInfo | null> {
  const revision = await repoFindLatestQuoteRevision(viewer, projectId, tx);
  if (!revision) return null;
  return { id: revision.id, seq: revision.seq, approved: revision.customerApprovedAt !== null };
}

// 04-12(D-78 · ENG-D3 ②) — 셀 단계는 게이트와 같은 lineCellEditability로 줄마다 계산하고, 투영은 projectMany
// 한 번(노출 조회가 줄 수가 아니라 정보 항목 수만큼).
// 04-13(D-83) — `canAdjust`는 권한표 `projects.adjustment` 쓰기(없으면 조정 줄은 잠김).
// 04-14(GAP 5c · DR-13) — `locked`는 이전 차수 잠김 조회: 모든 줄의 모든 셀이 `locked`(쓰기·조정 권한과 무관).
export type QuoteLineListCtx = { status: string; canWrite: boolean; canAdjust?: boolean; locked?: boolean };

// D-66 — 줄마다 연결된 지출결의(번호). 이 페이즈에는 지출결의가 없어 빈 결과다 — Phase 5가 이 함수만 채운다.
// 저장 트랜잭션 안에서도 불리므로 tx를 받는다.
export type LinkedDocumentsByLine = Map<string, { number: string }[]>;

// 04-14(D-55) — 문서 출처(Phase 5 — 줄 id별 문서)가 준 것을 계보 해석으로 현재 차수 줄에 잇는다. 조회 지점은 여전히 이
// 함수 하나다. 이 페이즈는 출처가 빈 결과라 계보 줄을 읽지 않는다.
export function linkedDocumentsByLine(viewer: Viewer, revisionId: string, tx?: DbOrTx): Promise<LinkedDocumentsByLine> {
  void viewer;
  void revisionId;
  void tx;
  return Promise.resolve(resolveLinkedDocumentsByLineage([], new Map<string, { number: string }[]>()).byCurrentLine);
}

// 04-13 — DB CHECK(quote_lines_line_kind_check)가 세 값만 받는다.
function lineKindOf(row: QuoteLineRow): QuoteLineKind {
  return row.lineKind as QuoteLineKind;
}

async function projectLines(
  viewer: Viewer,
  rows: QuoteLineRow[],
  ctx: QuoteLineListCtx,
  linked: LinkedDocumentsByLine,
): Promise<QuoteLineDto[]> {
  const projectables = rows.map((row) => {
    const firstLinked = linked.get(row.id)?.[0];
    const hasLinkedDocuments = firstLinked !== undefined;
    return toProjectable(row, {
      cellEditability: lineCellEditability({
        status: ctx.status,
        canWrite: ctx.locked ? false : ctx.canWrite,
        hasLinkedDocuments,
        isNewLine: false,
        lineKind: lineKindOf(row),
        canAdjust: ctx.locked ? false : (ctx.canAdjust ?? false),
      }),
      hasLinkedDocuments,
      readonlyReason: firstLinked ? linkedDocumentReason(firstLinked.number) : null,
    });
  });
  return (await projectMany(viewer, projectables, QUOTE_LINE_DTO_SPEC)) as QuoteLineDto[];
}

export async function listQuoteLines(viewer: Viewer, revisionId: string, ctx: QuoteLineListCtx): Promise<QuoteLineDto[]> {
  const rows = await repoListQuoteLinesByRevision(viewer, revisionId);
  return projectLines(viewer, rows, ctx, await linkedDocumentsByLine(viewer, revisionId));
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
  /** 04-12(사용자 D10) — 이 새 줄이 어느 줄의 복제인지(게이트의 `duplicate` 판정). */
  duplicatedFrom?: string;
  /** 04-13 — 새 줄의 종류(없으면 quote). 기존 줄의 종류는 DB 행이 정한다. */
  lineKind?: QuoteLineKind;
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
// 04-12(PROJ-02) — 취소 줄의 견적가는 0이다(수량·단가 열은 이력으로 그대로 둔다).
export function computeQuoteLineAmounts(input: {
  quantity?: number;
  unitPrice: MoneyInputDto;
  execution: MoneyInputDto;
  lineStatus?: string;
}): QuoteLineComputedAmounts {
  const unitPriceMoney = moneyFromRow(moneyToColumns(input.unitPrice));
  const executionMoney = moneyFromRow(moneyToColumns(input.execution));
  const quoteAmountKrw = input.lineStatus === "cancelled" ? 0 : quoteAmount(input.quantity, unitPriceMoney);
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

// 저장 입력 — 차수의 줄 배치. `order`는 저장 뒤 활성 줄 전체의 표시 순서(보관할 줄 제외 · 새 줄 포함),
// `archivedLineIds`는 이번 저장에서 지울(보관할) 줄(엔지 리뷰 A §2 P2 · D-56).
export type QuoteLinesWriteInput = { rows: QuoteLineWriteRow[]; order?: string[]; archivedLineIds?: string[] };

// A-37 — 화면 입력 검증. 줄 상태는 QUOTE_LINE_STATUSES만, 줄·보관·순서 id는 uuid. 줄 id가 없는 새 줄은
// 04-30이 화면 uuid를 싣기 전까지의 과도기다(액션이 서버 uuid를 붙인다). 기존 줄은 version을 싣는다.
const quoteLineMoneyInputSchema = z.object({
  currency: z.enum(["KRW", "USD"]),
  amount: z.coerce.number(),
  fxRate: z.coerce.number(),
});

export const quoteLineRowInputSchema = z
  .object({
    id: z.string().uuid().optional(),
    isNew: z.literal(true).optional(),
    duplicatedFrom: z.string().uuid().optional(),
    version: z.number().optional(),
    subcategory: z.string(),
    itemName: z.string().min(1, "항목명을 입력하세요."),
    vendorId: z.string().optional(),
    quantity: z.coerce.number().optional(),
    unitPrice: quoteLineMoneyInputSchema,
    unitPriceFxRateTouched: z.boolean().optional(),
    execution: quoteLineMoneyInputSchema,
    lineStatus: z.enum(QUOTE_LINE_STATUSES).optional(),
    // 04-13 — 새 줄의 종류(기존 줄은 싣지 않는다 — 서버가 DB 종류를 쓴다).
    lineKind: z.enum(QUOTE_LINE_KINDS).optional(),
    note: z.string().optional(),
    // 04-04 Task 2 ② — 이 줄을 불러왔을 때의 스냅샷(D-65 셀 단위 충돌 판정의 baseline). 기존 줄에서만 의미가 있다.
    baseline: z
      .object({
        subcategory: z.string(),
        itemName: z.string(),
        vendorId: z.string().nullable(),
        quantity: z.number(),
        unitPriceAmountKrw: z.number(),
        executionAmountKrw: z.number(),
        lineStatus: z.enum(QUOTE_LINE_STATUSES),
        note: z.string().nullable(),
      })
      .optional(),
  })
  .refine((row) => row.id === undefined || row.isNew === true || row.version !== undefined, {
    message: "기존 줄을 저장하려면 버전 정보가 필요합니다 · 화면을 새로고침해 주세요",
    path: ["version"],
  })
  // 04-13(엔지 리뷰 GAP 6) — 소분류는 견적 줄(종류 없음 = 기존 줄 포함)에서만 필수. 조정·견적 외 비용 줄의 소분류 칸은
  // 서버가 종류 값으로 채운다.
  .superRefine((row, ctx) => {
    if ((row.lineKind === undefined || row.lineKind === "quote") && row.subcategory.length === 0) {
      ctx.addIssue({ code: "custom", message: "소분류를 고르세요.", path: ["subcategory"] });
    }
  });

export const quoteLinesInputSchema = z.object({
  revisionId: z.string().min(1),
  rows: z.array(quoteLineRowInputSchema),
  order: z.array(z.string().uuid()).optional(),
  archivedLineIds: z.array(z.string().uuid()).optional(),
});

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
const REPLAY_RULE = "quote.line-replay";
const LINE_CAP_RULE = "quote.line-cap";
const CURRENT_REVISION_RULE = "quote.current-revision";
// UI-SPEC rev 5 — 보낸 차수가 잠금 뒤 다시 읽은 최신 차수가 아니다(04-40 · B-01).
const STALE_REVISION = "다른 사람이 새 차수를 만듦 · 새로 고침";
// UI-SPEC rev 5 `Error — 저장(순서·소속, 방어)` · `Error — 저장(재전송 불일치, ENG-D10)`.
const MEMBERSHIP_MISMATCH = "차수와 프로젝트가 맞지 않음 · 새로 고침";
const ORDER_MISMATCH = "줄 순서가 맞지 않음 · 새로 고침";
const REPLAY_MISMATCH = "이미 저장된 줄과 값이 다름 · 새로 고침";
// rev 5에 없는 방어 문구(화면은 이 요청을 만들지 않는다) — 보관된 줄 id를 고치는 요청.
const ARCHIVED_LINE = "보관된 줄 · 새로 고침";
// 04-13 rev 5에 없는 방어 문구 — 기존 줄에 저장된 것과 다른 종류를 실은 요청(T-04-64).
const KIND_CHANGED = "줄 종류는 바뀌지 않음 · 새로 고침";

type QuoteLineCustomFieldsSchema = Awaited<ReturnType<typeof quoteLineCustomFieldsSchema>>;

// ① 트랜잭션 전(ENG-D3 ① · ARCHITECTURE §4-8) — 잠근 행과 무관한 사실: 권한·금액 노출·차수의 프로젝트(바뀌지
// 않는 사실)·사용자 정의 필드 스키마·차수당 줄 상한(04-26 설정 값). 여기서만 풀을 부른다.
export type PreparedQuoteLineSave = {
  revisionId: string;
  projectId: string;
  customFieldsSchema: QuoteLineCustomFieldsSchema;
  lineCap: number;
  /** 04-13 — `projects` 쓰기와 `projects.adjustment` 쓰기(입구는 둘 중 하나, 줄마다의 판정은 게이트). */
  canWrite: boolean;
  canAdjust: boolean;
};

export async function prepareQuoteLineSave(
  viewer: Viewer,
  revisionId: string,
  deps?: Partial<Pick<QuoteLineWriteDeps, "can">>,
): Promise<PreparedQuoteLineSave> {
  const canFn = deps?.can ?? defaultCan;
  // 04-13(D-83) — 조정 권한만 있는 사람도 조정 줄을 저장한다. 두 권한은 여기서(트랜잭션 전) 읽는다(04-32).
  const [canWrite, canAdjust] = await Promise.all([canFn(viewer, PROJECTS_MENU, "write"), canFn(viewer, ADJUSTMENT_MENU, "write")]);
  if (!canWrite && !canAdjust) {
    throw new ForbiddenError("견적 줄 저장 권한이 없습니다.");
  }
  // 금액을 볼 수 없는 사람은 줄을 저장하지 못한다 — 화면은 금액 없이 줄을
  // 받으므로, 저장을 허용하면 단가·실행가가 0으로 덮인다(/ship 리뷰).
  if (!(await defaultVisible(viewer, "quote.amount"))) {
    throw new ForbiddenError("견적 금액을 볼 수 없어 견적 줄을 저장할 수 없습니다.");
  }

  const revision = await repoFindQuoteRevisionById(viewer, revisionId);
  if (!revision) throw new RevisionNotFoundError("존재하지 않는 차수입니다.");

  return {
    revisionId,
    projectId: revision.projectId,
    customFieldsSchema: await quoteLineCustomFieldsSchema(viewer),
    lineCap: await getSettingValue(QUOTE_LINE_MAX_PER_REVISION),
    canWrite,
    canAdjust,
  };
}

// 04-13(D-83 · D-48) — 조정·견적 외 비용 줄은 견적가 0: 서버가 수량 1 · 원화 단가 0으로 쓰고, 소분류 칸에는 종류 값을
// 적는다(요청의 그 칸들은 읽지 않는다). 조정 줄은 상태도 미착수로 고정한다(상태 칸이 없다).
function normalizeForKind(row: QuoteLineWriteRow, kind: QuoteLineKind): QuoteLineWriteRow {
  if (kind === "quote") return row;
  const zeroQuote = { ...row, subcategory: kind, quantity: 1, unitPrice: { currency: "KRW" as const, amount: 0, fxRate: 1 }, unitPriceFxRateTouched: false };
  return kind === "adjustment" ? { ...zeroQuote, lineStatus: "not_started" } : zeroQuote;
}

// 04-13(엔지 리뷰 B §2 · T-04-64) — 판정·저장이 보는 종류. 새 줄은 요청 값(없으면 quote), 기존 줄은 잠근 tx로 다시 읽은
// DB 행의 종류다. 기존 줄에 다른 종류가 실려 오면 종류 변경 요청이라 null(거부).
export function resolveLineKind(row: Pick<QuoteLineWriteRow, "isNew" | "lineKind">, storedKind: QuoteLineKind | undefined): QuoteLineKind | null {
  if (row.isNew) return row.lineKind ?? "quote";
  const stored = storedKind ?? "quote";
  return row.lineKind === undefined || row.lineKind === stored ? stored : null;
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

// ENG-D10 재전송 판정 — 사용자 정의 필드도 값이 같아야 같은 줄이다(jsonb는 키 순서를 바꾼다).
function sameCustomFields(stored: unknown, next: Record<string, unknown>): boolean {
  const canonical = (value: Record<string, unknown>) => JSON.stringify(Object.keys(value).sort().map((key) => [key, value[key]]));
  return canonical((stored ?? {}) as Record<string, unknown>) === canonical(next);
}

// EXP-14 — 실행가 음수는 견적 외 비용·조정 줄만 받는다.
export function quoteLineFormatErrors(input: QuoteLineWriteRow, rowIndex: number, kind: QuoteLineKind): CellFormatError[] {
  const errors: CellFormatError[] = [];
  if (input.quantity !== undefined && input.quantity <= 0) {
    errors.push({ rowIndex, rowId: input.id, field: "quantity", label: "수량", reason: "숫자가 아닙니다 · 0보다 큰 수를 적어 주세요" });
  }
  if (input.unitPrice.amount < 0) {
    errors.push({ rowIndex, rowId: input.id, field: "unitPrice", label: "단가", reason: "숫자가 아닙니다 · 12,400,000처럼 적어 주세요" });
  }
  if (input.execution.amount < 0 && kind === "quote") {
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

// UI-SPEC rev 5 `Error — 셀(금액 범위, 04-40 · DR-9)` — 계산값 상한은 수량·단가 두 칸 모두.
const QUOTE_AMOUNT_OVER = "견적가가 상한을 넘습니다 · 수량이나 단가를 고쳐 주세요";

// 04-40(엔지니어링 리뷰 B §2 · DR-9) — 단가·실행가를 한 규칙으로 정규화하고(거부는 그 칸의 셀 오류), 수량 × 단가의 계산
// 견적가가 저장 상한 밖이면 수량·단가 두 칸 오류. 쓰기 전에 판정해 PG 22003이 화면에 닿지 않는다.
function normalizeLineMoney(row: QuoteLineWriteRow, rowIndex: number): { row: QuoteLineWriteRow; errors: CellFormatError[] } {
  const errors: CellFormatError[] = [];
  const normalize = (field: "unitPrice" | "execution") => {
    try {
      return normalizeMoneyInput(row[field]);
    } catch (error) {
      if (!(error instanceof MoneyInputError)) throw error;
      errors.push({ rowIndex, rowId: row.id, field, label: CELL_LABELS[field], reason: error.message });
      return row[field];
    }
  };
  const unitPrice = normalize("unitPrice");
  const execution = normalize("execution");
  if (errors.length === 0 && !quoteAmountWithinBound(row.quantity, unitPrice)) {
    for (const field of ["quantity", "unitPrice"] as const) {
      errors.push({ rowIndex, rowId: row.id, field, label: CELL_LABELS[field], reason: QUOTE_AMOUNT_OVER });
    }
  }
  return { row: { ...row, unitPrice, execution }, errors };
}

export type FxToRemember = { currency: Currency; rate: number };

// ② 트랜잭션 안 쓰기 단계의 결과 — 커밋 뒤 단계(투영·최근 환율 기억)의 입력.
export type WrittenQuoteLines = {
  projectStatus: string;
  canWrite: boolean;
  canAdjust: boolean;
  activeRows: QuoteLineRow[];
  linkedDocuments: LinkedDocumentsByLine;
  fxToRemember: FxToRemember[];
};

// ② 트랜잭션 안(A-06 · OV-3 · A-21 · A-03 · B-01 · B-26 · D10 · ENG-D10) — 순서: (a) 프로젝트 행 배타 잠금
// (loadProjectForGate — 합성 저장에서는 재판정 뒤 새 행)과 연결 문서 (b) 줄 소속(고칠 줄·보관할 줄이 그 차수의
// 활성 줄인가)과 순서(`order` 집합) (c) 구조 판정(순서 이동·보관·새 줄·복제)과 줄마다 쓰기 페이로드를 먼저 만들어
// DB 현재 값과 비교한 바뀐 칸 (d) 버전 충돌·형식 오류·칸 게이트(바뀐 칸이 있는 줄만) — 게이트·소속 거부는
// denyWrite 한 지점에서 전부 거부, 형식·충돌은 로그 없이 전부 거부 (e) 쓰기 — 새 줄은 화면 id로 멱등 삽입(이미
// 있으면 재전송 판정), 기존 줄의 sort_order는 `order`가 있을 때만 다시 쓴다(version 그대로), 보관도 같은 tx
// (f) 행동 로그(같은 tx — 되돌린 저장은 로그도 없다) (g) 활성 줄 전체. 이 단계는 풀을 부르지 않는다 — 모든
// 리포지토리 호출이 tx를 받는다. 04-26의 줄 수 상한은 (d) 끝에서 실제로 새로 들어갈 줄 수를 센다.
export async function writeQuoteLinesInTx(
  viewer: Viewer,
  prepared: PreparedQuoteLineSave,
  input: QuoteLinesWriteInput,
  tx: DbOrTx,
  deps?: Partial<Pick<QuoteLineWriteDeps, "now" | "afterLock" | "recordAction">>,
): Promise<WrittenQuoteLines> {
  const recordAction = deps?.recordAction ?? defaultRecordAction;
  const { revisionId, projectId, customFieldsSchema, lineCap, canWrite, canAdjust } = prepared;
  const archivedIds = [...new Set(input.archivedLineIds ?? [])];
  const lineIds = input.rows.map((row) => row.id);
  const denyIds = { projectId, revisionId, lineIds: [...lineIds, ...archivedIds] };

  // (a)
  const projectRow = await loadProjectForGate(viewer, projectId, { now: deps?.now, tx, afterLock: deps?.afterLock }, { recordAction });
  if (!projectRow) throw new RevisionNotFoundError("연결된 프로젝트를 찾을 수 없습니다.");
  // 04-40(B-01) — 현재 차수 재확인은 잠금 뒤 같은 tx로(단독 저장·합성 저장 공통). 아무것도 쓰기 전에 전부 거부한다.
  const latest = await repoFindLatestQuoteRevision(viewer, projectId, tx);
  if (latest?.id !== revisionId) denyWrite(viewer, CURRENT_REVISION_RULE, { projectId, revisionId }, new UserFacingError(STALE_REVISION));
  const status = projectRow.status;
  const linkedDocuments = await linkedDocumentsByLine(viewer, revisionId, tx);
  const lineCtx = (lineId: string | null, lineKind: QuoteLineKind, change: ProjectLineEditCtx["change"]): ProjectLineEditCtx => {
    const firstLinked = lineId ? linkedDocuments.get(lineId)?.[0] : undefined;
    const actor = { lineKind, actorCanWrite: canWrite, actorCanAdjust: canAdjust };
    return firstLinked
      ? { status, ...actor, hasLinkedDocuments: true, linkedDocumentNumber: firstLinked.number, change }
      : { status, ...actor, hasLinkedDocuments: false, change };
  };

  // (b)
  const existingIds = [...new Set([...input.rows.filter((row) => !row.isNew).map((row) => row.id), ...archivedIds])];
  const currentRows = await repoFindQuoteLinesByIds(viewer, existingIds, { revisionId }, tx);
  const currentById = new Map(currentRows.map((row) => [row.id, row] as const));
  const activeBefore = await repoListQuoteLinesByRevision(viewer, revisionId, tx);
  const order = input.order
    ? orderChange(
        activeBefore.map((row) => row.id),
        input.order,
        { archivedIds, newIds: input.rows.filter((row) => row.isNew).map((row) => row.id) },
      )
    : null;

  let denial = null as { rule: string; error: Error } | null;
  const deny = (rule: string, error: Error) => {
    denial ??= { rule, error };
  };
  if (currentRows.length !== existingIds.length) deny(MEMBERSHIP_RULE, new UserFacingError(MEMBERSHIP_MISMATCH));
  else if (currentRows.some((row) => row.archivedAt !== null)) deny(MEMBERSHIP_RULE, new UserFacingError(ARCHIVED_LINE));
  else if (order === "mismatch") deny(MEMBERSHIP_RULE, new UserFacingError(ORDER_MISMATCH));

  // 구조 거부는 칸 오류가 아니라 게이트 이유 그대로 전체 거부한다.
  const judgeStructure = async (lineId: string | null, lineKind: QuoteLineKind, change: ProjectLineEditCtx["change"]) => {
    const decision = await gate(projectRow, LINE_EDIT_RULE, lineCtx(lineId, lineKind, change));
    if (!decision.allowed) deny(LINE_EDIT_RULE, new GateBlockedError(decision.reason));
  };

  // (c)(d)
  const conflicts: CellConflict[] = [];
  const formatErrors: CellFormatError[] = [];
  const gateErrors: CellFormatError[] = [];
  // unchanged — DB 현재 값과 바뀐 칸이 없는 기존 줄(A-21). 쓰지 않는다(version·로그 그대로 — 완료 줄도 잠김 그대로).
  const planned: {
    input: QuoteLineWriteRow;
    kind: QuoteLineKind;
    payload: QuoteLineWritePayload;
    customFields: Record<string, unknown>;
    unchanged: boolean;
  }[] = [];

  if (!denial) {
    if (order === "reorder") {
      await judgeStructure(null, "quote", { kind: "reorder" });
      // 04-13 검토 S3 — 조정 줄은 고정 순서(구조 판정 reorder 불가): 남는 기존 줄 사이의 자리가 바뀐 조정 줄이 있으면 거부.
      const keptIds = activeBefore.map((row) => row.id).filter((id) => !archivedIds.includes(id));
      const keptSet = new Set(keptIds);
      const keptInOrder = input.order!.filter((id) => keptSet.has(id));
      // 04-23 검토 S-1 — 화면은 조정 줄을 늘 맨 아래 그룹으로 그린다: 조정 줄끼리의 순서를 지킨 채 맨 아래로 모이는 순서는 이동이 아니다.
      const adjustmentIds = new Set(activeBefore.filter((row) => lineKindOf(row) === "adjustment").map((row) => row.id));
      const isAdjustment = (id: string) => adjustmentIds.has(id);
      const adjustmentsBefore = keptIds.filter(isAdjustment);
      const adjustmentsAfter = keptInOrder.filter(isAdjustment);
      const atTail = keptInOrder.slice(keptInOrder.length - adjustmentsAfter.length).every(isAdjustment);
      const movedAdjustment = adjustmentsBefore.find(
        (id, index) => adjustmentsAfter[index] !== id || (!atTail && keptIds.indexOf(id) !== keptInOrder.indexOf(id)),
      );
      if (movedAdjustment) await judgeStructure(movedAdjustment, "adjustment", { kind: "reorder" });
    }
    for (const id of archivedIds) {
      const archived = currentById.get(id);
      if (archived) await judgeStructure(id, lineKindOf(archived), { kind: "archive" });
    }

    for (const [rowIndex, requested] of input.rows.entries()) {
      // 04-13 — 판정·저장이 보는 종류: 기존 줄은 잠근 tx로 다시 읽은 DB 행, 새 줄만 요청 값(없으면 quote).
      const current = requested.isNew ? undefined : currentById.get(requested.id);
      const resolved = resolveLineKind(requested, current && lineKindOf(current));
      if (resolved === null) deny(LINE_EDIT_RULE, new UserFacingError(KIND_CHANGED));
      const kind = resolved ?? lineKindOf(current!);
      const kindRow = normalizeForKind(requested, kind);
      formatErrors.push(...quoteLineFormatErrors(kindRow, rowIndex, kind));
      const money = normalizeLineMoney(kindRow, rowIndex);
      if (money.errors.length > 0) {
        formatErrors.push(...money.errors);
        continue;
      }
      const row = money.row;
      const payload = writePayload(row);
      const customFields = customFieldsSchema.parse(row.customFields ?? {}) as Record<string, unknown>;
      const entry = { input: row, kind, payload, customFields, unchanged: false };
      planned.push(entry);

      if (row.isNew) {
        await judgeStructure(null, kind, row.duplicatedFrom ? { kind: "duplicate" } : { kind: "insert", quoteCellsZero: quoteCellsZero(row) });
        continue;
      }

      if (row.version === undefined) {
        throw new UserFacingError("기존 줄을 저장하려면 버전 정보가 필요합니다 · 화면을 새로고침해 주세요");
      }
      if (!current) continue; // (b)가 이미 막았다.
      if (current.version !== row.version) conflicts.push(...cellConflictsFor(row.id, row.baseline, current));

      // 바뀐 칸마다 판정해 칸 오류로 싣는다(이유 = 표 위 한 줄과 같은 문자열). 바뀐 칸이 없으면 게이트를 부르지 않는다.
      const changed = changedFields(current, payload);
      entry.unchanged = changed.length === 0;
      for (const field of changed) {
        const decision = await gate(projectRow, LINE_EDIT_RULE, lineCtx(row.id, kind, { kind: "update", fields: [field] }));
        if (!decision.allowed) gateErrors.push({ rowIndex, rowId: row.id, field, label: CELL_LABELS[field], reason: decision.reason });
      }
    }
    if (gateErrors.length > 0) deny(LINE_EDIT_RULE, new SaveRejectedError(conflicts, [...formatErrors, ...gateErrors]));

    // 04-26(D-86 · A-36 · ENG-D10) — 잠금 뒤 센 활성 줄 − 이번에 보관할 활성 줄 + 실제로 새로 들어갈 줄(그 차수에 이미
    // 있는 id는 응답을 잃은 재전송이라 새 줄이 아니다). 뒤에 온 저장은 앞 저장이 커밋한 줄까지 센다.
    const newIds = input.rows.filter((row) => row.isNew).map((row) => row.id);
    const presentIds = new Set((await repoFindQuoteLinesByIds(viewer, newIds, { revisionId }, tx)).map((row) => row.id));
    const newLines = newIds.filter((id) => !presentIds.has(id)).length;
    const archivingActive = archivedIds.filter((id) => currentById.get(id)?.archivedAt === null).length;
    const capCtx: QuoteLineCapCtx = { newLines, countAfter: activeBefore.length - archivingActive + newLines, cap: lineCap };
    const capDecision = await gate(projectRow, LINE_CAP_RULE, capCtx);
    if (!capDecision.allowed) deny(LINE_CAP_RULE, new GateBlockedError(capDecision.reason));
  }

  // B-26 — 게이트·소속 거부의 한 지점(운영 로그 write.denied, 금액 없음). 뒤 플랜의 규칙도 이 지점을 지난다.
  if (denial) denyWrite(viewer, denial.rule, denyIds, denial.error);
  if (conflicts.length > 0 || formatErrors.length > 0) throw new SaveRejectedError(conflicts, formatErrors);

  // (e)
  const position = input.order ? new Map(input.order.map((id, index) => [id, index] as const)) : null;
  let nextSortOrder = activeBefore.reduce((max, row) => Math.max(max, row.sortOrder), -1) + 1;
  const fxToRemember: FxToRemember[] = [];
  // 실제로 쓴 것(삽입·갱신·순서·보관)이 없으면 로그도 남기지 않는다 — 재전송 no-op은 아무것도 하지 않는다.
  let wrote = false;

  for (const { input: row, kind, payload, customFields, unchanged } of planned) {
    // D-71 — 환율 칸을 실제로 고친 저장에서만 그 통화의 최근 환율을 기억한다(커밋 뒤 — 트랜잭션을 연 쪽이).
    if (payload.unitPriceCurrency !== "KRW" && row.unitPriceFxRateTouched) {
      fxToRemember.push({ currency: payload.unitPriceCurrency, rate: Number(payload.unitPriceFxRate) });
    }

    if (row.isNew) {
      const sortOrder = position?.get(row.id) ?? nextSortOrder;
      const inserted = await repoInsertQuoteLineIfAbsent(viewer, { id: row.id, revisionId, sortOrder, ...payload, lineKind: kind, customFields }, tx);
      if (inserted) {
        wrote = true;
        if (!position) nextSortOrder += 1;
        continue;
      }
      // ENG-D10 — 이미 있는 id: 같은 차수의 활성 줄이고 값이 같으면 응답을 잃은 재전송(no-op), 값이 다르면 불일치,
      // 다른 차수·보관된 줄이면 소속 거부.
      const stored = await repoFindQuoteLineById(viewer, row.id, tx);
      if (!stored || stored.revisionId !== revisionId || stored.archivedAt !== null) {
        denyWrite(viewer, MEMBERSHIP_RULE, denyIds, new UserFacingError(MEMBERSHIP_MISMATCH));
      }
      if (stored.lineKind !== kind || changedFields(stored, payload).length > 0 || !sameCustomFields(stored.customFields, customFields)) {
        denyWrite(viewer, REPLAY_RULE, denyIds, new UserFacingError(REPLAY_MISMATCH));
      }
      continue;
    }

    if (unchanged) continue;
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
    wrote = true;
  }

  if (position) {
    const moved = activeBefore.filter((row) => position.has(row.id) && position.get(row.id) !== row.sortOrder);
    await repoSetQuoteLineSortOrders(viewer, revisionId, moved.map((row) => ({ id: row.id, sortOrder: position.get(row.id)! })), tx);
    if (moved.length > 0) wrote = true;
  }

  // D-56 · A-04 — 삭제는 같은 트랜잭션의 보관이다.
  const archivedCount = await repoArchiveQuoteLines(viewer, { ids: archivedIds, revisionId, archivedBy: viewer.id, archivedAt: new Date() }, tx);
  if (archivedCount !== archivedIds.length) throw new UserFacingError(ARCHIVED_LINE);
  if (archivedCount > 0) wrote = true;

  // (f) 엔지 리뷰 A §1 P2 — 같은 tx(합성 저장이 뒤에서 거부되면 이 로그도 되돌아간다).
  if (wrote) await recordAction(
    viewer,
    {
      actionType: "document_update",
      entity: QUOTE_LINE_ENTITY,
      entityId: revisionId,
      detail: archivedIds.length > 0 ? { lineIds, archivedLineIds: archivedIds } : { lineIds },
    },
    { tx },
  );

  // (g) 엔지 리뷰 A §2 P2 — 결과는 차수의 활성 줄 전체(표시 순서).
  return {
    projectStatus: status,
    canWrite,
    canAdjust,
    activeRows: await repoListQuoteLinesByRevision(viewer, revisionId, tx),
    linkedDocuments,
    fxToRemember,
  };
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

// ③ 커밋 뒤 — projectMany 투영(ENG-D3 ②). 셀 단계는 트랜잭션 전에 읽은 두 권한으로(04-13 — 입구는 둘 중 하나).
export async function finishQuoteLineSave(viewer: Viewer, written: WrittenQuoteLines): Promise<SaveQuoteLinesResult> {
  return {
    lines: await projectLines(
      viewer,
      written.activeRows,
      { status: written.projectStatus, canWrite: written.canWrite, canAdjust: written.canAdjust },
      written.linkedDocuments,
    ),
  };
}

// 04-12(A-19 · OV-2) — 보관함의 견적 줄 복원. 저장과 같은 규칙(project.line-edit `restore`)을 한 트랜잭션에서
// 지난다: 트랜잭션 전에 권한과 줄·차수의 프로젝트(바뀌지 않는 사실)를 읽고, 안에서 프로젝트 행을 잠근 뒤 줄을 다시
// 읽어 판정 → 보관 해제 → 복원 로그. 이미 복원된 줄은 아무것도 하지 않는다(범용 복원과 같은 멱등).
export async function restoreQuoteLine(
  viewer: Viewer,
  id: string,
  deps?: Partial<Pick<QuoteLineWriteDeps, "can" | "now" | "afterLock" | "recordAction">>,
): Promise<void> {
  const canFn = deps?.can ?? defaultCan;
  // 04-13(OV-2 · D-83) — 입구는 저장과 같은 두 권한 중 하나. 보관된 줄의 종류로 게이트가 가른다(조정 줄은 조정 권한만).
  const [canWrite, canAdjust] = await Promise.all([canFn(viewer, PROJECTS_MENU, "write"), canFn(viewer, ADJUSTMENT_MENU, "write")]);
  if (!canWrite && !canAdjust) throw new ForbiddenError("견적 줄 복원 권한이 없습니다.");
  const line = await repoFindQuoteLineById(viewer, id);
  const revision = line ? await repoFindQuoteRevisionById(viewer, line.revisionId) : null;
  if (!line || !revision) throw new RevisionNotFoundError("대상을 찾을 수 없습니다.");
  const recordAction = deps?.recordAction ?? defaultRecordAction;
  // 04-26(A-19 · ENG-D3 ①) — 상한 값은 트랜잭션 전에 읽는다. 복원도 줄 하나를 더하는 것이라 같은 상한을 지난다.
  const lineCap = await getSettingValue(QUOTE_LINE_MAX_PER_REVISION);

  await withTransaction(async (tx) => {
    const projectRow = await loadProjectForGate(viewer, revision.projectId, { now: deps?.now, tx, afterLock: deps?.afterLock }, { recordAction });
    if (!projectRow) throw new RevisionNotFoundError("연결된 프로젝트를 찾을 수 없습니다.");
    const current = await repoFindQuoteLineById(viewer, id, tx);
    if (!current || current.revisionId !== line.revisionId) throw new UserFacingError(MEMBERSHIP_MISMATCH);
    if (current.archivedAt === null) return;

    const firstLinked = (await linkedDocumentsByLine(viewer, current.revisionId, tx)).get(id)?.[0];
    const change = { kind: "restore", quoteAmountZero: current.quoteAmountKrw === 0 } as const;
    const actor = { lineKind: lineKindOf(current), actorCanWrite: canWrite, actorCanAdjust: canAdjust };
    const ctx: ProjectLineEditCtx = firstLinked
      ? { status: projectRow.status, ...actor, hasLinkedDocuments: true, linkedDocumentNumber: firstLinked.number, change }
      : { status: projectRow.status, ...actor, hasLinkedDocuments: false, change };
    const decision = await gate(projectRow, LINE_EDIT_RULE, ctx);
    if (!decision.allowed) {
      denyWrite(viewer, LINE_EDIT_RULE, { projectId: revision.projectId, revisionId: current.revisionId, lineIds: [id] }, new GateBlockedError(decision.reason));
    }
    const activeCount = await repoCountActiveLinesByRevision(viewer, current.revisionId, tx);
    const capDecision = await gate(projectRow, LINE_CAP_RULE, { newLines: 1, countAfter: activeCount + 1, cap: lineCap } satisfies QuoteLineCapCtx);
    if (!capDecision.allowed) {
      denyWrite(viewer, LINE_CAP_RULE, { projectId: revision.projectId, revisionId: current.revisionId, lineIds: [id] }, new GateBlockedError(capDecision.reason));
    }

    if (!(await repoRestoreQuoteLineRow(viewer, id, tx))) throw new UserFacingError(MEMBERSHIP_MISMATCH);
    await recordAction(viewer, { actionType: "restore", entity: QUOTE_LINE_ENTITY, entityId: id }, { tx });
  });
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
