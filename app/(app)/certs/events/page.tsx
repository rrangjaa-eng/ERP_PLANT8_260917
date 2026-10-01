import { notFound } from "next/navigation";
import { requireSession } from "@/lib/viewer";
import { assertCertFeatureEnabled } from "@/lib/certs/feature-guard";
import { listEvents } from "@/domain/certs/events";
import { PageHeader } from "@/ui/page-header/PageHeader";
import { ListEmpty } from "@/ui/list-empty/ListEmpty";
import { EventsTable } from "./events-table";

export const dynamic = "force-dynamic";

// 04.3-04 Task 3 ① · 04.3-15 — I′1 확인증 행사 목록(§6-1). 기능이 꺼져 있으면 셸 안 404(C1).
// 「QR 생성 신청」 1차 · EMPTY 3차는 04.3-10이 I′2(옆 패널)와 함께 더한다.
export default async function CertEventsPage() {
  const { viewer } = await requireSession();
  await assertCertFeatureEnabled();

  const list = await listEvents(viewer);
  if (list.kind === "notFound") notFound();

  const rows = list.events.filter((event): event is typeof event & { id: string } => typeof event.id === "string");

  return (
    <>
      <PageHeader title="확인증 행사" />
      {rows.length === 0 ? <ListEmpty message="확인증 행사가 없습니다" /> : <EventsTable rows={rows} />}
    </>
  );
}
