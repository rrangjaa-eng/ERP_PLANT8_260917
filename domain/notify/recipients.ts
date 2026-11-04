// 알림 받는 사람 해석 — 경영관리 · 계급 추가(D-748) · 팀장. 읽기는 repositories/notify-sources.ts.
// 07.3-02(D-7312): 자금 키 알림(지급 · 임자 없는 증빙)은 권한표 쓰기 보유자 ∩ (자금 본부 소속 ∨ 회사 전체 계급) — 권한표 직독은 이 파일에서만.
import { resolveHolders, type ScopeKind, type SnapshotPerson } from "@/domain/approvals/route";
import { readFundDivision } from "@/domain/permissions/fund-gate";
import type { FundScopedMenu } from "@/domain/permissions/fund-scope";
import { TEAM_LEAD_ROLE_ID } from "@/domain/permissions/roles";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { listActiveUserIdsByRoles, listCompanyScopeRoleIds, listMenuWriterIds, listPaymentManagerIds } from "@/repositories/notify-sources";
import { listOrgSnapshot } from "@/repositories/org-snapshot";
import type { RouteStepRef } from "@/repositories/notify-sources";
import type { NotifyTx } from "@/repositories/notifications";

// D-702: 경영관리 = 지급 처리 쓰기 권한 보유 활성 사용자(07.3-02 — 자금 본부 거르개를 지난 사람).
export async function paymentManagers(today: string, tx?: NotifyTx): Promise<string[]> {
  return keepFundHands(await listPaymentManagerIds(SYSTEM_VIEWER, today, tx), today, tx);
}

// 07.3-02(D-7312): 자금 키 메뉴의 쓰기 권한 보유 활성 사용자 중 자금 본부 거르개를 지난 사람.
export async function fundScopedWriters(menu: FundScopedMenu, today: string, tx?: NotifyTx): Promise<string[]> {
  return keepFundHands(await listMenuWriterIds(SYSTEM_VIEWER, menu, today, tx), today, tx);
}

// can()의 자금 게이트와 같은 판정(D-7313 · D-7310 · D-7311) — 계급이 회사 전체이거나, 자금 본부가 있고 소속 본부가 그 본부.
// can()은 전역 풀로 읽어 tick 잠금 tx 안에서 부르지 않는다 — 같은 tx로 차례로 읽는다.
async function keepFundHands(ids: readonly string[], today: string, tx?: NotifyTx): Promise<string[]> {
  if (ids.length === 0) return [];
  const fund = await readFundDivision(SYSTEM_VIEWER, tx);
  const snapshot = await listOrgSnapshot(SYSTEM_VIEWER, today, tx);
  const companyRoles = new Set(await listCompanyScopeRoleIds(SYSTEM_VIEWER, tx));
  const people = new Map(snapshot.map((person) => [person.id, person]));
  return ids.filter((id) => {
    const person = people.get(id);
    if (!person) return false;
    return (person.roleId !== null && companyRoles.has(person.roleId)) || (fund !== null && person.orgUnitId === fund.id);
  });
}

// D-748: 규칙의 받는 계급 추가 — 후보마다 (대상, 대상 id, 회차) 묶음에 그 계급의 회사 전체 활성 사용자를 더한다(같은 사람은 한 번).
// 팀 · 본부 범위 없음. 계급 사용자는 tick마다 한 번 읽어(roleUsers) 넘긴다.
export function loadRoleUsers(roleIds: readonly string[], today: string, tx?: NotifyTx): Promise<Map<string, string[]>> {
  return listActiveUserIdsByRoles(SYSTEM_VIEWER, roleIds, today, tx);
}

export function withExtraRoleRecipients<Candidate extends { entity: string; entityId: string; round: number; recipientId: string; recipientRoleId?: string | null }>(
  produced: readonly Candidate[],
  extraRoleIds: readonly string[],
  roleUsers: ReadonlyMap<string, readonly string[]>,
): Candidate[] {
  if (extraRoleIds.length === 0 || produced.length === 0) return [...produced];
  // 07-22(G-61) — 계급 사용자 후보는 그 계급을 싣는다(tick의 정보 항목 거르개가 읽는다).
  const extras = extraRoleIds.flatMap((roleId) => (roleUsers.get(roleId) ?? []).map((recipientId) => ({ recipientId, roleId })));
  const result = [...produced];
  const seen = new Set(produced.map((c) => JSON.stringify([c.entity, c.entityId, c.round, c.recipientId])));
  const templates = new Map(produced.map((c) => [JSON.stringify([c.entity, c.entityId, c.round]), c]));
  for (const template of templates.values()) {
    for (const { recipientId, roleId } of extras) {
      const key = JSON.stringify([template.entity, template.entityId, template.round, recipientId]);
      if (seen.has(key)) continue;
      seen.add(key);
      result.push({ ...template, recipientId, recipientRoleId: roleId });
    }
  }
  return result;
}

// AQ-04: 2회차부터 더하는 팀장 = 그 문서 결재 경로의 팀장 단계 보유자(지금 조직으로 푼다).
export function teamLeadsOfRoute(steps: readonly RouteStepRef[], snapshot: readonly SnapshotPerson[]): string[] {
  const ids = steps
    .filter((step) => step.roleId === TEAM_LEAD_ROLE_ID && !step.isFallback)
    .flatMap((step) => resolveHolders({ roleId: step.roleId, scopeKind: step.scopeKind as ScopeKind, scopeTargetId: step.scopeTargetId }, [...snapshot]).map((person) => person.id));
  return [...new Set(ids)];
}

// AQ-04: 지출결의가 아닌 대상(프로젝트)은 받는 사람 소속 팀의 팀장.
export function teamLeadsOfRecipientTeam(recipientId: string, snapshot: readonly SnapshotPerson[]): string[] {
  const teamId = snapshot.find((person) => person.id === recipientId)?.teamId ?? null;
  if (teamId === null) return [];
  return snapshot.filter((person) => person.roleId === TEAM_LEAD_ROLE_ID && person.teamId === teamId).map((person) => person.id);
}
