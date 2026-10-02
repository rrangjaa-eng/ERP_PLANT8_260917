"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  type SyntheticEvent,
} from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/ui/confirm-dialog/ConfirmDialog";
import styles from "./SidePanel.module.css";

// UI-SPEC 「옆 패널 상호작용 계약」 · SYSTEM §6-3 · §7-8(04.6-04, Q1 A) — 한 건 등록·수정 옆 패널(PC 오른쪽 480 · 폰 아래 시트).
// 네이티브 <dialog> 하나를 모든 폭에서 showModal()로 연다 — 뒤(셸·목록)는 네이티브 모달이 비활성으로 만들고, 가림막은 PC
// `--scrim-panel` · 폰 `--scrim-dialog`다. 여는 요소(링크)는 렌더에 남는다(R4). 열리면 첫 입력에 포커스, Tab은 패널 안에서 돈다.
//
// 두 형태: URL 패널(`closeHref` — RSC가 `?new=1`·`?editId=`로 판정해 렌더, 함수를 넘길 수 없다)과 제어 패널(`onClose` — 호출부가
// 열린 동안만 렌더, 결재 시트·「QR 생성 신청」). 닫기는 `requestClose` 한 곳이다 — Esc · x · 「취소」 · 가림막 · 성공이 모두 여기를
// 지나고, 안의 `PanelForm`이 알려 주는 가드(바뀐 칸 수 · 제출 중)로 DR1 A 「입력 버리기」 확인(바뀐 칸이 있을 때 · 가림막은 무시)과
// D7 무시(제출 중)를 한 번에 정한다. `PanelForm`이 없는 제어 패널은 가드가 없어 바로 닫힌다.

const FIRST_FIELD = "input:not([type=hidden]), select, textarea";
const TABBABLE = "input:not([type=hidden]):not(:disabled), select:not(:disabled), textarea:not(:disabled), button:not(:disabled), a[href], [tabindex]:not([tabindex=\"-1\"])";

/** 조합 중이거나 안쪽 컨트롤이 먼저 쓴 Esc는 패널을 닫지 않는다. */
export function isPanelCloseKey(event: { key: string; isComposing?: boolean; defaultPrevented?: boolean }): boolean {
  return event.key === "Escape" && !event.isComposing && !event.defaultPrevented;
}

export type PanelCloseReason = "esc" | "x" | "cancel" | "scrim" | "success";

/** `PanelForm`이 `SidePanel`에 알리는 닫기 가드. */
export type PanelGuard = { dirtyCount: number; submitting: boolean };

type PanelContextValue = {
  setGuard(guard: PanelGuard): void;
  requestClose(reason: PanelCloseReason): void;
};

const PanelContext = createContext<PanelContextValue | null>(null);

/** `PanelForm`이 쓴다 — `SidePanel` 밖이면 null. */
export function usePanel(): PanelContextValue | null {
  return useContext(PanelContext);
}

type NavigationLike = { currentEntry: { index: number } | null; entries(): { url: string | null }[] };

// 앱 안에서 연 패널인가 — Navigation API로 바로 앞 기록 항목의 URL이 닫을 곳과 같은지 본다(D12). API가 없는 브라우저는 직접 URL로 친다.
function openedFromList(closeHref: string): boolean {
  const navigation = (window as unknown as { navigation?: NavigationLike }).navigation;
  const index = navigation?.currentEntry?.index;
  if (navigation === undefined || index === undefined || index < 1) return false;
  const previous = navigation.entries()[index - 1]?.url;
  if (!previous) return false;
  const a = new URL(previous);
  const b = new URL(closeHref, window.location.href);
  return a.pathname + a.search === b.pathname + b.search;
}

type SidePanelCommon = {
  /** = 실제 동작(`거래처 등록`). 패널의 접근 이름이다. */
  title: string;
  /** 거짓이면 닫힐 때 연 요소로 포커스를 돌리지 않는다(호출부가 새 결과로 옮긴다). 기본 참. */
  returnFocus?: boolean;
  children?: ReactNode;
};

export type SidePanelProps = SidePanelCommon &
  (
    | { /** URL 패널 — 닫으면 이 목록 URL로(앱 안에서 연 패널은 뒤로 가기). */ closeHref: string; onClose?: undefined }
    | { /** 제어 패널 — 닫기 요청을 호출부에 넘긴다. 호출부가 열린 동안만 렌더한다. */ onClose: () => void; closeHref?: undefined }
  );

