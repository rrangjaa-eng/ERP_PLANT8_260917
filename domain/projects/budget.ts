import type { Viewer } from "@/domain/viewer";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { can as defaultCan } from "@/domain/permissions/can";
import { visible as defaultVisible } from "@/domain/permissions/visible";
import { registerDto } from "@/domain/permissions/dto-registry";
import { round } from "@/domain/money";
import { PROJECT_COST_RATE_PCT } from "@/domain/settings/keys";
import { PROJECT_STATUS_WORD } from "@/domain/projects/status-word";
import type { ProjectStatus } from "@/domain/projects/status-transitions";
import { projectRowScope } from "@/domain/projects/visibility";
import { recordAction } from "@/domain/action-log/record";
import { buildChanges } from "@/domain/action-log/changes";
import { setSettingValue, type SettingDef } from "@/domain/settings/registry";
import { UserFacingError } from "@/lib/actions/user-facing-error";
import { withTransaction } from "@/lib/db-transaction";
import { kstDateTimeOf } from "@/lib/kst-date";
import { findSimpleValue, upsertSimpleValue } from "@/repositories/settings";
import { findProjectInScope, lockProjectForWrite } from "@/repositories/projects";
import {
  findBudgetBasisFacts,
  insertBudgetEntry,
  listBudgetEntriesPage,
  listBudgetRowFacts,
  listProjectIdsWithoutBudget,
  sumBudgetKrw,
  type BudgetEntryInput,
  type BudgetEntryReason,
} from "@/repositories/project-budget-entries";
import type { DbOrTx } from "@/repositories/document-counters";

// 07-24(W4 · W5 · EXP-11) — 예산 = project_budget_entries 금액 합(한 번 잡으면 고정). 자동 줄은 사건(PO 금액 저장 · 새 승인 차수 ·
// 등록 · 처음 원가율)이 같은 트랜잭션에서 쓰고, 기준 금액이 늘었을 때만 늘어난 금액 × 그때 원가율 한 줄이다(B-P1-5 · D-730).
// 감액은 경영관리 직접 수정(D-729)으로만 — 자동 사건은 음수 · 0 줄을 쓰지 않는다.

const BUDGET_MENU = "projects.budget";
const BUDGET_AMOUNT_ITEM = "budget.amount";
// PO 금액 칸은 프로젝트 화면에서도 정보 항목 quote.amount 뒤에 있다(domain/projects/ledger.ts) — 이 화면도 같은 항목을 함께 본다.
const PO_AMOUNT_ITEM = "quote.amount";

// 「진행」 = 완료 · 미수주가 아닌 프로젝트(보관은 늘 제외). 예산 현황 기본 필터와 처음 원가율 대상이 같은 목록을 쓴다.
export const BUDGET_INACTIVE_STATUSES: readonly ProjectStatus[] = ["completed", "lost"];

export class BudgetForbiddenError extends UserFacingError {}

// 순수 산식(B-P1-5 · D-730) — (새 기준 − 사건 전 기준) × 율 ÷ 100을 정수 원으로 반올림(domain/money round 한 곳). 율이 비었거나
// 결과가 0 이하면 null(줄 없음). 율은 소수 1자리(설정 스키마)라 10배 정수로 곱해 부동소수 곱 오차를 피한다.
export function budgetDelta(input: { newBasisKrw: number; prevBasisKrw: number; costRatePct: number | null }): number | null {
  if (input.costRatePct === null) return null;
  const increase = input.newBasisKrw - input.prevBasisKrw;
  if (increase <= 0) return null;
  const rateTenths = Math.round(input.costRatePct * 10);
  const delta = round((increase * rateTenths) / 1000, 1, "round");
  return delta > 0 ? delta : null;
}

// 원가율(설정 07-08) — 같은 tx에서 읽는다. 행이 없으면 기본값 null(D-734 — 0과 구분).
export async function readCostRatePct(tx?: DbOrTx): Promise<number | null> {
  const row = await findSimpleValue(SYSTEM_VIEWER, PROJECT_COST_RATE_PCT.key, tx);
  if (!row) return PROJECT_COST_RATE_PCT.default ?? null;
  return PROJECT_COST_RATE_PCT.schema.parse(row.value);
}

