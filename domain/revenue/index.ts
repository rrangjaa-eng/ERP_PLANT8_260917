import type { Viewer } from "@/domain/viewer";
import { can as defaultCan } from "@/domain/permissions/can";
import { project, type DtoSpec } from "@/domain/permissions/project";
import { recordAction as defaultRecordAction } from "@/domain/action-log/record";
import { registerDto } from "@/domain/permissions/dto-registry";
import { UserFacingError } from "@/lib/actions/user-facing-error";
import {
  moneyFromRow,
  moneyToColumns,
  MoneyInputError,
  round,
  grossFromTotal,
  type Money,
  type Currency,
} from "@/domain/money";
import { applyTaxRule } from "@/domain/money/tax";
import { rememberFxRate } from "@/domain/money/currency";
import { rememberFxAfterCommit, SaveRejectedError, type CellFormatError, type FxToRemember } from "@/domain/quotes/lines";
import { denyWrite } from "@/domain/rules/deny-write";
import type { TaxRule } from "@/domain/code-tables/tax-rule";
import { getSettingValue as defaultGetSettingValue } from "@/domain/settings/registry";
import { TAX_VAT_RATE, TAX_ROUNDING_VAT_UNIT } from "@/domain/settings/keys";
import { withTransaction } from "@/lib/db-transaction";
import { kstDateOf } from "@/lib/kst-date";
import type { DbOrTx } from "@/repositories/document-counters";
import { scopeFor } from "@/domain/permissions/scope-for";
import { findProjectById as repoFindProjectById } from "@/repositories/projects";
import {
  listRevenueEntriesByProject as repoListRevenueEntriesByProject,
  insertRevenueEntry as repoInsertRevenueEntry,
  findRevenueEntryById as repoFindRevenueEntryById,
  updateRevenueEntryIfVersionMatches as repoUpdateRevenueEntryIfVersionMatches,
  type RevenueEntryRow,
} from "@/repositories/revenue-entries";
import { findLatestQuoteRevision as repoFindLatestQuoteRevision } from "@/repositories/quote-revisions";
import { sumQuoteAmountByRevision as repoSumQuoteAmountByRevision } from "@/repositories/quote-lines";

export class ForbiddenError extends UserFacingError {}
export class ProjectNotFoundError extends UserFacingError {}

const REVENUE_SETTLEMENT_MENU = "projects.revenue";
const REVENUE_ENTITY = "revenue_entry";
const PROJECT_ENTITY = "project";

export type RevenueEntryKind = "issue" | "payment";

export type MoneyInputDto = { currency: Currency; amount: number; fxRate: number };
export type MoneyDto = MoneyInputDto & { amountKrw: number };

function moneyToDto(money: Money): MoneyDto {
  return { currency: money.currency, amount: money.amount, fxRate: money.fxRate, amountKrw: money.amountKrw };
}

// 계약 금액·발행 줄은 항상 「공급가 → 부가세 가산」 순방향 계산이다. 세율은
// 이 모듈이 정의하지 않고 04-02 Task 1의 applyTaxRule(+설정 레지스트리)을
// 그대로 부른다 — 부가세 계산 공식이 두 곳에 살지 않는다.
const VAT_SURCHARGE_RULE: TaxRule = {
  ruleKind: "vat_surcharge",
  roundingUnit: 1,
  roundingMethod: "round",
  minWithholdingAmount: 0,
  basisDate: "evidence_date",
};

export type RevenueDeps = {
  getSettingValue: typeof defaultGetSettingValue;
};

async function computeVat(
  supplyKrw: number,
  evidenceDate: Date,
  deps?: Partial<RevenueDeps>,
): Promise<{ vatKrw: number; totalKrw: number }> {
  const result = await applyTaxRule(
    supplyKrw,
    VAT_SURCHARGE_RULE,
    { paymentDate: evidenceDate, evidenceDate },
    deps?.getSettingValue ? { getSettingValue: deps.getSettingValue } : undefined,
  );
  return { vatKrw: result.vatKrw, totalKrw: result.payableKrw };
}

