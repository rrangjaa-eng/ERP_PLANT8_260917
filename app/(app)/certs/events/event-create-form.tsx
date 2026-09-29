"use client";

import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { Form } from "@/ui/form/Form";
import { Button } from "@/ui/button/Button";
import { ConfirmDialog } from "@/ui/confirm-dialog/ConfirmDialog";
import { Table } from "@/ui/table/Table";
import type { CellIssue, TableColumn } from "@/ui/table/types";
import type { FooterNoticeItem } from "@/ui/table/footer-notice";
import { parseTsv } from "@/ui/table/parse-tsv";
import { useEditableWidth } from "@/ui/table/use-editable-width";
import { checkPayloadSize } from "@/lib/actions/payload-size";
import { buildPublicRows } from "@/domain/certs/roster-display";
import { createCertEventAction } from "./actions";
import {
  NEW_ROW_DEFAULTS,
  cellErrorSummary,
  countChangedCells,
  createBlockReason,
  createSubmitOutcome,
  pinCellErrors,
  pinFieldErrors,
  type DraftWinnerRow,
} from "./create-form-rules";
import styles from "./events.module.css";

// 04.3-04 Task 3 ③ — I2 행사 만들기(UI-SPEC I2). Form(720)에는 칸 둘만, 당첨자 편집 표와 Form.Actions는 <form> 밖 형제
// (컨테이너 폭). 판정(N · 막힘 이유 · 셀 오류 문장 · 제출 응답 갈래)은 create-form-rules.ts만 부른다.
// 미저장 편집은 브라우저 저장소에 두지 않는다 — beforeunload 경고만(개정 ⑪).

const FORM_ID = "cert-event-new";
const NAME_ID = "cert-event-name";
const WON_ON_ID = "cert-event-won-on";
const LIST_HREF = "/certs/events";
const RESPONSE_TIMEOUT_MS = 20_000;

// 엑셀 범위 붙여넣기 순서 = 이름 · 전화번호 · 경품명 · 수량 · 전달(· 구별 표시).
const PASTE_ORDER = ["name", "phone", "prizeName", "quantity", "delivery", "distinguishLabel"] as const;
type DraftColumn = (typeof PASTE_ORDER)[number];

const HINT = [
  { label: "이동", keys: "Tab ↑↓←→" },
  { label: "복사", keys: "Ctrl+C" },
  { label: "붙여넣기", keys: "Ctrl+V" },
  { label: "취소", keys: "Esc" },
  { label: "새 줄", keys: "Ctrl+Enter" },
];

// 결과 불명(연결 끊김 · 20초)은 "unreachable" — createSubmitOutcome이 failed로 가른다(E3-22).
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

// 편집 입력의 Ctrl+V가 여러 칸 글(탭 · 줄바꿈)이면 입력에 넣지 않고 표 붙여넣기로 넘긴다 — 빈 표는 「첫 줄 만들기」가
// 이름 칸을 편집 상태로 열기 때문에 엑셀 범위를 붙여 넣는 첫 자리가 이 입력이다(ui/table은 입력 안 붙여넣기를 가로채지 않는다).
function TextEditCell({
  label,
  initialValue,
  maxLength,
  numeric,
  describedBy,
  onCommit,
  onMultiPaste,
}: {
  label: string;
  initialValue: string;
  maxLength?: number;
  numeric?: boolean;
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
        const text = event.clipboardData.getData("text/plain");
        if (!/[\t\n]/.test(text.replace(/\r?\n$/, ""))) return;
        event.preventDefault();
        handedOff.current = true;
        onMultiPaste(text);
      }}
    />
  );
}

