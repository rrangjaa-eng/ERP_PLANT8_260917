import { CONDITION_KINDS } from "@/domain/notify/condition-kinds";
import { notificationHref } from "@/domain/notify/href";
import type { Viewer } from "@/domain/viewer";
import {
  countUnread,
  listInbox,
  openInbox,
  type InboxCursor,
  type InboxRow,
} from "@/repositories/notifications";

// D-4206: 알림함·안 읽은 수는 최근 90일 행만 읽는다. 행은 지우지 않는다.
export const INBOX_RETENTION_DAYS = 90;

export type InboxNotification = {
  id: string;
  message: string;
  createdAt: string;
  readAt: string | null;
  emailStatus: string;
  // 착지 링크(N25) — 그 viewer가 볼 수 있는 문서일 때만. 없으면 문장은 글자다.
  href?: string;
  // 등록부 종류 이름(N26 접힘) — 등록부 밖 종류(확인증 즉시 경로 등)는 없다.
  kindLabel?: string;
};

export type InboxDeps = { now?: () => Date };

function retentionFrom(now: Date): Date {
  return new Date(now.getTime() - INBOX_RETENTION_DAYS * 24 * 60 * 60 * 1000);
}

const KIND_LABELS = new Map(CONDITION_KINDS.map((kind) => [kind.kind, kind.label]));

// 링크는 페이지 전체를 갈래별로 한 번씩 묶어 조회한다(행마다 부르지 않는다 — N+1 금지, R12). DTO 등록부에 올리지 않는다(본인 범위 화면).
async function toDtos(viewer: Viewer, rows: InboxRow[]): Promise<InboxNotification[]> {
  const hrefs = await notificationHref(
    viewer,
    rows.map((row) => ({ entity: row.entity, entityId: row.entityId })),
  );
  return rows.map((row, index) => {
    const href = hrefs[index];
    const kindLabel = KIND_LABELS.get(row.conditionKind);
    return {
      id: String(row.id),
      message: row.message,
      createdAt: row.createdAt.toISOString(),
      readAt: row.readAt ? row.readAt.toISOString() : null,
      emailStatus: row.emailStatus,
      ...(href ? { href } : {}),
      ...(kindLabel ? { kindLabel } : {}),
    };
  });
}

// D-4208: 받는 사람은 언제나 viewer.id다 — 다른 사람의 알림함을 읽는 인자를
// 받지 않는다. 저장소는 limit + 1행을 읽어 넘침 여부(hasMore)를 알아내고
// limit행만 돌려준다(04.2-09의 「더 보기 50건」이 51건 이상일 때만 보이게).
export async function listMyNotifications(
  viewer: Viewer,
  opts: { limit?: number; cursor?: InboxCursor } = {},
  deps?: InboxDeps,
): Promise<{ rows: InboxNotification[]; hasMore: boolean }> {
  const limit = opts.limit ?? 50;
  const now = (deps?.now ?? (() => new Date()))();
  const rows = await listInbox(viewer, {
    recipientId: viewer.id,
    retentionFrom: retentionFrom(now),
    limit: limit + 1,
    cursor: opts.cursor,
  });
  return { rows: await toDtos(viewer, rows.slice(0, limit)), hasMore: rows.length > limit };
}

export async function countMyUnread(viewer: Viewer, deps?: InboxDeps): Promise<number> {
  const now = (deps?.now ?? (() => new Date()))();
  return countUnread(viewer, { recipientId: viewer.id, retentionFrom: retentionFrom(now) });
}

// D-4218: 한 문장 열기 — 그 스냅샷에 보이는 안 읽은 행만 read_at = openedAt으로
// 고치고, 같은 스냅샷의 첫 페이지를 openedAt과 함께 돌려준다. 클라이언트는
// openedAt을 보내지 않는다(서버 스냅샷이 범위를 정한다 — T-4.2-51).
export async function openMyInbox(
  viewer: Viewer,
  deps?: InboxDeps,
): Promise<{ openedAt: string; rows: InboxNotification[]; hasMore: boolean }> {
  const limit = 50;
  const now = (deps?.now ?? (() => new Date()))();
  const { openedAt, rows } = await openInbox(viewer, {
    recipientId: viewer.id,
    retentionFrom: retentionFrom(now),
    limit: limit + 1,
  });
  const page = await toDtos(
    viewer,
    rows.slice(0, limit).map((row) => ({ ...row, readAt: row.wasMarked ? openedAt : row.readAt })),
  );
  return { openedAt: openedAt.toISOString(), rows: page, hasMore: rows.length > limit };
}

export type { InboxCursor };
