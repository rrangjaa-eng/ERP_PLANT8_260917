"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { ProjectCardUsageDto, ProjectCardUsages } from "@/domain/corp-card-usages";
import { listProjectCardUsagesAction } from "@/app/(app)/cards/actions";
import { formatKrw } from "@/lib/format-number";
import { DetailScreen } from "@/ui/detail-screen/DetailScreen";
import { ListEmpty } from "@/ui/list-empty/ListEmpty";
import { Num } from "@/ui/num/Num";
import { Table } from "@/ui/table/Table";
import { TableSkeleton } from "@/ui/table/TableSkeleton";
import { RowSheet } from "@/ui/table/RowSheet";
import type { TableColumn } from "@/ui/table/types";
import styles from "./project-detail.module.css";

// 06-07(UI-SPEC S15): 프로젝트 상세 「법인카드 사용」 — 매출 섹션 아래 읽기 표(부제 없음 — C13). 그 프로젝트 견적 줄(견적 외 비용 포함)에 이은
// 카드 사용만, 사용일 오름차순 · 페이지 나눔 없음. 금액 열 · 합계 행 금액은 서버가 `quote.amount`로 뺀다(없으면 `합계 ({N}건)`만).
// 섹션이 따로 불러(액션) 실패해도 원장 · 매출 섹션은 선다 — 「Error — 섹션 로드」 `카드 사용 불러오지 못함 · 다시 시도`.
// 06-09: 폰 행 탭 — 그 건의 권리(O-11, 서버 `rights`)가 있으면 수정 패널(`/cards?editId=`), 없으면 RowSheet(보기 전용).

type Row = Partial<ProjectCardUsageDto> & { id: string };
type Load = { kind: "loading" } | { kind: "error" } | { kind: "ready"; data: ProjectCardUsages };

// 「표시 — 경영관리 등록」 — 카드 사용 목록(S8)과 같은 글자 모양(--text-strong 600).
const PROXY_STYLE = { fontWeight: "var(--fw-medium)", color: "var(--text-strong)" } as const;

// 06-12: 구매 완료로 생긴 건 = `구매 요청 {번호}` + 2행 `{구매 완료한 사람} {MM-DD}`(경영관리 등록이 아니다).
function purchaseText(row: Row): string | null {
  return row.registeredVia === "purchase" && row.purchaseNumber ? `구매 요청 ${row.purchaseNumber}` : null;
}

function registeredText(row: Row) {
  return row.registeredVia === "proxy" ? <span style={PROXY_STYLE}>경영관리 등록</span> : (purchaseText(row) ?? row.registeredByName ?? "");
}

function registeredSecond(row: Row): string | null {
  return row.registeredVia === "proxy" || purchaseText(row) ? `${row.registeredByName ?? ""} ${row.registeredOn?.slice(5) ?? ""}`.trim() : null;
}

// 결제 합계 2행 = 공급가(합계와 다를 때만 — 규칙 없음이면 같은 값이라 두 번 말하지 않는다).
function supplySecond(row: Row): string | null {
  return row.supplyKrw !== undefined && row.totalKrw !== undefined && row.supplyKrw !== row.totalKrw ? `공급가 ${formatKrw(row.supplyKrw)}` : null;
}

function columnsFor(rows: Row[]): TableColumn<Row>[] {
  const amounts = rows.some((row) => row.totalKrw !== undefined);
  return [
    { key: "usedOn", header: "사용일", priority: "p2", cell: (row) => <Num value={row.usedOn?.slice(5) ?? null} /> },
    { key: "line", header: "견적 줄", priority: "p1", cell: (row) => row.lineLabel ?? "" },
    { key: "merchant", header: "가맹점", priority: "p2", cell: (row) => row.merchantName ?? "—" },
    ...(amounts
      ? [
          {
            key: "total",
            header: "결제 합계",
            priority: "p1",
            align: "right",
            cell: (row) => <Num value={row.totalKrw ?? null} />,
            secondaryLine: supplySecond,
          } satisfies TableColumn<Row>,
        ]
      : []),
    { key: "registered", header: "등록", priority: "p1", cell: registeredText, secondaryLine: registeredSecond },
  ];
}

