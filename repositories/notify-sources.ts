import { and, eq, gte, isNull, or } from "drizzle-orm";
import { db, type DbOrTx } from "@/db/client";
import { permissionMatrix, roles, users } from "@/db/schema";
import type { Viewer } from "@/domain/viewer";

// 07-10 C-P2-3: 알림 종류가 쓰는 읽기 한 곳 — 종류 판정 쿼리 · 권한 보유자 · 계급 사용자. 결재 · 지급 저장소는 고치지 않고(읽기 import만)
// 여기서 새 읽기를 둔다. viewer는 감사용 자리(SYSTEM_VIEWER)이고, 마지막 인자 tx가 있으면 tick 잠금 연결로 읽는다(R8).

// 활성 사용자 = 보관되지 않았고 퇴직일이 오늘 이후(당일까지 후보)인 사람 — 결재 조직 스냅숏(repositories/org-snapshot.ts)과 같은 판정.
function activeUser(today: string) {
  return and(isNull(users.archivedAt), or(isNull(users.resignationDate), gte(users.resignationDate, today)));
}

// 경영관리 = 지급 처리(expenses.payments) 쓰기 권한을 가진 계급의 활성 사용자(D-702) — 시드 계급이 아니라 권한표로 해석한다.
export async function listPaymentManagerIds(viewer: Viewer, today: string, tx: DbOrTx = db): Promise<string[]> {
  void viewer;
  const rows = await tx
    .select({ id: users.id })
    .from(users)
    .innerJoin(roles, and(eq(roles.id, users.roleId), isNull(roles.archivedAt)))
    .innerJoin(
      permissionMatrix,
      and(
        eq(permissionMatrix.roleId, roles.id),
        eq(permissionMatrix.menu, "expenses.payments"),
        eq(permissionMatrix.action, "write"),
        eq(permissionMatrix.allowed, true),
      ),
    )
    .where(activeUser(today))
    .groupBy(users.id)
    .orderBy(users.id);
  return rows.map((row) => row.id);
}
