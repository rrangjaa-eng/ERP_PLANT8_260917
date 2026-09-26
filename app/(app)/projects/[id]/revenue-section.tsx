"use client";

import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { Table } from "@/ui/table/Table";
import { KvList } from "@/ui/kv-list/KvList";
import { formatKrw, parseNumberInput, type NumberInputKind } from "@/lib/format-number";
import { useCommaInput } from "@/ui/input/use-comma-input";
import type { CellIssue, TableColumn } from "@/ui/table/types";
import type { ContractInfo } from "@/domain/revenue";
import { otherCellsRejectedText, revenueTableErrorText } from "./revenue-cells";
import styles from "./project-detail.module.css";

export type EntryDraft = {
  clientKey: string;
  id: string;
  version?: number;
  entryDate: string;
  amount: number;
  note: string | null;
  dirty: boolean;
  computedGrossKrw?: number | null;
  recomputeDeltaKrw?: number | null;
  vatKrw?: number | null;
  totalKrw?: number | null;
  /** 04-16(DR-15) — 외화 입금이면 `USD 4,400.00 @1,318.1818`, 원화면 null. */
  foreignLine?: string | null;
  /** 04-16(B3) — 거부 봉투에서 이 줄로 떼어 낸 칸 오류(열 키 → 이유). */
  cellErrors?: Record<string, string>;
};

// 04-16(DR-15) — 숫자 묶음은 꺾지 않고 ` · ` 사이에서만 줄바꿈한다(구분자는 줄바꿈되는 부모의 글자).
function NumberGroups({ groups, className }: { groups: string[]; className?: string }) {
  return (
    <span className={[styles.secondaryGroups, className].filter(Boolean).join(" ")}>
      {groups.map((group, index) => (
        <Fragment key={group}>
          {index > 0 ? " · " : null}
          <span>{group}</span>
        </Fragment>
      ))}
    </span>
  );
}

function paidNumberGroups(row: EntryDraft): string[] {
  const groups: string[] = [];
  if (row.foreignLine) groups.push(row.foreignLine);
  if (row.computedGrossKrw !== null && row.computedGrossKrw !== undefined) groups.push(`공급가액 ${formatKrw(row.computedGrossKrw)}`);
  return groups;
}

// 폰 접힌 줄 — 숫자 묶음 뒤에 메모(메모는 줄바꿈된다). 같은 정보를 금액 셀 2행과 두 번 보이지 않게 2행은 폰에서 숨긴다.
function collapsedSummary(groups: string[], note: string | null): ReactNode {
  if (groups.length === 0) return note;
  return (
    <>
      <NumberGroups groups={groups} />
      {note ? ` · ${note}` : null}
    </>
  );
}

function entryCellIssue(row: EntryDraft, columnKey: string): CellIssue | undefined {
  const message = row.cellErrors?.[columnKey];
  return message ? { kind: "error", message } : undefined;
}

// 04-16(D-84) — 계약 금액은 입력이 아니라 서버가 파생한 값이다. 2행은 ` · ` 묶음 사이에서만 줄바꿈한다.
function contractNoteGroups(contract: ContractInfo): string[] {
  if (contract.amountKrw === null || contract.vatKrw === null || contract.totalKrw === null) {
    return contract.pendingLabel ? [contract.pendingLabel] : [];
  }
  return [
    `부가세 ${contract.vatRateLabel ?? ""} ${formatKrw(contract.vatKrw)}`,
    `합계 ${formatKrw(contract.totalKrw)}`,
    contract.sourceLabel ?? "",
  ];
}

function ContractValue({ contract }: { contract: ContractInfo }) {
  return (
    <>
      <span className={styles.contractAmount}>{contract.amountKrw === null ? "—" : formatKrw(contract.amountKrw)}</span>
      <NumberGroups groups={contractNoteGroups(contract)} className={styles.contractNote} />
    </>
  );
}

// F4 — 이 표·폼의 금액 입력은 모두 `value={숫자}`로 매 렌더 값을 되돌리는
// 통제 입력이었다 — 쉼표("1,500,000")는 Number()가 조용히 0으로 읽고,
// 소수점("1234.")은 다음 렌더에서 지워져(Number("1234.")===1234) 이어 치는
// 자리수가 정수 뒤에 그대로 붙었다("1234.56"→123456). 04-09부터 useCommaInput이
// 타이핑 중 쉼표를 넣고 커서를 지킨다(UI-SPEC S15) — 숫자가 아닌 통째 입력은
// 훅이 스스로 거부한다(C-02).
function amountText(value: number): string {
  return value === 0 ? "" : String(value);
}

