"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { buttonLinkClassName } from "@/ui/button/Button";
import { Attachments, type AttachmentActions, type AttachmentFile, type BulkImportRow } from "@/ui/attachments/Attachments";
import { ConfirmDialog } from "@/ui/confirm-dialog/ConfirmDialog";
import { Button } from "@/ui/button/Button";
import { TextField } from "@/ui/input/TextField";
import { PickDialog, type PickItem, type PickManyOutcome, type PickResult, type PickRow } from "@/ui/pick-dialog/PickDialog";
import { Num } from "@/ui/num/Num";
import { RowAction, RowActions } from "@/ui/row-actions/RowActions";
import { KvList } from "@/ui/kv-list/KvList";
import { PanelForm } from "@/ui/side-panel/PanelForm";
import { SidePanel } from "@/ui/side-panel/SidePanel";
import { StatusTag } from "@/ui/status-tag/StatusTag";
import { RowSheet } from "@/ui/table/RowSheet";
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

// 06-29(SP-7 · §7-17) — 첨부 보기 칸 확인 모달 표본. 열 때 0.8초 `loading`, 첫 확인은 동시성 거부(새로 고침 꼬리) → `refreshKeepsOpen`으로 열린 채
// 다른 파일 목록이 된다. 「서버 값」은 서버 페이지가 매 렌더에 주는 `serverStamp`다 — `router.refresh()`가 새 값을 가져오면 칸이 다시 그려진다.
const ATTACH_NOW = "2026-10-06T00:00:00.000Z";
const ATTACH_FILES_BEFORE: AttachmentFile[] = [
  { id: "f1", name: "세금계산서.pdf", sizeBytes: 182_000, createdAt: ATTACH_NOW },
  { id: "f2", name: "견적서.pdf", sizeBytes: 241_000, createdAt: ATTACH_NOW },
  { id: "f3", name: "현장 사진 1.jpg", sizeBytes: 1_200_000, createdAt: ATTACH_NOW },
  { id: "f4", name: "현장 사진 2.jpg", sizeBytes: 1_400_000, createdAt: ATTACH_NOW },
];
const ATTACH_FILES_AFTER: AttachmentFile[] = [
  { id: "f5", name: "세금계산서 수정본.pdf", sizeBytes: 190_000, createdAt: ATTACH_NOW },
  { id: "f6", name: "통장 사본.pdf", sizeBytes: 90_000, createdAt: ATTACH_NOW },
];
// 보기만 — 올리기 · 삭제 · 입력이 없다. `크게 보기`는 주소가 없으면 새 탭을 열자마자 닫는다.
const READ_ONLY_ACTIONS: AttachmentActions = {
  request: () => Promise.resolve({ ok: false, message: "표본" }),
  complete: () => Promise.resolve({ ok: false, message: "표본", retry: "restart" }),
  remove: () => Promise.resolve(false),
  viewUrl: () => Promise.resolve(null),
};

export function AttachmentsConfirmSample({ serverStamp }: { serverStamp: number }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [openedAtStamp, setOpenedAtStamp] = useState<number | null>(null);
  const [rejected, setRejected] = useState(false);
  const refreshed = openedAtStamp !== null && serverStamp !== openedAtStamp;

  function openIt() {
    setOpenedAtStamp(serverStamp);
    setRejected(false);
    setLoading(true);
    setOpen(true);
    window.setTimeout(() => setLoading(false), 800);
  }

  return (
    <>
      <Button variant="secondary" onClick={openIt}>
        첨부 확인 열기
      </Button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        title="증빙 확인"
        subtitle="표본 건"
        loading={loading}
        refreshKeepsOpen
        attachments={
          <Attachments mode="read" files={refreshed ? ATTACH_FILES_AFTER : ATTACH_FILES_BEFORE} actions={READ_ONLY_ACTIONS} maxMb={10} uploadFailedText="올리지 못함 · 다시 올리기" canAdd={false} deletableIds={[]} />
        }
        primary={{
          label: "증빙 확인",
          onConfirm: () => (refreshed ? setOpen(false) : setRejected(true)),
          disabledReason: rejected && !refreshed ? "박서연이 14:01에 증빙을 바꿈 · 새로 고침" : undefined,
        }}
      />
    </>
  );
}

