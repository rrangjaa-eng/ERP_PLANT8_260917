"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

// D-4219(2026-09-25 개정 · /plan-design-review #4 R13): 설치된 Next.js 문서
// (node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/layout.md
// 「Layouts do not re-render on navigation」)가 명시하듯 레이아웃은 클라이언트
// 이동에서 다시 렌더되지 않는다 — 그래서 이 클라이언트 경계가 경로가 바뀔 때마다
// 인증된 액션(refreshUnreadCountAction)으로 안 읽은 수를 다시 받는다. 첫 값은
// 레이아웃의 서버 조회(initial)다. 다시 받는 동안·실패 때는 이전 값을 그대로
// 둔다 — 첫 서버 조회가 실패했을 때만(initial = null) 배지가 없다.
//
// `ui`가 `app`을 import하지 않도록(경계 규칙) next-safe-action 결과의 모양만
// 구조 타입으로 받는다 — 실제 액션 타입은 이 파일이 모른다.
export type UnreadRefreshResult =
  | { data?: number; serverError?: unknown; validationErrors?: unknown }
  | undefined;

// 실패(serverError·validationErrors·던짐)는 이전 값을 유지한다 — 한 번의 실패로
// 있던 배지가 사라져 안 읽은 알림이 없는 것처럼 읽히지 않게 한다.
export function nextUnreadCount(previous: number | null, result: UnreadRefreshResult | null): number | null {
  if (result && typeof result.data === "number") return result.data;
  return previous;
}

// 보이는 글자만 만든다 — 스크린 리더 글자는 이 함수가 아니라 실제 count를 쓴다(#18).
export function unreadCountLabel(count: number | null): string | null {
  if (count === null || count <= 0) return null;
  if (count > 99) return "99+";
  return String(count);
}

// 04.2-09 Task 2(S1-b): PC 사용자 메뉴·폰 「더보기」 시트가 공유하는 「알림함 N」
// 메뉴 항목 라벨 조립 — unreadCountLabel이 없으면(0건) 접미사 없이 baseLabel 그대로다.
export function notificationsMenuLabel(baseLabel: string, count: number | null): string {
  const suffix = unreadCountLabel(count);
  return suffix ? `${baseLabel} ${suffix}` : baseLabel;
}

type UnreadCountContextValue = { count: number | null; refresh: () => void };

const UnreadCountContext = createContext<UnreadCountContextValue>({
  count: null,
  refresh: () => {},
});

export function useUnreadCount(): UnreadCountContextValue {
  return useContext(UnreadCountContext);
}

export type UnreadCountProviderProps = {
  initial: number | null;
  refresh: () => Promise<UnreadRefreshResult>;
  children: ReactNode;
};

export function UnreadCountProvider({ initial, refresh, children }: UnreadCountProviderProps) {
  const [count, setCount] = useState<number | null>(initial);
  const pathname = usePathname();
  // 첫 마운트의 경로를 기억해 둔다 — 첫 마운트에는 다시 받지 않는다(첫 값은
  // 레이아웃의 서버 조회로 이미 있다).
  const firstPathRef = useRef(pathname);

  async function doRefresh(): Promise<void> {
    try {
      const result = await refresh();
      setCount((previous) => nextUnreadCount(previous, result));
    } catch {
      setCount((previous) => nextUnreadCount(previous, null));
    }
  }

  useEffect(() => {
    if (pathname === firstPathRef.current) return;
    firstPathRef.current = pathname;
    void doRefresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- doRefresh는 refresh prop을 닫아 온다. 경로 변경만 트리거다.
  }, [pathname]);

  return (
    <UnreadCountContext.Provider value={{ count, refresh: () => void doRefresh() }}>
      {children}
    </UnreadCountContext.Provider>
  );
}
