import { notFound, redirect } from "next/navigation";
import { loadPrintCompany } from "@/domain/print/company";
import { formatKrw, formatQuantity } from "@/lib/format-number";
import { kstDateOf, kstDateTimeOf } from "@/lib/kst-date";
import { getSessionId } from "@/lib/viewer";
import { PrintBar } from "@/app/print/_frame/PrintBar";
import { PrintFields } from "@/app/print/_frame/PrintFields";
import { PrintFrame } from "@/app/print/_frame/PrintFrame";
import { PrintHeader } from "@/app/print/_frame/PrintHeader";
import { PrintTable, type PrintTableRow } from "@/app/print/_frame/PrintTable";
import { PrintTitle } from "@/app/print/_frame/PrintTitle";
import styles from "@/app/print/_frame/print-frame.module.css";
import { loadQuoteForPrint } from "./load";

export const dynamic = "force-dynamic";

// 07.2-10 PU3 · PU4(D-7221 · D-7227): 고객 견적서 인쇄물(07.4 공용 틀 위 · 셸 밖). 세션이 없으면 로그인으로, 볼 수 없는 id는 layout이 응답 전에 404로 막았다.
// 열어도 자동 인쇄 · 기록이 없다(autoPrint={false}) — 출력 버튼 · beforeprint만 보냄 기록이다. 본문은 고객용 투영(DTO)에 있는 것뿐이다.
export default async function QuotePrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await getSessionId())) redirect("/login");
  const quote = await loadQuoteForPrint(id);
  if (!quote) notFound();
  const company = await loadPrintCompany();

  const rows: PrintTableRow[] = [
    ...quote.lines.map((line) => ({
      key: line.id,
      cells: [line.item, formatQuantity(line.quantity), formatKrw(line.unitPriceKrw), formatQuantity(line.days), formatKrw(line.amountKrw), line.remark ?? ""],
    })),
    ...quote.commissionLines.map((line) => ({ key: line.id, cells: [line.item, "", "", "", formatKrw(line.amountKrw), line.remark ?? ""] })),
    {
      key: "grand",
      cells: [
        <span key="label" className={styles.totalLabel}>
          Grand Total
        </span>,
        {
          span: 4,
          content: (
            <span className={`${styles.num} ${styles.totalAmount}`}>{formatKrw(quote.grandTotalKrw)}</span>
          ),
        },
        "",
      ],
    },
  ];

  return (
    <PrintFrame bar={<PrintBar kind="quote" id={id} autoPrint={false} closeHref={`/projects/${quote.projectId}`} />}>
      <PrintHeader company={company} printedAt={kstDateTimeOf(new Date())} />
      <PrintTitle title="QUOTATION" />
      <PrintFields
        rows={[
          { label: "Bill to", value: quote.clientName },
          { label: "Event", value: quote.eventName },
          { label: "Date", value: kstDateOf(new Date()) },
          { label: "AE", value: quote.pmName },
          { label: "Ref.", value: quote.ref },
        ]}
      />
      <PrintTable
        caption="Items"
        columns={[
          { label: "ITEM" },
          { label: "QTY", align: "end" },
          { label: "COST/UNIT", align: "end" },
          { label: "NO. of DAY/SET", align: "end" },
          { label: "AMOUNT", align: "end" },
          { label: "REMARK" },
        ]}
        rows={rows}
      />
    </PrintFrame>
  );
}