// 입금 줄 전용 — 통장 합계(부가세 포함)에서 공급가액을 역산한다. **재계산
// 합계가 입력과 어긋나도 여기서 조정하지 않는다** — 차이(delta)를 그대로
// 돌려주고 화면이 표시한다(ROADMAP 기준 5, §2-4 금지 사항).
async function computeGrossFromPayment(
  totalKrw: number,
  entryDate: Date,
  deps?: Partial<RevenueDeps>,
): Promise<{ grossKrw: number; recomputeDeltaKrw: number }> {
  const getValue = deps?.getSettingValue ?? defaultGetSettingValue;
  const vatRate = await getValue(TAX_VAT_RATE, { asOf: entryDate });
  const unit = (await getValue(TAX_ROUNDING_VAT_UNIT, { asOf: entryDate })) as 1 | 10;
  const grossKrw = grossFromTotal(totalKrw, vatRate, unit, "round");
  const recomputedVat = round(grossKrw * vatRate, unit, "round");
  const recomputedTotal = grossKrw + recomputedVat;
  return { grossKrw, recomputeDeltaKrw: recomputedTotal - totalKrw };
}

export type RevenueEntryDto = {
  id: string;
  kind: RevenueEntryKind;
  entryDate: string;
  amount: MoneyDto;
  vatKrw: number | null;
  totalKrw: number | null;
  computedGrossKrw: number | null;
  recomputeDeltaKrw: number | null;
  note: string | null;
  version: number;
};

// 04-16(D-84) — 계약 금액은 입력이 아니라 고객 승인된 현재 차수의 견적 합계다. 미승인이면 금액 셋이 null이고
// pendingLabel(`{n}차 고객 승인 전`)만 있다 — 이전 승인 차수의 합계로 대신하지 않는다.
export type ContractInfo = {
  amountKrw: number | null;
  vatKrw: number | null;
  totalKrw: number | null;
  vatRateLabel: string | null;
  sourceLabel: string | null;
  pendingLabel: string | null;
};

// project()가 필드 단위로 투영하는 대상. 배열 필드(issuedEntries·
// paidEntries)와 그 합계는 정보 항목 통과 여부에 따라 project()가 **키
// 자체를 싣지 않는다**(domain/permissions/project.ts). 04-16(D-85 · B-28 ·
// T-04-83): 발행 합계는 입금에서 파생되지 않아 발행 항목으로, 입금 합계와
// 잔액(미수·초과 입금)은 입금 항목으로 게이트한다 — 기획본부에게 입금 줄과
// 그 파생값이 통째로 빠져 발행액 − 미수 = 입금액 역산이 막힌다.
type RevenueProjectable = {
  contract: ContractInfo;
  issuedEntries: RevenueEntryDto[];
  paidEntries: RevenueEntryDto[];
  issuedTotalKrw: number;
  paidGrossTotalKrw: number;
  balanceKrw: number;
};

export type RevenueDto = Partial<RevenueProjectable>;

export const REVENUE_DTO_SPEC: DtoSpec<RevenueProjectable, RevenueDto> = {
  fields: [
    { key: "contract", from: "contract", infoItem: "quote.amount" },
    { key: "issuedEntries", from: "issuedEntries", infoItem: "revenue.issued_amount" },
    { key: "paidEntries", from: "paidEntries", infoItem: "revenue.paid_amount" },
    { key: "issuedTotalKrw", from: "issuedTotalKrw", infoItem: "revenue.issued_amount" },
    { key: "paidGrossTotalKrw", from: "paidGrossTotalKrw", infoItem: "revenue.paid_amount" },
    { key: "balanceKrw", from: "balanceKrw", infoItem: "revenue.paid_amount" },
  ],
};

registerDto({
  name: "RevenueDto",
  fields: REVENUE_DTO_SPEC.fields.map((field) => ({ key: field.key, infoItem: field.infoItem })),
});

