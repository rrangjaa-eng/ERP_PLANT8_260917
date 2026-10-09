"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Button } from "@/ui/button/Button";
import { splitRefreshTail } from "@/ui/confirm-dialog/ConfirmDialog";
import { Num } from "@/ui/num/Num";
import styles from "./PickDialog.module.css";

// UI-SPEC S14 · SYSTEM §6-3 「바꾸기 = 목록 골라내기」 — 목록에서 검색해 하나를 고르는 모달(PC 480) · 시트(폰). 사용처: 견적 줄 바꾸기 ·
// 견적 줄 고르기 · 거래처 바꾸기 · 거래처 고르기(05-07), 06 S10 연결 고르기. 공용 확인 모달에 검색 · 선택을 얹은 것이 아니라
// 따로 선 컴포넌트다(슬롯에 검색 칸 · 선택 상태가 없다 — B5). 네이티브 <dialog> 틀(포커스 트랩 · Esc · 가림막 · 트리거 복귀)은 같다.
// 컴포넌트는 지출결의를 모른다 — 검색 함수 · 행 · 문구는 호출처가 넘긴다. 행의 고를 수 있음 · 이유는 서버가 판정해 보낸다.
// 06.2 SP-62-1: `mode="multiple"` — 같은 틀로 여러 사람을 한 번에 고르는 변형(프로젝트 참여자 더하기). 단일 호출부는 그대로다.

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
  /** 검색어가 없는데 목록이 0일 때의 한 줄(예: 담당 프로젝트 줄이 없습니다) — 뒤에 ` · 검색으로 찾기` 3차가 선다(`emptyNextStep`을 주면 그 3차). */
  emptyDefault?: string | null;
  /**
   * 06-29(SP-8 · E-24) — 행은 있으나 고를 수 있는 줄이 0일 때 1차 비활성 이유(예 `이을 수 있는 줄 없음`). 바닥 줄 한 자리(`pickFootLine`)에만 서고,
   * 주면 본문 고정 줄(`고를 수 있는 줄이 없습니다`)은 그리지 않는다. 안 주면 05 그대로.
   */
  noneSelectableReason?: string | null;
};

type PickDialogBaseProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  /** 검색 결과가 오기 전 부제 — 결과의 subtitle이 오면 그것이 이긴다. */
  subtitle?: string;
  /** 검색 칸 접근 이름 — 화면에 라벨을 그리지 않는다(자리표시자 글자). */
  searchLabel: string;
  /** 서버 조회 — 실패하면 null을 돌려주거나 던진다. */
  search: (query: string) => Promise<PickResult | null>;
  /** 1차 라벨(`이 줄로` · `이 거래처로`) — kbd Enter가 붙는다. 다중 변형은 고른 수가 뒤에 붙는다(`참여자 더하기 2`). */
  primaryLabel: string;
  /** 검색 0건 문구의 이름(`줄` → `조건에 맞는 줄이 없습니다 · 검색 지우기`). */
  noun: "줄" | "거래처" | "프로젝트" | "사람";
  /**
   * 06-29(SP-8) — 빈 목록 줄(`emptyDefault`)과 「고를 수 있는 줄 0」의 다음 한 수 3차. 누르면 `onSelect()` 뒤 목록만 닫는다 —
   * 연결 라디오를 바꾸는 일은 호출자 몫. 안 주면 빈 목록 줄은 05 그대로 `검색으로 찾기`. 06.2: `null`이면 다음 한 수 없이 사실만 선다.
   */
  emptyNextStep?: { label: string; onSelect: () => void } | null;
  /** 06-29(C13) — 목록 로드 오류 줄의 명사형 이름(기본 `목록 불러오기 실패`). 뒤에 ` · ` + 2차 `다시 시도`. */
  failedLine?: string;
};

export type PickDialogSingleProps = PickDialogBaseProps & {
  mode?: "single";
  /** 고른 행의 결과 줄(1차가 할 일을 미리 말한다) — null이면 줄 없음. */
  resultLine?: (row: PickRow | null) => string | null;
  /** 1차를 누르거나 Enter. 거짓을 돌려주면 열린 채 남는다. */
  onPick: (row: PickRow) => void | boolean | Promise<void | boolean>;
};

/** 다중 변형의 1차 결과 — 거부(`ok: false`)면 다이얼로그가 닫히지 않고 `reason`이 바닥 줄 막힘 자리에 선다. `retryable`이면 1차를 막지 않는다(연결 실패). */
export type PickManyOutcome = { ok: true } | { ok: false; reason: string; retryable: boolean };

