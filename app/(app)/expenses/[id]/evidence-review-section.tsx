"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { PaymentViewDto } from "@/domain/payments";
import { EVIDENCE_AMOUNT_FRACTION, EVIDENCE_AMOUNT_NOT_NUMBER } from "@/domain/payments/action-row";
import { Button } from "@/ui/button/Button";
import { Form } from "@/ui/form/Form";
import { KvList, type KvItem } from "@/ui/kv-list/KvList";
import { Num } from "@/ui/num/Num";
import { StatusTag } from "@/ui/status-tag/StatusTag";
import { useCommaInput } from "@/ui/input/use-comma-input";
import { numberInputRejectionReason } from "@/lib/format-number";
import { previewPayableAction } from "./actions";
import { usePaymentPanel } from "./payment-section";
import { TaxParts, type TaxPart } from "./tax-parts";
import styles from "./expense.module.css";

// 06-06(UI-SPEC S4 · D-601 · D-602 · O-2): 결재 통과 문서의 「증빙」 섹션 확인부 — 05 첨부 영역 아래 `증빙 금액` · `확인` 두 행.
// 값은 서버 DTO(getPaymentView)만 그린다 — 상태 낱말은 resolveEvidenceStatus, 부가세 · 지급 총액 · 초과 차액은 서버 값(previewPayable),
// 1차 `증빙 확인`은 행동 줄(payment-action-row.tsx)이 서버 행으로 세우고 이 칸의 값을 함께 보낸다(SP-3 ① — 칸 옆 저장 버튼 없음).
// 금액 칸 · 정보 항목이 안 보이면(project가 칸을 뺀다) 그 행을 그리지 않는다.

type PaymentView = Partial<PaymentViewDto>;

// 증빙 금액 칸 — 3차 `바꾸기`로 열거나(P2 · P5) 빈 금액(F2)이면 처음부터 열린다. raw는 쉼표를 뗀 칸 글자.
export type EvidenceEdit = { raw: string; inputError: string | null; error: string | null };

type EvidenceEditState = { edit: EvidenceEdit | null; setEdit: (next: EvidenceEdit | null) => void };

const EvidenceEditContext = createContext<EvidenceEditState | null>(null);

export function EvidenceEditProvider({ children }: { children: ReactNode }) {
  const [edit, setEdit] = useState<EvidenceEdit | null>(null);
  return <EvidenceEditContext.Provider value={{ edit, setEdit }}>{children}</EvidenceEditContext.Provider>;
}

export function useEvidenceEdit(): EvidenceEditState {
  const state = useContext(EvidenceEditContext);
  if (!state) throw new Error("EvidenceEditProvider 밖");
  return state;
}

export const EVIDENCE_FIELD_ID = "evidence-amount";

// 칸 상태 → 1차가 보낼 값. 열림 = 지급 권한자의 확인 전(P2 · P5)이고 `바꾸기`를 눌렀거나 증빙 금액이 비었다(F2).
// corrected는 서버 값과 다를 때만(같으면 금액 없는 확인).
export function evidenceAmountInput(view: PaymentView, edit: EvidenceEdit | null) {
  const canConfirm = view.row?.primary === "confirm";
  const open = canConfirm && (edit !== null || view.evidenceAmountKrw === null);
  const raw = edit?.raw ?? "";
  const value = /^\d+$/.test(raw) ? Number(raw) : null;
  const corrected = open && value !== null && value !== view.evidenceAmountKrw ? value : undefined;
  return { open, raw, value, corrected, fieldError: edit?.inputError ?? edit?.error ?? null };
}

const FRACTION_REASON = numberInputRejectionReason("krw", "krw-fraction");

function AmountInput({ initial, error, onChange, onEscape }: { initial: string; error: string | null; onChange: (raw: string, inputError: string | null) => void; onEscape: () => void }) {
  const { inputRef, value, onChange: onInputChange, error: inputError, rawValue } = useCommaInput("krw", initial);
  const reported = useRef(rawValue);
  useEffect(() => {
    if (reported.current === rawValue && inputError === null) return;
    reported.current = rawValue;
    onChange(rawValue, inputError === null ? null : inputError === FRACTION_REASON ? EVIDENCE_AMOUNT_FRACTION : EVIDENCE_AMOUNT_NOT_NUMBER);
    // onChange는 렌더마다 새 함수 — 칸 값의 변화만 본다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawValue, inputError]);
  return (
    <input
      id={EVIDENCE_FIELD_ID}
      ref={inputRef}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      className={`${styles.textInput} ${styles.numeric}`}
      value={value}
      onChange={onInputChange}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.preventDefault();
        if (event.key === "Escape") {
          event.preventDefault();
          onEscape();
        }
      }}
      aria-invalid={error ? true : undefined}
      aria-describedby={[error ? `${EVIDENCE_FIELD_ID}-error` : "", `${EVIDENCE_FIELD_ID}-hint`].filter(Boolean).join(" ")}
    />
  );
}

