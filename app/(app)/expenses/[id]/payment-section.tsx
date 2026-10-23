"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { PaymentViewDto } from "@/domain/payments";
import { AMOUNT_HIDDEN, TRANSFER_FRACTION, TRANSFER_NOT_NUMBER, TRANSFER_NOT_POSITIVE } from "@/domain/payments/action-row";
import { Button } from "@/ui/button/Button";
import { Form } from "@/ui/form/Form";
import { KvList, type KvItem } from "@/ui/kv-list/KvList";
import { Num } from "@/ui/num/Num";
import { StatusTag } from "@/ui/status-tag/StatusTag";
import { useCommaInput } from "@/ui/input/use-comma-input";
import { formatKrw, numberInputRejectionReason } from "@/lib/format-number";
import { previewPayableAction, saveScheduledPayDateAction } from "./actions";
import { PaymentAccountValue } from "../payment-targets-table";
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

// 지급 예정일 제자리 칸(SP-3 ②) — 열렸을 때만 값이 있다. original = 칸을 연 때의 서버 값(dirty 비교 · Esc 되돌림 기준).
export type ScheduleEdit = { original: string; value: string; error?: string };

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
  schedule: ScheduleEdit | null;
  setSchedule: (next: ScheduleEdit | null) => void;
  // 예정일 칸 값이 연 때의 값과 다르면 행동 줄 1차가 `예정일 저장`(P1)이다.
  scheduleDirty: boolean;
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

// 칸의 기본값 — 서버가 준 지급일(지급 전 = 오늘) · 지급 총액.
function fieldsFrom(view: PaymentView): Fields {
  return {
    payDate: view.payDate ?? "",
    transferRaw: view.payableKrw === null || view.payableKrw === undefined ? "" : String(view.payableKrw),
    transferInputError: null,
    transferTouched: false,
    diffReason: "",
  };
}

