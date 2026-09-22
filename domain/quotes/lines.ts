import type { Viewer } from "@/domain/viewer";
import { can as defaultCan } from "@/domain/permissions/can";
import { project, type DtoSpec } from "@/domain/permissions/project";
import { recordAction as defaultRecordAction } from "@/domain/action-log/record";
import { registerDto } from "@/domain/permissions/dto-registry";
import { UserFacingError } from "@/lib/actions/user-facing-error";
import { buildCustomFieldsSchema, type FieldDefType } from "@/domain/custom-fields/build-schema";
import { gate, GateBlockedError } from "@/domain/rules/gate";
import "@/domain/rules/register";
import { moneyFromRow, moneyToColumns, quoteAmount, profit, type Money, type Currency } from "@/domain/money";
import { withTransaction } from "@/lib/db-transaction";
import type { DbOrTx } from "@/repositories/document-counters";
import {
  listQuoteLinesByRevision as repoListQuoteLinesByRevision,
  insertQuoteLine as repoInsertQuoteLine,
  updateQuoteLineIfVersionMatches as repoUpdateQuoteLineIfVersionMatches,
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
    { key: "id", from: "id", infoItem: "quote.amount" },
    { key: "revisionId", from: "revisionId", infoItem: "quote.amount" },
    { key: "sortOrder", from: "sortOrder", infoItem: "quote.amount" },
    { key: "subcategory", from: "subcategory", infoItem: "quote.amount" },
    { key: "itemName", from: "itemName", infoItem: "quote.amount" },
    { key: "vendorId", from: "vendorId", infoItem: "quote.amount" },
    { key: "quantity", from: "quantity", infoItem: "quote.amount" },
    { key: "unitPrice", from: "unitPrice", infoItem: "quote.amount" },
    { key: "execution", from: "execution", infoItem: "quote.amount" },
    { key: "quoteAmountKrw", from: "quoteAmountKrw", infoItem: "quote.amount" },
    { key: "profitKrw", from: "profitKrw", infoItem: "quote.amount" },
    { key: "lineStatus", from: "lineStatus", infoItem: "quote.amount" },
    { key: "note", from: "note", infoItem: "quote.amount" },
    { key: "copiedFromLineId", from: "copiedFromLineId", infoItem: "quote.amount" },
    { key: "version", from: "version", infoItem: "quote.amount" },
    { key: "customFields", from: "customFields", infoItem: "quote.amount" },
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
export type CurrentQuoteRevisionInfo = { id: string; seq: number };

export async function getCurrentQuoteRevision(
  viewer: Viewer,
  projectId: string,
): Promise<CurrentQuoteRevisionInfo | null> {
  const revision = await repoFindLatestQuoteRevision(viewer, projectId);
  if (!revision) return null;
  return { id: revision.id, seq: revision.seq };
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
export type QuoteLineWriteRow = {
  id?: string;
  version?: number;
  sortOrder?: number;
  subcategory: string;
  itemName: string;
  vendorId?: string | null;
  quantity?: number;
  unitPrice: MoneyInputDto;
  execution: MoneyInputDto;
  lineStatus?: string;
  note?: string | null;
  customFields?: Record<string, unknown>;
};

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

  const revision = await repoFindQuoteRevisionById(viewer, revisionId);
  if (!revision) throw new RevisionNotFoundError("존재하지 않는 차수입니다.");

  const projectRow = await repoFindProjectById(viewer, revision.projectId);
  if (!projectRow) throw new RevisionNotFoundError("연결된 프로젝트를 찾을 수 없습니다.");

  const decision = await gate(projectRow, "project.completed-lock", { status: projectRow.status });
  if (!decision.allowed) {
    throw new GateBlockedError(decision.reason);
  }

  const customFieldsSchema = await quoteLineCustomFieldsSchema(viewer);

  const runSave = async (innerTx: DbOrTx): Promise<QuoteLineRow[]> => {
    const results: QuoteLineRow[] = [];

    for (const [index, input] of rows.entries()) {
      const customFields = customFieldsSchema.parse(input.customFields ?? {}) as Record<string, unknown>;

      const { unitPriceColumns, executionColumns, quoteAmountKrw, profitKrw } = computeQuoteLineAmounts(input);
      const quantityValue = input.quantity && input.quantity > 0 ? input.quantity : 1;

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
        if (input.version === undefined) {
          throw new UserFacingError("기존 줄을 저장하려면 버전 정보가 필요합니다 · 화면을 새로고침해 주세요");
        }
        const updated = await repoUpdateQuoteLineIfVersionMatches(viewer, input.id, input.version, payload, innerTx);
        if (!updated) {
          throw new UserFacingError(
            `다른 사람이 먼저 이 줄을 바꿨습니다 · 덮어쓰기 / 그 값으로(줄 ${input.id})`,
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
