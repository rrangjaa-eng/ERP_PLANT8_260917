import { and, asc, eq, isNull, min } from "drizzle-orm";
import { db } from "@/db/client";
import { projects, purchaseRequests } from "@/db/schema";
import type { Viewer } from "@/domain/viewer";

// 06-23(S19 · UA-611): 「내 차례」 Phase 6 원천 중 기존 목록 함수가 없는 둘.

export type SettlingProjectOfPm = { id: string; number: string; name: string };

// 보는 사람이 담당 PM인 정산(settling) 프로젝트 — 완료 전 점검 항목의 원천. 번호 · 이름 · id만 싣는다(보관 제외).
export async function listSettlingProjectsOfPm(viewer: Viewer, pmUserId: string): Promise<SettlingProjectOfPm[]> {
  void viewer;
  return db
    .select({ id: projects.id, number: projects.number, name: projects.name })
    .from(projects)
    .where(and(eq(projects.pmUserId, pmUserId), eq(projects.status, "settling"), isNull(projects.archivedAt)))
    .orderBy(asc(projects.number));
}

// E-54 · PN-8: `신청됨` 구매 요청의 가장 이른 등록 시각(한 줄 집계 — purchase_requests_status_created_idx). 없으면 null.
// 묶음은 구매 권한자(06-08 범위 = 전부)에게만 서므로 범위 조건 없이 status 전체다.
export async function findOldestRequestedPurchaseAt(viewer: Viewer): Promise<Date | null> {
  void viewer;
  const [row] = await db.select({ oldest: min(purchaseRequests.createdAt) }).from(purchaseRequests).where(eq(purchaseRequests.status, "requested"));
  return row?.oldest ?? null;
}