// 기준 금액 = PO 금액(원화, 0은 「없음」 — 칸이 NOT NULL 기본 0이다) → 없으면 승인 견적 합계(AQ-39) → 둘 다 없으면 0.
export async function budgetBasisKrw(projectId: string, tx?: DbOrTx): Promise<number> {
  const facts = await findBudgetBasisFacts(SYSTEM_VIEWER, projectId, tx);
  if (!facts) return 0;
  if (facts.poAmountKrw > 0) return facts.poAmountKrw;
  return facts.approvedTotalKrw ?? 0;
}

// 사건 훅 — 부르는 쪽 tx가 프로젝트 행을 이미 잠갔다. budgetDelta가 null이면 아무것도 쓰지 않는다. 쓴 줄 수(0 · 1)를 돌려준다.
export async function recordBudgetEvent(
  viewer: Viewer,
  projectId: string,
  input: { reason: Exclude<BudgetEntryReason, "manual">; prevBasisKrw: number; newBasisKrw: number },
  tx: DbOrTx,
): Promise<number> {
  const costRatePct = await readCostRatePct(tx);
  const deltaKrw = budgetDelta({ newBasisKrw: input.newBasisKrw, prevBasisKrw: input.prevBasisKrw, costRatePct });
  if (deltaKrw === null || costRatePct === null) return 0;
  await insertEntry(
    viewer,
    { projectId, reason: input.reason, baseAmountKrw: input.newBasisKrw, costRatePct: costRatePct.toFixed(1), deltaKrw, memo: null },
    tx,
  );
  return 1;
}

// 줄의 작성자(created_by)는 users 행을 가리킨다(07-11 FK). 시스템 행위자(SYSTEM_VIEWER — 가져오기 명령 등)는 사람 행이 없어
// FK 오류로 터지기 전에 읽히는 말로 거부한다 — 부르는 쪽 tx 전체가 되돌아간다(값만 저장되고 줄이 빠지는 일이 없다).
async function insertEntry(viewer: Viewer, input: BudgetEntryInput, tx: DbOrTx): Promise<void> {
  if (viewer.id === SYSTEM_VIEWER.id) throw new UserFacingError("예산 줄 작성자 없음 · 사람 계정으로 다시 실행");
  await insertBudgetEntry(viewer, input, tx);
}

// ── 처음 원가율(D-747 · U3) ─────────────────────────────────────────────

// 원가율 저장 tx 안에서 부른다(화면 저장 saveCostRateSetting · 가져오기 afterApply). 예산 줄이 하나도 없는 진행 프로젝트마다
// 그때 기준 × 원가율 「처음」 한 줄. 프로젝트 id 오름으로 잠근 뒤 줄 없음을 다시 본다(그 사이 사건 훅이 줄을 썼으면 건너뛴다).
// 만든 줄 수를 돌려준다.
export async function seedInitialBudgets(viewer: Viewer, tx: DbOrTx): Promise<number> {
  const costRatePct = await readCostRatePct(tx);
  if (costRatePct === null) return 0;
  const ids = await listProjectIdsWithoutBudget(viewer, BUDGET_INACTIVE_STATUSES, tx);
  let created = 0;
  for (const projectId of ids) {
    await lockProjectForWrite(viewer, projectId, tx);
    if ((await sumBudgetKrw(viewer, projectId, tx)).count > 0) continue;
    created += await recordBudgetEvent(viewer, projectId, { reason: "initial", prevBasisKrw: 0, newBasisKrw: await budgetBasisKrw(projectId, tx) }, tx);
  }
  return created;
}

