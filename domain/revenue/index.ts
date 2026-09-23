import type { Viewer } from "@/domain/viewer";
import { can as defaultCan } from "@/domain/permissions/can";
import { project, type DtoSpec } from "@/domain/permissions/project";
import { recordAction as defaultRecordAction } from "@/domain/action-log/record";
import { registerDto } from "@/domain/permissions/dto-registry";
import { UserFacingError } from "@/lib/actions/user-facing-error";
import {
  moneyFromRow,
  moneyToColumns,
  round,
  grossFromTotal,
  type Money,
  type Currency,
} from "@/domain/money";
import { applyTaxRule } from "@/domain/money/tax";
import { rememberFxRate } from "@/domain/money/currency";
import type { TaxRule } from "@/domain/code-tables/tax-rule";
import { getSettingValue as defaultGetSettingValue } from "@/domain/settings/registry";
import { TAX_VAT_RATE, TAX_ROUNDING_VAT_UNIT } from "@/domain/settings/keys";
import { withTransaction } from "@/lib/db-transaction";
import type { DbOrTx } from "@/repositories/document-counters";
import { scopeFor } from "@/domain/permissions/scope-for";
import {
  findProjectById as repoFindProjectById,
  updateProjectContract as repoUpdateProjectContract,
} from "@/repositories/projects";
import {
  listRevenueEntriesByProject as repoListRevenueEntriesByProject,
  insertRevenueEntry as repoInsertRevenueEntry,
  updateRevenueEntryIfVersionMatches as repoUpdateRevenueEntryIfVersionMatches,
  type RevenueEntryRow,
} from "@/repositories/revenue-entries";

export class ForbiddenError extends UserFacingError {}
export class ProjectNotFoundError extends UserFacingError {}

const PROJECTS_MENU = "projects";
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

export type ContractInfo = {
  amount: MoneyDto;
  vatKrw: number;
  totalKrw: number;
};

// project()가 필드 단위로 투영하는 대상. 배열 필드(issuedEntries·
// paidEntries)와 그 합계는 정보 항목 통과 여부에 따라 project()가 **키
// 자체를 싣지 않는다**(domain/permissions/project.ts) — 기획본부에게는
// 이 두 필드와 파생 합계가 DTO에서 통째로 빠진다(T-04-09).
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
    { key: "contract", from: "contract", infoItem: "project.value" },
    { key: "issuedEntries", from: "issuedEntries", infoItem: "revenue.issued_amount" },
    { key: "paidEntries", from: "paidEntries", infoItem: "revenue.paid_amount" },
    { key: "issuedTotalKrw", from: "issuedTotalKrw", infoItem: "revenue.paid_amount" },
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

// 04-02 Task 2 ③ — 계약 금액 + 발행·입금 두 표를 한 DTO로 합쳐 돌려준다.
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

  const contractMoney = moneyFromRow({
    currency: projectRow.contractCurrency,
    foreignAmount: projectRow.contractForeignAmount,
    fxRate: projectRow.contractFxRate,
    amountKrw: projectRow.contractAmountKrw,
  });
  const contractVat = await computeVat(contractMoney.amountKrw, new Date(), deps);
  const contract: ContractInfo = { amount: moneyToDto(contractMoney), vatKrw: contractVat.vatKrw, totalKrw: contractVat.totalKrw };

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
  version?: number;
  entryDate: string;
  amount: MoneyInputDto;
  /** 환율 칸을 이번 저장에서 실제로 고쳤을 때만 true(외화일 때만 의미가 있다). */
  fxRateTouched?: boolean;
  note?: string | null;
};

export type SaveRevenueInput = {
  contract?: MoneyInputDto;
  /** 환율 칸을 이번 저장에서 실제로 고쳤을 때만 true. */
  contractFxRateTouched?: boolean;
  issuedEntries?: RevenueEntryWriteRow[];
  paidEntries?: RevenueEntryWriteRow[];
};

export type RevenueWriteDeps = {
  can: typeof defaultCan;
  recordAction: typeof defaultRecordAction;
};

