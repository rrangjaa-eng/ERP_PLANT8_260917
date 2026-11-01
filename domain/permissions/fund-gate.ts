import { z } from "zod";
import type { Viewer } from "@/domain/viewer";
import { FUND_DIVISION_SETTING_KEY } from "@/domain/permissions/fund-scope";
import { viewerDivision as defaultViewerDivision } from "@/domain/permissions/viewer-division";
import { log } from "@/lib/log";
import type { DbOrTx } from "@/repositories/document-counters";
import { findOrgUnitById } from "@/repositories/org-units";
import { findRoleById as defaultFindRoleById } from "@/repositories/roles";
import { findSimpleValue } from "@/repositories/settings";

// 07.3-01(D-7301 · D-7310 · D-7311 · D-7313): 자금 게이트 — can()이 자금 키 권한 행이 허용일 때만 부른다.
// 계급 viewScope가 company면 면제(계급 id · 이름 비교 없음), 아니면 사람의 소속 본부 === 자금 본부 설정(uuid 하나).
// 설정이 없거나 uuid가 아니거나 보관된 본부면 닫힌다(fail-closed). can.ts · scope-for.ts · 설정 registry · keys.ts는
// import하지 않는다(registry.ts가 can을 import — 순환 방지, 키 문자열은 잎 fund-scope.ts에서).

/** 자금 본부 설정이 가리키는 살아 있는 본부. tx를 주면 그 연결로 읽는다(잠근 트랜잭션 안 호출처). */
export async function readFundDivision(viewer: Viewer, tx?: DbOrTx): Promise<{ id: string; name: string } | null> {
  const row = await findSimpleValue(viewer, FUND_DIVISION_SETTING_KEY, tx);
  if (row?.value == null) return null;
  const parsed = z.string().uuid().safeParse(row.value);
  if (!parsed.success) return unusable("not_uuid");
  const unit = await findOrgUnitById(viewer, parsed.data, tx);
  if (!unit) return unusable("org_unit_missing");
  if (unit.archivedAt !== null) return unusable("org_unit_archived");
  return { id: unit.id, name: unit.name };
}

// 값은 있는데 쓸 수 없으면 닫으면서 경고 한 줄 — 값이 없는 것은 관리자가 비운 정상 상태라 경고하지 않는다.
function unusable(reason: "not_uuid" | "org_unit_missing" | "org_unit_archived"): null {
  log.warn("fund_gate.division_unusable", { key: FUND_DIVISION_SETTING_KEY, reason });
  return null;
}

export type FundGateDeps = {
  findRoleById: (viewer: Viewer, id: string) => Promise<{ viewScope: string } | null>;
  readFundDivision: (viewer: Viewer) => Promise<{ id: string } | null>;
  viewerDivision: (viewer: Viewer) => Promise<{ orgUnitId: string | null }>;
};

// 요청 memo(T-07.3-01-09) — scope-for.ts rowScopeFor와 같은 규칙: getSession이 등록한 viewer 객체에만, deps가 없을 때만,
// 실패하면 지운다. 등록하지 않은 viewer는 매번 계산한다(시험이 같은 객체로 DB를 바꿔도 낡은 값을 보지 않는다).
const requestMemo = new WeakMap<Viewer, { pending: Promise<boolean> | null }>();

export function memoizeFundGateForRequest(viewer: Viewer): void {
  requestMemo.set(viewer, { pending: null });
}

export async function fundGate(viewer: Viewer, deps?: Partial<FundGateDeps>): Promise<boolean> {
  const memo = requestMemo.get(viewer);
  if (!memo || deps) return computeFundGate(viewer, deps);
  if (memo.pending) return memo.pending;
  const pending = computeFundGate(viewer, deps);
  memo.pending = pending;
  pending.catch(() => {
    if (memo.pending === pending) memo.pending = null;
  });
  return pending;
}

async function computeFundGate(viewer: Viewer, deps?: Partial<FundGateDeps>): Promise<boolean> {
  if (!viewer.roleId) return false;
  const role = await (deps?.findRoleById ?? defaultFindRoleById)(viewer, viewer.roleId);
  if (!role) return false;
  if (role.viewScope === "company") return true;
  const [fund, division] = await Promise.all([
    (deps?.readFundDivision ?? readFundDivision)(viewer),
    (deps?.viewerDivision ?? defaultViewerDivision)(viewer),
  ]);
  if (!fund) return false;
  return division.orgUnitId === fund.id;
}