// 화면 저장(설정 액션이 원가율 키일 때만 부른다 — B-P3-7: 설정 도메인은 프로젝트를 모른다). setSimpleSettingValue와 같은 결:
// 권한은 tx 밖에서 판정하고(잠근 tx 안에서 전역 풀을 쓰지 않는다), 아니면 setSettingValue가 그대로 거부한다. 값 저장 · 설정
// 행동 로그 · 처음 줄이 한 tx다. firstSave = 저장 전 원가율이 비었고 저장 뒤 값이 있음(0도 값이다 — D-734).
export async function saveCostRateSetting(
  viewer: Viewer,
  def: SettingDef<unknown>,
  value: unknown,
): Promise<{ firstSave: boolean; createdCount: number }> {
  if (!(await defaultCan(viewer, "admin.settings", "write"))) {
    await setSettingValue(viewer, def, value);
    return { firstSave: false, createdCount: 0 };
  }
  return withTransaction(async (tx) => {
    const previous = await readCostRatePct(tx);
    await setSettingValue(viewer, def, value, {
      can: () => Promise.resolve(true),
      withTransaction: (fn) => fn(tx),
      upsertSimpleValue: (v, key, val, by) => upsertSimpleValue(v, key, val, by, tx),
      recordAction: (v, logEntry) => recordAction(v, logEntry, { tx }),
    });
    const next = await readCostRatePct(tx);
    const createdCount = await seedInitialBudgets(viewer, tx);
    return { firstSave: previous === null && next !== null, createdCount };
  });
}

// ── 직접 수정(D-729) ─────────────────────────────────────────────────────

const MEMO_MAX = 500;

// 경영관리가 예산을 바로 고친다(감액의 유일한 길). 화면이 보던 값(expectedBudgetKrw)과 잠근 뒤 지금 합이 다르면 덮어쓰지 않는다.
// 차이 0이면 아무것도 쓰지 않는다. 줄 · 끌 수 없는 행동 로그가 한 tx다.
export async function setBudgetManually(
  viewer: Viewer,
  projectId: string,
  input: { budgetKrw: number; expectedBudgetKrw: number; memo: string },
): Promise<{ budgetKrw: number }> {
  if (!(await defaultCan(viewer, BUDGET_MENU, "write"))) throw new BudgetForbiddenError("예산 수정 권한 없음");
  const memo = input.memo.trim();
  if (memo === "") throw new UserFacingError("사유 · 입력");
  if (memo.length > MEMO_MAX) throw new UserFacingError("사유 · 500자 이하");
  if (!Number.isSafeInteger(input.budgetKrw) || input.budgetKrw < 0) throw new UserFacingError("예산은 0 이상 · 금액 수정");
  const scope = await projectRowScope(viewer);

  return withTransaction(async (tx) => {
    // 쓰기 권한이 있어도 행 범위(예산 현황 목록과 같은 projectRowScope) 밖 프로젝트는 없는 것과 같다.
    await lockProjectForWrite(viewer, projectId, tx);
    if (!(await findProjectInScope(viewer, scope, projectId, tx))) throw new UserFacingError("프로젝트 없음");
    const { sumKrw } = await sumBudgetKrw(viewer, projectId, tx);
    if (sumKrw !== input.expectedBudgetKrw) throw new UserFacingError("다른 사람이 먼저 수정 · 새로 불러오기");
    const deltaKrw = input.budgetKrw - sumKrw;
    if (deltaKrw === 0) return { budgetKrw: sumKrw };
    await insertEntry(viewer, { projectId, reason: "manual", baseAmountKrw: null, costRatePct: null, deltaKrw, memo }, tx);
    await recordAction(
      viewer,
      {
        actionType: "budget_manual_change",
        entity: "project",
        entityId: projectId,
        detail: { changes: buildChanges({ budgetKrw: sumKrw }, { budgetKrw: input.budgetKrw }), memo },
      },
      { tx },
    );
    return { budgetKrw: input.budgetKrw };
  });
}

// ── 예산 현황 읽기(W5 · SC-21) ─────────────────────────────────────────────

export type BudgetListStatus = "in_progress" | "all";

export type BudgetRowDto = {
  projectId: string;
  number: string;
  name: string;
  status: ProjectStatus;
  // 상태 칸 한 값(K11): 초과 > 프로젝트 상태 낱말.
  statusWord: (typeof PROJECT_STATUS_WORD)[ProjectStatus] | "초과";
  overrun: boolean;
  // 예산 줄 없이 기준 금액만 있는 프로젝트(줄이 잡히지 않은 채 진행으로 돌아온 건 등) — 금액 칸 `—`(SYSTEM §7-7 PARTIAL).
  computable: boolean;
  // 정보 항목 budget.amount를 볼 때만 싣는다(계산 불가 행은 예산 · 남은 예산을 싣지 않는다).
  budgetKrw?: number;
  usedKrw?: number;
  remainingKrw?: number;
  poAmountKrw?: number;
};

