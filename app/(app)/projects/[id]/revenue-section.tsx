"use client";

import { Table } from "@/ui/table/Table";
import { Select } from "@/ui/select/Select";
import { Form } from "@/ui/form/Form";
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
          <input
            aria-label="발행액"
            type="text"
            inputMode="decimal"
            value={row.amount}
            onChange={(event) => onIssuedChange(row.clientKey, { amount: Number(event.target.value) || 0 })}
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
          <input
            aria-label="입금액"
            type="text"
            inputMode="decimal"
            value={row.amount}
            onChange={(event) => onPaidChange(row.clientKey, { amount: Number(event.target.value) || 0 })}
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
              <input
                aria-label="계약 금액"
                type="text"
                inputMode="decimal"
                value={contractDraft.amount}
                onChange={(event) => onContractChange({ amount: Number(event.target.value) || 0 })}
                className={styles.cellInputNumeric}
              />
            ) : (
              <span>{formatKrw(contractDraft.amount)}</span>
            )}
            {canWriteContract && contractDraft.currency !== "KRW" ? (
              <input
                aria-label="계약 금액 환율"
                type="text"
                inputMode="decimal"
                value={contractDraft.fxRate}
                onChange={(event) =>
                  onContractChange({ fxRate: Number(event.target.value) || 0, fxRateTouched: true })
                }
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
