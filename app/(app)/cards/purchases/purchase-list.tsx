"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Table } from "@/ui/table/Table";
import { RowSheet } from "@/ui/table/RowSheet";
import type { TableColumn } from "@/ui/table/types";
import { Num } from "@/ui/num/Num";
import { StatusTag } from "@/ui/status-tag/StatusTag";
import { ListEmpty } from "@/ui/list-empty/ListEmpty";
import { RowAction, RowActions } from "@/ui/row-actions/RowActions";
import { formatForeignLine, formatKrw } from "@/lib/format-number";
// 필터 칸 모양은 프로젝트 목록 필터와 같은 클래스(새 CSS 없음).
import filterStyles from "@/app/(app)/projects/projects.module.css";
import cardStyles from "../cards.module.css";
import { PURCHASE_STATUS_VIEWS, purchaseStatusWord, type PurchaseStatus, type PurchaseStatusView } from "./purchase-status-word";
import styles from "./purchases.module.css";
import { PurchaseCancelButton, type PurchaseCancelTarget } from "./cancel-undo";

// 06-08(UI-SPEC S11): 구매 요청 읽기 표 + 필터 줄 + 로드 오류 한 줄. 06-14: 행 `요청 취소`(요청자 본인 즉시 · 구매 권한자의 남의 요청 사유 창) · 취소 행 2행.
// 06-12: 구매 권한자의 `신청됨` 행 행동 `구매 완료`(→ `?purchase={id}` 옆 패널 S13) · 구매 완료 행 2행 `카드 사용 {MM-DD} · {결제 합계}`(취소 없음 — Q2).
// 폰(<700)에서는 행동 칸이 P1 표를 넓혀 320을 넘겼다(감사 D-1) — 행동 칸은 P3로 숨고 행 탭이 행동을 맡는다(06-09 카드 사용 표 선례):
// `신청됨` 행이면 바로 S13, 그 밖은 `RowSheet`(보기 전용).

export type PurchaseListRowView = {
  id: string;
  number: string;
  requestedOn: string;
  itemName: string;
  linkUrl: string | null;
  linkLabel: string | null;
  requestedByName: string;
  status: PurchaseStatus;
  currency: string | null;
  foreignAmount: number | null;
  fxRate: number | null;
  estimateKrw: number | null;
  /** 06-12 구매 완료 건의 카드 사용 — 사용일 · 결제 합계(못 보면 null). */
  usageUsedOn: string | null;
  usageTotalKrw: number | null;
  version: number;
  /** 06-14 취소 행 2행 `취소 {MM-DD} · {사람} · {사유}`(본인 취소는 사유 칸이 없다). */
  cancelledOn: string | null;
  cancelledByName: string | null;
  cancelReason: string | null;
  /** 06-14 `신청됨` 행에서만 서버가 준다 — 요청자 본인 `own` · 구매 권한자의 남의 요청 `others`. 없으면 `요청 취소`가 서지 않는다(Q2). */
  cancelBranch: "own" | "others" | null;
};

// 06-12 S13 성공 뒤 제자리 결과 — 패널(폼)이 성공 순간 남기고, 목록이 `?done={id}`로 다시 그려질 때 읽는다(액션 응답 값 · 한 번만 포커스).
type PurchaseDone = { id: string; capOver: number | null; focusNext: boolean };
let lastDone: PurchaseDone | null = null;

export function markPurchaseDone(done: PurchaseDone): void {
  lastDone = done;
}

// 링크는 http(s)만 아이콘으로 선다(T-06-37) — 저장 때 이미 거르지만 렌더도 스킴을 다시 확인한다.
function safeLinkHref(url: string | null): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

export function ExternalLinkIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M9 2.5h4.5V7M13.5 2.5 7.5 8.5M6.5 3.5h-3a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-3" />
    </svg>
  );
}

function itemCell(row: PurchaseListRowView): ReactNode {
  const href = safeLinkHref(row.linkUrl);
  return (
    <span className={styles.itemCell}>
      <span className={styles.itemText} title={row.itemName}>
        {row.itemName}
      </span>
      {href ? (
        <a href={href} target="_blank" rel="noopener noreferrer" aria-label={`${row.itemName} 링크 열기`} title={href} className={styles.linkIcon}>
          <ExternalLinkIcon />
        </a>
      ) : null}
    </span>
  );
}

// 연결 칸은 한 줄 말줄임 + `title` 전문(카드 목록 연결 칸과 같은 클래스).
function linkCell(row: PurchaseListRowView): ReactNode {
  const text = row.linkLabel ?? "—";
  return (
    <span className={cardStyles.linkCell}>
      <span className={cardStyles.linkText} title={text}>
        {text}
      </span>
    </span>
  );
}

