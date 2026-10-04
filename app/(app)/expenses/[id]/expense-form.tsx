"use client";

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Form } from "@/ui/form/Form";
import { Select, type SelectOption } from "@/ui/select/Select";
import { Button } from "@/ui/button/Button";
import { KvList } from "@/ui/kv-list/KvList";
import type { AttachmentFile } from "@/ui/attachments/Attachments";
import { useCommaInput } from "@/ui/input/use-comma-input";
import { parseNumberInput } from "@/lib/format-number";
import { isCtrlCombo } from "@/lib/shortcut";
import { usePhoneWidth } from "@/app/(app)/leave/use-phone-width";
import { saveExpenseDraftAction, submitExpenseAction } from "../actions";
import { EvidenceAttachments } from "./evidence-attachments";
import { submitBlockReason } from "./submit-block";
import styles from "./expense.module.css";

// 05-05(S3 · UI-SPEC): 지출결의 폼 — `Form layout="page"` 한 열. 알 수 있는 값은 서버가 채워 보낸다(견적 줄 · 거래처 · 증빙 종류 · 공급가액 · 통화 ·
// 지급 방식). 사람이 적는 금액은 공급가액(통화 · 금액 · 환율) 하나이고 계산 한 줄(세금 · 지급 총액)은 서버 문자열 그대로다 — 이 파일은 금액을
// 계산하지 않는다(즉시 재계산 · 막힘 이유 ①~⑨ 표시는 05-06). `Enter` 기본 제출은 막고 `Ctrl+Enter`만 제출, `Ctrl+U` = 파일 고르기. 제출 중에는
// 누른 즉시 켜는 동기 ref로 두 번째 누름 · 연타를 무시한다. 올리는 행이 있는 동안 1차는 `submitBlockReason`이 막는다(D2).

export type ExpenseFormData = {
  id: string;
  version: number;
  vendorName: string | null;
  defaultEvidenceName: string | null;
  lineText: string | null;
  executionLines: string[];
  evidenceType: string | null;
  paymentMethod: string | null;
  currency: string;
  amount: number | null;
  fxRate: number;
  scheduledPaymentDate: string | null;
  note: string | null;
  installment: boolean;
  installmentMode: "checkbox" | "fixed" | "none";
  installmentText: string | null;
  taxLine: { text: string; parts: { text: string; emphasis: boolean }[] } | null;
};

export type ExpenseFormProps = {
  data: ExpenseFormData;
  evidenceOptions: SelectOption[];
  paymentOptions: SelectOption[];
  currencies: { value: string; fxRate: number }[];
  files: AttachmentFile[];
  maxMb: number;
  // 서버가 그린 결재선 한 줄(제출 전 — 04.1 `previewRoute` + `ui/approval-route`).
  route: ReactNode;
};

const DATE_EMPTY_ERROR = "날짜 없음 · 날짜 고르기";
const FX_ERROR = "환율 형식 오류 · 1,318.4처럼";

// 환율 칸 — 통화를 바꾸면 그 통화의 기본 환율로 다시 열린다(훅이 값을 밖에서 못 바꾸므로 통화를 key로 다시 마운트한다).
function FxField({ initial, error, onRaw, below }: { initial: number; error: string | undefined; onRaw: (raw: string) => void; below?: ReactNode }) {
  const { inputRef, value, onChange, error: inputError, rawValue } = useCommaInput("fxRate", String(initial));
  useEffect(() => onRaw(rawValue), [rawValue, onRaw]);
  const shown = error ?? inputError ?? undefined;
  return (
    <Form.Field id="fxRate" label="환율" width="short">
      <input
        id="fxRate"
        ref={inputRef}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        className={`${styles.textInput} ${styles.numeric}`}
        value={value}
        onChange={onChange}
        aria-invalid={shown ? true : undefined}
        aria-describedby={shown ? "fxRate-error" : undefined}
      />
      {shown ? <Form.Error id="fxRate-error">{shown}</Form.Error> : null}
      {below}
    </Form.Field>
  );
}

