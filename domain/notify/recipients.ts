// 알림 받는 사람 해석 — 경영관리 · 계급 추가(D-748) · 팀장. 읽기는 repositories/notify-sources.ts.
import { resolveHolders, type ScopeKind, type SnapshotPerson } from "@/domain/approvals/route";
import { TEAM_LEAD_ROLE_ID } from "@/domain/permissions/roles";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { listActiveUserIdsByRoles, listPaymentManagerIds } from "@/repositories/notify-sources";
import type { RouteStepRef } from "@/repositories/notify-sources";
import type { NotifyTx } from "@/repositories/notifications";

// D-702: 경영관리 = 지급 처리 쓰기 권한 보유 활성 사용자.
export function paymentManagers(today: string, tx?: NotifyTx): Promise<string[]> {
  return listPaymentManagerIds(SYSTEM_VIEWER, today, tx);
}

// D-748: 규칙의 받는 계급 추가 — 후보마다 (대상, 대상 id, 회차) 묶음에 그 계급의 회사 전체 활성 사용자를 더한다(같은 사람은 한 번).
// 팀 · 본부 범위 없음. 계급 사용자는 tick마다 한 번 읽어(roleUsers) 넘긴다.
export function loadRoleUsers(roleIds: readonly string[], today: string, tx?: NotifyTx): Promise<Map<string, string[]>> {
  return listActiveUserIdsByRoles(SYSTEM_VIEWER, roleIds, today, tx);
}

export function withExtraRoleRecipients<Candidate extends { entity: string; entityId: string; round: number; recipientId: string }>(
  produced: readonly Candidate[],
  extraRoleIds: readonly string[],
  roleUsers: ReadonlyMap<string, readonly string[]>,
): Candidate[] {
  if (extraRoleIds.length === 0 || produced.length === 0) return [...produced];
  const extraIds = [...new Set(extraRoleIds.flatMap((roleId) => roleUsers.get(roleId) ?? []))];
  const result = [...produced];
  const seen = new Set(produced.map((c) => JSON.stringify([c.entity, c.entityId, c.round, c.recipientId])));
  const templates = new Map(produced.map((c) => [JSON.stringify([c.entity, c.entityId, c.round]), c]));
  for (const template of templates.values()) {
    for (const recipientId of extraIds) {
      const key = JSON.stringify([template.entity, template.entityId, template.round, recipientId]);
      if (seen.has(key)) continue;
      seen.add(key);
      result.push({ ...template, recipientId });
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