// 외화 2행 `USD 1,000.00 @1,350`(§3 외화 병기) — 묶음(`통화 금액` · `@환율`) 사이에서만 꺾인다. 한 줄로 두면 폰 320에서 열이 넓어져
// 문서를 넘겼다(감사 O-1 — 카드 사용 결제 합계 2행과 같은 꼴).
function estimateSecondLine(row: PurchaseListRowView): ReactNode {
  if (!row.currency || row.currency === "KRW" || row.foreignAmount === null || row.fxRate === null) return null;
  const foreign = formatForeignLine({ currency: row.currency, amount: row.foreignAmount, fxRate: row.fxRate });
  if (!foreign) return null;
  const [amount, rate] = foreign.split(" @");
  return (
    <span className={cardStyles.secondaryWrap}>
      <span className={cardStyles.segment}>{amount}</span> <span className={cardStyles.segment}>{`@${rate ?? ""}`}</span>
    </span>
  );
}

// 취소 행 2행 `취소 09-20 · 김OO · 사유`(06-14) — 본인 취소는 사유 칸이 없다.
function cancelledSecondLine(row: PurchaseListRowView): string | null {
  if (row.status !== "cancelled" || !row.cancelledOn) return null;
  return ["취소 " + row.cancelledOn.slice(5), row.cancelledByName, row.cancelReason].filter((part): part is string => !!part).join(" · ");
}

// 구매 완료 행 2행 `카드 사용 09-20 · 1,238,000` — 처리 직후(액션 응답에 초과액이 있으면) 끝에 ` · 실행가 초과 {초과액}`(Q-E).
function statusSecondLine(row: PurchaseListRowView): ReactNode {
  if (row.status === "cancelled") return cancelledSecondLine(row);
  if (row.status !== "purchased" || !row.usageUsedOn) return null;
  const head = `카드 사용 ${row.usageUsedOn.slice(5)}${row.usageTotalKrw === null ? "" : ` · ${formatKrw(row.usageTotalKrw)}`}`;
  const over = lastDone?.id === row.id ? lastDone.capOver : null;
  if (over === null) return head;
  return (
    <>
      {head}
      <span style={{ color: "var(--status-warning)" }}>{` · 실행가 초과 ${formatKrw(over)}`}</span>
    </>
  );
}

const COLUMNS: TableColumn<PurchaseListRowView>[] = [
  { key: "number", header: "번호", priority: "p2", cell: (row) => <Num value={row.number} /> },
  { key: "requestedOn", header: "요청일", priority: "p2", cell: (row) => <Num value={row.requestedOn.slice(5)} /> },
  { key: "item", header: "품목", priority: "p1", cell: itemCell },
  { key: "link", header: "연결", priority: "p2", cell: linkCell },
  { key: "requester", header: "요청자", priority: "p2", cell: (row) => row.requestedByName },
  { key: "estimate", header: "예상 금액", priority: "p1", align: "right", cell: (row) => <Num value={row.estimateKrw} />, secondaryLine: estimateSecondLine },
  {
    key: "status",
    header: "상태",
    priority: "p1",
    cell: (row) => <StatusTag variant="text" status={purchaseStatusWord(row.status)} />,
    secondaryLine: statusSecondLine,
  },
];

function completeHref(listHref: string, id: string): string {
  return `${listHref}${listHref.includes("?") ? "&" : "?"}purchase=${id}`;
}

function cancelTarget(row: PurchaseListRowView): PurchaseCancelTarget | null {
  if (row.status !== "requested" || row.cancelBranch === null) return null;
  return {
    id: row.id,
    number: row.number,
    version: row.version,
    itemName: row.itemName,
    branch: row.cancelBranch,
    quoteLinked: row.linkLabel !== null,
    estimateText: row.estimateKrw === null ? null : formatKrw(row.estimateKrw),
  };
}

// 행동 칸 — 구매 권한자에게 `신청됨` 행 `구매 완료`(접근 이름 `{번호} 구매 완료`) · 취소 권한이 있는 `신청됨` 행 `요청 취소`(맨 끝 danger).
// 구매 완료 · 취소 행에는 행동이 없다(Q2).
function actionsColumn(listHref: string, canComplete: boolean): TableColumn<PurchaseListRowView> {
  return {
    key: "actions",
    header: "행동",
    headerHidden: true,
    priority: "p3",
    cell: (row) => {
      if (row.status !== "requested") return null;
      const target = cancelTarget(row);
      if (!canComplete && !target) return null;
      return (
        <RowActions>
          {canComplete ? (
            <RowAction href={completeHref(listHref, row.id)}>
              <span className="sr-only">{`${row.number} `}</span>구매 완료
            </RowAction>
          ) : null}
          {target ? <PurchaseCancelButton target={target} /> : null}
        </RowActions>
      );
    },
  };
}

