import { notFound, redirect } from "next/navigation";
import { loadPrintCompany } from "@/domain/print/company";
import { getCompanyLogoUrl } from "@/domain/settings/company-logo";
import { kstDateOf } from "@/lib/kst-date";
import { getSessionId } from "@/lib/viewer";
import { PrintBar } from "@/app/print/_frame/PrintBar";
import { PrintFields } from "@/app/print/_frame/PrintFields";
import { PrintFrame } from "@/app/print/_frame/PrintFrame";
import { PrintTable } from "@/app/print/_frame/PrintTable";
import { PrintTitle } from "@/app/print/_frame/PrintTitle";
import { loadQuoteForPrint } from "./load";
import { QuoteHeader } from "./quote-logo";
import { quoteRows } from "./quote-rows";

export const dynamic = "force-dynamic";

// 07.2-10 PU3 · PU4(D-7221 · D-7227): 고객 견적서 인쇄물(07.4 공용 틀 위 · 셸 밖). 세션이 없으면 로그인으로, 볼 수 없는 id는 layout이 응답 전에 404로 막았다.
// 열어도 자동 인쇄 · 기록이 없다(autoPrint={false}) — 출력 버튼 · beforeprint만 보냄 기록이다. 본문은 고객용 투영(DTO)에 있는 것뿐이다.
export default async function QuotePrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await getSessionId())) redirect("/login");
  const quote = await loadQuoteForPrint(id);
  if (!quote) notFound();
  const company = await loadPrintCompany();

  return (
    <PrintFrame bar={<PrintBar kind="quote" id={id} autoPrint={false} failureToast closeHref={`/projects/${quote.projectId}`} />}>
      <QuoteHeader company={company} logoUrl={await getCompanyLogoUrl()} printedAt={null} infoLabels={false} />
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
          { label: "QTY", width: "14mm", align: "end" },
          { label: "COST/UNIT", width: "26mm", align: "end" },
          { label: "NO. of DAY/SET", width: "18mm", align: "end", wrapLabel: true },
          { label: "AMOUNT", width: "36mm", align: "end" },
          { label: "REMARK", width: "30mm" },
        ]}
        rows={quoteRows(quote)}
      />
    </PrintFrame>
  );
}
