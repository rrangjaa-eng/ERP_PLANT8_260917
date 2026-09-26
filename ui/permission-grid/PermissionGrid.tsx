"use client";

import { useEffect, useRef, useState } from "react";
import { Toast } from "@/ui/toast/Toast";
import { ListEmpty } from "@/ui/list-empty/ListEmpty";
import { KvList } from "@/ui/kv-list/KvList";
import styles from "./PermissionGrid.module.css";

// SYSTEM.md §7-13 체크박스 매트릭스 — 권한표·정보 노출표 두 화면이 공유한다
// (D-40). `ui/`는 domain·repositories를 import할 수 없으므로(D-26) 이
// 컴포넌트는 계산된 props와 콜백만 받는다 — 판정을 직접 수행하지 않는다.
//
// 열 정의 순서가 그룹 순서를 결정한다 — 호출자가 그룹(메뉴)별로 열을 모아
// 보낸다는 전제다(같은 그룹 이름이 연속되지 않으면 2단 머리글이 그룹을
// 둘로 쪼갠다).
export type PermissionGridRow = { id: string; label: string };
export type PermissionGridColumn = { id: string; label: string; group?: string };

export function buildCellKey(rowId: string, columnId: string): string {
  return `${rowId}::${columnId}`;
}

type CellStatus = "idle" | "delayed" | "error";
type CellState = { checked: boolean; status: CellStatus; reason?: string };

export type PermissionGridProps = {
  /** 시각적으로 숨긴 <caption> 텍스트. */
  caption: string;
  /** 폰 select의 라벨(예: "계급"). */
  rowSelectLabel: string;
  rows: PermissionGridRow[];
  columns: PermissionGridColumn[];
  /** key = buildCellKey(rowId, columnId) */
  values: Record<string, boolean>;
  cellAriaLabel: (row: PermissionGridRow, column: PermissionGridColumn) => string;
  columnAriaLabel: (column: PermissionGridColumn) => string;
  /** ERROR 상태 — 있으면 격자 대신 한 줄을 그린다. */
  errorMessage?: string | null;
  onRetry?: () => void;
  onToggle: (rowId: string, columnId: string, next: boolean) => Promise<void>;
};

export function buildInitialCells(
  rows: PermissionGridRow[],
  columns: PermissionGridColumn[],
  values: Record<string, boolean>,
): Record<string, CellState> {
  const cells: Record<string, CellState> = {};
  for (const row of rows) {
    for (const column of columns) {
      const key = buildCellKey(row.id, column.id);
      cells[key] = { checked: values[key] === true, status: "idle" };
    }
  }
  return cells;
}

// 03-REVIEW.md M-1 — useState(() => buildInitialCells(...))는 첫 마운트에서
// 딱 한 번만 실행된다. readPermissionGrid()가 일시 실패해 rows=[] values={}
// 로 처음 렌더된 뒤 "다시 시도"가 router.refresh()로 실제 매트릭스를
// 가져와도, 클라이언트 컴포넌트는 리마운트되지 않아 cells가 빈 채로 남고
// 격자가 전부 미체크로 그려진다. 이 함수는 rows/columns/values가 바뀔
// 때마다 cells를 다시 만들되, 저장 중이거나 실패한 셀(status !== "idle")은
// 무관한 리렌더가 사용자의 낙관적 토글·되돌림 상태를 지우지 않도록 그대로
// 넘긴다 — key로 리마운트시키면 이 진행 중 상태까지 통째로 사라진다.
export function resyncCells(
  prev: Record<string, CellState>,
  rows: PermissionGridRow[],
  columns: PermissionGridColumn[],
  values: Record<string, boolean>,
): Record<string, CellState> {
  const next = buildInitialCells(rows, columns, values);
  for (const key of Object.keys(next)) {
    const prevCell = prev[key];
    if (prevCell && prevCell.status !== "idle") {
      next[key] = prevCell;
    }
  }
  return next;
}

function groupColumns(columns: PermissionGridColumn[]): Array<{ name: string; span: number }> {
  const groups: Array<{ name: string; span: number }> = [];
  for (const column of columns) {
    const name = column.group ?? "";
    const last = groups[groups.length - 1];
    if (last && last.name === name) {
      last.span += 1;
    } else {
      groups.push({ name, span: 1 });
    }
  }
  return groups;
}