export function ExpenseForm({ data, evidenceOptions, paymentOptions, currencies, files, maxMb, route }: ExpenseFormProps) {
  const router = useRouter();
  const [evidenceType, setEvidenceType] = useState(data.evidenceType ?? "");
  const [paymentMethod, setPaymentMethod] = useState(data.paymentMethod ?? "");
  const [currency, setCurrency] = useState(data.currency);
  const [date, setDate] = useState(data.scheduledPaymentDate ?? "");
  const [note, setNote] = useState(data.note ?? "");
  const [installment, setInstallment] = useState(data.installment || data.installmentMode === "fixed");
  const [fxRaw, setFxRaw] = useState(String(data.fxRate));
  const dateRef = useRef<HTMLInputElement>(null);

  const amountInput = useCommaInput(currency === "KRW" ? "krw" : "foreign", data.amount === null ? "" : String(data.amount));

  const [version, setVersion] = useState(data.version);
  const [uploading, setUploading] = useState(0);
  const [pickSignal, setPickSignal] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [saving, setSaving] = useState(false);
  const busyRef = useRef(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [networkFailed, setNetworkFailed] = useState<"submit" | "save" | null>(null);
  const [errors, setErrors] = useState<{ supplyAmount?: string; fxRate?: string; scheduledPaymentDate?: string; note?: string }>({});

  const snapshot = JSON.stringify([evidenceType, paymentMethod, currency, amountInput.rawValue, currency === "KRW" ? "" : fxRaw, date, note, installment]);
  const [savedSnapshot, setSavedSnapshot] = useState(snapshot);
  const dirty = snapshot !== savedSnapshot;

  // 떠날 때 — 저장 안 한 칸이 있거나 올리는 행이 있으면 브라우저 기본 경고만(D2).
  useEffect(() => {
    if (!dirty && uploading === 0) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, uploading]);

  // 서버 막힘 이유 ①~⑨는 05-06이 미리보기 응답의 첫 이유를 넘긴다 — 지금은 올리는 중 판정만.
  const block = submitBlockReason({ server: null, uploadingCount: uploading });
  // 폰은 2차 `임시 저장` 왼쪽 · 1차 오른쪽 — 수화 전 보이는 순서는 CSS order, 수화 뒤 DOM · Tab 순서도 2차 → 1차(04.1 연차 신청 폼과 같은 방식).
  const phone = usePhoneWidth();

  // 입력 → 서버가 받는 칸 값. 틀린 칸이 있으면 칸 오류를 세우고 null.
  function collect(): Record<string, unknown> | null {
    const next: typeof errors = {};
    const amountRaw = amountInput.rawValue;
    const amount = parseNumberInput(amountRaw);
    let supply: { currency: string; amount: number; fxRate: number } | null = null;
    if (amountRaw !== "" && amount !== null && Number.isFinite(amount)) {
      let fxRate = 1;
      if (currency !== "KRW") {
        const parsed = parseNumberInput(fxRaw);
        if (parsed === null || !Number.isFinite(parsed) || parsed <= 0) next.fxRate = FX_ERROR;
        else fxRate = parsed;
      }
      supply = { currency, amount, fxRate };
    }
    if (dateRef.current?.validity.badInput) next.scheduledPaymentDate = DATE_EMPTY_ERROR;
    setErrors(next);
    if (Object.keys(next).length > 0) {
      setFailure(failureLine(next));
      return null;
    }
    return {
      evidenceType: evidenceType || null,
      paymentMethod: paymentMethod || null,
      supply,
      scheduledPaymentDate: date || null,
      note: note || null,
      installment: data.installmentMode === "none" ? false : installment,
    };
  }

  function failureLine(fieldErrors: typeof errors): string {
    const names = { supplyAmount: "공급가액", fxRate: "환율", scheduledPaymentDate: "지급 예정일", note: "비고" } as const;
    const keys = (Object.keys(fieldErrors) as (keyof typeof names)[]).filter((key) => fieldErrors[key]);
    return `제출 실패 · ${keys.map((key) => names[key]).join(", ")} ${keys.length}칸`;
  }

  // 임시 저장 — 새 version을 돌려준다(실패하면 null, 칸 오류 · 실패 줄을 세운다).
  async function persist(purpose: "submit" | "save"): Promise<number | null> {
    const fields = collect();
    if (!fields) return null;
    let result: Awaited<ReturnType<typeof saveExpenseDraftAction>>;
    try {
      result = await saveExpenseDraftAction({ expenseId: data.id, expectedVersion: version, fields });
    } catch {
      setNetworkFailed(purpose);
      return null;
    }
    if (result?.data) {
      setVersion(result.data.version);
      setSavedSnapshot(snapshot);
      setSavedAt(result.data.savedAt);
      return result.data.version;
    }
    const noteError = result?.validationErrors?.fields?.note?._errors?.[0];
    const dateError = result?.validationErrors?.fields?.scheduledPaymentDate?._errors?.[0];
    if (noteError || dateError) {
      const next = { ...(noteError ? { note: noteError } : {}), ...(dateError ? { scheduledPaymentDate: dateError } : {}) };
      setErrors(next);
      setFailure(purpose === "submit" ? failureLine(next) : "임시 저장 실패 · 다시 시도");
    } else {
      setFailure(result?.serverError ?? (purpose === "submit" ? "제출 실패 · 다시 제출" : "임시 저장 실패 · 다시 시도"));
    }
    return null;
  }

  function release() {
    busyRef.current = false;
    setSubmitting(false);
    setSaving(false);
  }

  async function save() {
    if (busyRef.current) return;
    busyRef.current = true;
    setSaving(true);
    setFailure(null);
    setNetworkFailed(null);
    const saved = await persist("save");
    if (saved !== null) router.refresh();
    release();
  }

  async function submit() {
    if (busyRef.current || block !== null) return;
    busyRef.current = true;
    setSubmitting(true);
    setFailure(null);
    setNetworkFailed(null);
    setSavedAt(null);
    // 화면의 칸이 서버 값과 다르면 먼저 저장하고 새 version으로 제출한다.
    const expectedVersion = dirty ? await persist("submit") : version;
    if (expectedVersion === null) {
      release();
      return;
    }
    let result: Awaited<ReturnType<typeof submitExpenseAction>>;
    try {
      result = await submitExpenseAction({ expenseId: data.id, expectedVersion });
    } catch {
      setNetworkFailed("submit");
      release();
      return;
    }
    const outcome = result?.data;
    if (outcome?.kind === "already_submitted") {
      // 같은 문서 두 번 제출 — 오류가 아니라 결과다. 문서 화면에서 `이미 제출됨 · {번호}` 토스트.
      router.replace(`/expenses/${data.id}?submitted=already`);
      return;
    }
    if (outcome?.kind === "submitted") {
      const names = outcome.result.nextHolderNames;
      setSubmitted(names ? `결재 요청됨 → ${names} · ${outcome.at}` : `결재 요청됨 · ${outcome.at}`);
      router.replace(`/expenses/${data.id}?submitted=1`);
      return;
    }
    const message = result?.serverError ?? "제출 실패 · 다시 제출";
    if (message.startsWith("남은 실행가")) setErrors({ supplyAmount: message });
    setFailure(message);
    release();
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submit();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLFormElement>) {
    if (isCtrlCombo(event, "Enter")) {
      event.preventDefault();
      void submit();
      return;
    }
    if (isCtrlCombo(event, "u")) {
      event.preventDefault();
      setPickSignal((current) => current + 1);
      return;
    }
    // `Enter` 기본 제출은 막는다 — 제출은 `Ctrl+Enter`와 1차 누름뿐(§7-15).
    if (event.key === "Enter" && event.target instanceof HTMLInputElement) event.preventDefault();
  }

  const amountError = errors.supplyAmount ?? amountInput.error ?? undefined;
  const executionNode =
    data.executionLines.length > 0 ? (
      <span className={styles.fill}>
        <span>{data.lineText}</span>
        {data.executionLines.map((line) => (
          <span key={line} className={styles.sub}>
            {line}
          </span>
        ))}
      </span>
    ) : null;

  const submitButton = (
    <span className={styles.submitWrap}>
      <Button
        id="expense-submit"
        type="submit"
        variant="primary"
        shortcut="Ctrl+Enter"
        pending={submitting}
        disabled={block !== null}
        aria-describedby={block ? "expense-blocked" : undefined}
      >
        지출결의 제출
      </Button>
    </span>
  );

  return (
    <Form id="expense-form" layout="page" onSubmit={handleSubmit} onKeyDown={handleKeyDown}>
      {data.lineText ? (
        <Form.Field id="line" label="견적 줄" width="long">
          {executionNode ?? <span className={styles.fill}>{data.lineText}</span>}
        </Form.Field>
      ) : null}

      <Form.Field id="vendor" label="거래처" width="long">
        <span className={styles.fill}>
          <span>{data.vendorName ?? "—"}</span>
          {data.defaultEvidenceName ? <span className={styles.sub}>{`기본 증빙 ${data.defaultEvidenceName}`}</span> : null}
        </span>
      </Form.Field>

      <Form.Field id="evidenceType" label="증빙 종류" width="select">
        <Select id="evidenceType" options={evidenceOptions} value={evidenceType} onChange={(event) => setEvidenceType(event.target.value)} />
      </Form.Field>

      <Form.Field id="currency" label="통화" width="select">
        <Select
          id="currency"
          options={currencies.map((item) => ({ value: item.value, label: item.value }))}
          value={currency}
          onChange={(event) => {
            const next = event.target.value;
            setCurrency(next);
            setFxRaw(String(currencies.find((item) => item.value === next)?.fxRate ?? 1));
          }}
        />
      </Form.Field>

      <Form.Field id="supplyAmount" label="공급가액" width="short">
        <input
          id="supplyAmount"
          ref={amountInput.inputRef}
          type="text"
          inputMode={currency === "KRW" ? "numeric" : "decimal"}
          autoComplete="off"
          className={`${styles.textInput} ${styles.numeric}`}
          value={amountInput.value}
          onChange={amountInput.onChange}
          aria-invalid={amountError ? true : undefined}
          aria-describedby={amountError ? "supplyAmount-error" : undefined}
        />
        {amountError ? <Form.Error id="supplyAmount-error">{amountError}</Form.Error> : null}
        {currency === "KRW" && data.taxLine ? <TaxLine line={data.taxLine} /> : null}
      </Form.Field>

      {currency === "KRW" ? null : (
        <FxField
          key={currency}
          initial={Number(fxRaw) || 1}
          error={errors.fxRate}
          onRaw={setFxRaw}
          below={data.taxLine ? <TaxLine line={data.taxLine} /> : null}
        />
      )}

      {data.installmentMode === "checkbox" ? (
        <Form.Field id="installment" label="분할 지급" width="long">
          <input id="installment" type="checkbox" className={styles.installmentCheck} checked={installment} onChange={(event) => setInstallment(event.target.checked)} />
          {installment && data.installmentText ? <Form.Hint>{data.installmentText}</Form.Hint> : null}
        </Form.Field>
      ) : null}
      {data.installmentMode === "fixed" ? (
        <Form.Field id="installment" label="분할 지급" width="long">
          <span className={styles.fill}>{data.installmentText}</span>
        </Form.Field>
      ) : null}

      <Form.Field id="scheduledPaymentDate" label="지급 예정일" width="short">
        <input
          id="scheduledPaymentDate"
          ref={dateRef}
          type="date"
          value={date}
          onChange={(event) => setDate(event.target.value)}
          className={styles.textInput}
          aria-invalid={errors.scheduledPaymentDate ? true : undefined}
          aria-describedby={errors.scheduledPaymentDate ? "scheduledPaymentDate-error" : undefined}
        />
        {errors.scheduledPaymentDate ? <Form.Error id="scheduledPaymentDate-error">{errors.scheduledPaymentDate}</Form.Error> : null}
      </Form.Field>

      <Form.Field id="paymentMethod" label="지급 방식" width="select">
        <Select id="paymentMethod" options={paymentOptions} value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)} />
      </Form.Field>

      <Form.Field id="note" label="비고" width="long">
        <input
          id="note"
          type="text"
          maxLength={480}
          autoComplete="off"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          className={styles.textInput}
          aria-invalid={errors.note ? true : undefined}
          aria-describedby={errors.note ? "note-error" : undefined}
        />
        {errors.note ? <Form.Error id="note-error">{errors.note}</Form.Error> : null}
      </Form.Field>

      <Form.Field id="evidence-picker" label="증빙" width="long">
        <div id="evidence">
          <EvidenceAttachments
            expenseId={data.id}
            files={files}
            mode="edit"
            maxMb={maxMb}
            onUploadingChange={setUploading}
            openSignal={pickSignal}
            pickerId="evidence-picker"
          />
        </div>
      </Form.Field>

      <KvList items={[{ label: "결재선", value: route }]} />

      <div className={styles.formBar} data-testid="expense-form-actions">
        <Form.Actions>
          {phone ? null : submitButton}
          {block && !submitting ? (
            <span id="expense-blocked" className={block.tone === "info" ? styles.infoReason : styles.blockedReason}>
              {block.reason}
            </span>
          ) : null}
          {networkFailed === "submit" ? (
            <span className={styles.blockedLine}>
              <span className={styles.blockedReason}>제출 실패 · 네트워크 · </span>
              <Button variant="tertiary" onClick={() => void submit()}>
                다시 제출
              </Button>
            </span>
          ) : null}
          {failure && networkFailed === null ? <span className={styles.blockedReason}>{failure}</span> : null}
          {submitted ? <span className={styles.successLine}>{submitted}</span> : null}
          {networkFailed === "save" ? <span className={styles.blockedReason}>임시 저장 실패 · 다시 시도</span> : null}
          {savedAt && !submitting ? <span className={styles.successLine}>{`임시 저장됨 ${savedAt}`}</span> : null}
          <span className={styles.saveWrap}>
            {/* 제출 중 비활성 이유 = 제출 중인 1차(UX-06). */}
            <Button
              variant="secondary"
              pending={saving}
              disabled={submitting}
              aria-describedby={submitting ? "expense-submit" : undefined}
              onClick={() => void save()}
            >
              임시 저장
            </Button>
          </span>
          {phone ? submitButton : null}
        </Form.Actions>
      </div>
      <div className={styles.formBarSpacer} aria-hidden="true" />
    </Form>
  );
}

// 계산 한 줄 — 서버 문자열 조각 그대로, 숫자 조각만 700.
function TaxLine({ line }: { line: { text: string; parts: { text: string; emphasis: boolean }[] } }) {
  return (
    <span className={styles.taxLine} data-testid="expense-tax-line">
      {line.parts.map((part, index) => (
        <span key={`${index}-${part.text}`} className={part.emphasis ? styles.strong : undefined}>
          {part.text}
        </span>
      ))}
    </span>
  );
}