function toEntryDto(
  row: RevenueEntryRow,
  computed: { vatKrw: number | null; totalKrw: number | null; computedGrossKrw: number | null; recomputeDeltaKrw: number | null },
): RevenueEntryDto {
  const money = moneyFromRow({
    currency: row.amountCurrency,
    foreignAmount: row.amountForeignAmount,
    fxRate: row.amountFxRate,
    amountKrw: row.amountAmountKrw,
  });
  return {
    id: row.id,
    kind: row.kind as RevenueEntryKind,
    entryDate: row.entryDate,
    amount: moneyToDto(money),
    vatKrw: computed.vatKrw,
    totalKrw: computed.totalKrw,
    computedGrossKrw: computed.computedGrossKrw,
    recomputeDeltaKrw: computed.recomputeDeltaKrw,
    note: row.note,
    version: row.version,
  };
}

// 04-16(D-84 · B-27) — 현재 차수(최신 순번)가 승인됐으면 그 차수의 견적 합계와 승인일 기준 부가세. 기준일은 승인일의
// KST 날짜를 UTC 자정으로 만든 값이다 — 저장된 순간(KST 00:00 = 전날 UTC 15:00)을 넘기면 설정 조회가 UTC 날짜로
// 잘라 전날 세율을 쓴다(엔지니어링 리뷰 B §1, 발행 줄의 new Date(row.entryDate)와 같은 규칙).
async function deriveContract(viewer: Viewer, projectId: string, deps?: Partial<RevenueDeps>): Promise<ContractInfo> {
  const current = await repoFindLatestQuoteRevision(viewer, projectId);
  if (!current) throw new ProjectNotFoundError("존재하지 않는 프로젝트입니다.");
  if (current.customerApprovedAt === null) {
    return { amountKrw: null, vatKrw: null, totalKrw: null, vatRateLabel: null, sourceLabel: null, pendingLabel: `${current.seq}차 고객 승인 전` };
  }
  const amountKrw = await repoSumQuoteAmountByRevision(viewer, current.id);
  const asOf = new Date(kstDateOf(current.customerApprovedAt));
  const vat = await computeVat(amountKrw, asOf, deps);
  const vatRate = await (deps?.getSettingValue ?? defaultGetSettingValue)(TAX_VAT_RATE, { asOf });
  return {
    amountKrw,
    vatKrw: vat.vatKrw,
    totalKrw: vat.totalKrw,
    vatRateLabel: `${Number((vatRate * 100).toFixed(2))}%`,
    sourceLabel: `${current.seq}차 고객 승인 합계`,
    pendingLabel: null,
  };
}

