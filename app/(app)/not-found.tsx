import { ListEmpty } from "@/ui/list-empty/ListEmpty";
import { PageHeader } from "@/ui/page-header/PageHeader";

// SYSTEM.md §6-9 오류 페이지 — 404(C①) 변종, 로그인한 사람이 보는 404다(C②:
// 셸 안). 관리자 전용 화면의 접근 제어(D-17)가 던지는 notFound()도 이 파일로
// 온다 — app/(app)/layout.tsx가 이미 Shell로 감싸고 있어 상단 바·하단 탭이
// 유지된다. 프레임워크 기본 404 화면 대신 tokens.css 토큰 안에서 렌더된다.
export default function NotFound() {
  return (
    <>
      <PageHeader title="페이지 찾을 수 없음" titleSize="2xl" />
      <ListEmpty
        message="페이지 없음 또는 이동됨"
        action={{ label: "첫 화면으로", href: "/" }}
        tone="error"
      />
    </>
  );
}
