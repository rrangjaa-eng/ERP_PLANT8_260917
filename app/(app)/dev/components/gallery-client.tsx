"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { buttonLinkClassName } from "@/ui/button/Button";
import { Attachments, type AttachmentActions, type AttachmentFile } from "@/ui/attachments/Attachments";
import { ConfirmDialog } from "@/ui/confirm-dialog/ConfirmDialog";
import { Button } from "@/ui/button/Button";
import { TextField } from "@/ui/input/TextField";
import { PickDialog, type PickItem, type PickManyOutcome, type PickResult, type PickRow } from "@/ui/pick-dialog/PickDialog";
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
