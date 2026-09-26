"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { listRevisionLinesAction } from "../actions";
import type { QuoteLineDto } from "@/domain/quotes/lines";
import { QUOTE_LINE_KINDS, type QuoteLineKind } from "@/domain/quotes/edit-scope";
import { formatForeignLine, formatKrw, formatQuantity } from "@/lib/format-number";
import { QUOTE_TABLE_PAGE_SIZE } from "@/lib/paging";
import { ListEmpty } from "@/ui/list-empty/ListEmpty";
import { Table } from "@/ui/table/Table";
import type { TableColumn } from "@/ui/table/types";
import { toTsv } from "@/ui/table/parse-tsv";
import { carrySharedEdits, clearDirtyEdits, findOtherRevisionDrafts, loadDirtyEdits, type EnumerableDirtyStorage } from "@/ui/table/use-dirty-storage";
import { byKind, lineStatusLabel, PROJECT_EDIT_OWNERS, quoteLineGroupLabel, restoredCellPatch, type QuoteTableCodeOption, type QuoteTableOption } from "./quote-table";
import styles from "./project-detail.module.css";

// 04-24(DR-13 · S5 · W1) — 이전 차수 읽기 섹션과 견적 줄 읽기 열. 원장(QuoteLedger)과 상태를 나누지 않는다 —
// 1차 · dirty · 보관본 · 검색 파라미터에 닿지 않고, 되돌리기 동작이 없다(D-53).

/** 견적 줄 복사 글자의 입력 행 — 값 필드만(읽기 섹션 DTO 행 · 보관본을 덮은 행 · 격자 편집 행이 이 모양이다). */
export type QuoteLineCopyRow = {
  lineKind: QuoteLineKind;
  subcategory: string;
  itemName: string;
  vendorId: string | null;
  quantity: number;
  unitPriceAmount: number;
  unitPriceCurrency: string;
  unitPriceFxRate: number;
  unitPriceAmountKrw: number;
  quoteAmountKrw: number;
  executionAmount: number;
  profitKrw: number;
  lineStatus: string;
  note: string | null;
};

export type QuoteLineReadReferences = { subcategories: QuoteTableCodeOption[]; vendors: QuoteTableOption[] };

/** `copyText` — 그 열의 화면 첫 줄 글자 그대로(2행 없음). 견적 줄 복사 글자의 유일한 정의다(W1). */
export type QuoteLineReadColumn<Row extends QuoteLineCopyRow> = TableColumn<Row> & { copyText: (row: Row) => string };

// 견적 줄 표(quote-table.tsx)와 같은 열 키·순서·머리글·우선순위·좁은 PC 접기·셀 글자·외화 2행의 읽기 렌더.
export function quoteLineReadColumns<Row extends QuoteLineCopyRow>(
  references: QuoteLineReadReferences,
  rowNumber: (row: Row) => number,
): QuoteLineReadColumn<Row>[] {
  const subcategoryLabel = (value: string) => references.subcategories.find((option) => option.value === value)?.label ?? value;
  const vendorLabel = (id: string | null) => (id ? (references.vendors.find((vendor) => vendor.id === id)?.name ?? id) : "—");
  const column = ({ text, ...rest }: Omit<QuoteLineReadColumn<Row>, "cell" | "copyText"> & { text: (row: Row) => string }) => ({
    ...rest,
    cell: text,
    copyText: text,
  });
  return [
    column({ key: "sort", header: "번호", priority: "p3", collapseBelow: 1280, align: "left", text: (row) => String(rowNumber(row)) }),
    column({ key: "subcategory", header: "소분류", priority: "p3", collapseBelow: 1024, text: (row) => quoteLineGroupLabel(row, subcategoryLabel) }),
    column({ key: "itemName", header: "항목", priority: "p1", text: (row) => row.itemName }),
    column({ key: "vendor", header: "거래처", priority: "p2", text: (row) => vendorLabel(row.vendorId) }),
    column({
      key: "quantity",
      header: "수량",
      priority: "p2",
      align: "right",
      text: (row) => (row.lineKind === "quote" ? formatQuantity(row.quantity) : "—"),
    }),
    {
      ...column({
        key: "unitPrice",
        header: "단가",
        priority: "p2",
        align: "right",
        text: (row) => (row.lineKind === "quote" ? formatKrw(row.unitPriceAmountKrw) : "—"),
      }),
      secondaryLine: (row: Row) => {
        if (row.lineKind !== "quote") return null;
        const line = formatForeignLine({ currency: row.unitPriceCurrency, amount: row.unitPriceAmount, fxRate: row.unitPriceFxRate });
        if (!line) return null;
        const at = line.indexOf(" @");
        return (
          <span className={styles.fxGroups}>
            <span>{line.slice(0, at)}</span> <span>{line.slice(at + 1)}</span>
          </span>
        );
      },
    },
    column({ key: "quoteAmount", header: "견적가", priority: "p2", align: "right", text: (row) => formatKrw(row.quoteAmountKrw) }),
    column({ key: "execution", header: "실행가", priority: "p1", align: "right", text: (row) => formatKrw(row.executionAmount) }),
    column({ key: "profit", header: "차익", priority: "p2", collapseBelow: 1280, align: "right", text: (row) => formatKrw(row.profitKrw) }),
    column({ key: "status", header: "상태", priority: "p1", text: (row) => (row.lineKind === "adjustment" ? "—" : lineStatusLabel(row.lineStatus)) }),
    column({ key: "note", header: "비고", priority: "p3", collapseBelow: 1024, text: (row) => row.note ?? "—" }),
  ];
}

