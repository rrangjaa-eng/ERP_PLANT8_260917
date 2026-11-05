import type { ReactNode } from "react";
import { notFound, redirect } from "next/navigation";
import "@/app/(app)/document-kinds";
import { getApprovalView } from "@/domain/approvals";
import { statusStepLabel } from "@/domain/approvals/route";
import { formatRequestBalanceRow, LEAVE_DOCUMENT_KIND } from "@/domain/leave";
import { loadPrintCompany } from "@/domain/print/company";
import { getLeavePrint } from "@/domain/print/leave";
import { kstDateOf, kstDateTimeOf } from "@/lib/kst-date";
import { getSessionId, requireSession } from "@/lib/viewer";
import { HALF_LABELS, LEAVE_KIND_LABELS } from "@/app/(app)/leave/labels";
import { toApprovalBoxes } from "@/app/print/_frame/approval-boxes";
import { PrintApproval } from "@/app/print/_frame/PrintApproval";
import { PrintBar } from "@/app/print/_frame/PrintBar";
import { PrintFields, type PrintFieldRow } from "@/app/print/_frame/PrintFields";
import { PrintFrame } from "@/app/print/_frame/PrintFrame";
import { PrintHeader } from "@/app/print/_frame/PrintHeader";
import { PrintTitle } from "@/app/print/_frame/PrintTitle";
import { documentStatusText } from "@/app/print/_frame/status-text";
import { loadLeaveForPrint } from "./load";

export const dynamic = "force-dynamic";

// 07.4-02 D-7408 · D-7410 · D-7413: 연차 신청서 인쇄물(셸 밖 · (app) 레이아웃의 requireSession이 앞서지 않는다). 세션이 없으면 로그인으로.
// 볼 수 없는 id는 layout이 응답 전에 404로 막았다. 행은 일곱으로 고정이고(입사일 행 없음) 값이 없으면(`leave.value`를 못 보는 계급의 `{}`) 「—」다.
// 상신일 · 기안 칸 시각은 지금 차수 결재선(getLeavePrint)이다 — 문서 작성 시각은 다시 신청해도 첫 신청 시각이라 쓰지 않는다.
export default async function LeavePrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await getSessionId())) redirect("/login");
  const { viewer } = await requireSession();
  const leave = await loadLeaveForPrint(id);
  if (!leave) notFound();

  const [print, view, company] = await Promise.all([
    getLeavePrint(viewer, id),
    getApprovalView(viewer, { kind: LEAVE_DOCUMENT_KIND, documentId: id }),
    loadPrintCompany(),
  ]);

  const currentStep = view?.steps?.find((step) => step.state === "current");
  const statusText = documentStatusText(view?.status, currentStep ? statusStepLabel(currentStep.label) : null);

  // 연차 상세 화면의 종류 · 기간과 같은 식(시작 시각 꼬리 없음).
  const kind = leave.kind ? `${LEAVE_KIND_LABELS[leave.kind] ?? leave.kind}${leave.half ? ` ${HALF_LABELS[leave.half] ?? leave.half}` : ""}` : null;
  const period = leave.startDate && leave.endDate ? `${leave.startDate}${leave.endDate !== leave.startDate ? ` ~ ${leave.endDate}` : ""}` : null;
  const affiliation = [print?.divisionName, print?.teamName, print?.roleName].filter(Boolean).join(" · ");
  // 잔고 줄 글자는 화면 잔고 행과 같은 함수의 text 그대로다(줄 색은 싣지 않는다).
  const balanceLines = leave.kind ? formatRequestBalanceRow(print?.balance, leave.kind) : null;
  const balance: ReactNode = balanceLines
    ? balanceLines.map((line, index) => (
        <span key={line.text}>
          {index > 0 ? <br /> : null}
          {line.text}
        </span>
      ))
    : null;

  const rows: PrintFieldRow[] = [
    { label: "신청인", value: leave.drafterName ?? null },
    { label: "소속", value: affiliation },
    { label: "종류", value: kind },
    { label: "기간", value: period },
    { label: "일수", value: leave.days ?? null },
    { label: "비고", value: leave.note ?? null, breakable: true },
    { label: "잔고", value: balance },
  ];

  const approval = toApprovalBoxes({
    drafterName: leave.drafterName,
    submittedAt: print?.submittedAt ?? null,
    instanceId: view?.instanceId,
    steps: view?.steps,
  });

  return (
    <PrintFrame bar={<PrintBar kind="leave" id={id} />}>
      <PrintHeader company={company} printedAt={kstDateTimeOf(new Date())} />
      <PrintTitle
        title="연차 신청서"
        number={leave.number ?? null}
        statusText={statusText}
        aside={print?.submittedAt ? <>상신일 {kstDateOf(print.submittedAt)}</> : undefined}
      />
      <PrintFields rows={rows} />
      <PrintApproval {...approval} />
    </PrintFrame>
  );
}