// 06-29(SP-8) — 고르기 목록 표본. 검색어로 갈래를 고른다: (없음) 현재 줄 + 고를 수 없는 행 + 그룹 줄 · `막힘` 전부 고를 수 없음 · `오류` 로드 실패 ·
// `느림` 1.5초 뒤 · `많음` 120줄 · `긴` 긴 이름 · `zzz` 0건. 빈 목록 표본은 검색어 없음이 빈 목록 줄이다.
const PICK_BASE: PickItem[] = [
  { type: "group", id: "g1", label: "표본 프로젝트 · 1차" },
  { type: "row", id: "p1", number: "1", title: "무대 설치", subtitle: "표본 거래처 가", amount: { krw: 4_200_000 }, selectable: true, current: true },
  { type: "row", id: "p2", number: "2", title: "음향 장비", subtitle: "표본 거래처 나", amount: { krw: 1_700_000 }, selectable: true },
  { type: "row", id: "p3", number: "3", title: "현수막", subtitle: "표본 거래처 다", amount: { krw: 540_000 }, selectable: false, reason: "카드 사용 연결됨" },
  { type: "row", id: "p4", number: "4", title: "운송", subtitle: "표본 거래처 라", amount: { krw: 320_000 }, selectable: false, reason: "구매 요청 중" },
];
const PICK_BLOCKED: PickItem[] = PICK_BASE.filter((item) => item.type === "group" || !item.selectable);
const PICK_MANY: PickItem[] = Array.from({ length: 120 }, (_, index) => ({
  type: "row" as const,
  id: `m${index + 1}`,
  number: String(index + 1),
  title: `표본 줄 ${index + 1}`,
  subtitle: "표본 거래처",
  amount: { krw: 100_000 + index },
  selectable: true,
}));
const PICK_LONG: PickItem[] = [
  {
    type: "row",
    id: "l1",
    number: "1",
    title: "아주 긴 항목 이름 표본 무대 설치 및 철거 · 조명 · 음향 · 영상 · 현수막 · 운송 일괄",
    subtitle: "아주 긴 거래처 이름 표본 주식회사 플랜트에이트 크리에이티브 솔루션즈 서울 본사",
    amount: { krw: 12_345_678 },
    selectable: true,
  },
];

function pickSearchFor(options: { empty: boolean }) {
  return async (query: string): Promise<PickResult | null> => {
    const q = query.trim();
    if (q === "오류") return null;
    if (q === "느림") await new Promise((resolve) => window.setTimeout(resolve, 1500));
    if (q === "zzz") return { items: [], truncated: false };
    if (q === "막힘") return { items: PICK_BLOCKED, truncated: false, noneSelectableReason: "이을 수 있는 줄 없음" };
    if (q === "많음") return { items: PICK_MANY, truncated: false };
    if (q === "긴") return { items: PICK_LONG, truncated: false };
    if (options.empty && q === "") return { items: [], truncated: false, emptyDefault: "이 프로젝트에 견적 줄이 없습니다" };
    return { items: PICK_BASE, truncated: false, subtitle: "표본 프로젝트 · 카드로 이을 수 있는 줄 2" };
  };
}

function PickSampleDialog({
  open,
  onClose,
  onResult,
  noun = "줄",
  empty = false,
}: {
  open: boolean;
  onClose: () => void;
  onResult: (text: string) => void;
  noun?: "줄" | "프로젝트";
  empty?: boolean;
}) {
  return (
    <PickDialog
      open={open}
      onClose={onClose}
      title={noun === "줄" ? "견적 줄 고르기" : "프로젝트 고르기"}
      searchLabel={noun === "줄" ? "견적 줄 검색" : "프로젝트 검색"}
      search={pickSearchFor({ empty })}
      primaryLabel={noun === "줄" ? "이 줄로" : "이 프로젝트로"}
      noun={noun}
      failedLine={noun === "줄" ? "견적 줄 불러오지 못함" : "프로젝트 불러오지 못함"}
      emptyNextStep={{ label: "견적 외 비용으로", onSelect: () => onResult("견적 외 비용으로") }}
      onPick={(row) => onResult(row.title)}
    />
  );
}

