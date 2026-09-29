import { notFound } from "next/navigation";
import { requireSession } from "@/lib/viewer";
import { assertCertFeatureEnabled } from "@/lib/certs/feature-guard";
import { can } from "@/domain/permissions/can";
import { getCreateGate, listEvents } from "@/domain/certs/events";
import { kstToday } from "@/lib/kst-date";
import { PageHeader } from "@/ui/page-header/PageHeader";
import { EventsTable } from "./events-table";
import { EventCreateForm } from "./event-create-form";
import { CreateEntryPrimary, EventsEmpty } from "./create-entry";

export const dynamic = "force-dynamic";

// 04.3-04 Task 3 ① — I1 확인증 행사 목록 + `?new=1` 만들기 폼 토글(§6-1). 기능이 꺼져 있으면 셸 안 404(C1).
export default async function CertEventsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { viewer } = await requireSession();
  await assertCertFeatureEnabled();

  const list = await listEvents(viewer);
  if (list.kind === "notFound") notFound();

  const params = await searchParams;
  const canWrite = await can(viewer, "certs.events", "write");
  const showCreateForm = canWrite && params.new === "1";
  const gate = showCreateForm ? await getCreateGate(viewer) : null;
  const rows = list.events.filter((event): event is typeof event & { id: string } => typeof event.id === "string");

  return (
    <>
      <PageHeader title="확인증 행사" />

      {/* 1024 미만에서 폼은 null을 그리고 목록만 남는다(D-10). 폼이 열려 있으면 머리 1차를 그리지 않는다(한 화면 1차 하나). */}
      {gate ? <EventCreateForm today={kstToday(new Date())} contactMissing={gate.contactMissing} canOpenSettings={gate.canOpenSettings} /> : null}
      {canWrite && !showCreateForm ? <CreateEntryPrimary /> : null}

      {rows.length === 0 ? <EventsEmpty canCreate={canWrite && !showCreateForm} /> : <EventsTable rows={rows} />}
    </>
  );
}
