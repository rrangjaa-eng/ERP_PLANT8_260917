"use client";

import { Fragment, useEffect, useRef, useState, type ElementType, type ReactNode } from "react";
import Link from "next/link";
import { clampPage } from "@/lib/paging";
import { isCtrlCombo } from "@/lib/shortcut";
import { Num } from "@/ui/num/Num";
import { Pagination } from "@/ui/pagination/Pagination";
import styles from "./Table.module.css";
import { composeFooterNotice, withIssueCount, type FooterNoticeItem } from "./footer-notice";
import { crossPageTarget, nextEditableCell, pageEntryFocus, pageOfRow, pinNewRows, splitPageRangeText, splitPages, type FocusCell } from "./paging";
import { toTsv } from "./parse-tsv";
import { isGridActionAllowed } from "./save-lock";
import { APP_CLIPBOARD_FORMAT, readPasteClipboard } from "./use-clipboard-paste";
import { useMinWidth } from "./use-editable-width";
import type { CellEditability, CellIssue, TableColumn } from "./types";
import { conflictFocusTransition, useGridKeyboard, type ConflictFocusState, type GridPosition } from "./use-grid-keyboard";

// SYSTEM.md §7-3 + 보강 (가)~(아) — 편집/읽기 겸용 표. **렌더 형태는 서버가
// 보낸 셀 편집 가능성에서 파생된다 — 모드를 켜고 끄는 prop이 없다**(가).
//
// 04-04 — `enableGridKeyboard`는 **opt-in**이다(기본 false). 켜지 않은 표는
// 04-01/04-02가 만든 기존 동작(편집 가능 셀마다 tabIndex=0, 로빙 없음)을
// 그대로 유지한다 — revenue-section.tsx·관리자 표 등 이 플랜이 건드리지
// 않는 소비자의 회귀를 막는다(범위 경계). 켜면 표 전체가 탭 정지 1개인
// 로빙 tabIndex + 방향키 + Esc + Delete + 새 줄 + 줄 복제 + 줄 이동 +
// 붙여넣기 + 셀 오류·충돌 렌더가 활성화된다(§7-3 (아)).
export type TableKeyboardHandlers<Row> = {
  onDeleteRow?: (row: Row) => void;
  /** Ctrl+Enter — 새 줄. 포커스가 있던 행을 넘긴다(그룹 대분류 상속, D-62). */
  onNewRow?: (currentRow?: Row) => void;
  onDuplicateRow?: (row: Row) => void;
  /** Ctrl+E(편집 중이 아닐 때) — 활성 셀 줄의 줄 행동. 있을 때만 표가 이 키를 가로챈다. 05-08 — 둘째 인자는 범위 선택이 덮는 줄(위 → 아래, 선택이 없으면 그 줄 하나). */
  onOpenRow?: (row: Row, rangeRows: Row[]) => void;
  onMoveRow?: (row: Row, direction: "up" | "down") => void;
  onSave?: () => void;
  /** 편집 중 Esc — 그 셀 값을 되돌린다(커밋 없이 편집을 닫는다). */
  onEscapeCell?: (row: Row, columnKey: string) => void;
};

// 06-29(SP-1 · SYSTEM §7-3 (카)) — 일괄 처리 표의 선택. 선택의 뜻은 체크박스 `checked` 하나다 — 행 · 셀 `aria-selected`는 활성 셀 뜻 그대로(DR-7).
export type TableSelection<Row> = {
  selectedIds: readonly string[];
  /** 서버가 행마다 보낸 「고를 수 있음」. 못 고르면 이유 글자(그 행 첫 데이터 칸 2행)와 체크박스 `aria-describedby`가 된다. */
  selectable: (row: Row) => true | { reason: string };
  /** 고르기 · 풀기 · 머리글 일괄. 이 쪽 밖의 선택은 그대로 넘긴다. */
  onChange: (ids: string[]) => void;
  /** 체크박스 접근 이름 `{rowLabel} 고르기`. */
  rowLabel: (row: Row) => string;
  /** 처리 뒤 막힌 행의 이유(위험 색 글자). 막힌 행에도 배경 칠은 없다. */
  blockedReason?: (row: Row) => string | null;
  /** 표 안 `Ctrl+Enter` — 선택 표에는 새 줄이 없다(DR-8). 화면 1차(`{동사} N`)와 같은 일. */
  onPrimary?: () => void;
};

/** 처리 뒤 선택을 다시 세운다(H-3) — 지금 고를 수 있는 행만 순서대로 남긴다. 처리 결과를 받은 뒤 부른다. */
export function reconcileSelection<Row>(
  selectedIds: readonly string[],
  rows: readonly Row[],
  getRowId: (row: Row) => string,
  selectable: (row: Row) => true | { reason: string },
): string[] {
  const open = new Set(rows.filter((row) => selectable(row) === true).map(getRowId));
  return selectedIds.filter((id) => open.has(id));
}

