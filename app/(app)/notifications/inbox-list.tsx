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

// 올해 날짜는 MM-DD, 다른 해는 YYYY-MM-DD(S1-c · UI-SPEC :196). 04.2-09 Task 3
// 사후 수정(Opus 편차 판정 (b)) — 다른 해 분기는 90일 보관 창 안에서 E2E로
// 재현하기 어려워 export해 단위 테스트로 덮는다.
export function formatGroupLabel(date: string, referenceYear: string): string {
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

  // M4(04.2-09 Task 3 사후 수정, Opus 적대적 디자인 검토) — dev StrictMode는
  // 이 effect를 mount→cleanup→mount로 두 번 돌린다. 기존 cancelled 플래그만
  // 쓰면 두 번째 마운트가 openInboxAction()을 또 불러 서버를 두 번 열게
  // 된다(첫 호출이 읽은 행의 readAt과 두 번째 호출의 openedAt이 달라져
  // S1-d 인셋·배지가 사라진다). hasOpenedRef로 실제 요청은 한 번만 시작하고,
  // unmountedRef는 그 요청이 끝날 때 컴포넌트가 정말 떠났는지만 본다(다음
  // 마운트가 다시 false로 되돌린다 — StrictMode의 가짜 cleanup은 건너뛴다).
  const hasOpenedRef = useRef(false);
  const unmountedRef = useRef(false);

  useEffect(() => {
    unmountedRef.current = false;
    if (!hasOpenedRef.current) {
      hasOpenedRef.current = true;
      void (async () => {
        try {
          const result = await openInboxAction();
          if (unmountedRef.current || !result?.data) return;
          setRows(result.data.rows);
          setHasMore(result.data.hasMore);
          setOpenedAt(result.data.openedAt);
          setReferenceYear(toKstDate(new Date(result.data.openedAt)).slice(0, 4));
          refresh();
        } catch {
          // 읽음 처리 실패 — 화면은 초기 rows 그대로, 배지만 이전 값으로 남는다.
        }
      })();
    }
    return () => {
      unmountedRef.current = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 마운트 때 한 번만.
  }, []);

  useEffect(() => {
    const id = pendingFocusIdRef.current;
    if (!id) return;
    rowRefs.current[id]?.focus();
    pendingFocusIdRef.current = null;
  }, [rows]);

  // M2 + L1(04.2-09 Task 3 사후 수정, Opus 적대적 디자인 검토) — next-safe-action의
  // hasErrored는 status가 "executing"이 되면 곧바로 거짓이 된다(재시도 요청
  // 중에도 실패 상태를 보여야 한다는 플랜 계약과 어긋난다). showRetry로 직접
  // 들고 있는다. shouldRefocusLoadMoreRef는 요청이 끝난 뒤 남은 버튼(더 보기
  // 또는 다시 시도)에 포커스를 되돌리려는 의도를 기억한다 — Button의 pending은
  // 네이티브 disabled라 브라우저가 요청 중 포커스를 문서로 돌리기 때문이다.
  // 마지막 쪽(hasMore=false)이면 버튼 자체가 사라지므로 여긴 손대지 않고
  // 위 rows 포커스 effect가 새 행으로 옮긴다.
  const [showRetry, setShowRetry] = useState(false);
  const loadMoreContainerRef = useRef<HTMLElement | null>(null);
  const shouldRefocusLoadMoreRef = useRef(false);
  const wasExecutingRef = useRef(false);

  const { execute, isExecuting } = useAction(loadMoreInboxAction, {
    onError: () => {
      setShowRetry(true);
    },
    onSuccess: ({ data }) => {
      if (!data) return;
      setShowRetry(false);
      const firstNewRow = data.rows[0];
      if (!data.hasMore && firstNewRow) pendingFocusIdRef.current = firstNewRow.id;
      setRows((previous) => [...previous, ...data.rows]);
      setHasMore(data.hasMore);
    },
  });

  useEffect(() => {
    if (wasExecutingRef.current && !isExecuting && shouldRefocusLoadMoreRef.current) {
      shouldRefocusLoadMoreRef.current = false;
      loadMoreContainerRef.current?.querySelector("button")?.focus();
    }
    wasExecutingRef.current = isExecuting;
  }, [isExecuting]);

  const groups = groupByKstDate(rows);
  const lastRow = rows[rows.length - 1];

  function loadMore(): void {
    if (!lastRow) return;
    shouldRefocusLoadMoreRef.current = true;
    execute({ cursor: { createdAt: lastRow.createdAt, id: lastRow.id } });
  }

  return (
    <>
      <table className={styles.table}>
        <caption className="sr-only">알림함</caption>
        <thead>
          <tr>
            <th scope="col">내용</th>
            {/* L2(04.2-09 Task 3 사후 수정) — 값 칸(.time)이 오른쪽 정렬이라 머리글도 맞춘다. */}
            <th scope="col" className={styles.time}>
              시각
            </th>
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
        showRetry ? (
          <p
            ref={(el) => {
              loadMoreContainerRef.current = el;
            }}
            className={styles.loadMoreError}
            role="status"
          >
            <span>불러오기 실패</span>
            <Button variant="tertiary" pending={isExecuting} onClick={loadMore}>
              다시 시도
            </Button>
          </p>
        ) : (
          <span
            ref={(el) => {
              loadMoreContainerRef.current = el;
            }}
          >
            {/* D-4218 경합 수정 — 열기(openInboxAction)가 rows를 통째로 갈아 끼우고
                더 보기는 그 rows 끝의 커서로 이어 붙인다. 열기가 끝나기(openedAt이
                채워지기) 전에 더 보기가 성공하면 뒤늦게 도착한 열기 결과가 그사이
                붙은 행을 덮어쓴다 — 열기가 끝날 때까지 더 보기를 막는다. */}
            <Button variant="tertiary" pending={isExecuting || openedAt === null} onClick={loadMore}>
              더 보기 50건
            </Button>
          </span>
        )
      ) : null}
    </>
  );
}
