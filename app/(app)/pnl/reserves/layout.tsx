import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/viewer";
import { can } from "@/domain/permissions/can";
import { visible } from "@/domain/permissions/visible";

// 04-42(B-15 · T-04-41) — loading.tsx가 페이지를 Suspense로 감싸 스트리밍하면 페이지 안의 notFound()는 이미 200으로 나간
// 응답 안에서 찾을 수 없음 화면만 그린다. 같은 두 조건을 스트리밍 앞(레이아웃)에서 한 번 더 판정해 상태 코드를 404로 둔다.
// 페이지도 스스로 판정한다(WR-07 — 레이아웃은 클라이언트 이동에서 다시 렌더되지 않는다).
export default async function ReservesLayout({ children }: { children: ReactNode }) {
  const { viewer } = await requireSession();
  const [canViewPnl, reserveShown] = await Promise.all([can(viewer, "pnl", "view"), visible(viewer, "reserve.amount")]);
  if (!canViewPnl || !reserveShown) notFound();
  return children;
}
