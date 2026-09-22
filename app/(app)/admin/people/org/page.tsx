import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/viewer";
import { can } from "@/domain/permissions/can";
import { listOrgUnits, listTeams } from "@/domain/org";
import { PageHeader } from "@/ui/page-header/PageHeader";
import { OrgClient } from "./org-client";

export const dynamic = "force-dynamic";

// MAST-02: 조직 관리 화면 — 본부 목록과 그 아래 팀 목록(본부별 그룹). 팀
// 추가 폼은 본부 선택을 필수로 요구한다(본부 없는 팀을 만들 수 없다).
export default async function OrgPage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!(await can(session.viewer, "admin.people", "view"))) notFound();

  // §6-1: 목록이 화면이고 추가는 목록 머리글의 행동이다 — 기본 진입에는 폼이
  // 없다(D-39, DECISIONS.md 2026-09-21). 이 화면은 그 재구성에서 빠져 있어
  // 본부·팀 폼이 둘 다 상시 렌더됐고, 그래서 1차 버튼도 한 화면에 둘이었다
  // (§7-1은 1개 — design-review A-H1). 폼이 둘이므로 토글 값도 둘이다.
  const { new: newParam } = await searchParams;
  const newForm = newParam === "org" || newParam === "team" ? newParam : null;

  const [orgUnits, teams, canArchive] = await Promise.all([
    listOrgUnits(session.viewer),
    listTeams(session.viewer),
    can(session.viewer, "admin.archive", "write"),
  ]);

  return (
    <>
      <PageHeader title="조직" />
      <div className="single-column">
        <OrgClient orgUnits={orgUnits} teams={teams} canArchive={canArchive} newForm={newForm} />
      </div>
    </>
  );
}
