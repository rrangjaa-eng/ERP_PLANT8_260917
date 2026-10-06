"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { PaymentViewDto } from "@/domain/payments";
import { TRANSFER_FRACTION, TRANSFER_NOT_NUMBER, TRANSFER_NOT_POSITIVE } from "@/domain/payments/action-row";
import { Form } from "@/ui/form/Form";
import { KvList, type KvItem } from "@/ui/kv-list/KvList";
import { Num } from "@/ui/num/Num";
import { useCommaInput } from "@/ui/input/use-comma-input";
import { formatKrw, numberInputRejectionReason } from "@/lib/format-number";
import { previewPayableAction } from "./actions";
import styles from "./expense.module.css";

// 06-04(UI-SPEC S5 · D-604 · D-605): 지급 섹션 칸 — 지급일 · 이체액(라벨 = 지급 방식 이름) · 차이 힌트 · 차이 사유 · 지급 뒤 읽기 줄.
// 금액은 서버 값만 그린다(O-18 — 지급 총액 · 차이는 미리보기 액션이 돌려준 값, 화면은 세율 · 금액을 셈하지 않는다). 칸 값은 패널 상태에 두고
// 행동 줄 1차 `지급 완료`(payment-action-row.tsx)가 함께 보낸다(SP-3 ① — 칸이 1차 행동의 입력).

type PaymentView = Partial<PaymentViewDto>;

export type PaymentFieldErrors = { payDate?: string; transferKrw?: string; diffReason?: string };

type Fields = {
  payDate: string;
  // 쉼표를 뗀 이체액 칸 글자(빈 값 가능) · 칸이 바로 거른 입력 오류 · 사람이 칸을 고쳤는가(안 고쳤으면 기본값 = 서버 지급 총액을 따른다).
  transferRaw: string;
  transferInputError: string | null;
  transferTouched: boolean;
  diffReason: string;
};

type Preview = { payableKrw: number | null; diffKrw: number | null };

type PanelState = {
  view: PaymentView;
  conflict: string | null;
  setConflict: (message: string | null) => void;
  fields: Fields;
  setFields: (next: Partial<Fields>) => void;
  preview: Preview;
  previewing: boolean;
  refreshPreview: () => void;
  fieldErrors: PaymentFieldErrors;
  setFieldErrors: (errors: PaymentFieldErrors) => void;
};

const PanelContext = createContext<PanelState | null>(null);

export function usePaymentPanel(): PanelState {
  const state = useContext(PanelContext);
  if (!state) throw new Error("PaymentPanelProvider 밖");
  return state;
}

// 이체액 칸 글자 → 정수 원. 숫자가 아니면 null(칸 오류는 transferError가 정한다).
export function transferNumber(raw: string): number | null {
  return /^-?\d+$/.test(raw) ? Number(raw) : null;
}

// 「Error — 이체액 칸」 — 칸이 바로 거른 글자(소수점 · 숫자 아님)와 빈 값 · 0 이하.
export function transferError(fields: Fields): string | null {
  if (fields.transferInputError) return fields.transferInputError;
  const value = transferNumber(fields.transferRaw);
  if (value === null) return TRANSFER_NOT_NUMBER;
  if (value <= 0) return TRANSFER_NOT_POSITIVE;
  return null;
}

// 이체액이 서버 지급 총액과 다르면 차이 사유 칸이 서고 필수다(비교만 — 차이 값은 서버가 셈한다).
export function diffReasonNeeded(fields: Fields, preview: Preview): boolean {
  const value = transferNumber(fields.transferRaw);
  return value !== null && value > 0 && preview.payableKrw !== null && value !== preview.payableKrw;
}

