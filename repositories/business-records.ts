import { and, isNotNull, lt } from "drizzle-orm";
import { db } from "@/db/client";
import { leaveAdjustments, leaveRequests, quoteRevisions, reserveEntries, revenueEntries } from "@/db/schema";
import type { Viewer } from "@/domain/viewer";

// quick 261001-85g(ADMN-06, 사용자 결정 2026-10-01): 설정 가져오기의 「빈 새 환경」 판정 재료 — 그 해(서울) 전의
// 업무 기록이 한 건이라도 있으면 실제로 운영된 환경이다. 이력형 설정(연차 일수 · 세율)의 지난 연도 값은 그 기록의
// 잔고 · 세액을 다시 계산하게 하므로 소급을 막는다. 연차 신청 · 조정은 회계연도로, 매출 · 리저브는 날짜로,
// 견적 고객 승인은 서울 1월 1일 0시(UTC 전년 12월 31일 15시) 전 시각으로 본다.
export async function hasBusinessRecordsBefore(viewer: Viewer, year: number): Promise<boolean> {
  void viewer;
  const yearStart = `${year}-01-01`;
  const yearStartInstant = new Date(Date.UTC(year - 1, 11, 31, 15));
  const probes = [
    db.select({ id: leaveRequests.id }).from(leaveRequests).where(lt(leaveRequests.fiscalYear, year)).limit(1),
    db.select({ id: leaveAdjustments.id }).from(leaveAdjustments).where(lt(leaveAdjustments.fiscalYear, year)).limit(1),
    db.select({ id: revenueEntries.id }).from(revenueEntries).where(lt(revenueEntries.entryDate, yearStart)).limit(1),
    db.select({ id: reserveEntries.id }).from(reserveEntries).where(lt(reserveEntries.entryDate, yearStart)).limit(1),
    db
      .select({ id: quoteRevisions.id })
      .from(quoteRevisions)
      .where(and(isNotNull(quoteRevisions.customerApprovedAt), lt(quoteRevisions.customerApprovedAt, yearStartInstant)))
      .limit(1),
  ];
  for (const probe of probes) {
    if ((await probe).length > 0) return true;
  }
  return false;
}
