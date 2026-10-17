"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { formatCount, formatKrw } from "@/lib/format-number";
import { Button } from "@/ui/button/Button";
import { ListEmpty, type ListEmptyAction } from "@/ui/list-empty/ListEmpty";
import { Num } from "@/ui/num/Num";
import { Pagination } from "@/ui/pagination/Pagination";
import { pageRangeText } from "@/ui/pagination/page-window";
import { RowAction, RowActions } from "@/ui/row-actions/RowActions";
import { Select, type SelectOption, type SelectOptionGroup } from "@/ui/select/Select";
import { StatusTag } from "@/ui/status-tag/StatusTag";
import { RowSheet } from "@/ui/table/RowSheet";
import { Table } from "@/ui/table/Table";
import tableStyles from "@/ui/table/Table.module.css";
import { Toast } from "@/ui/toast/Toast";
import { useDirtyStorage, viewerDirtyScope } from "@/ui/table/use-dirty-storage";
import { useEditableWidth } from "@/ui/table/use-editable-width";
import type { FooterNoticeItem } from "@/ui/table/footer-notice";
import type { CellEditability, CellIssue, TableColumn } from "@/ui/table/types";
import type {
  EvidenceListFilters,
  EvidenceProposal,
  EvidenceRecordList,
  EvidenceRecordView,
  EvidenceRecordVisibility,
  EvidenceRecordWord,
  EvidenceRowAction,
  EvidenceTeamOption,
} from "@/domain/evidence-records";
import { ConflictLine } from "@/app/(app)/approvals/conflict-line";
import { archiveEvidenceRecordAction, publishEvidenceRecordsAction, restoreEvidenceRecordAction } from "./actions";
import { IntakeZone } from "./intake-zone";
import { PickDocumentDialog, type PickDocumentTarget } from "./pick-document-dialog";
import expenseStyles from "../expenses.module.css";
import styles from "./evidence-table.module.css";

// 06.1-05(S2 · §7-3 일괄 저장 편집 표) — 증빙 목록. 상태 낱말 · 2행 · 공개 셀 단계 · 제안은 전부 서버 DTO 그대로 그리고(판정 없음),
// 화면은 사람이 바꾼 공개 칸을 행 id 키 편집 맵에 모아 1차 「공개 범위 저장」 한 번에 서버 제안과 함께 보낸다(전부-아니면-전무).
// 서버 제안은 dirty 면으로 그리되 편집 맵과 따로 둔다 — 떠나기 경고 · 브라우저 보관에는 사람이 바꾼 칸만 든다(DA-4).
// 06.1-05 Task 2 — 필터 셋(쿼리 링크 · 기본 `할 일`) · 서식 그룹 · 필터 결과 전체 합계 · 폭별 열 · 잠긴 셀 이유 · 페이지 줄 · 힌트 줄 · 빈 상태 넷 · 폰 읽기 시트.
// 06.1-05 Task 3 — 공개 칸 「다른 팀」 묶음 · 서버 거부 칸 · 업로드 중 1차 막힘 · 행 행동(보관 · 되살리기) + 표 위 결과 줄 `되돌리기`.

type Row = {
  id: string;
  version: number;
  format: string;
  issuedOn: string;
  counterparty: string | null;
  kindLine: string | null;
  supplyKrw: number | null;
  vatKrw: number | null;
  totalKrw: number | null;
  visibility: EvidenceRecordVisibility;
  visibleTeamId: string | null;
  visibilityLabel: string;
  visibilityCell: CellEditability;
  statusWord: EvidenceRecordWord;
  statusDetail: string | null;
  rowAction: EvidenceRowAction;
  /** 06.1-06 — 붙은 문서(상태 2행 링크) · `붙이기` 그림 · 비활성 이유. */
  attached: { kind: "expense" | "purchase_request"; id: string | null; number: string | null; pending: boolean } | null;
  canAttach: boolean;
  attachBlocked: string | null;
};

/** 사람이 바꾼 공개 칸 — 값은 셀 안에서만 쓰는 꼴(`private` · `division` · `team:{팀 id}`), version은 바꿀 때 본 값. */
type Edit = { value: string; version: number };

const VISIBILITY = "visibility";
const COPY = {
  caption: "증빙 목록",
  emptyNone: "등록한 증빙이 없습니다",
  emptyTodo: "할 일 증빙이 없습니다",
  emptyUnmatched: "짝 없는 카드 줄이 없습니다",
  emptyFiltered: "조건에 맞는 증빙이 없습니다",
  showAll: "전체 보기",
  clearFilters: "필터 지우기",
  clearBatch: "묶음 지우기",
  noChange: "바뀐 칸 없음",
  uploading: "올리는 중",
  discarded: "편집을 버렸습니다",
  invalidInput: "입력값 오류 · 값 확인",
  otherTeams: "다른 팀",
  archived: "증빙 보관됨",
  undo: "되돌리기",
  undoFailed: "되돌리기 실패 · 다시 시도",
  unknownResult: "결과를 받지 못함 · 새로 고침",
  draftOwner: "작성 중 문서",
  attach: "붙이기",
} as const;

const ROW_ACTION_LABEL = { archive: "보관", restore: "되살리기" } as const;

// 힌트 줄 — 이 화면에서 실제로 되는 키만(SYSTEM §7-3 「힌트 줄은 화면마다 실제로 되는 것만」 — 붙여넣기 `Ctrl+V`는 06.1-13이 공개 칸 붙여넣기를
// 이을 때 더한다). 저장은 1차의 kbd가 말한다.
const HINT_ITEMS = [
  { label: "이동", keys: "Tab ↑↓←→" },
  { label: "복사", keys: "Ctrl+C" },
  { label: "취소", keys: "Esc" },
  { label: "파일", keys: "Ctrl+U" },
];