// 04-02 Task 2 ③ — 파생 계약 금액(고객 승인된 현재 차수 합계) + 발행·입금 두 표를 한 DTO로 합쳐 돌려준다.
// 발행 줄은 순방향(공급가 → 부가세) 계산, 입금 줄은 역방향(통장 합계 →
// 공급가) 계산이라 서로 다른 함수를 부른다.
export async function listRevenue(viewer: Viewer, projectId: string, deps?: Partial<RevenueDeps>): Promise<RevenueDto> {
  // domain/projects의 scope-aware findProject와 같은 검사(뷰 권한 + scope
  // + 아카이브)를 여기서 다시 한다 — domain/projects ↔ domain/revenue
  // 순환 import를 피하기 위한 최소 복제(도메인 4계층 원칙).
  const scope = await scopeFor(viewer, PROJECT_ENTITY);
  if (scope.rows === "none") throw new ProjectNotFoundError("존재하지 않는 프로젝트입니다.");

  const projectRow = await repoFindProjectById(viewer, projectId);
  if (!projectRow) throw new ProjectNotFoundError("존재하지 않는 프로젝트입니다.");
  if (projectRow.archivedAt !== null && !scope.includeArchived) throw new ProjectNotFoundError("존재하지 않는 프로젝트입니다.");

  const contract = await deriveContract(viewer, projectId, deps);

  const rows = await repoListRevenueEntriesByProject(viewer, projectId);
  const issuedRows = rows.filter((row) => row.kind === "issue");
  const paidRows = rows.filter((row) => row.kind === "payment");

  const issuedEntries = await Promise.all(
    issuedRows.map(async (row) => {
      const vat = await computeVat(row.amountAmountKrw, new Date(row.entryDate), deps);
      return toEntryDto(row, { vatKrw: vat.vatKrw, totalKrw: vat.totalKrw, computedGrossKrw: null, recomputeDeltaKrw: null });
    }),
  );
  const paidEntries = await Promise.all(
    paidRows.map(async (row) => {
      const gross = await computeGrossFromPayment(row.amountAmountKrw, new Date(row.entryDate), deps);
      return toEntryDto(row, {
        vatKrw: null,
        totalKrw: null,
        computedGrossKrw: gross.grossKrw,
        recomputeDeltaKrw: gross.recomputeDeltaKrw,
      });
    }),
  );

  const issuedTotalKrw = issuedEntries.reduce((sum, entry) => sum + entry.amount.amountKrw, 0);
  const paidGrossTotalKrw = paidEntries.reduce((sum, entry) => sum + (entry.computedGrossKrw ?? 0), 0);
  const balanceKrw = paidGrossTotalKrw - issuedTotalKrw;

  const projectable: RevenueProjectable = {
    contract,
    issuedEntries,
    paidEntries,
    issuedTotalKrw,
    paidGrossTotalKrw,
    balanceKrw,
  };

  return project(viewer, projectable, REVENUE_DTO_SPEC);
}

export type RevenueEntryWriteRow = {
  id?: string;
  /** 04-41(ENG-D10) — 화면이 만든 uuid(`id`)로 넣는 새 줄. 재전송에도 같은 id를 싣는다. */
  isNew?: true;
  version?: number;
  entryDate: string;
  amount: MoneyInputDto;
  /** 환율 칸을 이번 저장에서 실제로 고쳤을 때만 true(외화일 때만 의미가 있다). */
  fxRateTouched?: boolean;
  note?: string | null;
};

export type SaveRevenueInput = {
  issuedEntries?: RevenueEntryWriteRow[];
  paidEntries?: RevenueEntryWriteRow[];
};

export type RevenueWriteDeps = {
  can: typeof defaultCan;
  recordAction: typeof defaultRecordAction;
  /** 04-41 — 커밋 뒤 최근 환율 기억. 테스트가 실패를 주입한다. */
  rememberFxRate: typeof rememberFxRate;
  /** 04-41(B §1) — 트랜잭션 앞에서 계산한 권한. 있으면 잠긴 트랜잭션 안에서 권한을 조회하지 않는다. */
  rights: { canWriteEntries: boolean };
};

const ENTRY_SCOPE_RULE = "revenue.entry-scope";
const REPLAY_RULE = "revenue.replay-mismatch";
const ENTRY_NOT_FOUND = "줄을 찾을 수 없음 · 새로 고침";
const REPLAY_MISMATCH = "이미 저장된 줄과 값이 다름 · 새로 고침";

type EntryPayload = {
  entryDate: string;
  amountCurrency: Currency;
  amountForeignAmount: string | null;
  amountFxRate: string;
  amountAmountKrw: number;
  note: string | null;
};

type PreparedEntry = { input: RevenueEntryWriteRow; payload: EntryPayload };