export function PaymentPanelProvider({ view, children }: { view: PaymentView; children: ReactNode }) {
  const [conflict, setConflict] = useState<string | null>(null);
  const [fields, setFieldState] = useState<Fields>(() => fieldsFrom(view));
  const [preview, setPreview] = useState<Preview>({ payableKrw: view.payableKrw ?? null, diffKrw: null });
  const [nonce, setNonce] = useState(0);
  const [fieldErrors, setFieldErrors] = useState<PaymentFieldErrors>({});
  const [schedule, setSchedule] = useState<ScheduleEdit | null>(null);
  const scheduleDirty = schedule !== null && schedule.value !== "" && schedule.value !== schedule.original;
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
  // 지급 뒤(P6) → 지급 전(지급 취소 뒤 다시 읽은 표): 칸 · 미리보기를 새 서버 값(지급일 오늘 · 지금 지급 총액)으로 다시 세운다.
  // 지급된 상태로 연 문서는 칸 초기값이 옛 지급 기록 값이라, 그대로 두면 다시 지급할 때 옛 지급일이 기본값으로 남는다(06-04 검토 P2-1). 렌더에서 파생 · effect 없음.
  const paidNow = view.row?.row === "P6";
  const [wasPaid, setWasPaid] = useState(paidNow);
  if (wasPaid !== paidNow) {
    setWasPaid(paidNow);
    if (!paidNow) {
      const fresh = fieldsFrom(view);
      setFieldState(fresh);
      setPreview({ payableKrw: view.payableKrw ?? null, diffKrw: null });
      setFieldErrors({});
      // 새 값은 방금 서버가 준 것이라 미리보기를 다시 받지 않는다.
      setSettledKey(JSON.stringify([fresh.payDate, null, nonce]));
    }
  }
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
        schedule,
        setSchedule,
        scheduleDirty,
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

// 지급 예정일 제자리 칸 — 칸 옆 저장 버튼 없음(저장은 행동 줄 1차 `예정일 저장`). Enter는 제출 막음 · Esc는 서버 값으로 되돌리고 닫는다.
// 날짜를 바꾸면 서버가 두 날짜로 다시 계산한 지급 총액을 받아 다르면 `지급 총액 {전} → {후}`(같으면 힌트 없음 — 세율 기준일이 지급 예정일인 규칙만 달라진다).
function ScheduleField({ expenseId, schedule, onChange, onClose }: { expenseId: string | undefined; schedule: ScheduleEdit; onChange: (value: string) => void; onClose: () => void }) {
  const [hint, setHint] = useState<{ value: string; before: number | null; after: number | null } | null>(null);
  const { original, value } = schedule;
  useEffect(() => {
    if (expenseId === undefined || original === "" || value === "" || value === original) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      void (async () => {
        try {
          // 예정일도 함께 싣는다 — 기준일이 지급 예정일인 규칙은 행의 옛 예정일이 아니라 이 날짜로 셈한다(06-04 검토 P3-2).
          const [before, after] = await Promise.all([
            previewPayableAction({ expenseId, payDate: original, scheduledPayDate: original }),
            previewPayableAction({ expenseId, payDate: value, scheduledPayDate: value }),
          ]);
          if (!cancelled) setHint({ value, before: before?.data?.payableKrw ?? null, after: after?.data?.payableKrw ?? null });
        } catch {
          if (!cancelled) setHint(null);
        }
      })();
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [expenseId, original, value]);
  const showHint = hint !== null && hint.value === value && value !== original && hint.before !== null && hint.after !== null && hint.before !== hint.after;

  return (
    <Form
      onSubmit={(event) => {
        event.preventDefault();
      }}
    >
      <Form.Field id="payment-scheduled-date" label="지급 예정일" width="short">
        <input
          id="payment-scheduled-date"
          type="date"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.preventDefault();
            if (event.key === "Escape") {
              event.preventDefault();
              onClose();
            }
          }}
          className={styles.textInput}
          aria-invalid={schedule.error ? true : undefined}
          aria-describedby={[schedule.error ? "payment-scheduled-date-error" : "", showHint ? "payment-scheduled-date-hint" : ""].filter(Boolean).join(" ") || undefined}
        />
        {schedule.error ? <Form.Error id="payment-scheduled-date-error">{schedule.error}</Form.Error> : null}
        {showHint ? (
          <div id="payment-scheduled-date-hint">
            <Form.Hint>
              <span className={styles.taxSegment} data-testid="payment-schedule-hint">
                지급 총액 <Num value={hint.before} /> → <Num value={hint.after} />
              </span>
            </Form.Hint>
          </div>
        ) : null}
      </Form.Field>
    </Form>
  );
}

// 07-16(SC-03 · D-731 · D-742 · C6): `지급 예정일` 값 — 값 뒤 `수동 지정` · `마감 지나 밀림` 글자 태그 또는 muted `(자동)`, 바로 아래 규칙 줄(07-01 payRuleLine
// 그대로 — 수동이면 `결재 마감 면제`), 수동이면 `자동 계산 MM-DD`, 수동 날짜가 지급 요일이 아니면 warning 한 줄(07-01 payOffWeekdayText 그대로).
// 요일 · 마감 글자는 화면이 만들지 않고 DTO 문자열만 그린다(D-715). 지급 섹션이 있든 없든(expense-document.tsx) 같은 모양.
export type PaymentScheduleValueProps = {
  date: string | null;
  manual: boolean;
  autoDate: string | null;
  pushReason: "cutoff" | "no-slot" | null;
  ruleLine: string | null;
  offWeekday: string | null;
};

