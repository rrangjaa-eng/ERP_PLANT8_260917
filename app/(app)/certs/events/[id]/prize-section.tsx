"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/ui/button/Button";
import { Table } from "@/ui/table/Table";
import { Toast } from "@/ui/toast/Toast";
import type { CellIssue, TableColumn } from "@/ui/table/types";
import type { FooterNoticeItem } from "@/ui/table/footer-notice";
import { useEditableWidth } from "@/ui/table/use-editable-width";
import { formatKrw } from "@/lib/format-number";
import { certPrizeListed } from "@/domain/certs/prize-value";
import { CERT_PRIZE_NAME_MAX, parsePrizeAmount, validatePrizeRows } from "@/domain/certs/prize-rules";
import type { CertEventStatus, CertPrizeDto } from "@/domain/certs/events";
import { generateCertQrAction } from "../actions";
import {
  GENERATE_UNKNOWN_TEXT,
  NEW_PRIZE_DEFAULTS,
  cellErrorSummary,
  dirtyRowCount,
  generateOutcome,
  pinPrizeCellErrors,
  prizeChangesBody,
  qrBlockReason,
  type DraftPrizeRow,
} from "./prize-table-rules";
import styles from "./event-detail.module.css";

// 04.3-10 — I′3 경품 섹션(UI-SPEC I′3 · §6-2 ⑯ · §7-3). 경영관리(canManagePrizes = certs.qr 쓰기 ∧ cert_prize.value — 서버
// 판정)이면서 1024 이상이면 §7-3 편집 표, 그 밖은 읽기 표. 신청됨의 1차는 「QR 생성」(표 dirty + QR 생성 한 트랜잭션).
// 셀 판정은 서버와 같은 validatePrizeRows다 — 화면이 먼저 같은 판정을 돌려 오류 셀을 고정하고 서버를 부르지 않는다.
// 미저장 편집은 브라우저 저장소에 두지 않는다(개정 ⑪ — beforeunload 경고만).

const RESPONSE_TIMEOUT_MS = 20_000;
const PASTE_ORDER = ["name", "unitValue", "delivery", "winnerCount"] as const;
type EditColumn = (typeof PASTE_ORDER)[number];

type Props = {
  eventId: string;
  eventName: string;
  status: CertEventStatus;
  canManagePrizes: boolean;
  prizes: Partial<CertPrizeDto>[];
  contactMissing: boolean;
  canOpenSettings: boolean;
  /** QR 섹션 라벨 id — QR 생성 성공 뒤 같은 화면이 접수 중으로 다시 그려지면 이리로 포커스. */
  qrLabelId: string;
};

type Row = DraftPrizeRow & { locked: boolean; submittedCount: number };

async function callWithin(call: () => Promise<unknown>): Promise<unknown> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<unknown>((resolve) => {
    timer = setTimeout(() => resolve("unreachable"), RESPONSE_TIMEOUT_MS);
  });
  try {
    return await Promise.race([call(), timeout]);
  } catch {
    return "unreachable";
  } finally {
    clearTimeout(timer);
  }
}

function deliveryText(delivery: string | undefined): string {
  return delivery === "parcel" ? "택배" : "현장";
}

function rowsFromProps(prizes: Partial<CertPrizeDto>[]): Row[] {
  return prizes.flatMap((prize) =>
    prize.id
      ? [
          {
            key: prize.id,
            id: prize.id,
            ...(prize.version !== undefined ? { version: prize.version } : {}),
            name: prize.name ?? "",
            unitValue: prize.unitValueKrw !== undefined ? formatKrw(prize.unitValueKrw) : "",
            delivery: deliveryText(prize.delivery),
            winnerCount: String(prize.winnerCount ?? 1),
            locked: prize.locked === true,
            submittedCount: prize.submittedCount ?? 0,
          },
        ]
      : [],
  );
}

function signatureOf(status: CertEventStatus, prizes: Partial<CertPrizeDto>[]): string {
  return `${status}|${prizes.map((p) => `${p.id ?? ""}:${p.version ?? ""}:${p.submittedCount ?? ""}`).join(",")}`;
}