export function PickSamples() {
  const [which, setWhich] = useState<"line" | "empty" | "project" | null>(null);
  const [result, setResult] = useState("");
  return (
    <>
      <div className={styles.samples}>
        <Button variant="secondary" onClick={() => setWhich("line")}>
          줄 고르기 열기
        </Button>
        <Button variant="secondary" onClick={() => setWhich("empty")}>
          빈 목록 고르기 열기
        </Button>
        <Button variant="secondary" onClick={() => setWhich("project")}>
          프로젝트 고르기 열기
        </Button>
        <Link href="/dev/components?panel=pick" scroll={false} className={buttonLinkClassName("secondary")}>
          패널 위 고르기 열기
        </Link>
      </div>
      <p data-gallery="pick-result">{result}</p>
      <PickSampleDialog
        open={which !== null}
        onClose={() => setWhich(null)}
        onResult={setResult}
        noun={which === "project" ? "프로젝트" : "줄"}
        empty={which === "empty"}
      />
    </>
  );
}

// 06.2-07(SP-62-1) — 다중 고르기 표본. 보통은 사람 60명 중 한 번에 50명까지 내려가고(넘으면 `truncated`), 검색은 이름 · 팀에 글자가 들어 있는 사람이다.
// 거부 · 연결 실패 표본은 목록이 50 안이라(`truncated` 거짓) `새로 고침` 뒤 목록에 없는 고름이 빠지는 것까지 보인다.
const PICK_PEOPLE_RAW: [name: string, team: string | null][] = [
  ["김서연", "기획1팀"],
  ["박지훈", "기획1팀"],
  ["이도윤", "운영팀"],
  ["최하은", "운영팀"],
  ["정민재", null],
  ...Array.from({ length: 55 }, (_, index): [string, string] => [`표본 사람 ${index + 6}`, "표본팀"]),
];
const PICK_PEOPLE: PickRow[] = PICK_PEOPLE_RAW.map(([name, team], index) => ({ type: "row", id: `u${index + 1}`, title: name, subtitle: team ?? "—", selectable: true }));
const PICK_PEOPLE_FEW = PICK_PEOPLE.slice(0, 5);

type PickManyKind = "normal" | "none" | "failed" | "reject" | "network";

const PICK_MANY_OPENERS: { kind: PickManyKind; label: string }[] = [
  { kind: "normal", label: "다중 고르기 열기" },
  { kind: "none", label: "후보 0 고르기 열기" },
  { kind: "failed", label: "실패 고르기 열기" },
  { kind: "reject", label: "거부 고르기 열기" },
  { kind: "network", label: "연결 고르기 열기" },
];

function pickPeopleSearch(kind: PickManyKind, excluded: ReadonlySet<string>): (query: string) => Promise<PickResult | null> {
  return (query) => {
    const q = query.trim();
    if (kind === "failed") return Promise.resolve(null);
    if (kind === "none") {
      return Promise.resolve(q === "" ? { items: [], truncated: false, emptyDefault: "더할 수 있는 사람 없음" } : { items: [], truncated: false });
    }
    const source = kind === "normal" ? PICK_PEOPLE : PICK_PEOPLE_FEW;
    const matched = source.filter((row) => !excluded.has(row.id) && (q === "" || row.title.includes(q) || (row.subtitle ?? "").includes(q)));
    return Promise.resolve({ items: matched.slice(0, 50), truncated: matched.length > 50, subtitle: "표본 프로젝트" });
  };
}

// 고른 사람 전체의 결과 줄 — 호출부가 낱말을 정한다(검색으로 가려진 고름도 센다).
function pickManyResultLine(rows: PickRow[]): string | null {
  const first = rows[0];
  if (!first) return null;
  return rows.length === 1 ? `${first.title} 선택` : `${first.title} 외 ${rows.length - 1}명 선택`;
}

