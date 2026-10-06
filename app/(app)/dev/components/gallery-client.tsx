"use client";

import { useState } from "react";
import Link from "next/link";
import { buttonLinkClassName } from "@/ui/button/Button";
import { ConfirmDialog } from "@/ui/confirm-dialog/ConfirmDialog";
import { Button } from "@/ui/button/Button";
import { TextField } from "@/ui/input/TextField";
import { Num } from "@/ui/num/Num";
import { RowAction, RowActions } from "@/ui/row-actions/RowActions";
import { PanelForm } from "@/ui/side-panel/PanelForm";
import { SidePanel } from "@/ui/side-panel/SidePanel";
import { StatusTag } from "@/ui/status-tag/StatusTag";
import { Table, reconcileSelection } from "@/ui/table/Table";
import type { CellIssue, TableColumn } from "@/ui/table/types";
import { Toast } from "@/ui/toast/Toast";
import styles from "./components.module.css";

// 04.6-13 — 컴포넌트 모음의 클라이언트 표본. 표(`Table`은 함수 prop을 받는다) · 토스트 · 모달 · 행 동작(button 형) ·
// 옆 패널 여는 링크가 서버 페이지 안에서는 못 그려져 여기에 둔다. 값은 전부 코드 안 고정 표본이다(DB 없음 — 사진 결정성).

type SampleRow = {
  id: string;
  group: string;
  name: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  status: "대기" | "승인" | "반려";
};

const SAMPLE_ROWS: SampleRow[] = [
  { id: "a", group: "행사 운영", name: "무대 설치", quantity: 1, unitPrice: 4_200_000, amount: 4_200_000, status: "승인" },
  { id: "b", group: "행사 운영", name: "음향 장비", quantity: 2, unitPrice: 850_000, amount: 1_700_000, status: "대기" },
  { id: "c", group: "제작", name: "현수막", quantity: 12, unitPrice: 45_000, amount: 540_000, status: "반려" },
];

const TOTAL = SAMPLE_ROWS.reduce((sum, row) => sum + row.amount, 0);

const READ_COLUMNS: TableColumn<SampleRow>[] = [
  { key: "name", header: "항목", priority: "p1", cell: (row) => row.name },
  { key: "amount", header: "금액", priority: "p1", align: "right", cell: (row) => <Num value={row.amount} /> },
  { key: "status", header: "상태", priority: "p2", cell: (row) => <StatusTag status={row.status} variant="text" /> },
];

type SampleEditCellProps = { initialValue: string; label: string; onCommit: (value: string) => void; onCancel: () => void };

function SampleEditCell({ initialValue, label, onCommit, onCancel }: SampleEditCellProps) {
  return (
    <input
      aria-label={label}
      defaultValue={initialValue}
      autoFocus
      inputMode="numeric"
      onBlur={(event) => onCommit(event.currentTarget.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") onCommit(event.currentTarget.value);
        if (event.key === "Escape") onCancel();
      }}
    />
  );
}

const EDIT_COLUMNS: TableColumn<SampleRow>[] = [
  { key: "name", header: "항목", priority: "p1", cell: (row) => row.name },
  {
    key: "quantity",
    header: "수량",
    priority: "p2",
    align: "right",
    editability: () => "edit",
    cell: (row) => <Num value={row.quantity} unit="quantity" />,
    editCell: (row, ctx) => <SampleEditCell label="수량" initialValue={String(row.quantity)} onCommit={ctx.onCommit} onCancel={ctx.onCancel} />,
  },
  {
    key: "unitPrice",
    header: "단가",
    priority: "p2",
    align: "right",
    editability: () => "edit",
    cell: (row) => <Num value={row.unitPrice} />,
    editCell: (row, ctx) => <SampleEditCell label="단가" initialValue={String(row.unitPrice)} onCommit={ctx.onCommit} onCancel={ctx.onCancel} />,
  },
  { key: "amount", header: "금액", priority: "p1", align: "right", cell: (row) => <Num value={row.amount} /> },
];

// 표본 칸 상태 — 저장 대기(dirty) 하나 · 오류 하나 · 방금 저장됨 하나.
const DIRTY_CELL = { rowId: "b", columnKey: "quantity" } as const;
const ERROR_CELL = { rowId: "c", columnKey: "unitPrice" } as const;
const SAVED_CELL = { rowId: "a", columnKey: "unitPrice" } as const;

function sampleIssue(row: SampleRow, columnKey: string): CellIssue | undefined {
  if (row.id === ERROR_CELL.rowId && columnKey === ERROR_CELL.columnKey) return { kind: "error", message: "숫자 입력" };
  return undefined;
}

export function ReadTableSample() {
  return <Table caption="읽기 표 표본" columns={READ_COLUMNS} rows={SAMPLE_ROWS} getRowId={(row) => row.id} />;
}

export function EditTableSample() {
  return (
    <Table
      caption="편집 표 표본"
      columns={EDIT_COLUMNS}
      rows={SAMPLE_ROWS}
      getRowId={(row) => row.id}
      groupBy={(row) => row.group}
      enableGridKeyboard
      cellIssue={sampleIssue}
      cellDirty={(row, columnKey) => row.id === DIRTY_CELL.rowId && columnKey === DIRTY_CELL.columnKey}
      cellSaved={(row, columnKey) => row.id === SAVED_CELL.rowId && columnKey === SAVED_CELL.columnKey}
      footer={(notice) => (
        <tr>
          <td colSpan={EDIT_COLUMNS.length}>
            {`합계 · ${SAMPLE_ROWS.length}줄 · `}
            <Num value={TOTAL} />
            {notice}
          </td>
        </tr>
      )}
    />
  );
}