function ColumnCheckbox({
  checked,
  indeterminate,
  ariaLabel,
  onChange,
}: {
  checked: boolean;
  indeterminate: boolean;
  ariaLabel: string;
  onChange: (next: boolean) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);

  return (
    <input
      ref={ref}
      type="checkbox"
      className={styles.headerCheckbox}
      checked={checked}
      aria-label={ariaLabel}
      onChange={(event) => onChange(event.target.checked)}
    />
  );
}

export function PermissionGrid({
  caption,
  rowSelectLabel,
  rows,
  columns,
  values,
  cellAriaLabel,
  columnAriaLabel,
  errorMessage,
  onRetry,
  onToggle,
}: PermissionGridProps) {
  const [cells, setCells] = useState<Record<string, CellState>>(() => buildInitialCells(rows, columns, values));
  const [toast, setToast] = useState<{ message: string; tone: "default" | "error" } | null>(null);
  const [selectedRoleId, setSelectedRoleId] = useState<string>(rows[0]?.id ?? "");
  const delayTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // M-1 회귀 수정: rows/columns/values가 (재조회로) 바뀔 때마다 cells를
  // 다시 동기화한다 — 위 useState의 지연 초기화는 첫 마운트에서만 돈다.
  // 렌더 중 setState로 처리한다(react-hooks/set-state-in-effect 계약:
  // effect 안에서의 동기 setState는 불필요한 연쇄 렌더를 만든다) — React가
  // 권장하는 "prop 변화에 맞춰 state 조정" 패턴이다.
  const [prevRows, setPrevRows] = useState(rows);
  const [prevColumns, setPrevColumns] = useState(columns);
  const [prevValues, setPrevValues] = useState(values);
  if (rows !== prevRows || columns !== prevColumns || values !== prevValues) {
    setPrevRows(rows);
    setPrevColumns(columns);
    setPrevValues(values);
    setCells((prev) => resyncCells(prev, rows, columns, values));
  }

  if (errorMessage) {
    return (
      <ListEmpty
        message={errorMessage}
        tone="error"
        action={{ label: "다시 시도", onClick: () => onRetry?.() }}
      />
    );
  }

  const groups = groupColumns(columns);
  const hasGroups = groups.length > 0 && groups.some((g) => g.name !== "");

  async function saveCell(rowId: string, columnId: string, next: boolean): Promise<boolean> {
    const key = buildCellKey(rowId, columnId);
    // 300ms 넘게 걸리면 그 셀만 지연 표시(§7-7 LOADING 지연 규칙) — 그보다
    // 빨리 끝나면 타이머를 취소해 깜빡임을 만들지 않는다.
    const timer = setTimeout(() => {
      setCells((prev) => ({ ...prev, [key]: { checked: next, status: "delayed" } }));
    }, 300);
    delayTimers.current[key] = timer;

    try {
      await onToggle(rowId, columnId, next);
      clearTimeout(timer);
      setCells((prev) => ({ ...prev, [key]: { checked: next, status: "idle" } }));
      return true;
    } catch {
      clearTimeout(timer);
      // 실패 시 되돌림은 클릭 전 값(= !next)이다 — 서버 값으로 다시
      // 읽어오지 않는다(네트워크가 끊긴 상태에서 되돌림 자체가 또 실패하면
      // 안 된다).
      setCells((prev) => ({
        ...prev,
        [key]: { checked: !next, status: "error", reason: "저장 실패 · 다시 시도" },
      }));
      return false;
    }
  }

  async function handleCellToggle(row: PermissionGridRow, column: PermissionGridColumn) {
    const key = buildCellKey(row.id, column.id);
    const current = cells[key]?.checked ?? false;
    const next = !current;
    setCells((prev) => ({ ...prev, [key]: { checked: next, status: "idle" } }));
    const ok = await saveCell(row.id, column.id, next);
    if (!ok) {
      setToast({ message: "권한 저장 실패 · 다시 시도", tone: "error" });
    }
  }

  async function handleColumnToggle(column: PermissionGridColumn, next: boolean) {
    // 배치 API 없음(D-38) — 열의 각 셀에 개별 저장 호출을 순차로 보낸다.
    let failed = 0;
    let total = 0;
    for (const row of rows) {
      const key = buildCellKey(row.id, column.id);
      setCells((prev) => ({ ...prev, [key]: { checked: next, status: "idle" } }));
      total += 1;
      const ok = await saveCell(row.id, column.id, next);
      if (!ok) failed += 1;
    }
    if (failed > 0) {
      setToast({ message: `권한 저장 · ${total}칸 중 ${failed}칸 실패 · 다시 시도`, tone: "error" });
    }
  }

  function columnState(column: PermissionGridColumn): { checked: boolean; indeterminate: boolean } {
    const checkedCount = rows.filter((row) => cells[buildCellKey(row.id, column.id)]?.checked).length;
    if (checkedCount === 0) return { checked: false, indeterminate: false };
    if (checkedCount === rows.length) return { checked: true, indeterminate: false };
    return { checked: false, indeterminate: true };
  }

  const selectedRow = rows.find((row) => row.id === selectedRoleId) ?? rows[0];

  return (
    <div>
      <div className={styles.desktopOnly}>
        <div className={styles.wrap}>
          <table className={styles.table}>
            <caption className={styles.caption}>{caption}</caption>
            <thead>
              {hasGroups ? (
                <tr>
                  <th className={styles.corner} aria-hidden="true" />
                  {groups.map((group, index) => (
                    <th
                      key={`${group.name}-${index}`}
                      scope="colgroup"
                      colSpan={group.span}
                      className={styles.groupHeader}
                    >
                      {group.name}
                    </th>
                  ))}
                </tr>
              ) : null}
              <tr>
                <th scope="col" className={styles.corner}>
                  {rowSelectLabel}
                </th>
                {columns.map((column) => {
                  const state = columnState(column);
                  return (
                    <th key={column.id} scope="col" className={styles.colHeader}>
                      <ColumnCheckbox
                        checked={state.checked}
                        indeterminate={state.indeterminate}
                        ariaLabel={columnAriaLabel(column)}
                        onChange={(next) => {
                          void handleColumnToggle(column, next);
                        }}
                      />
                      <span className={styles.colHeaderLabel}>{column.label}</span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <th scope="row" className={styles.rowHeader}>
                    {row.label}
                  </th>
                  {columns.map((column) => {
                    const key = buildCellKey(row.id, column.id);
                    const cell = cells[key] ?? { checked: false, status: "idle" as CellStatus };
                    const cellClass = [
                      styles.cell,
                      cell.status === "delayed" ? styles.delayed : "",
                      cell.status === "error" ? styles.errorCell : "",
                    ]
                      .filter(Boolean)
                      .join(" ");
                    return (
                      <td key={column.id} className={cellClass} title={cell.reason}>
                        <label className={styles.cellLabel}>
                          <input
                            type="checkbox"
                            checked={cell.checked}
                            aria-label={cellAriaLabel(row, column)}
                            onChange={() => {
                              void handleCellToggle(row, column);
                            }}
                          />
                        </label>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 폰(375px): 격자 대신 계급 선택 + 항목 목록으로 축을 접는다(§7-13).
          표시 여부는 CSS 미디어 쿼리로만 가른다 — 서버 렌더 결과가 뷰포트에
          따라 달라지지 않는다. */}
      <div className={styles.mobileOnly}>
        <label className={styles.mobileSelectLabel}>
          {rowSelectLabel}
          <select
            className={styles.mobileSelect}
            value={selectedRoleId}
            onChange={(event) => setSelectedRoleId(event.target.value)}
          >
            {rows.map((row) => (
              <option key={row.id} value={row.id}>
                {row.label}
              </option>
            ))}
          </select>
        </label>
        {selectedRow ? (
          <KvList
            items={columns.map((column) => {
              const key = buildCellKey(selectedRow.id, column.id);
              const cell = cells[key] ?? { checked: false, status: "idle" as CellStatus };
              return {
                label: column.group ? `${column.group} · ${column.label}` : column.label,
                value: (
                  <input
                    type="checkbox"
                    className={styles.mobileCheckbox}
                    checked={cell.checked}
                    aria-label={cellAriaLabel(selectedRow, column)}
                    onChange={() => {
                      void handleCellToggle(selectedRow, column);
                    }}
                  />
                ),
              };
            })}
          />
        ) : null}
      </div>

      {toast ? <Toast message={toast.message} tone={toast.tone} onDismiss={() => setToast(null)} /> : null}
    </div>
  );
}
