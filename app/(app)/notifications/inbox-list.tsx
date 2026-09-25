"use client";

import { useEffect, useRef, useState } from "react";
import { useAction } from "next-safe-action/hooks";
import { toKstDate, formatKstTime } from "@/domain/holidays/business-day";
import { useUnreadCount } from "@/ui/shell/unread-count";
import { Button } from "@/ui/button/Button";
import { openInboxAction, loadMoreInboxAction } from "./actions";
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
  initialHasMore: boolean;
  /** 서버가 렌더 시각으로 미리 계산한 KST 연도 — 클라이언트는 `Date.now()`를
   * 부르지 않는다(react-hooks/purity, 렌더은 순수해야 한다). */
  initialReferenceYear: string;
};

type Group = { date: string; rows: InboxRowView[] };

// 받은 날짜(KST)로 인접한 행을 묶는다 — 서버가 이미 created_at DESC로 정렬해
// 주므로 같은 날짜 행은 항상 붙어 있다(재정렬하지 않는다, S1-c).
function groupByKstDate(rows: InboxRowView[]): Group[] {
  const groups: Group[] = [];
  for (const row of rows) {
    const date = toKstDate(new Date(row.createdAt));
    const last = groups[groups.length - 1];
    if (last && last.date === date) last.rows.push(row);
    else groups.push({ date, rows: [row] });
  }
  return groups;
}

// 올해 날짜는 MM-DD, 다른 해는 YYYY-MM-DD(S1-c · UI-SPEC :196).
function formatGroupLabel(date: string, referenceYear: string): string {
  return date.startsWith(`${referenceYear}-`) ? date.slice(5) : date;
}

// D-4218: 마운트 때 한 번 openInboxAction()을 불러 받은 {openedAt, rows,
// hasMore}로 바꾸고 배지를 갱신한다. 인셋 규칙(S1-d): readAt === null(연 뒤
// 들어온 안 읽은 행) 또는 readAt === openedAt(이번 열기가 읽음 처리한 행)에
// 남는다 — 이번 방문 동안 유지되고 다음 방문·새로고침 때 사라진다. 열기
// 실패는 화면에 오류를 띄우지 않는다(초기 rows를 그대로 둔다, S1-inbox-list/error).
export function InboxList({ initialRows, initialHasMore, initialReferenceYear }: InboxListProps) {
  const [rows, setRows] = useState(initialRows);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [openedAt, setOpenedAt] = useState<string | null>(null);
  const [referenceYear, setReferenceYear] = useState(initialReferenceYear);
  const { refresh } = useUnreadCount();
  const rowRefs = useRef<Record<string, HTMLTableRowElement | null>>({});
  // 다음 커밋 뒤 포커스를 옮길 행 id — setState가 아니라 ref로 들고 있다가
  // rows가 그 행을 그려낸 다음 effect에서 한 번만 읽고 비운다(렌더 중
  // setState를 부르지 않는다, react-hooks/set-state-in-effect).
  const pendingFocusIdRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const result = await openInboxAction();
        if (cancelled || !result?.data) return;
        setRows(result.data.rows);
        setHasMore(result.data.hasMore);
        setOpenedAt(result.data.openedAt);
        setReferenceYear(toKstDate(new Date(result.data.openedAt)).slice(0, 4));
        refresh();
      } catch {
        // 읽음 처리 실패 — 화면은 초기 rows 그대로, 배지만 이전 값으로 남는다.
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 마운트 때 한 번만.
  }, []);

  useEffect(() => {
    const id = pendingFocusIdRef.current;
    if (!id) return;
    rowRefs.current[id]?.focus();
    pendingFocusIdRef.current = null;
  }, [rows]);

  const { execute, isExecuting, hasErrored } = useAction(loadMoreInboxAction, {
    onSuccess: ({ data }) => {
      if (!data) return;
      const firstNewRow = data.rows[0];
      if (!data.hasMore && firstNewRow) pendingFocusIdRef.current = firstNewRow.id;
      setRows((previous) => [...previous, ...data.rows]);
      setHasMore(data.hasMore);
    },
  });

  const groups = groupByKstDate(rows);
  const lastRow = rows[rows.length - 1];

  function loadMore(): void {
    if (!lastRow) return;
    execute({ cursor: { createdAt: lastRow.createdAt, id: lastRow.id } });
  }

  return (
    <>
      <table className={styles.table}>
        <caption className="sr-only">알림함</caption>
        <thead>
          <tr>
            <th scope="col">내용</th>
            <th scope="col">시각</th>
          </tr>
        </thead>
        {groups.map((group) => (
          <tbody key={group.date}>
            <tr>
              <th scope="rowgroup" colSpan={2} className={styles.groupHeader}>
                {formatGroupLabel(group.date, referenceYear)}
              </th>
            </tr>
            {group.rows.map((row) => {
              const unread = row.readAt === null || row.readAt === openedAt;
              return (
                <tr
                  key={row.id}
                  data-row
                  ref={(el) => {
                    rowRefs.current[row.id] = el;
                  }}
                  tabIndex={-1}
                  className={unread ? styles.unread : undefined}
                >
                  <td>
                    <div className={styles.message}>
                      {unread ? <span className="sr-only">안 읽음 · </span> : null}
                      {row.message}
                    </div>
                    {row.emailStatus === "failed" ? (
                      <div className={styles.emailFailed}>이메일 발송 실패</div>
                    ) : null}
                  </td>
                  <td className={styles.time}>{formatKstTime(new Date(row.createdAt))}</td>
                </tr>
              );
            })}
          </tbody>
        ))}
      </table>
      {hasMore ? (
        hasErrored ? (
          <p className={styles.loadMoreError}>
            <span>불러오지 못했습니다</span>
            <Button variant="tertiary" pending={isExecuting} onClick={loadMore}>
              다시 시도
            </Button>
          </p>
        ) : (
          <Button variant="tertiary" pending={isExecuting} onClick={loadMore}>
            더 보기 50건
          </Button>
        )
      ) : null}
    </>
  );
}