// 06-29(SP-1) — 선택 표 표본. 여섯 행 중 둘은 고를 수 없고(이유 글자), `Ctrl+Enter`(또는 1차)는 표본 처리다 —
// 고른 행 중 첫 행은 막혀(`blockedReason` · 선택 해제) 남고 나머지는 처리돼 사라진다. 선택은 `reconcileSelection`으로 다시 센다.
type SelectRow = { id: string; name: string; amount: number; gate: string | null };

const SELECT_ROWS: SelectRow[] = [
  { id: "s1", name: "표본 가", amount: 1_250_000, gate: null },
  { id: "s2", name: "표본 나", amount: 540_000, gate: null },
  { id: "s3", name: "표본 다", amount: 1_700_000, gate: null },
  { id: "s4", name: "표본 라", amount: 4_200_000, gate: null },
  { id: "s5", name: "표본 마", amount: 320_000, gate: "증빙 확인 전" },
  { id: "s6", name: "표본 바", amount: 150_000, gate: "증빙 확인 전" },
];

const SELECT_COLUMNS: TableColumn<SelectRow>[] = [
  { key: "name", header: "항목", priority: "p1", cell: (row) => row.name },
  { key: "amount", header: "금액", priority: "p1", align: "right", cell: (row) => <Num value={row.amount} /> },
];

export function SelectTableSample() {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [doneIds, setDoneIds] = useState<string[]>([]);
  const [blocked, setBlocked] = useState<Record<string, string>>({});
  const rows = SELECT_ROWS.filter((row) => !doneIds.includes(row.id));

  const selectableOf = (nextBlocked: Record<string, string>) => (row: SelectRow): true | { reason: string } => {
    if (nextBlocked[row.id]) return { reason: "계좌 확인 전" };
    return row.gate === null ? true : { reason: row.gate };
  };
  const selectable = selectableOf(blocked);
  const chosen = reconcileSelection(selectedIds, rows, (row) => row.id, selectable);

  function process() {
    if (chosen.length === 0) return;
    const [first, ...rest] = chosen;
    const nextBlocked = { ...blocked, [first!]: "계좌 오류" };
    const nextDone = [...doneIds, ...rest];
    setBlocked(nextBlocked);
    setDoneIds(nextDone);
    setSelectedIds(reconcileSelection(chosen, rows.filter((row) => !rest.includes(row.id)), (row) => row.id, selectableOf(nextBlocked)));
  }

  return (
    <>
      <div className={styles.samples}>
        <Button
          variant="primary"
          shortcut="Ctrl+Enter"
          disabled={chosen.length === 0}
          disabledReason={chosen.length === 0 ? "고른 건 없음" : undefined}
          reasonTone="info"
          onClick={process}
        >
          {chosen.length === 0 ? "지급 완료" : `지급 완료 ${chosen.length}`}
        </Button>
      </div>
      <Table
        caption="선택 표 표본"
        columns={SELECT_COLUMNS}
        rows={rows}
        getRowId={(row) => row.id}
        enableGridKeyboard
        hint={[
          { label: "이동", keys: "Tab ↑↓←→" },
          { label: "고르기", keys: "Space" },
        ]}
        selection={{
          selectedIds: chosen,
          selectable,
          onChange: setSelectedIds,
          rowLabel: (row) => row.name,
          blockedReason: (row) => blocked[row.id] ?? null,
          onPrimary: process,
        }}
      />
    </>
  );
}

export function RowActionsSamples() {
  return (
    <div data-gallery="row-actions">
      <RowActions>
        <RowAction href="/dev/components">수정</RowAction>
      </RowActions>
      <RowActions>
        <RowAction href="/dev/components">수정</RowAction>
        <RowAction onClick={() => undefined}>숨기기</RowAction>
      </RowActions>
      <RowActions>
        <RowAction href="/dev/components">수정</RowAction>
        <RowAction onClick={() => undefined}>숨기기</RowAction>
        <RowAction danger onClick={() => undefined}>
          삭제
        </RowAction>
      </RowActions>
    </div>
  );
}

export function ToastSample() {
  const [shown, setShown] = useState(false);
  return (
    <>
      <Button variant="secondary" onClick={() => setShown(true)}>
        토스트 띄우기
      </Button>
      {shown ? <Toast message="표본 · 저장됨" actionLabel="되돌리기" onAction={() => setShown(false)} onDismiss={() => setShown(false)} /> : null}
    </>
  );
}

export function ModalSample() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        모달 열기
      </Button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        title="표본 확인"
        subtitle="모달 표본"
        primary={{ label: "표본 확인", onConfirm: () => setOpen(false) }}
      />
    </>
  );
}

export function PanelOpener() {
  return (
    <Link href="/dev/components?panel=1" scroll={false} className={buttonLinkClassName("secondary")}>
      옆 패널 열기
    </Link>
  );
}

// `?panel=1`일 때 page.tsx가 그린다 — PC 오른쪽 480 · 폰 아래 시트(SidePanel 기본 모양). 제출은 아무 일도 하지 않는다.
export function GalleryPanel() {
  return (
    <SidePanel title="표본 등록" closeHref="/dev/components">
      <PanelForm id="gallery-panel-form" label="표본 등록" intent="create" onSubmit={(event) => event.preventDefault()}>
        <TextField id="gallery-panel-name" name="name" label="표본 이름" />
      </PanelForm>
    </SidePanel>
  );
}