// 04-41(B §2 · B3) — 금액은 쓰기 전에 전부 한 규칙(normalizeMoneyInput)으로 정규화한다. 걸린 줄은 그 표의 줄 순번·id로
// 칸 오류를 모아 배치 전체를 거부한다(견적 줄과 같은 SaveRejectedError — PG 범위 오류로 새지 않는다).
function prepareEntries(rows: RevenueEntryWriteRow[], formatErrors: CellFormatError[]): PreparedEntry[] {
  const prepared: PreparedEntry[] = [];
  rows.forEach((input, rowIndex) => {
    try {
      const columns = moneyToColumns(input.amount);
      prepared.push({
        input,
        payload: {
          entryDate: input.entryDate,
          amountCurrency: columns.currency,
          amountForeignAmount: columns.foreignAmount,
          amountFxRate: columns.fxRate,
          amountAmountKrw: columns.amountKrw,
          note: input.note ?? null,
        },
      });
    } catch (error) {
      if (!(error instanceof MoneyInputError)) throw error;
      formatErrors.push({ rowIndex, ...(input.id ? { rowId: input.id } : {}), field: "amount", label: "금액", reason: error.message });
    }
  });
  return prepared;
}

function sameStoredEntry(stored: RevenueEntryRow, owner: { projectId: string; kind: RevenueEntryKind }, payload: EntryPayload): boolean {
  return (
    stored.archivedAt === null &&
    stored.projectId === owner.projectId &&
    stored.kind === owner.kind &&
    stored.entryDate === payload.entryDate &&
    stored.amountCurrency === payload.amountCurrency &&
    stored.amountForeignAmount === payload.amountForeignAmount &&
    stored.amountFxRate === payload.amountFxRate &&
    stored.amountAmountKrw === payload.amountAmountKrw &&
    stored.note === payload.note
  );
}

// 04-41(Codex #1 · ENG-D10) — 기존 줄은 이 프로젝트·이 종류의 줄만 고친다(아니면 `줄을 찾을 수 없음`). 새 줄은 화면
// id로 멱등 삽입하고, 이미 있으면 같은 프로젝트·종류의 활성 줄이고 값이 같을 때만 응답을 잃은 재전송(no-op)이다.
// 환율 기억은 여기서 하지 않고 실제로 쓴 외화 줄만 돌려준다 — 커밋 뒤에 트랜잭션을 연 쪽이 기억한다.
async function saveEntries(
  viewer: Viewer,
  projectId: string,
  kind: RevenueEntryKind,
  entries: PreparedEntry[],
  tx: DbOrTx,
): Promise<{ written: number; fxToRemember: FxToRemember[] }> {
  let written = 0;
  const fxToRemember: FxToRemember[] = [];
  for (const { input, payload } of entries) {
    if (input.id && input.isNew) {
      const inserted = await repoInsertRevenueEntry(viewer, { id: input.id, projectId, kind, ...payload }, tx);
      if (!inserted) {
        const stored = await repoFindRevenueEntryById(viewer, input.id, tx);
        if (!stored || !sameStoredEntry(stored, { projectId, kind }, payload)) {
          denyWrite(viewer, REPLAY_RULE, { projectId, entryIds: [input.id] }, new UserFacingError(REPLAY_MISMATCH));
        }
        continue;
      }
    } else if (input.id) {
      if (input.version === undefined) {
        throw new UserFacingError("기존 줄을 저장하려면 버전 정보가 필요합니다 · 화면을 새로고침해 주세요");
      }
      const updated = await repoUpdateRevenueEntryIfVersionMatches(viewer, input.id, input.version, { projectId, kind }, payload, tx);
      if (!updated) {
        const stored = await repoFindRevenueEntryById(viewer, input.id, tx);
        if (!stored || stored.projectId !== projectId || stored.kind !== kind) {
          denyWrite(viewer, ENTRY_SCOPE_RULE, { projectId, entryIds: [input.id] }, new UserFacingError(ENTRY_NOT_FOUND));
        }
        throw new UserFacingError(`다른 사람이 먼저 이 줄을 바꿨습니다 · 덮어쓰기 / 그 값으로(줄 ${input.id})`);
      }
    } else {
      await repoInsertRevenueEntry(viewer, { projectId, kind, ...payload }, tx);
    }
    written += 1;
    if (payload.amountCurrency !== "KRW" && input.fxRateTouched) {
      fxToRemember.push({ currency: payload.amountCurrency, rate: Number(payload.amountFxRate) });
    }
  }
  return { written, fxToRemember };
}

