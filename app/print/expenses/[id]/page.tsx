import { notFound, redirect } from "next/navigation";
import "@/app/(app)/document-kinds";
import { getApprovalView } from "@/domain/approvals";
import { statusStepLabel } from "@/domain/approvals/route";
import { listEvidence } from "@/domain/evidence";
import { EXPENSE_DOCUMENT_KIND } from "@/domain/expenses";
import { formatRatePercent } from "@/domain/money";
import { currentApprovalRound } from "@/domain/print/current-round";
import { loadPrintCompany } from "@/domain/print/company";
import { formatForeignLine, formatKrw } from "@/lib/format-number";
import { koreanAmountText } from "@/lib/korean-amount";
import { kstDateTimeOf } from "@/lib/kst-date";
import { getSessionId, requireSession } from "@/lib/viewer";
import { toApprovalBoxes } from "@/app/print/_frame/approval-boxes";
import { PrintApproval } from "@/app/print/_frame/PrintApproval";
import { PrintBar } from "@/app/print/_frame/PrintBar";
import { PrintFields, type PrintFieldRow } from "@/app/print/_frame/PrintFields";
import { PrintFrame } from "@/app/print/_frame/PrintFrame";
import { PrintHeader } from "@/app/print/_frame/PrintHeader";
import { PrintTable, type PrintTableRow } from "@/app/print/_frame/PrintTable";
import { PrintTitle } from "@/app/print/_frame/PrintTitle";
import { documentStatusText } from "@/app/print/_frame/status-text";
import styles from "@/app/print/_frame/print-frame.module.css";
import { loadExpenseForPrint } from "./load";
import { expenseTaxRows } from "./tax-rows";

export const dynamic = "force-dynamic";