export function PickManySamples() {
  const [kind, setKind] = useState<PickManyKind | null>(null);
  const [result, setResult] = useState("");
  // 거부 · 연결 실패 표본은 첫 시도만 거절한다 — 거부된 사람은 다시 받은 목록에서 빠진다.
  const attemptedRef = useRef(false);
  const excludedRef = useRef<Set<string>>(new Set());

  function openKind(next: PickManyKind) {
    attemptedRef.current = false;
    excludedRef.current = new Set();
    setKind(next);
  }

  function pickMany(rows: PickRow[]): Promise<PickManyOutcome> {
    const first = rows[0];
    if (first && !attemptedRef.current && (kind === "reject" || kind === "network")) {
      attemptedRef.current = true;
      if (kind === "reject") {
        excludedRef.current.add(first.id);
        return Promise.resolve({ ok: false, reason: `${first.title} 더할 수 없음 · 새로 고침`, retryable: false });
      }
      return Promise.resolve({ ok: false, reason: "더하지 못함 · 다시 시도", retryable: true });
    }
    setResult(`더함 · ${rows.map((row) => row.title).join(", ")}`);
    return Promise.resolve({ ok: true });
  }

  return (
    <>
      <div className={styles.samples}>
        {PICK_MANY_OPENERS.map((opener) => (
          <Button key={opener.kind} variant="secondary" onClick={() => openKind(opener.kind)}>
            {opener.label}
          </Button>
        ))}
      </div>
      <p data-gallery="pick-many-result">{result}</p>
      <PickDialog
        mode="multiple"
        open={kind !== null}
        onClose={() => setKind(null)}
        title="참여자 더하기"
        subtitle="표본 프로젝트"
        searchLabel="사람 검색"
        search={(query) => pickPeopleSearch(kind ?? "normal", excludedRef.current)(query)}
        primaryLabel="참여자 더하기"
        noun="사람"
        failedLine="사람 목록 불러오기 실패"
        emptyNextStep={null}
        resultLineMany={pickManyResultLine}
        onPickMany={pickMany}
      />
    </>
  );
}

// 06.1-03(SP-6106 · G-4) — 문서 고르기(단일 · `noun="문서"`) · 증빙 여럿 고르기(다중 · `noun="증빙"` · 상한 3) 표본. 값은 가짜 픽스처다.
// 문서: 1위 `preselect` · 값 바뀜 2행 · 막힌 행 · 거부 행 셋(새로 고침 꼬리 · 연결 실패 · 거부 문구 없이 열린 채). 증빙: 미리 고른 하나 · 상한 · 거부 행 하나 · `넘침` 검색은 한도 20.
const PICK_DOCUMENT_ROWS: PickRow[] = [
  { type: "row", id: "d1", title: "행사 운영비 · 김기획", subtitle: "합계 12,000 → 12,500", amount: { krw: 12_500 }, selectable: true },
  { type: "row", id: "d2", title: "무대 설치 · 박운영", subtitle: "표본 거래처 가", amount: { krw: 4_200_000 }, selectable: true },
  { type: "row", id: "d3", title: "음향 장비 · 이도윤", subtitle: "표본 거래처 나", amount: { krw: 1_700_000 }, selectable: false, reason: "결재 중 문서 · 결재 끝까지 떼기 없음" },
  { type: "row", id: "d4", title: "현수막 · 최하은", subtitle: "표본 거래처 다", amount: { krw: 540_000 }, selectable: true },
  { type: "row", id: "d5", title: "거부 표본 · 새로 고침", subtitle: "표본 거래처 라", amount: { krw: 320_000 }, selectable: true },
  { type: "row", id: "d6", title: "거부 표본 · 연결 실패", subtitle: "표본 거래처 마", amount: { krw: 210_000 }, selectable: true },
  { type: "row", id: "d7", title: "거부 표본 · 열린 채", subtitle: "표본 거래처 바", amount: { krw: 110_000 }, selectable: true },
];
const PICK_EVIDENCE_ROWS: PickRow[] = [
  { type: "row", id: "e1", title: "세금계산서 · 표본 거래처 가", subtitle: "10-02 · 홈택스", amount: { krw: 12_500 }, selectable: true },
  { type: "row", id: "e2", title: "카드 사용 · 표본 가맹점 나", subtitle: "10-03 · 신한카드", amount: { krw: 88_000 }, selectable: true },
  { type: "row", id: "e3", title: "세금계산서 · 표본 거래처 다", subtitle: "10-04 · 홈택스", amount: { krw: 330_000 }, selectable: true },
  { type: "row", id: "e4", title: "카드 사용 · 표본 가맹점 라", subtitle: "10-05 · 롯데카드", amount: { krw: 45_000 }, selectable: true },
  { type: "row", id: "e5", title: "거부 표본 · 새로 고침", subtitle: "10-06 · 홈택스", amount: { krw: 9_900 }, selectable: true },
];

