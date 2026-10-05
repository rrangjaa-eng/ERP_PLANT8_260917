"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Form } from "@/ui/form/Form";
import { Select, type SelectOption } from "@/ui/select/Select";
import { Button, buttonLinkClassName } from "@/ui/button/Button";
import { KvList } from "@/ui/kv-list/KvList";
import type { AttachmentFile } from "@/ui/attachments/Attachments";
import { useCommaInput } from "@/ui/input/use-comma-input";
import { parseNumberInput } from "@/lib/format-number";
import { isCtrlCombo } from "@/lib/shortcut";
import { usePhoneWidth } from "@/app/(app)/leave/use-phone-width";
import {
  changeExpenseLineAction,
  changeExpenseVendorAction,
  createExpenseFromLinesAction,
  createTeamExpenseDraftAction,
  previewExpenseAction,
  previewNewExpenseAction,
  saveExpenseDraftAction,
  submitExpenseAction,
} from "../actions";
import { VendorPickDialog, type PickedVendor } from "./pick-vendor";
import { LinePickDialog } from "./pick-line";
import { EvidenceAttachments } from "./evidence-attachments";
import { submitBlockReason, type ServerBlock } from "./submit-block";
import { TaxParts } from "./tax-parts";
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
  taxLine: {
    text: string;
    parts: { text: string; emphasis: boolean }[];
  } | null;
  // 05-06 제출 막힘 첫 이유(규칙 `expense.submit`) · 다음 한 수 대상 · 이동 주소 — 처음 그림은 서버 미리보기 값, 그 뒤는 미리보기 응답.
  block: (ServerBlock & { href: string | null }) | null;
  // 05-07 팀 비용 문서(프로젝트 · 견적 줄 없음)면 칸 넷의 저장값 — 견적 줄 문서는 null. 새 문서(`/expenses/new`)도 팀 비용으로 열린다.
  team: {
    kind: string | null;
    usageDate: string;
    content: string | null;
    teamName: string | null;
    usageDateError: string | null;
  } | null;
};


// 다음 한 수 대상 → 포커스할 칸 id(첨부 영역 = 파일 고르기 버튼).
const TARGET_FIELD: Record<string, string> = {
  supplyAmount: "supplyAmount",
  evidenceType: "evidenceType",
  paymentMethod: "paymentMethod",
  evidence: "evidence-picker",
  teamExpenseKind: "teamExpenseKind",
  content: "content",
  vendor: "vendor-pick",
  quoteLine: "line-pick",
};
const NEXT_STEP_ID = "expense-next-step";
// 견적 줄 바꾸기가 끝나면 페이지가 폼을 새로 그린다(key) — 트리거 `바꾸기`가 새 요소라 포커스를 잃지 않게 새 폼이 한 번 거기로 돌려놓는다.
let refocusLineTrigger = false;

