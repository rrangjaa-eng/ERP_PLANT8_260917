import { ListEmpty } from "@/ui/list-empty/ListEmpty";
import { PageHeader } from "@/ui/page-header/PageHeader";

// SYSTEM.md §6-9 오류 페이지 — 404(C①) 변종. 존재하지 않는 URL은 로그인 여부를
// 모르는 상태이므로 셸 밖에서 렌더된다(C②) — (app) 라우트 그룹에 속하지 않는
// 불일치 URL은 이 루트 not-found로 떨어진다(Next.js 16 not-found.js 파일 규약).
// 프레임워크 기본 404 화면 대신 tokens.css 토큰 안에서 렌더된다. 이 파일은 (app)
// 그룹 밖이라 Shell.tsx의 <main>이 없다 — 여기 <main>은 유일한 main이다(중첩 아님).
export default function NotFound() {
  return (
    <main>
      <PageHeader title="페이지를 찾을 수 없습니다" titleSize="2xl" />
      <ListEmpty
        message="이 페이지가 없거나 옮겨졌습니다"
        action={{ label: "첫 화면으로", href: "/" }}
        tone="error"
      />
    </main>
  );
}