// useCommaInput은 자기 상태를 가진 칸이라(제어 대상이 rawValue가 아니라
// 훅 내부 text) 부모가 value를 바꿔도 저절로 반영되지 않는다. 우리가 직접
// onCommit한 값(committedValue)과 새 value가 다르면 서버 재조회 같은 외부
// 변경이라는 뜻이라 key를 바꿔 다시 마운트해 새 초깃값을 반영한다 — 우리가
// 커밋한 값의 메아리일 때는 다시 마운트하지 않는다(타이핑 중 커서 보존).
// 렌더 중 "prop 변화에 맞춰 state 조정" 패턴(PermissionGrid.tsx 선례) — ref를
// 렌더 중에 바꾸면 안 되므로(react-hooks/refs) useState를 쓴다.
function AmountInput({
  ariaLabel,
  value,
  kind = "krw",
  onCommit,
  className,
  readOnly,
}: {
  ariaLabel: string;
  value: number;
  kind?: NumberInputKind;
  onCommit: (amount: number) => void;
  className?: string;
  readOnly: boolean;
}) {
  const [committedValue, setCommittedValue] = useState(value);
  const [mountKey, setMountKey] = useState(0);
  if (value !== committedValue) {
    setCommittedValue(value);
    setMountKey((key) => key + 1);
  }

  return (
    <AmountInputField
      key={mountKey}
      ariaLabel={ariaLabel}
      initialValue={amountText(value)}
      kind={kind}
      className={className}
      readOnly={readOnly}
      onCommit={(amount) => {
        setCommittedValue(amount);
        onCommit(amount);
      }}
    />
  );
}

