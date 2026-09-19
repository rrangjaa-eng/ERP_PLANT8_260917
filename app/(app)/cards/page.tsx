import { ListEmpty } from "@/ui/list-empty/ListEmpty";
import { PageHeader } from "@/ui/page-header/PageHeader";

// SYSTEM.md §6-1 목록 화면 = 원장. 표는 Phase 4 범위(02-01 DECISIONS.md 기록).
export default function CardsPage() {
  return (
    <>
      <PageHeader title="법인카드" subtitle="카드 사용 등록 내역" />
      <ListEmpty message="등록된 법인카드 사용 내역이 없습니다" action={{ label: "결재함 보기", href: "/approvals" }} />
    </>
  );
}
