import { notFound } from "next/navigation";
import { requireSession } from "@/lib/viewer";
import { listReasonOptions } from "@/domain/code-tables";
import { getDateChangeRequestForm } from "@/domain/expenses/date-change";
import { DetailScreen } from "@/ui/detail-screen/DetailScreen";
import { Num } from "@/ui/num/Num";
import { DateRequestForm } from "./date-request-form";

// 07.2-18 S16(X4 · D-7290 · D-7294): 희망 지급일 변경 요청 화면 — 칸이 둘(새 희망일 · 변경 사유)이라 모달이 아니라 폼 화면(§6-3 · Open questions 3).
// 판정(기안자 본인 · 최종 승인 · 미지급 · 이체 파일 전 · 대기 요청 없음)이 can이 아니면 404 — 상세의 입구와 같은 판정(domain/expenses/date-change).
export const dynamic = "force-dynamic";

export default async function DateRequestPage({ params }: { params: Promise<{ id: string }> }) {
  const { viewer } = await requireSession();
  const { id } = await params;
  const form = await getDateChangeRequestForm(viewer, id);
  if (!form) notFound();
  // 희망 지급일 사유 목록 재사용(Open questions 12 · 07.2-07 ReasonField) — 로그인만 되면 읽는 좁은 reader.
  const reasonOptions = await listReasonOptions(viewer, "requested_payment_reason");
  return (
    <DetailScreen title="희망 지급일 변경 요청" meta={form.number ? <Num value={form.number} /> : undefined}>
      <DateRequestForm expenseId={form.expenseId} currentDate={form.requestedPaymentDate} today={form.today} reasonOptions={reasonOptions} />
    </DetailScreen>
  );
}