export function EvidencePickSamples({ initial = null }: { initial?: "document" | "evidence" | null }) {
  const [which, setWhich] = useState<"document" | "evidence" | null>(initial);
  const [documentResult, setDocumentResult] = useState("");
  const [evidenceResult, setEvidenceResult] = useState("");
  const [searches, setSearches] = useState(0);

  function searchDocuments(query: string): Promise<PickResult | null> {
    setSearches((count) => count + 1);
    if (query.trim() === "zzz") return Promise.resolve({ items: [], truncated: false });
    return Promise.resolve({ items: PICK_DOCUMENT_ROWS, truncated: false, subtitle: "표본 프로젝트", preselect: query.trim() === "" ? ["d1"] : ["d2"] });
  }

  function pickDocument(row: PickRow): PickManyOutcome | boolean {
    if (row.id === "d5") return { ok: false, reason: "이미 다른 문서에 붙음 · 새로 고침", retryable: false };
    if (row.id === "d6") return { ok: false, reason: "붙이지 못함 · 다시 시도", retryable: true };
    if (row.id === "d7") return false;
    setDocumentResult(row.title);
    return true;
  }

  function searchEvidence(query: string): Promise<PickResult | null> {
    const q = query.trim();
    if (q === "zzz") return Promise.resolve({ items: [], truncated: false });
    return Promise.resolve({ items: PICK_EVIDENCE_ROWS, truncated: q === "넘침", limit: 20, subtitle: "표본 문서", preselect: q === "" ? ["e1"] : null });
  }

  function pickEvidence(rows: PickRow[]): Promise<PickManyOutcome> {
    if (rows.some((row) => row.id === "e5")) return Promise.resolve({ ok: false, reason: "이미 다른 문서에 붙음 · 새로 고침", retryable: false });
    setEvidenceResult(`붙임 · ${rows.map((row) => row.title).join(", ")}`);
    return Promise.resolve({ ok: true });
  }

  return (
    <>
      <div className={styles.samples}>
        <Button variant="secondary" onClick={() => setWhich("document")}>
          문서 고르기 열기
        </Button>
        <Button variant="secondary" onClick={() => setWhich("evidence")}>
          증빙 여럿 고르기 열기
        </Button>
      </div>
      <p data-gallery="pick-document-result" data-searches={searches}>
        {documentResult}
      </p>
      <p data-gallery="pick-evidence-result">{evidenceResult}</p>
      <PickDialog
        open={which === "document"}
        onClose={() => setWhich(null)}
        title="문서 고르기"
        subtitle="표본 프로젝트"
        searchLabel="문서 검색"
        search={searchDocuments}
        primaryLabel="이 문서에 붙이기"
        noun="문서"
        emptyNextStep={null}
        onPick={pickDocument}
      />
      <PickDialog
        mode="multiple"
        open={which === "evidence"}
        onClose={() => setWhich(null)}
        title="증빙 고르기"
        subtitle="표본 문서"
        searchLabel="증빙 검색"
        search={searchEvidence}
        primaryLabel="증빙 붙이기"
        noun="증빙"
        emptyNextStep={null}
        maxSelected={{ count: 3, reason: "3건 상한 · 나눠 붙이기" }}
        resultLineMany={(rows) => (rows.length > 0 ? `고른 ${rows.length}건` : null)}
        onPickMany={pickEvidence}
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
// `?panel=pick`(06-29 SP-8)은 패널 위에 고르기 목록이 겹쳐 서는 표본 — 목록의 Esc · Ctrl+Enter가 패널로 번지지 않는지 본다.
export function GalleryPanel({ pick = false }: { pick?: boolean }) {
  const [picking, setPicking] = useState(false);
  const [line, setLine] = useState("");
  const [submitted, setSubmitted] = useState(false);
  return (
    <SidePanel title="표본 등록" closeHref="/dev/components">
      <PanelForm
        id="gallery-panel-form"
        label="표본 등록"
        intent="create"
        status={submitted ? "표본 제출" : undefined}
        onSubmit={(event) => {
          event.preventDefault();
          if (pick) setSubmitted(true);
        }}
      >
        <TextField id="gallery-panel-name" name="name" label="표본 이름" />
        {pick ? (
          <>
            <TextField id="gallery-panel-line" name="line" label="견적 줄" readOnly value={line} onChange={() => undefined} />
            <Button variant="tertiary" onClick={() => setPicking(true)}>
              견적 줄 바꾸기
            </Button>
            <PickSampleDialog open={picking} onClose={() => setPicking(false)} onResult={setLine} />
          </>
        ) : null}
      </PanelForm>
    </SidePanel>
  );
}

// 06.1-03 Task 1 (Round 2 G5) — Codex가 찍을 가짜 픽스처 표본 셋. 새 컴포넌트 · 새 CSS 클래스 없이 기존 SidePanel + PanelForm + KvList ·
// ConfirmDialog 사유 슬롯 · RowSheet 조합뿐이다. `page.tsx`가 `?panel=evidence` · `?confirm=detach` · `?sheet=two-actions`로 연 채 렌더한다.

// S3 증빙 패널 — 확인 필요 줄 · 읽기 칸 · 공급가 입력 · 공개 · 붙은 문서(잠김 줄) · 이력 · 등록(06.1-07이 만들 화면의 「적용 전」 기준).
export function EvidencePanelSample() {
  return (
    <SidePanel title="세금계산서 · (주)에이원" closeHref="/dev/components">
      <PanelForm id="gallery-evidence-form" label="증빙 금액 저장" intent="edit" onSubmit={(event) => event.preventDefault()}>
        <KvList
          items={[
            { label: "확인 필요", value: <StatusTag status="확인 필요" variant="text" /> },
            { label: "날짜", value: "2026-10-02" },
            { label: "승인번호", value: "20261002-41000012-xxxx" },
            { label: "사업자번호", value: "123-45-67890" },
            { label: "합계", value: <Num value={1_100_000} /> },
          ]}
        />
        <TextField id="gallery-evidence-supply" name="supply" label="공급가" numberKind="krw" defaultValue="1,000,000" />
        <KvList
          items={[
            { label: "세액", value: <Num value={100_000} /> },
            { label: "공개", value: <StatusTag status="미공개" variant="text" /> },
            { label: "붙은 문서", value: "26001-0004 · 결재 중 문서에 붙음 · 금액 잠김" },
            { label: "이력", value: "10-02 14:02 이과장 등록 · 신한 1234" },
            { label: "등록", value: "이과장 · 10-02 14:02" },
          ]}
        />
      </PanelForm>
    </SidePanel>
  );
}

// S7 떼기 모달 — ConfirmDialog 사유 슬롯. 사유가 빈 동안 1차 aria-disabled + 행동 줄 왼쪽 `사유 없음 · 사유 적기`.
export function DetachConfirmSample({ initialOpen = false }: { initialOpen?: boolean }) {
  const [open, setOpen] = useState(initialOpen);
  const [reason, setReason] = useState("");
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        증빙 떼기 열기
      </Button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        title="증빙 떼기"
        subtitle="세금계산서 · (주)에이원 · 26001-0004"
        resultLines={["비용이 예상 1,000,000원으로"]}
        evidenceField={<TextField id="gallery-detach-reason" label="사유" value={reason} onChange={(event) => setReason(event.target.value)} />}
        primary={{
          label: "증빙 떼기",
          onConfirm: () => setOpen(false),
          disabledReason: reason.trim() === "" ? "사유 없음 · 사유 적기" : undefined,
        }}
      />
    </>
  );
}

// G1(SP-6107) 폰 행 시트 — `action` 자리에 3차 두 줄. 줄 행동이 둘인 구매 요청 `신청됨` 행의 모양(06.1-08이 첫 적용).
export function TwoActionsSheetSample({ initialOpen = false }: { initialOpen?: boolean }) {
  const [open, setOpen] = useState(initialOpen);
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        두 3차 시트 열기
      </Button>
      <RowSheet
        open={open}
        onClose={() => setOpen(false)}
        title="무대 설치 자재"
        subtitle="신청됨 · 표본 거래처"
        items={[
          { label: "예상 금액", value: <Num value={4_200_000} /> },
          { label: "신청", value: "박서연 · 10-02" },
        ]}
        action={
          <>
            <Button variant="tertiary" onClick={() => undefined}>
              요청 취소
            </Button>
            <Button variant="tertiary" onClick={() => undefined}>
              증빙 고르기 3
            </Button>
          </>
        }
      />
    </>
  );
}