export type ExpenseFormProps = {
  data: ExpenseFormData;
  evidenceOptions: SelectOption[];
  paymentOptions: SelectOption[];
  teamKindOptions: SelectOption[];
  /** true면 `/expenses/new` — 문서가 아직 없다(`data.id` 빈 값). 첫 저장(임시 저장 · 증빙 올리기)이 문서를 만든다. */
  newDoc: boolean;
  // 05-09: 반려 · 회수된 번호 문서 — 1차가 `지출결의 다시 제출`(같은 번호).
  resubmit?: boolean;
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

export function ExpenseForm({ data, evidenceOptions, paymentOptions, teamKindOptions, newDoc, resubmit = false, currencies, files, maxMb, route }: ExpenseFormProps) {
  const router = useRouter();
  const [evidenceType, setEvidenceType] = useState(data.evidenceType ?? "");
  const [paymentMethod, setPaymentMethod] = useState(data.paymentMethod ?? "");
  const [currency, setCurrency] = useState(data.currency);
  const [date, setDate] = useState(data.scheduledPaymentDate ?? "");
  const [note, setNote] = useState(data.note ?? "");
  const [installment, setInstallment] = useState(data.installment || data.installmentMode === "fixed");
  const [fxRaw, setFxRaw] = useState(String(data.fxRate));
  const dateRef = useRef<HTMLInputElement>(null);
  const usageDateRef = useRef<HTMLInputElement>(null);
  const team = data.team;
  const [teamKind, setTeamKind] = useState(team?.kind ?? "");
  const [usageDate, setUsageDate] = useState(team?.usageDate ?? "");
  const [content, setContent] = useState(team?.content ?? "");
  const [teamName, setTeamName] = useState(team?.teamName ?? null);
  const [usageDateError, setUsageDateError] = useState(team?.usageDateError ?? null);
  // 첫 저장의 idempotency key — 폼이 열릴 때 한 번 만든다(두 번 눌러도 문서 하나).
  const [idempotencyKey] = useState(() => (newDoc ? crypto.randomUUID() : ""));
  // 고른 거래처 — 새 문서는 첫 저장에 실어 보낼 값이고, 저장된 문서는 화면에 바로 보일 값(서버가 이미 바꿨다).
  const [pickedVendor, setPickedVendor] = useState<PickedVendor | null>(null);
  const [pickOpen, setPickOpen] = useState<"vendor" | "line" | null>(null);

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
  const [errors, setErrors] = useState<{
    supplyAmount?: string;
    fxRate?: string;
    scheduledPaymentDate?: string;
    note?: string;
    usageDate?: string;
  }>({});

  // 05-06 계산 한 줄 — 서버 미리보기 응답으로 바뀐다. 오는 동안 이전 줄은 흐린 색으로 남는다(빈칸 · 뼈대 없음 — UI-SPEC S5).
  const [taxLine, setTaxLine] = useState(data.taxLine);
  const [previewing, setPreviewing] = useState(false);
  const [previewFieldError, setPreviewFieldError] = useState<string | null>(null);
  // 미리보기가 서버 오류(금액 상한 초과 등)를 받았다 — 계산 한 줄은 이전 값을 두지 않고 `계산 불가`(다음 정상 미리보기가 걷는다).
  const [previewFailed, setPreviewFailed] = useState(false);
  const previewSeq = useRef(0);
  const [serverBlock, setServerBlock] = useState(data.block);
  // 올린 파일이 완료됐지만 서버가 다시 그린 files가 아직 안 온 동안 — 서버 ⑧(대상 evidence)은 지난 값이다.
  // 완료 순간의 files를 기억하고, 서버가 새 files를 보내면 저절로 풀린다.
  const [addedAt, setAddedAt] = useState<AttachmentFile[] | null>(null);
  const evidenceAdded = addedAt === files;
  const markEvidenceAdded = useCallback(() => setAddedAt(files), [files]);

  const snapshot = JSON.stringify([
    evidenceType,
    paymentMethod,
    currency,
    amountInput.rawValue,
    currency === "KRW" ? "" : fxRaw,
    date,
    note,
    installment,
    teamKind,
    usageDate,
    content,
  ]);
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

  // 계산에 드는 칸(증빙 종류 · 공급가액 · 통화 · 환율 · 지급 예정일 · 분할 지급)이 바뀌면 짧은 지연 뒤 미리보기를 부른다. 늦게 온 응답이
  // 새 응답을 덮지 않게 요청 순번으로 거른다. 첫 그림은 서버가 보낸 값이라 부르지 않는다.
  // 막힘 판정에 드는 지급 방식 · 증빙 파일 수도 본다(파일을 올리거나 떼면 서버가 다시 그린 files가 바뀐다).
  const previewKey = JSON.stringify([
    evidenceType,
    paymentMethod,
    currency,
    amountInput.rawValue,
    currency === "KRW" ? "" : fxRaw,
    date,
    installment,
    files.length,
    teamKind,
    usageDate,
    content,
    pickedVendor?.id ?? "",
  ]);
  const firstPreviewKey = useRef(previewKey);
  useEffect(() => {
    if (previewKey === firstPreviewKey.current) return;
    firstPreviewKey.current = "";
    const seq = ++previewSeq.current;
    setPreviewing(true);
    const timer = window.setTimeout(() => {
      if (busyRef.current) {
        setPreviewing(false);
        return;
      }
      if (newDoc) {
        // 문서가 없어 계산 · 막힘은 미리보지 않는다 — 사용일이 바뀌면 그날 소속 팀만 다시 받는다.
        void (async () => {
          const usage = usageDateRef.current;
          if (!usage || usage.validity.badInput || usageDate === "") {
            if (seq === previewSeq.current) setPreviewing(false);
            return;
          }
          let outcome: Awaited<ReturnType<typeof previewNewExpenseAction>> | undefined;
          try {
            outcome = await previewNewExpenseAction({ usageDate });
          } catch {
            outcome = undefined;
          }
          if (seq !== previewSeq.current) return;
          setPreviewing(false);
          if (!outcome?.data) return;
          setTeamName(outcome.data.teamName);
          setUsageDateError(outcome.data.usageDateError);
        })();
        return;
      }
      void (async () => {
        let result: Awaited<ReturnType<typeof previewExpenseAction>> | undefined;
        try {
          result = await previewExpenseAction({
            expenseId: data.id,
            fields: previewFields(),
          });
        } catch {
          result = undefined;
        }
        if (seq !== previewSeq.current) return;
        setPreviewing(false);
        if (result === undefined) {
          setNetworkFailed("submit");
          return;
        }
        if (!result?.data) {
          if (result?.serverError) {
            setPreviewFieldError(result.serverError);
            setPreviewFailed(true);
          }
          return;
        }
        setNetworkFailed((current) => (current === "submit" ? null : current));
        setPreviewFailed(false);
        setTaxLine(result.data.taxLine);
        setServerBlock(result.data.block);
        setPreviewFieldError(result.data.fieldErrors.supplyAmount ?? null);
        if (team) {
          setTeamName(result.data.teamName ?? null);
          setUsageDateError(result.data.fieldErrors.usageDate ?? null);
        }
      })();
    }, 250);
    return () => window.clearTimeout(timer);
    // previewFields는 같은 렌더의 칸 값을 읽는다 — 칸 값의 변화는 previewKey 하나로 본다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewKey, data.id]);

  // 1차 옆 이유 — 서버 첫 이유(①~⑨)와 올리는 행 수를 한 함수로(D2: 올리는 중이면 ⑧ 대신 `증빙 올리는 중`).
  const server = serverBlock?.target === "evidence" && (evidenceAdded || files.length > 0) ? null : serverBlock;
  const block = submitBlockReason({ server, uploadingCount: uploading });
  const blockHref = block?.tone === "block" ? (server?.href ?? null) : null;

  // 비활성 1차 누름 · Ctrl+Enter · 첫 그림 — 서버를 부르지 않고 다음 한 수의 대상으로 포커스(칸이 없으면 이동 3차). 옮겼으면 true.
  function focusBlockTarget(): boolean {
    const fieldId = block?.target ? TARGET_FIELD[block.target] : undefined;
    const element = (fieldId && document.getElementById(fieldId)) || (blockHref ? document.getElementById(NEXT_STEP_ID) : null);
    element?.focus();
    return Boolean(element);
  }

  // 첫 포커스 = 막힘 대상(없으면 1차). 문서가 아직 없는 `/expenses/new`는 맨 위 3차 `견적 줄 고르기`(수주 비용의 기본 경로 — R6-06).
  useEffect(() => {
    if (newDoc || refocusLineTrigger) {
      refocusLineTrigger = false;
      document.getElementById("line-pick")?.focus();
      return;
    }
    if (!focusBlockTarget()) document.getElementById("expense-submit")?.focus();
    // 첫 그림에서 한 번만.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
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
    if (team && (usageDate === "" || usageDateRef.current?.validity.badInput)) next.usageDate = DATE_EMPTY_ERROR;
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
      ...teamFields(),
      ...(newDoc && pickedVendor ? { vendorId: pickedVendor.id } : {}),
    };
  }

  // 팀 비용 칸 넷 중 보낼 셋(팀은 서버가 사용일 소속으로 정한다) — 견적 줄 문서는 보내지 않는다.
  function teamFields(): Record<string, unknown> {
    if (!team) return {};
    return {
      teamExpenseKind: teamKind || null,
      usageDate,
      content: content.trim() === "" ? null : content.trim(),
    };
  }

  // 미리보기에 보낼 칸 값 — 칸 오류를 세우지 않는다(형식이 틀린 칸은 값 없음으로 보낸다).
  function previewFields(): Record<string, unknown> {
    const amount = parseNumberInput(amountInput.rawValue);
    const fxRate = currency === "KRW" ? 1 : parseNumberInput(fxRaw);
    const supplyValid = amountInput.rawValue !== "" && amount !== null && Number.isFinite(amount) && fxRate !== null && Number.isFinite(fxRate) && fxRate > 0;
    return {
      evidenceType: evidenceType || null,
      paymentMethod: paymentMethod || null,
      supply: supplyValid ? { currency, amount, fxRate } : null,
      scheduledPaymentDate: dateRef.current?.validity.badInput ? null : date || null,
      installment: data.installmentMode === "none" ? false : installment,
      ...(team && usageDate !== "" && !usageDateRef.current?.validity.badInput ? teamFields() : {}),
    };
  }

  function failureLine(fieldErrors: typeof errors): string {
    const names = {
      supplyAmount: "공급가액",
      fxRate: "환율",
      scheduledPaymentDate: "지급 예정일",
      note: "비고",
      usageDate: "사용일",
    } as const;
    const keys = (Object.keys(fieldErrors) as (keyof typeof names)[]).filter((key) => fieldErrors[key]);
    return `제출 실패 · ${keys.map((key) => names[key]).join(", ")} ${keys.length}칸`;
  }

  // 임시 저장 — 새 version을 돌려준다(실패하면 null, 칸 오류 · 실패 줄을 세운다).
  async function persist(purpose: "submit" | "save"): Promise<number | null> {
    const fields = collect();
    if (!fields) return null;
    if (newDoc) return createDraft(fields, purpose);
    let result: Awaited<ReturnType<typeof saveExpenseDraftAction>>;
    try {
      result = await saveExpenseDraftAction({
        expenseId: data.id,
        expectedVersion: version,
        fields,
      });
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
      const next = {
        ...(noteError ? { note: noteError } : {}),
        ...(dateError ? { scheduledPaymentDate: dateError } : {}),
      };
      setErrors(next);
      setFailure(purpose === "submit" ? failureLine(next) : "임시 저장 실패 · 다시 시도");
    } else {
      setFailure(result?.serverError ?? (purpose === "submit" ? "제출 실패 · 다시 제출" : "임시 저장 실패 · 다시 시도"));
    }
    return null;
  }

  // 첫 저장 — 폼이 열릴 때 만든 key로 문서를 만들고 주소를 `/expenses/{id}`로 바꾼다(뒤로 가기에 `/expenses/new`를 남기지 않는다).
  async function createDraft(fields: Record<string, unknown>, purpose: "submit" | "save"): Promise<number | null> {
    let result: Awaited<ReturnType<typeof createTeamExpenseDraftAction>>;
    try {
      result = await createTeamExpenseDraftAction({ idempotencyKey, fields });
    } catch {
      setNetworkFailed(purpose);
      return null;
    }
    if (result?.data) {
      setSavedSnapshot(snapshot);
      router.replace(`/expenses/${result.data.expenseId}`);
      return result.data.version;
    }
    const message = result?.serverError;
    if (message?.startsWith("사용일에")) {
      setErrors({ usageDate: message });
      setFailure(failureLine({ usageDate: message }));
    } else {
      setFailure(message ?? (purpose === "submit" ? "제출 실패 · 다시 제출" : "임시 저장 실패 · 다시 시도"));
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
    if (saved !== null && !newDoc) router.refresh();
    if (saved === null || !newDoc) release();
  }

  async function submit() {
    if (busyRef.current) return;
    if (block !== null) {
      focusBlockTarget();
      return;
    }
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
      result = await submitExpenseAction({
        expenseId: data.id,
        expectedVersion,
      });
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

  // 파일 고르기 — 새 문서는 올릴 문서가 없어 첫 저장이 먼저다(저장 뒤 `/expenses/{id}`에서 같은 자리의 파일 고르기).
  function openPicker() {
    if (newDoc) void save();
    else setPickSignal((current) => current + 1);
  }

  // 거래처 고르기 · 바꾸기 — 새 문서는 첫 저장에 실을 값이고, 저장된 문서는 서버가 거래처와 증빙 종류(그 거래처 기본값)를 바로 바꾼다.
  async function pickVendor(vendor: PickedVendor): Promise<boolean | void> {
    if (newDoc) {
      setPickedVendor(vendor);
      if (vendor.defaultEvidenceType) setEvidenceType(vendor.defaultEvidenceType);
      return;
    }
    let result: Awaited<ReturnType<typeof changeExpenseVendorAction>>;
    try {
      result = await changeExpenseVendorAction({
        expenseId: data.id,
        vendorId: vendor.id,
        expectedVersion: version,
      });
    } catch {
      setFailure("거래처 바꾸기 실패 · 다시 시도");
      return;
    }
    if (!result?.data) {
      setFailure(result?.serverError ?? "거래처 바꾸기 실패 · 다시 시도");
      return;
    }
    setVersion(result.data.version);
    setPickedVendor(vendor);
    if (result.data.evidenceType) {
      // 서버가 증빙 종류까지 저장했다 — 다른 칸이 깨끗했으면 기준선도 그 값으로 맞춰 떠날 때 경고가 뜨지 않게 한다(첫 칸이 증빙 종류).
      if (!dirty) setSavedSnapshot(JSON.stringify([result.data.evidenceType, ...(JSON.parse(snapshot) as unknown[]).slice(1)]));
      setEvidenceType(result.data.evidenceType);
    }
    setFailure(null);
  }

  // 견적 줄 고르기 · 바꾸기 — 새 문서는 그 줄의 작성 중 문서를 만들거나 열고(적어 둔 비고 · 지급 예정일 · 지급 방식은 같이 저장하고 팀 비용 칸은 버린다),
  // 저장된 문서는 서버가 줄 값으로 다시 채운다.
  // 그 줄에 내 다른 작성 중 문서가 있으면 그 문서로 이동한다. 줄이 바뀌면 칸 값이 통째로 새 값이라 페이지가 폼을 새로 그린다(router.refresh · key).
  async function pickLine(lineId: string): Promise<boolean | void> {
    setFailure(null);
    const failed = "견적 줄 고르기 실패 · 다시 시도";
    if (newDoc) {
      let created: Awaited<ReturnType<typeof createExpenseFromLinesAction>>;
      try {
        created = await createExpenseFromLinesAction({
          lineIds: [lineId],
          fields: { note: note || null, scheduledPaymentDate: date || null, paymentMethod: paymentMethod || null },
        });
      } catch {
        setFailure(failed);
        return;
      }
      const first = created?.data?.created[0];
      if (first) {
        router.replace(`/expenses/${first.expenseId}`);
        return;
      }
      setFailure(created?.data?.blocked[0]?.reason ?? created?.serverError ?? failed);
      return;
    }
    // 저장 안 한 칸은 먼저 저장한다 — 줄이 바뀌면 폼이 서버 값으로 다시 그려져 적은 값이 사라지기 때문.
    const base = dirty ? await persist("save") : version;
    if (base === null) return false;
    let changed: Awaited<ReturnType<typeof changeExpenseLineAction>>;
    try {
      changed = await changeExpenseLineAction({ expenseId: data.id, lineId, expectedVersion: base });
    } catch {
      setFailure(failed);
      return;
    }
    const outcome = changed?.data;
    if (outcome && "redirectTo" in outcome) {
      router.replace(`/expenses/${outcome.redirectTo}`);
      return;
    }
    if (outcome) {
      setVersion(outcome.version);
      // 줄이 바뀐 때만(version이 오른다) — 같은 줄을 다시 고르면 폼이 새로 그려지지 않아 플래그가 남아 다음 폼의 첫 포커스를 가로챈다(05 /review B9).
      if (outcome.version !== base) refocusLineTrigger = true;
      router.refresh();
      return;
    }
    setFailure(changed?.serverError ?? failed);
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
      openPicker();
      return;
    }
    // `Enter` 기본 제출은 막는다 — 제출은 `Ctrl+Enter`와 1차 누름뿐(§7-15).
    if (event.key === "Enter" && event.target instanceof HTMLInputElement) event.preventDefault();
  }

  const amountError = errors.supplyAmount ?? amountInput.error ?? previewFieldError ?? undefined;
  // 계산 한 줄은 값 줄이라 설명 문단(`Form.Hint`의 <p>)이 아니라 같은 모양(힌트 글자)의 span이다 — 화면 사용성 원칙 검사의 「긴 설명」과 구분.
  const taxHint = previewFailed ? (
    <span className={`${styles.taxLine} ${styles.stale}`} data-testid="expense-tax-line">
      계산 불가
    </span>
  ) : taxLine ? (
    <span className={`${styles.taxLine} ${previewing ? styles.stale : ""}`} data-testid="expense-tax-line">
      <TaxParts parts={taxLine.parts} />
    </span>
  ) : null;
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
        onClickCapture={block ? () => focusBlockTarget() : undefined}
      >
        {resubmit ? "지출결의 다시 제출" : "지출결의 제출"}
      </Button>
    </span>
  );

  const vendorName = pickedVendor ? pickedVendor.name : data.vendorName;
  const vendorEvidenceName = pickedVendor ? pickedVendor.defaultEvidenceName : data.defaultEvidenceName;
  const usageDateShownError = errors.usageDate ?? usageDateError ?? undefined;

  return (
    <>
      <Form id="expense-form" layout="page" onSubmit={handleSubmit} onKeyDown={handleKeyDown}>
        {team ? (
          <Form.Field id="line" label="견적 줄" width="long">
            <span className={styles.valueRow}>
              <span className={styles.fill}>—</span>
              <Button id="line-pick" variant="tertiary" onClick={() => setPickOpen("line")}>
              견적 줄 고르기
            </Button>
            </span>
          </Form.Field>
        ) : data.lineText ? (
          <Form.Field id="line" label="견적 줄" width="long">
          <span className={styles.valueRow}>
            {executionNode ?? <span className={styles.fill}>{data.lineText}</span>}
            <Button id="line-pick" variant="tertiary" onClick={() => setPickOpen("line")}>
              바꾸기
            </Button>
          </span>
        </Form.Field>
        ) : null}

        {team ? (
          <>
            <Form.Field id="teamExpenseKind" label="종류" width="select">
              <Select id="teamExpenseKind" options={teamKindOptions} value={teamKind} onChange={(event) => setTeamKind(event.target.value)} />
            </Form.Field>

            <Form.Field id="team" label="팀" width="long">
              <span className={styles.fill} data-testid="expense-team">
                {teamName ?? "—"}
              </span>
            </Form.Field>

            <Form.Field id="usageDate" label="사용일" width="short">
              <input
                id="usageDate"
                ref={usageDateRef}
                type="date"
                value={usageDate}
                onChange={(event) => setUsageDate(event.target.value)}
                className={styles.textInput}
                aria-invalid={usageDateShownError ? true : undefined}
                aria-describedby={usageDateShownError ? "usageDate-error" : undefined}
              />
              {usageDateShownError ? <Form.Error id="usageDate-error">{usageDateShownError}</Form.Error> : null}
            </Form.Field>

            <Form.Field id="content" label="내용" width="long">
              <input
                id="content"
                type="text"
                maxLength={480}
                autoComplete="off"
                value={content}
                onChange={(event) => setContent(event.target.value)}
                className={styles.textInput}
              />
            </Form.Field>
          </>
        ) : null}

        <Form.Field id="vendor" label="거래처" width="long">
          <span className={styles.valueRow}>
            <span className={styles.fill}>
              <span data-testid="expense-vendor">{vendorName ?? "—"}</span>
              {vendorEvidenceName ? <span className={styles.sub}>{`기본 증빙 ${vendorEvidenceName}`}</span> : null}
            </span>
            {team ? (
              <Button id="vendor-pick" variant="tertiary" onClick={() => setPickOpen("vendor")}>
                {vendorName ? "바꾸기" : "거래처 고르기"}
              </Button>
            ) : null}
          </span>
        </Form.Field>

        <Form.Field id="evidenceType" label="증빙 종류" width="select">
          <Select id="evidenceType" options={evidenceOptions} value={evidenceType} onChange={(event) => setEvidenceType(event.target.value)} />
        </Form.Field>

        <Form.Field id="currency" label="통화" width="select">
          <Select
            id="currency"
            options={currencies.map((item) => ({
              value: item.value,
              label: item.value,
            }))}
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
          {currency === "KRW" ? taxHint : null}
        </Form.Field>

        {currency === "KRW" ? null : <FxField key={currency} initial={Number(fxRaw) || 1} error={errors.fxRate} onRaw={setFxRaw} below={taxHint} />}

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
          <div id="evidence" className={styles.evidencePick}>
            {newDoc ? (
              <Button id="evidence-picker" variant="secondary" shortcut="Ctrl+U" pending={saving} onClick={openPicker}>
                증빙 올리기
              </Button>
            ) : (
              <EvidenceAttachments
                expenseId={data.id}
                files={files}
                mode="edit"
                maxMb={maxMb}
                onUploadingChange={setUploading}
                onAdded={markEvidenceAdded}
                openSignal={pickSignal}
                pickerId="evidence-picker"
              />
            )}
          </div>
        </Form.Field>

        <KvList items={[{ label: "결재선", value: route }]} />

        <div className={styles.formBar} data-testid="expense-form-actions" data-fixed-bar="">
          <Form.Actions>
            {phone ? null : submitButton}
            {block && !submitting ? <BlockLine block={block} href={blockHref} onPick={openPicker} onVendor={() => setPickOpen("vendor")} onLine={() => setPickOpen("line")} /> : null}
            {/* 제출 · 임시 저장 결과 줄 — 스크린리더가 결과를 듣도록 polite 라이브 영역(§10 저장 결과, 05 /review B4). 레이아웃에는 끼지 않는다. */}
            <span className={styles.resultLines} aria-live="polite">
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
            </span>
            <span className={styles.saveWrap}>
              {/* 제출 중 비활성 이유 = 제출 중인 1차(UX-06). */}
              <Button variant="secondary" pending={saving} disabled={submitting} aria-describedby={submitting ? "expense-submit" : undefined} onClick={() => void save()}>
                임시 저장
              </Button>
            </span>
            {phone ? submitButton : null}
          </Form.Actions>
        </div>
        <div className={styles.formBarSpacer} aria-hidden="true" />
      </Form>
      <LinePickDialog
        open={pickOpen === "line"}
        mode={data.lineText ? "change" : "pick"}
        expenseId={newDoc ? null : data.id}
        droppedFields={teamKind !== "" || content.trim() !== "" ? ["팀 비용 칸"] : []}
        onClose={() => setPickOpen(null)}
        onPick={pickLine}
      />
      <VendorPickDialog open={pickOpen === "vendor"} mode={vendorName ? "change" : "pick"} onClose={() => setPickOpen(null)} onPick={pickVendor} />
    </>
  );
}

// 1차 옆 막힘 한 줄 — 이유의 마지막 ` · ` 뒤(다음 행동)가 할 수 있는 일이면 그 자리를 3차로 바꾼다(§7-1 이유 + 다음 한 수 한 덩어리 —
// 폰에서는 05-05 제출 줄의 이유 자리(버튼 아래 한 줄) 그대로). 칸 대상 = 그 칸으로 포커스, 첨부 = 파일 고르기(Ctrl+U), 이동 = 3차 모양 링크.
function BlockLine({
  block,
  href,
  onPick,
  onVendor,
  onLine,
}: {
  block: { reason: string; tone: "block" | "info"; target: string | null };
  href: string | null;
  onPick: () => void;
  onVendor: () => void;
  onLine: () => void;
}) {
  const tone = block.tone === "info" ? styles.infoReason : styles.blockedReason;
  const cut = block.reason.lastIndexOf(" · ");
  const fieldId = block.tone === "block" && block.target ? TARGET_FIELD[block.target] : undefined;
  if (cut < 0 || (!fieldId && !href)) {
    return (
      <span id="expense-blocked" className={tone}>
        {block.reason}
      </span>
    );
  }
  const head = block.reason.slice(0, cut + 3);
  const tail = block.reason.slice(cut + 3);
  const shortcut = /^(.*) (Ctrl\+\S+)$/.exec(tail);
  const label = shortcut?.[1] ?? tail;
  return (
    <span id="expense-blocked" className={styles.blockedLine}>
      <span className={tone}>{head}</span>
      {href ? (
        <Link id={NEXT_STEP_ID} href={href} className={buttonLinkClassName("tertiary")}>
          {label}
        </Link>
      ) : (
        <Button
          id={NEXT_STEP_ID}
          variant="tertiary"
          shortcut={shortcut?.[2]}
          onClick={() => {
            if (block.target === "evidence") onPick();
            else if (block.target === "vendor") onVendor();
            else if (block.target === "quoteLine") onLine();
            else document.getElementById(fieldId ?? "")?.focus();
          }}
        >
          {label}
        </Button>
      )}
    </span>
  );
}
