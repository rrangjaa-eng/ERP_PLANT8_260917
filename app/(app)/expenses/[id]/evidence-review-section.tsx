"use client";

import { createContext, useContext, useEffect, useId, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { useRouter } from "next/navigation";
import type { PaymentViewDto } from "@/domain/payments";
import { CANCEL_REASON_REQUIRED, SUPPLY_PAID_LOCKED_LINE } from "@/domain/payments/action-row";
import { ConfirmDialog } from "@/ui/confirm-dialog/ConfirmDialog";
import { Button } from "@/ui/button/Button";
import { Form } from "@/ui/form/Form";
import { KvList, type KvItem } from "@/ui/kv-list/KvList";
import { Num } from "@/ui/num/Num";
import { StatusTag } from "@/ui/status-tag/StatusTag";
import { useCommaInput } from "@/ui/input/use-comma-input";
import { parseNumberInput } from "@/lib/format-number";
import dialogStyles from "@/app/(app)/approvals/decision-dialogs.module.css";
import { previewPayableAction, waiveEvidenceAction } from "./actions";
import { usePaymentPanel } from "./payment-section";
import { TaxParts, type TaxPart } from "./tax-parts";
import styles from "./expense.module.css";

// 06-06(UI-SPEC S4 · D-601 · D-602 · O-2): 결재 통과 문서의 「증빙」 섹션 확인부 — 05 첨부 영역 아래 `공급가액` · `확인` 두 행.
// 값은 서버 DTO(getPaymentView)만 그린다 — 상태 낱말은 resolveEvidenceStatus, 부가세 · 지급 총액은 서버 값(previewPayable),
// 1차(`공급가액과 같음` / `공급가액 고쳐 확인`)는 행동 줄(payment-action-row.tsx)이 서버 행으로 세우고 이 칸의 값을 함께 보낸다(SP-3 ① — 칸 옆 저장 버튼 없음).
// 06.5 D-6520(UI-SPEC V8 개정 4판): 금액은 문서 공급가액 하나 — 지급 전 · 확인 전(P2) 지급 권한자만 3차 `바꾸기`로 고침 칸을 열고, 지급 뒤(P5)에는 그 자리에 잠김 줄.
// 금액을 못 보는 사람(공급가가 투영에서 빠짐)에게는 `공급가액` 행이 없다.

type PaymentView = Partial<PaymentViewDto>;

// 문서 공급가(문서 DTO의 supply — 문서 통화 금액 · 환율 · 원화 환산액).
export type DocSupply = { currency: string; amount: number; fxRate: number; amountKrw: number };

// 공급가액 고침 칸 — 3차 `바꾸기`(P2)로 연다. raw는 쉼표를 뗀 칸 글자, inputError는 칸이 거절한 입력(기안자 칸과 같은 문구), error는 서버 칸 오류.
export type EvidenceEdit = { raw: string; inputError: string | null; error: string | null };

type EvidenceEditState = { edit: EvidenceEdit | null; setEdit: Dispatch<SetStateAction<EvidenceEdit | null>>; supply: DocSupply | null };

const EvidenceEditContext = createContext<EvidenceEditState | null>(null);

export function EvidenceEditProvider({ supply, children }: { supply: DocSupply | null; children: ReactNode }) {
  const [edit, setEdit] = useState<EvidenceEdit | null>(null);
  return <EvidenceEditContext.Provider value={{ edit, setEdit, supply }}>{children}</EvidenceEditContext.Provider>;
}

export function useEvidenceEdit(): EvidenceEditState {
  const state = useContext(EvidenceEditContext);
  if (!state) throw new Error("EvidenceEditProvider 밖");
  return state;
}

export const CORRECTED_SUPPLY_ID = "corrected-supply";

// 칸 상태 → 1차가 보낼 값. 열림 = 지급 권한자의 지급 전 · 확인 전(P2)이고 `바꾸기`를 눌렀다. corrected는 지금 공급가(문서 통화)와 다를 때만
// (같으면 고침 없는 확인 — 1차 글자도 `공급가액과 같음`).
export function correctedSupplyInput(view: PaymentView, edit: EvidenceEdit | null, supply: DocSupply | null) {
  const open = view.row?.primary === "confirm" && view.row.tertiary === "change" && supply !== null && edit !== null;
  const raw = open ? (edit?.raw ?? "") : "";
  const value = open ? parseNumberInput(raw) : null;
  const corrected = open && value !== null && Number.isFinite(value) && value !== supply?.amount ? value : undefined;
  return { open, raw, value, corrected, fieldError: open ? (edit?.inputError ?? edit?.error ?? null) : null };
}

function SupplyInput({
  currency,
  initial,
  error,
  describedBy,
  onChange,
  onEscape,
}: {
  currency: string;
  initial: string;
  error: string | null;
  describedBy: string | undefined;
  onChange: (raw: string, inputError: string | null) => void;
  onEscape: () => void;
}) {
  const { inputRef, value, onChange: onInputChange, error: inputError, rawValue } = useCommaInput(currency === "KRW" ? "krw" : "foreign", initial);
  const reported = useRef(rawValue);
  useEffect(() => {
    if (reported.current === rawValue && inputError === null) return;
    reported.current = rawValue;
    onChange(rawValue, inputError);
    // onChange는 렌더마다 새 함수 — 칸 값의 변화만 본다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawValue, inputError]);
  return (
    <input
      id={CORRECTED_SUPPLY_ID}
      ref={inputRef}
      type="text"
      inputMode={currency === "KRW" ? "numeric" : "decimal"}
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
      aria-describedby={describedBy}
    />
  );
}

// 문서 통화 금액 한 묶음 — 원화 `12,400,000` · 외화 `USD 1,000.00`(힌트 · UI-SPEC V8 「외화 문서」).
function DocAmount({ currency, amount }: { currency: string; amount: number }) {
  return currency === "KRW" ? <Num value={amount} /> : <Num value={amount} currency={currency} />;
}

type Preview = { amount: number; taxLine: TaxPart[] | null };

const WAIVE_FAILED = "결과를 받지 못함 · 새로 고침";

// 06-10(D-603 · D-611 · UI-SPEC 「Destructive — 증빙 면제(S4)」): 증빙 면제 확인 모달 — 사유 한 칸 필수. 결과 줄은 지급 전후 · 선결제로 갈린다(서버가 준 사실).
// 서버 거부(동시성 · 증빙 있음 · 이미 면제)는 1차 옆 막힘 자리에 서고 창은 닫히지 않으며 사유는 남는다. 응답이 없으면 다시 보내면 되는 실패 한 줄.
function WaiveEvidenceDialog({
  open,
  onClose,
  expenseId,
  version,
  subtitle,
  resultLines,
  onWaived,
}: {
  open: boolean;
  onClose: () => void;
  expenseId: string;
  version: number;
  subtitle: string;
  resultLines: string[];
  onWaived: () => void;
}) {
  const router = useRouter();
  const fieldId = useId();
  const [reason, setReason] = useState("");
  const [serverError, setServerError] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | undefined>(undefined);
  const [pending, setPending] = useState(false);
  const submittingRef = useRef(false);

  function close() {
    setReason("");
    setServerError(null);
    setFailure(undefined);
    onClose();
  }

  const trimmed = reason.trim();
  const blocked = serverError ?? (trimmed === "" ? CANCEL_REASON_REQUIRED : undefined);

  async function confirm() {
    if (submittingRef.current || blocked) return;
    submittingRef.current = true;
    setPending(true);
    setFailure(undefined);
    let response: Awaited<ReturnType<typeof waiveEvidenceAction>> | undefined;
    try {
      response = await waiveEvidenceAction({ expenseId, version, reason: trimmed });
    } catch {
      response = undefined;
    }
    submittingRef.current = false;
    setPending(false);
    if (response?.data) {
      setReason("");
      onWaived();
      return;
    }
    const message = response?.serverError ?? response?.validationErrors?.reason?._errors?.[0];
    if (message) setServerError(message);
    else setFailure(WAIVE_FAILED);
    // 서버 거부 뒤 문서를 다시 읽는다 — 다음 시도가 새 version을 보낸다(지급 취소 모달과 같은 꼴).
    if (response?.serverError) router.refresh();
  }

  return (
    <ConfirmDialog
      open={open}
      onClose={close}
      title="증빙 면제"
      subtitle={subtitle}
      resultLines={resultLines}
      evidenceField={
        <div className={dialogStyles.reason}>
          <label htmlFor={fieldId}>사유</label>
          <textarea
            id={fieldId}
            rows={2}
            maxLength={480}
            autoComplete="off"
            value={reason}
            aria-disabled={pending ? "true" : undefined}
            readOnly={pending}
            onChange={(event) => {
              setReason(event.target.value);
              setServerError(null);
            }}
          />
        </div>
      }
      primary={{
        label: "증빙 면제",
        shortcut: "Ctrl+Enter",
        pending,
        onConfirm: () => void confirm(),
        disabledReason: blocked,
        failure,
      }}
    />
  );
}

export function EvidenceReviewBlock({ waiveSubtitle = "" }: { waiveSubtitle?: string }) {
  const router = useRouter();
  const { view, fields } = usePaymentPanel();
  const [waiveOpen, setWaiveOpen] = useState(false);
  const justWaivedRef = useRef(false);
  const { edit, setEdit, supply } = useEvidenceEdit();
  const dash = <span className={styles.muted}>—</span>;
  const input = correctedSupplyInput(view, edit, supply);
  const paidRow = view.row?.row === "P5" || view.row?.row === "P6";

  // 고치는 동안 서버가 새 공급가(문서 통화)로 다시 셈한 계산 한 줄. 오는 동안 이전 값은 `--text-faint`(빈칸 · 뼈대 없음 — S4 loading).
  // 미리보기가 상한을 넘으면 같은 문구의 칸 오류가 미리 선다(그사이 칸 값이 바뀌었으면 버린다).
  const [preview, setPreview] = useState<Preview | null>(null);
  const wanted = input.corrected !== undefined && input.corrected > 0 ? input.corrected : null;
  const payDate = fields.payDate || view.payDate || "";
  useEffect(() => {
    if (wanted === null || view.expenseId === undefined || payDate === "") return;
    const expenseId = view.expenseId;
    let cancelled = false;
    const timer = setTimeout(() => {
      void (async () => {
        let result: Awaited<ReturnType<typeof previewPayableAction>> | undefined;
        try {
          result = await previewPayableAction({ expenseId, payDate, correctedSupplyAmount: wanted });
        } catch {
          result = undefined;
        }
        if (cancelled) return;
        const capError = result?.validationErrors?.correctedSupplyAmount?._errors?.[0];
        if (capError) {
          setEdit((prev) => (prev && parseNumberInput(prev.raw) === wanted ? { ...prev, error: capError } : prev));
          return;
        }
        if (!result?.data) return;
        setPreview({ amount: wanted, taxLine: result.data.evidenceTaxLine ?? null });
      })();
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [wanted, view.expenseId, payDate, setEdit]);
  const usePreview = wanted !== null && preview !== null;
  const stale = wanted !== null && preview?.amount !== wanted;
  // 지급 뒤(P5 · P6) 문서에는 서버 계산 한 줄이 없다(지급 총액은 S5 지급 기록 하나).
  const taxLine = paidRow ? null : usePreview ? preview.taxLine : (view.evidenceTaxLine ?? null);

  // 면제 뒤 다시 읽은 행의 새 1차(P4 `지급 완료`)로 포커스 — 1차가 없으면(P6) 결과 글자로. 누른 3차가 사라져 body로 빠지지 않게(토스트 없음).
  const waivedNow = view.evidenceStatus === "면제";
  useEffect(() => {
    if (!justWaivedRef.current || !waivedNow) return;
    justWaivedRef.current = false;
    // 결과 글자가 있으면(P6) 그쪽 — 고정 줄에 남은 버튼은 2차 `지급 취소`뿐이다(DOM 감사 D-1).
    const next = document.querySelector<HTMLElement>('[data-testid="payment-result"]') ?? document.querySelector<HTMLElement>("[data-fixed-bar] button:not([disabled])");
    next?.focus();
  }, [waivedNow]);

  // `바꾸기` — 값 = 지금 공급가액(문서 통화) · 포커스 · 전체 선택.
  function openEdit() {
    if (!supply) return;
    setEdit({ raw: String(supply.amount), inputError: null, error: null });
    requestAnimationFrame(() => {
      const field = document.getElementById(CORRECTED_SUPPLY_ID);
      if (field instanceof HTMLInputElement) {
        field.focus();
        field.select();
      }
    });
  }
  // Esc — 칸을 서버 값으로 되돌려 닫고 포커스를 `바꾸기`로.
  function closeEdit() {
    setEdit(null);
    setPreview(null);
    requestAnimationFrame(() => document.getElementById("corrected-supply-edit")?.focus());
  }

  const lines = taxLine ? (
    <span className={`${styles.taxLine} ${stale ? styles.stale : ""}`} data-testid="evidence-tax-line">
      <TaxParts parts={taxLine} />
    </span>
  ) : null;

  const items: KvItem[] = [];
  if (supply && !input.open) {
    const shown = <Num value={supply.amountKrw} fx={supply.currency === "KRW" ? undefined : { currency: supply.currency, amount: supply.amount, rate: supply.fxRate }} />;
    const canChange = view.row?.primary === "confirm" && view.row.tertiary === "change";
    // P5(지급 뒤 · 확인 전) 지급 권한자 — `바꾸기` 자리에 잠김 줄(상태이지 오류가 아니다 · 칠하지 않음). P6 · 그 밖의 사람에게는 없다.
    const locked = view.row?.row === "P5" && view.row.primary === "confirm";
    items.push({
      label: "공급가액",
      value: (
        <>
          {canChange ? (
            <span className={styles.valueRow}>
              <span className={styles.fill}>{shown}</span>
              <Button id="corrected-supply-edit" variant="tertiary" aria-label="공급가액 바꾸기" onClick={openEdit}>
                바꾸기
              </Button>
            </span>
          ) : (
            shown
          )}
          {locked ? (
            <span className={`${styles.subLine} ${styles.muted}`} data-testid="supply-locked-line">
              {SUPPLY_PAID_LOCKED_LINE}
            </span>
          ) : null}
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
    // S4 empty(P3 — 결재 통과 · 지급 전 · 증빙 필수 on · 증빙 0 · 선결제 아님 · 면제 아님): 증빙 줄은 서버 이유 글자 `증빙 없음 · 기안자 {이름}`(danger)다.
    const emptyLine = view.row?.row === "P3" && status === "증빙 없음" ? (view.row.blockReason ?? null) : null;
    const canWaive = view.row?.tertiary === "waive" && view.expenseId !== undefined && view.version !== undefined;
    const reviewValue = (
      <>
        {emptyLine ? (
          <span className={styles.blockedReason} data-testid="evidence-empty-line">
            {emptyLine}
          </span>
        ) : word ? (
          <StatusTag status={word} variant="text" />
        ) : (
          dash
        )}
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
    );
    items.push({
      label: "확인",
      value: canWaive ? (
        <span className={styles.valueRow}>
          <span className={styles.fill}>{reviewValue}</span>
          <Button id="evidence-waive" variant="tertiary" onClick={() => setWaiveOpen(true)}>
            증빙 면제
          </Button>
        </span>
      ) : (
        reviewValue
      ),
    });
  }

  const waiveResultLines = [
    view.row?.row === "P6" ? "지급 기록 그대로 · 비용은 승인액 그대로" : "증빙 없이 지급 · 비용은 승인액 그대로",
    ...(view.evidenceStatus === "선결제" ? ["선결제 증빙 기한 없어짐"] : []),
  ];
  const showHint = input.corrected !== undefined && input.fieldError === null && supply !== null;
  const describedBy = [input.fieldError ? `${CORRECTED_SUPPLY_ID}-error` : "", showHint ? `${CORRECTED_SUPPLY_ID}-hint` : ""].filter(Boolean).join(" ") || undefined;
  return (
    <>
      <div data-testid="evidence-review">
        {input.open && supply ? (
          <Form
            aria-label="공급가액"
            onSubmit={(event) => {
              event.preventDefault();
            }}
          >
            <Form.Field id={CORRECTED_SUPPLY_ID} label="공급가액" width="short">
              <SupplyInput
                currency={supply.currency}
                initial={input.raw}
                error={input.fieldError}
                describedBy={describedBy}
                onChange={(raw, inputError) => setEdit({ raw, inputError, error: null })}
                onEscape={closeEdit}
              />
              {input.fieldError ? <Form.Error id={`${CORRECTED_SUPPLY_ID}-error`}>{input.fieldError}</Form.Error> : null}
              {showHint && input.corrected !== undefined ? (
                <div id={`${CORRECTED_SUPPLY_ID}-hint`}>
                  <Form.Hint>
                    <span className={styles.taxSegment}>
                      확인하면 <DocAmount currency={supply.currency} amount={supply.amount} /> → <DocAmount currency={supply.currency} amount={input.corrected} />
                    </span>
                  </Form.Hint>
                </div>
              ) : null}
              {lines}
            </Form.Field>
          </Form>
        ) : null}
        {items.length > 0 ? <KvList items={items} /> : null}
      </div>
      {view.row?.tertiary === "waive" && view.expenseId !== undefined && view.version !== undefined ? (
        <WaiveEvidenceDialog
          open={waiveOpen}
          onClose={() => setWaiveOpen(false)}
          expenseId={view.expenseId}
          version={view.version}
          subtitle={waiveSubtitle}
          resultLines={waiveResultLines}
          onWaived={() => {
            justWaivedRef.current = true;
            setWaiveOpen(false);
            router.refresh();
          }}
        />
      ) : null}
    </>
  );
}

// 06-10(EXP-13 · O-4): 선결제 문서의 읽기 줄 `선결제 사유` — 제출 뒤 문서 화면 증빙 섹션. 원문 전문(`keep-all`, 말줄임 없음).
// 선결제 낱말 · 기한 2행은 확인부(EvidenceReviewBlock)가 그린다. 면제된 선결제 문서도 사유는 그대로 남는다.
export function PrepaidReasonLine({ reason }: { reason: string | null | undefined }) {
  if (!reason) return null;
  return <KvList items={[{ label: "선결제 사유", value: <span className={styles.fill} data-testid="prepaid-reason">{reason}</span> }]} />;
}
