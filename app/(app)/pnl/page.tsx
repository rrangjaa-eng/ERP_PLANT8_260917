import Link from "next/link";
import { requireSession } from "@/lib/viewer";
import { can } from "@/domain/permissions/can";
import { visible } from "@/domain/permissions/visible";
// Button.tsx는 클라이언트 모듈이라 서버 컴포넌트가 buttonLinkClassName을 부를 수 없다 — 같은 3차 클래스를 직접 쓴다.
import buttonStyles from "@/ui/button/Button.module.css";
import { ListEmpty } from "@/ui/list-empty/ListEmpty";
import { ListScreen } from "@/ui/list-screen/ListScreen";
import styles from "./pnl.module.css";

// SYSTEM.md §6-1 목록 화면 = 원장. 표는 Phase 4 범위(02-01 DECISIONS.md 기록).
// WR-07: 인증 검사를 이 페이지가 직접 한다. 레이아웃의 requireSession()에
// 기대지 않는다 — 레이아웃은 이동할 때 재렌더되지 않고 라우트 세그먼트는
// 그와 무관하게 RSC 페이로드에 들어간다(next/dist/docs 01-app/02-guides/
// authentication.md). Phase 4가 이 라우트에 원장 데이터를 올린다.
export default async function PnlPage() {
  const { viewer } = await requireSession();
  // 04-42(CEO 리뷰 B-13) — 상단 메뉴는 누구에게나 다섯 전부라 기획 PM도 여기 닿는다. 리저브 대장 링크는 대장이
  // 열리는 두 조건(pnl 보기 + reserve.amount 노출)일 때만 그린다 — 404로 가는 링크가 대장의 존재를 알리지 않는다.
  const [canViewPnl, reserveShown] = await Promise.all([can(viewer, "pnl", "view"), visible(viewer, "reserve.amount")]);

  return (
    <ListScreen title="손익">
      {canViewPnl && reserveShown ? (
        <p className={styles.ledgerLine}>
          <Link href="/pnl/reserves" className={`${buttonStyles.btn} ${buttonStyles.tertiary}`}>
            리저브 대장
          </Link>
        </p>
      ) : null}
      <ListEmpty message="표시할 손익 데이터가 없습니다" action={{ label: "프로젝트 보기", href: "/projects" }} />
    </ListScreen>
  );
}
