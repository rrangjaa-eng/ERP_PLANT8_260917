import { ListEmpty } from "@/ui/list-empty/ListEmpty";

// 02-01 체크포인트 항목 H①: 「설정」은 실제 라우트다(role-menu.ts의 accountGroup
// 「계정」 그룹이 가리키는 자리, SYSTEM.md §6-0/§7-8). 표는 Phase 4 범위, 설정
// 항목 관리 화면 자체는 이후 페이즈(Phase 3 설정 레지스트리 등) 범위다.
export default function SettingsPage() {
  return (
    <>
      <h1>설정</h1>
      <p>운영 설정</p>
      <ListEmpty message="설정할 항목이 없습니다" action={{ label: "내 정보 보기", href: "/account" }} />
    </>
  );
}