function CellInput({
  label,
  initialValue,
  numeric,
  maxLength,
  describedBy,
  onCommit,
}: {
  label: string;
  initialValue: string;
  numeric?: boolean;
  maxLength?: number;
  describedBy?: string;
  onCommit: (value: string) => void;
}) {
  return (
    <input
      aria-label={label}
      aria-describedby={describedBy}
      type="text"
      inputMode={numeric ? "numeric" : undefined}
      autoComplete="off"
      maxLength={maxLength}
      defaultValue={initialValue}
      autoFocus
      className={numeric ? styles.cellInputNumeric : styles.cellInput}
      onBlur={(event) => onCommit(event.currentTarget.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          onCommit(event.currentTarget.value);
        }
      }}
    />
  );
}

export function PrizeSection(props: Props) {
  const wide = useEditableWidth();
  const editable = props.canManagePrizes && wide;

  return (
    <section className={styles.section} aria-labelledby="cert-prize-section-label">
      <h2 id="cert-prize-section-label" className={styles.sectionLabel}>
        경품
      </h2>
      {editable ? <PrizeEditor {...props} /> : <PrizeReadTable {...props} />}
    </section>
  );
}

// 읽기 표 — 기획본부(N7 a: 경품명 · 전달 · 당첨 수 · 제출 건수, 가액 열 없음) · 700~1023 · 폰의 경영관리.
function PrizeReadTable({ prizes, canManagePrizes }: Props) {
  const rows = rowsFromProps(prizes);
  const showValue = canManagePrizes && prizes.some((p) => p.unitValueKrw !== undefined);
  const columns: TableColumn<Row>[] = [
    { key: "name", header: "경품명", priority: "p1", cell: (row) => <span className={styles.wrapText}>{row.name}</span> },
    ...(showValue
      ? [{ key: "unitValue", header: "1개 가액", priority: "p1" as const, align: "right" as const, cell: (row: Row) => <span className={styles.num}>{row.unitValue}</span> }]
      : []),
    { key: "delivery", header: "전달", priority: "p2", cell: (row) => row.delivery },
    {
      key: "winnerCount",
      header: "당첨 수",
      priority: "p2",
      align: "right",
      cell: (row) => <span className={styles.num}>{row.winnerCount}</span>,
      summary: (row) => `당첨 ${row.winnerCount}명`,
    },
    { key: "submitted", header: "제출", priority: "p1", align: "right", cell: (row) => <span className={styles.num}>{row.submittedCount}</span> },
  ];
  const emptyMessage = canManagePrizes ? "경품이 없습니다" : "경품이 없습니다 · 등록은 경영관리";
  return <Table caption="경품" columns={columns} rows={rows} getRowId={(row) => row.key} emptyMessage={emptyMessage} />;
}

