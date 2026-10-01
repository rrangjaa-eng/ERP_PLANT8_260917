import { notFound } from "next/navigation";
import { requireSession } from "@/lib/viewer";
import { assertCertFeatureEnabled } from "@/lib/certs/feature-guard";
import { can } from "@/domain/permissions/can";
import { getCreateGate, listEvents } from "@/domain/certs/events";
import { kstToday } from "@/lib/kst-date";
import { PageHeader } from "@/ui/page-header/PageHeader";
import { EventsTable } from "./events-table";
import { RequestEntry } from "./request-panel";
import { LandingToast } from "./landing-toast";
import { CERT_EVENT_NAME_MAX } from "@/domain/certs/events";

export const dynamic = "force-dynamic";

// 04.3-04 Task 3 ① · 04.3-15 · 04.3-10 — I′1 확인증 행사 목록(§6-1) + 표 위 1차 「QR 생성 신청」 · EMPTY 3차 → I′2 옆 패널.
// 1차는 certs.events 쓰기일 때만 서버가 그리게 한다. 기능이 꺼져 있으면 셸 안 404(C1). 04.3-17 — `?cancelled={행사 이름}`은
// I′3 「신청 취소」 뒤 착지(지운 행사라 이름을 다시 읽을 수 없다 — 행사 이름은 개인정보가 아니다, 이름 길이 상한까지만).
export default async function CertEventsPage({ searchParams }: { searchParams: Promise<{ cancelled?: string }> }) {
  const { viewer } = await requireSession();
  await assertCertFeatureEnabled();

  const list = await listEvents(viewer);
  if (list.kind === "notFound") notFound();

  const canRequest = await can(viewer, "certs.events", "write");
  const gate = canRequest ? await getCreateGate(viewer) : null;
  const rows = list.events.filter((event): event is typeof event & { id: string } => typeof event.id === "string");
  const { cancelled } = await searchParams;
  const cancelledName = typeof cancelled === "string" ? cancelled.slice(0, CERT_EVENT_NAME_MAX) : "";

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
      {cancelledName ? <LandingToast message={`신청 취소 · ${cancelledName}`} href="/certs/events" /> : null}
    </>
  );
}
