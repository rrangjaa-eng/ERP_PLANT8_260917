"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/ui/button/Button";
import { Table } from "@/ui/table/Table";
import { Toast } from "@/ui/toast/Toast";
import { Num } from "@/ui/num/Num";
import { parseTsv } from "@/ui/table/parse-tsv";
import type { CellIssue, TableColumn } from "@/ui/table/types";
import type { FooterNoticeItem } from "@/ui/table/footer-notice";
import { useEditableWidth } from "@/ui/table/use-editable-width";
import { formatKrw } from "@/lib/format-number";
import { certPrizeListed } from "@/domain/certs/prize-value";
import { CERT_PRIZE_NAME_MAX, parsePrizeAmount, validatePrizeRows } from "@/domain/certs/prize-rules";
import type { CertEventStatus, CertPrizeDto } from "@/domain/certs/events";
import { generateCertQrAction, saveCertPrizesAction } from "../actions";
import {
  ALREADY_GENERATED_TEXT,
  GENERATE_UNKNOWN_TEXT,
  NEW_PRIZE_DEFAULTS,
  READ_ONLY_REASON,
  cellErrorSummary,
  dirtyCellCount,
  generateKeyFor,
  generateOutcome,
  mergeConflict,
  pinPrizeCellErrors,
  prizeChangesBody,
  qrBlockReason,
  qrServerBlockText,
  resolveConflict,
  saveOutcome,
  saveResultText,
  submitCellPreview,
  withServerLocks,
  type DraftPrizeRow,
  type GenerateKey,
  type PrizeConflict,
  type SubmitCell,
} from "./prize-table-rules";
import styles from "./event-detail.module.css";

// 04.3-10 — I′3 경품 섹션(UI-SPEC I′3 · §6-2 ⑯ · §7-3 (가)~(아) · 「개정 (2026-10-01 결정 확정)」 T2 · T4 · T12). 경영관리
// (canManagePrizes = certs.qr 쓰기 ∧ cert_prize.value — 서버 판정)이면서 1024 이상이면 편집 표, 그 밖은 읽기 표. 1차는 상태가
// 정한다: 신청됨 「QR 생성」(표 dirty + QR 생성 한 트랜잭션) · 그 밖 「일괄 저장 Ctrl+S N」. 신청됨의 Ctrl+S는 저장만(힌트 줄에
// 「저장 Ctrl+S」 — DR-14). 셀 판정은 서버와 같은 validatePrizeRows를 먼저 돌려 오류 셀을 고정하고 서버를 부르지 않는다(DR-5).
// 제출 셀은 편집 중 가액을 곧바로 반영한다(미리 보기 — 판정은 저장 때 서버). 미저장 편집은 브라우저 저장소에 두지 않는다(⑪).

const RESPONSE_TIMEOUT_MS = 20_000;
const PASTE_ORDER = ["name", "unitValue", "delivery", "winnerCount"] as const;
type EditColumn = (typeof PASTE_ORDER)[number];

const HINT_BASE = [
  { label: "이동", keys: "Tab ↑↓←→" },
  { label: "복사", keys: "Ctrl+C" },
  { label: "붙여넣기", keys: "Ctrl+V" },
  { label: "취소", keys: "Esc" },
];
const HINT_NEW_ROW = { label: "새 줄", keys: "Ctrl+Enter" };
const HINT_SAVE = { label: "저장", keys: "Ctrl+S" };

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

type Row = DraftPrizeRow & {
  locked: boolean;
  submittedCount: number;
  quantityCounts: Array<{ quantity: number; count: number }>;
  savedUnitValueKrw?: number;
};

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

function deliveryText(delivery: unknown): string {
  return delivery === "parcel" ? "택배" : "현장";
}

// 가액 칸은 canManagePrizes일 때만 읽는다(서버도 그때만 키를 싣는다 — N7 a · E12). 편집 표는 canManagePrizes일 때만 그린다.
function rowFromPrize(prize: Partial<CertPrizeDto>, canManagePrizes: boolean): Row | null {
  if (!prize.id) return null;
  const unitValueKrw = canManagePrizes ? prize.unitValueKrw : undefined;
  return {
    key: prize.id,
    id: prize.id,
    ...(prize.version !== undefined ? { version: prize.version } : {}),
    name: prize.name ?? "",
    unitValue: unitValueKrw !== undefined ? formatKrw(unitValueKrw) : "",
    delivery: deliveryText(prize.delivery),
    winnerCount: String(prize.winnerCount ?? 1),
    locked: prize.locked === true,
    submittedCount: prize.submittedCount ?? 0,
    quantityCounts: prize.quantityCounts ?? [],
    ...(unitValueKrw !== undefined ? { savedUnitValueKrw: unitValueKrw } : {}),
  };
}

