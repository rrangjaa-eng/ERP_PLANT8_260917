import { ListEmpty } from "@/ui/list-empty/ListEmpty";
import { PageHeader } from "@/ui/page-header/PageHeader";

// SYSTEM.md §6-1 목록 화면 = 원장. 표는 Phase 4 범위(02-01 DECISIONS.md 기록).
export default function PnlPage() {
  return (
    <>
      <PageHeader title="손익" subtitle="프로젝트·팀 손익 원장" />
      <ListEmpty message="표시할 손익 데이터가 없습니다" action={{ label: "프로젝트 보기", href: "/projects" }} />
    </>
  );
}