/** 필터 셋의 선택지와 기본값 — domain 상수를 서버 페이지가 넘긴다(클라이언트는 domain 런타임 값을 import하지 않는다). */
export type EvidenceFilterOptions = {
  states: readonly { value: string; label: string }[];
  types: readonly { value: string; label: string }[];
  periods: readonly { value: string; label: string }[];
  defaults: EvidenceListFilters;
};

type FilterQuery = { state: string; type: string; period: string; batch: string | null };

// 기본값과 같은 쿼리는 주소에서 뺀다 — 같은 보기가 주소 하나다(새로 고침 · 뒤로에 남는다).
function hrefWith(filters: FilterQuery, defaults: EvidenceListFilters, page = 1): string {
  const query = new URLSearchParams();
  if (filters.state !== defaults.state) query.set("state", filters.state);
  if (filters.type !== defaults.type) query.set("type", filters.type);
  if (filters.period !== defaults.period) query.set("period", filters.period);
  if (filters.batch) query.set("batch", filters.batch);
  if (page > 1) query.set("page", String(page));
  const text = query.toString();
  return text ? `/expenses/evidence?${text}` : "/expenses/evidence";
}

// 상태 2행 요소 id — 잠긴 공개 칸이 `aria-describedby`로 가리킨다(이유는 화면에 이미 있는 그 글자, §7-3 (가)).
function statusDetailId(rowId: string): string {
  return `evidence-status-detail-${rowId}`;
}

// 거래처 · 가맹점 칸 id — 줄마다 같은 이름인 행 행동(`보관` · `되살리기`)이 그 줄을 가리킨다(견적 표 행 행동 열 선례).
function counterpartyId(rowId: string): string {
  return `evidence-counterparty-${rowId}`;
}

function amountText(value: number | null): string {
  return value === null ? "" : String(value);
}

/** 저장한 줄(O-6106) — 저장 응답이 다시 읽은 행으로 그 목록 위에 덮는다. 목록 prop이 바뀌면(쪽 · 필터 이동 · 새로 고침) 저절로 버려진다. */
type SavedOverlay = { list: EvidenceRecordList; rows: ReadonlyMap<string, EvidenceRecordView>; savedIds: ReadonlySet<string> };

// 거래처 · 가맹점 2행 — 카드 줄은 `카드 · {카드사} {끝 4자리}`, 그 밖은 `{종류} · {사업자번호}`(UI-SPEC S2 열).
function kindLineOf(view: EvidenceRecordView): string | null {
  if (view.cardLabel) return `카드 · ${view.cardLabel}`;
  const parts = [view.typeLabel, view.businessNo].filter((part): part is string => Boolean(part));
  return parts.length > 0 ? parts.join(" · ") : null;
}

// 노출표가 id · version · 상태를 가리면 그 줄은 고칠 수도 가리킬 수도 없다 — 그리지 않는다(금액만 가려진 줄은 금액 칸이 비어 그린다).
function rowFromView(view: EvidenceRecordView): Row[] {
  if (view.id === undefined || view.version === undefined || view.statusWord === undefined || view.visibility === undefined) return [];
  return [
    {
      id: view.id,
      version: view.version,
      format: view.format ?? "",
      issuedOn: view.issuedOn ?? "",
      counterparty: view.counterparty ?? null,
      kindLine: kindLineOf(view),
      supplyKrw: view.supplyKrw ?? null,
      vatKrw: view.vatKrw ?? null,
      totalKrw: view.totalKrw ?? null,
      visibility: view.visibility,
      visibleTeamId: view.visibleTeamId ?? null,
      visibilityLabel: view.visibilityLabel ?? "",
      visibilityCell: view.visibilityCell ?? "readonly",
      statusWord: view.statusWord,
      statusDetail: view.statusDetail ?? null,
      rowAction: view.rowAction ?? null,
      attached: view.attachedKind
        ? { kind: view.attachedKind, id: view.attachedId ?? null, number: view.attachedNumber ?? null, pending: view.attachedPending === true }
        : null,
      canAttach: view.canAttach === true,
      attachBlocked: view.attachBlocked ?? null,
    },
  ];
}

// 06.1-06 S2 2행 — 붙은 문서 번호 링크(지출결의 문서 · 구매 요청 목록). 번호 없는 임시 문서는 링크 없는 낱말(경영관리는 그 문서를 못 본다).
function AttachedLine({ attached }: { attached: NonNullable<Row["attached"]> }) {
  if (attached.pending || attached.id === null || attached.number === null) return <span>{COPY.draftOwner}</span>;
  const href = attached.kind === "expense" ? `/expenses/${attached.id}#evidence` : "/cards/purchases";
  // 링크 모양은 지출결의 목록 번호 링크(`expenseStyles.link` — `--text-link`)와 같다.
  return (
    <Link href={href} className={expenseStyles.link}>
      {attached.number}
    </Link>
  );
}

function proposalValue(proposal: EvidenceProposal): string {
  return proposal.visibility === "team" ? `team:${proposal.teamId ?? ""}` : "division";
}

function storedValue(row: Row): string {
  return row.visibility === "team" ? `team:${row.visibleTeamId ?? ""}` : row.visibility;
}

type PublishGroup = { visibility: EvidenceRecordVisibility; teamId?: string; items: [string, number][] };

// 공개 값 · 팀마다 한 묶음(Round 2 P2-B1 — 줄은 `[id, version]`만).
function groupsOf(sends: readonly { id: string; version: number; value: string }[]): PublishGroup[] {
  const groups = new Map<string, PublishGroup>();
  for (const send of sends) {
    const group: PublishGroup = groups.get(send.value) ?? (send.value.startsWith("team:") ? { visibility: "team", teamId: send.value.slice("team:".length), items: [] } : { visibility: send.value === "division" ? "division" : "private", items: [] });
    group.items.push([send.id, send.version]);
    groups.set(send.value, group);
  }
  return [...groups.values()];
}

function isEdit(value: unknown): value is Edit {
  return typeof value === "object" && value !== null && typeof (value as Edit).value === "string" && typeof (value as Edit).version === "number";
}