export function PaymentScheduleValue({ date, manual, autoDate, pushReason, ruleLine, offWeekday }: PaymentScheduleValueProps) {
  if (date === null) return <span className={styles.muted}>—</span>;
  return (
    <>
      <span>
        <span className={styles.nowrap}>{date}</span>
        {manual ? (
          <>
            {" "}
            <StatusTag status="수동 지정" variant="text" />
          </>
        ) : pushReason === "cutoff" ? (
          <>
            {" "}
            <StatusTag status="마감 지나 밀림" variant="text" />
          </>
        ) : (
          <span className={styles.muted}>{" (자동)"}</span>
        )}
      </span>
      {ruleLine ? <span className={`${styles.subLine} ${styles.muted}`}>{ruleLine}</span> : null}
      {manual && autoDate ? <span className={`${styles.subLine} ${styles.muted}`}>{`자동 계산 ${autoDate.slice(5)}`}</span> : null}
      {offWeekday ? <span className={styles.drift}>{offWeekday}</span> : null}
    </>
  );
}

// 희망 지급일 · 희망 사유(기안자가 적은 값 — 있을 때만 줄이 선다). 지급 예정일 줄 바로 앞(지급 섹션 없는 문서는 expense-document.tsx가 같은 두 줄).
function requestedPaymentItems(requested: { date: string | null; reason: string | null }): KvItem[] {
  const items: KvItem[] = [];
  if (requested.date) items.push({ label: "희망 지급일", value: requested.date });
  if (requested.reason) items.push({ label: "희망 사유", value: <span className={styles.subLine}>{requested.reason}</span> });
  return items;
}

const AUTO_FAILED = "결과를 받지 못함 · 새로 고침";