function rowsFromProps(prizes: Partial<CertPrizeDto>[], canManagePrizes: boolean): Row[] {
  return prizes.flatMap((prize) => {
    const row = rowFromPrize(prize, canManagePrizes);
    return row ? [row] : [];
  });
}

function signatureOf(status: CertEventStatus, prizes: Partial<CertPrizeDto>[]): string {
  return `${status}|${prizes.map((p) => `${p.id ?? ""}:${p.version ?? ""}:${p.submittedCount ?? ""}`).join(",")}`;
}

// 닫힌 행사면 `미제출 {k}`(닫힘 ∧ 목록 경품 ∧ N < 당첨 수 — 04.3-17 UD-3 a)까지 본다. 편집 중 당첨 수를 곧바로 반영한다.
function previewOf(row: Row, closed: boolean): SubmitCell {
  return submitCellPreview({
    unitValue: row.unitValue,
    ...(row.savedUnitValueKrw !== undefined ? { savedUnitValueKrw: row.savedUnitValueKrw } : {}),
    submittedCount: row.submittedCount,
    quantityCounts: row.quantityCounts,
    closed,
    winnerCount: row.winnerCount,
  });
}

// 제출 셀 — 숫자만(열 머리글이 단위 — DR-15), `파기 대상 {p}` · `미제출 {k}`는 --status-warning(그 낱말만), `확인증 없음`은 --text-muted.
function SubmitCellView({ cell }: { cell: SubmitCell }) {
  if (cell.kind === "noCert") return <span className={styles.mutedText}>확인증 없음</span>;
  if (cell.kind === "purge" || cell.kind === "missing") {
    return (
      <>
        <Num value={cell.n} unit="count" />
        {" · "}
        <span className={styles.warningText}>{cell.kind === "purge" ? `파기 대상 ${cell.p}` : `미제출 ${cell.k}`}</span>
      </>
    );
  }
  return <Num value={cell.n} unit="count" />;
}

