"use client";

import { useEffect, useState } from "react";
import { Table } from "@/ui/table/Table";
import { Select } from "@/ui/select/Select";
import { Form } from "@/ui/form/Form";
import { formatKrw, parseNumberInput, type NumberInputKind } from "@/lib/format-number";
import { useCommaInput } from "@/ui/input/use-comma-input";
import type { TableColumn } from "@/ui/table/types";
import type { Currency } from "@/domain/money";
import styles from "./project-detail.module.css";

export type ContractDraft = {
  currency: Currency;
  amount: number;
  fxRate: number;
  fxRateTouched: boolean;
  dirty: boolean;
};

export type EntryDraft = {
  clientKey: string;
  id?: string;
  version?: number;
  entryDate: string;
  amount: number;
  note: string | null;
  dirty: boolean;
  computedGrossKrw?: number | null;
  recomputeDeltaKrw?: number | null;
  vatKrw?: number | null;
  totalKrw?: number | null;
};

function contractHintText(vatKrw: number, totalKrw: number): string {
  return `부가세 10% ${formatKrw(vatKrw)} · 합계 ${formatKrw(totalKrw)} · 서버 계산`;
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
}: {
  ariaLabel: string;
  value: number;
  kind?: NumberInputKind;
  onCommit: (amount: number) => void;
  className?: string;
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
  onCommit,
}: {
  ariaLabel: string;
  initialValue: string;
  kind: NumberInputKind;
  className?: string;
  onCommit: (amount: number) => void;
}) {
  const { inputRef, value, onChange, error, rawValue } = useCommaInput(kind, initialValue);

  // 해석되는 값은 입력하는 즉시 반영한다(F4) — blur에서만 반영하면 저장
  // 버튼이 입력 중에 활성화되지 않는다. 빈 칸은 0으로 커밋한다.
  // onCommit은 호출부가 매 렌더 새로 만드는 인라인 함수라 deps에 넣으면
  // rawValue가 그대로인데도 반복 커밋된다(무한 렌더로 이어진다) — 값이
  // 실제로 바뀔 때만 부모에 알리면 된다.
  useEffect(() => {
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
        onChange={onChange}
        className={className}
      />
      {error ? <p className={styles.cellEditError}>{error}</p> : null}
    </>
  );
}

// SYSTEM.md §6-2 S6 — 매출 섹션. 계약 금액 단일 칸 폼(Form.Actions 없음,
// §7-15 일반 규칙) + 발행·입금 두 편집 표. 표 단위 정보 노출(issuedEntries/
// paidEntries가 undefined면 두 표를 렌더하지 않는다 — 기획본부 경로).
export function RevenueSection({
  contractDraft,
  onContractChange,
  contractVatKrw,
  contractTotalKrw,
  contractError,
  canWriteContract,
  issuedEntries,
  paidEntries,
  onIssuedChange,
  onPaidChange,
  onAddIssued,
  onAddPaid,
  canWriteEntries,
  balanceKrw,
}: {
  contractDraft: ContractDraft;
  onContractChange: (patch: Partial<ContractDraft>) => void;
  contractVatKrw: number;
  contractTotalKrw: number;
  contractError?: string;
  canWriteContract: boolean;
  issuedEntries: EntryDraft[] | undefined;
  paidEntries: EntryDraft[] | undefined;
  onIssuedChange: (clientKey: string, patch: Partial<EntryDraft>) => void;
  onPaidChange: (clientKey: string, patch: Partial<EntryDraft>) => void;
  onAddIssued: () => void;
  onAddPaid: () => void;
  canWriteEntries: boolean;
  balanceKrw: number | undefined;
}) {
  const tablesVisible = issuedEntries !== undefined && paidEntries !== undefined;

  const issuedColumns: TableColumn<EntryDraft>[] = [
    {
      key: "entryDate",
      header: "발행일",
      priority: "p1",
      editability: () => (canWriteEntries ? "edit" : "locked"),
      cell: (row) =>
        canWriteEntries ? (
          <input
            aria-label="발행일"
            type="date"
            value={row.entryDate}
            onChange={(event) => onIssuedChange(row.clientKey, { entryDate: event.target.value })}
            className={styles.cellInput}
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
      editability: () => (canWriteEntries ? "edit" : "locked"),
      cell: (row) =>
        canWriteEntries ? (
          <AmountInput
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
      editability: () => (canWriteEntries ? "edit" : "locked"),
      cell: (row) =>
        canWriteEntries ? (
          <input
            aria-label="메모"
            type="text"
            value={row.note ?? ""}
            onChange={(event) => onIssuedChange(row.clientKey, { note: event.target.value || null })}
            className={styles.cellInput}
          />
        ) : (
          (row.note ?? "—")
        ),
    },
  ];

  const paidColumns: TableColumn<EntryDraft>[] = [
    {
      key: "entryDate",
      header: "입금일",
      priority: "p1",
      editability: () => (canWriteEntries ? "edit" : "locked"),
      cell: (row) =>
        canWriteEntries ? (
          <input
            aria-label="입금일"
            type="date"
            value={row.entryDate}
            onChange={(event) => onPaidChange(row.clientKey, { entryDate: event.target.value })}
            className={styles.cellInput}
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
      editability: () => (canWriteEntries ? "edit" : "locked"),
      cell: (row) =>
        canWriteEntries ? (
          <AmountInput
            ariaLabel="입금액"
            value={row.amount}
            onCommit={(amount) => onPaidChange(row.clientKey, { amount })}
            className={styles.cellInputNumeric}
          />
        ) : (
          formatKrw(row.amount)
        ),
      secondaryLine: (row) =>
        row.computedGrossKrw !== null && row.computedGrossKrw !== undefined
          ? `공급가액 ${formatKrw(row.computedGrossKrw)} · 서버 계산`
          : null,
    },
    {
      key: "note",
      header: "메모",
      priority: "p2",
      editability: () => (canWriteEntries ? "edit" : "locked"),
      cell: (row) =>
        canWriteEntries ? (
          <input
            aria-label="메모"
            type="text"
            value={row.note ?? ""}
            onChange={(event) => onPaidChange(row.clientKey, { note: event.target.value || null })}
            className={styles.cellInput}
          />
        ) : (
          (row.note ?? "—")
        ),
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
      <p className={styles.sectionSubtitle}>공급가액 기준 · 입금액만 통장 합계</p>

      <form className={`${styles.contractForm} single-column`} onSubmit={(event) => event.preventDefault()}>
        <Form.Field id="contract-amount" label="계약 금액" width="short">
          <div className={styles.contractRow}>
            {canWriteContract ? (
              <Select
                id="contract-currency"
                aria-label="계약 금액 통화"
                value={contractDraft.currency}
                onChange={(event) => onContractChange({ currency: event.target.value as Currency, fxRateTouched: false })}
                options={[
                  { value: "KRW", label: "KRW" },
                  { value: "USD", label: "USD" },
                ]}
                className={styles.cellSelect}
              />
            ) : null}
            {canWriteContract ? (
              <AmountInput
                ariaLabel="계약 금액"
                value={contractDraft.amount}
                kind={contractDraft.currency === "KRW" ? "krw" : "foreign"}
                onCommit={(amount) => onContractChange({ amount })}
                className={styles.cellInputNumeric}
              />
            ) : (
              <span>{formatKrw(contractDraft.amount)}</span>
            )}
            {canWriteContract && contractDraft.currency !== "KRW" ? (
              <AmountInput
                ariaLabel="계약 금액 환율"
                value={contractDraft.fxRate}
                kind="fxRate"
                onCommit={(fxRate) => onContractChange({ fxRate, fxRateTouched: true })}
                className={styles.cellInputNumeric}
              />
            ) : null}
          </div>
        </Form.Field>
        <Form.Hint>{contractHintText(contractVatKrw, contractTotalKrw)}</Form.Hint>
        {contractError ? <Form.Error>{contractError}</Form.Error> : null}
      </form>

      {tablesVisible ? (
        <>
          <Table
            caption="발행 줄"
            columns={issuedColumns}
            rows={issuedEntries ?? []}
            getRowId={(row) => row.clientKey}
            emptyMessage="발행한 세금계산서가 없습니다"
            emptyAction={canWriteEntries ? { label: "발행 줄 추가", onClick: onAddIssued } : undefined}
            footer={
              <tr>
                <td colSpan={issuedColumns.length} className={styles.footerCell}>
                  {`합계 (공급가액 · ${(issuedEntries ?? []).length}줄)`}
                </td>
              </tr>
            }
          />
          {canWriteEntries && (issuedEntries ?? []).length > 0 ? (
            <button type="button" className={styles.addLineButton} onClick={onAddIssued}>
              발행 줄 추가
            </button>
          ) : null}

          <Table
            caption="입금 줄"
            columns={paidColumns}
            rows={paidEntries ?? []}
            getRowId={(row) => row.clientKey}
            emptyMessage="입금 줄이 없습니다"
            emptyAction={canWriteEntries ? { label: "입금 줄 추가", onClick: onAddPaid } : undefined}
            alwaysShowFooter
            footer={
              <tr>
                <td colSpan={paidColumns.length - 1} className={styles.footerCell}>
                  {`합계 (공급가액 · ${(paidEntries ?? []).length}줄)`}
                </td>
                <td className={styles.footerCell}>{balanceLabel}</td>
              </tr>
            }
          />
          {canWriteEntries && (paidEntries ?? []).length > 0 ? (
            <button type="button" className={styles.addLineButton} onClick={onAddPaid}>
              입금 줄 추가
            </button>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