export function CardUsageSection({ projectId }: { projectId: string }) {
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [sheet, setSheet] = useState<Row | null>(null);
  const router = useRouter();

  useEffect(() => {
    let live = true;
    void (async () => {
      let next: Load = { kind: "error" };
      try {
        const result = await listProjectCardUsagesAction({ projectId });
        if (result?.data) next = { kind: "ready", data: result.data };
      } catch {
        // 요청이 끊겨도 섹션 자리 한 줄로만 알린다(원장 무영향).
      }
      if (live) setLoad(next);
    })();
    return () => {
      live = false;
    };
  }, [projectId, attempt]);

  if (load.kind === "loading") {
    return (
      <DetailScreen.Section title="법인카드 사용">
        <div aria-busy="true">
          <TableSkeleton
            columns={[
              { key: "usedOn", label: "사용일" },
              { key: "line", label: "견적 줄" },
              { key: "merchant", label: "가맹점" },
              { key: "total", label: "결제 합계", align: "right" },
              { key: "registered", label: "등록" },
            ]}
            withFooter
          />
        </div>
      </DetailScreen.Section>
    );
  }

  if (load.kind === "error") {
    return (
      <DetailScreen.Section title="법인카드 사용">
        <ListEmpty
          tone="error"
          message="카드 사용 불러오지 못함"
          action={{
            label: "다시 시도",
            onClick: () => {
              setLoad({ kind: "loading" });
              setAttempt((value) => value + 1);
            },
          }}
        />
      </DetailScreen.Section>
    );
  }

  const rows = load.data.rows.filter((row): row is Row => row.id !== undefined);
  if (rows.length === 0) {
    return (
      <DetailScreen.Section title="법인카드 사용">
        {load.data.canRegister ? (
          <ListEmpty message="이 프로젝트에 카드 사용이 없습니다" action={{ label: "카드 사용 등록", href: `/cards?new=1&project=${projectId}` }} />
        ) : (
          <ListEmpty message="이 프로젝트에 카드 사용이 없습니다" />
        )}
      </DetailScreen.Section>
    );
  }

  const columns = columnsFor(rows);
  const { count, totalKrw } = load.data.totals;
  return (
    <DetailScreen.Section title="법인카드 사용">
      <Table
        caption="법인카드 사용"
        columns={columns}
        rows={rows}
        getRowId={(row) => row.id}
        onRowTap={(row) => (row.rights?.edit ? router.push(`/cards?editId=${row.id}`) : setSheet(row))}
        rowLabel={(row) => row.lineLabel ?? row.id}
        footer={
          <tr>
            <td colSpan={columns.length} className={styles.footerCell}>
              {`합계 (${count ?? rows.length}건)`}
              {totalKrw !== undefined ? ` · 결제 합계 ${formatKrw(totalKrw)}` : null}
            </td>
          </tr>
        }
      />
      <RowSheet
        open={sheet !== null}
        onClose={() => setSheet(null)}
        title={sheet?.lineLabel ?? ""}
        subtitle={sheet?.merchantName ?? "—"}
        items={
          sheet
            ? [
                { label: "사용일", value: sheet.usedOn ?? "" },
                ...(sheet.totalKrw !== undefined ? [{ label: "결제 합계", value: <Num value={sheet.totalKrw} /> }] : []),
                ...(sheet.supplyKrw !== undefined ? [{ label: "공급가", value: <Num value={sheet.supplyKrw} /> }] : []),
                { label: "등록", value: registeredSecond(sheet) ? `${purchaseText(sheet) ?? "경영관리 등록"} · ${registeredSecond(sheet) ?? ""}` : (sheet.registeredByName ?? "") },
              ]
            : []
        }
      />
    </DetailScreen.Section>
  );
}
