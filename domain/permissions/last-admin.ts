import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { UserFacingError } from "@/lib/actions/user-facing-error";
import type { DbOrTx } from "@/repositories/document-counters";
import { findPermission } from "@/repositories/permissions";
import { countActiveAdmins } from "@/repositories/users";

// 06.4(D-6403 · D-6412): 지킬 대상은 재직 관리자(퇴직일 당일까지), 남은 쪽은 퇴직일 없는 재직 관리자만 센다 — 남은 쪽이
// 0명이 되는 쓰기를 막는다. 호출자는 같은 tx에서 `lockSeatKeys(…, { admin: true })`(또는 사람 키 뒤 관리자 키)를 먼저
// 잡는다 — 잠금 뒤 재조회라 동시 두 저장이 둘 다 지나지 않는다. SYSTEM_VIEWER(CLI · 훅 · 보상 보관)는 관리자 수와 무관한
// 주체라 면제(O4, 선례 roles.ts:82-86). 260907은 같은 판정을 직책 코드 하나로 했다(`O: server/src/people.ts:733-742`).

export class LastAdminError extends UserFacingError {}

export const LAST_ADMIN_MESSAGE = "마지막 관리자 · 관리자 먼저 지정";

export async function assertNotLastAdmin(
  viewer: Viewer,
  input: { userId: string; asOf: string; nextRoleId?: string | null },
  tx: DbOrTx,
): Promise<void> {
  if (viewer.id === SYSTEM_VIEWER.id) return;
  if ((await countActiveAdmins(viewer, { asOf: input.asOf, onlyUserId: input.userId }, tx)) === 0) return;
  if (input.nextRoleId) {
    const next = await findPermission(viewer, input.nextRoleId, "admin.permissions", "write", tx);
    if (next?.allowed === true) return;
  }
  const remaining = await countActiveAdmins(
    viewer,
    { asOf: input.asOf, excludeUserId: input.userId, unscheduledOnly: true },
    tx,
  );
  if (remaining === 0) throw new LastAdminError(LAST_ADMIN_MESSAGE);
}

export async function assertAdminRoleRemains(
  viewer: Viewer,
  input: { roleId: string; asOf: string },
  tx: DbOrTx,
): Promise<void> {
  if (viewer.id === SYSTEM_VIEWER.id) return;
  const remaining = await countActiveAdmins(
    viewer,
    { asOf: input.asOf, excludeRoleId: input.roleId, unscheduledOnly: true },
    tx,
  );
  if (remaining === 0) throw new LastAdminError(LAST_ADMIN_MESSAGE);
}