export type PickDialogManyProps = PickDialogBaseProps & {
  mode: "multiple";
  /** 고른 사람 전체의 결과 줄(`{이름} 외 N명 선택`) — 검색으로 가려진 고름도 들어온다. null이면 줄 없음. */
  resultLineMany: (rows: PickRow[]) => string | null;
  /** 1차를 누르거나 Enter — 고른 순서대로 전체를 넘긴다. 전부 되거나 전부 거부된다(`PickManyOutcome`). */
  onPickMany: (rows: PickRow[]) => Promise<PickManyOutcome>;
};

export type PickDialogProps = PickDialogSingleProps | PickDialogManyProps;

// 06.2 SP-62-1 — 1차 라벨 `{동작} N`(0이면 숫자 없음).
export function pickManyPrimaryLabel(label: string, count: number): string {
  return count > 0 ? `${label} ${count}` : label;
}

// 빈 목록 한 줄 — 받침에 맞춰 이/가를 고른다(`줄이` · `거래처가`).
export function pickEmptyText(noun: PickDialogProps["noun"], kind: "no-match" | "none-selectable"): string {
  const josa = noun === "줄" || noun === "사람" ? "이" : "가";
  return kind === "no-match" ? `조건에 맞는 ${noun}${josa} 없습니다` : `고를 수 있는 ${noun}${josa} 없습니다`;
}

// 바닥 줄 한 자리(E-24) — 결과 줄 > 고를 수 있는 줄 0일 때의 이유 > 고른 것 없음. 이유를 같은 뜻으로 두 줄 쓰지 않는다.
export function pickFootLine(
  resultLine: string | null | undefined,
  noneSelectableReason: string | null | undefined,
  idleReason: string | null | undefined,
): string | null {
  return resultLine ?? noneSelectableReason ?? idleReason ?? null;
}

function rowsOf(items: PickItem[]): PickRow[] {
  return items.filter((item): item is PickRow => item.type === "row");
}

export function PickDialog(props: PickDialogProps) {
  return props.open ? <PickDialogInner {...props} /> : null;
}

const DEFAULT_FAILED_LINE = "목록 불러오기 실패";

