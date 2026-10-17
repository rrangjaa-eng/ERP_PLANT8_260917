"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import { useAction } from "next-safe-action/hooks";
import { Button } from "@/ui/button/Button";
import { Num } from "@/ui/num/Num";
import { Select, type SelectOption } from "@/ui/select/Select";
import { StatusTag } from "@/ui/status-tag/StatusTag";
import { Table } from "@/ui/table/Table";
import { Toast } from "@/ui/toast/Toast";
import { useDirtyStorage, viewerDirtyScope } from "@/ui/table/use-dirty-storage";
import { useEditableWidth } from "@/ui/table/use-editable-width";
import type { FooterNoticeItem } from "@/ui/table/footer-notice";
import type { CellEditability, CellIssue, TableColumn } from "@/ui/table/types";
import type { EvidenceProposal, EvidenceRecordList, EvidenceRecordView, EvidenceRecordVisibility, EvidenceRecordWord } from "@/domain/evidence-records";
import { publishEvidenceRecordsAction } from "./actions";
import { IntakeZone } from "./intake-zone";
import styles from "./evidence-table.module.css";

// 06.1-05(S2 · §7-3 일괄 저장 편집 표) — 증빙 목록. 상태 낱말 · 2행 · 공개 셀 단계 · 제안은 전부 서버 DTO 그대로 그리고(판정 없음),
// 화면은 사람이 바꾼 공개 칸을 행 id 키 편집 맵에 모아 1차 「공개 범위 저장」 한 번에 서버 제안과 함께 보낸다(전부-아니면-전무).
// 서버 제안은 dirty 면으로 그리되 편집 맵과 따로 둔다 — 떠나기 경고 · 브라우저 보관에는 사람이 바꾼 칸만 든다(DA-4).

type Row = {
  id: string;
  version: number;
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
};

/** 사람이 바꾼 공개 칸 — 값은 셀 안에서만 쓰는 꼴(`private` · `division` · `team:{팀 id}`), version은 바꿀 때 본 값. */
type Edit = { value: string; version: number };

const VISIBILITY = "visibility";
const COPY = {
  caption: "증빙 목록",
  empty: "등록한 증빙이 없습니다",
  noChange: "바뀐 칸 없음",
  discarded: "편집을 버렸습니다",
  invalidInput: "입력값 오류 · 값 확인",
} as const;

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
    },
  ];
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

// 공개 셀 편집기 — 리저브 대장 SelectEditCell과 같은 꼴(바꾸면 곧바로 커밋, 바꾸지 않고 떠나면 커밋하지 않음).
function VisibilityEditCell({ id, initialValue, options, onCommit, onCancel }: { id: string; initialValue: string; options: SelectOption[]; onCommit: (value: string) => void; onCancel: () => void }) {
  return (
    <Select
      id={id}
      aria-label="공개"
      defaultValue={initialValue}
      autoFocus
      onChange={(event) => onCommit(event.target.value)}
      onBlur={(event) => (event.currentTarget.value === initialValue ? onCancel() : onCommit(event.currentTarget.value))}
      options={options}
      className={styles.cellSelect}
    />
  );
}

export type EvidenceTableProps = { viewerId: string; list: EvidenceRecordList };

