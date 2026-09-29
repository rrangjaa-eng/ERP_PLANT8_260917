import { notFound } from "next/navigation";
import { requireSession } from "@/lib/viewer";
import { can } from "@/domain/permissions/can";
import { visible } from "@/domain/permissions/visible";
import { listReserveReferences, listReserves } from "@/domain/reserves";
import { recentFxRate } from "@/domain/money/currency";
import { kstToday } from "@/lib/kst-date";
import { ReservesTable } from "./reserves-table";

// 04-42 — 클라이언트별 리저브 대장(S9, §6-1 + §7-3). WR-07: 이 페이지가 직접 판정한다(레이아웃에 기대지 않는다).
// CEO 리뷰 B-15 · T-04-41 — `pnl` 보기와 `reserve.amount` 노출이 둘 다 있을 때만 존재한다. 하나라도 없으면 찾을 수
// 없음이다 — 행·그룹·건수를 가린 채 렌더하는 부분 노출이 없다.
export const dynamic = "force-dynamic";

export default async function ReservesPage({ searchParams }: { searchParams: Promise<{ page?: string | string[] }> }) {
  const { viewer } = await requireSession();
  const [canViewPnl, reserveShown] = await Promise.all([can(viewer, "pnl", "view"), visible(viewer, "reserve.amount")]);
  if (!canViewPnl || !reserveShown) notFound();

  const { page } = await searchParams;
  const [list, references, usdDefaultFxRate] = await Promise.all([
    listReserves(viewer, { page: Array.isArray(page) ? page[0] : page }),
    listReserveReferences(viewer),
    recentFxRate("USD"),
  ]);

  return <ReservesTable viewerId={viewer.id} list={list} references={references} usdDefaultFxRate={usdDefaultFxRate} todayKst={kstToday(new Date())} />;
}
