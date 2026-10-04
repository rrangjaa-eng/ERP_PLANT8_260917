"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Button } from "@/ui/button/Button";
import { Num } from "@/ui/num/Num";
import styles from "./PickDialog.module.css";

// UI-SPEC S14 · SYSTEM §6-3 「바꾸기 = 목록 골라내기」 — 목록에서 검색해 하나를 고르는 모달(PC 480) · 시트(폰). 사용처: 견적 줄 바꾸기 ·
// 견적 줄 고르기 · 거래처 바꾸기 · 거래처 고르기(05-07), 06 S10 연결 고르기. 확인 모달(ConfirmDialog)에 검색 · 선택을 얹은 것이 아니라
// 따로 선 컴포넌트다(슬롯에 검색 칸 · 선택 상태가 없다 — B5). 네이티브 <dialog> 틀(포커스 트랩 · Esc · 가림막 · 트리거 복귀)은 같다.
// 컴포넌트는 지출결의를 모른다 — 검색 함수 · 행 · 문구는 호출처가 넘긴다. 행의 고를 수 있음 · 이유는 서버가 판정해 보낸다.

export type PickRow = {
  type: "row";
  id: string;
  /** 번호 칸(견적 줄 번호) — 없으면 칸을 비운다. */
  number?: string | null;
  title: string;
  /** 거래처 부제 — 한 줄 말줄임. */
  subtitle?: string | null;
  /** 행 금액(실행가) — 외화면 fx로 2행. */
  amount?: { krw: number; fx?: { currency: string; amount: number; rate: number } } | null;
  selectable: boolean;
  /** 고를 수 없는 이유 · 보조 2행 — `aria-describedby`로 읽힌다. */
  reason?: string | null;
  /** 현재 줄 — 700 + 왼쪽 --focus-w --accent 선. */
  current?: boolean;
};

// 프로젝트 그룹 머리글 행(고르기 변형) · 한 줄로 접은 그룹 사유(`2차 고객 승인 전`).
export type PickGroup = { type: "group"; id: string; label: string; note?: string | null };
export type PickItem = PickRow | PickGroup;

export type PickResult = {
  items: PickItem[];
  /** 50행 상한을 넘었다 — 목록 끝 한 줄. */
  truncated: boolean;
  subtitle?: string | null;
  /** 목록 위 한 줄(표 전체 게이트 — 한 번만). */
  notice?: string | null;
  /** 검색어가 없는데 목록이 0일 때의 한 줄(예: 담당 프로젝트 줄이 없습니다) — 뒤에 ` · 검색으로 찾기` 3차가 선다. */
  emptyDefault?: string | null;
};

export type PickDialogProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  /** 검색 결과가 오기 전 부제 — 결과의 subtitle이 오면 그것이 이긴다. */
  subtitle?: string;
  /** 검색 칸 접근 이름 — 화면에 라벨을 그리지 않는다(자리표시자 글자). */
  searchLabel: string;
  /** 서버 조회 — 실패하면 null을 돌려주거나 던진다. */
  search: (query: string) => Promise<PickResult | null>;
  /** 1차 라벨(`이 줄로` · `이 거래처로`) — kbd Enter가 붙는다. */
  primaryLabel: string;
  /** 검색 0건 문구의 이름(`줄` → `조건에 맞는 줄이 없습니다 · 검색 지우기`). */
  noun: "줄" | "거래처";
  /** 고른 행의 결과 줄(1차가 할 일을 미리 말한다) — null이면 줄 없음. */
  resultLine?: (row: PickRow | null) => string | null;
  /** 1차를 누르거나 Enter. 거짓을 돌려주면 열린 채 남는다. */
  onPick: (row: PickRow) => void | boolean | Promise<void | boolean>;
};

function rowsOf(items: PickItem[]): PickRow[] {
  return items.filter((item): item is PickRow => item.type === "row");
}

export function PickDialog(props: PickDialogProps) {
  return props.open ? <PickDialogInner {...props} /> : null;
}

