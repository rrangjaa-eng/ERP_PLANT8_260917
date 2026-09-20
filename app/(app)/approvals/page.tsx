import { requireSession } from "@/lib/viewer";
import { ListEmpty } from "@/ui/list-empty/ListEmpty";
import { PageHeader } from "@/ui/page-header/PageHeader";

// SYSTEM.md §6-1 목록 화면 = 원장. 표는 Phase 4 범위(02-01 DECISIONS.md 기록).
// WR-07: 인증 검사를 이 페이지가 직접 한다. 레이아웃의 requireSession()에
// 기대지 않는다 — 레이아웃은 이동할 때 재렌더되지 않고 라우트 세그먼트는
// 그와 무관하게 RSC 페이로드에 들어간다(next/dist/docs 01-app/02-guides/
// authentication.md). Phase 4가 이 라우트에 원장 데이터를 올린다.
export default async function ApprovalsPage() {
  await requireSession();

  return (
    <>
      <PageHeader title="결재" subtitle="내가 처리할 결재 문서" />
      <ListEmpty message="결재할 문서가 없습니다" action={{ label: "손익 보기", href: "/pnl" }} />
    </>
  );
}
