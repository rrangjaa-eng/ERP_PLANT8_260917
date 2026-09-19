import { redirect } from "next/navigation";
import { getSession } from "@/lib/viewer";
import { buildNextTurnView } from "@/ui/next-turn/build-next-turn-view";
import { NextTurn } from "@/ui/next-turn/NextTurn";
import { ListEmpty } from "@/ui/list-empty/ListEmpty";

// D-28: 루트가 「내 차례」 홈이다. 미인증이면 로그인으로 보내는 분기는
// 02-04에서 그대로 유지한다(app/(app)/layout.tsx의 requireSession()이 이미
// (app) 그룹 전체를 게이트하지만, 이 화면 자체의 명시적 분기도 살려 둔다).
export default async function HomePage() {
  const session = await getSession();
  if (!session) redirect("/login");

  // D-24: 실제 「내 차례」 데이터 연결은 이후 페이즈(Phase 4+)의 일이다. 이
  // 페이즈는 시연용 예시를 넣지 않는다 — 입력은 항상 빈 배열이고, 그 결과
  // 건수 0으로 블록이 사라지는 것은 §7-4 계약대로의 동작이지 미완성이 아니다.
  const view = buildNextTurnView([]);

  return (
    <>
      <h1>내 차례</h1>
      <p>지금 처리할 항목</p>
      <NextTurn view={view} />
      {!view.visible ? (
        <ListEmpty message="표시할 항목이 없습니다" action={{ label: "프로젝트 보기", href: "/projects" }} />
      ) : null}
    </>
  );
}
