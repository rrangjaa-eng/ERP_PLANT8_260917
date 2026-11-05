import { notFound, redirect } from "next/navigation";
import "@/app/(app)/document-kinds";
import { getApprovalView } from "@/domain/approvals";
import { statusStepLabel } from "@/domain/approvals/route";
import { can } from "@/domain/permissions/can";
import { visible } from "@/domain/permissions/visible";
import { currentApprovalRound } from "@/domain/print/current-round";
import { loadPrintCompany } from "@/domain/print/company";
import { loadProjectProfit } from "@/domain/projects";
import { periodText, SETTLEMENT_DOCUMENT_KIND } from "@/domain/settlements";
import { formatKrw } from "@/lib/format-number";
import { kstDateTimeOf } from "@/lib/kst-date";
import { getSessionId, requireSession } from "@/lib/viewer";
import { toApprovalBoxes } from "@/app/print/_frame/approval-boxes";
import { PrintApproval } from "@/app/print/_frame/PrintApproval";
import { PrintBar } from "@/app/print/_frame/PrintBar";
import { PrintFields, type PrintFieldRow } from "@/app/print/_frame/PrintFields";
import { PrintFrame } from "@/app/print/_frame/PrintFrame";
import { PrintHeader } from "@/app/print/_frame/PrintHeader";
import { PrintTitle } from "@/app/print/_frame/PrintTitle";
import { documentStatusText } from "@/app/print/_frame/status-text";
import styles from "@/app/print/_frame/print-frame.module.css";
import { loadSettlementForPrint } from "./load";
import { profitCells } from "./profit-cells";

export const dynamic = "force-dynamic";

// 07.4-03 D-7414 · D-7402 · D-7410: 프로젝트 정산서 인쇄물(셸 밖 · (app) 레이아웃의 requireSession이 앞서지 않는다). 세션이 없으면 로그인으로 —
// `next=`는 붙이지 않는다(lib/login-next.ts 허용 목록 밖). 볼 수 없는 id는 layout이 응답 전에 404로 막았다. 라우트 id = 프로젝트 id = 정산 문서 id.
// 손익 절은 프로젝트 화면과 같은 조건(quote.amount ∧ pnl.view)일 때만 서버가 읽고, 프로젝트 행 범위 밖이면 loadProjectProfit이 null이라 절째 없다.
export default async function SettlementPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await getSessionId())) redirect("/login");
  const { viewer } = await requireSession();
  const doc = await loadSettlementForPrint(id);
  if (!doc) notFound();

  const canSeeAmount = await visible(viewer, "quote.amount");
  const [profit, view, company, round] = await Promise.all([
    canSeeAmount && (await can(viewer, "pnl", "view")) ? loadProjectProfit(viewer, id) : null,
    getApprovalView(viewer, { kind: SETTLEMENT_DOCUMENT_KIND, documentId: id, readOnlyVisible: true }),
    loadPrintCompany(),
    currentApprovalRound(viewer, { kind: SETTLEMENT_DOCUMENT_KIND, documentId: id }),
  ]);

  const currentStep = view?.steps?.find((step) => step.state === "current");
  const statusText = documentStatusText(view?.status, currentStep ? statusStepLabel(currentStep.label) : null);

  const fieldRows: PrintFieldRow[] = [
    { label: "프로젝트", value: [doc.projectNumber, doc.projectName].filter(Boolean).join(" ") },
    { label: "기간", value: periodText(doc.startDate, doc.endDate) },
    { label: "PM", value: doc.pmName ?? null },
  ];
  // 두 합은 투영으로 키가 빠지면(quote.amount를 못 봄) 행째 없다.
  const amountRows: PrintFieldRow[] = [];
  if (doc.quoteTotalKrw !== undefined) amountRows.push({ label: "견적가 합", value: <span className={styles.num}>{formatKrw(doc.quoteTotalKrw)}</span> });
  if (doc.executionTotalKrw !== undefined) amountRows.push({ label: "실행가 합", value: <span className={styles.num}>{formatKrw(doc.executionTotalKrw)}</span> });

  const approval = toApprovalBoxes({
    drafterName: doc.drafterName,
    // 기안 칸 일시는 지금 차수 결재선의 상신 시각이다 — 정산 문서의 작성 시각은 다시 올려도 그대로라 쓰지 않고,
    // 키 유무(approval.value 투영)로만 시각을 보일지 정한다.
    submittedAt: "createdAt" in doc ? (round?.submittedAt ?? null) : null,
    instanceId: view?.instanceId,
    steps: view?.steps,
  });

  return (
    <PrintFrame bar={<PrintBar kind="settlement" id={id} />}>
      <PrintHeader company={company} printedAt={kstDateTimeOf(new Date())} />
      <PrintTitle title="프로젝트 정산서" number={doc.projectNumber ?? null} statusText={statusText} />
      <PrintFields rows={fieldRows} />
      {amountRows.length > 0 ? (
        <div className={styles.amountBlock}>
          <PrintFields rows={amountRows} />
        </div>
      ) : null}
      {profit && doc.executionTotalKrw !== undefined ? (
        <>
          <h2 className={styles.section}>손익</h2>
          <div className={styles.metricRow}>
            {profitCells(profit, doc.executionTotalKrw).map((cell) => (
              <div key={cell.label} className={styles.metricCell}>
                <span className={styles.metricLabel}>{cell.label}</span>
                <span className={cell.note ? styles.metricNote : styles.metricValue}>{cell.text}</span>
              </div>
            ))}
          </div>
        </>
      ) : null}
      <PrintApproval {...approval} />
    </PrintFrame>
  );
}