// 07.4-01 D-7408 · D-7410 · D-7412: 지출결의서 인쇄물(셸 밖 · (app) 레이아웃의 requireSession이 앞서지 않는다). 세션이 없으면 로그인으로 —
// `next=`는 붙이지 않는다(lib/login-next.ts 허용 목록이 확인증 두 경로뿐이라 인쇄 경로 next는 버려진다). 볼 수 없는 id는 layout이 응답 전에 404로 막았다.
// 값은 DTO 그대로 — 금액 열은 `supply` 키가 있을 때만(투영 키 유무, 계급 분기 없음)이고 세금 · 합계는 taxResult에서만 읽는다(저장 스냅숏 칸은 쓰지 않는다).
export default async function ExpensePrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await getSessionId())) redirect("/login");
  const { viewer } = await requireSession();
  const expense = await loadExpenseForPrint(id);
  if (!expense) notFound();

  const [evidence, view, company, round] = await Promise.all([
    listEvidence(viewer, { ownerKind: EXPENSE_DOCUMENT_KIND, ownerId: id }),
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

  const currentStep = view?.steps?.find((step) => step.state === "current");
  const statusText = documentStatusText(view?.status, currentStep ? statusStepLabel(currentStep.label) : null, expense.statusWord === "종결");

  // 투영으로 키가 빠진 항목은 행째 없다(`—`는 값이 null · ""일 때만). 팀 비용 문서(사용일 있음)의 프로젝트 값은 팀 · 갈래.
  const has = (...keys: (keyof typeof expense)[]) => keys.some((key) => key in expense);
  const isTeam = Boolean(expense.usageDate);
  const fieldRows: (PrintFieldRow | null)[] = [
    has("projectNumber", "projectName", "teamName")
      ? { label: "프로젝트", value: isTeam ? [expense.teamName, expense.teamExpenseKindLabel].filter(Boolean).join(" · ") : [expense.projectNumber, expense.projectName].filter(Boolean).join(" ") }
      : null,
    has("vendorName", "payeeUserName") ? { label: "지급처", value: expense.vendorName ?? expense.payeeUserName } : null,
    has("evidenceTypeName", "evidenceDate") ? { label: "증빙", value: [expense.evidenceTypeName, expense.evidenceDate].filter(Boolean).join(" · ") } : null,
    has("paymentMethodName") ? { label: "지급 방식", value: expense.paymentMethodName } : null,
    has("scheduledPaymentDate") ? { label: "지급 예정일", value: expense.scheduledPaymentDate } : null,
    has("note") ? { label: "상세", value: expense.note, breakable: true } : null,
  ];

  // 명세 표 — 금액 열은 supply 키가 있을 때만.
  const showAmount = "supply" in expense;
  const supply = expense.supply ?? null;
  const taxRows = showAmount ? expenseTaxRows(expense.taxResult) : null;
  const target = isTeam ? expense.content : [expense.lineNo, expense.itemName].filter((part) => part !== null && part !== undefined && part !== "").join(" ");
  const foreign = supply ? formatForeignLine(supply) : null;

  const rows: PrintTableRow[] = [
    {
      key: "supply",
      cells: [
        "1",
        "공급가액",
        target || "—",
        ...(showAmount
          ? [
              supply ? (
                <span key="amount" className={styles.num}>
                  {formatKrw(supply.amountKrw)}
                  {foreign ? <span className={styles.small}>{foreign}</span> : null}
                </span>
              ) : (
                "—"
              ),
            ]
          : []),
      ],
    },
  ];
  let foot = null;
  if (taxRows?.kind === "unavailable") {
    rows.push({ key: "tax", cells: ["2", "세금", { span: 2, content: <span className={styles.small}>{taxRows.text}</span> }] });
  } else if (taxRows?.kind === "rows") {
    const { tax, payable } = taxRows;
    if (tax) {
      rows.push({
        key: "tax",
        cells: [
          "2",
          tax.name,
          tax.exempt ? "면제 기준 이하" : tax.rate !== null ? formatRatePercent(tax.rate) : "",
          <span key="amount" className={styles.num}>
            {formatKrw(tax.amountKrw)}
          </span>,
        ],
      });
    }
    // 비정상 값이라 한글 금액이 null이면 그 글자만 없다(UI-SPEC 합계 행 — 「그 줄만 없다」). 칸은 금액 열 정렬을 위해 비워 둔다.
    const korean = koreanAmountText(payable.amountKrw);
    foot = (
      <>
        <tr>
          <td />
          <td className={styles.totalLabel}>{payable.label}</td>
          <td className={styles.totalKorean}>{korean}</td>
          <td className={`${styles.end} ${styles.num} ${styles.totalAmount}`}>{formatKrw(payable.amountKrw)}</td>
        </tr>
        {payable.borne ? (
          <tr>
            <td colSpan={4} className={styles.end}>
              <span className={styles.small}>
                {payable.borne.exempt
                  ? "회사 대납 세금 0 · 면제 기준 이하"
                  : `회사 대납 세금 ${payable.borne.rate !== null ? `${formatRatePercent(payable.borne.rate)} ` : ""}${formatKrw(payable.borne.amountKrw)}`}
              </span>
            </td>
          </tr>
        ) : null}
      </>
    );
  }

  const fileNames = evidence.flatMap((file) => (file.id && file.originalName && !file.voidedAt ? [file.originalName] : []));

  return (
    <PrintFrame bar={<PrintBar kind="expense" id={id} />}>
      <PrintHeader company={company} printedAt={kstDateTimeOf(new Date())} />
      <PrintTitle title="지출결의서" number={expense.number} statusText={statusText} />
      <PrintFields rows={fieldRows.filter((row): row is PrintFieldRow => row !== null)} />
      <PrintTable
        caption="명세"
        columns={[
          { label: "번호", width: "8mm", hideLabel: true },
          { label: "구분", width: "22mm" },
          { label: "내용" },
          ...(showAmount ? [{ label: "금액", width: "36mm" as const, align: "end" as const }] : []),
        ]}
        rows={rows}
        foot={foot}
      />
      <h2 className={styles.section}>증빙 파일</h2>
      {fileNames.length === 0 ? (
        <p>—</p>
      ) : (
        <ol className={styles.files}>
          {fileNames.map((name, index) => (
            <li key={`${index}-${name}`}>
              {index + 1}. {name}
            </li>
          ))}
        </ol>
      )}
      <PrintApproval {...approval} />
    </PrintFrame>
  );
}