export function EvidenceSamples({ confirmOpen = false, sheetOpen = false }: { confirmOpen?: boolean; sheetOpen?: boolean }) {
  return (
    <div className={styles.samples}>
      <Link href="/dev/components?panel=evidence" scroll={false} className={buttonLinkClassName("secondary")}>
        증빙 패널 열기
      </Link>
      <DetachConfirmSample initialOpen={confirmOpen} />
      <TwoActionsSheetSample initialOpen={sheetOpen} />
    </div>
  );
}

// 06.1-03 Task 2(SP-6103 · G-1) — 첨부 영역 「엑셀 일괄 등록」 변형 표본. 값은 전부 가짜 픽스처다(숫자 · 파일 이름). 컴포넌트는 서버 DTO를 그리기만 하므로
// 크기 거절 행은 호출 화면(06.1-05)이 `limits.ts`로 판정해 넘기는 모양 그대로 선다 — 거절 행에는 2차가 없고 실패 행에만 `다시 올리기`가 있다.
const BULK_ROWS: BulkImportRow[] = [
  {
    key: "card",
    state: "result",
    fileName: "신한카드_이용내역.xls",
    formatLabel: "신한 이용내역",
    counts: [
      { label: "등록", value: 162, kind: "success", href: "?state=all&batch=b1" },
      { label: "이미 등록", value: 6, kind: "muted" },
      { label: "상쇄", value: 2, unit: "쌍", kind: "muted" },
      { label: "카드 사용에 붙음", value: 12, kind: "success", href: "?state=attached&batch=b1" },
      { label: "확인 필요", value: 1, kind: "warning", href: "?state=needs-check&batch=b1" },
      { label: "짝 없음", value: 3, kind: "warning", href: "?state=unmatched&batch=b1" },
      { label: "카드 미등록", value: 1, kind: "danger", href: "?state=card-unknown&batch=b1" },
      { label: "상쇄 없음", value: 0, kind: "muted" },
    ],
    lines: [],
    restCount: 0,
  },
  {
    key: "hometax",
    state: "result",
    fileName: "매입세금계산서_10월.xls",
    formatLabel: "홈택스 매입 세금계산서",
    counts: [
      { label: "등록", value: 25, kind: "success", href: "?state=all&batch=b2" },
      { label: "거래처 생성", value: 2, kind: "muted" },
      { label: "되살림", value: 1, kind: "muted" },
      { label: "이름 다름", value: 1, kind: "warning" },
    ],
    lines: ["123-45-67890 · 파일 (주)에이원 · 등록 에이원", "234-56-78901 · 파일 (주)비전 · 등록 비전크리에이티브"],
    restCount: 3,
  },
  { key: "size", state: "refused", fileName: "롯데_10월.xls", headline: "1.4MB · 1MB 초과 · 기간을 나눠 다시 내려받기", lines: [], restCount: 0 },
  { key: "format", state: "refused", fileName: "메모.txt", headline: "엑셀·CSV 파일 아님 · 내려받은 파일 그대로", lines: [], restCount: 0 },
  {
    key: "lines",
    state: "refused",
    fileName: "비씨_10월.xls",
    headline: "거절 · 오류 12줄",
    lines: ["14줄 · 승인일 읽지 못함", "15줄 · 승인일 읽지 못함", "21줄 · 금액 읽지 못함"],
    restCount: 7,
    restUnit: "줄",
  },
  { key: "uploading", state: "uploading", fileName: "국민카드_10월.xls" },
  { key: "failed", state: "failed", fileName: "우리카드_10월.xls", onRetry: () => undefined },
  {
    key: "long",
    state: "result",
    fileName: "매입세금계산서_아주긴파일이름표본_주식회사플랜트에이트크리에이티브솔루션즈서울본사_2026년10월분_최종본_수정_확정_다시_진짜최종.xls",
    formatLabel: "홈택스 매입 세금계산서",
    counts: [{ label: "등록", value: 4, kind: "success", href: "?state=all&batch=b3" }],
    lines: [],
    restCount: 0,
  },
];

export function BulkImportSamples() {
  return <Attachments variant="bulk-import" rows={BULK_ROWS} onFiles={() => undefined} />;
}