function PrizeEditor({ eventId, eventName, status, prizes, contactMissing: initialContactMissing, canOpenSettings, qrLabelId }: Props) {
  const [signature, setSignature] = useState(() => signatureOf(status, prizes));
  const [saved, setSaved] = useState<Row[]>(() => rowsFromProps(prizes));
  const [rows, setRows] = useState<Row[]>(() => rowsFromProps(prizes));
  const [deleted, setDeleted] = useState<Array<{ id: string; version: number }>>([]);
  const [cellErrors, setCellErrors] = useState<Record<string, string>>({});
  const [resultLine, setResultLine] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [issueSignal, setIssueSignal] = useState(0);
  const [openCell, setOpenCell] = useState<{ rowId: string; columnKey: string } | null>(null);
  const [contactMissing, setContactMissing] = useState(initialContactMissing);
  const [toast, setToast] = useState<string | null>(null);
  const [generateRequestId, setGenerateRequestId] = useState<string | null>(null);
  const focusQrRef = useRef(false);

  // 서버가 다시 그린 경품 줄(저장 · QR 생성 · 다른 사람의 변경)이 오면 편집 상태를 그 값으로 다시 맞춘다.
  const nextSignature = signatureOf(status, prizes);
  if (nextSignature !== signature) {
    setSignature(nextSignature);
    setSaved(rowsFromProps(prizes));
    setRows(rowsFromProps(prizes));
    setDeleted([]);
    setCellErrors({});
  }

  // QR 생성 성공 → 같은 화면이 접수 중으로 다시 그려지면 QR 섹션 라벨로 포커스.
  useEffect(() => {
    if (status === "open" && focusQrRef.current) {
      focusQrRef.current = false;
      document.getElementById(qrLabelId)?.focus();
    }
  }, [status, qrLabelId]);

  const body = prizeChangesBody(saved, rows, deleted);
  const dirty = dirtyRowCount(body);

  useEffect(() => {
    if (dirty === 0) return;
    function handleBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [dirty]);

  const closed = status === "closed";
  const requested = status === "requested";
  const errorCount = Object.keys(cellErrors).length;
  const listedCount = rows.filter((row) => {
    const amount = parsePrizeAmount(row.unitValue);
    return amount !== null && certPrizeListed(amount);
  }).length;
  const block = requested ? qrBlockReason({ contactMissing, canOpenSettings, rowCount: rows.length, listedCount }) : null;

  function clearCellError(rowKey: string, column: string) {
    setCellErrors((prev) => {
      const id = `${rowKey}:${column}`;
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  function addRow(after?: Row) {
    if (closed) return;
    const row: Row = { key: crypto.randomUUID(), ...NEW_PRIZE_DEFAULTS, locked: false, submittedCount: 0 };
    setRows((prev) => {
      const index = after ? prev.findIndex((r) => r.key === after.key) : -1;
      return index === -1 ? [...prev, row] : [...prev.slice(0, index + 1), row, ...prev.slice(index + 1)];
    });
    setResultLine(null);
    setOpenCell({ rowId: row.key, columnKey: "name" });
  }

  function deleteRow(row: Row) {
    if (row.locked || closed) return;
    setRows((prev) => prev.filter((r) => r.key !== row.key));
    const { id, version } = row;
    if (id && version !== undefined) setDeleted((prev) => [...prev, { id, version }]);
    setCellErrors((prev) => Object.fromEntries(Object.entries(prev).filter(([id]) => !id.startsWith(`${row.key}:`))));
    setResultLine(null);
  }

  function commitCell(rowId: string, column: string, value: string) {
    if (!(PASTE_ORDER as readonly string[]).includes(column)) return;
    setRows((prev) => prev.map((row) => (row.key === rowId ? { ...row, [column]: value } : row)));
    clearCellError(rowId, column);
    setResultLine(null);
  }

  // DR-5 — 같은 판정(validatePrizeRows)을 먼저 돌려 오류가 있으면 고정하고 서버를 부르지 않는다. 남아 있는 오류가 있으면 첫 칸으로.
  function pinLocalErrors(): boolean {
    if (errorCount > 0) {
      setIssueSignal((n) => n + 1);
      return true;
    }
    const checked = validatePrizeRows(rows);
    if (checked.kind !== "invalid") return false;
    setCellErrors(pinPrizeCellErrors(checked.cellErrors));
    setIssueSignal((n) => n + 1);
    return true;
  }

  async function generate() {
    if (pending || block || pinLocalErrors()) return;
    const requestId = generateRequestId ?? crypto.randomUUID();
    setGenerateRequestId(requestId);
    setPending(true);
    setResultLine(null);
    const outcome = generateOutcome(await callWithin(() => generateCertQrAction({ eventId, requestId, changes: body })));
    setPending(false);
    switch (outcome.kind) {
      case "ok":
        focusQrRef.current = true;
        setGenerateRequestId(null);
        setToast(`QR 생성 · ${eventName}`);
        return;
      case "blocked":
        if (outcome.reason === "contactMissing") setContactMissing(true);
        setGenerateRequestId(null);
        return;
      case "invalid":
        setCellErrors(pinPrizeCellErrors(outcome.cellErrors));
        setIssueSignal((n) => n + 1);
        setGenerateRequestId(null);
        return;
      case "failed":
        setResultLine(GENERATE_UNKNOWN_TEXT);
        return;
      default:
        setGenerateRequestId(null);
        setResultLine(GENERATE_UNKNOWN_TEXT);
    }
  }

  const issueIdOf = (row: Row, column: string) => (cellErrors[`${row.key}:${column}`] ? `${row.key}-${column}-issue` : undefined);
  const editabilityOf = (row: Row, column: EditColumn) => {
    if (column === "unitValue" || column === "winnerCount") return "edit" as const;
    return row.locked || closed ? ("readonly" as const) : ("edit" as const);
  };

  const textColumn = (
    key: "name" | "unitValue" | "winnerCount",
    header: string,
    priority: TableColumn<Row>["priority"],
    opts: { numeric?: boolean; maxLength?: number } = {},
  ): TableColumn<Row> => ({
    key,
    header,
    priority,
    align: opts.numeric ? "right" : undefined,
    cell: (row) => <span className={opts.numeric ? styles.num : styles.wrapText}>{row[key]}</span>,
    copyText: (row) => row[key],
    editability: (row) => editabilityOf(row, key),
    editCell: (row, ctx) => (
      <CellInput
        label={header}
        initialValue={row[key]}
        numeric={opts.numeric}
        maxLength={opts.maxLength}
        describedBy={issueIdOf(row, key)}
        onCommit={ctx.onCommit}
      />
    ),
  });

  const columns: TableColumn<Row>[] = [
    {
      key: "no",
      header: "번호",
      priority: "p3",
      align: "right",
      cell: (row) => <span className={styles.num}>{rows.indexOf(row) + 1}</span>,
      pasteRole: "computed",
    },
    textColumn("name", "경품명", "p1", { maxLength: CERT_PRIZE_NAME_MAX }),
    textColumn("unitValue", "1개 가액", "p1", { numeric: true }),
    {
      key: "delivery",
      header: "전달",
      priority: "p2",
      cell: (row) => row.delivery,
      copyText: (row) => row.delivery,
      editability: (row) => editabilityOf(row, "delivery"),
      editCell: (row, ctx) => (
        <select
          aria-label="전달"
          defaultValue={row.delivery === "택배" ? "택배" : "현장"}
          autoFocus
          className={styles.cellSelect}
          onChange={(event) => ctx.onCommit(event.currentTarget.value)}
          onBlur={(event) => ctx.onCommit(event.currentTarget.value)}
        >
          <option value="현장">현장</option>
          <option value="택배">택배</option>
        </select>
      ),
    },
    textColumn("winnerCount", "당첨 수", "p2", { numeric: true }),
    {
      key: "submitted",
      header: "제출",
      priority: "p1",
      align: "right",
      pasteRole: "computed",
      cell: (row) => <span className={styles.num}>{row.submittedCount}</span>,
    },
  ];

  const cellIssue = (row: Row, column: string): CellIssue | undefined => {
    const message = cellErrors[`${row.key}:${column}`];
    return message ? { kind: "error", message } : undefined;
  };

  const footerNotices: FooterNoticeItem[] = [
    ...(errorCount > 0
      ? [{ tone: "danger" as const, text: cellErrorSummary(errorCount), replacesIssueCount: { errorCells: errorCount, conflictRows: 0 } }]
      : []),
    ...(resultLine ? [{ tone: "danger" as const, text: resultLine }] : []),
  ];
  const submittedTotal = rows.reduce((sum, row) => sum + row.submittedCount, 0);

  return (
    <>
      <Table
        caption="경품"
        columns={columns}
        rows={rows}
        getRowId={(row) => row.key}
        emptyMessage="경품이 없습니다"
        emptyAction={closed ? undefined : { label: "첫 줄 만들기", shortcut: "Ctrl+Enter", onClick: () => addRow() }}
        enableGridKeyboard
        saveLocked={pending}
        openCell={openCell}
        keyboard={{ onNewRow: (row) => addRow(row), onDeleteRow: deleteRow }}
        onCellCommit={commitCell}
        cellIssue={cellIssue}
        firstIssueSignal={issueSignal}
        footerNotices={footerNotices}
        footer={(notice) => (
          <tr>
            <td colSpan={columns.length} className={styles.footerCell}>
              {`합계 · 경품 ${rows.length}개 · 제출 ${submittedTotal}건`}
              {notice}
            </td>
          </tr>
        )}
      />
      {requested ? (
        <div className={styles.primaryRow}>
          <Button
            variant="primary"
            pending={pending}
            disabled={block !== null}
            disabledReason={block?.text}
            reasonTone={block?.tone}
            onClick={() => void generate()}
          >
            QR 생성
          </Button>
        </div>
      ) : null}
      {toast ? <Toast message={toast} onDismiss={() => setToast(null)} /> : null}
    </>
  );
}