// 경고 한 줄(Q-F) — 서버 글자의 숫자 조각만 700, 묶음(` · ` 사이) 안은 꺾지 않는다.
// stale — 미리보기가 오는 동안 이전 값은 `--text-faint`(.drift가 자기 색을 정하므로 같은 요소에 건다 — 06-06 DOM 감사 D-2).
function WarningLine({ text, testId, stale = false }: { text: string; testId: string; stale?: boolean }) {
  return (
    <span className={stale ? `${styles.drift} ${styles.stale}` : styles.drift} data-testid={testId}>
      {text.split(" · ").map((segment, index) => (
        <span key={index}>
          {index > 0 ? " · " : null}
          <span className={styles.taxSegment}>
            {segment.split(/([+-]?\d[\d,]*)/).map((piece, pieceIndex) =>
              pieceIndex % 2 === 1 ? (
                <span key={pieceIndex} className={styles.strong}>
                  <Num value={piece} />
                </span>
              ) : (
                piece
              ),
            )}
          </span>
        </span>
      ))}
    </span>
  );
}

type Preview = { amount: number; taxLine: TaxPart[] | null; overrun: string | null };

export function EvidenceReviewBlock() {
  const { view, fields } = usePaymentPanel();
  const { edit, setEdit } = useEvidenceEdit();
  const dash = <span className={styles.muted}>—</span>;
  const input = evidenceAmountInput(view, edit);
  const paidRow = view.row?.row === "P5" || view.row?.row === "P6";
  const serverAmount = view.evidenceAmountKrw ?? null;

  // 고치는 동안 서버가 새 금액으로 다시 셈한 계산 한 줄 · 초과 한 줄. 오는 동안 이전 값은 `--text-faint`(빈칸 · 뼈대 없음 — S4 loading).
  const [preview, setPreview] = useState<Preview | null>(null);
  const wanted = input.open && input.value !== null && input.value > 0 && input.value !== serverAmount ? input.value : null;
  const payDate = fields.payDate || view.payDate || "";
  useEffect(() => {
    if (wanted === null || view.expenseId === undefined || payDate === "") return;
    const expenseId = view.expenseId;
    let cancelled = false;
    const timer = setTimeout(() => {
      void (async () => {
        let result: Awaited<ReturnType<typeof previewPayableAction>> | undefined;
        try {
          result = await previewPayableAction({ expenseId, payDate, evidenceAmountKrw: wanted });
        } catch {
          result = undefined;
        }
        if (cancelled || !result?.data) return;
        setPreview({ amount: wanted, taxLine: result.data.evidenceTaxLine ?? null, overrun: result.data.evidenceOverrun ?? null });
      })();
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [wanted, view.expenseId, payDate]);
  const usePreview = wanted !== null && preview !== null;
  const stale = wanted !== null && preview?.amount !== wanted;
  // 지급 뒤(P5 · P6) 문서에는 서버 계산 한 줄이 없다(지급 총액은 S5 지급 기록 하나 — 「표시 — 증빙 금액」).
  const taxLine = paidRow ? null : usePreview ? preview.taxLine : (view.evidenceTaxLine ?? null);
  const overrun = usePreview ? preview.overrun : (view.evidenceOverrun ?? null);

  // F2 — 빈 금액으로 열린 칸이 첫 포커스.
  const focusedRef = useRef(false);
  useEffect(() => {
    if (focusedRef.current || !input.open || serverAmount !== null) return;
    focusedRef.current = true;
    document.getElementById(EVIDENCE_FIELD_ID)?.focus();
  }, [input.open, serverAmount]);

  function openEdit() {
    setEdit({ raw: serverAmount === null ? "" : String(serverAmount), inputError: null, error: null });
    requestAnimationFrame(() => document.getElementById(EVIDENCE_FIELD_ID)?.focus());
  }
  // Esc — 칸을 서버 값으로 되돌리고 닫는다(F2 빈 금액이면 빈 칸으로 다시 — 칸은 열린 채 포커스 유지).
  const [resetKey, setResetKey] = useState(0);
  function closeEdit() {
    setEdit(null);
    setPreview(null);
    setResetKey((key) => key + 1);
    requestAnimationFrame(() => document.getElementById(serverAmount === null ? EVIDENCE_FIELD_ID : "evidence-amount-edit")?.focus());
  }

  const lines = (
    <>
      {taxLine ? (
        <span className={`${styles.taxLine} ${stale ? styles.stale : ""}`} data-testid="evidence-tax-line">
          <TaxParts parts={taxLine} />
        </span>
      ) : null}
      {overrun ? <WarningLine text={overrun} testId="evidence-overrun" stale={stale} /> : null}
    </>
  );

  const items: KvItem[] = [];
  const amount = view.evidenceAmountDisplay;
  if (amount !== undefined && !input.open) {
    const shown = (
      <>
        {amount.valueKrw === null ? dash : <Num value={amount.valueKrw} />}
        {amount.valueKrw !== null && amount.enteredByName ? (
          <span className={`${styles.subLine} ${styles.muted}`} data-testid="evidence-amount-by">
            {[amount.enteredByName, amount.enteredAt].filter(Boolean).join(" ")}
          </span>
        ) : null}
      </>
    );
    items.push({
      label: "증빙 금액",
      value: (
        <>
          {view.row?.tertiary === "change" ? (
            <span className={styles.valueRow}>
              <span className={styles.fill}>{shown}</span>
              <Button id="evidence-amount-edit" variant="tertiary" onClick={openEdit}>
                바꾸기
              </Button>
            </span>
          ) : (
            shown
          )}
          {lines}
        </>
      ),
    });
  }

  const status = view.evidenceStatus;
  if (status !== undefined) {
    // 증빙 필수 off의 증빙 없음은 상태 낱말이 아니라 빈 값 `—`(UI-SPEC rev 10).
    const word = status === "증빙 없음" && view.evidenceRequired === false ? null : status;
    const review = view.reviewLine ?? null;
    const amounts = view.reviewAmounts ?? null;
    const due = view.prepaidDue ?? null;
    let second: ReactNode = null;
    if (status === "확인됨" && review) {
      second = (
        <>
          {`${review.byName} ${review.at}`}
          {amounts ? (
            <>
              {" · "}
              <span className={styles.taxSegment}>
                <Num value={amounts.beforeKrw} /> → <Num value={amounts.afterKrw} />
              </span>
            </>
          ) : null}
        </>
      );
    } else if (status === "면제" && review) {
      second = [`${review.byName} ${review.at.slice(0, 5)}`, review.waiveReason].filter(Boolean).join(" · ");
    } else if (status === "확인 전" && view.row?.primary !== "confirm") {
      // 지급 권한 없는 사람 — 버튼 대신 담당 표기(D-601).
      second = "확인은 경영관리";
    }
    items.push({
      label: "확인",
      value: (
        <>
          {word ? <StatusTag status={word} variant="text" /> : dash}
          {second ? (
            <span className={`${styles.subLine} ${styles.muted}`} data-testid="evidence-review-line">
              {second}
            </span>
          ) : null}
          {status === "선결제" && due ? (
            due.overdueDays > 0 ? (
              <span className={styles.drift} data-testid="evidence-prepaid-due">
                증빙 {due.overdueDays}일 경과
              </span>
            ) : (
              <span className={`${styles.subLine} ${styles.muted}`} data-testid="evidence-prepaid-due">
                증빙 기한 {due.dueOn.slice(5)}
              </span>
            )
          ) : null}
        </>
      ),
    });
  }

  const showHint = input.open && serverAmount !== null && input.value !== null && input.value !== serverAmount;
  return (
    <div data-testid="evidence-review">
      {input.open && amount !== undefined ? (
        <Form
          aria-label="증빙 금액"
          onSubmit={(event) => {
            event.preventDefault();
          }}
        >
          <Form.Field id={EVIDENCE_FIELD_ID} label="증빙 금액" width="short">
            <AmountInput
              key={resetKey}
              initial={input.raw}
              error={input.fieldError ?? null}
              onChange={(raw, inputError) => setEdit({ raw, inputError, error: null })}
              onEscape={closeEdit}
            />
            {input.fieldError ? <Form.Error id={`${EVIDENCE_FIELD_ID}-error`}>{input.fieldError}</Form.Error> : null}
            <div id={`${EVIDENCE_FIELD_ID}-hint`}>
              {showHint ? (
                <Form.Hint>
                  <span className={styles.taxSegment} data-testid="evidence-amount-hint">
                    확인하면 <Num value={serverAmount} /> → <Num value={input.value} />
                  </span>
                </Form.Hint>
              ) : null}
              {lines}
            </div>
          </Form.Field>
        </Form>
      ) : null}
      {items.length > 0 ? <KvList items={items} /> : null}
    </div>
  );
}

// 06-10(EXP-13 · O-4): 선결제 문서의 읽기 줄 `선결제 사유` — 제출 뒤 문서 화면 증빙 섹션. 원문 전문(`keep-all`, 말줄임 없음).
// 선결제 낱말 · 기한 2행은 확인부(EvidenceReviewBlock)가 그린다. 면제된 선결제 문서도 사유는 그대로 남는다.
export function PrepaidReasonLine({ reason }: { reason: string | null | undefined }) {
  if (!reason) return null;
  return <KvList items={[{ label: "선결제 사유", value: <span className={styles.fill} data-testid="prepaid-reason">{reason}</span> }]} />;
}