async function saveEntries(
  viewer: Viewer,
  projectId: string,
  kind: RevenueEntryKind,
  rows: RevenueEntryWriteRow[],
  tx: DbOrTx,
): Promise<RevenueEntryRow[]> {
  const results: RevenueEntryRow[] = [];
  for (const input of rows) {
    const columns = moneyToColumns(input.amount);

    if (columns.currency !== "KRW" && input.fxRateTouched) {
      await rememberFxRate(columns.currency, Number(columns.fxRate));
    }

    const payload = {
      entryDate: input.entryDate,
      amountCurrency: columns.currency,
      amountForeignAmount: columns.foreignAmount,
      amountFxRate: columns.fxRate,
      amountAmountKrw: columns.amountKrw,
      note: input.note ?? null,
    };

    if (input.id) {
      if (input.version === undefined) {
        throw new UserFacingError("기존 줄을 저장하려면 버전 정보가 필요합니다 · 화면을 새로고침해 주세요");
      }
      const updated = await repoUpdateRevenueEntryIfVersionMatches(
        viewer,
        input.id,
        input.version,
        { projectId, kind },
        payload,
        tx,
      );
      if (!updated) {
        throw new UserFacingError(`다른 사람이 먼저 이 줄을 바꿨습니다 · 덮어쓰기 / 그 값으로(줄 ${input.id})`);
      }
      results.push(updated);
    } else {
      const inserted = await repoInsertRevenueEntry(viewer, { projectId, kind, ...payload }, tx);
      results.push(inserted);
    }
  }
  return results;
}

// 04-02 Task 2 ③ — 쓰기는 칸별 주체가 갈린다(D-57): 계약 금액은 기존
// "projects" write(PM), 발행·입금 줄은 새 "projects.revenue" write. 둘
// 다 보내지 않은 그룹은 아예 건드리지 않는다 — 권한이 없는 그룹을 입력에
// 실어 보내면 조용히 무시하지 않고 거부한다(T-04-10, 조작 방어).
// `tx`를 받으면(04-02: 견적 줄과 한 트랜잭션으로 묶는
// domain/projects/ledger.ts) 새 트랜잭션을 열지 않는다.
export async function saveRevenue(
  viewer: Viewer,
  projectId: string,
  input: SaveRevenueInput,
  deps?: Partial<RevenueWriteDeps>,
  tx?: DbOrTx,
): Promise<RevenueDto | null> {
  const canFn = deps?.can ?? defaultCan;

  if (input.contract) {
    if (!(await canFn(viewer, PROJECTS_MENU, "write"))) {
      throw new ForbiddenError("계약 금액 저장 권한이 없습니다.");
    }
  }
  if (input.issuedEntries || input.paidEntries) {
    if (!(await canFn(viewer, REVENUE_SETTLEMENT_MENU, "write"))) {
      throw new ForbiddenError("발행·입금 줄 저장 권한이 없습니다.");
    }
  }

  const runSave = async (innerTx: DbOrTx): Promise<void> => {
    if (input.contract) {
      const columns = moneyToColumns(input.contract);
      if (columns.currency !== "KRW" && input.contractFxRateTouched) {
        await rememberFxRate(columns.currency, Number(columns.fxRate));
      }
      await repoUpdateProjectContract(
        viewer,
        projectId,
        {
          contractCurrency: columns.currency,
          contractForeignAmount: columns.foreignAmount,
          contractFxRate: columns.fxRate,
          contractAmountKrw: columns.amountKrw,
        },
        innerTx,
      );
    }
    if (input.issuedEntries) await saveEntries(viewer, projectId, "issue", input.issuedEntries, innerTx);
    if (input.paidEntries) await saveEntries(viewer, projectId, "payment", input.paidEntries, innerTx);
  };

  const recordAction = deps?.recordAction ?? defaultRecordAction;

  if (tx) {
    // 외부 트랜잭션(domain/projects/ledger.ts) 안에서는 아직 커밋 전이라
    // listRevenue의 기본 db 커넥션이 이 쓰기를 보지 못한다(격리) — 여기서
    // 최신 스냅샷을 만들지 않는다. 커밋 뒤 스냅샷은 합성 호출자가 새로
    // 조회한다.
    await runSave(tx);
    await recordAction(viewer, { actionType: "document_update", entity: REVENUE_ENTITY, entityId: projectId });
    return null;
  }

  await withTransaction(runSave);
  await recordAction(viewer, { actionType: "document_update", entity: REVENUE_ENTITY, entityId: projectId });
  return listRevenue(viewer, projectId);
}
