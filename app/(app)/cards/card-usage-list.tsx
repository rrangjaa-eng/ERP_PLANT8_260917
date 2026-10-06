"use client";

import type { ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Table } from "@/ui/table/Table";
import type { TableColumn } from "@/ui/table/types";
import { Num } from "@/ui/num/Num";
import { ListEmpty } from "@/ui/list-empty/ListEmpty";
import { formatForeignLine, formatKrw } from "@/lib/format-number";
// 필터 칸 모양은 프로젝트 목록 필터와 같은 클래스(새 CSS 없음).
import styles from "@/app/(app)/projects/projects.module.css";
import cardStyles from "./cards.module.css";

// 06-05(UI-SPEC S8): 카드 사용 읽기 표 — 그룹 머리글 = 카드, 그룹 안 사용일 오름차순(서버 정렬). 카드 열은 그룹이 말하므로 두지 않는다.
// 행동 칸 `수정` · `삭제`는 06-09.

export type CardUsageListRowView = {
  id: string;
  cardId: string;
  cardLabel: string;
  usedOn: string;
  merchantName: string | null;
  linkKind: string;
  teamName: string | null;
  linkLabel: string | null;
  registeredVia: string;
  registeredByName: string;
  registeredOn: string | null;
  totalKrw: number | null;
  supplyKrw: number | null;
  vatKrw: number | null;
  currency: string | null;
  foreignAmount: number | null;
  fxRate: number | null;
};

// 「표시 — 카드 사용 결제 합계 2행」 한 형식: 외화면 `USD 1,000.00 @1,350 · 공급가 N`, 원화 부가세 규칙이면 `공급가 N`, 규칙 없음(공급가 = 합계)은 2행 없음.
// 외화 2행은 묶음(`통화 금액` · `@환율` · `공급가 N`) 사이에서만 꺾인다 — 320에서 문서를 넘기지 않는다(DOM 감사 D1).
function totalSecondLine(row: CardUsageListRowView): ReactNode {
  if (row.supplyKrw === null) return null;
  const supply = `공급가 ${formatKrw(row.supplyKrw)}`;
  const foreign =
    row.currency && row.foreignAmount !== null && row.fxRate !== null ? formatForeignLine({ currency: row.currency, amount: row.foreignAmount, fxRate: row.fxRate }) : null;
  if (foreign) {
    const [amount, rate] = foreign.split(" @");
    return (
      <span className={cardStyles.secondaryWrap}>
        <span className={cardStyles.segment}>{amount}</span> <span className={cardStyles.segment}>{`@${rate ?? ""}`}</span> ·{" "}
        <span className={cardStyles.segment}>{supply}</span>
      </span>
    );
  }
  return row.vatKrw ? supply : null;
}

function linkText(row: CardUsageListRowView): string {
  if (row.linkKind === "team_cost") return `팀 비용 · ${row.teamName ?? "—"}`;
  return row.linkLabel ?? "—";
}

// 연결 칸은 한 줄 말줄임 + `title` 전문(06-07 플랜 S9 long-text backstop).
function linkCell(row: CardUsageListRowView): ReactNode {
  const text = linkText(row);
  return (
    <span className={cardStyles.linkCell}>
      <span className={cardStyles.linkText} title={text}>
        {text}
      </span>
    </span>
  );
}

// 「표시 — 경영관리 등록」: 대리 등록이면 `경영관리 등록`(--text-strong 600) + 2행 `{등록자} {MM-DD}`, 본인 등록이면 이름(400). 대리 등록 자체는 06-09.
const PROXY_STYLE = { fontWeight: "var(--fw-medium)", color: "var(--text-strong)" } as const;

