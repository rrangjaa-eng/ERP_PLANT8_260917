import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/viewer";
import { can } from "@/domain/permissions/can";
import { MENUS } from "@/domain/permissions/menus";
import { adminIndexGroups } from "@/ui/shell/role-menu";
import { PageHeader } from "@/ui/page-header/PageHeader";
import { Banner } from "@/ui/banner/Banner";
import { emailFailureBanner, emailFailureBannerText } from "@/domain/system-status";
import { holidayConfirmationBanner } from "@/domain/holidays/admin";
import styles from "./admin-index.module.css";

// SYSTEM.md §6-10 「관리」 인덱스 화면 — 관리자 화면 10개의 단일 진입점(「관리」
// 한 줄로 접기, 2026-09-22 quick/260922-i3k, 사용자 결정 옵션 B). PC 사용자
// 메뉴(§6-0 (a))·「더보기」 시트(§7-8)의 「관리」 한 줄이 이 화면으로 온다.
//
// app/(app)/layout.tsx와 같은 방식으로 MENUS를 can(viewer, key, "view")로 걸러
// allowedMenus를 계산한다 — 같은 계산을 두 곳(레이아웃의 셸 메뉴, 이 화면의
// 인덱스 그룹)에서 한다는 뜻이지만, 사용자 10~30명 사내 시스템이라 이 중복을
// 캐시·공유 계산으로 최적화하지 않는다(03-02-PLAN.md ⑤와 같은 판단).
export const dynamic = "force-dynamic";

export default async function AdminIndexPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const visibleMenus = await Promise.all(
    MENUS.map(async (menu) => ((await can(session.viewer, menu.key, "view")) ? menu.key : null)),
  );
  const allowedMenus = visibleMenus.filter((key): key is string => key !== null);

  const groups = adminIndexGroups({ roleId: session.viewer.roleId ?? "", allowedMenus });

  // D-17: 권한 없는 리소스는 404 — 볼 항목이 0개인 계급에게는 이 화면 자체가 없다.
  if (groups.length === 0) notFound();

  // §7-11 · UI-SPEC S3: 한 화면 배너 최대 1개 — 경고 B2(이메일 실패)가 있으면 그것만,
  // 없을 때만 안내 B1(공휴일 확정 요청)을 본다. 판정 함수가 권한을 보고 실패는 null이다.
  const emailBanner = await emailFailureBanner(session.viewer);
  const holidayBanner = emailBanner ? null : await holidayConfirmationBanner(session.viewer);

  return (
    <>
      {emailBanner ? (
        <Banner kind="warning">
          {emailFailureBannerText(emailBanner)}{" "}
          <Link href="/admin/system-status" className={styles.bannerLink}>
            시스템 상태 보기
          </Link>
        </Banner>
      ) : holidayBanner ? (
        <Banner kind="info">
          {holidayBanner.year}년 공휴일 확정 전{" "}
          <Link href={`/admin/holidays?year=${holidayBanner.year}`} className={styles.bannerLink}>
            {holidayBanner.year}년 공휴일 검토
          </Link>
        </Banner>
      ) : null}
      <PageHeader title="관리" />
      <div className="single-column">
        {groups.map((group) => (
          <section key={group.label}>
            <h2 className={styles.groupLabel}>{group.label}</h2>
            <ul className={styles.list}>
              {group.items.map((item) => (
                <li key={item.href}>
                  <Link href={item.href} className={styles.link}>
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}
