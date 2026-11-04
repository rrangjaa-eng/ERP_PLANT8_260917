import { notFound, redirect } from "next/navigation";
import "@/app/(app)/document-kinds";
import { getApprovalView } from "@/domain/approvals";
import { EXPENSE_DOCUMENT_KIND } from "@/domain/expenses";
import { currentApprovalRound } from "@/domain/print/current-round";
import { loadPrintCompany } from "@/domain/print/company";
import { kstDateTimeOf } from "@/lib/kst-date";
import { getSessionId, requireSession } from "@/lib/viewer";
import { toApprovalBoxes } from "@/app/print/_frame/approval-boxes";
import { PrintApproval } from "@/app/print/_frame/PrintApproval";
import { PrintBar } from "@/app/print/_frame/PrintBar";
import { PrintFields } from "@/app/print/_frame/PrintFields";
import { PrintFrame } from "@/app/print/_frame/PrintFrame";
import { PrintHeader } from "@/app/print/_frame/PrintHeader";
import { PrintTitle } from "@/app/print/_frame/PrintTitle";
import { loadExpenseForPrint } from "./load";

export const dynamic = "force-dynamic";

// 07.4-01 D-7408 · D-7410: 지출결의서 인쇄물(셸 밖 · (app) 레이아웃의 requireSession이 앞서지 않는다). 세션이 없으면 로그인으로 —
// `next=`는 붙이지 않는다(lib/login-next.ts 허용 목록이 확인증 두 경로뿐이라 인쇄 경로 next는 버려진다). 볼 수 없는 id는 layout이 응답 전에 404로 막았다.
export default async function ExpensePrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await getSessionId())) redirect("/login");
  const { viewer } = await requireSession();
  const expense = await loadExpenseForPrint(id);
  if (!expense) notFound();

  const [view, company, round] = await Promise.all([
    getApprovalView(viewer, { kind: EXPENSE_DOCUMENT_KIND, documentId: id, readOnlyVisible: true }),
    loadPrintCompany(),
    currentApprovalRound(viewer, { kind: EXPENSE_DOCUMENT_KIND, documentId: id }),
  ]);

  const approval = toApprovalBoxes({
    drafterName: expense.drafterName,
    // 기안 칸 일시는 지금 차수 결재선의 상신 시각이다 — 지출결의 DTO의 submittedAt 값은 다시 제출해도 첫 제출 시각이라 쓰지 않고,
    // 키 유무(expense.value 투영)로만 시각을 보일지 정한다.
    submittedAt: "submittedAt" in expense ? (round?.submittedAt ?? null) : null,
    instanceId: view?.instanceId,
    steps: view?.steps,
  });

  return (
    <PrintFrame bar={<PrintBar kind="expense" id={id} />}>
      <PrintHeader company={company} printedAt={kstDateTimeOf(new Date())} />
      <PrintTitle title="지출결의서" number={expense.number} />
      <PrintFields rows={[{ label: "프로젝트", value: [expense.projectNumber, expense.projectName].filter(Boolean).join(" ") }]} />
      <PrintApproval {...approval} />
    </PrintFrame>
  );
}
