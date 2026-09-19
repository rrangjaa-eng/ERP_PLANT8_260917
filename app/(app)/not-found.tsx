import { ListEmpty } from "@/ui/list-empty/ListEmpty";

// SYSTEM.md §6-9 오류 페이지 — 404(C①) 변종, 로그인한 사람이 보는 404다(C②:
// 셸 안). 관리자 전용 화면의 접근 제어(D-17)가 던지는 notFound()도 이 파일로
// 온다 — app/(app)/layout.tsx가 이미 Shell로 감싸고 있어 상단 바·하단 탭이
// 유지된다. 프레임워크 기본 404 화면 대신 tokens.css 토큰 안에서 렌더된다.
export default function NotFound() {
  return (
    <>
      <h1>페이지를 찾을 수 없습니다</h1>
      <ListEmpty
        message="이 페이지가 없거나 옮겨졌습니다"
        action={{ label: "첫 화면으로", href: "/" }}
        tone="error"
      />
    </>
  );
}
