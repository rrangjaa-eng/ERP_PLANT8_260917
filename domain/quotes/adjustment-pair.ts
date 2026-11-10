import type { Viewer } from "@/domain/viewer";
import { can } from "@/domain/permissions/can";
import type { QuoteLineField, QuoteLineKind } from "@/domain/quotes/edit-scope";
import { negateMoneyColumns, type Currency } from "@/domain/money";
import { projectRowScope } from "@/domain/projects/visibility";
import { listCounterpartCandidates as repoListCounterpartCandidates } from "@/repositories/projects";

// 07.2-12(D7298-B · D-7300) — 프로젝트 사이 조정 쌍. 한쪽 조정 줄과 상대 프로젝트 현재 차수의 반대 부호 조정 줄이 같은
// adjustment_pair_id를 나눠 갖고 한 트랜잭션에서 함께 생기고 · 고쳐지고 · 보관되고 · 복원된다(260907 `quote_adjustments`
// from→to 한 행 대신 줄 두 개 — 양쪽 손익이 같은 견적 줄 합으로 읽힌다). 판정은 이 파일의 순수 함수, 쓰기는 domain/quotes/lines.ts.

export const ADJUSTMENT_PAIR_LOCKED = "상대 프로젝트 완료 · 조정 불가";
// 잠금 전에 읽은 쌍과 잠근 뒤 다시 읽은 쌍이 다르다(그 사이 다른 사람이 쌍을 지웠다).
export const ADJUSTMENT_PAIR_CHANGED = "다른 사람이 먼저 바꿈 · 새로 고침";
// 쌍은 새 조정 줄로만 만든다 — 기존 줄(규칙 줄 06.5 D-6502 포함) · 다른 종류 · 자기 프로젝트는 상대가 될 수 없다.
export const ADJUSTMENT_PAIR_NEW_ONLY = "조정 쌍은 새 조정 줄만 · 새로 고침";
export const ADJUSTMENT_PAIR_NOT_VISIBLE = "상대 프로젝트를 볼 수 없음 · 새로 고침";
const COUNTERPART_NOT_SELECTABLE = "완료 프로젝트 · 고를 수 없음";

// 완료(잠긴) 프로젝트는 어느 쪽이든 쌍을 만들 · 고칠 · 지울 · 되살릴 수 없다.
export function pairLocked(status: string): boolean {
  return status === "completed";
}

// 요청 줄 하나의 쌍 판정 — 상대를 실은 줄은 새 조정 줄이고 상대가 자기 프로젝트가 아니어야 한다. 기존 줄은 저장된 상대 그대로만.
export function pairRequestError(input: {
  projectId: string;
  isNew: boolean;
  kind: QuoteLineKind;
  counterpartProjectId: string | undefined;
  storedCounterpartProjectId: string | null;
}): string | null {
  const requested = input.counterpartProjectId;
  if (requested === undefined) return null;
  if (!input.isNew) return requested === input.storedCounterpartProjectId ? null : ADJUSTMENT_PAIR_NEW_ONLY;
  if (input.kind !== "adjustment" || requested === input.projectId) return ADJUSTMENT_PAIR_NEW_ONLY;
  return null;
}

// 저장이 건드리는 상대 프로젝트 집합 — 새 쌍 줄은 요청의 상대, 기존 쌍 줄(수정 · 보관)은 저장된 상대. 정렬 · 중복 없음.
export function counterpartSet(
  newRows: readonly { counterpartProjectId?: string }[],
  storedRows: readonly { counterpartProjectId: string | null }[],
): string[] {
  const ids = new Set<string>();
  for (const row of newRows) if (row.counterpartProjectId) ids.add(row.counterpartProjectId);
  for (const row of storedRows) if (row.counterpartProjectId) ids.add(row.counterpartProjectId);
  return [...ids].sort();
}

// 두 프로젝트를 잠그는 순서 — id 오름차순 하나(반대 방향 동시 저장이 서로를 기다리며 교착 40P01에 빠지지 않는다).
export function lockOrder(projectId: string, counterpartIds: readonly string[]): string[] {
  return [...new Set([projectId, ...counterpartIds])].sort();
}

export type PairWrite =
  | { kind: "insert"; lineId: string; counterpartProjectId: string }
  | { kind: "sync"; lineId: string; pairId: string; counterpartProjectId: string }
  | { kind: "archive"; lineId: string; pairId: string; counterpartProjectId: string };