function rootValidationMessage(errors: unknown): string | null {
  if (typeof errors !== "object" || errors === null) return null;
  const root = (errors as { _errors?: unknown })._errors;
  return Array.isArray(root) && typeof root[0] === "string" ? root[0] : null;
}

/** 공개 칸 선택지 — 평 선택지(제안 팀 · 설정 본부 · 미공개 · 저장된 값) + 묶음 「다른 팀」. */
type VisibilityChoices = { options: SelectOption[]; groups: SelectOptionGroup[] };

// 공개 셀 편집기 — 리저브 대장 SelectEditCell과 같은 꼴(바꾸면 곧바로 커밋, 바꾸지 않고 떠나면 커밋하지 않음).
function VisibilityEditCell({ id, initialValue, choices, onCommit, onCancel }: { id: string; initialValue: string; choices: VisibilityChoices; onCommit: (value: string) => void; onCancel: () => void }) {
  return (
    <Select
      id={id}
      aria-label="공개"
      defaultValue={initialValue}
      autoFocus
      onChange={(event) => onCommit(event.target.value)}
      onBlur={(event) => (event.currentTarget.value === initialValue ? onCancel() : onCommit(event.currentTarget.value))}
      options={choices.options}
      groups={choices.groups}
      className={styles.cellSelect}
    />
  );
}

type ArchiveOutcome = Awaited<ReturnType<typeof archiveEvidenceRecordAction>>;

// 표 위 결과 줄(DA-7 · E41 · PA-ARC-FAIL) — 마지막 한 건만(04.2-09 꼴). 보관 뒤 `되돌리기`가 연결 · 서버 실패로 끝나면 글자만 실패로 바뀌고
// `되돌리기`는 남는다(SYSTEM.md:1008). 거부(충돌 · 그사이 붙음)는 서버 글자 + 3차 `새로 고침` — 그때 본 목록과 묶어 다시 받으면 지운다.
type ArchiveLine = { kind: "archived"; record: { id: string; version: number }; undoFailed: boolean } | { kind: "conflict"; message: string; list: EvidenceRecordList };

export type EvidenceTableProps = { viewerId: string; list: EvidenceRecordList; teams: readonly EvidenceTeamOption[]; filterOptions: EvidenceFilterOptions };

