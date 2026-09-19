import { ListEmpty } from "@/ui/list-empty/ListEmpty";

// SYSTEM.md §6-1 목록 화면 = 원장. 표는 Phase 4 범위(02-01 DECISIONS.md 기록).
export default function CardsPage() {
  return (
    <>
      <h1>법인카드</h1>
      <p>카드 사용 등록 내역</p>
      <ListEmpty message="등록된 법인카드 사용 내역이 없습니다" action={{ label: "결재함 보기", href: "/approvals" }} />
    </>
  );
}