// 자기 쪽 쓰기 → 상대 쪽 쓰기 목록. 새로 들어간 쌍 줄은 짝을 만들고, 금액(실행가) · 항목명이 바뀐 쌍 줄은 짝을 따라 고치고
// (UI-SPEC Open questions 7 — 거래처 · 비고는 각 줄 따로), 보관한 쌍 줄은 짝도 보관한다.
export function planPairWrites(input: {
  inserted: readonly { id: string; counterpartProjectId?: string }[];
  updated: readonly { id: string; adjustmentPairId: string | null; counterpartProjectId: string | null; changed: readonly QuoteLineField[] }[];
  archived: readonly { id: string; adjustmentPairId: string | null; counterpartProjectId: string | null }[];
}): PairWrite[] {
  const writes: PairWrite[] = [];
  for (const row of input.inserted) {
    if (row.counterpartProjectId) writes.push({ kind: "insert", lineId: row.id, counterpartProjectId: row.counterpartProjectId });
  }
  for (const row of input.updated) {
    if (!row.adjustmentPairId || !row.counterpartProjectId) continue;
    if (!row.changed.some((field) => field === "itemName" || field === "execution")) continue;
    writes.push({ kind: "sync", lineId: row.id, pairId: row.adjustmentPairId, counterpartProjectId: row.counterpartProjectId });
  }
  for (const row of input.archived) {
    if (row.adjustmentPairId && row.counterpartProjectId) {
      writes.push({ kind: "archive", lineId: row.id, pairId: row.adjustmentPairId, counterpartProjectId: row.counterpartProjectId });
    }
  }
  return writes;
}

type MoneyColumnsOf<Prefix extends string> = {
  [K in `${Prefix}Currency`]: string;
} & { [K in `${Prefix}ForeignAmount`]: string | null } & { [K in `${Prefix}FxRate`]: string } & { [K in `${Prefix}AmountKrw`]: number };

// 짝 줄의 돈 칸 — 원 줄 저장 칸(단가 · 실행가 넷씩)을 부호만 바꿔 복사하고 차익도 부호를 바꾼다(조정 줄은 견적가 0).
// 다시 환산하지 않는다(negateMoneyColumns). 범위 밖이면 MoneyInputError(range)를 던진다 — 호출자가 형식 오류로 전부 거부.
export function pairedMoneyColumns(source: MoneyColumnsOf<"unitPrice"> & MoneyColumnsOf<"execution"> & { quoteAmountKrw: number; profitKrw: number }) {
  const unitPrice = negateMoneyColumns({
    currency: source.unitPriceCurrency as Currency,
    foreignAmount: source.unitPriceForeignAmount,
    fxRate: source.unitPriceFxRate,
    amountKrw: source.unitPriceAmountKrw,
  });
  const execution = negateMoneyColumns({
    currency: source.executionCurrency as Currency,
    foreignAmount: source.executionForeignAmount,
    fxRate: source.executionFxRate,
    amountKrw: source.executionAmountKrw,
  });
  return {
    unitPriceCurrency: unitPrice.currency,
    unitPriceForeignAmount: unitPrice.foreignAmount,
    unitPriceFxRate: unitPrice.fxRate,
    unitPriceAmountKrw: unitPrice.amountKrw,
    executionCurrency: execution.currency,
    executionForeignAmount: execution.foreignAmount,
    executionFxRate: execution.fxRate,
    executionAmountKrw: execution.amountKrw,
    quoteAmountKrw: 0 - source.quoteAmountKrw,
    profitKrw: 0 - source.profitKrw,
  };
}

export type CounterpartProject = {
  id: string;
  number: string;
  name: string;
  teamName: string | null;
  selectable: true | { reason: string };
};

// 상대 고르기 목록 — 조정 줄 쓰기와 같은 행 범위 용도(ADJUSTMENT_OP — 조정 권리자는 회사 전체)라 「목록엔 있는데 저장 거부」가 없다.
// 완료 프로젝트는 보이되 고를 수 없다(이유 한 줄). 조정 쓰기 권리가 없으면 빈 목록.
export async function listCounterpartProjects(viewer: Viewer, projectId: string): Promise<CounterpartProject[]> {
  if (!(await can(viewer, "projects.adjustment", "write"))) return [];
  const scope = await projectRowScope(viewer, undefined, { fundOp: ["projects.adjustment", "write"] as const });
  const rows = await repoListCounterpartCandidates(viewer, scope, projectId);
  return rows.map((row) => ({
    id: row.id,
    number: row.number,
    name: row.name,
    teamName: row.teamName,
    selectable: pairLocked(row.status) ? { reason: COUNTERPART_NOT_SELECTABLE } : true,
  }));
}
