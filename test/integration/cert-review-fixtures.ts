import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { actionLog, certSubmissions } from "@/db/schema";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { createAccount } from "@/domain/auth/accounts";
import { insertRole } from "@/repositories/roles";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { decrypt } from "@/lib/crypto";

// 04.3-07 — cert-crypto · cert-review 통합 테스트 공용(`*.test.ts`가 아니라 수집되지 않는다).
// 권한은 시드 기본값이 아니라 테스트 계급에 직접 켠다(E3-13).

export type CertReviewGrant = { view?: boolean; write?: boolean; value?: boolean; unmasked?: boolean };

export async function grantCertReview(roleId: string, grant: CertReviewGrant): Promise<void> {
  await upsertPermission(SYSTEM_VIEWER, { roleId, menu: "certs.submissions", action: "view", allowed: grant.view ?? false });
  await upsertPermission(SYSTEM_VIEWER, { roleId, menu: "certs.submissions", action: "write", allowed: grant.write ?? false });
  await upsertVisibility(SYSTEM_VIEWER, { roleId, infoItem: "cert_submission.value", visible: grant.value ?? false });
  await upsertVisibility(SYSTEM_VIEWER, { roleId, infoItem: "cert.rrn_unmasked", visible: grant.unmasked ?? false });
}

export async function makeUser(roleId: string, name = "통합 경영관리"): Promise<Viewer> {
  const { userId } = await createAccount(SYSTEM_VIEWER, { email: `cert-review-${randomUUID()}@example.test`, name, roleId });
  return { id: userId, roleId };
}

// 테스트 계급 하나 + 그 계급의 사용자 하나.
export async function makeReviewer(grant: CertReviewGrant, name?: string): Promise<Viewer> {
  const roleId = `role-cert-review-${randomUUID()}`;
  await insertRole(SYSTEM_VIEWER, { id: roleId, name: `통합 ${roleId.slice(-8)}`, sortOrder: 99 });
  await grantCertReview(roleId, grant);
  return makeUser(roleId, name);
}

export const FULL_GRANT: CertReviewGrant = { view: true, write: true, value: true, unmasked: true };

export async function countLogs(actionType: string, entityId: string): Promise<number> {
  const rows = await db.select().from(actionLog).where(eq(actionLog.actionType, actionType));
  return rows.filter((row) => row.entityId === entityId).length;
}

export async function submissionRow(id: string) {
  const [row] = await db.select().from(certSubmissions).where(eq(certSubmissions.id, id)).limit(1);
  if (!row) throw new Error("제출 행 없음");
  return row;
}

export function decryptSpy(): { fn: (value: string) => string; calls: number } {
  const spy = {
    calls: 0,
    fn: (value: string): string => {
      spy.calls += 1;
      return decrypt(value);
    },
  };
  return spy;
}
