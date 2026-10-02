import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/viewer";
import { assertCertFeatureEnabled } from "@/lib/certs/feature-guard";
import { can } from "@/domain/permissions/can";
import { CERT_EVENT_NAME_MAX, getCreateGate, listEvents } from "@/domain/certs/events";
import { kstToday } from "@/lib/kst-date";
import { ListScreen } from "@/ui/list-screen/ListScreen";
import { ListEmpty } from "@/ui/list-empty/ListEmpty";
import { SidePanel } from "@/ui/side-panel/SidePanel";
import { EventsTable } from "./events-table";
import { RequestForm, RequestToastHost } from "./request-panel";
import { CancelledToast } from "./cancelled-toast";
import { CANCELLED_TOAST_COOKIE } from "./cancelled-toast-cookie";

export const dynamic = "force-dynamic";

// 04.3-04 Task 3 ① · 04.3-15 · 04.3-10 — I′1 확인증 행사 목록(§6-1) + 머리 1차 「QR 생성 신청」 · EMPTY 링크 → I′2 옆 패널.
// 04.6-23(Q1 A): 1차는 `?new=1` 링크이고 패널은 검색 파라미터 `new`와 기존 신청 권한(certs.events 쓰기)으로 이 서버 페이지가 판정한다 —
// 권한 없는 계급은 `?new=1`로 와도 패널 없이 목록만 본다(T-04.6-60). 신청 성공 뒤 토스트는 패널 밖 `RequestToastHost`가 쥔다(Q2 A).
// 기능이 꺼져 있으면 셸 안 404(C1). 04.3-17 — I′3 「신청 취소」 뒤 착지
// 토스트의 행사 이름은 취소 액션이 남긴 httpOnly 쿠키에서만 읽는다(지운 행사라 다시 읽을 수 없다 · 주소 글자는 쓰지 않는다 —
// 검토 X4 · 사용자 결정 PR #88 5934173511). 착지 토스트가 그 쿠키를 지운다.
const LIST_HREF = "/certs/events";
const NEW_HREF = "/certs/events?new=1";

export default async function CertEventsPage({ searchParams }: { searchParams: Promise<{ new?: string }> }) {
  const { viewer } = await requireSession();
  await assertCertFeatureEnabled();
  const { new: newParam } = await searchParams;

  const list = await listEvents(viewer);
  if (list.kind === "notFound") notFound();

  const canRequest = await can(viewer, "certs.events", "write");
  const gate = canRequest ? await getCreateGate(viewer) : null;
  const rows = list.events.filter((event): event is typeof event & { id: string } => typeof event.id === "string");
  const cancelledName = (await cookies()).get(CANCELLED_TOAST_COOKIE)?.value.slice(0, CERT_EVENT_NAME_MAX) || null;
  const now = new Date();

  return (
    <>
      <RequestToastHost>
        <ListScreen
          title="확인증 행사"
          primaryAction={canRequest ? { label: "QR 생성 신청", href: NEW_HREF } : undefined}
          empty={
            rows.length === 0 ? (
              <ListEmpty
                message="확인증 행사가 없습니다"
                action={canRequest ? { label: "QR 생성 신청", href: NEW_HREF } : undefined}
              />
            ) : undefined
          }
          panel={
            canRequest && newParam === "1" ? (
              <SidePanel key="new" title="QR 생성 신청" closeHref={LIST_HREF}>
                <RequestForm
                  today={kstToday(now)}
                  nowIso={now.toISOString()}
                  contactMissing={gate?.contactMissing ?? false}
                  canOpenSettings={gate?.canOpenSettings ?? false}
                  linkExpireHours={gate?.linkExpireHours ?? 0}
                />
              </SidePanel>
            ) : null
          }
        >
          <EventsTable rows={rows} />
        </ListScreen>
      </RequestToastHost>
      <CancelledToast name={cancelledName} />
    </>
  );
}