function AmountInputField({
  ariaLabel,
  initialValue,
  kind,
  className,
  readOnly,
  onCommit,
}: {
  ariaLabel: string;
  initialValue: string;
  kind: NumberInputKind;
  className?: string;
  readOnly: boolean;
  onCommit: (amount: number) => void;
}) {
  const { inputRef, value, onChange, error, rawValue } = useCommaInput(kind, initialValue);
  // 마지막으로 부모에 알린 rawValue — 이 칸의 초깃값에서 시작한다. "마운트
  // 직후 첫 실행은 건너뛴다" 플래그 대신 값 비교를 쓴다: dev Strict Mode는
  // 마운트 직후 이 effect를 두 번 부르므로(같은 인스턴스, cleanup 없이 재실행)
  // "이번이 첫 실행인가"로는 두 번째 호출을 걸러내지 못한다 — 실제로 값이
  // 바뀌었을 때만 커밋하면 몇 번을 다시 불려도 안전하다(멱등).
  const lastCommittedRawRef = useRef(initialValue);

  // 해석되는 값은 입력하는 즉시 반영한다(F4) — blur에서만 반영하면 저장
  // 버튼이 입력 중에 활성화되지 않는다. 빈 칸은 0으로 커밋한다.
  // onCommit은 호출부가 매 렌더 새로 만드는 인라인 함수라 deps에 넣으면
  // rawValue가 그대로인데도 반복 커밋된다(무한 렌더로 이어진다) — 값이
  // 실제로 바뀔 때만 부모에 알리면 된다.
  useEffect(() => {
    if (rawValue === lastCommittedRawRef.current) return;
    lastCommittedRawRef.current = rawValue;
    const parsed = rawValue === "" ? 0 : parseNumberInput(rawValue);
    if (parsed !== null && Number.isFinite(parsed)) onCommit(parsed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawValue]);

  return (
    <>
      <input
        ref={inputRef}
        aria-label={ariaLabel}
        type="text"
        inputMode={kind === "krw" ? "numeric" : "decimal"}
        value={value}
        readOnly={readOnly}
        onChange={onChange}
        className={className}
      />
      {error ? <p className={styles.cellEditError}>{error}</p> : null}
    </>
  );
}

// SYSTEM.md §6-2 S6 — 매출 섹션. 계약 금액 한 줄(KvList, 파생 값 — 04-16 D-84) + 발행·입금 두 편집 표.
// 표 단위 정보 노출(issuedEntries/paidEntries가 undefined면 두 표를 렌더하지 않는다 — 기획본부 경로).
export function RevenueSection({
  contract,
  issuedEntries,
  paidEntries,
  onIssuedChange,
  onPaidChange,
  onAddIssued,
  onAddPaid,
  canWriteEntries,
  balanceKrw,
  saveLocked = false,
  editableWidth = true,
  rejectedCells,
  onSave,
}: {
  /** 04-16(B-19) — quote.amount를 볼 수 없으면 서버가 싣지 않는다(키 부재). */
  contract: ContractInfo | undefined;
  issuedEntries: EntryDraft[] | undefined;
  paidEntries: EntryDraft[] | undefined;
  onIssuedChange: (clientKey: string, patch: Partial<EntryDraft>) => void;
  onPaidChange: (clientKey: string, patch: Partial<EntryDraft>) => void;
  onAddIssued: () => void;
  onAddPaid: () => void;
  canWriteEntries: boolean;
  balanceKrw: number | undefined;
  /** 04-49(DR-3 · 계약 3) — 저장 요청 중. 칸은 값을 보인 채 readOnly, 추가·통화 바꾸기는 무동작이다. */
  saveLocked?: boolean;
  /** 04-49(DR-36) — 1024 미만이면 발행·입금 표는 보기 전용(추가 버튼 없음, EMPTY는 사실만). */
  editableWidth?: boolean;
  /** 04-16(B3 · R2) — 마지막 거부 봉투의 표별 칸 수. total은 표 밖 칸까지 센 전부다. */
  rejectedCells?: { issued: number; paid: number; total: number };
  /** 04-41 — 발행·입금 표 안의 Ctrl+S도 견적 표와 같은 일괄 저장이다. */
  onSave: () => void;
}) {
  const canEditEntries = canWriteEntries && editableWidth;
  // 04-16(D-85) — 발행 표는 발행액을 볼 수 있으면, 입금 표는 입금액을 볼 수 있을 때만 렌더한다(DTO 키 부재 = 표 부재).
  const issuedVisible = issuedEntries !== undefined;
  const paidVisible = paidEntries !== undefined;
  // 합계 행 글자는 거부 요약과 같은 수명이다(다음 저장 시도·성공에서 바뀐다) — 칸을 고쳐도 남는다.
  const rejected = rejectedCells ?? { issued: 0, paid: 0, total: 0 };
  const issuedNote = revenueTableErrorText(rejected.issued) ?? otherCellsRejectedText(rejected.issued, rejected.total - rejected.issued);
  const paidNote = revenueTableErrorText(rejected.paid) ?? otherCellsRejectedText(rejected.paid, rejected.total - rejected.paid);
  // Copywriting Empty — 읽기로만 받는 사람은 담당을, 1024 미만 경영관리는 사실만, 편집 가능하면 사실 + 추가 버튼.
  const issuedEmpty = canWriteEntries ? "발행한 세금계산서가 없습니다" : "발행한 세금계산서가 없습니다 · 발행은 경영관리";
  const paidEmpty = canWriteEntries ? "입금 줄이 없습니다" : "입금 줄이 없습니다 · 입금은 경영관리";

  const issuedColumns: TableColumn<EntryDraft>[] = [
    {
      key: "entryDate",
      header: "발행일",
      priority: "p1",
      editability: () => (canEditEntries ? "edit" : canWriteEntries ? "readonly" : "locked"),
      cell: (row) =>
        canEditEntries ? (
          <input
            aria-label="발행일"
            type="date"
            value={row.entryDate}
            onChange={(event) => onIssuedChange(row.clientKey, { entryDate: event.target.value })}
            className={styles.cellInput}
            readOnly={saveLocked}
          />
        ) : (
          row.entryDate
        ),
    },
    {
      key: "amount",
      header: "발행액",
      priority: "p1",
      align: "right",
      editability: () => (canEditEntries ? "edit" : canWriteEntries ? "readonly" : "locked"),
      cell: (row) =>
        canEditEntries ? (
          <AmountInput
            readOnly={saveLocked}
            ariaLabel="발행액"
            value={row.amount}
            onCommit={(amount) => onIssuedChange(row.clientKey, { amount })}
            className={styles.cellInputNumeric}
          />
        ) : (
          formatKrw(row.amount)
        ),
    },
    {
      key: "note",
      header: "메모",
      priority: "p2",
      editability: () => (canEditEntries ? "edit" : canWriteEntries ? "readonly" : "locked"),
      cell: (row) =>
        canEditEntries ? (
          <input
            aria-label="메모"
            type="text"
            value={row.note ?? ""}
            onChange={(event) => onIssuedChange(row.clientKey, { note: event.target.value || null })}
            className={styles.cellInput}
            readOnly={saveLocked}
          />
        ) : (
          <span className={styles.noteText}>{row.note ?? "—"}</span>
        ),
      summary: (row) => row.note,
    },
  ];

  const paidColumns: TableColumn<EntryDraft>[] = [
    {
      key: "entryDate",
      header: "입금일",
      priority: "p1",
      editability: () => (canEditEntries ? "edit" : canWriteEntries ? "readonly" : "locked"),
      cell: (row) =>
        canEditEntries ? (
          <input
            aria-label="입금일"
            type="date"
            value={row.entryDate}
            onChange={(event) => onPaidChange(row.clientKey, { entryDate: event.target.value })}
            className={styles.cellInput}
            readOnly={saveLocked}
          />
        ) : (
          row.entryDate
        ),
    },
    {
      key: "amount",
      header: "입금액",
      priority: "p1",
      align: "right",
      editability: () => (canEditEntries ? "edit" : canWriteEntries ? "readonly" : "locked"),
      cell: (row) =>
        canEditEntries ? (
          <AmountInput
            readOnly={saveLocked}
            ariaLabel="입금액"
            value={row.amount}
            onCommit={(amount) => onPaidChange(row.clientKey, { amount })}
            className={styles.cellInputNumeric}
          />
        ) : (
          formatKrw(row.amount)
        ),
      secondaryLine: (row) => {
        const groups = paidNumberGroups(row);
        return groups.length > 0 ? <NumberGroups groups={groups} className={styles.pcSecondary} /> : null;
      },
    },
    {
      key: "note",
      header: "메모",
      priority: "p2",
      editability: () => (canEditEntries ? "edit" : canWriteEntries ? "readonly" : "locked"),
      cell: (row) =>
        canEditEntries ? (
          <input
            aria-label="메모"
            type="text"
            value={row.note ?? ""}
            onChange={(event) => onPaidChange(row.clientKey, { note: event.target.value || null })}
            className={styles.cellInput}
            readOnly={saveLocked}
          />
        ) : (
          <span className={styles.noteText}>{row.note ?? "—"}</span>
        ),
      summary: (row) => collapsedSummary(paidNumberGroups(row), row.note),
    },
  ];

  const balanceLabel =
    balanceKrw === undefined || balanceKrw === 0
      ? null
      : balanceKrw < 0
        ? `미수 ${formatKrw(Math.abs(balanceKrw))}`
        : `초과 입금 ${formatKrw(balanceKrw)}`;

  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>매출</h2>
      <p className={styles.sectionSubtitle}>{paidVisible ? "공급가액 기준 · 입금액만 통장 합계" : "공급가액 기준"}</p>

      {contract ? (
        <div className={styles.contractSummary}>
          <KvList items={[{ label: "계약 금액", value: <ContractValue contract={contract} /> }]} />
        </div>
      ) : null}

      {issuedVisible ? (
        <>
          <Table
            caption="발행 줄"
            keyboard={{ onSave }}
            columns={issuedColumns}
            rows={issuedEntries}
            getRowId={(row) => row.clientKey}
            emptyMessage={issuedEmpty}
            emptyAction={canEditEntries ? { label: "발행 줄 추가", onClick: onAddIssued } : undefined}
            saveLocked={saveLocked}
            cellIssue={entryCellIssue}
            alwaysShowFooter={issuedNote !== null}
            footer={
              <tr>
                <td colSpan={issuedColumns.length - 1} className={styles.footerCell}>
                  {`합계 (공급가액 · ${issuedEntries.length}줄)`}
                </td>
                <td className={styles.footerCell}>
                  {issuedNote ? <span className={styles.rejectionSummary}>{issuedNote}</span> : null}
                </td>
              </tr>
            }
          />
          {canEditEntries && issuedEntries.length > 0 ? (
            <button
              type="button"
              className={styles.addLineButton}
              aria-disabled={saveLocked ? "true" : undefined}
              onClick={() => (saveLocked ? undefined : onAddIssued())}
            >
              발행 줄 추가
            </button>
          ) : null}
        </>
      ) : null}

      {paidVisible ? (
        <>
          <Table
            caption="입금 줄"
            keyboard={{ onSave }}
            columns={paidColumns}
            rows={paidEntries}
            getRowId={(row) => row.clientKey}
            emptyMessage={paidEmpty}
            emptyAction={canEditEntries ? { label: "입금 줄 추가", onClick: onAddPaid } : undefined}
            saveLocked={saveLocked}
            cellIssue={entryCellIssue}
            alwaysShowFooter
            footer={
              <tr>
                <td colSpan={paidColumns.length - 1} className={styles.footerCell}>
                  {`합계 (공급가액 · ${paidEntries.length}줄)`}
                </td>
                <td className={styles.footerCell}>
                  {paidNote ? <span className={styles.rejectionSummary}>{paidNote}</span> : null}
                  {paidNote && balanceLabel ? " · " : null}
                  {balanceLabel ? <span className={styles.balanceWarning}>{balanceLabel}</span> : null}
                </td>
              </tr>
            }
          />
          {canEditEntries && paidEntries.length > 0 ? (
            <button
              type="button"
              className={styles.addLineButton}
              aria-disabled={saveLocked ? "true" : undefined}
              onClick={() => (saveLocked ? undefined : onAddPaid())}
            >
              입금 줄 추가
            </button>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