const COLUMNS: TableColumn<CardUsageListRowView>[] = [
  { key: "usedOn", header: "사용일", priority: "p2", cell: (row) => <Num value={row.usedOn.slice(5)} /> },
  { key: "merchant", header: "가맹점", priority: "p2", cell: (row) => row.merchantName ?? "—" },
  { key: "link", header: "연결", priority: "p1", cell: linkCell },
  {
    key: "total",
    header: "결제 합계",
    priority: "p1",
    align: "right",
    cell: (row) => <Num value={row.totalKrw} />,
    secondaryLine: totalSecondLine,
  },
  { key: "evidence", header: "증빙", priority: "p3", collapseBelow: 1024, cell: () => "—" },
  {
    key: "registered",
    header: "등록",
    priority: "p1",
    cell: (row) => (row.registeredVia === "proxy" ? <span style={PROXY_STYLE}>경영관리 등록</span> : row.registeredByName),
    secondaryLine: (row) => (row.registeredVia === "proxy" ? `${row.registeredByName} ${row.registeredOn?.slice(5) ?? ""}`.trim() : null),
  },
];

export function CardUsageList({ rows }: { rows: CardUsageListRowView[] }) {
  return (
    <Table
      caption="카드 사용"
      columns={COLUMNS}
      rows={rows}
      getRowId={(row) => row.id}
      groupBy={(row) => row.cardId}
      groupHeader={(row) => row.cardLabel}
    />
  );
}

// 「Error — 목록 로드」 — 목록 자리 한 줄 + 2차 `다시 시도`(같은 쿼리로 서버가 다시 그린다).
export function CardUsageLoadError() {
  const router = useRouter();
  return <ListEmpty message="카드 사용 목록 불러오지 못함" action={{ label: "다시 시도", onClick: () => router.refresh() }} tone="error" />;
}

const LINK_OPTIONS = [
  { value: "", label: "전체" },
  { value: "quote", label: "견적 줄" },
  { value: "out_of_quote", label: "견적 외 비용" },
  { value: "team", label: "팀 비용" },
] as const;

// 필터 줄(UI-SPEC S8) — 월 · 카드 · 연결 · 등록(권한자만). 고르면 바로 GET 이동(쿼리), 쪽은 1로 돌아간다.
export function CardUsageFilters({
  month,
  thisMonth,
  months,
  cardId,
  cardChoices,
  link,
  proxyOnly,
  registrationFilter,
}: {
  month: string;
  thisMonth: string;
  months: string[];
  cardId: string;
  cardChoices: { id: string; label: string }[];
  link: string;
  proxyOnly: boolean;
  registrationFilter: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function go(key: "month" | "card" | "link" | "via", value: string) {
    const query = new URLSearchParams(searchParams.toString());
    if (value === "" || (key === "month" && value === thisMonth)) query.delete(key);
    else query.set(key, value);
    query.delete("page");
    query.delete("new");
    const text = query.toString();
    router.push(text ? `/cards?${text}` : "/cards", { scroll: false });
  }

  // 뒤로 가기 · `필터 지우기`로 URL이 바뀌면 key로 새로 마운트한다(defaultValue는 마운트 뒤 반영되지 않는다).
  return (
    <>
      <div className={styles.selectLabel}>
        <label htmlFor="card-usage-filter-month">월</label>
        <select key={month} id="card-usage-filter-month" className={styles.select} defaultValue={month} onChange={(event) => go("month", event.target.value)}>
          {months.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </div>
      <div className={styles.selectLabel}>
        <label htmlFor="card-usage-filter-card">카드</label>
        <select
          key={cardId}
          id="card-usage-filter-card"
          className={`${styles.select} ${cardStyles.cardFilter}`}
          defaultValue={cardId} onChange={(event) => go("card", event.target.value)}>
          <option value="">전체</option>
          {cardChoices.map((card) => (
            <option key={card.id} value={card.id}>
              {card.label}
            </option>
          ))}
        </select>
      </div>
      <div className={styles.selectLabel}>
        <label htmlFor="card-usage-filter-link">연결</label>
        <select key={link} id="card-usage-filter-link" className={styles.select} defaultValue={link} onChange={(event) => go("link", event.target.value)}>
          {LINK_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      {registrationFilter ? (
        <div className={styles.selectLabel}>
          <label htmlFor="card-usage-filter-via">등록</label>
          <select
            key={String(proxyOnly)}
            id="card-usage-filter-via"
            className={styles.select}
            defaultValue={proxyOnly ? "proxy" : ""}
            onChange={(event) => go("via", event.target.value)}
          >
            <option value="">전체</option>
            <option value="proxy">경영관리 등록</option>
          </select>
        </div>
      ) : null}
    </>
  );
}
