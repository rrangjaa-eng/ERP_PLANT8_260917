import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { evidenceRecordLinks, evidenceRecords } from "@/db/schema";
import { createAccount } from "@/domain/auth/accounts";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { registerEvidenceFile, type EvidenceImportSuccess, type RegisterEvidenceDeps } from "@/domain/evidence-import";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { seoulToday } from "@/lib/dates";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { insertRole } from "@/repositories/roles";
import { insertMembership } from "@/repositories/team-memberships";

// 06.1-04: 증빙 등록 권한 계급 · 등록 도우미 — 06.1-05 · 06 · 09 · 11이 다시 쓴다.
// 계급은 새로 만든다 — 시드 계급의 권한을 바꾸면 누수 스캔 · 권한표 단언이 흔들린다(시드는 어느 계급에도 등록을 켜지 않는다).
export async function createIntakeViewer(): Promise<Viewer> {
  const roleId = `role-evidence-intake-${randomUUID().slice(0, 8)}`;
  await insertRole(SYSTEM_VIEWER, { id: roleId, name: `증빙 등록 ${roleId.slice(-8)}` });
  await upsertPermission(SYSTEM_VIEWER, { roleId, menu: "evidence.intake", action: "write", allowed: true });
  await upsertPermission(SYSTEM_VIEWER, { roleId, menu: "evidence", action: "view", allowed: true });
  await upsertVisibility(SYSTEM_VIEWER, { roleId, infoItem: "evidence.value", visible: true });
  await upsertVisibility(SYSTEM_VIEWER, { roleId, infoItem: "evidence.amount", visible: true });
  const { userId } = await createAccount(SYSTEM_VIEWER, { email: `intake-${randomUUID()}@example.test`, name: "증빙 등록자", roleId });
  return { id: userId, roleId };
}

// 픽스처 바이트 하나를 등록한다. 거절이면 던진다 — 거절 자체를 보는 테스트는 registerEvidenceFile을 바로 부른다.
export async function registerFixtureFile(
  viewer: Viewer,
  bytes: Uint8Array,
  name = "증빙.xls",
  deps?: Partial<RegisterEvidenceDeps>,
): Promise<EvidenceImportSuccess> {
  const result = await registerEvidenceFile(viewer, { bytes, fileName: name }, deps);
  if (result.refused) throw new Error(`등록 거절 — ${result.refused.headline}`);
  return result;
}

// 06.1-05: 행 범위 · 필터 실측용 — 화면 · 도메인 경로가 아직 없는 상태(붙임 · 보관 · 종류 바꾸기)를 표에 직접 만든다. 테스트 전용이다.

/** 공개 범위를 저장한 줄로 만든다 — `visibility_saved_at`도 찍는다(C1 — 저장한 줄은 다시 제안되지 않는다). */
export async function setRecordVisibilityFixture(
  id: string,
  target: { visibility: "private" } | { visibility: "team"; teamId: string } | { visibility: "division"; orgUnitId: string },
): Promise<void> {
  await db
    .update(evidenceRecords)
    .set({
      visibility: target.visibility,
      visibleTeamId: target.visibility === "team" ? target.teamId : null,
      visibleOrgUnitId: target.visibility === "division" ? target.orgUnitId : null,
      visibilitySavedAt: sql`now()`,
    })
    .where(eq(evidenceRecords.id, id));
}

/** 살아 있는 붙임 한 줄(`detached_at IS NULL`) — 06.1-06 전이라 붙이기 경로가 없다. 문서 id는 아무 값(외래 키 없음). */
export async function insertLiveLinkFixture(recordId: string, attachedBy: string): Promise<void> {
  await db.insert(evidenceRecordLinks).values({ evidenceRecordId: recordId, ownerKind: "expense", ownerId: randomUUID(), attachMode: "registrar", attachedBy });
}

/** 보관한 줄(C2 — `archived_at` · `archived_by` 짝). */
export async function setRecordArchivedFixture(id: string, archivedBy: string): Promise<void> {
  await db.update(evidenceRecords).set({ archivedAt: sql`now()`, archivedBy }).where(eq(evidenceRecords.id, id));
}

/** 줄의 증빙 종류를 바꾼다 — G15(「올린 사람 · 경영관리만」 종류) 줄을 만든다. */
export async function setRecordTypeFixture(id: string, evidenceType: string): Promise<void> {
  await db.update(evidenceRecords).set({ evidenceType }).where(eq(evidenceRecords.id, id));
}

/** 기획 PM(시드 계급 role-pm — 06.1-01 시드가 `evidence` 보기를 준다). 팀을 주면 그 날짜(기본 오늘)부터 그 팀 발령. */
export async function createPmInTeam(teamId: string | null, effectiveFrom?: string): Promise<Viewer> {
  const { userId } = await createAccount(SYSTEM_VIEWER, { email: `evidence-pm-${randomUUID()}@example.test`, name: "증빙 PM", roleId: DEFAULT_ROLE_ID });
  if (teamId !== null) await insertMembership(SYSTEM_VIEWER, { userId, teamId, effectiveFrom: effectiveFrom ?? seoulToday() });
  return { id: userId, roleId: DEFAULT_ROLE_ID };
}
