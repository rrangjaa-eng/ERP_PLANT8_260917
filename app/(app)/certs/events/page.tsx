import { notFound } from "next/navigation";
import { requireSession } from "@/lib/viewer";
import { assertCertFeatureEnabled } from "@/lib/certs/feature-guard";
import { can } from "@/domain/permissions/can";
import { getCreateGate, listEvents } from "@/domain/certs/events";
import { kstToday } from "@/lib/kst-date";
import { PageHeader } from "@/ui/page-header/PageHeader";
import { EventsTable } from "./events-table";
import { RequestEntry } from "./request-panel";

export const dynamic = "force-dynamic";

// 04.3-04 Task 3 ① · 04.3-15 · 04.3-10 — I′1 확인증 행사 목록(§6-1) + 표 위 1차 「QR 생성 신청」 · EMPTY 3차 → I′2 옆 패널.
// 1차는 certs.events 쓰기일 때만 서버가 그리게 한다. 기능이 꺼져 있으면 셸 안 404(C1).
export default async function CertEventsPage() {
  const { viewer } = await requireSession();
  await assertCertFeatureEnabled();

  const list = await listEvents(viewer);
  if (list.kind === "notFound") notFound();

  const canRequest = await can(viewer, "certs.events", "write");
  const gate = canRequest ? await getCreateGate(viewer) : null;
  const rows = list.events.filter((event): event is typeof event & { id: string } => typeof event.id === "string");

  return (
    <>
      <PageHeader title="확인증 행사" />
      <RequestEntry
        canRequest={canRequest}
        empty={rows.length === 0}
        today={kstToday(new Date())}
        contactMissing={gate?.contactMissing ?? false}
        canOpenSettings={gate?.canOpenSettings ?? false}
        linkExpireHours={gate?.linkExpireHours ?? 0}
      >
        <EventsTable rows={rows} />
      </RequestEntry>
    </>
  );
}
