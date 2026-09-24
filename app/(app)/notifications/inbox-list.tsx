"use client";

import { useEffect, useState } from "react";
import { useUnreadCount } from "@/ui/shell/unread-count";
import { openInboxAction } from "./actions";
import styles from "./inbox-list.module.css";

export type InboxRowView = {
  id: string;
  message: string;
  createdAt: string;
  readAt: string | null;
  emailStatus: string;
};

export type InboxListProps = {
  initialRows: InboxRowView[];
};

function formatTime(iso: string): string {
  const date = new Date(iso);
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

// D-4218: 마운트 때 한 번 openInboxAction()을 불러 받은 {openedAt, rows}로 행을
// 바꾸고 배지를 갱신한다. 인셋 규칙(S1-d): readAt === null(연 뒤 들어온 안 읽은
// 행) 또는 readAt === openedAt(이번 열기가 읽음 처리한 행)에 남는다. 이 태스크는
// 날짜 그룹·더 보기·다섯 상태 없이 행만 그린다(04.2-09).
export function InboxList({ initialRows }: InboxListProps) {
  const [rows, setRows] = useState(initialRows);
  const [openedAt, setOpenedAt] = useState<string | null>(null);
  const { refresh } = useUnreadCount();

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await openInboxAction();
      if (cancelled || !result?.data) return;
      setRows(result.data.rows);
      setOpenedAt(result.data.openedAt);
      refresh();
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 마운트 때 한 번만.
  }, []);

  return (
    <table className={styles.table}>
      <caption className="sr-only">알림함</caption>
      <thead>
        <tr>
          <th scope="col">내용</th>
          <th scope="col">시각</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const unread = row.readAt === null || row.readAt === openedAt;
          return (
            <tr key={row.id} className={unread ? styles.unread : undefined}>
              <td>
                {unread ? <span className="sr-only">안 읽음 · </span> : null}
                {row.message}
              </td>
              <td className={styles.time}>{formatTime(row.createdAt)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