type ReadRow = QuoteLineCopyRow & { id: string };

function readRow(dto: QuoteLineDto): ReadRow {
  return {
    id: dto.id,
    lineKind: QUOTE_LINE_KINDS.find((kind) => kind === dto.lineKind) ?? "quote",
    subcategory: dto.subcategory,
    itemName: dto.itemName,
    vendorId: dto.vendorId,
    quantity: dto.quantity,
    unitPriceAmount: dto.unitPrice?.amount ?? 0,
    unitPriceCurrency: dto.unitPrice?.currency ?? "KRW",
    unitPriceFxRate: dto.unitPrice?.fxRate ?? 1,
    unitPriceAmountKrw: dto.unitPrice?.amountKrw ?? 0,
    quoteAmountKrw: dto.quoteAmountKrw,
    executionAmount: dto.execution?.amountKrw ?? 0,
    profitKrw: dto.profitKrw,
    lineStatus: dto.lineStatus,
    note: dto.note,
  };
}

type Entry = { kind: "ready"; rows: ReadRow[] } | { kind: "error" };

// DR-13 — 차수 섹션 바로 아래 섹션. 한 번에 한 차수(seq), 닫혀 있으면 null. 순번별 결과는 이 컴포넌트가 들고 있어
// 같은 차수를 다시 열면 다시 부르지 않는다(닫아도 이 컴포넌트는 남는다).
export function PreviousRevisionSection({
  projectId,
  seq,
  headingId,
  references,
}: {
  projectId: string;
  seq: number | null;
  headingId: string;
  references: QuoteLineReadReferences;
}) {
  const [entries, setEntries] = useState<Record<number, Entry>>({});
  const inflightRef = useRef(new Set<number>());
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (seq === null || entries[seq] || inflightRef.current.has(seq)) return;
    inflightRef.current.add(seq);
    void (async () => {
      let entry: Entry = { kind: "error" };
      try {
        const result = await listRevisionLinesAction({ projectId, revisionSeq: seq });
        if (result?.data) entry = { kind: "ready", rows: byKind(result.data.map(readRow)) };
      } catch {
        // 요청이 끊겨도 섹션 자리 한 줄로만 알린다(원장 무영향).
      }
      inflightRef.current.delete(seq);
      setEntries((prev) => ({ ...prev, [seq]: entry }));
    })();
  }, [projectId, seq, entries]);

  useEffect(() => {
    if (seq !== null) headingRef.current?.focus();
  }, [seq]);

  if (seq === null) return null;
  const entry = entries[seq];

  return (
    <section className={styles.section} aria-labelledby={headingId} aria-busy={entry === undefined ? "true" : undefined}>
      <h2 id={headingId} ref={headingRef} tabIndex={-1} className={styles.previousTitle}>
        {`상세 견적 ${seq}차`}
      </h2>
      {entry === undefined ? (
        <PreviousRevisionSkeleton />
      ) : entry.kind === "error" ? (
        <ListEmpty
          tone="error"
          message={`${seq}차 불러오지 못함`}
          action={{
            label: "다시 시도",
            onClick: () =>
              setEntries((prev) => {
                const next = { ...prev };
                delete next[seq];
                return next;
              }),
          }}
        />
      ) : (
        <PreviousRevisionTable seq={seq} rows={entry.rows} references={references} headingId={headingId} />
      )}
    </section>
  );
}

