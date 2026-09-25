import type { Viewer } from "@/domain/viewer";
import { can as defaultCan } from "@/domain/permissions/can";
import { visible as defaultVisible } from "@/domain/permissions/visible";
import { project, type DtoSpec } from "@/domain/permissions/project";
import { recordAction as defaultRecordAction } from "@/domain/action-log/record";
import { registerDto } from "@/domain/permissions/dto-registry";
import { UserFacingError } from "@/lib/actions/user-facing-error";
import { buildCustomFieldsSchema, type FieldDefType } from "@/domain/custom-fields/build-schema";
import { gate, GateBlockedError } from "@/domain/rules/gate";
import "@/domain/rules/register";
import { moneyFromRow, moneyToColumns, quoteAmount, profit, type Money, type Currency } from "@/domain/money";
import { rememberFxRate } from "@/domain/money/currency";
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
import { findProjectById as repoFindProjectById } from "@/repositories/projects";
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
};

function toProjectable(row: QuoteLineRow): QuoteLineProjectable {
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

export async function listQuoteLines(viewer: Viewer, revisionId: string): Promise<QuoteLineDto[]> {
  const rows = await repoListQuoteLinesByRevision(viewer, revisionId);
  return Promise.all(rows.map((row) => project(viewer, toProjectable(row), QUOTE_LINE_DTO_SPEC))) as Promise<
    QuoteLineDto[]
  >;
}

// 화면이 보내는 줄 하나 — id가 있으면 기존 줄 갱신(version 필수), 없으면
// 새 줄. **quoteAmountKrw·profitKrw 필드를 받지 않는다** — 클라이언트가
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
  id?: string;
  version?: number;
  sortOrder?: number;
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

export type QuoteLineWriteDeps = {
  can: typeof defaultCan;
  recordAction: typeof defaultRecordAction;
};

// PROJ-02·D-65·D-66: 배치 저장 — 게이트 판정(완료 잠금) → 클라이언트가
// 보낸 견적가·차익 필드는 애초에 타입에 없어 읽을 수 없다 → domain/money로
// 재계산 → 한 트랜잭션으로 UPSERT(버전 불일치는 예외로 트랜잭션 전체를
// 되돌린다 — "전부 저장 또는 전부 거부") → recordAction. `tx`를 받으면
// (04-02: 매출 섹션과 한 화면·한 버튼·한 트랜잭션으로 묶는
// domain/projects/ledger.ts) 새 트랜잭션을 열지 않고 그 tx 안에서 쓴다.
export async function saveQuoteLines(
  viewer: Viewer,
  revisionId: string,
  rows: QuoteLineWriteRow[],
  deps?: Partial<QuoteLineWriteDeps>,
  tx?: DbOrTx,
): Promise<SaveQuoteLinesResult> {
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

  const projectRow = await repoFindProjectById(viewer, revision.projectId);
  if (!projectRow) throw new RevisionNotFoundError("연결된 프로젝트를 찾을 수 없습니다.");

  const decision = await gate(projectRow, "project.line-edit", { status: projectRow.status });
  if (!decision.allowed) {
    throw new GateBlockedError(decision.reason);
  }

  const customFieldsSchema = await quoteLineCustomFieldsSchema(viewer);

  // 04-04 Task 2 ② — 쓰기 전에 판정·비교를 전부 끝낸다: (a) 현재 행을 한
  // 번에 읽어 버전 비교 → (b) 버전이 다른 줄은 baseline과 현재 값을 셀
  // 단위로 비교해 **실제로 달라진 셀만** 충돌로 모은다 → (c) 형식 오류를
  // 모은다 → (d) 하나라도 있으면 **아무것도 쓰지 않고** 거부한다(D-65,
  // UX-04 "전부 저장 또는 전부 거부"). 이 읽기는 composite 저장(tx 인자로
  // 넘어온 외부 트랜잭션)과 같은 커넥션에서 일관되게 읽도록 tx를 그대로
  // 넘긴다(undefined면 리포지토리 기본값 db).
  const existingIds = rows.map((row) => row.id).filter((id): id is string => id !== undefined);
  const currentRowsById = new Map(
    (await repoFindQuoteLinesByIds(viewer, existingIds, tx)).map((row) => [row.id, row] as const),
  );

  const conflicts: CellConflict[] = [];
  const formatErrors: CellFormatError[] = [];

  rows.forEach((input, rowIndex) => {
    if (input.quantity !== undefined && input.quantity <= 0) {
      formatErrors.push({
        rowIndex,
        rowId: input.id,
        field: "quantity",
        label: "수량",
        reason: "숫자가 아닙니다 · 0보다 큰 수를 적어 주세요",
      });
    }
    if (input.unitPrice.amount < 0) {
      formatErrors.push({
        rowIndex,
        rowId: input.id,
        field: "unitPrice",
        label: "단가",
        reason: "숫자가 아닙니다 · 12,400,000처럼 적어 주세요",
      });
    }
    if (input.execution.amount < 0) {
      formatErrors.push({
        rowIndex,
        rowId: input.id,
        field: "execution",
        label: "실행가",
        reason: "숫자가 아닙니다 · 12,400,000처럼 적어 주세요",
      });
    }

    if (!input.id) return; // 새 줄은 버전 충돌 대상이 아니다.
    if (input.version === undefined) {
      throw new UserFacingError("기존 줄을 저장하려면 버전 정보가 필요합니다 · 화면을 새로고침해 주세요");
    }
    const current = currentRowsById.get(input.id);
    // 다른 차수(다른 프로젝트 포함)의 줄 id는 이 차수에서 없는 줄로 본다 —
    // 권한·완료 잠금 판정은 요청한 차수 기준이므로 그 밖의 줄은 쓰면 안 된다.
    if (!current || current.revisionId !== revisionId) {
      throw new UserFacingError("줄을 찾을 수 없습니다 · 화면을 새로고침해 주세요");
    }
    if (current.version === input.version) return; // 버전이 같으면 충돌 없음.

    conflicts.push(...cellConflictsFor(input.id, input.baseline, current));
  });

  if (conflicts.length > 0 || formatErrors.length > 0) {
    throw new SaveRejectedError(conflicts, formatErrors);
  }

  const runSave = async (innerTx: DbOrTx): Promise<QuoteLineRow[]> => {
    const results: QuoteLineRow[] = [];

    for (const [index, input] of rows.entries()) {
      const customFields = customFieldsSchema.parse(input.customFields ?? {}) as Record<string, unknown>;

      const { unitPriceColumns, executionColumns, quoteAmountKrw, profitKrw } = computeQuoteLineAmounts(input);
      const quantityValue = input.quantity && input.quantity > 0 ? input.quantity : 1;

      // D-71 — 환율 칸을 실제로 고친 저장에서만 그 통화의 최근 환율
      // 설정을 갱신한다(T-04-11과 같은 결). 건드리지 않은 저장은 갱신하지 않는다.
      if (unitPriceColumns.currency !== "KRW" && input.unitPriceFxRateTouched) {
        await rememberFxRate(unitPriceColumns.currency, Number(unitPriceColumns.fxRate));
      }

      const payload = {
        sortOrder: input.sortOrder ?? index,
        subcategory: input.subcategory,
        itemName: input.itemName,
        vendorId: input.vendorId ?? null,
        quantity: quantityValue.toFixed(2),
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
        lineStatus: input.lineStatus ?? "not_started",
        note: input.note ?? null,
      };

      if (input.id) {
        // input.version은 위 사전 판정에서 undefined가 아님을 이미 확인했다.
        const updated = await repoUpdateQuoteLineIfVersionMatches(viewer, input.id, input.version!, payload, innerTx);
        if (!updated) {
          // 사전 판정과 실제 쓰기 사이의 드문 경합(다른 트랜잭션이 그
          // 사이 커밋) — 같은 구조화 오류로 거부한다. 이 시점엔 아직
          // 아무것도 커밋되지 않았으므로(트랜잭션 안) 이 throw가 전체를
          // 되돌린다.
          // 04-28 — 같은 트랜잭션에서 서버 현재 행을 다시 읽어, 사전 판정과
          // 같은 규칙으로 실제로 달라진 칸만 서버 값·버전으로 싣는다.
          const [current] = await repoFindQuoteLinesByIds(viewer, [input.id], innerTx);
          if (!current || current.revisionId !== revisionId) {
            throw new UserFacingError("줄을 찾을 수 없습니다 · 화면을 새로고침해 주세요");
          }
          const raceConflicts = cellConflictsFor(input.id, input.baseline, current);
          throw new SaveRejectedError(
            raceConflicts.length > 0 ? raceConflicts : cellConflictsFor(input.id, undefined, current),
            [],
          );
        }
        results.push(updated);
      } else {
        const inserted = await repoInsertQuoteLine(viewer, { revisionId, ...payload, customFields }, innerTx);
        results.push(inserted);
      }
    }

    return results;
  };

  const savedRows = tx ? await runSave(tx) : await withTransaction(runSave);

  const recordAction = deps?.recordAction ?? defaultRecordAction;
  await recordAction(viewer, {
    actionType: "document_update",
    entity: QUOTE_LINE_ENTITY,
    entityId: revisionId,
    detail: { lineIds: savedRows.map((row) => row.id) },
  });

  const dtos = await Promise.all(savedRows.map((row) => project(viewer, toProjectable(row), QUOTE_LINE_DTO_SPEC)));
  return { lines: dtos as QuoteLineDto[] };
}