// 누수 스캔(07-03 K31) 등록 — 금액 칸만 정보 항목 뒤에 있다(PO 금액은 예산 · 견적 금액 all-of). 식별 · 상태 칸(번호 · 이름 · 상태 낱말 ·
// 초과 · 계산 가능)은 정보 항목이 아니라 `projects.budget` 메뉴 보기 + 행 범위(projectRowScope) 뒤에서만 나간다.
registerDto({
  name: "budgetRow",
  fields: [
    { key: "budgetKrw", infoItem: BUDGET_AMOUNT_ITEM },
    { key: "usedKrw", infoItem: BUDGET_AMOUNT_ITEM },
    { key: "remainingKrw", infoItem: BUDGET_AMOUNT_ITEM },
    { key: "poAmountKrw", infoItem: [BUDGET_AMOUNT_ITEM, PO_AMOUNT_ITEM] },
  ],
});

export type BudgetTotals = { budgetKrw: number; usedKrw: number; remainingKrw: number };

export type BudgetListResult = {
  costRateSet: boolean;
  rows: BudgetRowDto[];
  // 금액을 못 보면 null(합계도 싣지 않는다).
  totals: BudgetTotals | null;
  uncomputableCount: number;
  canWrite: boolean;
};

export type BudgetReadDeps = { can: typeof defaultCan; visible: typeof defaultVisible };

async function assertBudgetView(viewer: Viewer, deps?: Partial<BudgetReadDeps>): Promise<void> {
  const canFn = deps?.can ?? defaultCan;
  if (!(await canFn(viewer, BUDGET_MENU, "view"))) throw new BudgetForbiddenError("예산 현황 보기 권한 없음");
}

export async function listBudgetRows(
  viewer: Viewer,
  input: { status: BudgetListStatus },
  deps?: Partial<BudgetReadDeps>,
): Promise<BudgetListResult> {
  await assertBudgetView(viewer, deps);
  const canFn = deps?.can ?? defaultCan;
  const visibleFn = deps?.visible ?? defaultVisible;
  const [costRatePct, seeAmount, seePo, canWrite, scope] = await Promise.all([
    readCostRatePct(),
    visibleFn(viewer, BUDGET_AMOUNT_ITEM),
    visibleFn(viewer, PO_AMOUNT_ITEM),
    canFn(viewer, BUDGET_MENU, "write"),
    projectRowScope(viewer),
  ]);
  if (costRatePct === null) return { costRateSet: false, rows: [], totals: null, uncomputableCount: 0, canWrite };

  const facts = await listBudgetRowFacts(viewer, {
    scope,
    excludeStatuses: input.status === "in_progress" ? BUDGET_INACTIVE_STATUSES : [],
  });
  const rows: BudgetRowDto[] = [];
  for (const fact of facts) {
    const status = fact.status as ProjectStatus;
    const hasEntries = fact.entryCount > 0;
    // 줄이 없으면 기준 금액을 본다 — 0이면 예산이 없는 프로젝트라 행이 없다. 원가율 0이면 줄 없이 예산 0이 계산된 값이다(D-734).
    const basis = hasEntries ? null : fact.poAmountKrw > 0 ? fact.poAmountKrw : await budgetBasisKrw(fact.projectId);
    if (!hasEntries && basis === 0) continue;
    const computable = hasEntries || budgetDelta({ newBasisKrw: basis ?? 0, prevBasisKrw: 0, costRatePct }) === null;
    const budgetKrw = hasEntries ? fact.budgetSumKrw : 0;
    const remainingKrw = budgetKrw - fact.usedKrw;
    const overrun = seeAmount && computable && remainingKrw < 0;
    const row: BudgetRowDto = {
      projectId: fact.projectId,
      number: fact.number,
      name: fact.name,
      status,
      statusWord: overrun ? "초과" : PROJECT_STATUS_WORD[status],
      overrun,
      computable,
    };
    if (seeAmount) {
      row.usedKrw = fact.usedKrw;
      if (computable) {
        row.budgetKrw = budgetKrw;
        row.remainingKrw = remainingKrw;
      }
      if (seePo) row.poAmountKrw = fact.poAmountKrw;
    }
    rows.push(row);
  }

  if (seeAmount) {
    // 초과 먼저 → 남은 예산 적은 순 → 계산 불가는 뒤(번호 순 — 질의 순서 유지).
    rows.sort((a, b) => {
      if (a.computable !== b.computable) return a.computable ? -1 : 1;
      if (!a.computable) return 0;
      if (a.overrun !== b.overrun) return a.overrun ? -1 : 1;
      return (a.remainingKrw ?? 0) - (b.remainingKrw ?? 0);
    });
  }
  const computed = rows.filter((row) => row.computable);
  const totals = seeAmount
    ? computed.reduce<BudgetTotals>(
        (sum, row) => ({
          budgetKrw: sum.budgetKrw + (row.budgetKrw ?? 0),
          usedKrw: sum.usedKrw + (row.usedKrw ?? 0),
          remainingKrw: sum.remainingKrw + (row.remainingKrw ?? 0),
        }),
        { budgetKrw: 0, usedKrw: 0, remainingKrw: 0 },
      )
    : null;
  return { costRateSet: true, rows, totals, uncomputableCount: rows.length - computed.length, canWrite };
}

