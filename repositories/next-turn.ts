import { and, asc, eq, isNull, min } from "drizzle-orm";
import { db } from "@/db/client";
import { projects, purchaseRequests } from "@/db/schema";
import type { RowScope } from "@/domain/permissions/scope-for";
import type { Viewer } from "@/domain/viewer";
import { rowScopeCondition } from "@/repositories/row-scope";

// 06-23(S19 · UA-611): 「내 차례」 Phase 6 원천 중 기존 목록 함수가 없는 둘.

export type SettlingProjectOfPm = { id: string; number: string; name: string };

// 보는 사람이 담당 PM인 정산(settling) 프로젝트 — 완료 전 점검 항목의 원천. 번호 · 이름 · id만 싣는다(보관 제외).
// 행 범위도 AND로 건다 — 계급에 프로젝트 보기가 없으면(none) PM이라도 0행(06-23 검토 낮음-1).
export async function listSettlingProjectsOfPm(viewer: Viewer, scope: RowScope, pmUserId: string): Promise<SettlingProjectOfPm[]> {
  return db
    .select({ id: projects.id, number: projects.number, name: projects.name })
    .from(projects)
    .where(
      and(
        eq(projects.pmUserId, pmUserId),
        eq(projects.status, "settling"),
        isNull(projects.archivedAt),
        rowScopeCondition(viewer, scope, { projectId: projects.id, teamId: projects.teamId, pmUserId: projects.pmUserId }),
      ),
    )
    .orderBy(asc(projects.number));
}

// E-54 · PN-8: `신청됨` 구매 요청의 가장 이른 등록 시각(한 줄 집계 — purchase_requests_status_created_idx). 없으면 null.
// 묶음은 구매 권한자(06-08 범위 = 전부)에게만 서므로 범위 조건 없이 status 전체다.
export async function findOldestRequestedPurchaseAt(viewer: Viewer): Promise<Date | null> {
  void viewer;
  const [row] = await db.select({ oldest: min(purchaseRequests.createdAt) }).from(purchaseRequests).where(eq(purchaseRequests.status, "requested"));
  return row?.oldest ?? null;
}