export function EventCreateForm({
  today,
  contactMissing,
  canOpenSettings,
}: {
  /** 서버가 렌더 때 준 오늘(KST) — 당첨일 초기값이자 입력 버리기의 처음 값(D-11). */
  today: string;
  contactMissing: boolean;
  canOpenSettings: boolean;
}) {
  const router = useRouter();
  const wide = useEditableWidth();
  const hintId = useId();

  // 1024 미만에서 이 부품은 null을 그리지만 마운트는 남는다 — 줄 값 · 셀 오류 · 두 칸 · requestId는 여기 상태다(N-4 · R2-4).
  const [name, setName] = useState("");
  const [wonOn, setWonOn] = useState(today);
  const [rows, setRows] = useState<DraftWinnerRow[]>([]);
  const [cellErrors, setCellErrors] = useState<Record<string, string>>({});
  const [fieldErrors, setFieldErrors] = useState<{ name?: string; wonOn?: string }>({});
  const [requestId] = useState(() => crypto.randomUUID());
  const [contactMissingNow, setContactMissingNow] = useState(contactMissing);
  const [resultLine, setResultLine] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [issueSignal, setIssueSignal] = useState(0);
  const [openCell, setOpenCell] = useState<{ rowId: string; columnKey: string } | null>(null);
  const [discardCount, setDiscardCount] = useState<number | null>(null);
  const leavingRef = useRef(false);

  const changed = countChangedCells({ name: "", wonOn: today, rows: [] }, { name, wonOn, rows });

  useEffect(() => {
    if (changed === 0) return;
    function handleBeforeUnload(event: BeforeUnloadEvent) {
      if (leavingRef.current) return;
      event.preventDefault();
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [changed]);

  if (!wide) return null;

  const emptyFields = [...(name.trim() === "" ? ["행사 이름"] : []), ...(wonOn === "" ? ["당첨일"] : [])];
  const block = createBlockReason({ contactMissing: contactMissingNow, canOpenSettings, emptyFields, rowCount: rows.length });
  const errorCount = Object.keys(cellErrors).length;

  function newRow(): DraftWinnerRow {
    return { key: crypto.randomUUID(), ...NEW_ROW_DEFAULTS };
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

  function addRow(after?: DraftWinnerRow) {
    const row = newRow();
    setRows((prev) => {
      const index = after ? prev.findIndex((r) => r.key === after.key) : -1;
      return index === -1 ? [...prev, row] : [...prev.slice(0, index + 1), row, ...prev.slice(index + 1)];
    });
    setResultLine(null);
    setOpenCell({ rowId: row.key, columnKey: "name" });
  }

  function commitCell(rowId: string, column: string, value: string) {
    if (!(PASTE_ORDER as readonly string[]).includes(column)) return;
    setRows((prev) => prev.map((row) => (row.key === rowId ? { ...row, [column]: value } : row)));
    clearCellError(rowId, column);
    setResultLine(null);
  }

  function pasteAt(row: DraftWinnerRow, columnKey: string, text: string): string[] {
    const startCol = (PASTE_ORDER as readonly string[]).indexOf(columnKey);
    const startRow = rows.findIndex((r) => r.key === row.key);
    if (startCol === -1 || startRow === -1) return [];
    const parsed = parseTsv(text);
    const next = [...rows];
    const filled: string[] = [];
    const cleared: string[] = [];
    parsed.forEach((cells, offset) => {
      const index = startRow + offset;
      const target = next[index] ?? newRow();
      const patched = { ...target };
      cells.forEach((value, c) => {
        const column = PASTE_ORDER[startCol + c];
        if (!column) return;
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
      return remaining;
    });
    setResultLine(null);
    return filled;
  }

  function focusField(id: string) {
    document.getElementById(id)?.focus();
  }

  function requestCancel() {
    if (pending) return;
    if (changed === 0) {
      router.push(LIST_HREF);
      return;
    }
    setDiscardCount(changed);
  }

  // DR-27 — 내부 컨트롤(셀 편집 · 표 격자 · 열린 select)이 Esc를 먼저 쓴다. 그 밖의 Esc만 「취소 Esc」와 같다.
  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Escape") return;
    if (event.defaultPrevented || event.nativeEvent.isComposing || pending) return;
    // 04-46 편차(project-form.tsx) — 막지 않으면 같은 keydown이 방금 연 확인을 다시 닫는다.
    event.preventDefault();
    requestCancel();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || block) return;
    // DR-5 — 오류가 남아 있으면 서버를 부르지 않고 첫 오류로: 폼 칸(행사 이름 → 당첨일) → 표의 첫 오류 셀.
    if (fieldErrors.name) return focusField(NAME_ID);
    if (fieldErrors.wonOn) return focusField(WON_ON_ID);
    if (errorCount > 0) {
      setIssueSignal((n) => n + 1);
      return;
    }
    const sent = rows;
    const payload = {
      name,
      wonOn,
      requestId,
      winners: sent.map((row) => ({
        name: row.name,
        phone: row.phone,
        prizeName: row.prizeName,
        quantity: row.quantity,
        delivery: row.delivery,
        distinguishLabel: row.distinguishLabel,
      })),
    };
    // 확정 거부는 보내지 않는다 — 서버 미들웨어와 같은 함수 · 같은 한도(N-1).
    const size = checkPayloadSize(payload);
    if (!size.ok) {
      setResultLine(size.reason);
      return;
    }
    setPending(true);
    setResultLine(null);
    const outcome = createSubmitOutcome(await callWithin(() => createCertEventAction(payload)));
    if (outcome.kind === "success") {
      leavingRef.current = true;
      router.push(`/certs/events/${outcome.eventId}?created=1`);
      return;
    }
    setPending(false);
    if (outcome.kind === "invalid") {
      // 서버 rowKey는 보낸 줄의 순번이다 — 화면 줄 키로 옮겨 고정한다.
      setCellErrors(pinCellErrors(outcome.cellErrors.map((error) => ({ ...error, rowKey: sent[Number(error.rowKey)]?.key ?? error.rowKey }))));
      const pinnedFields = pinFieldErrors(outcome.fieldErrors);
      setFieldErrors(pinnedFields);
      if (pinnedFields.name) focusField(NAME_ID);
      else if (pinnedFields.wonOn) focusField(WON_ON_ID);
      else setIssueSignal((n) => n + 1);
    } else if (outcome.kind === "contactMissing") {
      setContactMissingNow(true);
    } else {
      setResultLine("만들기 결과 모름 · 다시 누르기");
    }
  }

  const preview = new Map(
    buildPublicRows(
      rows.map((row, index) => ({
        id: row.key,
        name: row.name,
        prizeName: row.prizeName.trim(),
        quantity: Number(row.quantity.trim()) || 0,
        distinguishLabel: row.distinguishLabel.trim() || null,
        sortOrder: index,
      })),
    ).map((entry) => [entry.rowId, entry]),
  );

  const issueIdOf = (row: DraftWinnerRow, column: string) =>
    cellErrors[`${row.key}:${column}`] ? `${row.key}-${column}-issue` : undefined;

  const textColumn = (
    key: DraftColumn,
    header: string,
    priority: TableColumn<DraftWinnerRow>["priority"],
    opts: { maxLength?: number; numeric?: boolean; wrap?: boolean; describedBy?: string } = {},
  ): TableColumn<DraftWinnerRow> => ({
    key,
    header,
    priority,
    align: opts.numeric ? "right" : undefined,
    headerDescribedBy: opts.describedBy,
    cell: (row) => <span className={opts.wrap ? styles.wrapText : styles.nowrap}>{row[key]}</span>,
    copyText: (row) => row[key],
    editability: () => "edit",
    editCell: (row, ctx) => (
      <TextEditCell
        label={header}
        initialValue={row[key]}
        maxLength={opts.maxLength}
        numeric={opts.numeric}
        describedBy={[opts.describedBy, issueIdOf(row, key)].filter(Boolean).join(" ") || undefined}
        onCommit={ctx.onCommit}
        onMultiPaste={(text) => {
          pasteAt(row, key, text);
          // 편집기를 닫고 포커스를 셀로 돌린다 — 값은 pasteAt이 이미 넣은 첫 칸 값과 같다.
          ctx.onCommit(parseTsv(text)[0]?.[0]?.trim() ?? "");
        }}
      />
    ),
  });

  const columns: TableColumn<DraftWinnerRow>[] = [
    {
      key: "no",
      header: "번호",
      priority: "p3",
      align: "right",
      cell: (row) => <span className={styles.nowrap}>{rows.indexOf(row) + 1}</span>,
      pasteRole: "computed",
    },
    textColumn("name", "이름", "p1", { maxLength: 40 }),
    textColumn("phone", "전화번호", "p2"),
    textColumn("prizeName", "경품명", "p2", { maxLength: 80, wrap: true }),
    textColumn("quantity", "수량", "p1", { numeric: true }),
    {
      key: "delivery",
      header: "전달",
      priority: "p2",
      cell: (row) => row.delivery,
      copyText: (row) => row.delivery,
      editability: () => "edit",
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
    textColumn("distinguishLabel", "구별 표시", "p2", { maxLength: 10, describedBy: hintId }),
    {
      key: "preview",
      header: "수령자 화면",
      priority: "p3",
      pasteRole: "computed",
      cell: (row) => {
        const entry = preview.get(row.key);
        if (!entry) return null;
        const second = [entry.prizeLine, entry.label].filter(Boolean).join(" · ");
        return (
          <>
            <span className={styles.nowrap}>{entry.maskedName}</span>
            {second ? <span className={styles.previewSecond}>{second}</span> : null}
          </>
        );
      },
    },
  ];

  const cellIssue = (row: DraftWinnerRow, column: string): CellIssue | undefined => {
    const message = cellErrors[`${row.key}:${column}`];
    return message ? { kind: "error", message } : undefined;
  };

  const footerNotices: FooterNoticeItem[] = [
    ...(errorCount > 0
      ? [{ tone: "danger" as const, text: cellErrorSummary(errorCount), replacesIssueCount: { errorCells: errorCount, conflictRows: 0 } }]
      : []),
    ...(resultLine ? [{ tone: "danger" as const, text: resultLine }] : []),
  ];

  return (
    <>
      <div className={styles.createSection} onKeyDown={handleKeyDown}>
        <h2 className={styles.createTitle}>행사 만들기</h2>
        <Form id={FORM_ID} onSubmit={(event) => void handleSubmit(event)}>
          <Form.Field id={NAME_ID} label="행사 이름" width="long">
            <input
              id={NAME_ID}
              name="name"
              type="text"
              autoComplete="off"
              maxLength={80}
              className={styles.textInput}
              value={name}
              onChange={(event) => {
                setName(event.currentTarget.value);
                setFieldErrors((prev) => ({ ...prev, name: undefined }));
                setResultLine(null);
              }}
              aria-invalid={fieldErrors.name ? true : undefined}
              aria-describedby={fieldErrors.name ? `${NAME_ID}-error` : undefined}
            />
            {fieldErrors.name ? <Form.Error id={`${NAME_ID}-error`}>{fieldErrors.name}</Form.Error> : null}
          </Form.Field>
          <Form.Field id={WON_ON_ID} label="당첨일" width="short">
            <input
              id={WON_ON_ID}
              name="wonOn"
              type="date"
              placeholder="2026-09-18"
              className={styles.textInput}
              value={wonOn}
              onChange={(event) => {
                setWonOn(event.currentTarget.value);
                setFieldErrors((prev) => ({ ...prev, wonOn: undefined }));
                setResultLine(null);
              }}
              aria-invalid={fieldErrors.wonOn ? true : undefined}
              aria-describedby={fieldErrors.wonOn ? `${WON_ON_ID}-error` : undefined}
            />
            {fieldErrors.wonOn ? <Form.Error id={`${WON_ON_ID}-error`}>{fieldErrors.wonOn}</Form.Error> : null}
          </Form.Field>
        </Form>

        <h3 className={styles.sectionLabel}>당첨자</h3>
        <p id={hintId} className={styles.hint}>
          구별 표시는 수령자 목록에 그대로 보입니다 · 이름·전화번호는 쓰지 마세요
        </p>
        <Table
          caption="당첨자"
          columns={columns}
          rows={rows}
          getRowId={(row) => row.key}
          emptyMessage="당첨자가 없습니다"
          emptyAction={{ label: "첫 줄 만들기", shortcut: "Ctrl+Enter", onClick: () => addRow() }}
          enableGridKeyboard
          saveLocked={pending}
          openCell={openCell}
          keyboard={{
            onNewRow: (row) => addRow(row),
            onDeleteRow: (row) => {
              setRows((prev) => prev.filter((r) => r.key !== row.key));
              setCellErrors((prev) => Object.fromEntries(Object.entries(prev).filter(([id]) => !id.startsWith(`${row.key}:`))));
            },
          }}
          onCellCommit={commitCell}
          onPasteAtCell={(row, columnKey, clipboard) => pasteAt(row, columnKey, clipboard.text)}
          cellIssue={cellIssue}
          firstIssueSignal={issueSignal}
          footerNotices={footerNotices}
          hint={HINT}
          footer={(notice) => (
            <tr>
              <td colSpan={columns.length} className={styles.footerCell}>
                {`합계 · ${rows.length}명`}
                {notice}
              </td>
            </tr>
          )}
        />

        <Form.Actions>
          <Button
            type="submit"
            form={FORM_ID}
            variant="primary"
            pending={pending}
            disabled={block !== null}
            disabledReason={block?.text}
            reasonTone={block?.tone}
          >
            행사 만들기
          </Button>
          <Button variant="secondary" shortcut="Esc" disabled={pending} onClick={requestCancel}>
            취소
          </Button>
        </Form.Actions>
      </div>

      {/* Phase 4 공용 확인(§7-17) — <form> · 표 밖 형제(project-form.tsx 선례). */}
      <ConfirmDialog
        open={discardCount !== null}
        onClose={() => setDiscardCount(null)}
        title="입력 버리기"
        subtitle={`행사 만들기 · ${discardCount ?? 0}칸`}
        primary={{
          label: "입력 버리기",
          onConfirm: () => {
            leavingRef.current = true;
            router.push(LIST_HREF);
          },
        }}
      />
    </>
  );
}