function PickDialogInner({ onClose, title, subtitle, searchLabel, search, primaryLabel, noun, resultLine, onPick }: PickDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  const closedByUsRef = useRef(false);
  const searchRef = useRef(search);
  const firstSearchRef = useRef(true);
  const titleId = useId();
  const listId = useId();
  const resultId = useId();

  const [query, setQuery] = useState("");
  const [shown, setShown] = useState<{ query: string; result: PickResult | null; failed: boolean } | null>(null);
  const [retry, setRetry] = useState(0);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);

  useEffect(() => {
    searchRef.current = search;
  }, [search]);

  // 열릴 때 — 네이티브 모달 + 검색 칸 첫 포커스. 닫히면(부모가 open을 내리면 이 컴포넌트째 사라진다) 트리거로 돌아간다.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || dialog.open) return;
    previouslyFocusedRef.current = document.activeElement as HTMLElement | null;
    dialog.showModal();
    searchInputRef.current?.focus();
  }, []);

  // 서버 조회 — 입력 뒤 짧은 지연(첫 조회는 바로). 오는 동안 이전 목록을 유지한다(빈칸 · 뼈대 없음).
  useEffect(() => {
    let cancelled = false;
    const delay = firstSearchRef.current ? 0 : 200;
    firstSearchRef.current = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        let result: PickResult | null = null;
        try {
          result = await searchRef.current(query);
        } catch {
          result = null;
        }
        if (cancelled) return;
        setShown((previous) => ({ query, result: result ?? previous?.result ?? null, failed: result === null }));
      })();
    }, delay);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, retry]);

  // 목록이 새로 오면 가리키던 행이 사라질 수 있다 — 선택은 파생값이라 저절로 풀리고(주 버튼이 꺼진다) 포커스가 갈 곳을 잃었으면 검색 칸으로 돌린다.
  useEffect(() => {
    if (activeId === null || shown?.result?.items.some((item) => item.type === "row" && item.id === activeId)) return;
    if (!dialogRef.current?.contains(document.activeElement) || document.activeElement === dialogRef.current) searchInputRef.current?.focus();
  }, [shown, activeId]);

  const loading = shown?.query !== query;
  const failed = !loading && shown?.failed === true;
  const result = shown?.result ?? null;
  const items = result?.items ?? [];
  const rows = rowsOf(items);
  const activeRow = rows.find((row) => row.id === activeId) ?? null;
  const chosen = activeRow?.selectable ? activeRow : null;
  const line = failed ? null : resultLine?.(chosen ?? null) ?? null;

  function closeNow() {
    const dialog = dialogRef.current;
    if (!dialog?.open) return;
    closedByUsRef.current = true;
    dialog.close();
    onClose();
    const trigger = previouslyFocusedRef.current;
    if (trigger && document.contains(trigger)) trigger.focus();
    else document.querySelector<HTMLElement>("h1")?.focus();
  }

  function handleDialogClose() {
    // 가림막 · Esc가 아닌 경로로 닫힌 경우의 마무리(closeNow가 이미 했으면 건너뛴다).
    if (closedByUsRef.current) return;
    onClose();
  }

  async function pickChosen() {
    if (!chosen || picking) return;
    setPicking(true);
    let keep = false;
    try {
      keep = (await onPick(chosen)) === false;
    } finally {
      setPicking(false);
    }
    if (!keep) closeNow();
  }

  function focusRow(id: string) {
    setActiveId(id);
    dialogRef.current?.querySelector<HTMLElement>(`[data-pick-id="${id}"]`)?.focus();
  }

  function moveFrom(id: string | null, delta: 1 | -1) {
    const index = id === null ? -1 : rows.findIndex((row) => row.id === id);
    const next = rows[index + delta];
    if (next) {
      focusRow(next.id);
    } else if (delta === -1) {
      setActiveId(null);
      searchInputRef.current?.focus();
    }
  }

  const noSearchHit = !loading && !failed && result !== null && rows.length === 0;
  const noneSelectable = !failed && result !== null && rows.length > 0 && rows.every((row) => !row.selectable);
  const fixedSubtitle = result?.subtitle ?? subtitle;

  let empty: ReactNode = null;
  if (noSearchHit) {
    if (query.trim() === "" && result?.emptyDefault) {
      empty = (
        <p className={styles.empty}>
          {`${result.emptyDefault} · `}
          <Button variant="tertiary" onClick={() => searchInputRef.current?.focus()}>
            검색으로 찾기
          </Button>
        </p>
      );
    } else if (query.trim() === "") {
      empty = <p className={styles.empty}>{`조건에 맞는 ${noun}이 없습니다`}</p>;
    } else {
      empty = (
        <p className={styles.empty}>
          {`조건에 맞는 ${noun}${noun === "줄" ? "이" : "가"} 없습니다 · `}
          <Button
            variant="tertiary"
            onClick={() => {
              setQuery("");
              searchInputRef.current?.focus();
            }}
          >
            검색 지우기
          </Button>
        </p>
      );
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        if (!picking) closeNow();
      }}
      onClose={handleDialogClose}
      onClick={(event) => {
        // dialog 요소 자체를 누른 것만 가림막 클릭이다.
        if (event.target === dialogRef.current && !picking) closeNow();
      }}
    >
      <div className={styles.hd}>
        <div className={styles.titleBlock}>
          <h2 id={titleId} className={styles.title}>
            {title}
          </h2>
          {fixedSubtitle ? <p className={styles.subtitle}>{fixedSubtitle}</p> : null}
        </div>
        <button type="button" className={styles.close} aria-label="닫기" onClick={() => !picking && closeNow()}>
          <svg viewBox="0 0 24 24" aria-hidden="true" className={styles.closeIcon}>
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
        </button>
      </div>

      <div className={styles.searchWrap}>
        <input
          ref={searchInputRef}
          type="text"
          className={styles.search}
          aria-label={searchLabel}
          placeholder={searchLabel}
          autoComplete="off"
          aria-controls={listId}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              const first = rows[0];
              if (first) focusRow(first.id);
            } else if (event.key === "Enter" && !event.ctrlKey) {
              event.preventDefault();
              void pickChosen();
            }
          }}
        />
      </div>

      {result?.notice && !failed ? <p className={styles.notice}>{result.notice}</p> : null}

      <div className={styles.body} aria-busy={loading || undefined}>
        {failed ? (
          <p className={styles.empty} role="alert">
            {"목록 불러오기 실패 · "}
            <Button variant="tertiary" onClick={() => setRetry((count) => count + 1)}>
              다시 시도
            </Button>
          </p>
        ) : (
          <>
            <ul id={listId} role="listbox" aria-label={searchLabel} className={styles.list}>
              {items.map((item) =>
                item.type === "group" ? (
                  <li key={`g-${item.id}`} role="presentation" className={styles.group}>
                    <span className={styles.groupLabel}>{item.label}</span>
                    {item.note ? <span className={styles.groupNote}>{item.note}</span> : null}
                  </li>
                ) : (
                  <PickRowView
                    key={item.id}
                    row={item}
                    active={item.id === activeId}
                    onActivate={() => focusRow(item.id)}
                    onMove={(delta) => moveFrom(item.id, delta)}
                    onEnter={() => void pickChosen()}
                    reasonId={`${listId}-${item.id}`}
                  />
                ),
              )}
            </ul>
            {empty}
            {noneSelectable && !empty ? <p className={styles.empty}>고를 수 있는 줄이 없습니다</p> : null}
            {result?.truncated ? <p className={styles.more}>50건 넘음 · 검색으로 좁히기</p> : null}
          </>
        )}
      </div>

      <div className={styles.foot}>
        {line ? (
          <p id={resultId} className={styles.resultLine}>
            {line}
          </p>
        ) : null}
        <div className={styles.actions}>
          <span className={styles.secondaryWrap}>
            <Button variant="secondary" shortcut="Esc" disabled={picking} aria-describedby={picking ? resultId : undefined} onClick={() => closeNow()}>
              취소
            </Button>
          </span>
          <span className={styles.primaryWrap}>
            <Button variant="primary" shortcut="Enter" pending={picking} disabled={!chosen} aria-describedby={listId} onClick={() => void pickChosen()}>
              {primaryLabel}
            </Button>
          </span>
        </div>
      </div>
    </dialog>
  );
}