export function PaymentPanelProvider({ view, children }: { view: PaymentView; children: ReactNode }) {
  const [conflict, setConflict] = useState<string | null>(null);
  const [fields, setFieldState] = useState<Fields>(() => ({
    payDate: view.payDate ?? "",
    transferRaw: view.payableKrw === null || view.payableKrw === undefined ? "" : String(view.payableKrw),
    transferInputError: null,
    transferTouched: false,
    diffReason: "",
  }));
  const [preview, setPreview] = useState<Preview>({ payableKrw: view.payableKrw ?? null, diffKrw: null });
  const [nonce, setNonce] = useState(0);
  const [fieldErrors, setFieldErrors] = useState<PaymentFieldErrors>({});
  const seq = useRef(0);
  const canPay = view.row?.primary === "pay";

  function setFields(next: Partial<Fields>) {
    setFieldState((prev) => ({ ...prev, ...next }));
  }

  // 지급일 · (고친) 이체액이 바뀌면 서버가 다시 계산한 지급 총액 · 차이를 받는다. 오는 동안 이전 값은 `--text-faint`(빈칸 · 뼈대 없음 — S5 loading).
  const transferSent = fields.transferTouched && transferError(fields) === null ? transferNumber(fields.transferRaw) : null;
  const previewKey = JSON.stringify([fields.payDate, transferSent, nonce]);
  // 응답이 온(또는 처음 그린) 칸 값 — 지금 칸 값과 다르면 미리보기가 오는 중이다(렌더에서 파생 · effect 안 setState 없음).
  const [settledKey, setSettledKey] = useState(previewKey);
  const previewing = canPay && fields.payDate !== "" && previewKey !== settledKey;
  useEffect(() => {
    if (previewKey === settledKey) return;
    if (!canPay || view.expenseId === undefined || fields.payDate === "") return;
    const expenseId = view.expenseId;
    const requestedKey = previewKey;
    const current = ++seq.current;
    const timer = setTimeout(() => {
      void (async () => {
        let result: Awaited<ReturnType<typeof previewPayableAction>> | undefined;
        try {
          result = await previewPayableAction({ expenseId, payDate: fields.payDate, ...(transferSent === null ? {} : { transferKrw: transferSent }) });
        } catch {
          result = undefined;
        }
        if (current !== seq.current) return;
        setSettledKey(requestedKey);
        const dateError = result?.validationErrors?.payDate?._errors?.[0];
        if (dateError) {
          setFieldErrors((prev) => ({ ...prev, payDate: dateError }));
          return;
        }
        if (!result?.data) {
          setConflict(result?.serverError ?? "결과를 받지 못함 · 새로 고침");
          return;
        }
        const payableKrw = result.data.payableKrw ?? null;
        setPreview({ payableKrw, diffKrw: result.data.diffKrw ?? null });
        setFieldErrors((prev) => ({ ...prev, payDate: undefined }));
        // 안 고친 이체액은 기본값(새 지급 총액)을 따른다.
        setFieldState((prev) => (prev.transferTouched || payableKrw === null ? prev : { ...prev, transferRaw: String(payableKrw) }));
      })();
    }, 250);
    return () => clearTimeout(timer);
    // 칸 값의 변화는 previewKey 하나로 본다(transferSent · payDate가 그 안에 있다).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewKey]);

  return (
    <PanelContext.Provider
      value={{
        view,
        conflict,
        setConflict,
        fields,
        setFields,
        preview,
        previewing,
        refreshPreview: () => setNonce((value) => value + 1),
        fieldErrors,
        setFieldErrors,
      }}
    >
      {children}
    </PanelContext.Provider>
  );
}

// 이체액 라벨은 지급 방식 이름(UI-SPEC S5 · 용어 줄).
const TRANSFER_LABELS: Record<string, string> = {
  corp_card: "카드 결제액",
  cash: "현금 지급액",
};

function transferLabel(paymentMethod: string | null): string {
  return (paymentMethod && TRANSFER_LABELS[paymentMethod]) ?? "이체액";
}

// 차이는 부호를 붙인다(`-3,300` · `+1,200` — 금액 표시 절 「차이」).
function SignedNum({ value }: { value: number }) {
  return <Num value={value > 0 ? `+${formatKrw(value)}` : formatKrw(value)} />;
}

// 「Error — 이체액 칸」 — 쉼표 칸이 바로 거른 글자를 S5 문구로 바꾼다.
const FRACTION_REASON = numberInputRejectionReason("krw", "krw-fraction");

// 이체액 칸 — 05 쉼표 입력 훅. 안 고친 동안 서버 지급 총액이 바뀌면 그 값으로 다시 선다(key).
function TransferInput({ id, initial, error, onChange }: { id: string; initial: string; error: string | undefined; onChange: (raw: string, inputError: string | null) => void }) {
  const { inputRef, value, onChange: onInputChange, error: inputError, rawValue } = useCommaInput("krw", initial);
  const reported = useRef(rawValue);
  useEffect(() => {
    if (reported.current === rawValue && inputError === null) return;
    reported.current = rawValue;
    onChange(rawValue, inputError === null ? null : inputError === FRACTION_REASON ? TRANSFER_FRACTION : TRANSFER_NOT_NUMBER);
    // onChange는 렌더마다 새 함수 — 칸 값의 변화만 본다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawValue, inputError]);
  return (
    <input
      id={id}
      ref={inputRef}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      className={`${styles.textInput} ${styles.numeric}`}
      value={value}
      onChange={onInputChange}
      aria-invalid={error ? true : undefined}
      aria-describedby={[error ? `${id}-error` : "", `${id}-hint`].filter(Boolean).join(" ")}
    />
  );
}

export function PaymentFields({
  paymentMethod,
  paymentMethodName,
  scheduledPaymentDate,
}: {
  paymentMethod: string | null;
  paymentMethodName: string | null;
  scheduledPaymentDate: string | null;
}) {
  const { view, fields, setFields, preview, previewing, fieldErrors, setFieldErrors } = usePaymentPanel();
  const dash = <span className={styles.muted}>—</span>;
  const paid = view.row?.row === "P6";
  const canPay = view.row?.primary === "pay";
  const label = transferLabel(paymentMethod);

  const items: KvItem[] = [
    {
      label: "지급 예정일",
      value: (
        <>
          {scheduledPaymentDate ?? dash}
          {view.row?.ownerNote ? <span className={`${styles.subLine} ${styles.muted}`}>{view.row.ownerNote}</span> : null}
        </>
      ),
    },
    { label: "지급 방식", value: paymentMethodName ?? dash },
  ];
  if (paid) {
    items.push({
      label: "지급일",
      value: (
        <>
          {view.payDate ?? dash}
          {view.processedByName ? <span className={`${styles.subLine} ${styles.muted}`}>{view.processedByName}</span> : null}
        </>
      ),
    });
    if (view.transferKrw !== undefined) {
      items.push({
        label,
        value: (
          <>
            <Num value={view.transferKrw} />
            <span className={styles.taxLine} data-testid="payment-paid-line">
              <span className={styles.taxSegment}>
                지급 총액 <Num value={view.payableKrw ?? null} />
              </span>
              {view.diffKrw ? (
                <>
                  {" · "}
                  <span className={styles.taxSegment}>
                    차이 <SignedNum value={view.diffKrw} />
                  </span>
                </>
              ) : null}
              {view.grossSupplyKrw !== null && view.grossSupplyKrw !== undefined ? (
                <>
                  {" · "}
                  <span className={styles.taxSegment}>
                    공급가 역산 <Num value={view.grossSupplyKrw} />
                  </span>
                </>
              ) : null}
            </span>
          </>
        ),
      });
    }
    if (view.diffReason) items.push({ label: "차이 사유", value: <span className={styles.subLine} data-testid="payment-diff-reason">{view.diffReason}</span> });
  }

  const shownTransferError = fieldErrors.transferKrw ?? fields.transferInputError ?? undefined;
  const needReason = diffReasonNeeded(fields, preview);

  return (
    <>
      <KvList items={items} />
      {canPay ? (
        <Form
          aria-label="지급"
          onSubmit={(event) => {
            event.preventDefault();
          }}
        >
          <Form.Field id="payment-pay-date" label="지급일" width="short">
            <input
              id="payment-pay-date"
              type="date"
              value={fields.payDate}
              onChange={(event) => {
                setFields({ payDate: event.target.value });
                if (fieldErrors.payDate) setFieldErrors({ ...fieldErrors, payDate: undefined });
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.preventDefault();
              }}
              className={styles.textInput}
              aria-invalid={fieldErrors.payDate ? true : undefined}
              aria-describedby={fieldErrors.payDate ? "payment-pay-date-error" : undefined}
            />
            {fieldErrors.payDate ? <Form.Error id="payment-pay-date-error">{fieldErrors.payDate}</Form.Error> : null}
          </Form.Field>
          <Form.Field id="payment-transfer" label={label} width="short">
            <TransferInput
              key={fields.transferTouched ? "touched" : `default-${preview.payableKrw ?? ""}`}
              id="payment-transfer"
              initial={fields.transferRaw}
              error={shownTransferError}
              onChange={(raw, inputError) => {
                setFields({ transferRaw: raw, transferInputError: inputError, transferTouched: true });
                if (fieldErrors.transferKrw) setFieldErrors({ ...fieldErrors, transferKrw: undefined });
              }}
            />
            {shownTransferError ? <Form.Error id="payment-transfer-error">{shownTransferError}</Form.Error> : null}
            <div id="payment-transfer-hint">
              {preview.diffKrw !== null && preview.diffKrw !== 0 && needReason ? (
                <Form.Hint>
                  <span className={`${styles.taxLine} ${previewing ? styles.stale : ""}`} data-testid="payment-transfer-hint">
                    <span className={styles.taxSegment}>
                      지급 총액 <Num value={preview.payableKrw} />
                    </span>
                    {" · "}
                    <span className={styles.taxSegment}>
                      차이 <SignedNum value={preview.diffKrw} />
                    </span>
                  </span>
                </Form.Hint>
              ) : null}
            </div>
          </Form.Field>
          {needReason ? (
            <Form.Field id="payment-diff-reason" label="차이 사유" width="long">
              <input
                id="payment-diff-reason"
                type="text"
                value={fields.diffReason}
                maxLength={480}
                onChange={(event) => {
                  setFields({ diffReason: event.target.value });
                  if (fieldErrors.diffReason) setFieldErrors({ ...fieldErrors, diffReason: undefined });
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") event.preventDefault();
                }}
                className={styles.textInput}
                aria-invalid={fieldErrors.diffReason ? true : undefined}
                aria-describedby={fieldErrors.diffReason ? "payment-diff-reason-error" : undefined}
              />
              {fieldErrors.diffReason ? <Form.Error id="payment-diff-reason-error">{fieldErrors.diffReason}</Form.Error> : null}
            </Form.Field>
          ) : null}
        </Form>
      ) : null}
    </>
  );
}