function CellInput({
  label,
  initialValue,
  numeric,
  maxLength,
  describedBy,
  onCommit,
  onMultiPaste,
}: {
  label: string;
  initialValue: string;
  numeric?: boolean;
  maxLength?: number;
  describedBy?: string;
  onCommit: (value: string) => void;
  onMultiPaste: (text: string) => void;
}) {
  const handedOff = useRef(false);
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
      onBlur={(event) => {
        if (!handedOff.current) onCommit(event.currentTarget.value);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          onCommit(event.currentTarget.value);
        }
      }}
      onPaste={(event) => {
        // 여러 칸 글(탭 · 줄바꿈)은 입력에 넣지 않고 표 붙여넣기로 넘긴다 — 「첫 줄 만들기」가 연 경품명 입력이 첫 자리다.
        const text = event.clipboardData.getData("text/plain");
        if (!/[\t\n]/.test(text.replace(/\r?\n$/, ""))) return;
        event.preventDefault();
        handedOff.current = true;
        onMultiPaste(text);
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

// 읽기 표 — 기획본부(N7 a: 경품명 · 전달 · 당첨 수 · 제출 건수, 가액 열 · 확인증 없음 · 파기 대상 없음) · 700~1023 · 폰의 경영관리
// (저장된 가액으로 같은 제출 셀). 폰 칸 접기: P1 경품명 · (경영관리면 1개 가액) · 제출, P2 `{현장|택배} · 당첨 {M}명`.
function PrizeReadTable({ prizes, canManagePrizes, status }: Props) {
  const rows = rowsFromProps(prizes, canManagePrizes);
  const showValue = canManagePrizes && rows.some((row) => row.savedUnitValueKrw !== undefined);
  const columns: TableColumn<Row>[] = [
    { key: "name", header: "경품명", priority: "p1", cell: (row) => <span className={styles.wrapText}>{row.name}</span> },
    ...(showValue
      ? [
          {
            key: "unitValue",
            header: "1개 가액",
            priority: "p1" as const,
            align: "right" as const,
            cell: (row: Row) => <Num value={row.unitValue} />,
          },
        ]
      : []),
    { key: "delivery", header: "전달", priority: "p2", cell: (row) => <span className={styles.nowrap}>{row.delivery}</span> },
    {
      key: "winnerCount",
      header: "당첨 수",
      priority: "p2",
      align: "right",
      cell: (row) => <Num value={row.winnerCount} />,
      summary: (row) => `당첨 ${row.winnerCount}명`,
    },
    {
      key: "submitted",
      header: "제출",
      priority: "p1",
      align: "right",
      cell: (row) =>
        showValue ? <SubmitCellView cell={previewOf(row, status === "closed")} /> : <Num value={row.submittedCount} unit="count" />,
    },
  ];
  const emptyMessage = canManagePrizes ? "경품이 없습니다" : "경품이 없습니다 · 등록은 경영관리";
  return <Table caption="경품" columns={columns} rows={rows} getRowId={(row) => row.key} emptyMessage={emptyMessage} />;
}

function PrizeEditor({ eventId, eventName, status, prizes, contactMissing: initialContactMissing, canOpenSettings, qrLabelId }: Props) {
  const [signature, setSignature] = useState(() => signatureOf(status, prizes));
  const [saved, setSaved] = useState<Row[]>(() => rowsFromProps(prizes, true));
  const [rows, setRows] = useState<Row[]>(() => rowsFromProps(prizes, true));
  const [deleted, setDeleted] = useState<Array<{ id: string; version: number }>>([]);
  const [cellErrors, setCellErrors] = useState<Record<string, string>>({});
  const [conflicts, setConflicts] = useState<Record<string, PrizeConflict<Row>>>({});
  const [reason, setReason] = useState<{ rowKey: string; column: string } | null>(null);
  const [resultLine, setResultLine] = useState<string | null>(null);
  const [successLine, setSuccessLine] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [issueSignal, setIssueSignal] = useState(0);
  const [openCell, setOpenCell] = useState<{ rowId: string; columnKey: string } | null>(null);
  const [contactMissing, setContactMissing] = useState(initialContactMissing);
  const [toast, setToast] = useState<string | null>(null);
  const [generateKey, setGenerateKey] = useState<GenerateKey | null>(null);
  const [cellEditing, setCellEditing] = useState(false);
  const focusQrRef = useRef(false);

  // 서버가 다시 그린 경품 줄(저장 · QR 생성 · 다른 사람의 변경)이 오면 편집 상태를 그 값으로 다시 맞춘다.
  const nextSignature = signatureOf(status, prizes);
  if (nextSignature !== signature) {
    setSignature(nextSignature);
    setSaved(rowsFromProps(prizes, true));
    setRows(rowsFromProps(prizes, true));
    setDeleted([]);
    setCellErrors({});
    setConflicts({});
  }

  // QR 생성 성공 → 같은 화면이 접수 중으로 다시 그려지면 QR 섹션 라벨로 포커스.
  useEffect(() => {
    if (status === "open" && focusQrRef.current) {
      focusQrRef.current = false;
      document.getElementById(qrLabelId)?.focus();
    }
  }, [status, qrLabelId]);

  const body = prizeChangesBody(saved, rows, deleted);
  const dirty = dirtyCellCount(body);

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
  const conflictCount = Object.keys(conflicts).length;
  const listedCount = rows.filter((row) => {
    const amount = parsePrizeAmount(row.unitValue);
    return amount !== null && certPrizeListed(amount);
  }).length;
  const block = requested ? qrBlockReason({ contactMissing, canOpenSettings, rowCount: rows.length, listedCount }) : null;

  function clearResult() {
    setResultLine(null);
    setSuccessLine(null);
  }

  function clearCellError(rowKey: string, column: string) {
    setCellErrors((prev) => {
      const id = `${rowKey}:${column}`;
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  function newRow(): Row {
    return { key: crypto.randomUUID(), ...NEW_PRIZE_DEFAULTS, locked: false, submittedCount: 0, quantityCounts: [] };
  }

  function addRow(after?: Row) {
    if (closed || pending) return;
    const row = newRow();
    setRows((prev) => {
      const index = after ? prev.findIndex((r) => r.key === after.key) : -1;
      return index === -1 ? [...prev, row] : [...prev.slice(0, index + 1), row, ...prev.slice(index + 1)];
    });
    clearResult();
    setOpenCell({ rowId: row.key, columnKey: "name" });
  }

  // 제출 있는 줄 · 닫힌 행사는 줄을 지우지 않는다(N5 a · 닫힘 — 가액 · 당첨 수만). 같은 값으로 다시 넣을 수 있는 줄이고 저장
  // 전까지 표에만 남아(일괄 저장 · 전부 거부) 확인 단계가 없다.
  function deleteRow(row: Row) {
    if (row.locked || closed || pending) return;
    setRows((prev) => prev.filter((r) => r.key !== row.key));
    const { id, version } = row;
    if (id && version !== undefined) setDeleted((prev) => [...prev, { id, version }]);
    setCellErrors((prev) => Object.fromEntries(Object.entries(prev).filter(([cell]) => !cell.startsWith(`${row.key}:`))));
    clearResult();
  }

  function commitCell(rowId: string, column: string, value: string) {
    setReason(null);
    if (!(PASTE_ORDER as readonly string[]).includes(column)) return;
    setRows((prev) => prev.map((row) => (row.key === rowId ? { ...row, [column]: value } : row)));
    clearCellError(rowId, column);
    clearResult();
  }

  const editabilityOf = (row: Row, column: EditColumn) => {
    if (column === "unitValue" || column === "winnerCount") return "edit" as const;
    return row.locked || closed ? ("readonly" as const) : ("edit" as const);
  };

  // §7-3 (다) — 활성 셀에서 오른쪽 · 아래로 채운다(엑셀 경품명 · 가액 · 전달 · 당첨 수). 아래를 넘으면 새 줄(닫힘이면 안 만든다),
  // 읽기 전용 셀에 떨어진 값은 버리지 않고 그 셀을 오류로 고정한다.
  function pasteAt(row: Row, columnKey: string, text: string): string[] {
    const startCol = (PASTE_ORDER as readonly string[]).indexOf(columnKey);
    const startRow = rows.findIndex((r) => r.key === row.key);
    if (startCol === -1 || startRow === -1 || pending) return [];
    const next = [...rows];
    const filled: string[] = [];
    const pinned: Record<string, string> = {};
    const cleared: string[] = [];
    parseTsv(text).forEach((cells, offset) => {
      const index = startRow + offset;
      const existing = next[index];
      if (!existing && closed) return;
      const target = existing ?? newRow();
      const patched: Row = { ...target };
      cells.forEach((value, c) => {
        const column = PASTE_ORDER[startCol + c];
        if (!column) return;
        if (editabilityOf(target, column) !== "edit") {
          pinned[`${target.key}:${column}`] = READ_ONLY_REASON;
          return;
        }
        patched[column] = value.trim();
        cleared.push(`${target.key}:${column}`);
      });
      next[index] = patched;
      filled.push(target.key);
    });
    setRows(next);
    setCellErrors((prev) => {
      const remaining = { ...prev };
      for (const id of cleared) delete remaining[id];
      return { ...remaining, ...pinned };
    });
    clearResult();
    return filled;
  }

  // DR-5 — 같은 판정(validatePrizeRows)을 먼저 돌려 오류가 있으면 고정하고 서버를 부르지 않는다. 남은 오류 · 충돌이 있으면 첫 칸으로.
  function stopAtLocalIssues(): boolean {
    if (errorCount > 0 || conflictCount > 0) {
      setIssueSignal((n) => n + 1);
      return true;
    }
    const checked = validatePrizeRows(rows);
    if (checked.kind !== "invalid") return false;
    setCellErrors(pinPrizeCellErrors(checked.cellErrors));
    setIssueSignal((n) => n + 1);
    return true;
  }

  // §7-3 (나) — 서버의 지금 줄로 표를 맞추고, 버전이 다른 줄은 실제로 달라진 칸만 충돌 셀로 고정한다(값 · 사람 · 시각 ·
  // 「덮어쓰기 / 그 값으로」). 서버에만 있는 줄은 더하고, 서버가 지운 줄은 내가 고쳤을 때만 고정한다(독립 검토 W2 · W4).
  function applyConflict(prizesNow: Array<Record<string, unknown>>) {
    const server = prizesNow.flatMap((prize) => {
      const row = rowFromPrize(prize, true);
      if (!row) return [];
      return [
        {
          row,
          updatedAt: typeof prize.updatedAt === "string" ? prize.updatedAt : null,
          updatedByName: typeof prize.updatedByName === "string" ? prize.updatedByName : null,
        },
      ];
    });
    const merged = mergeConflict({ saved, rows, deleted, server });
    setSaved(merged.saved);
    setRows(merged.rows);
    setDeleted(merged.deleted);
    setConflicts(merged.conflicts);
    setIssueSignal((n) => n + 1);
  }

  async function save() {
    if (pending || dirty === 0 || stopAtLocalIssues()) return;
    setPending(true);
    clearResult();
    const outcome = saveOutcome(await callWithin(() => saveCertPrizesAction({ eventId, changes: body })));
    setPending(false);
    if (outcome.kind === "invalid") {
      setCellErrors(pinPrizeCellErrors(outcome.cellErrors));
      setIssueSignal((n) => n + 1);
      return;
    }
    if (outcome.kind === "conflict") {
      applyConflict(outcome.prizes);
      return;
    }
    if (outcome.kind === "readOnly" && outcome.prizes) {
      // 편집 중 제출이 들어와 잠긴 줄 — 잠김을 표에 옮겨 그 줄의 경품명 · 전달이 읽기 전용이 된다(W4 ⓐ).
      const prizesNow = outcome.prizes;
      setRows((prev) => withServerLocks(prev, prizesNow));
      setSaved((prev) => withServerLocks(prev, prizesNow));
    }
    const text = saveResultText(outcome, new Date());
    if (outcome.kind === "saved") setSuccessLine(text);
    else setResultLine(text);
  }

  async function generate() {
    if (pending || block || stopAtLocalIssues()) return;
    const sent = generateKeyFor(generateKey, body, () => crypto.randomUUID());
    setGenerateKey(sent);
    setPending(true);
    clearResult();
    const outcome = generateOutcome(await callWithin(() => generateCertQrAction({ eventId, requestId: sent.key, changes: body })));
    setPending(false);
    if (outcome.kind === "failed") {
      // 결과 불명 — 같은 표로 다시 누르면 같은 키(QR 둘 안 생김) · 고쳐 보내면 새 키.
      setResultLine(GENERATE_UNKNOWN_TEXT);
      return;
    }
    setGenerateKey(null);
    switch (outcome.kind) {
      case "ok":
        focusQrRef.current = true;
        setToast(`QR 생성 · ${eventName}`);
        return;
      case "alreadyGenerated":
        // 다른 키로 이미 생성 — 내 편집은 저장되지 않았다. 서버가 다시 그린 화면(접수 중 · QR 섹션) 위에 사실 한 줄(W3).
        setResultLine(ALREADY_GENERATED_TEXT);
        return;
      case "blocked":
        if (outcome.reason === "contactMissing") setContactMissing(true);
        else setResultLine(qrServerBlockText(outcome.reason));
        return;
      case "invalid":
        setCellErrors(pinPrizeCellErrors(outcome.cellErrors));
        setIssueSignal((n) => n + 1);
        return;
      case "forbidden":
      case "notFound":
      case "readOnly":
        setResultLine(saveResultText(outcome, new Date()));
        return;
      case "conflict":
        applyConflict(outcome.prizes);
    }
  }

  const issueIdOf = (row: Row, column: string) => (cellErrors[`${row.key}:${column}`] ? `${row.key}-${column}-issue` : undefined);

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
    cell: (row) => (opts.numeric ? <Num value={row[key]} /> : <span className={styles.wrapText}>{row[key]}</span>),
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
        onMultiPaste={(text) => {
          pasteAt(row, key, text);
          ctx.onCommit(parseTsv(text)[0]?.[0]?.trim() ?? "");
        }}
      />
    ),
  });

  const columns: TableColumn<Row>[] = [
    {
      key: "no",
      header: "번호",
      priority: "p3",
      align: "right",
      cell: (row) => <Num value={rows.indexOf(row) + 1} unit="count" />,
      pasteRole: "computed",
    },
    textColumn("name", "경품명", "p1", { maxLength: CERT_PRIZE_NAME_MAX }),
    textColumn("unitValue", "1개 가액", "p1", { numeric: true }),
    {
      key: "delivery",
      header: "전달",
      priority: "p2",
      cell: (row) => <span className={styles.nowrap}>{row.delivery}</span>,
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
      cell: (row) => <SubmitCellView cell={previewOf(row, closed)} />,
    },
  ];

  const cellIssue = (row: Row, column: string): CellIssue | undefined => {
    const message = cellErrors[`${row.key}:${column}`];
    if (message) return { kind: "error", message };
    const conflictMessage = conflicts[row.key]?.cells[column as EditColumn];
    if (conflictMessage) {
      const resolve = (choice: "mine" | "theirs") => {
        const next = resolveConflict({ saved, rows, deleted, conflicts }, row.key, choice);
        setSaved(next.saved);
        setRows(next.rows);
        setDeleted(next.deleted);
        setConflicts(next.conflicts);
      };
      return {
        kind: "conflict",
        message: conflictMessage,
        actions: [
          // 덮어쓰기 — 내 뜻을 서버의 지금 버전 위에 다시 보낸다. 그 값으로 — 서버 줄로 바꾼다.
          { label: "덮어쓰기", onClick: () => resolve("mine") },
          { label: "그 값으로", onClick: () => resolve("theirs") },
        ],
      };
    }
    if (reason && reason.rowKey === row.key && reason.column === column) return { kind: "reason", message: READ_ONLY_REASON };
    return undefined;
  };

  // 셀 오류 · 충돌이 하나라도 있으면 전부 거부(§7-3) — 합계 행 오른쪽 한 줄이 표가 센 수를 대신한다.
  const rejection =
    conflictCount === 0
      ? cellErrorSummary(errorCount)
      : [...(errorCount > 0 ? [`오류 ${errorCount}칸`] : []), `충돌 ${conflictCount}줄`, "전부 거부"].join(" · ");
  const footerNotices: FooterNoticeItem[] = [
    ...(errorCount + conflictCount > 0
      ? [{ tone: "danger" as const, text: rejection, replacesIssueCount: { errorCells: errorCount, conflictRows: conflictCount } }]
      : []),
    ...(resultLine ? [{ tone: "danger" as const, text: resultLine }] : []),
  ];
  const submittedTotal = rows.reduce((sum, row) => sum + row.submittedCount, 0);
  const hint = [...HINT_BASE, ...(closed ? [] : [HINT_NEW_ROW]), ...(requested ? [HINT_SAVE] : [])];

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
        keyboard={{ onNewRow: (row) => addRow(row), onDeleteRow: deleteRow, onSave: () => void save() }}
        onCellCommit={commitCell}
        onPasteAtCell={(row, columnKey, clipboard) => pasteAt(row, columnKey, clipboard.text)}
        onBlockedEdit={(row, columnKey) => {
          if (row.locked) setReason({ rowKey: row.key, column: columnKey });
        }}
        onEditingChange={setCellEditing}
        cellIssue={cellIssue}
        firstIssueSignal={issueSignal}
        footerNotices={footerNotices}
        footerSuccess={successLine}
        hint={hint}
        footer={(notice) => (
          <tr>
            <td colSpan={columns.length} className={styles.footerCell}>
              {`합계 · 경품 ${rows.length}개 · 제출 ${submittedTotal}건`}
              {notice}
            </td>
          </tr>
        )}
      />
      <div className={styles.primaryRow}>
        {requested ? (
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
        ) : (
          <Button
            variant="primary"
            pending={pending}
            disabled={dirty === 0 && !cellEditing}
            disabledReason={dirty === 0 && !cellEditing ? "바뀐 칸 없음" : undefined}
            reasonTone="info"
            shortcut="Ctrl+S"
            onClick={() => void save()}
          >
            {`일괄 저장${dirty > 0 ? ` ${dirty}` : ""}`}
          </Button>
        )}
      </div>
      {toast ? <Toast message={toast} onDismiss={() => setToast(null)} /> : null}
    </>
  );
}