export type TableProps<Row> = {
  caption: string;
  columns: TableColumn<Row>[];
  rows: Row[];
  getRowId: (row: Row) => string;
  groupBy?: (row: Row) => string;
  /** 그룹 머리글 글자(노드 가능 — 일부만 색 글자로 줄 때). 없으면 groupBy 키 — 키(리저브의 clientId)와 보이는 이름이 다를 때 준다. */
  groupHeader?: (row: Row) => ReactNode;
  /** 04.6-24 — `"rowgroup"`이면 그룹 머리글 칸이 `<th scope="rowgroup" colSpan>`이다(보조기기가 그 그룹의 행이라고 읽는다). 없으면 `<td colSpan>` 그대로. */
  groupHeaderScope?: "rowgroup";
  /** 04-42(S9) — 그룹 머리글 행 오른쪽 칸(굵게). 그룹의 첫 줄로 부른다 — 리저브 대장의 클라이언트 최종 잔액. */
  groupAside?: (row: Row) => ReactNode;
  emptyMessage?: string;
  emptyAction?: { label: string; onClick: () => void; shortcut?: string };
  /**
   * 합계 행(`<tr>`). 04-47(DR-16) — 함수면 표가 조립한 합계 행 오른쪽 한 줄(`footerNotices`·`footerSuccess`·표가 세는 오류·충돌 ·
   * 붙여넣기가 닿은 쪽)을 받아 그 행 안에 놓는다.
   */
  footer?: ReactNode | ((notice: ReactNode) => ReactNode);
  /** 04-47(DR-16) — 합계 행 오른쪽 한 줄에 넣을 항목(붙여넣기·상한·거부 요약). 주면 표가 제 오류·충돌 칸 수도 센다. */
  footerNotices?: FooterNoticeItem[];
  /** 04-47(DR-16) — 저장 성공 글자. 있으면 합계 행 오른쪽은 이것 하나다. */
  footerSuccess?: string | null;
  onCellCommit?: (rowId: string, columnKey: string, value: string) => void;
  /**
   * 04-02(U-3 계획 단계 판단) — 행이 0개일 때도 `footer`를 함께 렌더한다.
   * 기본은 false(기존 표의 EMPTY 단독 렌더 유지) — 입금 줄 표처럼 EMPTY
   * 상태에서도 합계 행에 미수 금액을 보여야 하는 표만 켠다.
   */
  alwaysShowFooter?: boolean;
  /** 04-04 — role="grid" 키보드 계약을 켠다(opt-in, 기본 false). */
  enableGridKeyboard?: boolean;
  keyboard?: TableKeyboardHandlers<Row>;
  /**
   * 04-04(다) — 활성(포커스) 셀에서 붙여넣기가 발생하면 위임한다. 04-47 — 앱 전용 형식(`appMeta`)도 넘기고, 채운(바꾸거나 만든)
   * 줄 id를 돌려받아 시작 쪽보다 뒤 쪽까지 닿았으면 합계 행에 `{k}쪽까지`를 더한다(`footerNotices`에 붙여넣기 머리가 있는 동안).
   */
  onPasteAtCell?: (row: Row, columnKey: string, clipboard: { text: string; appMeta: string | null }) => readonly string[] | void;
  /** 04-04(나)(다) — 셀 오류·충돌(있으면 고정 오류 모양 + aria-invalid). */
  cellIssue?: (row: Row, columnKey: string) => CellIssue | undefined;
  /** 04-04(바) — 폰에서 줄을 탭하면 호출된다(RowSheet를 여는 신호). */
  onRowTap?: (row: Row) => void;
  /** 04-31 — onRowTap 트리거의 접근 이름(사람이 읽을 값). 없으면 rowId(내부 키)를 쓴다(하위 호환). */
  rowLabel?: (row: Row) => string;
  /**
   * FINDING-015(코디네이터 대리 결정 2026-09-26) — 폰(<700)에서 행 전체(주 행 + 접힌 P2 줄)를 그 행의 링크 하나
   * (`data-row-link`를 단 `<a>`)의 누름 자리로 넓힌다. 행마다 제 `<tbody>`로 묶어 링크의 ::after가 두 줄을 덮는다.
   */
  phoneRowLink?: boolean;
  /** 04-04 — dirty(미저장 편집) 셀 고정 표시(좌측 인셋 선). */
  cellDirty?: (row: Row, columnKey: string) => boolean;
  /** 04-04 — 저장 성공 직후 600ms 틴트(Copywriting SUCCESS 행). */
  cellSaved?: (row: Row, columnKey: string) => boolean;
  /**
   * 04-30(DR-35) — 편집 셀이 있는 격자에서 편집기가 있는 열의 `edit`이 아닌 셀에 Enter·글자 입력·Delete가 오면
   * 편집 모드를 열지 않고(줄 삭제도 하지 않고) 이것만 부른다. 이유 표시는 호출부가 cellIssue `reason`으로 한다.
   */
  onBlockedEdit?: (row: Row, columnKey: string) => void;
  /**
   * 04-49(DR-3 · 계약 3) — 저장 요청 중. 격자 모양은 그대로 두고 `aria-busy`만 붙이며, 편집 진입·붙여넣기·구조·저장
   * 동작을 `isGridActionAllowed`로 거른다(방향키·범위 선택은 된다).
   */
  saveLocked?: boolean;
  /** 04-49(04-30 리뷰 S-5) — 셀 편집기가 열리고 닫힐 때 알린다(열린 편집기 값은 아직 dirty에 들지 않는다). */
  onEditingChange?: (editing: boolean) => void;
  /** 04-23 — 호출부가 방금 만든 줄의 한 칸을 편집 상태로 연다(객체가 바뀔 때마다 한 번, 그 칸이 `edit`일 때만). */
  openCell?: { rowId: string; columnKey: string } | null;
  /**
   * 04-19(D-91 · §7-3 (자)) — 화면 안 쪽 나눔. 그룹 정렬 뒤 표시 순서로 `pageSize`줄씩 자르고 지금 쪽의 줄만 그룹을 다시
   * 묶어 그린다(쪽마다 첫 줄의 그룹 머리글이 다시 나온다). 합계 행(`footer`)은 받은 그대로 모든 쪽에 — 표는 합계를 계산하지
   * 않는다. 쪽 번호는 표 안 상태(URL 아님)이고 `resetKey`가 바뀌면 1쪽으로. 쪽을 바꾸면 새 쪽의 활성 셀(격자) 또는
   * `focusHeadingId`(읽기 표 — 없으면 캡션)로 포커스한다(DR-23).
   */
  pagination?: {
    pageSize: number;
    unit: string;
    label: string;
    resetKey: string | number;
    focusHeadingId?: string;
    /**
     * 04-47(§7-3 (자)) — 새 줄(직전 분할에 없던 줄 id)은 만들어질 때의 쪽에 고정된다. 이 값이 바뀌면(저장 성공 · 서버 다시
     * 불러오기) 고정을 비우고 쪽 크기로 다시 나눈다. 사용자의 페이지 이동도 다시 나눈다.
     */
    resplitKey?: string | number;
  };
  /** 04-19 — 격자 Ctrl+C의 앱 형식(`application/x-plant8-quote-lines+json`). 복사한 줄을 받아 글자로. */
  copyMeta?: (rows: Row[]) => string;
  /** 04-19(§7-9) — 표 아래(페이지 줄 다음) 힌트 줄. 라벨 + kbd 묶음, 1024 미만에서 숨는다. */
  hint?: { label: string; keys: string }[];
  /**
   * 04-47(B-24) — 그룹을 지정해 더한 새 줄. 바뀌면 그 줄의 표시 위치(그룹 끝)가 있는 쪽으로 옮기고 그 쪽에 고정한다. 같은 줄을
   * `openCell`로 열지 않으면 그 줄의 첫 편집 셀에 포커스한다.
   */
  revealRowId?: string | null;
  /**
   * 04-47(DR-5 · 저장 거부) — 값이 바뀌면 `cellIssue`가 오류·충돌(`error` · `conflict`)인 셀을 표시 순서로 훑어 첫 셀의 쪽으로 옮기고
   * 그 셀(안에 입력이 있으면 그 입력)에 포커스한다. `reason`(잠긴 셀 편집 시도 이유)은 세지 않고, 찾은 셀이 없으면 아무것도 하지 않는다.
   */
  firstIssueSignal?: number;
  /** 04-18(S1 열 폭) — 참이면 1280 이상에서도 `collapseBelow: 1280` 열을 숨긴다(좁은 단계 — 서버가 페이지 금액 글자 수로 판정). */
  collapseEarly?: boolean;
  /** 06-29(SP-1) — 있으면 맨 왼쪽에 선택 열이 선다. 없으면 마크업 · 키 동작은 지금과 같다. */
  selection?: TableSelection<Row>;
};

type ActiveCell = { rowId: string; columnKey: string } | null;

// SC 8 — 오른쪽 정렬 열이 숫자 값(number)을 돌려주면 `Num`이 그린다(서식 · tabular-nums · 줄바꿈 없음). 이미 서식을 정한 문자열·노드는 그대로다.
function numericNode<Row>(column: TableColumn<Row>, value: ReactNode): ReactNode {
  return column.align === "right" && typeof value === "number" ? <Num value={value} /> : value;
}

// 04-18 — 정렬 방향 아이콘(Lucide arrow-up / arrow-down 경로, 패키지 없이 인라인 SVG — RowSheet 닫기 아이콘 선례).
function SortIcon({ direction }: { direction: "asc" | "desc" }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={styles.sortIcon}>
      {direction === "asc" ? (
        <>
          <path d="m5 12 7-7 7 7" />
          <path d="M12 19V5" />
        </>
      ) : (
        <>
          <path d="M12 5v14" />
          <path d="m19 12-7 7-7-7" />
        </>
      )}
    </svg>
  );
}

function groupRows<Row>(rows: Row[], groupBy?: (row: Row) => string, groupHeader?: (row: Row) => ReactNode): { key: string | null; header: ReactNode; rows: Row[] }[] {
  if (!groupBy) return [{ key: null, header: null, rows }];
  const groups: { key: string; header: ReactNode; rows: Row[] }[] = [];
  for (const row of rows) {
    const key = groupBy(row);
    const existing = groups.find((group) => group.key === key);
    if (existing) existing.rows.push(row);
    else groups.push({ key, header: groupHeader ? groupHeader(row) : key, rows: [row] });
  }
  return groups;
}