// 04-41(B §1) — 트랜잭션을 여는 쪽(원장 합성 저장)이 잠그기 전에 읽는 매출 줄 쓰기 권한.
export async function revenueWriteRights(viewer: Viewer, can: typeof defaultCan = defaultCan): Promise<{ canWriteEntries: boolean }> {
  return { canWriteEntries: await can(viewer, REVENUE_SETTLEMENT_MENU, "write") };
}

// 04-02 Task 2 ③ — 발행·입금 줄은 "projects.revenue" write로 쓴다. 보내지
// 않은 그룹은 아예 건드리지 않는다 — 권한 없이 줄을 실어 보내면 조용히
// 무시하지 않고 거부한다(T-04-10, 조작 방어). 계약 금액은 쓰지 않는다(04-41 ·
// D-84 — 고객 승인된 현재 차수 합계에서 파생된다).
// `tx`를 받으면(04-02: 견적 줄과 한 트랜잭션으로 묶는 domain/projects/ledger.ts) 새 트랜잭션을 열지 않고, 기억할
// 환율을 돌려준다(saveRevenueInTx) — 커밋 뒤 기억은 트랜잭션을 연 쪽이 한다.
export async function saveRevenueInTx(
  viewer: Viewer,
  projectId: string,
  input: SaveRevenueInput,
  deps: Partial<RevenueWriteDeps> | undefined,
  tx: DbOrTx,
): Promise<FxToRemember[]> {
  if (input.issuedEntries || input.paidEntries) {
    const allowed = deps?.rights ? deps.rights.canWriteEntries : (await revenueWriteRights(viewer, deps?.can)).canWriteEntries;
    if (!allowed) throw new ForbiddenError("발행·입금 줄 저장 권한이 없습니다.");
  }

  const formatErrors: CellFormatError[] = [];
  const issued = prepareEntries(input.issuedEntries ?? [], formatErrors);
  const paid = prepareEntries(input.paidEntries ?? [], formatErrors);
  if (formatErrors.length > 0) throw new SaveRejectedError([], formatErrors);

  const issuedResult = await saveEntries(viewer, projectId, "issue", issued, tx);
  const paidResult = await saveEntries(viewer, projectId, "payment", paid, tx);

  // 04-12(엔지 리뷰 A §1 P2) — 같은 tx로 남긴다(합성 저장이 뒤에서 거부되면 로그도 되돌아간다). 재전송 no-op은 남기지 않는다.
  if (issuedResult.written + paidResult.written > 0) {
    const recordAction = deps?.recordAction ?? defaultRecordAction;
    await recordAction(viewer, { actionType: "document_update", entity: REVENUE_ENTITY, entityId: projectId }, { tx });
  }
  return [...issuedResult.fxToRemember, ...paidResult.fxToRemember];
}

export async function saveRevenue(
  viewer: Viewer,
  projectId: string,
  input: SaveRevenueInput,
  deps?: Partial<RevenueWriteDeps>,
  tx?: DbOrTx,
): Promise<RevenueDto | null> {
  if (tx) {
    // 외부 트랜잭션 안에서는 아직 커밋 전이라 listRevenue의 기본 db 커넥션이 이 쓰기를 보지 못한다(격리) — 스냅샷은
    // 합성 호출자가 커밋 뒤 새로 조회한다.
    await saveRevenueInTx(viewer, projectId, input, deps, tx);
    return null;
  }

  const rights = deps?.rights ?? (input.issuedEntries || input.paidEntries ? await revenueWriteRights(viewer, deps?.can) : undefined);
  const fxToRemember = await withTransaction((innerTx) => saveRevenueInTx(viewer, projectId, input, { ...deps, rights }, innerTx));
  await rememberFxAfterCommit(fxToRemember, deps?.rememberFxRate);
  return listRevenue(viewer, projectId);
}
