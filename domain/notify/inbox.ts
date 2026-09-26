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
};

export type InboxDeps = { now?: () => Date };

function retentionFrom(now: Date): Date {
  return new Date(now.getTime() - INBOX_RETENTION_DAYS * 24 * 60 * 60 * 1000);
}

function toDto(row: InboxRow): InboxNotification {
  return {
    id: String(row.id),
    message: row.message,
    createdAt: row.createdAt.toISOString(),
    readAt: row.readAt ? row.readAt.toISOString() : null,
    emailStatus: row.emailStatus,
  };
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
  return { rows: rows.slice(0, limit).map(toDto), hasMore: rows.length > limit };
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
  const page = rows.slice(0, limit).map((row) =>
    toDto({
      id: row.id,
      message: row.message,
      createdAt: row.createdAt,
      readAt: row.wasMarked ? openedAt : row.readAt,
      emailStatus: row.emailStatus,
    }),
  );
  return { openedAt: openedAt.toISOString(), rows: page, hasMore: rows.length > limit };
}

export type { InboxCursor };
