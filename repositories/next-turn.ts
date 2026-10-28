import { and, asc, count, eq, isNull, min, not } from "drizzle-orm";
import { db } from "@/db/client";
import { corpCardUsages, projects, purchaseRequests } from "@/db/schema";
import type { RowScope } from "@/domain/permissions/scope-for";
import type { Viewer } from "@/domain/viewer";
import { aliveFileExists } from "@/repositories/files";
import { liveLinkExists } from "@/repositories/evidence-record-links";
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

// 07.1-17(PD1 · C-01): 전표 대기 = 구매 완료 요청에 딸린 카드 사용 중 살아 있는 전표 파일도 살아 있는 증빙 붙임도 없는 것 — 카드 목록 `증빙` 열(`hasCardSlip`)과 같은 두 조건 함수를 그대로 부른다.
// 대상 집합도 카드 목록(`listCardUsageRows` — `isNull(corpCardUsages.archivedAt)`)과 같다: 보관된 카드 사용은 세지 않는다.
// 구매 요청에는 보관 열이 없다(취소는 상태) — `purchased`만 센다. 한 줄 집계(건수 · 가장 이른 구매 완료 시각). 범위: 구매 권한자 = 전부(호출부가 권한을 먼저 본다).
export async function findCardSlipWaiting(viewer: Viewer): Promise<{ count: number; oldestCompletedAt: Date | null }> {
  const [row] = await db
    .select({ count: count(), oldest: min(purchaseRequests.completedAt) })
    .from(purchaseRequests)
    .innerJoin(corpCardUsages, eq(corpCardUsages.purchaseRequestId, purchaseRequests.id))
    .where(
      and(
        eq(purchaseRequests.status, "purchased"),
        isNull(corpCardUsages.archivedAt),
        not(aliveFileExists(viewer, "corp_card_usage", corpCardUsages.id)),
        not(liveLinkExists(viewer, "corp_card_usage", corpCardUsages.id)),
      ),
    );
  return { count: row?.count ?? 0, oldestCompletedAt: row?.oldest ?? null };
}
