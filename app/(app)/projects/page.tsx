import { requireSession } from "@/lib/viewer";
import { ListEmpty } from "@/ui/list-empty/ListEmpty";
import { PageHeader } from "@/ui/page-header/PageHeader";

// SYSTEM.md §6-1 목록 화면 = 원장. 이 페이즈는 표(§7-3, Phase 4 범위)를 만들지
// 않고 EMPTY 한 줄만 둔다(02-01 DECISIONS.md에 기록된 의도적 이탈). 화면 제목 +
// 부제가 위치를 말한다 — 브레드크럼 없음.
// WR-07: 인증 검사를 이 페이지가 직접 한다. 레이아웃의 requireSession()에
// 기대지 않는다 — 레이아웃은 이동할 때 재렌더되지 않고 라우트 세그먼트는
// 그와 무관하게 RSC 페이로드에 들어간다(next/dist/docs 01-app/02-guides/
// authentication.md). Phase 4가 이 라우트에 원장 데이터를 올린다.
export default async function ProjectsPage() {
  await requireSession();

  return (
    <>
      <PageHeader title="프로젝트" subtitle="진행 중인 프로젝트 원장" />
      <ListEmpty message="등록된 프로젝트가 없습니다" action={{ label: "지출결의 보기", href: "/expenses" }} />
    </>
  );
}
