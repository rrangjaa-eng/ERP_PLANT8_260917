"use client";

import { useState } from "react";
import { Table } from "@/ui/table/Table";
import { Select } from "@/ui/select/Select";
import { Form } from "@/ui/form/Form";
import { normalizeNumericPaste } from "@/ui/table/parse-tsv";
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

function formatKrw(value: number): string {
  return value.toLocaleString("ko-KR");
}

function contractHintText(vatKrw: number, totalKrw: number): string {
  return `부가세 10% ${formatKrw(vatKrw)} · 합계 ${formatKrw(totalKrw)} · 서버 계산`;
}

// F4 — 이 표·폼의 금액 입력은 모두 `value={숫자}`로 매 렌더 값을 되돌리는
// 통제 입력이었다 — 쉼표("1,500,000")는 Number()가 조용히 0으로 읽고,
// 소수점("1234.")은 다음 렌더에서 지워져(Number("1234.")===1234) 이어 치는
// 자리수가 정수 뒤에 그대로 붙었다("1234.56"→123456). 타이핑 중엔 원문
// 텍스트를 그대로 보여주고, blur/Enter에서만 공용 파서(normalizeNumericPaste,
// 쉼표·공백·통화 기호 제거)로 읽어 커밋한다 — 숫자가 아니면 조용히 0을
// 쓰지 않고 이전 값으로 되돌린다.
function amountText(value: number): string {
  return value === 0 ? "" : String(value);
}

function AmountInput({
  ariaLabel,
  value,
  onCommit,
  className,
}: {
  ariaLabel: string;
  value: number;
  onCommit: (amount: number) => void;
  className?: string;
}) {
  // 0은 빈 칸으로 보여 준다 — "0"이 미리 들어 있으면 그 앞에 입력이 붙어
  // "1,500,0000"처럼 금액이 10배가 된다(/qa F4 재현).
  const [text, setText] = useState(amountText(value));
  // 커밋 후(또는 서버 재조회로) value가 바뀔 때만 text를 되돌린다 — 타이핑
  // 도중엔 value가 그대로라 이 분기를 타지 않는다. effect 안 setState는
  // 불필요한 연쇄 렌더를 만든다(react-hooks/set-state-in-effect) — 렌더 중
  // "prop 변화에 맞춰 state 조정" 패턴(PermissionGrid.tsx 선례)을 쓴다.
  const [prevValue, setPrevValue] = useState(value);
  if (value !== prevValue) {
    setPrevValue(value);
    setText(amountText(value));
  }

  function commit() {
    const parsed = normalizeNumericPaste(text);
    if (parsed === null) {
      setText(amountText(value));
      return;
    }
    onCommit(parsed);
  }

  return (
    <input
      aria-label={ariaLabel}
      type="text"
      inputMode="decimal"
      value={text}
      onChange={(event) => {
        // 해석되는 값은 입력하는 즉시 반영한다 — blur에서만 반영하면 저장
        // 버튼이 입력 중에 활성화되지 않는다. prevValue를 먼저 맞춰 두어
        // "1234."처럼 입력 중인 원문이 되돌려지지 않게 한다.
        setText(event.target.value);
        const parsed = event.target.value.trim() === "" ? 0 : normalizeNumericPaste(event.target.value);
        if (parsed !== null && parsed !== value) {
          setPrevValue(parsed);
          onCommit(parsed);
        }
      }}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          commit();
        }
      }}
      className={className}
    />
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