function PickRowView({
  row,
  active,
  onActivate,
  onMove,
  onEnter,
  reasonId,
}: {
  row: PickRow;
  active: boolean;
  onActivate: () => void;
  onMove: (delta: 1 | -1) => void;
  onEnter: () => void;
  reasonId: string;
}) {
  return (
    <li
      role="option"
      data-pick-id={row.id}
      aria-selected={active && row.selectable ? "true" : "false"}
      aria-disabled={row.selectable ? undefined : "true"}
      aria-describedby={row.reason ? reasonId : undefined}
      tabIndex={active ? 0 : -1}
      className={[styles.row, row.number ? styles.numbered : "", row.current ? styles.current : "", row.selectable ? "" : styles.disabled].filter(Boolean).join(" ")}
      onClick={onActivate}
      onKeyDown={(event) => {
        if (event.key === "ArrowDown") {
          event.preventDefault();
          onMove(1);
        } else if (event.key === "ArrowUp") {
          event.preventDefault();
          onMove(-1);
        } else if (event.key === "Enter" && !event.ctrlKey) {
          event.preventDefault();
          onEnter();
        }
      }}
    >
      {row.number ? <span className={styles.number}>{row.number}</span> : null}
      <span className={styles.main}>
        <span className={styles.rowTitle}>{row.title}</span>
        {row.subtitle ? <span className={styles.rowSub}>{row.subtitle}</span> : null}
      </span>
      {row.amount ? (
        <span className={styles.amount}>
          <Num value={row.amount.krw} fx={row.amount.fx} />
        </span>
      ) : null}
      {row.reason ? (
        <span id={reasonId} className={styles.reason}>
          {row.reason}
        </span>
      ) : null}
    </li>
  );
}
