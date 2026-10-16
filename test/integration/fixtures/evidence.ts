import { randomUUID } from "node:crypto";
import { createAccount } from "@/domain/auth/accounts";
import { registerEvidenceFile, type EvidenceImportSuccess, type RegisterEvidenceDeps } from "@/domain/evidence-import";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { insertRole } from "@/repositories/roles";

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