export function EvidenceTable({ viewerId, list, teams, filterOptions }: EvidenceTableProps) {
  const router = useRouter();
  const [overlay, setOverlay] = useState<SavedOverlay | null>(null);
  const saved = overlay?.list === list ? overlay : null;
  const rows = (saved ? list.rows.map((view) => (view.id !== undefined ? (saved.rows.get(view.id) ?? view) : view)) : list.rows).flatMap(rowFromView);
  // 저장한 줄은 더 제안하지 않는다 — 목록을 다시 받기 전까지 제안 목록(필터 결과 전체)에서 뺀다.
  const liveProposals = saved ? list.proposals.filter((proposal) => !saved.savedIds.has(proposal.id)) : list.proposals;
  const proposals = new Map(liveProposals.map((proposal) => [proposal.id, proposal]));
  const division = list.division;
  const filters = list.filters;
  const defaults = filterOptions.defaults;
  const [sheetRowId, setSheetRowId] = useState<string | null>(null);
  const sheetRow = rows.find((row) => row.id === sheetRowId);

  const [edits, setEdits] = useState<Record<string, Edit>>({});
  const [cellErrors, setCellErrors] = useState<Record<string, string>>({});
  const [rejectedRowIds, setRejectedRowIds] = useState<string[]>([]);
  const [rejectionSummary, setRejectionSummary] = useState<string | null>(null);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);
  const [discardedEdits, setDiscardedEdits] = useState<Record<string, unknown> | null>(null);
  const [issueSignal, setIssueSignal] = useState(0);
  // 첫 오류로 가기 신호 — 값이 바뀔 때마다 표가 첫 오류 칸으로 초점을 옮긴다. 증가분은 ref에 둔다(효과에서 부르는 저장 경로가 상태를 읽어 상태를 만들지 않게).
  const issueSignalRef = useRef(0);
  const [cellEditing, setCellEditing] = useState(false);
  // 사람이 칸을 바꾼 순간에만 보관본을 쓴다(04-22 D-68) — 서버 값 · 제안으로 다시 그리는 경로는 켜지 않는다.
  const persistPendingRef = useRef(false);
  const savingRef = useRef(false);
  // 보낸 순간의 목록 · 줄 id — 저장 응답이 그 목록 위에 저장한 줄을 덮는다(O-6106).
  const sentRef = useRef<{ list: EvidenceRecordList; ids: string[] } | null>(null);

  const editCount = Object.keys(edits).length;
  const dirtyStorage = useDirtyStorage(viewerDirtyScope(viewerId, "evidence-records"), "visibility", editCount);
  const { persist } = dirtyStorage;
  useEffect(() => {
    if (!persistPendingRef.current) return;
    persistPendingRef.current = false;
    persist(edits);
  }, [edits, persist]);

  // 보낼 줄 = 서버 제안 전부(필터 결과 전체 — 쪽과 무관) + 사람이 바꾼 칸 중 제안 아닌 줄. N은 그 수다(DA-4).
  const sends = [
    ...liveProposals.map((proposal) => ({ id: proposal.id, version: proposal.version, value: edits[proposal.id]?.value ?? proposalValue(proposal) })),
    ...Object.entries(edits).flatMap(([id, edit]) => (proposals.has(id) ? [] : [{ id, version: edit.version, value: edit.value }])),
  ];
  const pending = sends.length;

  const { execute, result, isExecuting } = useAction(publishEvidenceRecordsAction, {
    onSettled: () => {
      savingRef.current = false;
    },
    onSuccess: ({ data }) => {
      if (data?.rejected) {
        // 전부-아니면-전무 거부 — 아무것도 저장되지 않았다. 편집 · 제안은 dirty로 남고 오류 칸이 그 줄에 붙는다.
        const next: Record<string, string> = {};
        for (const cell of data.rejected.cells) if (cell.rowId) next[cell.rowId] = cell.reason;
        setCellErrors(next);
        setRejectedRowIds(Object.keys(next));
        // DA-18 — 합계 행 라벨 뒤(SYSTEM.md §7-3 「일괄 저장은 전부 저장 또는 전부 거부」).
        setRejectionSummary(`오류 ${formatCount(data.rejected.cells.length)}칸 · 전부 거부`);
        issueSignalRef.current += 1;
        setIssueSignal(issueSignalRef.current);
        return;
      }
      if (data?.saved) {
        // 저장한 줄은 다음 불러오기 전까지 자리에 남고 상태 글자만 바뀐다(UI-SPEC S2 「저장」 — `할 일` 보기에서 줄이 빠지며 표가 뛰지 않게).
        const sent = sentRef.current;
        if (sent) {
          setOverlay((current) => {
            const base = current?.list === sent.list ? current : null;
            const nextRows = new Map(base?.rows);
            for (const view of data.rows) if (view.id !== undefined) nextRows.set(view.id, view);
            return { list: sent.list, rows: nextRows, savedIds: new Set([...(base?.savedIds ?? []), ...sent.ids]) };
          });
        }
        persistPendingRef.current = true;
        setEdits({});
        setCellErrors({});
        setRejectedRowIds([]);
        setRejectionSummary(null);
        dirtyStorage.clearAfterSave();
        setSavedNotice(`공개 범위 저장 · ${data.saved.saved}줄 · ${data.saved.savedAt}`);
      }
    },
    onError: ({ error }) => {
      if (error.validationErrors) setRejectionSummary(rootValidationMessage(error.validationErrors) ?? COPY.invalidInput);
    },
  });

  const displayedIds = new Set(rows.map((row) => row.id));

  // DA-21 — 끌어 놓기 영역이 파일을 올리는 동안 1차를 막는다(올린 줄이 목록에 들어오는 중이라 제안이 바뀐다).
  const [uploading, setUploading] = useState(false);

  function handleSave() {
    if (savingRef.current || isExecuting || pending === 0 || uploading) return;
    // §7-3 (아) DR-5 — 보이는 줄에 고정 오류(`전부 거부`)가 남았으면 서버를 부르지 않고 첫 오류 칸으로 간다(견적 표 goToFirstIssue 꼴).
    if (Object.keys(cellErrors).some((id) => displayedIds.has(id))) {
      issueSignalRef.current += 1;
      setIssueSignal(issueSignalRef.current);
      return;
    }
    savingRef.current = true;
    setSavedNotice(null);
    setRejectionSummary(null);
    setDiscardedEdits(null);
    const ids = sends.map((send) => send.id);
    sentRef.current = { list, ids };
    execute({ groups: groupsOf(sends), refresh: ids.filter((id) => displayedIds.has(id)) });
  }

  // 키보드 Ctrl+S는 표가 열린 편집기를 먼저 커밋(blur)한 뒤 부른다 — 그 커밋이 반영된 다음 렌더에서 저장한다(04-30 선례 · 리저브 대장).
  const [saveRequests, setSaveRequests] = useState(0);
  const saveAfterCommit = useEffectEvent(() => handleSave());
  useEffect(() => {
    if (saveRequests > 0) saveAfterCommit();
  }, [saveRequests]);

  // DR-36 — 1024 미만은 보기 전용(끌어 놓기 영역 · 표 안 공개 편집 · 1차를 그리지 않는다). 편집기가 열린 채 폭이 줄면 커밋 뒤로 미룬다.
  const editableWidth = useEditableWidth() || cellEditing;

  // 공개 셀 선택지(DA-1 · DA-11): `{제안 팀} 공개`(맨 위 · 기본) · `{설정 본부} 공개` · `미공개` · 묶음 「다른 팀」(보관 아닌 팀 — 위에 선
  // 제안 팀 제외, 조직 순). 저장된 값이 어디에도 없으면(보관된 팀에 공개한 줄) 그 값을 맨 위에 그대로 둔다(리저브 대장 `stored` 꼴).
  function choicesFor(row: Row): VisibilityChoices {
    const options: SelectOption[] = [];
    const proposal = proposals.get(row.id);
    if (proposal?.visibility === "team") options.push({ value: proposalValue(proposal), label: proposal.label });
    if (division) options.push({ value: "division", label: `${division.name} 공개` });
    options.push({ value: "private", label: "미공개" });
    const others = teams.filter((team) => !options.some((option) => option.value === `team:${team.id}`)).map((team) => ({ value: `team:${team.id}`, label: `${team.name} 공개` }));
    const stored = storedValue(row);
    const listed = [...options, ...others].some((option) => option.value === stored);
    return { options: listed ? options : [{ value: stored, label: row.visibilityLabel }, ...options], groups: others.length > 0 ? [{ label: COPY.otherTeams, options: others }] : [] };
  }

  function baseValue(row: Row): string {
    const proposal = proposals.get(row.id);
    return proposal ? proposalValue(proposal) : storedValue(row);
  }

  function currentValue(row: Row): string {
    return edits[row.id]?.value ?? baseValue(row);
  }

  function labelOf(row: Row): string {
    const value = currentValue(row);
    const { options, groups } = choicesFor(row);
    return [...options, ...groups.flatMap((group) => group.options)].find((option) => option.value === value)?.label ?? row.visibilityLabel;
  }

  // `—`는 공개할 수 없는 줄(붙음 · 음수 · 경영관리만 종류 · 보관)에만 — 잠긴 줄은 지금 값을 그대로 보인다(이유는 상태 2행).
  // 1024 미만은 보기 전용이라 서버 제안 · 편집이 아니라 저장된 값을 보인다(저장할 1차가 없는 폭).
  function visibilityText(row: Row): string {
    if (row.visibilityCell === "readonly") return "—";
    return editableWidth ? labelOf(row) : row.visibilityLabel;
  }

  function commitVisibility(rowId: string, columnKey: string, value: string) {
    const row = rows.find((one) => one.id === rowId);
    // `—`(빈 값)은 공개 값이 아니다 — 고르지 않은 것으로 둔다.
    if (columnKey !== VISIBILITY || !row || value === "") return;
    persistPendingRef.current = true;
    setSavedNotice(null);
    setEdits((current) => {
      const next = { ...current };
      // 기준 값(제안이 있으면 제안, 없으면 저장된 값)으로 돌아오면 편집이 아니다.
      if (value === baseValue(row)) delete next[rowId];
      else next[rowId] = { value, version: proposals.get(rowId)?.version ?? row.version };
      return next;
    });
    setCellErrors((current) => {
      if (!(rowId in current)) return current;
      const next = { ...current };
      delete next[rowId];
      return next;
    });
  }

  function applyRestored(stored: Record<string, unknown>) {
    const restored: Record<string, Edit> = {};
    for (const [id, edit] of Object.entries(stored)) if (isEdit(edit)) restored[id] = edit;
    persistPendingRef.current = true;
    setEdits((current) => ({ ...current, ...restored }));
  }

  function restoreEdits() {
    const stored = dirtyStorage.restore();
    if (stored) applyRestored(stored);
  }

  // 「버림」은 확인 없이 지우고 토스트 「되돌리기」로 되살린다(사용자 결정 2026-09-26 C-1 — 견적 원장 · 리저브 대장과 같은 규칙).
  function discardEdits() {
    const stored = dirtyStorage.restore();
    dirtyStorage.discard();
    setDiscardedEdits(stored);
  }

  // 행 행동(DA-7 · E41) — 확인 창 없이 바로 보관 · 되살리고 표 위 결과 줄이 되돌리기를 준다. 대기 중인 줄은 하나(다른 줄 행동은 busy).
  const [archiveLine, setArchiveLine] = useState<ArchiveLine | null>(null);
  // 새로 보관할 때만 `되돌리기`를 다시 그려 포커스를 준다(공휴일 delete-undo 꼴).
  const [archiveShown, setArchiveShown] = useState(0);
  const [rowActionPending, setRowActionPending] = useState<string | null>(null);
  // 06.1-06 S4 — 붙일 문서 고르기(행 `붙이기`). 닫히면 PickDialog가 그 행의 `붙이기`로 포커스를 돌린다.
  const [attachTarget, setAttachTarget] = useState<PickDocumentTarget | null>(null);
  function openAttach(row: Row) {
    if (row.attachBlocked !== null || rowActionPending !== null) return;
    setAttachTarget({ recordId: row.id, subtitle: row.counterparty ?? "" });
  }
  // 붙인 뒤 새 목록이 오면 포커스 자리 — 그 행이 남으면 그 행, 「할 일」처럼 빠지면 다음 행(없으면 이전 행, 없으면 화면 제목).
  // 붙인 순간의 행 순서를 기억해 두고, 목록(list)이 바뀐 커밋 뒤에 한 번만 옮긴다(PickDialog가 돌려준 `붙이기`는 그 행과 함께 사라진다).
  const attachedFocusRef = useRef<{ id: string; order: string[] } | null>(null);
  function onAttached(recordId: string) {
    attachedFocusRef.current = { id: recordId, order: rows.map((row) => row.id) };
    router.refresh();
  }
  useEffect(() => {
    const pending = attachedFocusRef.current;
    if (!pending) return;
    attachedFocusRef.current = null;
    const present = new Set(list.rows.flatMap((view) => (view.id === undefined ? [] : [view.id])));
    const at = pending.order.indexOf(pending.id);
    const candidates = [pending.id, ...pending.order.slice(at + 1), ...pending.order.slice(0, Math.max(at, 0)).reverse()];
    const targetId = candidates.find((id) => present.has(id));
    const cell = targetId ? document.getElementById(counterpartyId(targetId))?.closest<HTMLElement>("td") : null;
    (cell ?? document.querySelector<HTMLElement>('[data-ui="screen-title"]'))?.focus();
  }, [list]);
  const shownArchiveLine = archiveLine?.kind === "conflict" && archiveLine.list !== list ? null : archiveLine;

  // 보관한 줄은 목록에서 빠진다 — 그 줄의 편집 · 오류 칸만 버린다(다른 줄 편집은 행 id 키라 다시 받아도 남는다).
  function dropRowEdits(rowId: string) {
    if (rowId in edits) {
      persistPendingRef.current = true;
      setEdits((current) => {
        const next = { ...current };
        delete next[rowId];
        return next;
      });
    }
    setCellErrors((current) => {
      if (!(rowId in current)) return current;
      const next = { ...current };
      delete next[rowId];
      return next;
    });
  }

  async function callArchive(action: typeof archiveEvidenceRecordAction, record: { id: string; version: number }): Promise<ArchiveOutcome | null> {
    setRowActionPending(record.id);
    try {
      return (await action(record)) ?? null;
    } catch {
      return null;
    } finally {
      setRowActionPending(null);
    }
  }

  async function runRowAction(row: Row) {
    const kind = row.rowAction;
    if (kind === null || rowActionPending !== null) return;
    const outcome = await callArchive(kind === "archive" ? archiveEvidenceRecordAction : restoreEvidenceRecordAction, { id: row.id, version: row.version });
    const data = outcome?.data;
    if (data?.record) {
      dropRowEdits(row.id);
      if (kind === "archive") {
        setArchiveLine({ kind: "archived", record: data.record, undoFailed: false });
        setArchiveShown((count) => count + 1);
      } else setArchiveLine(null);
      router.refresh();
      return;
    }
    setArchiveLine({ kind: "conflict", message: data?.conflict ?? outcome?.serverError ?? COPY.unknownResult, list });
  }

  async function undoArchive() {
    if (archiveLine?.kind !== "archived" || rowActionPending !== null) return;
    const record = archiveLine.record;
    const outcome = await callArchive(restoreEvidenceRecordAction, record);
    const data = outcome?.data;
    if (data?.record) {
      setArchiveLine(null);
      router.refresh();
      return;
    }
    if (data?.conflict) {
      setArchiveLine({ kind: "conflict", message: data.conflict, list });
      return;
    }
    setArchiveLine({ kind: "archived", record, undoFailed: true });
  }

  // 열 우선순위(UI-SPEC S2): P1 거래처·가맹점 · 합계 · 상태 / P2 날짜 · 공개 / P3 공급가 · 세액 — 1280 미만에서 P3를 숨기고(DOM에는 남음)
  // 그 합은 합계 행 라벨 뒤에 남는다. `copyText`는 격자 Ctrl+C가 싣는 글자(힌트 줄 「복사」가 실제로 값을 싣는다).
  const columns: TableColumn<Row>[] = [
    { key: "issuedOn", header: "날짜", priority: "p2", cell: (row) => <Num value={row.issuedOn.slice(5)} />, copyText: (row) => row.issuedOn },
    {
      key: "counterparty",
      header: "거래처·가맹점",
      priority: "p1",
      // DX-1 — 한 줄 말줄임 + title 전문(격자 칸 minmax(0, max-content)라 폰 320에서도 문서를 넘기지 않는다). id는 행 행동이 가리킨다.
      cell: (row) =>
        row.counterparty ? (
          <span id={counterpartyId(row.id)} className={styles.counterpartyCell}>
            <span className={styles.counterpartyText} title={row.counterparty}>
              {row.counterparty}
            </span>
          </span>
        ) : (
          <span id={counterpartyId(row.id)}>—</span>
        ),
      secondaryLine: (row) => row.kindLine,
      copyText: (row) => row.counterparty ?? "",
    },
    { key: "supplyKrw", header: "공급가", priority: "p3", collapseBelow: 1280, align: "right", cell: (row) => <Num value={row.supplyKrw} />, copyText: (row) => amountText(row.supplyKrw) },
    { key: "vatKrw", header: "세액", priority: "p3", collapseBelow: 1280, align: "right", cell: (row) => <Num value={row.vatKrw} />, copyText: (row) => amountText(row.vatKrw) },
    { key: "totalKrw", header: "합계", priority: "p1", align: "right", cell: (row) => <Num value={row.totalKrw} />, copyText: (row) => amountText(row.totalKrw) },
    {
      key: VISIBILITY,
      header: "공개",
      priority: "p2",
      // 잠긴 칸(확인 필요 · 카드 미등록)은 `aria-disabled` + 이유 = 상태 2행(오류 표시 없음 — §7-3 (가)). 이 플랜의 `ui/` 변경은
      // Select 하나라 표 칸(td)이 아니라 칸 안 글자에 단다. 이유 글자가 없는 줄에는 달지 않는다(이유 없는 비활성 없음).
      cell: (row) =>
        editableWidth && row.visibilityCell === "locked" && row.statusDetail ? (
          <span aria-disabled="true" aria-describedby={statusDetailId(row.id)}>
            {visibilityText(row)}
          </span>
        ) : (
          visibilityText(row)
        ),
      summary: visibilityText,
      copyText: visibilityText,
      editability: (row) => (editableWidth ? row.visibilityCell : "readonly"),
      editCell: (row, ctx) => (
        <VisibilityEditCell id={`evidence-visibility-${row.id}`} initialValue={currentValue(row)} choices={choicesFor(row)} onCommit={ctx.onCommit} onCancel={ctx.onCancel} />
      ),
    },
    {
      key: "status",
      header: "상태",
      priority: "p1",
      cell: (row) => <StatusTag status={row.statusWord} variant="text" />,
      secondaryLine: (row) =>
        row.attached ? <AttachedLine attached={row.attached} /> : row.statusDetail ? <span id={statusDetailId(row.id)}>{row.statusDetail}</span> : null,
      copyText: (row) => row.statusWord,
    },
    // §7-3 (차) 행 행동 열 — 머리글 숨김 · P1 밖 · 셀의 3차는 격자 로빙 밖(tabIndex -1)이고 그 줄 거래처 칸을 가리킨다. 키보드 경로는 Ctrl+E다.
    // 안 붙은 줄은 끝에 떨어뜨린 `보관`, `보관됨` 보기는 `되살리기`만(서버 판정 rowAction). 1024 미만은 보기 전용이라 열이 없다.
    ...(editableWidth
      ? [
          {
            key: "actions",
            header: "행동",
            headerHidden: true,
            priority: "p3" as const,
            cell: (row: Row) =>
              row.rowAction || row.canAttach ? (
                <RowActions noWrap>
                  {row.canAttach && row.attachBlocked !== null ? (
                    <RowAction tabIndex={-1} describedBy={counterpartyId(row.id)} disabled disabledReason={row.attachBlocked} onClick={() => undefined}>
                      {COPY.attach}
                    </RowAction>
                  ) : row.canAttach ? (
                    <RowAction tabIndex={-1} describedBy={counterpartyId(row.id)} busy={rowActionPending !== null} onClick={() => openAttach(row)}>
                      {COPY.attach}
                    </RowAction>
                  ) : null}
                  {row.rowAction ? (
                  <RowAction
                    tabIndex={-1}
                    danger={row.rowAction === "archive"}
                    describedBy={counterpartyId(row.id)}
                    pending={rowActionPending === row.id}
                    busy={rowActionPending !== null && rowActionPending !== row.id}
                    onClick={() => void runRowAction(row)}
                  >
                    {ROW_ACTION_LABEL[row.rowAction]}
                  </RowAction>
                  ) : null}
                </RowActions>
              ) : null,
          },
        ]
      : []),
  ];

  const cellIssue = (row: Row, columnKey: string): CellIssue | undefined => {
    const message = columnKey === VISIBILITY ? cellErrors[row.id] : undefined;
    return message ? { kind: "error", message } : undefined;
  };

  const claimedErrorCells = rejectedRowIds.filter((id) => displayedIds.has(id)).length;
  const footerNotices: FooterNoticeItem[] = [];
  if (rejectionSummary) footerNotices.push({ tone: "danger", text: rejectionSummary, replacesIssueCount: { errorCells: claimedErrorCells, conflictRows: 0 } });
  if (result.serverError) footerNotices.push({ tone: "danger", text: result.serverError });

  // 1차는 편집 폭에서만, 목록이 완전히 비었으면 없다(DR5 — 끌어 놓기 영역의 `파일 고르기`가 첫 행동 · 할 일 0이면 `전체 보기`).
  // 1024 미만은 보기 전용이지만 복원으로 사람이 바꾼 칸이 생기면 저장할 1차가 있어야 한다(§7-3 (아) DR-24 — 막다른 상태 금지).
  const showPrimary = editableWidth ? rows.length > 0 || pending > 0 : editCount > 0;
  const noChange = pending === 0 && !cellEditing;
  const primaryBlocked = uploading ? COPY.uploading : noChange ? COPY.noChange : undefined;

  // 힌트 줄 — 행 행동이 선 줄이 있을 때만 그 낱말과 Ctrl+E(실제로 되는 키만).
  const shownRowAction = rows.find((row) => row.rowAction !== null)?.rowAction ?? null;
  const hintItems = shownRowAction ? [...HINT_ITEMS, { label: ROW_ACTION_LABEL[shownRowAction], keys: "Ctrl+E" }] : HINT_ITEMS;

  // 쿼리 링크 갈래 — 클라이언트 이동이라 표가 다시 마운트되지 않고 편집 맵이 남는다(리저브 대장 · 카드 사용 필터 선례). 쪽은 1로 돌아간다.
  function go(key: "state" | "type" | "period", value: string) {
    router.push(hrefWith({ ...filters, [key]: value }, defaults), { scroll: false });
  }

  const filterSelects = [
    { key: "state" as const, label: "상태", value: filters.state, options: filterOptions.states },
    { key: "type" as const, label: "종류", value: filters.type, options: filterOptions.types },
    { key: "period" as const, label: "기간", value: filters.period, options: filterOptions.periods },
  ];

  // 빈 상태 넷(UI-SPEC Copywriting) — 범위 안에 줄이 하나도 없으면 첫 행동은 끌어 놓기 영역이라 버튼이 없다(DR5).
  const narrowed = filters.type !== defaults.type || filters.period !== defaults.period || filters.batch !== null;
  const emptyState: { message: string; action?: ListEmptyAction } = !list.hasAny
    ? { message: COPY.emptyNone }
    : !narrowed && filters.state === "todo"
      ? { message: COPY.emptyTodo, action: { label: COPY.showAll, href: hrefWith({ ...filters, state: "all" }, defaults) } }
      : !narrowed && filters.state === "unmatched"
        ? { message: COPY.emptyUnmatched, action: { label: COPY.showAll, href: hrefWith({ ...filters, state: "all" }, defaults) } }
        : { message: COPY.emptyFiltered, action: { label: COPY.clearFilters, href: hrefWith(defaults, defaults) } };

  // 합계 행 — 필터 결과 전체(쪽과 무관). 숨는 열(공급가 · 세액)의 합까지 라벨 뒤 한 줄에 둔다(SYSTEM §6-1 「숨긴 금액 열은 합계 줄에 남는다」).
  const amounts = list.total.amounts;
  // 폰(<700)은 부제(줄 수 · 공급가 · 세액)를 숨기고 합계(P1 금액)만 한 줄로 둔다(§7-3 폰 「합계 행의 부제는 폰에서 숨긴다」) — PC 글자는 그대로.
  const footerLabel = amounts ? (
    <>
      합계 <span className={styles.footerDetail}>{`${formatCount(list.total.count)}줄 · 공급가 ${formatKrw(amounts.supplyKrw)} · 세액 ${formatKrw(amounts.vatKrw)} · 합계 `}</span>
      {formatKrw(amounts.totalKrw)}
    </>
  ) : (
    `합계 ${formatCount(list.total.count)}줄`
  );
  const groupLabels = new Map(list.groups.map((group) => [group.format, `${group.label} · ${formatCount(group.count)}`]));

  return (
    <>
      {editableWidth ? <IntakeZone onUploadingChange={setUploading} /> : null}

      {list.hasAny ? (
        <div className={styles.filterRow}>
          <div className={styles.filters}>
            {filterSelects.map((select) => (
              <div key={select.key} className={expenseStyles.selectLabel}>
                <label htmlFor={`evidence-filter-${select.key}`}>{select.label}</label>
                {/* 뒤로 가기 · 빈 상태의 `전체 보기`로 URL이 바뀌면 key로 새로 마운트한다(defaultValue는 마운트 뒤 반영되지 않는다). */}
                <select
                  key={select.value}
                  id={`evidence-filter-${select.key}`}
                  className={expenseStyles.select}
                  defaultValue={select.value}
                  onChange={(event) => go(select.key, event.target.value)}
                >
                  {select.options.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            ))}
            {/* DA-19 — 결과 행 링크로 묶음이 걸리면 줄 수가 줄어든 이유(파일 이름)와 그 조건만 지우는 3차. */}
            {list.batch ? (
              <>
                <span className={expenseStyles.batchResult}>{list.batch.fileName}</span>
                <RowActions>
                  <RowAction href={hrefWith({ ...filters, batch: null }, defaults)}>{COPY.clearBatch}</RowAction>
                </RowActions>
              </>
            ) : null}
          </div>
          {showPrimary ? (
            <Button
            type="button"
            variant="primary"
            className={styles.primaryAction}
            pending={isExecuting}
            disabled={primaryBlocked !== undefined}
            disabledReason={primaryBlocked}
            reasonTone="info"
            shortcut="Ctrl+S"
            onClick={handleSave}
          >
            {`공개 범위 저장${pending > 0 ? ` ${pending}` : ""}`}
            </Button>
          ) : null}
        </div>
      ) : null}

      {dirtyStorage.restorableCount > 0 ? (
        <p className={styles.restoreBanner}>
          <span>{`저장 안 한 편집 ${dirtyStorage.restorableCount}칸`}</span>
          <span className={styles.restoreActions}>
            <button type="button" className={styles.restoreAction} onClick={() => (isExecuting ? undefined : restoreEdits())}>
              복원
            </button>
            <button type="button" className={styles.restoreAction} onClick={() => (isExecuting ? undefined : discardEdits())}>
              버림
            </button>
          </span>
        </p>
      ) : null}

      {shownArchiveLine?.kind === "archived" ? (
        <p role="status" className={styles.undoLine}>
          <span className={shownArchiveLine.undoFailed ? styles.undoFailed : undefined}>{shownArchiveLine.undoFailed ? COPY.undoFailed : COPY.archived}</span>
          <RowActions>
            <RowAction key={archiveShown} autoFocus pending={rowActionPending === shownArchiveLine.record.id} busy={rowActionPending !== null && rowActionPending !== shownArchiveLine.record.id} onClick={() => void undoArchive()}>
              {COPY.undo}
            </RowAction>
          </RowActions>
        </p>
      ) : shownArchiveLine?.kind === "conflict" ? (
        <p className={styles.undoLine}>
          <ConflictLine message={shownArchiveLine.message} />
        </p>
      ) : null}

      {rows.length === 0 ? (
        <ListEmpty message={emptyState.message} action={emptyState.action} />
      ) : (
        <Table
          caption={COPY.caption}
          columns={columns}
          rows={rows}
          getRowId={(row) => row.id}
          // 서식별 그룹 줄 `{서식 이름} · {건수}` — 건수는 필터 결과 기준(쪽이 아님). 줄은 리포지토리가 서식 → 날짜 내림차순으로 준다.
          groupBy={(row) => row.format}
          groupHeader={(row) => groupLabels.get(row.format) ?? row.format}
          enableGridKeyboard
          rowLabel={(row) => `${row.issuedOn} ${row.counterparty ?? ""}`}
          onRowTap={(row) => setSheetRowId(row.id)}
          saveLocked={isExecuting}
          onEditingChange={setCellEditing}
          onCellCommit={commitVisibility}
          cellIssue={cellIssue}
          cellDirty={(row, columnKey) => editableWidth && columnKey === VISIBILITY && (proposals.has(row.id) || row.id in edits)}
          firstIssueSignal={issueSignal}
          keyboard={{ onSave: () => setSaveRequests((count) => count + 1), onOpenRow: editableWidth ? (row) => void runRowAction(row) : undefined }}
          footerNotices={footerNotices}
          footerSuccess={savedNotice}
          footer={(notice) => (
            <tr>
              <td colSpan={columns.length} className={styles.footerCell}>
                {footerLabel}
                {notice}
              </td>
            </tr>
          )}
        />
      )}

      {/* DA-22 — 50건 번호 페이지(링크 갈래 — 범위 글자 · `이전` · 숫자 · `다음`). 클라이언트 이동이라 편집 맵이 남는다. */}
      <Pagination
        label="증빙"
        page={list.page.page}
        pageCount={list.page.pageCount}
        href={(page) => hrefWith(filters, defaults, page)}
        rangeText={pageRangeText({ page: list.page.page, pageSize: list.page.pageSize, total: list.page.total, unit: "건" })}
      />

      {/* DA-14 — 힌트 줄은 페이지 줄 바로 아래 한 곳, 편집 폭에서만(1024 미만은 CSS도 숨긴다). */}
      {editableWidth && rows.length > 0 ? (
        <div className={tableStyles.hintRow}>
          {hintItems.map((item, index) => (
            <span key={item.label}>
              {index > 0 ? " · " : ""}
              {item.label} <kbd>{item.keys}</kbd>
            </span>
          ))}
        </div>
      ) : null}

      {/* 1024 미만 행 탭 → 읽기 시트(KvList 줄만 · 행동 없음). 폰에서 숨는 열(날짜 · 공급가 · 세액 · 공개)을 여기서 본다. */}
      <RowSheet
        open={sheetRow !== undefined}
        onClose={() => setSheetRowId(null)}
        title={sheetRow?.counterparty ?? "—"}
        subtitle={sheetRow ? [sheetRow.issuedOn, sheetRow.kindLine].filter((part): part is string => Boolean(part)).join(" · ") : ""}
        items={
          sheetRow
            ? [
                { label: "날짜", value: <Num value={sheetRow.issuedOn} /> },
                { label: "공급가", value: <Num value={sheetRow.supplyKrw} /> },
                { label: "세액", value: <Num value={sheetRow.vatKrw} /> },
                { label: "합계", value: <Num value={sheetRow.totalKrw} /> },
                { label: "공개", value: visibilityText(sheetRow) },
                { label: "상태", value: sheetRow.statusDetail ? `${sheetRow.statusWord} · ${sheetRow.statusDetail}` : sheetRow.statusWord },
              ]
            : []
        }
      />

      {discardedEdits ? (
        <Toast
          message={COPY.discarded}
          actionLabel="되돌리기"
          onAction={() => {
            applyRestored(discardedEdits);
            setDiscardedEdits(null);
          }}
          onDismiss={() => setDiscardedEdits(null)}
        />
      ) : null}
      <PickDocumentDialog target={attachTarget} onClose={() => setAttachTarget(null)} onAttached={onAttached} />
    </>
  );
}