function PreviousRevisionTable({
  seq,
  rows,
  references,
  headingId,
}: {
  seq: number;
  rows: ReadRow[];
  references: QuoteLineReadReferences;
  headingId: string;
}) {
  const subcategoryLabel = (value: string) => references.subcategories.find((option) => option.value === value)?.label ?? value;
  const columns = quoteLineReadColumns<ReadRow>(references, (row) => rows.indexOf(row) + 1);
  return (
    <Table
      caption={`상세 견적 ${seq}차 견적 줄`}
      columns={columns}
      rows={rows}
      getRowId={(row) => row.id}
      groupBy={(row) => quoteLineGroupLabel(row, subcategoryLabel)}
      emptyMessage="이 차수에 견적 줄이 없습니다"
      // 04-19(DR-13 · W2) — 쪽 나눔은 Table 한 구현. 쪽을 바꾸면 포커스는 섹션 제목으로.
      pagination={{ pageSize: QUOTE_TABLE_PAGE_SIZE, unit: "줄", label: `상세 견적 ${seq}차 견적 줄`, resetKey: seq, focusHeadingId: headingId }}
      footer={
        <tr>
          <td colSpan={columns.length} className={styles.footerCell}>
            {`합계 (공급가액 · ${rows.length}줄)`}
            <span className={styles.footerQuoteSum}> {`견적 ${formatKrw(rows.reduce((sum, row) => sum + row.quoteAmountKrw, 0))} ·`}</span>
            <span className={styles.footerProfitSum}> {`차익 ${formatKrw(rows.reduce((sum, row) => sum + row.profitKrw, 0))}`}</span>
          </td>
        </tr>
      }
    />
  );
}