export function Table<Row>({
  caption,
  columns,
  rows,
  getRowId,
  groupBy,
  groupHeader,
  groupHeaderScope,
  groupAside,
  emptyMessage,
  emptyAction,
  footer,
  onCellCommit,
  alwaysShowFooter,
  enableGridKeyboard = false,
  keyboard,
  onPasteAtCell,
  cellIssue,
  onRowTap,
  rowLabel,
  phoneRowLink = false,
  cellDirty,
  cellSaved,
  onBlockedEdit,
  saveLocked = false,
  onEditingChange,
  openCell,
  pagination,
  copyMeta,
  hint,
  footerNotices,
  footerSuccess,
  revealRowId,
  firstIssueSignal,
  collapseEarly = false,
  selection,
}: TableProps<Row>) {
  const [activeCell, setActiveCell] = useState<ActiveCell>(null);
  const allowed = (action: Parameters<typeof isGridActionAllowed>[0]) => isGridActionAllowed(action, { saveLocked });
  // 04-49(DR-14) — collapseBelow로 숨은 열(CSS와 같은 폭 판정). 방향키가 건너뛴다.
  const atLeast1280 = useMinWidth(1280);
  const atLeast1024 = useMinWidth(1024);
  const isHiddenColumn = (column: TableColumn<Row> | undefined) =>
    (column?.collapseBelow === 1280 && (!atLeast1280 || collapseEarly)) || (column?.collapseBelow !== undefined && !atLeast1024);
  const collapseClass = (column: TableColumn<Row>) => (column.collapseBelow ? styles[`collapse-${column.collapseBelow}`] : "");

  // (가) — 편집 가능한 셀이 하나라도 있으면 role="grid" + --g-100 머리글,
  // 하나도 없으면 <table> + 시각적으로 숨긴 <caption> + 흰 머리글.
  const hasEditableCell = rows.some((row) =>
    columns.some((column) => (column.editability?.(row) ?? "readonly") === "edit"),
  );

  // 04-19 — 쪽 나눔은 그룹 정렬 뒤의 표시 순서를 자른다. 지금 쪽은 렌더마다 쪽 수 안으로 보정한다(clampPage — 04-29).
  const allGroups = groupRows(rows, groupBy, groupHeader);
  const displayRows = allGroups.flatMap((group) => group.rows);
  const displayIds = displayRows.map(getRowId);
  const [requestedPage, setRequestedPage] = useState(1);
  // 쪽을 바꾼 뒤에만 범위 글자를 읽는다(첫 렌더에는 비어 있다).
  const [pageAnnounced, setPageAnnounced] = useState(false);
  // 04-47(§7-3 (자)) — 새 줄 고정. `known`은 직전 분할의 줄 id, `pinned`는 새 줄 → 만들어진 쪽.
  const [pinState, setPinState] = useState<{ known: ReadonlySet<string>; pinned: Readonly<Record<string, number>>; resplitKey?: string | number }>(
    () => ({ known: new Set(displayIds), pinned: {}, resplitKey: pagination?.resplitKey }),
  );
  let targetPage = requestedPage;
  let pinned = pinState.pinned;
  let revealFocusId: string | null = null;
  const [seenResetKey, setSeenResetKey] = useState(pagination?.resetKey);
  const [seenReveal, setSeenReveal] = useState(revealRowId);
  if (pagination) {
    const resplit = pagination.resetKey !== seenResetKey || pagination.resplitKey !== pinState.resplitKey;
    if (pagination.resetKey !== seenResetKey) {
      setSeenResetKey(pagination.resetKey);
      setRequestedPage(1);
      targetPage = 1;
    }
    if (resplit) pinned = {};
    else if (displayIds.some((id) => !pinState.known.has(id))) pinned = pinNewRows({ ids: displayIds, known: pinState.known, pinned, page: requestedPage });
    if (revealRowId !== seenReveal) {
      setSeenReveal(revealRowId);
      if (revealRowId && displayIds.includes(revealRowId)) {
        const others = { ...pinned };
        delete others[revealRowId];
        const naturalPage = pageOfRow(splitPages(displayIds, { pageSize: pagination.pageSize, pinned: others }), revealRowId) ?? targetPage;
        pinned = { ...others, [revealRowId]: naturalPage };
        targetPage = naturalPage;
        setRequestedPage(naturalPage);
        setPageAnnounced(true);
        if (openCell?.rowId !== revealRowId) revealFocusId = revealRowId;
      }
    }
    if (resplit || pinned !== pinState.pinned || displayIds.some((id) => !pinState.known.has(id))) {
      setPinState({ known: new Set(displayIds), pinned, resplitKey: pagination.resplitKey });
    }
  }
  const pages = pagination ? splitPages(displayIds, { pageSize: pagination.pageSize, pinned }) : null;
  // 04-47(DR-5) — 첫 오류로 이동 신호. 고정 오류·충돌만 센다(reason은 아니다).
  const isFixedIssue = (row: Row, columnKey: string) => {
    const kind = cellIssue?.(row, columnKey)?.kind;
    return kind === "error" || kind === "conflict";
  };
  const [seenIssueSignal, setSeenIssueSignal] = useState(firstIssueSignal);
  let issueFocusId: string | null = null;
  // 폭 때문에 숨은 열(collapseBelow)의 오류면 그 칸에 포커스할 수 없다 — 격자는 그 줄의 보이는 P1 칸으로 간다.
  let issueRowFocusId: string | null = null;
  if (firstIssueSignal !== seenIssueSignal) {
    setSeenIssueSignal(firstIssueSignal);
    if (firstIssueSignal !== undefined) {
      for (const row of displayRows) {
        const column = columns.find((candidate) => isFixedIssue(row, candidate.key));
        if (!column) continue;
        const rowId = getRowId(row);
        if (enableGridKeyboard && isHiddenColumn(column)) issueRowFocusId = rowId;
        else issueFocusId = `${rowId}-${column.key}-issue`;
        const issuePage = pages ? pageOfRow(pages, rowId) : null;
        if (issuePage !== null && issuePage !== targetPage) {
          targetPage = issuePage;
          setRequestedPage(issuePage);
          setPageAnnounced(true);
        }
        break;
      }
    }
  }
  const page = pages ? clampPage(targetPage, pages.length) : 1;
  // 리뷰 S-1 — 보정한 쪽을 요청 쪽에도 되돌린다(줄이 다시 늘 때 사라졌던 쪽으로 튀지 않게).
  if (pages && page !== targetPage) setRequestedPage(page);
  const pageIds = pages ? new Set(pages[page - 1]) : null;
  const groups = pageIds ? groupRows(displayRows.filter((row) => pageIds.has(getRowId(row))), groupBy, groupHeader) : allGroups;
  // phoneRowLink — 그룹 하나 = <tbody> 하나 대신, 그룹 머리글과 행(주 행 + 접힌 줄)마다 제 <tbody>다.
  const GroupBody: ElementType = phoneRowLink ? Fragment : "tbody";
  const RowBody: ElementType = phoneRowLink ? "tbody" : Fragment;
  // 그룹 머리글 칸 — 기본 `<td>`, `groupHeaderScope="rowgroup"`이면 `<th scope="rowgroup">`.
  const GroupHeaderCell: ElementType = groupHeaderScope === "rowgroup" ? "th" : "td";
  const [focusRequest, setFocusRequest] = useState<{ kind: "cell" | "heading" } | { kind: "issue"; issueId: string } | null>(null);
  if (issueFocusId !== null) setFocusRequest({ kind: "issue", issueId: issueFocusId });
  const captionRef = useRef<HTMLTableCaptionElement>(null);
  // 그룹 머리글 행은 이 평탄화 목록에 들어오지 않는다 — 로빙 tabIndex·방향키
  // 좌표 체계가 데이터 행만 센다(방향키가 그룹 머리글을 "건너뛴다"는 (라)
  // 요구가 저절로 성립한다).
  const flatRows: Row[] = groups.flatMap((group) => group.rows);
  const rowById = new Map(displayRows.map((row) => [getRowId(row), row]));
  const findRow = (rowId: string) => flatRows.find((row) => getRowId(row) === rowId);

  // 06-29(SP-1) — 선택 열. 머리글은 이 쪽(지금 그려진 쪽)의 고를 수 있는 행 전체를 켜고 끈다. 고를 수 없는 행은 선택으로 세지 않는다.
  const selectedIdSet = new Set(selection?.selectedIds ?? []);
  const selectableRowIds = selection ? flatRows.filter((row) => selection.selectable(row) === true).map(getRowId) : [];
  const pageSelectedCount = selectableRowIds.filter((id) => selectedIdSet.has(id)).length;
  const pageAllSelected = selectableRowIds.length > 0 && pageSelectedCount === selectableRowIds.length;
  const pageSomeSelected = pageSelectedCount > 0 && !pageAllSelected;
  function toggleRowSelection(row: Row) {
    if (!selection || selection.selectable(row) !== true) return;
    const id = getRowId(row);
    selection.onChange(selectedIdSet.has(id) ? selection.selectedIds.filter((selectedId) => selectedId !== id) : [...selection.selectedIds, id]);
  }
  function togglePageSelection() {
    if (!selection || selectableRowIds.length === 0) return;
    const pageSet = new Set(selectableRowIds);
    selection.onChange(
      pageAllSelected
        ? selection.selectedIds.filter((id) => !pageSet.has(id))
        : [...selection.selectedIds, ...selectableRowIds.filter((id) => !selectedIdSet.has(id))],
    );
  }

  // 04-47(DR-16) — 붙여넣기가 닿은 마지막 쪽(시작 쪽보다 뒤일 때만). 호출부의 붙여넣기 머리가 지워지면(다음 저장 시도) 함께 지운다.
  const [pasteReach, setPasteReach] = useState<number | null>(null);
  const hasPasteHead = footerNotices?.some((item) => item.paste === "head") ?? false;
  if (pasteReach !== null && !hasPasteHead) setPasteReach(null);

  // 04-19(공백 4) — Alt+↑↓로 옮긴 줄이 다른 쪽으로 넘어가면 그 쪽으로 따라간다(포커스는 줄 id로 기억해 저절로 따라온다).
  const [followRowId, setFollowRowId] = useState<string | null>(null);
  if (followRowId !== null && pages) {
    setFollowRowId(null);
    const followPage = pageOfRow(pages, followRowId);
    if (followPage !== null && followPage !== page) {
      setRequestedPage(followPage);
      setPageAnnounced(true);
      setFocusRequest({ kind: "cell" });
    }
  }

  function cellEditability(column: TableColumn<Row>, row: Row): CellEditability {
    return column.editability?.(row) ?? "readonly";
  }

  // 04-28 — 편집 중 Esc로 입력 요소가 사라지면 포커스가 <body>로 빠져 표
  // 키보드가 끊긴다. 입력 요소가 내려간 뒤 그 셀로 포커스를 돌려준다(먼저
  // 옮기면 입력의 blur 커밋이 취소를 덮는다).
  const refocusCellRef = useRef(false);

  // 04-19 — Tab이 여는 셀: 편집기가 있고 지금 폭에서 보이는 `edit` 셀.
  const isTabStop = (rowId: string, colKey: string) => {
    const row = rowById.get(rowId);
    const column = columns.find((candidate) => candidate.key === colKey);
    return row !== undefined && column?.editCell !== undefined && !isHiddenColumn(column) && cellEditability(column, row) === "edit";
  };
  const colKeys = columns.map((column) => column.key);

  const keyboardState = useGridKeyboard({
    rowIds: flatRows.map(getRowId),
    colKeys,
    isEditableCell: (pos: GridPosition) => {
      const row = flatRows[pos.row];
      const column = columns[pos.col];
      if (!row || !column) return false;
      return cellEditability(column, row) === "edit";
    },
    isBlockedCell: (pos: GridPosition) => {
      const row = flatRows[pos.row];
      const column = columns[pos.col];
      if (!hasEditableCell || !row || !column || !column.editCell) return false;
      return cellEditability(column, row) !== "edit";
    },
    isEditing: (pos: GridPosition) => {
      const row = flatRows[pos.row];
      const column = columns[pos.col];
      if (!row || !column) return false;
      return activeCell !== null && activeCell.rowId === getRowId(row) && activeCell.columnKey === column.key;
    },
    saveLocked,
    isHiddenCol: (col) => isHiddenColumn(columns[col]),
    handlers: {
      onEnterEdit: (pos) => {
        const row = flatRows[pos.row];
        const column = columns[pos.col];
        if (!row || !column) return;
        setActiveCell({ rowId: getRowId(row), columnKey: column.key });
      },
      onEscape: (pos, wasEditing) => {
        const row = flatRows[pos.row];
        const column = columns[pos.col];
        if (wasEditing) {
          refocusCellRef.current = true;
          setActiveCell(null);
          if (row && column) keyboard?.onEscapeCell?.(row, column.key);
        }
      },
      onCommitDown: () => {
        refocusCellRef.current = true;
      },
      onDeleteRow: (rowId) => {
        const row = findRow(rowId);
        if (row) keyboard?.onDeleteRow?.(row);
      },
      onNewRow: (rowId) => {
        // 선택 표에는 새 줄이 없다 — 표 안 Ctrl+Enter는 화면 1차(DR-8).
        if (selection) {
          selection.onPrimary?.();
          return;
        }
        keyboard?.onNewRow?.(rowId === undefined ? undefined : findRow(rowId));
      },
      onDuplicateRow: (rowId) => {
        const row = findRow(rowId);
        if (row) keyboard?.onDuplicateRow?.(row);
      },
      onOpenRow: keyboard?.onOpenRow
        ? (rowId, rangeRowIds) => {
            const row = findRow(rowId);
            const rangeRows = rangeRowIds.map(findRow).filter((found): found is Row => found !== undefined);
            if (row) keyboard.onOpenRow?.(row, rangeRows);
          }
        : undefined,
      onMoveRow: (rowId, direction) => {
        const row = findRow(rowId);
        if (!row || !keyboard?.onMoveRow) return;
        keyboard.onMoveRow(row, direction);
        if (pages) setFollowRowId(rowId);
      },
      onBlockedEdit: onBlockedEdit
        ? (pos) => {
            const row = flatRows[pos.row];
            const column = columns[pos.col];
            if (row && column) onBlockedEdit(row, column.key);
          }
        : undefined,
      onSave: () => {
        // 04-30(엔지 r2) — 열린 셀 편집기를 먼저 커밋한다. 편집기 blur는 Enter 커밋과 같은 onCommit 경로이고,
        // 커밋 뒤 포커스는 그 셀로 돌아온다. 저장 호출부는 이 커밋이 반영된 뒤 페이로드를 모은다.
        const active = document.activeElement;
        if (activeCell && active instanceof HTMLElement && tableRef.current?.contains(active)) {
          refocusCellRef.current = true;
          active.blur();
        }
        keyboard?.onSave?.();
      },
    },
    // 04-19(C-18) — 쪽 끝을 넘는 ↑↓는 표시 순서의 옆 줄이 있는 쪽으로, 같은 열.
    onEdgeExit: (direction, colKey) => {
      if (!pages) return false;
      const pageRowIds = pages[page - 1] ?? [];
      const fromId = direction === "down" ? pageRowIds[pageRowIds.length - 1] : pageRowIds[0];
      const target = fromId === undefined ? null : crossPageTarget({ ids: displayRows.map(getRowId), fromId, direction, pages });
      if (!target) return false;
      goToCell(target.page, { rowId: target.rowId, colKey });
      return true;
    },
    // 04-19 — 편집 중 Tab: 칸 안에 다음 입력(단가의 통화·금액·환율)이 있으면 그리로, 아니면 값을 확정하고 옆 편집 셀을 연다.
    onTab: (pos, direction) => {
      const active = document.activeElement;
      if (!(active instanceof HTMLElement)) return;
      const inCell = Array.from(active.closest("td")?.querySelectorAll<HTMLElement>("input, select, textarea") ?? []);
      const sibling = inCell[inCell.indexOf(active) + (direction === "forward" ? 1 : -1)];
      if (sibling) {
        sibling.focus();
        return;
      }
      const from: FocusCell = { rowId: getRowId(flatRows[pos.row]!), colKey: colKeys[pos.col]! };
      const next = nextEditableCell({ rowIds: flatRows.map(getRowId), colKeys, isEditable: isTabStop, from, direction });
      let targetPage = page;
      let target: FocusCell | undefined;
      if ("crossPage" in next) {
        targetPage = page + (next.crossPage === "next" ? 1 : -1);
        const ids = pages?.[targetPage - 1] ?? [];
        const scanRows = direction === "forward" ? ids : [...ids].reverse();
        const scanCols = direction === "forward" ? colKeys : [...colKeys].reverse();
        for (const rowId of scanRows) {
          const colKey = scanCols.find((key) => isTabStop(rowId, key));
          if (colKey !== undefined) {
            target = { rowId, colKey };
            break;
          }
        }
      } else {
        target = next;
      }
      if (!target) {
        // 마지막(첫) 편집 셀 — 옆 셀이 없으면 값을 확정하고 포커스를 그 셀에 둔다(키는 이미 preventDefault).
        refocusCellRef.current = true;
        active.blur();
        return;
      }
      active.blur();
      if (targetPage !== page) {
        setRequestedPage(targetPage);
        setPageAnnounced(true);
      }
      keyboardState.setFocusCell(target);
      if (allowed("enterEdit")) setActiveCell({ rowId: target.rowId, columnKey: target.colKey });
      else setFocusRequest({ kind: "cell" });
    },
  });

  // 04-47(B-24) — 그룹 버튼의 새 줄을 호출부가 열지 않으면 그 줄의 첫 편집 셀로 포커스한다.
  if (revealFocusId !== null) {
    const revealRow = rowById.get(revealFocusId);
    const colKey = revealRow ? columns.find((column) => !isHiddenColumn(column) && cellEditability(column, revealRow) === "edit")?.key : undefined;
    if (colKey !== undefined) {
      keyboardState.setFocusCell({ rowId: revealFocusId, colKey });
      setFocusRequest({ kind: "cell" });
    }
  }

  if (issueRowFocusId !== null) {
    const colKey = columns.find((column) => column.priority === "p1" && !isHiddenColumn(column))?.key;
    if (colKey !== undefined) {
      keyboardState.setFocusCell({ rowId: issueRowFocusId, colKey });
      setFocusRequest({ kind: "cell" });
    }
  }

  function goToCell(nextPage: number, cell: FocusCell) {
    setRequestedPage(nextPage);
    setPageAnnounced(true);
    keyboardState.setFocusCell(cell);
    setFocusRequest({ kind: "cell" });
  }

  // 04-19 — Ctrl+C: 브라우저가 쏘는 네이티브 copy 이벤트에 격자 선택을 싣는다(Ctrl+A면 전체 줄, 범위면 쪽 안 사각형,
  // 아니면 활성 셀). 글자는 열의 copyText(견적 표는 04-24 직렬화), 앱 형식은 copyMeta. 선택이 없으면 이벤트 대상이
  // <body>라 document에서 받는다. 편집 중 입력·사용자가 끌어 고른 글자는 브라우저 기본 복사 그대로다.
  const copyRef = useRef<(event: ClipboardEvent) => void>(() => {});
  useEffect(() => {
    copyRef.current = (event) => {
      const table = tableRef.current;
      const active = document.activeElement;
      if (!enableGridKeyboard || !table || !active || !table.contains(active)) return;
      if (active.matches("input, textarea, select") || !columns.some((column) => column.copyText)) return;
      if (!keyboardState.allSelected && document.getSelection()?.isCollapsed === false) return;
      let copyRows: Row[];
      let copyColumns: TableColumn<Row>[];
      if (keyboardState.allSelected) {
        copyRows = displayRows;
        copyColumns = columns;
      } else {
        const { focus } = keyboardState;
        const anchor = keyboardState.selectionAnchor ?? focus;
        copyRows = flatRows.slice(Math.min(anchor.row, focus.row), Math.max(anchor.row, focus.row) + 1);
        copyColumns = columns.slice(Math.min(anchor.col, focus.col), Math.max(anchor.col, focus.col) + 1);
      }
      event.clipboardData?.setData("text/plain", toTsv(copyRows.map((row) => copyColumns.map((column) => column.copyText?.(row) ?? ""))));
      if (copyMeta) event.clipboardData?.setData(APP_CLIPBOARD_FORMAT, copyMeta(copyRows));
      event.preventDefault();
    };
  });
  useEffect(() => {
    const onCopy = (event: ClipboardEvent) => copyRef.current(event);
    document.addEventListener("copy", onCopy);
    return () => document.removeEventListener("copy", onCopy);
  }, []);

  // 04-28(앞 플랜 결함 — 04-04) — 방향키가 로빙 좌표(tabIndex)만 옮기고 DOM
  // 포커스는 옛 셀에 남아 「이동 ↑↓←→」가 동작하지 않았다. 표 안에 포커스가
  // 있을 때 좌표가 바뀌면 그 셀로 포커스를 옮긴다(편집 중 입력 요소는 건드리지 않는다).
  const tableRef = useRef<HTMLTableElement>(null);
  // 좌표가 실제로 바뀔 때만 옮긴다 — 첫 렌더(하이드레이션)에서 옮기면 그 전에
  // 사용자가 둔 포커스를 (0,0)으로 빼앗는다.
  const lastFocusRef = useRef(`${keyboardState.focus.row}:${keyboardState.focus.col}`);
  useEffect(() => {
    const key = `${keyboardState.focus.row}:${keyboardState.focus.col}`;
    if (lastFocusRef.current === key) return;
    lastFocusRef.current = key;
    if (!enableGridKeyboard) return;
    const table = tableRef.current;
    const active = document.activeElement;
    if (!table || !active || !table.contains(active)) return;
    const target = table.querySelector<HTMLElement>("td[data-grid-focus]");
    if (target && !target.contains(active)) target.focus();
  }, [enableGridKeyboard, keyboardState.focus.row, keyboardState.focus.col]);

  // 04-23 — 요청 객체가 바뀐 렌더에서 한 번 연다(렌더 중 상태 조정 — 효과 안 setState를 피한다).
  const [seenOpenCell, setSeenOpenCell] = useState(openCell);
  if (openCell !== seenOpenCell) {
    setSeenOpenCell(openCell);
    const rowIndex = openCell ? flatRows.findIndex((row) => getRowId(row) === openCell.rowId) : -1;
    const colIndex = openCell ? columns.findIndex((column) => column.key === openCell.columnKey) : -1;
    const row = flatRows[rowIndex];
    const column = columns[colIndex];
    if (openCell && row && column?.editCell && cellEditability(column, row) === "edit" && allowed("enterEdit")) {
      keyboardState.setFocus({ row: rowIndex, col: colIndex });
      setActiveCell(openCell);
    }
  }

  // DR-23 — 쪽 번호를 누른 뒤 포커스가 body로 떨어지지 않게 새 쪽의 셀(격자) 또는 제목·캡션(읽기 표)으로 보낸다.
  const focusHeadingId = pagination?.focusHeadingId;
  useEffect(() => {
    if (!focusRequest) return;
    if (focusRequest.kind === "cell") tableRef.current?.querySelector<HTMLElement>("td[data-grid-focus]")?.focus();
    else if (focusRequest.kind === "issue") {
      // 04-47(DR-5) — 오류 셀. 칸 안에 입력이 있으면(매출 표) 그 입력으로.
      const cell = tableRef.current?.querySelector<HTMLElement>(`td[aria-describedby="${CSS.escape(focusRequest.issueId)}"]`);
      (cell?.querySelector<HTMLElement>("input, select, textarea") ?? cell)?.focus();
    } else (focusHeadingId ? document.getElementById(focusHeadingId) : captionRef.current)?.focus();
  }, [focusRequest, focusHeadingId]);

  function changePage(next: number) {
    if (!pages || !pagination) return;
    setRequestedPage(next);
    setPageAnnounced(true);
    // 04-47(§7-3 (자)) — 사용자의 페이지 이동은 새 줄 고정을 비우고 쪽 크기로 다시 나눈다.
    const resplitPages = splitPages(displayIds, { pageSize: pagination.pageSize });
    setPinState({ known: new Set(displayIds), pinned: {}, resplitKey: pagination.resplitKey });
    const nextIds = resplitPages[next - 1] ?? [];
    const firstRow = displayRows.find((row) => getRowId(row) === nextIds[0]);
    if (!enableGridKeyboard || !firstRow) {
      setFocusRequest({ kind: "heading" });
      return;
    }
    const lastColKey = columns[keyboardState.focus.col]?.key;
    const editableColKeys = columns
      .filter((column) => !isHiddenColumn(column) && cellEditability(column, firstRow) === "edit")
      .map((column) => column.key);
    // 편집 셀이 없는 격자(좁은 폭 보기 전용)도 로빙 격자이므로 같은 열 첫 줄로 간다.
    const colKey = pageEntryFocus({ pageRowIds: nextIds, lastColKey, editableColKeys })?.colKey ?? lastColKey;
    keyboardState.setFocusCell({ rowId: getRowId(firstRow), colKey: colKey ?? colKeys[0] ?? "" });
    setFocusRequest({ kind: "cell" });
  }

  const editing = activeCell !== null;
  useEffect(() => {
    onEditingChange?.(editing);
  }, [editing, onEditingChange]);

  // 04-49 — 잠금이 걸리는 순간 표 안에 열려 있던 편집기는 버리지 않고 blur(커밋 입구)로 닫는다.
  useEffect(() => {
    if (!saveLocked) return;
    const active = document.activeElement;
    if (active instanceof HTMLElement && active.matches("input, textarea, select") && tableRef.current?.contains(active)) {
      active.blur();
    }
  }, [saveLocked]);

  useEffect(() => {
    if (!refocusCellRef.current || activeCell) return;
    refocusCellRef.current = false;
    tableRef.current?.querySelector<HTMLElement>("td[data-grid-focus]")?.focus();
  }, [activeCell]);

  // 04-28(DR-25) — 충돌 셀(3차 버튼 둘) 안의 키. 처리했으면 true, 격자 기본
  // 처리에 맡길 키면 false. 버튼은 tabindex=-1이라 격자의 탭 정지는 1개 그대로다.
  function handleConflictKey(event: React.KeyboardEvent<HTMLTableCellElement>, issue: CellIssue | undefined): boolean {
    const actions = issue?.kind === "conflict" ? issue.actions : undefined;
    if (!actions || actions.length !== 2 || event.ctrlKey || event.altKey) return false;
    const cell = event.currentTarget;
    const buttons = Array.from(cell.querySelectorAll<HTMLButtonElement>("button[data-issue-action]"));
    const buttonIndex = buttons.indexOf(event.target as HTMLButtonElement);
    let state: ConflictFocusState;
    if (buttonIndex !== -1) state = { at: "action", index: buttonIndex };
    else if (event.target === cell) state = { at: "cell" };
    else return false;
    const next = conflictFocusTransition(state, event.key);
    if (!next) return false;
    event.preventDefault();
    if (next.at === "action") {
      buttons[next.index]?.focus();
    } else {
      if (next.pressed !== undefined) actions[next.pressed]?.onClick();
      cell.focus();
    }
    return true;
  }

  // 04-47(DR-16) — 합계 행 오른쪽 한 줄. 표가 세는 오류·충돌(서버 거부 요약이 같은 수를 말하면 그 요약) + 호출부 항목 + 붙여넣기가 닿은 쪽.
  let noticeContent: ReactNode = null;
  if (footerNotices !== undefined || footerSuccess) {
    let errorCells = 0;
    const conflictRows = new Set<string>();
    for (const row of displayRows) {
      for (const column of columns) {
        const kind = cellIssue?.(row, column.key)?.kind;
        if (kind === "error") errorCells++;
        if (kind === "conflict") conflictRows.add(getRowId(row));
      }
    }
    const reachItem: FooterNoticeItem[] = pasteReach !== null && hasPasteHead ? [{ tone: "muted", text: `${pasteReach}쪽까지`, paste: "reach" }] : [];
    const counted = withIssueCount(footerNotices ?? [], { errorCells, conflictRows: conflictRows.size });
    const pieces = composeFooterNotice([...counted, ...reachItem], { successText: footerSuccess });
    noticeContent =
      pieces.length > 0 ? (
        <span className={styles.footerNotice}>
          {pieces.map((piece, index) => (
            <Fragment key={index}>
              {index > 0 ? " · " : null}
              <span data-tone={piece.tone} className={`${styles.noticePiece} ${styles[`tone-${piece.tone}`]}`}>
                {piece.text}
              </span>
            </Fragment>
          ))}
        </span>
      ) : null;
  }
  const footerContent = typeof footer === "function" ? footer(noticeContent) : footer;

  if (rows.length === 0) {
    return (
      <table className={styles.table} aria-busy={saveLocked ? true : undefined}>
        <caption className="sr-only">{caption}</caption>
        <tbody>
          <tr>
            <td className={styles.emptyCell}>
              <span>{emptyMessage ?? "데이터가 없습니다"}</span>
              {emptyAction ? (
                <button
                  type="button"
                  className={styles.emptyAction}
                  onClick={() => {
                    if (allowed("newRow")) emptyAction.onClick();
                  }}
                  onKeyDown={(event) => {
                    // 04-28 — 표시한 kbd(Ctrl+Enter)가 실제로 동작한다(C-07).
                    if (emptyAction.shortcut === "Ctrl+Enter" && isCtrlCombo(event, "Enter")) {
                      event.preventDefault();
                      if (allowed("newRow")) emptyAction.onClick();
                    }
                  }}
                >
                  {emptyAction.label}
                  {emptyAction.shortcut ? <kbd className={styles.emptyActionKbd}>{emptyAction.shortcut}</kbd> : null}
                </button>
              ) : null}
            </td>
          </tr>
        </tbody>
        {alwaysShowFooter && footerContent ? <tfoot aria-live="polite">{footerContent}</tfoot> : null}
      </table>
    );
  }

  function renderCell(column: TableColumn<Row>, row: Row) {
    const rowId = getRowId(row);
    const editability = cellEditability(column, row);
    const isActive = activeCell !== null && activeCell.rowId === rowId && activeCell.columnKey === column.key;

    if (isActive && editability === "edit" && column.editCell) {
      return column.editCell(row, {
        onCommit: (value) => {
          // QA ISSUE-001 — 편집기가 포커스를 쥔 채 확정(선택 칸 change)하면 편집기가 내려가며 포커스가 body로 빠진다 — 셀로 돌린다.
          const editorHoldsFocus = document.activeElement instanceof HTMLElement && document.activeElement.matches("input, select, textarea");
          onCellCommit?.(rowId, column.key, value);
          setActiveCell(null);
          if (editorHoldsFocus) setFocusRequest({ kind: "cell" });
        },
        onCancel: () => setActiveCell(null),
      });
    }

    const primary = numericNode(column, column.cell(row));
    const secondary = column.secondaryLine?.(row);
    if (secondary === null || secondary === undefined || secondary === "") return primary;
    return (
      <>
        <div>{primary}</div>
        <div className={styles.cellSecondary}>{secondary}</div>
      </>
    );
  }

  function handleTablePaste(event: React.ClipboardEvent<HTMLTableElement>) {
    if (!enableGridKeyboard || !onPasteAtCell) return;
    if (!allowed("paste")) {
      event.preventDefault();
      return;
    }
    // 편집 중인 셀의 <input>·<textarea>에서 bubbling된 paste는 그 칸의
    // 네이티브 붙여넣기(값 그대로 들어가 onChange가 처리)로 두고, 표
    // 수준 TSV 붙여넣기로 가로채지 않는다.
    const target = event.target as HTMLElement | null;
    if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
    const row = flatRows[keyboardState.focus.row];
    const column = columns[keyboardState.focus.col];
    if (!row || !column || !event.clipboardData) return;
    const clipboard = readPasteClipboard(event.clipboardData);
    if (!clipboard.text) return;
    event.preventDefault();
    const filled = onPasteAtCell(row, column.key, clipboard);
    // QA ISSUE-002 — 붙인 줄이 다른 그룹으로 옮겨 가면 포커스를 쥔 셀이 다시 그려져 body로 빠진다 — 탭 정지 셀로 돌린다.
    setFocusRequest({ kind: "cell" });
    // 04-47(§7-3 (자)) — 화면은 시작 쪽에 머문다. 채운 줄이 뒤 쪽까지 닿았으면 합계 행에 `{k}쪽까지`(새 줄은 시작 쪽에 고정된다).
    const reach = pages && filled ? Math.max(page, ...filled.map((id) => pageOfRow(pages, id) ?? page)) : page;
    setPasteReach(reach > page ? reach : null);
  }

  // 04-47(S4 error) — 다른 쪽의 오류·충돌 칸 수(번호 옆 `오류 N`). 지금 쪽은 세지 않는다.
  const pageErrorCounts: Record<number, number> = {};
  pages?.forEach((pageIds, index) => {
    if (index + 1 === page) return;
    const count = pageIds.reduce((sum, rowId) => {
      const row = rowById.get(rowId);
      return sum + (row ? columns.filter((column) => isFixedIssue(row, column.key)).length : 0);
    }, 0);
    if (count > 0) pageErrorCounts[index + 1] = count;
  });

  const rangeText = pagination && pages ? splitPageRangeText({ pages, page, unit: pagination.unit }) : "";

  return (
    <>
      {pagination ? (
        <p className="sr-only" aria-live="polite">
          {pageAnnounced ? rangeText : ""}
        </p>
      ) : null}
      <table
        ref={tableRef}
        className={[styles.table, hasEditableCell ? styles.editable : styles.readonly, collapseEarly ? styles.collapseEarly : ""].join(" ")}
        role={hasEditableCell ? "grid" : undefined}
        aria-busy={saveLocked ? true : undefined}
        onPaste={enableGridKeyboard ? handleTablePaste : undefined}
      >
        <caption
          ref={captionRef}
          className="sr-only"
          tabIndex={pagination && !focusHeadingId && !enableGridKeyboard ? -1 : undefined}
        >
          {caption}
        </caption>
        <thead>
          <tr>
            {selection ? (
              <th scope="col" role={hasEditableCell ? "columnheader" : undefined} className={[styles.headerCell, styles.selectHead].join(" ")}>
                <label className={styles.selectLabel}>
                  <input
                    type="checkbox"
                    aria-label="이 쪽 전체 고르기"
                    aria-disabled={selectableRowIds.length === 0 ? "true" : undefined}
                    checked={pageAllSelected}
                    ref={(element) => {
                      if (element) element.indeterminate = pageSomeSelected;
                    }}
                    onChange={togglePageSelection}
                  />
                </label>
              </th>
            ) : null}
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={[
                  styles.headerCell,
                  styles[`prio-${column.priority}`],
                  collapseClass(column),
                  column.align === "right" ? styles.alignRight : "",
                ].join(" ")}
                aria-sort={column.sort?.direction ? (column.sort.direction === "asc" ? "ascending" : "descending") : undefined}
                aria-describedby={column.headerDescribedBy}
              >
                {column.sort ? (
                  <Link href={column.sort.href} className={styles.sortLink}>
                    {column.header}
                    {column.sort.direction ? <SortIcon direction={column.sort.direction} /> : null}
                  </Link>
                ) : column.headerHidden ? (
                  <span className="sr-only">{column.header}</span>
                ) : (
                  column.header
                )}
              </th>
            ))}
          </tr>
        </thead>
        {groups.map((group, groupIndex) => (
          <GroupBody key={group.key ?? `group-${groupIndex}`}>
            {group.header !== null ? (
              <RowBody>
                <tr className={styles.groupRow}>
                  <GroupHeaderCell scope={groupHeaderScope} colSpan={columns.length + (selection ? 1 : 0)} className={styles.groupHeader}>
                    {group.header}
                    {groupAside && group.rows[0] !== undefined ? <span className={styles.groupAside}>{groupAside(group.rows[0])}</span> : null}
                  </GroupHeaderCell>
                </tr>
              </RowBody>
            ) : null}
            {group.rows.map((row) => {
              const rowId = getRowId(row);
              const flatRowIndex = flatRows.indexOf(row);
              // 편집 가능 열은 summary가 있을 때만 접힌 줄에 낀다 — 그러지
              // 않으면 같은 입력 요소가 주 행·접힌 줄 두 곳에 동시에
              // 마운트된다(중복 aria-label, 상태 불일치).
              const p2Values = columns
                .filter((column) => column.priority === "p2")
                .filter((column) => cellEditability(column, row) !== "edit" || column.summary)
                .map((column) => numericNode(column, column.summary ? column.summary(row) : column.cell(row)))
                .filter((value): value is ReactNode => value !== null && value !== undefined && value !== "");

              // 06-29(SP-1) — 고른 행 = selectedIds에 있고 지금 고를 수 있는 행. 막힌 행은 배경 칠 없이 이유 글자만.
              const gate = selection?.selectable(row);
              const rowSelectable = gate === true;
              const rowSelected = rowSelectable && selectedIdSet.has(rowId);
              const gateReason = gate !== undefined && gate !== true ? gate.reason : null;
              const blockedText = selection?.blockedReason?.(row) ?? null;
              const gateReasonId = gateReason !== null ? `${rowId}-select-reason` : undefined;
              const blockedReasonId = blockedText ? `${rowId}-select-blocked` : undefined;

              return (
                <RowBody key={rowId} {...(phoneRowLink ? { className: styles.rowLinkGroup } : {})}>
                  <tr>
                    {selection ? (
                      <td
                        role={hasEditableCell ? "gridcell" : undefined}
                        className={[styles.cell, styles.selectCell, rowSelected ? styles.selectedRow : ""].join(" ")}
                        onKeyDown={(event) => {
                          // 체크박스 위 Ctrl+Enter도 화면 1차다(DR-8). Space는 체크박스 기본 동작.
                          if (isCtrlCombo(event, "Enter")) {
                            event.preventDefault();
                            selection.onPrimary?.();
                          }
                        }}
                      >
                        <label className={styles.selectLabel}>
                          <input
                            type="checkbox"
                            tabIndex={-1}
                            aria-label={`${selection.rowLabel(row)} 고르기`}
                            aria-disabled={rowSelectable ? undefined : "true"}
                            aria-describedby={[gateReasonId, blockedReasonId].filter(Boolean).join(" ") || undefined}
                            checked={rowSelected}
                            onChange={() => toggleRowSelection(row)}
                          />
                        </label>
                      </td>
                    ) : null}
                    {columns.map((column, colIndex) => {
                      const editability = cellEditability(column, row);
                      const isEditableColumn = editability === "edit";
                      const pos: GridPosition = { row: flatRowIndex, col: colIndex };
                      const isFocusPos =
                        enableGridKeyboard && keyboardState.focus.row === pos.row && keyboardState.focus.col === pos.col;
                      const issue = cellIssue?.(row, column.key);
                      const issueId = issue ? `${rowId}-${column.key}-issue` : undefined;
                      const invalid = issue !== undefined && issue.kind !== "reason";

                      return (
                        <td
                          key={column.key}
                          role={hasEditableCell ? "gridcell" : undefined}
                          aria-readonly={hasEditableCell ? editability !== "edit" : undefined}
                          aria-invalid={invalid ? true : undefined}
                          aria-describedby={issueId}
                          data-grid-focus={isFocusPos ? "" : undefined}
                          tabIndex={
                            enableGridKeyboard
                              ? isFocusPos
                                ? 0
                                : -1
                              : hasEditableCell && isEditableColumn
                                ? 0
                                : undefined
                          }
                          className={[
                            styles.cell,
                            styles[`prio-${column.priority}`],
                            collapseClass(column),
                            column.align === "right" ? styles.alignRight : "",
                            isEditableColumn ? styles.editableCell : "",
                            editability === "locked" ? styles.lockedCell : "",
                            invalid ? (issue.kind === "conflict" ? styles.conflictCell : styles.errorCell) : "",
                            enableGridKeyboard && keyboardState.isInSelection(pos) ? styles.selectedCell : "",
                            rowSelected ? styles.selectedRow : "",
                            !invalid && cellDirty?.(row, column.key) ? styles.dirtyCell : "",
                            cellSaved?.(row, column.key) ? styles.savedTint : "",
                          ].join(" ")}
                          onClick={() => {
                            if (enableGridKeyboard) keyboardState.setFocus(pos);
                            if (isEditableColumn && column.editCell && allowed("enterEdit")) {
                              setActiveCell({ rowId, columnKey: column.key });
                            }
                          }}
                          onFocus={(event) => {
                            if (!enableGridKeyboard) return;
                            // 셀 안 편집기·버튼으로 들어가는 focus는 전처럼 선택을 푼다.
                            if (event.target === event.currentTarget) keyboardState.syncFocus(pos);
                            else keyboardState.setFocus(pos);
                          }}
                          onKeyDown={
                            enableGridKeyboard
                              ? (event) => {
                                  // 선택 표 — 편집 중이 아닐 때 Space는 활성 셀 행 고르기(편집 진입은 Enter · 글자 입력). 격자 키보드 훅보다 먼저 받는다.
                                  if (
                                    selection &&
                                    event.key === " " &&
                                    event.target === event.currentTarget &&
                                    activeCell === null &&
                                    !event.ctrlKey &&
                                    !event.altKey &&
                                    !event.shiftKey &&
                                    !event.nativeEvent.isComposing
                                  ) {
                                    event.preventDefault();
                                    toggleRowSelection(row);
                                    return;
                                  }
                                  if (handleConflictKey(event, issue)) return;
                                  keyboardState.handleKeyDown(event, pos);
                                }
                              : (event) => {
                                  // 04-41 — 격자 키보드를 켜지 않은 표도 onSave를 받으면 칸 안의 Ctrl+S가 저장이다(매출 표).
                                  if (keyboard?.onSave && isCtrlCombo(event, "s")) {
                                    event.preventDefault();
                                    if (allowed("save")) keyboard.onSave();
                                    return;
                                  }
                                  if ((event.key === "Enter" || event.key === " ") && isEditableColumn && column.editCell && allowed("enterEdit")) {
                                    event.preventDefault();
                                    setActiveCell({ rowId, columnKey: column.key });
                                  }
                                }
                          }
                        >
                          {renderCell(column, row)}
                          {issue ? (
                            <p id={issueId} className={styles.issueReason}>
                              {issue.message}
                              {issue.actions?.map((action, index) => (
                                <Fragment key={action.label}>
                                  {index === 0 ? " · " : " / "}
                                  <button
                                    type="button"
                                    tabIndex={-1}
                                    data-issue-action=""
                                    className={styles.issueAction}
                                    onClick={(event) => {
                                      // 셀 클릭(편집 진입)으로 번지지 않게 하고, 누른 뒤 포커스는 그 셀로.
                                      event.stopPropagation();
                                      const cell = event.currentTarget.closest("td");
                                      action.onClick();
                                      cell?.focus();
                                    }}
                                  >
                                    {action.label}
                                  </button>
                                </Fragment>
                              ))}
                            </p>
                          ) : null}
                          {selection && colIndex === 0 && gateReason !== null ? (
                            <p id={gateReasonId} className={styles.selectReason}>
                              {gateReason}
                            </p>
                          ) : null}
                          {selection && colIndex === 0 && blockedText ? (
                            <p id={blockedReasonId} className={`${styles.selectReason} ${styles.selectBlocked}`}>
                              {blockedText}
                            </p>
                          ) : null}
                        </td>
                      );
                    })}
                  </tr>
                  {p2Values.length > 0 ? (
                    <tr
                      className={styles.collapsedRow}
                      aria-hidden={onRowTap ? undefined : "true"}
                    >
                      {onRowTap ? (
                        <td
                          colSpan={columns.length + (selection ? 1 : 0)}
                          className={[styles.collapsedCell, styles.collapsedCellTap].join(" ")}
                          role="button"
                          tabIndex={0}
                          aria-label={`${rowLabel ? rowLabel(row) : rowId} 상세 보기`}
                          onClick={() => onRowTap(row)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              onRowTap(row);
                            }
                          }}
                        >
                          {p2Values.map((value, index) => (
                            <span key={index}>{index > 0 ? " · " : ""}{value}</span>
                          ))}
                        </td>
                      ) : (
                        <td colSpan={columns.length + (selection ? 1 : 0)} className={styles.collapsedCell}>
                          {p2Values.map((value, index) => (
                            <span key={index}>{index > 0 ? " · " : ""}{value}</span>
                          ))}
                        </td>
                      )}
                    </tr>
                  ) : null}
                </RowBody>
              );
            })}
          </GroupBody>
        ))}
        {footerContent ? <tfoot aria-live="polite">{footerContent}</tfoot> : null}
      </table>
      {pagination && pages ? (
        <Pagination
          label={pagination.label}
          page={page}
          pageCount={pages.length}
          rangeText={rangeText}
          onPageChange={changePage}
          errorCounts={pageErrorCounts}
        />
      ) : null}
      {hint && hint.length > 0 ? (
        <p className={styles.hintRow}>
          {hint.map((item, index) => (
            <Fragment key={item.label}>
              {index > 0 ? " · " : ""}
              {item.label} <kbd>{item.keys}</kbd>
            </Fragment>
          ))}
        </p>
      ) : null}
    </>
  );
}
