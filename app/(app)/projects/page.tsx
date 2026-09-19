import { ListEmpty } from "@/ui/list-empty/ListEmpty";

// SYSTEM.md §6-1 목록 화면 = 원장. 이 페이즈는 표(§7-3, Phase 4 범위)를 만들지
// 않고 EMPTY 한 줄만 둔다(02-01 DECISIONS.md에 기록된 의도적 이탈). 화면 제목 +
// 부제가 위치를 말한다 — 브레드크럼 없음.
export default function ProjectsPage() {
  return (
    <>
      <h1>프로젝트</h1>
      <p>진행 중인 프로젝트 원장</p>
      <ListEmpty message="등록된 프로젝트가 없습니다" action={{ label: "지출결의 보기", href: "/expenses" }} />
    </>
  );
}