function PickDialogInner(props: PickDialogProps) {
  const { onClose, title, subtitle, searchLabel, search, primaryLabel, noun, emptyNextStep, failedLine = DEFAULT_FAILED_LINE } = props;
  const many = props.mode === "multiple" ? props : null;
  const single = props.mode === "multiple" ? null : props;
  const dialogRef = useRef<HTMLDialogElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  const closedByUsRef = useRef(false);
  const searchRef = useRef(search);
  const firstSearchRef = useRef(true);
  const titleId = useId();
  const listId = useId();
  const resultId = useId();
  const errorId = useId();
  const emptyId = useId();

  const [query, setQuery] = useState("");
  const [shown, setShown] = useState<{ query: string; result: PickResult | null; failed: boolean } | null>(null);
  const [retry, setRetry] = useState(0);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  // 06.2 SP-62-1 — 다중: 고른 행(고른 순서 · 검색과 무관하게 남는다) · 서버 거부(체크를 바꾸면 풀린다) · `새로 고침` 뒤 첫 결과에서만 목록에 없는 고름을 뺀다.
  const [selected, setSelected] = useState<PickRow[]>([]);
  const [rejection, setRejection] = useState<{ reason: string; retryable: boolean } | null>(null);
  const pruneOnNextResultRef = useRef(false);

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
        if (pruneOnNextResultRef.current && result) {
          pruneOnNextResultRef.current = false;
          // 잘린 목록은 없는 사람을 알 수 없다 — 서버가 다시 판정한다.
          if (!result.truncated) {
            const ids = new Set(rowsOf(result.items).map((row) => row.id));
            setSelected((previous) => previous.filter((row) => ids.has(row.id)));
          }
        }
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
  // 06-29(SP-8) — 목록이 오는 중 · 오류 중에는 옛 목록의 행을 고를 수 없다(1차 aria-disabled, Enter도 아무 일 없음).
  const chosen = !many && !loading && !failed && activeRow?.selectable ? activeRow : null;
  const line = failed || !single ? null : single.resultLine?.(chosen ?? null) ?? null;
  // UX-06 — 고른 행이 없어 1차가 꺼져 있으면 결과 줄 자리에 이유 한 줄(info 톤 — 막힘이 아니라 아직 안 고른 상태).
  const idleReason = chosen ? null : `고른 ${noun} 없음`;

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

  // 행에서 누른 Enter는 그 행(고를 수 있을 때만), 검색 칸 · 주 버튼은 가리키는 행을 고른다.
  async function pickChosen(only?: PickRow) {
    const target = only ?? chosen;
    if (!target?.selectable || picking) return;
    setPicking(true);
    let keep = false;
    try {
      keep = (await single?.onPick(target)) === false;
    } finally {
      setPicking(false);
    }
    if (!keep) closeNow();
  }

  // 다중 — 고름 토글(고를 수 없는 행 · 보내는 중 · 목록이 오는 중이나 오류 중에는 무반응 — 옛 목록의 행은 단일처럼 고르지 않는다). 체크를 바꾸면 거부가 걷힌다.
  function toggleRow(row: PickRow) {
    if (!row.selectable || picking || loading || failed) return;
    setRejection(null);
    setSelected((previous) => (previous.some((item) => item.id === row.id) ? previous.filter((item) => item.id !== row.id) : [...previous, row]));
  }

  const rejectionBlocks = rejection !== null && !rejection.retryable;
  const manyReady = many !== null && !loading && !failed && selected.length > 0 && !rejectionBlocks;

  async function pickMany() {
    if (!many || !manyReady || picking) return;
    setPicking(true);
    let outcome: PickManyOutcome;
    try {
      outcome = await many.onPickMany(selected);
    } finally {
      setPicking(false);
    }
    if (outcome.ok) closeNow();
    else setRejection({ reason: outcome.reason, retryable: outcome.retryable });
  }

  // 거부 꼬리 3차 `새로 고침` — 검색어를 지우고 목록만 다시 받는다(다이얼로그는 닫지 않는다). 목록에 없는 고름은 새 목록이 오면 빠진다.
  function refreshMany() {
    pruneOnNextResultRef.current = true;
    setRejection(null);
    setQuery("");
    setRetry((count) => count + 1);
    searchInputRef.current?.focus();
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
  // E-24 — 고를 수 있는 줄 0의 이유는 바닥 줄 한 자리에만(주어졌을 때 본문 고정 줄은 그리지 않는다).
  const noneSelectableReason = noneSelectable ? (result?.noneSelectableReason ?? null) : null;
  // 다중 — 후보 0(검색어 없는 빈 목록)이면 바닥 줄 `고른 {noun} 없음`을 그리지 않는다(같은 사실 두 자리 금지 — 1차가 빈 줄을 가리킨다).
  const noCandidates = many !== null && noSearchHit && query.trim() === "";
  const manyResultLine = !many || failed || selected.length === 0 ? null : many.resultLineMany(selected);
  const manyIdleReason = selected.length > 0 || noCandidates ? null : `고른 ${noun} 없음`;
  const rejectionSplit = splitRefreshTail(rejection?.reason);
  const footLine = many ? pickFootLine(rejectionSplit.reason ?? manyResultLine, null, manyIdleReason) : pickFootLine(line, noneSelectableReason, idleReason);
  const nextStepButton = emptyNextStep ? (
    <Button
      variant="tertiary"
      onClick={() => {
        emptyNextStep.onSelect();
        closeNow();
      }}
    >
      {emptyNextStep.label}
    </Button>
  ) : null;

  let empty: ReactNode = null;
  if (noSearchHit) {
    if (query.trim() === "" && result?.emptyDefault) {
      empty =
        emptyNextStep === null ? (
          <p id={emptyId} className={styles.empty}>
            {result.emptyDefault}
          </p>
        ) : (
          <p id={emptyId} className={styles.empty}>
            {`${result.emptyDefault} · `}
            {nextStepButton ?? (
              <Button variant="tertiary" onClick={() => searchInputRef.current?.focus()}>
                검색으로 찾기
              </Button>
            )}
          </p>
        );
    } else if (query.trim() === "") {
      empty = (
        <p id={emptyId} className={styles.empty}>
          {pickEmptyText(noun, "no-match")}
        </p>
      );
    } else {
      empty = (
        <p className={styles.empty}>
          {`${pickEmptyText(noun, "no-match")} · `}
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
      onKeyDown={(event) => {
        // 옆 패널 위에 겹쳐 설 때(SP-8) 이 목록의 키가 바깥 패널로 번지지 않게 한다 — Esc는 목록만 닫고(`isPanelCloseKey`가 defaultPrevented로 거른다),
        // Ctrl+Enter는 패널 1차(제출)에 닿지 않는다.
        if (event.nativeEvent.isComposing) return;
        if (event.key === "Escape") {
          event.preventDefault();
          if (!picking) closeNow();
        } else if (event.key === "Enter" && event.ctrlKey) {
          event.preventDefault();
          event.stopPropagation();
        }
      }}
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
              void (many ? pickMany() : pickChosen());
            }
          }}
        />
      </div>

      {result?.notice && !failed ? <p className={styles.notice}>{result.notice}</p> : null}

      <div className={styles.body} aria-busy={loading || undefined}>
        {failed ? (
          <p id={errorId} className={`${styles.empty} ${styles.error}`} role="alert">
            {`${failedLine} · `}
            <Button variant="secondary" onClick={() => setRetry((count) => count + 1)}>
              다시 시도
            </Button>
          </p>
        ) : (
          <>
            <ul id={listId} role="listbox" aria-multiselectable={many ? "true" : undefined} aria-label={searchLabel} className={many ? `${styles.list} ${styles.multiList}` : styles.list}>
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
                    onEnter={() => void (many ? pickMany() : pickChosen(item))}
                    multi={many ? { selected: selected.some((picked) => picked.id === item.id), onToggle: () => toggleRow(item) } : undefined}
                    reasonId={`${listId}-${item.id}`}
                  />
                ),
              )}
            </ul>
            {empty}
            {noneSelectable && !empty && !noneSelectableReason ? <p className={styles.empty}>{pickEmptyText(noun, "none-selectable")}</p> : null}
            {result?.truncated ? <p className={styles.more}>50건 넘음 · 검색으로 좁히기</p> : null}
          </>
        )}
      </div>

      <div className={styles.foot}>
        {rejection ? (
          <div className={`${styles.resultRow} ${styles.rejectRow}`}>
            <p id={resultId} className={`${styles.resultLine} ${styles.error}`}>
              {rejectionSplit.reason}
            </p>
            {rejectionSplit.refresh ? (
              <Button variant="tertiary" onClick={refreshMany}>
                새로 고침
              </Button>
            ) : null}
          </div>
        ) : noneSelectable && nextStepButton ? (
          <div className={styles.resultRow}>
            {footLine ? (
              <p id={resultId} className={styles.resultLine}>
                {footLine}
              </p>
            ) : null}
            {nextStepButton}
          </div>
        ) : footLine ? (
          <p id={resultId} className={styles.resultLine}>
            {footLine}
          </p>
        ) : null}
        <div className={styles.actions}>
          <span className={styles.secondaryWrap}>
            <Button variant="secondary" shortcut="Esc" disabled={picking} aria-describedby={picking ? resultId : undefined} onClick={() => closeNow()}>
              취소
            </Button>
          </span>
          <span className={styles.primaryWrap}>
            <Button
              variant="primary"
              shortcut="Enter"
              pending={picking}
              disabled={many ? !manyReady : !chosen}
              aria-describedby={failed ? errorId : noCandidates ? emptyId : footLine ? resultId : undefined}
              onClick={() => void (many ? pickMany() : pickChosen())}
            >
              {many ? pickManyPrimaryLabel(primaryLabel, selected.length) : primaryLabel}
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
  multi,
  reasonId,
}: {
  row: PickRow;
  active: boolean;
  onActivate: () => void;
  onMove: (delta: 1 | -1) => void;
  onEnter: () => void;
  /** 다중 변형 — option `aria-selected`가 고름이고 로빙 포커스 행이 현재 줄이다. */
  multi?: { selected: boolean; onToggle: () => void };
  reasonId: string;
}) {
  return (
    <li
      role="option"
      data-pick-id={row.id}
      aria-selected={multi ? (multi.selected ? "true" : "false") : active && row.selectable ? "true" : "false"}
      aria-disabled={row.selectable ? undefined : "true"}
      aria-describedby={row.reason ? reasonId : undefined}
      tabIndex={active ? 0 : -1}
      className={[styles.row, row.number ? styles.numbered : "", (multi ? active : row.current) ? styles.current : "", row.selectable ? "" : styles.disabled].filter(Boolean).join(" ")}
      onClick={() => {
        onActivate();
        multi?.onToggle();
      }}
      onKeyDown={(event) => {
        if (event.key === "ArrowDown") {
          event.preventDefault();
          onMove(1);
        } else if (event.key === "ArrowUp") {
          event.preventDefault();
          onMove(-1);
        } else if (event.key === " " && multi) {
          event.preventDefault();
          multi.onToggle();
        } else if (event.key === "Enter" && !event.ctrlKey) {
          event.preventDefault();
          onEnter();
        }
      }}
    >
      {multi ? <span className={styles.multiMark} aria-hidden="true" /> : null}
      {row.number ? <span className={styles.number}>{row.number}</span> : null}
      <span className={styles.main}>
        <span className={styles.rowTitle}>{row.title}</span>
        {row.subtitle ? (
          <span className={styles.rowSub} title={row.subtitle}>
            {row.subtitle}
          </span>
        ) : null}
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
