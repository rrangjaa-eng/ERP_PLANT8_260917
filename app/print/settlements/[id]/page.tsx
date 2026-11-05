import { notFound, redirect } from "next/navigation";
import "@/app/(app)/document-kinds";
import { getApprovalView } from "@/domain/approvals";
import { statusStepLabel } from "@/domain/approvals/route";
import { listProjectExpenseRows } from "@/domain/expenses/list";
import { can } from "@/domain/permissions/can";
import { visible } from "@/domain/permissions/visible";
import { currentApprovalRound } from "@/domain/print/current-round";
import { loadPrintCompany } from "@/domain/print/company";
import { loadProjectProfit } from "@/domain/projects";
import { listProjectPurchaseRequests } from "@/domain/purchase-requests";
import { periodText, SETTLEMENT_DOCUMENT_KIND } from "@/domain/settlements";
import { formatKrw } from "@/lib/format-number";
import { kstDateTimeOf } from "@/lib/kst-date";
import { getSessionId, requireSession } from "@/lib/viewer";
import { purchaseStatusWord } from "@/app/(app)/cards/purchases/purchase-status-word";
import { toApprovalBoxes } from "@/app/print/_frame/approval-boxes";
import { PrintApproval } from "@/app/print/_frame/PrintApproval";
import { PrintBar } from "@/app/print/_frame/PrintBar";
import { PrintFields, type PrintFieldRow } from "@/app/print/_frame/PrintFields";
import { PrintFrame } from "@/app/print/_frame/PrintFrame";
import { PrintHeader } from "@/app/print/_frame/PrintHeader";
import { PrintTable, type PrintTableColumn, type PrintTableRow } from "@/app/print/_frame/PrintTable";
import { PrintTitle } from "@/app/print/_frame/PrintTitle";
import { documentStatusText } from "@/app/print/_frame/status-text";
import styles from "@/app/print/_frame/print-frame.module.css";
import { loadSettlementForPrint } from "./load";
import { profitCells } from "./profit-cells";

export const dynamic = "force-dynamic";

// 07.4-03 D-7414 · D-7402 · D-7410: 프로젝트 정산서 인쇄물(셸 밖 · (app) 레이아웃의 requireSession이 앞서지 않는다). 세션이 없으면 로그인으로 —
// `next=`는 붙이지 않는다(lib/login-next.ts 허용 목록 밖). 볼 수 없는 id는 layout이 응답 전에 404로 막았다. 라우트 id = 프로젝트 id = 정산 문서 id.
// 손익 절은 프로젝트 화면과 같은 조건(quote.amount ∧ pnl.view)일 때만 서버가 읽고, 프로젝트 행 범위 밖이면 loadProjectProfit이 null이라 절째 없다.
// 두 목록은 각 목록 화면과 같은 범위 · 같은 낱말 · 같은 투영이고(지출결의는 보기 권한이 없으면 절째 없다), 금액 열은 표마다 한 번 정한다. 합계 행 없음(다시 세지 않음).
export default async function SettlementPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await getSessionId())) redirect("/login");
  const { viewer } = await requireSession();
  const doc = await loadSettlementForPrint(id);
  if (!doc) notFound();

  const canSeeAmount = await visible(viewer, "quote.amount");
  const [profit, view, company, round, expenseRows, purchaseRows, expenseAmount, purchaseAmount] = await Promise.all([
    canSeeAmount && (await can(viewer, "pnl", "view")) ? loadProjectProfit(viewer, id) : null,
    getApprovalView(viewer, { kind: SETTLEMENT_DOCUMENT_KIND, documentId: id, readOnlyVisible: true }),
    loadPrintCompany(),
    currentApprovalRound(viewer, { kind: SETTLEMENT_DOCUMENT_KIND, documentId: id }),
    listProjectExpenseRows(viewer, id),
    listProjectPurchaseRequests(viewer, id),
    visible(viewer, "expense.amount"),
    visible(viewer, "purchase_request.amount"),
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

  // 지출결의 — 지출결의 목록 화면과 같은 값(항목은 프로젝트 이름을 뺀 항목(+회차) · 지급처 · 상태 낱말).
  const expenseColumns: PrintTableColumn[] = [
    { label: "번호", width: "30mm" },
    { label: "항목" },
    { label: "지급처", width: "40mm" },
    ...(expenseAmount ? [{ label: "공급가", width: "30mm" as const, align: "end" as const }] : []),
    { label: "상태", width: "22mm" },
  ];
  const expenseTable: PrintTableRow[] = (expenseRows ?? []).map((row, index) => ({
    key: row.id ?? `expense-${index}`,
    cells: [
      row.number ? <span className={styles.num}>{row.number}</span> : "—",
      row.title || "—",
      row.vendorName ?? row.payeeUserName ?? "—",
      ...(expenseAmount ? [row.supply ? <span className={styles.num}>{formatKrw(row.supply.amountKrw)}</span> : "—"] : []),
      row.statusWord ?? "—",
    ],
  }));

  // 구매 요청 — 구매 요청 목록 화면과 같은 열 이름 · 같은 값. 예상 금액은 늘 estimateKrw(구매 완료 행도), 카드 사용은 상태 칸 아래 보조 줄.
  const purchaseColumns: PrintTableColumn[] = [
    { label: "번호", width: "28mm" },
    { label: "요청일", width: "22mm" },
    { label: "품목" },
    { label: "요청자", width: "20mm" },
    ...(purchaseAmount ? [{ label: "예상 금액", width: "28mm" as const, align: "end" as const }] : []),
    { label: "상태", width: "22mm" },
  ];
  const purchaseTable: PrintTableRow[] = purchaseRows.map((row, index) => {
    // 목록 화면 statusSecondLine과 같은 글자 — 사용일 · 결제 합계는 투영을 지난 키만(빠지면 그 조각이 없다).
    const usage =
      row.status === "purchased" && row.usageUsedOn
        ? `카드 사용 ${row.usageUsedOn.slice(5)}${typeof row.usageTotalKrw === "number" ? ` · ${formatKrw(row.usageTotalKrw)}` : ""}`
        : null;
    return {
      key: row.id ?? `purchase-${index}`,
      cells: [
        row.number ? <span className={styles.num}>{row.number}</span> : "—",
        row.requestedOn ? <span className={styles.num}>{row.requestedOn.slice(5)}</span> : "—",
        row.itemName || "—",
        row.requestedByName || "—",
        ...(purchaseAmount ? [typeof row.estimateKrw === "number" ? <span className={styles.num}>{formatKrw(row.estimateKrw)}</span> : "—"] : []),
        row.status ? (
          <>
            {purchaseStatusWord(row.status)}
            {usage ? <span className={styles.small}>{usage}</span> : null}
          </>
        ) : (
          "—"
        ),
      ],
    };
  });

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
      {expenseRows ? (
        <>
          <h2 className={styles.section}>지출결의</h2>
          <PrintTable caption="지출결의" columns={expenseColumns} rows={expenseTable} />
        </>
      ) : null}
      <h2 className={styles.section}>구매 요청</h2>
      <PrintTable caption="구매 요청" columns={purchaseColumns} rows={purchaseTable} />
      <PrintApproval {...approval} />
    </PrintFrame>
  );
}
