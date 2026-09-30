import { notFound } from "next/navigation";
import { requireSession } from "@/lib/viewer";
import { can } from "@/domain/permissions/can";
import { PageHeader } from "@/ui/page-header/PageHeader";
import { LeaveForm } from "./leave-form";

// 04.1-02 S2 첫 형태 — leave write가 없으면 404(UI-SPEC S10). 도메인도 submitLeave 첫 줄에서
// 같은 판정을 한다(페이지 게이트는 바깥 겹). WR-07: 세션 검사를 이 페이지가 직접 한다.
export default async function LeaveNewPage() {
  const { viewer } = await requireSession();
  if (!(await can(viewer, "leave", "write"))) notFound();

  return (
    <>
      <PageHeader title="연차 신청" />
      <LeaveForm />
    </>
  );
}
