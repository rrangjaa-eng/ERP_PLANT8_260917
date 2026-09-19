import { ListEmpty } from "@/ui/list-empty/ListEmpty";

// SYSTEM.md §6-1 목록 화면 = 원장. 표는 Phase 4 범위(02-01 DECISIONS.md 기록).
export default function ApprovalsPage() {
  return (
    <>
      <h1>결재</h1>
      <p>내가 처리할 결재 문서</p>
      <ListEmpty message="결재할 문서가 없습니다" action={{ label: "손익 보기", href: "/pnl" }} />
    </>
  );
}
