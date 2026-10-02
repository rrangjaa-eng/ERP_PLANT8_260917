// 04.6 스킨 A 이관 전: 화면 틀
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/viewer";
import { assertCertFeatureEnabled } from "@/lib/certs/feature-guard";
import { can } from "@/domain/permissions/can";
import { CERT_EVENT_NAME_MAX, getCreateGate, listEvents } from "@/domain/certs/events";
import { kstToday } from "@/lib/kst-date";
import { PageHeader } from "@/ui/page-header/PageHeader";
import { EventsTable } from "./events-table";
import { RequestEntry } from "./request-panel";
import { CancelledToast } from "./cancelled-toast";
import { CANCELLED_TOAST_COOKIE } from "./cancelled-toast-cookie";

export const dynamic = "force-dynamic";

// 04.3-04 Task 3 ① · 04.3-15 · 04.3-10 — I′1 확인증 행사 목록(§6-1) + 표 위 1차 「QR 생성 신청」 · EMPTY 3차 → I′2 옆 패널.
// 1차는 certs.events 쓰기일 때만 서버가 그리게 한다. 기능이 꺼져 있으면 셸 안 404(C1). 04.3-17 — I′3 「신청 취소」 뒤 착지
// 토스트의 행사 이름은 취소 액션이 남긴 httpOnly 쿠키에서만 읽는다(지운 행사라 다시 읽을 수 없다 · 주소 글자는 쓰지 않는다 —
// 검토 X4 · 사용자 결정 PR #88 5934173511). 착지 토스트가 그 쿠키를 지운다.
export default async function CertEventsPage() {
  const { viewer } = await requireSession();
  await assertCertFeatureEnabled();

  const list = await listEvents(viewer);
  if (list.kind === "notFound") notFound();

  const canRequest = await can(viewer, "certs.events", "write");
  const gate = canRequest ? await getCreateGate(viewer) : null;
  const rows = list.events.filter((event): event is typeof event & { id: string } => typeof event.id === "string");
  const cancelledName = (await cookies()).get(CANCELLED_TOAST_COOKIE)?.value.slice(0, CERT_EVENT_NAME_MAX) || null;

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
      <CancelledToast name={cancelledName} />
    </>
  );
}
