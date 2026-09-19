import { ListEmpty } from "@/ui/list-empty/ListEmpty";

// SYSTEM.md §6-9 오류 페이지 — 404(C①) 변종. 존재하지 않는 URL은 로그인 여부를
// 모르는 상태이므로 셸 밖에서 렌더된다(C②) — (app) 라우트 그룹에 속하지 않는
// 불일치 URL은 이 루트 not-found로 떨어진다(Next.js 16 not-found.js 파일 규약).
// 프레임워크 기본 404 화면 대신 tokens.css 토큰 안에서 렌더된다.
export default function NotFound() {
  return (
    <main>
      <h1>페이지를 찾을 수 없습니다</h1>
      <ListEmpty
        message="이 페이지가 없거나 옮겨졌습니다"
        action={{ label: "첫 화면으로", href: "/" }}
        tone="error"
      />
    </main>
  );
}