// §7-7 LOADING — 머리글 + `--surface` 행 3개, 300ms 뒤에만 보인다(CSS 지연).
function PreviousRevisionSkeleton() {
  return (
    <table className={styles.previousSkeleton} aria-hidden="true">
      <thead>
        <tr>
          <th scope="col">&nbsp;</th>
        </tr>
      </thead>
      <tbody>
        {[0, 1, 2].map((index) => (
          <tr key={index}>
            <td>&nbsp;</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ── 04-24(DR-4 · W1) — 견적 줄 복사 형식과 이전 차수 보관본 복원 줄 ─────────────────────────────────────────────

/** 앱 형식 — 줄마다 `{ currency }`(04-19 격자 복사가 같은 함수를 쓴다). */
export function quoteLineClipboardMeta(rows: QuoteLineCopyRow[]): string {
  return JSON.stringify(rows.map((row) => ({ currency: row.unitPriceCurrency })));
}

/** 견적 줄 복사의 유일한 직렬화 — `tsv`는 읽기 열 순서의 `copyText`, `json`은 앱 형식. */
export function quoteLineClipboard(rows: QuoteLineCopyRow[], references: QuoteLineReadReferences): { tsv: string; json: string } {
  const columns = quoteLineReadColumns<QuoteLineCopyRow>(references, (row) => rows.indexOf(row) + 1);
  return { tsv: toTsv(rows.map((row) => columns.map((column) => column.copyText(row)))), json: quoteLineClipboardMeta(rows) };
}

const NEW_LINE_FIELDS = [
  ["subcategory", "subcategory"],
  ["itemName", "itemName"],
  ["vendorId", "vendor"],
  ["quantity", "quantity"],
  ["unitPrice", "unitPrice"],
  ["execution", "execution"],
  ["lineStatus", "status"],
  ["note", "note"],
] as const;

// 보관본(D-68 모양)을 그 차수 줄 위에 덮는다 — 보관된 편집이 있는 줄만, 보관본에만 있는 새 줄은 보관값만.
// 계산 열(견적가·차익)은 표와 같이 저장 전에 다시 계산하지 않는다.
function draftCopyRows(rows: ReadRow[], edits: Record<string, unknown>): QuoteLineCopyRow[] {
  const patched = new Map<string, QuoteLineCopyRow>();
  const added: QuoteLineCopyRow[] = [];
  for (const [key, value] of Object.entries(edits)) {
    const cut = key.lastIndexOf(":");
    const owner = key.slice(0, cut);
    const column = key.slice(cut + 1);
    if (column === "new") {
      if (typeof value !== "object" || value === null) continue;
      const stored = value as Record<string, unknown>;
      let row: QuoteLineCopyRow = {
        lineKind: QUOTE_LINE_KINDS.find((kind) => kind === stored.lineKind) ?? "quote",
        subcategory: "",
        itemName: "",
        vendorId: null,
        quantity: 1,
        unitPriceAmount: 0,
        unitPriceCurrency: "KRW",
        unitPriceFxRate: 1,
        unitPriceAmountKrw: 0,
        quoteAmountKrw: 0,
        executionAmount: 0,
        profitKrw: 0,
        lineStatus: "not_started",
        note: null,
      };
      for (const [field, storedColumn] of NEW_LINE_FIELDS) row = { ...row, ...restoredCellPatch(storedColumn, stored[field]) };
      added.push(row);
      continue;
    }
    const base = patched.get(owner) ?? rows.find((row) => row.id === owner);
    const patch = restoredCellPatch(column, value);
    if (base && patch) patched.set(owner, { ...base, ...patch });
  }
  return [...rows.filter((row) => patched.has(row.id)).map((row) => patched.get(row.id)!), ...added];
}

function browserStorage(): EnumerableDirtyStorage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

type RevisionRef = { id: string; seq: number };
type Draft = { revisionId: string; seq: number; count: number };

function readDrafts(projectId: string, currentRevisionId: string, revisions: RevisionRef[]): Draft[] {
  const storage = browserStorage();
  if (!storage) return [];
  return findOtherRevisionDrafts(storage, projectId, currentRevisionId, PROJECT_EDIT_OWNERS)
    .flatMap((draft) => {
      const revision = revisions.find((candidate) => candidate.id === draft.revisionId);
      return revision ? [{ ...draft, seq: revision.seq }] : [];
    })
    .sort((a, b) => b.seq - a.seq);
}

const subscribeNothing = () => () => {};

// S18 · DR-4 · DR-31 — 표 위 한 줄(현재 차수 복원 줄 뒤 · 잠김 줄 앞). 가장 큰 순번 하나만. 현재 차수에 자동으로
// 합치지 않는다(줄 id가 다르다) — 「복사」와 「버림」만 있다.
export function PreviousRevisionDraftRow({
  projectId,
  currentRevisionId,
  revisions,
  references,
  onSharedEditsCarried,
}: {
  projectId: string;
  currentRevisionId: string;
  revisions: RevisionRef[];
  references: QuoteLineReadReferences;
  /** 검토 B1 — 다른 차수 보관본의 기간·총 매출 예상가 칸을 현재 차수 보관본으로 옮겼을 때(현재 차수 복원 줄이 다시 센다). */
  onSharedEditsCarried: () => void;
}) {
  const [drafts, setDrafts] = useState(() => readDrafts(projectId, currentRevisionId, revisions));
  // 서버·수화 첫 렌더는 저장소를 모른다 — 수화 뒤에만 그린다(use-dirty-storage와 같은 이유, React #418).
  const hydrated = useSyncExternalStore(subscribeNothing, () => true, () => false);
  const [rowsBySeq, setRowsBySeq] = useState<Record<number, ReadRow[]>>({});
  const [fetchRound, setFetchRound] = useState(0);
  // 검토 S2 — 받기에 실패한 순번·회차. 받는 중과 실패를 가른다(받는 중에는 「복사」가 진행 중이다).
  const [failedFetch, setFailedFetch] = useState<{ seq: number; round: number } | null>(null);
  const [copyResult, setCopyResult] = useState<{ seq: number; ok: boolean } | null>(null);
  const top = hydrated ? drafts[0] : undefined;
  const topSeq = top?.seq;

  // 검토 B1 — 차수와 무관한 칸은 이 줄이 아니라 현재 차수 복원 줄(「복원」)로 돌려준다.
  useEffect(() => {
    const storage = browserStorage();
    if (storage && carrySharedEdits(storage, projectId, currentRevisionId, PROJECT_EDIT_OWNERS) > 0) onSharedEditsCarried();
  }, [projectId, currentRevisionId, onSharedEditsCarried]);

  // 클릭 처리기 안에서 동기로 복사하려고 그 차수 줄을 미리 받아 둔다.
  useEffect(() => {
    if (topSeq === undefined || rowsBySeq[topSeq]) return;
    let cancelled = false;
    void (async () => {
      try {
        const result = await listRevisionLinesAction({ projectId, revisionSeq: topSeq });
        if (cancelled) return;
        if (result?.data) {
          const rows = byKind(result.data.map(readRow));
          setRowsBySeq((prev) => ({ ...prev, [topSeq]: rows }));
        } else {
          setFailedFetch({ seq: topSeq, round: fetchRound });
        }
      } catch {
        // 받지 못하면 「복사」가 `복사하지 못함`을 보이고 다시 누를 때 다시 받는다.
        if (!cancelled) setFailedFetch({ seq: topSeq, round: fetchRound });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, topSeq, rowsBySeq, fetchRound]);

  if (!top) return null;
  const fetching = !rowsBySeq[top.seq] && !(failedFetch?.seq === top.seq && failedFetch.round === fetchRound);

  function copy(draft: Draft) {
    if (fetching) return;
    const storage = browserStorage();
    const edits = storage ? loadDirtyEdits(storage, projectId, draft.revisionId) : null;
    const rows = rowsBySeq[draft.seq];
    let ok = false;
    const copyRows = edits && rows ? draftCopyRows(rows, edits) : [];
    // 검토 B1 — 옮길 줄이 0이면 빈 복사를 성공으로 보이지 않는다.
    if (copyRows.length > 0) {
      const { tsv, json } = quoteLineClipboard(copyRows, references);
      const onCopy = (event: ClipboardEvent) => {
        event.clipboardData?.setData("text/plain", tsv);
        event.clipboardData?.setData("application/x-plant8-quote-lines+json", json);
        event.preventDefault();
      };
      document.addEventListener("copy", onCopy, { once: true });
      try {
        ok = document.execCommand("copy");
      } catch {
        ok = false;
      }
      document.removeEventListener("copy", onCopy);
    } else if (!rows) {
      setFetchRound((round) => round + 1);
    }
    setCopyResult({ seq: draft.seq, ok });
  }

  function discard(draft: Draft) {
    const storage = browserStorage();
    if (storage) clearDirtyEdits(storage, projectId, draft.revisionId);
    setDrafts((prev) => prev.filter((candidate) => candidate.revisionId !== draft.revisionId));
    setCopyResult(null);
  }

  const result = copyResult?.seq === top.seq ? copyResult : null;
  return (
    <p className={styles.restoreBanner}>
      <span>{`${top.seq}차 저장 안 한 편집 ${top.count}칸`}</span>
      <span className={styles.restoreActions}>
        {result?.ok ? (
          <span className={styles.savedTag}>{`복사됨 ${top.count}칸`}</span>
        ) : fetching ? (
          // 검토 S2 — 그 차수 줄을 받는 동안은 진행 중(ui/button의 pending과 같은 `…` · aria-disabled).
          <button type="button" className={styles.restoreAction} aria-disabled="true">
            복사<span aria-hidden="true">…</span>
          </button>
        ) : (
          <button type="button" className={styles.restoreAction} onClick={() => copy(top)}>
            복사
          </button>
        )}
        {result && !result.ok ? <span className={styles.rejectionSummary}>복사하지 못함</span> : null}
        <button type="button" className={styles.restoreAction} onClick={() => discard(top)}>
          버림
        </button>
      </span>
    </p>
  );
}