export function SidePanel(props: SidePanelProps) {
  const { title, returnFocus = true, children } = props;
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const guardRef = useRef<PanelGuard>({ dirtyCount: 0, submitting: false });
  // 우리가 직접 닫을 때 뒤따라 오는 네이티브 close 이벤트 한 번은 건너뛴다(ConfirmDialog 선례).
  const closedByUsRef = useRef(false);
  // 닫기는 한 번만 — Esc가 keydown과 cancel로 두 번 와도 router.back()이 두 번 부르지 않는다.
  const closingRef = useRef(false);
  const returnFocusRef = useRef(returnFocus);
  const propsRef = useRef(props);
  const [discardCount, setDiscardCount] = useState<number | null>(null);

  useEffect(() => {
    returnFocusRef.current = returnFocus;
    propsRef.current = props;
  });

  // 열기 — 마운트가 곧 열림이다(RSC가 `?new=1`일 때만 그리거나 호출부가 열린 동안만 그린다).
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!dialog.open) dialog.showModal();
    (dialog.querySelector<HTMLElement>(FIRST_FIELD) ?? dialog.querySelector<HTMLElement>('[data-ui="primary-button"]'))?.focus();
    return () => {
      if (dialog.open) dialog.close();
      if (!returnFocusRef.current) return;
      // 연 요소가 아직 문서에 있으면 거기로, 없으면 화면 제목으로(직접 URL로 들어온 패널 · 연 행이 사라진 경우).
      if (opener && document.contains(opener) && opener !== document.body) opener.focus();
      else document.querySelector<HTMLElement>('[data-ui="screen-title"]')?.focus();
    };
  }, []);

  const leave = useCallback(() => {
    const current = propsRef.current;
    if (current.onClose) {
      current.onClose();
      return;
    }
    const closeHref = current.closeHref;
    if (openedFromList(closeHref)) router.back();
    else router.replace(closeHref, { scroll: false });
  }, [router]);

  const closeNow = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    closedByUsRef.current = true;
    const dialog = dialogRef.current;
    if (dialog?.open) dialog.close();
    leave();
  }, [leave]);

  const requestClose = useCallback(
    (reason: PanelCloseReason) => {
      if (closingRef.current) return;
      if (reason !== "success") {
        const guard = guardRef.current;
        if (guard.submitting) return; // D7 — 제출 중에는 닫기를 무시한다.
        if (guard.dirtyCount > 0) {
          // DR1 A — 바뀐 칸이 있으면 Esc · x · 「취소」는 확인 창, 가림막은 무시.
          if (reason !== "scrim") setDiscardCount(guard.dirtyCount);
          return;
        }
      }
      closeNow();
    },
    [closeNow],
  );

  const context = useMemo<PanelContextValue>(
    () => ({
      setGuard(guard) {
        guardRef.current = guard;
      },
      requestClose,
    }),
    [requestClose],
  );

  // 네이티브 모달은 마지막 칸에서 Tab을 누르면 브라우저 화면으로 나간다 — 패널 안에서 돌게 첫 · 마지막 칸을 잇는다.
  function wrapTab(event: KeyboardEvent<HTMLDialogElement>) {
    const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(TABBABLE)).filter((item) => item.getClientRects().length > 0);
    const first = items[0];
    const last = items[items.length - 1];
    if (!first || !last) return;
    const active = document.activeElement;
    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDialogElement>) {
    if (event.key === "Tab") {
      wrapTab(event);
      return;
    }
    if (event.key !== "Escape") return;
    // 안쪽 컨트롤이 먼저 쓴 Esc · 조합 중 Esc는 닫기가 아니다 — 어느 쪽이든 네이티브 cancel은 막는다.
    const closes = isPanelCloseKey({ key: event.key, isComposing: event.nativeEvent.isComposing, defaultPrevented: event.defaultPrevented });
    event.preventDefault();
    if (closes) requestClose("esc");
  }

  // 키보드 밖의 취소(안드로이드 뒤로 등)도 스스로 닫지 않고 같은 닫기 경로로 묻는다.
  function handleCancel(event: SyntheticEvent<HTMLDialogElement>) {
    event.preventDefault();
    requestClose("esc");
  }

  // cancel 없이 닫힌 경우(브라우저 close watcher 등) — URL·상태를 맞춘다(R5). 다시 열린 뒤 늦게 온 이벤트는 건너뛴다.
  function handleNativeClose(event: SyntheticEvent<HTMLDialogElement>) {
    if (event.currentTarget.open) return;
    if (closedByUsRef.current) {
      closedByUsRef.current = false;
      return;
    }
    if (closingRef.current) return;
    closingRef.current = true;
    leave();
  }

  // dialog 자신이 클릭 대상이면 가림막이다(안쪽은 머리 · 본문이 꽉 채운다).
  function handleClick(event: MouseEvent<HTMLDialogElement>) {
    if (event.target === event.currentTarget) requestClose("scrim");
  }

  return (
    <PanelContext.Provider value={context}>
      <dialog
        ref={dialogRef}
        data-ui="side-panel"
        className={styles.panel}
        aria-labelledby={titleId}
        aria-modal="true"
        onKeyDown={handleKeyDown}
        onCancel={handleCancel}
        onClose={handleNativeClose}
        onClick={handleClick}
      >
        <div className={styles.hd}>
          <h2 id={titleId} className={styles.title}>
            {title}
          </h2>
          <button type="button" className={styles.close} aria-label="닫기" onClick={() => requestClose("x")}>
            <svg viewBox="0 0 24 24" aria-hidden="true" className={styles.closeIcon}>
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        </div>
        <div className={styles.content}>{children}</div>
      </dialog>
      <ConfirmDialog
        open={discardCount !== null}
        onClose={() => setDiscardCount(null)}
        title="입력 버리기"
        subtitle={`${title} · ${discardCount ?? 0}칸`}
        primary={{
          label: "입력 버리기",
          onConfirm: () => {
            setDiscardCount(null);
            closeNow();
          },
        }}
      />
    </PanelContext.Provider>
  );
}