export function PaymentFields({
  paymentMethod,
  paymentMethodName,
  scheduledPaymentDate,
  scheduleValueProps,
  requested,
}: {
  paymentMethod: string | null;
  paymentMethodName: string | null;
  scheduledPaymentDate: string | null;
  scheduleValueProps: PaymentScheduleValueProps;
  requested: { date: string | null; reason: string | null };
}) {
  const router = useRouter();
  const { view, fields, setFields, preview, previewing, refreshPreview, fieldErrors, setFieldErrors, schedule, setSchedule } = usePaymentPanel();
  const dash = <span className={styles.muted}>—</span>;
  const paid = view.row?.row === "P6";
  const canPay = view.row?.primary === "pay";
  const label = transferLabel(paymentMethod);
  // N4 — `자동으로 되돌리기` 결과 줄(되돌릴 수동 값 · 응답 version) · 거부 사유. 다음 제자리 행동까지 남는다(토스트 없음).
  const [autoResult, setAutoResult] = useState<{ before: string; version: number } | null>(null);
  const [autoError, setAutoError] = useState<string | null>(null);
  const [autoPending, setAutoPending] = useState(false);
  // 응답 뒤(비동기) 상태로 그린 버튼은 그린 뒤에 포커스한다 — rAF가 렌더보다 먼저 돌면 포커스가 body로 빠진다(inbox-list와 같은 꼴).
  const focusAfterRef = useRef<"undo" | "edit" | null>(null);
  useEffect(() => {
    const target = focusAfterRef.current;
    if (target === null) return;
    document.getElementById(target === "undo" ? "payment-schedule-undo" : "payment-schedule-edit")?.focus();
    focusAfterRef.current = null;
  }, [autoResult]);

  // 3차 `지급 예정일 바꾸기`는 지급 전 지급 권한자에게만(P3 · P4 — 1차가 `지급 완료`인 행). 열면 그 행이 제자리 날짜 칸이 된다.
  function openSchedule() {
    setAutoResult(null);
    setAutoError(null);
    setSchedule({ original: scheduledPaymentDate ?? "", value: scheduledPaymentDate ?? "" });
    requestAnimationFrame(() => document.getElementById("payment-scheduled-date")?.focus());
  }
  function closeSchedule() {
    setSchedule(null);
    requestAnimationFrame(() => document.getElementById("payment-schedule-edit")?.focus());
  }

  // null 저장 = 자동 계산 복귀(07-06 saveScheduledPayDate). 확인 창 없이 → 값 바로 아래 결과 줄 + `되돌리기`(포커스).
  async function saveAuto(date: string | null, version: number): Promise<{ version: number } | null> {
    if (autoPending || view.expenseId === undefined) return null;
    setAutoPending(true);
    setAutoError(null);
    let response: Awaited<ReturnType<typeof saveScheduledPayDateAction>> | undefined;
    try {
      response = await saveScheduledPayDateAction({ expenseId: view.expenseId, scheduledPayDate: date, version });
    } catch {
      response = undefined;
    }
    setAutoPending(false);
    router.refresh();
    if (!response?.data) {
      setAutoError(response?.serverError ?? response?.validationErrors?.scheduledPayDate?._errors?.[0] ?? AUTO_FAILED);
      return null;
    }
    refreshPreview();
    return response.data;
  }
  async function revertToAuto() {
    if (scheduledPaymentDate === null || view.version === undefined) return;
    const before = scheduledPaymentDate;
    const saved = await saveAuto(null, view.version);
    if (!saved) return;
    focusAfterRef.current = "undo";
    setAutoResult({ before, version: saved.version });
  }
  async function undoAuto() {
    if (!autoResult) return;
    const saved = await saveAuto(autoResult.before, autoResult.version);
    if (!saved) return;
    focusAfterRef.current = "edit";
    setAutoResult(null);
  }

  const scheduleValue = (
    <>
      <PaymentScheduleValue {...scheduleValueProps} />
      {view.row?.ownerNote ? <span className={`${styles.subLine} ${styles.muted}`}>{view.row.ownerNote}</span> : null}
      {autoResult ? (
        <span role="status" className={styles.subLine}>
          {"자동 계산으로 복귀 · "}
          <Button id="payment-schedule-undo" variant="tertiary" pending={autoPending} onClick={() => void undoAuto()}>
            되돌리기
          </Button>
        </span>
      ) : null}
      {autoError ? <span className={`${styles.subLine} ${styles.blockedReason}`}>{autoError}</span> : null}
    </>
  );
  const items: KvItem[] = [...requestedPaymentItems(requested)];
  if (!(canPay && schedule)) {
    items.push({
      label: "지급 예정일",
      value: canPay ? (
        <span className={`${styles.valueRow} ${styles.scheduleRow}`}>
          <span className={styles.fill}>{scheduleValue}</span>
          <span>
            {scheduleValueProps.manual && !autoResult ? (
              <Button variant="tertiary" pending={autoPending} onClick={() => void revertToAuto()}>
                자동으로 되돌리기
              </Button>
            ) : null}
            <Button id="payment-schedule-edit" variant="tertiary" onClick={openSchedule}>
              지급 예정일 바꾸기
            </Button>
          </span>
        </span>
      ) : (
        scheduleValue
      ),
    });
  }
  items.push({ label: "지급 방식", value: paymentMethodName ?? dash });
  // 06-20(O-17) — 계좌 행은 지급 보기에 account 키가 있을 때만(지급 권한자 · 계좌이체). 값 꼴은 S1 지급 방식 칸과 같다.
  if (view.account) items.push({ label: "계좌", value: <PaymentAccountValue account={view.account} /> });
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
  // 지급 총액을 못 보는 지급 권한자 — 1차가 막히고(AMOUNT_HIDDEN) 비교할 값도 없어 이체액 칸을 그리지 않는다(할 수 없는 선택지는 숨김 · DOM 감사 O1).
  const amountHidden = view.row?.blockReason === AMOUNT_HIDDEN;
  const needReason = diffReasonNeeded(fields, preview);

  return (
    <>
      {canPay && schedule ? (
        <ScheduleField
          expenseId={view.expenseId}
          schedule={schedule}
          onChange={(value) => setSchedule({ ...schedule, value, error: undefined })}
          onClose={closeSchedule}
        />
      ) : null}
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
              // 06.5 D-6518(UI-SPEC V13): 고르기는 서버가 내려준 KST 오늘까지(지급 전 view.payDate = 오늘). 손으로 친 미래 값은 서버 미리보기가 칸 오류로 막는다 — 화면은 먼저 비교하지 않는다.
              max={view.payDate}
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
          {amountHidden ? null : (
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
          )}
          {needReason && !amountHidden ? (
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
