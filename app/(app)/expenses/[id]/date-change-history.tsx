import type { DateChangeHistoryDto } from "@/domain/expenses/date-change";
import { StaticTable, type StaticTableColumn } from "@/ui/table/StaticTable";
import { StatusTag } from "@/ui/status-tag/StatusTag";
import type { StatusWord } from "@/ui/status-tag/status-map";
import styles from "./expense.module.css";

// 07.2-18 S16 이력(D-7291 · D-7293): 요청이 한 번이라도 있으면 `희망 지급일` 자리 아래 읽기 표 — 없으면 DOM 0(호출부가 거른다).
// `새 희망일` P1 · `상태`(글자 — 대기 muted · 승인 success · 거절 danger · 회수 muted) P1 · `요청` P2(요청자 · 시각 · 변경 사유) ·
// `처리` P2(처리자 · 시각 · 거절 메모). 폰(<700)은 P1 두 열 + 접힌 줄(StaticTable CSS). 지급 완료 · 종결로 남은 대기 요청은 `대기` + 처리 `—`.
const COLUMNS: StaticTableColumn[] = [
  { key: "newDate", header: "새 희망일", priority: "p1" },
  { key: "status", header: "상태", priority: "p1" },
  { key: "request", header: "요청", priority: "p2" },
  { key: "decision", header: "처리", priority: "p2" },
];

const STATUS_WORDS: readonly StatusWord[] = ["대기", "승인", "거절", "회수"];

function isStatusWord(word: string | undefined): word is StatusWord {
  return word !== undefined && (STATUS_WORDS as readonly string[]).includes(word);
}

export function DateChangeHistory({ rows }: { rows: Partial<DateChangeHistoryDto>[] }) {
  const dash = <span className={styles.muted}>—</span>;
  return (
    <StaticTable
      caption="희망 지급일 변경 이력"
      columns={COLUMNS}
      rows={rows.map((row, index) => ({
        key: row.id ?? String(index),
        cells: [
          <span key="date" className={styles.nowrap}>
            {row.newDate ?? "—"}
          </span>,
          isStatusWord(row.status) ? <StatusTag key="status" status={row.status} variant="text" /> : dash,
          <span key="request">
            {[row.requesterName, row.requestedAt].filter(Boolean).join(" · ")}
            {row.reason ? <span className={styles.subLine}>{row.reason}</span> : null}
          </span>,
          row.decidedAt ? (
            <span key="decision">
              {[row.deciderName, row.decidedAt].filter(Boolean).join(" · ")}
              {row.rejectMemo ? <span className={styles.subLine}>{row.rejectMemo}</span> : null}
            </span>
          ) : (
            dash
          ),
        ],
      }))}
    />
  );
}
