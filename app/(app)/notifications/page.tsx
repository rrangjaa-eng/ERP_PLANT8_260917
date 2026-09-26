import { requireSession } from "@/lib/viewer";
import { PageHeader } from "@/ui/page-header/PageHeader";
import { ListEmpty } from "@/ui/list-empty/ListEmpty";
import { listMyNotifications } from "@/domain/notify/inbox";
import { toKstDate } from "@/domain/holidays/business-day";
import { InboxList } from "./inbox-list";

// D-4208: 알림함은 권한표 메뉴가 아니다 — 로그인한 모든 사용자가 쓰는 본인 범위
// 화면이다. `dynamic="force-dynamic"`은 다른 (app) 페이지와 같은 규칙(D-18, 캐시
// 없음). 여기서는 읽기만 한다(listMyNotifications) — 렌더 중 쓰기(읽음 처리)를
// 하지 않는다. 읽음 처리는 클라이언트(inbox-list.tsx)가 마운트 때 한 번 한다.
export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const { viewer } = await requireSession();

  let initial: { rows: Awaited<ReturnType<typeof listMyNotifications>>["rows"]; hasMore: boolean } | null = null;
  try {
    initial = await listMyNotifications(viewer, { limit: 50 });
  } catch (error) {
    console.error("[notifications] listMyNotifications 조회 실패", error);
  }

  return (
    <>
      <PageHeader title="알림함" />
      {initial === null ? (
        <ListEmpty
          tone="error"
          message="불러오기 실패 · 다시 시도"
          action={{ label: "다시 시도", href: "/notifications" }}
        />
      ) : initial.rows.length === 0 ? (
        <ListEmpty message="알림이 없습니다" />
      ) : (
        <InboxList
          initialRows={initial.rows}
          initialHasMore={initial.hasMore}
          initialReferenceYear={toKstDate(new Date()).slice(0, 4)}
        />
      )}
    </>
  );
}