export function EvidenceTable({ viewerId, list }: EvidenceTableProps) {
  const rows = list.rows.flatMap(rowFromView);
  const proposals = new Map(list.proposals.map((proposal) => [proposal.id, proposal]));
  const division = list.division;

  const [edits, setEdits] = useState<Record<string, Edit>>({});
  const [cellErrors, setCellErrors] = useState<Record<string, string>>({});
  const [rejectedRowIds, setRejectedRowIds] = useState<string[]>([]);
  const [rejectionSummary, setRejectionSummary] = useState<string | null>(null);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);
  const [discardedEdits, setDiscardedEdits] = useState<Record<string, unknown> | null>(null);
  const [issueSignal, setIssueSignal] = useState(0);
  const [cellEditing, setCellEditing] = useState(false);
  // 사람이 칸을 바꾼 순간에만 보관본을 쓴다(04-22 D-68) — 서버 값 · 제안으로 다시 그리는 경로는 켜지 않는다.
  const persistPendingRef = useRef(false);
  const savingRef = useRef(false);

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
    ...list.proposals.map((proposal) => ({ id: proposal.id, version: proposal.version, value: edits[proposal.id]?.value ?? proposalValue(proposal) })),
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
        setRejectionSummary(data.rejected.summary);
        setIssueSignal((signal) => signal + 1);
        return;
      }
      if (data?.saved) {
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

  function handleSave() {
    if (savingRef.current || isExecuting || pending === 0) return;
    savingRef.current = true;
    setSavedNotice(null);
    setRejectionSummary(null);
    setDiscardedEdits(null);
    execute({ groups: groupsOf(sends) });
  }

  // 키보드 Ctrl+S는 표가 열린 편집기를 먼저 커밋(blur)한 뒤 부른다 — 그 커밋이 반영된 다음 렌더에서 저장한다(04-30 선례 · 리저브 대장).
  const [saveRequests, setSaveRequests] = useState(0);
  const saveAfterCommit = useEffectEvent(() => handleSave());
  useEffect(() => {
    if (saveRequests > 0) saveAfterCommit();
  }, [saveRequests]);

  // DR-36 — 1024 미만은 보기 전용(끌어 놓기 영역 · 표 안 공개 편집 · 1차를 그리지 않는다). 편집기가 열린 채 폭이 줄면 커밋 뒤로 미룬다.
  const editableWidth = useEditableWidth() || cellEditing;

  // 공개 셀 선택지(DA-1 · DA-11 — 이 태스크 몫): `{제안 팀} 공개`(맨 위 · 기본) · `{설정 본부} 공개` · `미공개`.
  // 저장된 값이 선택지에 없으면(저장된 팀 공개 줄) 그 값을 맨 위에 그대로 둔다(리저브 대장 `stored` 꼴).
  function optionsFor(row: Row): SelectOption[] {
    const options: SelectOption[] = [];
    const proposal = proposals.get(row.id);
    if (proposal?.visibility === "team") options.push({ value: proposalValue(proposal), label: proposal.label });
    if (division) options.push({ value: "division", label: `${division.name} 공개` });
    options.push({ value: "private", label: "미공개" });
    const stored = storedValue(row);
    return options.some((option) => option.value === stored) ? options : [{ value: stored, label: row.visibilityLabel }, ...options];
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
    return optionsFor(row).find((option) => option.value === value)?.label ?? row.visibilityLabel;
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

  const columns: TableColumn<Row>[] = [
    { key: "issuedOn", header: "날짜", priority: "p2", cell: (row) => <Num value={row.issuedOn.slice(5)} /> },
    {
      key: "counterparty",
      header: "거래처·가맹점",
      priority: "p1",
      cell: (row) => row.counterparty ?? "—",
      secondaryLine: (row) => row.kindLine,
    },
    { key: "supplyKrw", header: "공급가", priority: "p3", align: "right", cell: (row) => <Num value={row.supplyKrw} /> },
    { key: "vatKrw", header: "세액", priority: "p3", align: "right", cell: (row) => <Num value={row.vatKrw} /> },
    { key: "totalKrw", header: "합계", priority: "p1", align: "right", cell: (row) => <Num value={row.totalKrw} /> },
    {
      key: VISIBILITY,
      header: "공개",
      priority: "p2",
      // `—`는 공개할 수 없는 줄(붙음 · 음수 · 경영관리만 종류 · 보관)에만 — 잠긴 줄은 지금 값을 그대로 보인다(이유는 상태 2행).
      cell: (row) => (row.visibilityCell === "readonly" ? "—" : labelOf(row)),
      summary: (row) => (row.visibilityCell === "readonly" ? "—" : labelOf(row)),
      editability: (row) => (editableWidth ? row.visibilityCell : "readonly"),
      editCell: (row, ctx) => (
        <VisibilityEditCell id={`evidence-visibility-${row.id}`} initialValue={currentValue(row)} options={optionsFor(row)} onCommit={ctx.onCommit} onCancel={ctx.onCancel} />
      ),
    },
    {
      key: "status",
      header: "상태",
      priority: "p1",
      cell: (row) => <StatusTag status={row.statusWord} variant="text" />,
      secondaryLine: (row) => row.statusDetail,
    },
  ];

  const cellIssue = (row: Row, columnKey: string): CellIssue | undefined => {
    const message = columnKey === VISIBILITY ? cellErrors[row.id] : undefined;
    return message ? { kind: "error", message } : undefined;
  };

  const displayedIds = new Set(rows.map((row) => row.id));
  const claimedErrorCells = rejectedRowIds.filter((id) => displayedIds.has(id)).length;
  const footerNotices: FooterNoticeItem[] = [];
  if (rejectionSummary) footerNotices.push({ tone: "danger", text: rejectionSummary, replacesIssueCount: { errorCells: claimedErrorCells, conflictRows: 0 } });
  if (result.serverError) footerNotices.push({ tone: "danger", text: result.serverError });

  // 1차는 편집 폭에서만, 목록이 완전히 비었으면 없다(DR5 — 끌어 놓기 영역의 `파일 고르기`가 첫 행동).
  const showPrimary = editableWidth && (rows.length > 0 || pending > 0);
  const noChange = pending === 0 && !cellEditing;

  return (
    <>
      {editableWidth ? <IntakeZone /> : null}

      {showPrimary ? (
        <div className={styles.filterRow}>
          <div className={styles.filters} />
          <Button
            type="button"
            variant="primary"
            className={styles.primaryAction}
            pending={isExecuting}
            disabled={noChange}
            disabledReason={noChange ? COPY.noChange : undefined}
            reasonTone="info"
            shortcut="Ctrl+S"
            onClick={handleSave}
          >
            {`공개 범위 저장${pending > 0 ? ` ${pending}` : ""}`}
          </Button>
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

      <Table
        caption={COPY.caption}
        columns={columns}
        rows={rows}
        getRowId={(row) => row.id}
        enableGridKeyboard
        rowLabel={(row) => `${row.issuedOn} ${row.counterparty ?? ""}`}
        saveLocked={isExecuting}
        onEditingChange={setCellEditing}
        onCellCommit={commitVisibility}
        cellIssue={cellIssue}
        cellDirty={(row, columnKey) => columnKey === VISIBILITY && (proposals.has(row.id) || row.id in edits)}
        firstIssueSignal={issueSignal}
        emptyMessage={COPY.empty}
        keyboard={{ onSave: () => setSaveRequests((count) => count + 1) }}
        footerNotices={footerNotices}
        footerSuccess={savedNotice}
        footer={(notice) => (
          <tr>
            <td colSpan={columns.length} className={styles.footerCell}>
              합계
              {notice}
            </td>
          </tr>
        )}
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
    </>
  );
}
