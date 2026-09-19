import { ListEmpty } from "@/ui/list-empty/ListEmpty";
import { PageHeader } from "@/ui/page-header/PageHeader";

// SYSTEM.md §6-1 목록 화면 = 원장. 표는 Phase 4 범위(02-01 DECISIONS.md 기록).
export default function ExpensesPage() {
  return (
    <>
      <PageHeader title="지출결의" subtitle="지급요청·결재 진행 현황" />
      <ListEmpty message="등록된 지출결의가 없습니다" action={{ label: "법인카드 보기", href: "/cards" }} />
    </>
  );
}