// ── 예산 이력(SC-21 · K9) ─────────────────────────────────────────────────

const HISTORY_PAGE_SIZE = 10;

// 사유 낱말 표 한 곳 — 패널 · 시트가 이 낱말만 쓴다.
export const BUDGET_REASON_WORD: Record<BudgetEntryReason, string> = {
  po_amount_change: "PO 금액 변경",
  new_approved_revision: "새 승인 차수",
  initial: "처음",
  manual: "직접 수정",
};

export type BudgetHistoryEntry = { id: string; at: string; reasonWord: string; deltaKrw: number; memo: string | null };

export type BudgetHistoryDto = {
  projectId: string;
  currentBudgetKrw: number;
  canWrite: boolean;
  entries: BudgetHistoryEntry[];
  nextCursor: string | null;
};

// 이력은 금액 줄이라 예산 현황 보기 + 정보 항목 budget.amount + 행 범위가 다 있어야 한다(하나라도 없으면 거부).
registerDto({
  name: "budgetHistory",
  fields: [
    { key: "currentBudgetKrw", infoItem: BUDGET_AMOUNT_ITEM },
    { key: "entries", infoItem: BUDGET_AMOUNT_ITEM },
  ],
});

export async function listBudgetHistory(
  viewer: Viewer,
  projectId: string,
  input: { cursor: string | null },
  deps?: Partial<BudgetReadDeps>,
): Promise<BudgetHistoryDto> {
  await assertBudgetView(viewer, deps);
  const canFn = deps?.can ?? defaultCan;
  const visibleFn = deps?.visible ?? defaultVisible;
  const [seeAmount, canWrite, scope] = await Promise.all([
    visibleFn(viewer, BUDGET_AMOUNT_ITEM),
    canFn(viewer, BUDGET_MENU, "write"),
    projectRowScope(viewer),
  ]);
  if (!seeAmount) throw new BudgetForbiddenError("예산 금액 보기 권한 없음");
  if (!(await findProjectInScope(viewer, scope, projectId))) throw new UserFacingError("프로젝트 없음");

  const [{ sumKrw }, page] = await Promise.all([
    sumBudgetKrw(viewer, projectId),
    listBudgetEntriesPage(viewer, projectId, { limit: HISTORY_PAGE_SIZE, cursorId: input.cursor }),
  ]);
  const entries = page.rows.map((row) => ({
    id: row.id,
    at: kstDateTimeOf(row.createdAt),
    reasonWord: BUDGET_REASON_WORD[row.reason],
    deltaKrw: row.deltaKrw,
    memo: row.reason === "manual" ? row.memo : null,
  }));
  return { projectId, currentBudgetKrw: sumKrw, canWrite, entries, nextCursor: page.hasMore ? (entries.at(-1)?.id ?? null) : null };
}