// S13 성공 뒤 포커스(r2 F6 — 연달아 처리): 처리한 행 다음의 `신청됨` 행 `구매 완료`(끝이면 앞쪽 첫 행), 없으면 화면 제목(패널이 `moveFocusToResult`로 이미 옮겼다).
// 폰은 행동 칸이 숨어 있어 그 행의 탭 자리(`{번호} 상세 보기`)로.
function focusNextComplete(rows: PurchaseListRowView[], doneId: string): void {
  const at = rows.findIndex((row) => row.id === doneId);
  const ordered = at < 0 ? rows : [...rows.slice(at + 1), ...rows.slice(0, at)];
  const next = ordered.find((row) => row.status === "requested");
  if (!next) return;
  const link = document.querySelector<HTMLElement>(`a[href$="purchase=${next.id}"]`);
  const target = link && link.getClientRects().length > 0 ? link : document.querySelector<HTMLElement>(`[role="button"][aria-label="${next.number} 상세 보기"]`);
  target?.focus();
}

export function PurchaseList({ rows, listHref, canComplete, doneId }: { rows: PurchaseListRowView[]; listHref: string; canComplete: boolean; doneId: string | null }) {
  const router = useRouter();
  const [sheet, setSheet] = useState<PurchaseListRowView | null>(null);
  useEffect(() => {
    const done = lastDone;
    if (!done || !done.focusNext || done.id !== doneId) return;
    // 패널이 닫히며 화면 제목으로 옮긴 포커스 뒤에(같은 커밋의 정리 효과 다음 틱).
    const timer = window.setTimeout(() => {
      done.focusNext = false;
      focusNextComplete(rows, done.id);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [rows, doneId]);
  const sheetTarget = sheet ? cancelTarget(sheet) : null;
  if (!canComplete && !rows.some((row) => row.cancelBranch !== null)) return <Table caption="구매 요청" columns={COLUMNS} rows={rows} getRowId={(row) => row.id} />;
  return (
    <>
      <Table
        caption="구매 요청"
        columns={[...COLUMNS, actionsColumn(listHref, canComplete)]}
        rows={rows}
        getRowId={(row) => row.id}
        onRowTap={(row) => (canComplete && row.status === "requested" ? router.push(completeHref(listHref, row.id), { scroll: false }) : setSheet(row))}
        rowLabel={(row) => row.number}
      />
      <RowSheet
        open={sheet !== null}
        onClose={() => setSheet(null)}
        title={sheet?.itemName ?? ""}
        subtitle={sheet ? `${sheet.number} · ${purchaseStatusWord(sheet.status)}` : ""}
        items={
          sheet
            ? [
                { label: "요청일", value: sheet.requestedOn },
                { label: "연결", value: sheet.linkLabel ?? "—" },
                { label: "요청자", value: sheet.requestedByName },
              ]
            : []
        }
        action={sheetTarget ? <PurchaseCancelButton target={sheetTarget} onDone={() => setSheet(null)} /> : undefined}
      />
    </>
  );
}

// 「Error — 목록 로드」 — 목록 자리 한 줄 + 2차 `다시 시도`(같은 쿼리로 서버가 다시 그린다).
export function PurchaseListLoadError() {
  const router = useRouter();
  return <ListEmpty message="구매 요청 목록 불러오지 못함" action={{ label: "다시 시도", onClick: () => router.refresh() }} tone="error" />;
}

// 필터 줄(UI-SPEC S11) — 상태 · 월. 고르면 바로 GET 이동(쿼리), 쪽은 1로 돌아가고 열린 패널은 닫힌다.
export function PurchaseFilters({ status, month, months }: { status: PurchaseStatusView; month: string; months: string[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function go(key: "status" | "month", value: string, isDefault: boolean) {
    const query = new URLSearchParams(searchParams.toString());
    if (isDefault) query.delete(key);
    else query.set(key, value);
    query.delete("page");
    query.delete("new");
    query.delete("line");
    const text = query.toString();
    router.push(text ? `/cards/purchases?${text}` : "/cards/purchases", { scroll: false });
  }

  // 뒤로 가기 · `필터 지우기`로 URL이 바뀌면 key로 새로 마운트한다(defaultValue는 마운트 뒤 반영되지 않는다).
  return (
    <>
      <div className={filterStyles.selectLabel}>
        <label htmlFor="purchase-filter-status">상태</label>
        <select
          key={status}
          id="purchase-filter-status"
          className={filterStyles.select}
          defaultValue={status}
          onChange={(event) => go("status", event.target.value, event.target.value === "신청됨")}
        >
          {PURCHASE_STATUS_VIEWS.map((view) => (
            <option key={view} value={view}>
              {view}
            </option>
          ))}
        </select>
      </div>
      <div className={filterStyles.selectLabel}>
        <label htmlFor="purchase-filter-month">월</label>
        <select key={month} id="purchase-filter-month" className={filterStyles.select} defaultValue={month} onChange={(event) => go("month", event.target.value, event.target.value === "")}>
          <option value="">전체</option>
          {months.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </div>
    </>
  );
}
