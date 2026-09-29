"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Button } from "@/ui/button/Button";
import { TextField } from "@/ui/input/TextField";
import { formatContactPhone, formatSubmittedAtKst } from "@/domain/certs/format";
import { recheckLockAction, selectWinnerAction, submitCertificateAction, verifyLast4Action } from "./actions";
import {
  isDefiniteResult,
  nextRrnRecheckConfirmed,
  recheckOutcome,
  resolveHistoryEntry,
  restoreDraft,
  submitBlockedReason,
  submitOutcomeFromValidationErrors,
  type ConsentTerms,
  type HistoryStep,
  type RecheckTrigger,
  type SubmitField,
} from "./flow-rules";
import { ConsentBlock, CONSENT_CHECKBOX_ID } from "./consent-block";
import { RrnFields, RRN_FRONT_ID } from "./rrn-fields";
import { SignaturePad, type SignaturePadHandle, type Stroke } from "./signature-pad";
import styles from "./intake.module.css";

export type IntakeRowDto = { rowId: string; maskedName: string; prizeLine?: string; label?: string };

export type IntakeFlowProps = {
  token: string;
  eventName: string;
  wonOn: string;
  rows: IntakeRowDto[];
  managerName: string;
  contactPhone: string;
};

type ClosedReason = "expired" | "all_submitted" | "manual";

// 짧은 잠김 — 한도 · 표시 시각은 서버 응답 값, deadline은 받은 순간 + 남은 초
// (기기 시계 차이 무시). 클라이언트는 화면만 되살리고 판정은 서버가 한다.
// inGroup — 누적 잠김 복구 길(잠금 다시 확인)에서 온 짧은 잠김은 누적 잠김 묶음
// 안에 두 줄을 그리고 1차는 disabledReason 없이 그 두 줄만 가리킨다(UI-SPEC 6차 손질 3).
type ShortLock = { kind: "short"; limit: number; unlockAtDisplay: string; deadline: number; inGroup?: boolean };
// 누적 잠김 — 해제 시각 · 횟수 없음, 클라이언트는 풀지 않는다(서버에 다시 묻기만).
type HardLock = { kind: "hard" };

type VerifyStep = {
  kind: "verify";
  rowId: string;
  maskedName: string;
  last4: string;
  fieldError?: { kind: "wrong"; remaining: number } | { kind: "expired" };
  line?: "unknown" | "throttled";
  lock?: ShortLock | HardLock;
  recheckError?: boolean;
};

type Step =
  | { kind: "pick"; error?: boolean }
  | VerifyStep
  | {
      kind: "form";
      rowId: string;
      proof: string;
      prizeLine: string;
      delivery: "onsite" | "parcel";
      consentVersion: string;
      retentionYears: number;
      winnerVersion: number;
    }
  | { kind: "submitted"; name: string; submittedAt: string; prizeLine: string; delivery: "onsite" | "parcel" }
  | { kind: "alreadySubmitted"; maskedName: string; submittedAt: string }
  | { kind: "closed"; reason: ClosedReason; at: string };

type FocusTarget = "input" | "row" | "result" | "prize" | "primary" | "group";

// UI-SPEC E4 「값의 주인」 — E4 값(서명 획 포함)은 확정된 자리에 묶여 메모리에만
// 있다. 확인 시간 지남으로 E3에 다녀와 같은 자리를 다시 통과하면 되살리고, E2 ·
// E5 · E6으로 가면 버린다. armedRrn = 되물음(rrnRecheck)을 받은 요청이 보낸 번호.
// consentVersion · retentionYears = 동의 칸이 가리키는 판(재확인이 다른 판을 주면 동의를 푼다).
type FormDraft = ConsentTerms & {
  rowId: string;
  name: string;
  rrnFront6: string;
  rrnBack7: string;
  phone: string;
  address: string;
  consent: boolean;
  strokes: Stroke[];
  armedRrn: string | null;
};

function emptyDraft(rowId: string, terms: ConsentTerms): FormDraft {
  return {
    rowId,
    name: "",
    rrnFront6: "",
    rrnBack7: "",
    phone: "",
    address: "",
    consent: false,
    strokes: [],
    armedRrn: null,
    ...terms,
  };
}

// 받은 순간 + 서버가 준 남은 초(기기 시계 차이 무시).
function deadlineAfter(seconds: number): number {
  return Date.now() + seconds * 1000;
}

function randomIdemKey(): string {
  return crypto.randomUUID();
}

const TITLE = "기타소득 지급 확인";
const RESPONSE_TIMEOUT_MS = 20_000;
const PROGRESS_DELAY_MS = 300;
const LAST4_FIELD_ID = "last4";
const RESULT_LEAD_ID = "cert-result-lead";
const PRIMARY_ID = "cert-verify-primary";
const PRIZE_ID = "cert-prize";
const LOCK_GROUP_ID = "cert-lock-group";
const HARD_LOCK_LINE_1 = "틀린 번호가 너무 여러 번 들어와 확인이 잠겼습니다";

const STEP_TITLE: Record<Step["kind"], string> = {
  pick: "이름 고르기",
  verify: "전화번호 확인",
  form: "확인증 입력",
  submitted: "제출됨",
  alreadySubmitted: "이미 제출",
  closed: "링크 닫힘",
};

const LINE_TEXT = {
  unknown: "확인 결과를 받지 못했습니다 · 다시 눌러 주세요",
  throttled: "확인이 잠시 멈췄습니다 · 잠시 뒤 다시 눌러 주세요",
} as const;

const BLOCKED_FIRST = "뒤 4자리 숫자를 적으면 확인할 수 있습니다";

function memoryStepOf(step: Step): HistoryStep | null {
  if (step.kind === "verify") return "verify";
  if (step.kind === "form") return "form";
  if (step.kind === "pick") return null;
  return "result";
}

function readHistoryStep(state: unknown): HistoryStep | null {
  if (typeof state !== "object" || state === null || !("step" in state)) return null;
  const value = (state as { step?: unknown }).step;
  return value === "verify" || value === "form" || value === "result" ? value : null;
}

// 서버 왕복 공통 — 20초 안에 답이 없거나 연결이 끊기면 undefined(결과 불명).
async function withDeadline<T>(call: () => Promise<T>): Promise<T | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<undefined>((resolve) => {
    timer = setTimeout(() => resolve(undefined), RESPONSE_TIMEOUT_MS);
  });
  try {
    return await Promise.race([call(), timeout]);
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}

// E6-b 링크 닫힘 — 서버가 준 사유의 문장(UI-SPEC Copywriting E6-b). 진입(page)과
// 서버 왕복(E2 · E3) 모두 이 블록을 그린다.
export function ClosedResult({
  reason,
  at,
  managerName,
  contactPhone,
}: {
  reason: ClosedReason;
  at: string;
  managerName: string;
  contactPhone: string;
}) {
  const reasonText =
    reason === "all_submitted"
      ? "당첨자 모두 제출했습니다"
      : reason === "manual"
        ? "담당자가 접수를 마쳤습니다"
        : `제출 기한 ${formatSubmittedAtKst(at)}이 지났습니다`;
  return (
    <section className={styles.resultBlock}>
      <p id={RESULT_LEAD_ID} tabIndex={-1} className={styles.resultLead}>
        이 링크는 닫혔습니다
      </p>
      <p className={styles.resultMuted}>
        {reasonText} · 확인이 필요하면 담당자 {managerName} · PLANT8 경영관리{" "}
        <a href={`tel:${contactPhone}`} className={styles.telLink}>
          {formatContactPhone(contactPhone)}
        </a>
        에 전화해 주세요
      </p>
    </section>
  );
}

export function IntakeFlow({ token, eventName, wonOn, rows, managerName, contactPhone }: IntakeFlowProps) {
  const [step, setStep] = useState<Step>({ kind: "pick" });
  const [pendingRowId, setPendingRowId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showProgress, setShowProgress] = useState(false);
  const stepRef = useRef<Step>(step);
  const focusRef = useRef<FocusTarget | null>(null);
  const lastRowRef = useRef<string | null>(null);
  // 멱등 키는 시도 단위 — 확정 판정을 받을 때만 끝난다(UI-SPEC E1 「멱등 키」).
  const pendingKeyRef = useRef<{ key: string; rowId: string; last4: string } | null>(null);
  const submitAreaId = useId();
  const lockLine2Id = useId();
  const resultLineId = useId();
  const lockLine1InGroupId = useId();
  const lockLine2InGroupId = useId();
  const recheckFailId = useId();
  const [recheckBusy, setRecheckBusy] = useState(false);
  const recheckInFlightRef = useRef(false);
  const [draft, setDraft] = useState<FormDraft | null>(null);

  // U12 — 문의 전화는 어디서나 tel: 링크(숫자만)로 건다, 보이는 값은 하이픈 표기.
  const contactLine: ReactNode = (
    <>
      PLANT8 경영관리{" "}
      <a href={`tel:${contactPhone}`} className={styles.telLink}>
        {formatContactPhone(contactPhone)}
      </a>
    </>
  );

  // 진행 바 — 300ms 안에 끝나면 보이지 않는다(UI-SPEC E1 LOADING). 왕복을
  // 시작하는 쪽이 showProgress를 먼저 거짓으로 되돌린다.
  const inFlight = busy || pendingRowId !== null;
  useEffect(() => {
    if (!inFlight) return;
    const timer = setTimeout(() => setShowProgress(true), PROGRESS_DELAY_MS);
    return () => clearTimeout(timer);
  }, [inFlight]);

  useEffect(() => {
    stepRef.current = step;
  }, [step]);

  // 단계 전환 — 제목과 포커스(UI-SPEC E1 「포커스 이동」).
  useEffect(() => {
    document.title = `${STEP_TITLE[step.kind]} · ${TITLE}`;
    const target = focusRef.current;
    if (!target) return;
    focusRef.current = null;
    if (target === "input") document.getElementById(LAST4_FIELD_ID)?.focus();
    else if (target === "result") document.getElementById(RESULT_LEAD_ID)?.focus();
    else if (target === "primary") document.getElementById(PRIMARY_ID)?.focus();
    else if (target === "prize") document.getElementById(PRIZE_ID)?.focus();
    else if (target === "group") document.getElementById(LOCK_GROUP_ID)?.focus();
    else if (target === "row" && lastRowRef.current) {
      document.querySelector<HTMLButtonElement>(`[data-row-id="${lastRowRef.current}"]`)?.focus();
    }
  }, [step]);

  // 기록 항목 — E2 항목으로 돌아오면 E3 · E4 메모리를 비우고, 메모리에 없는 뒤
  // 단계 항목(앞으로 가기 · 새로 고침 · bfcache 복원)이면 E2를 그리고 뒤로 간다.
  useEffect(() => {
    function backToPick() {
      pendingKeyRef.current = null;
      setDraft(null);
      focusRef.current = "row";
      setStep({ kind: "pick" });
    }
    function onPopState(event: PopStateEvent) {
      const stateStep = readHistoryStep(event.state);
      if (stateStep === null) {
        backToPick();
        return;
      }
      const decision = resolveHistoryEntry({ stateStep, memoryStep: memoryStepOf(stateRefCurrent()) });
      if (decision.back) {
        backToPick();
        history.back();
      }
    }
    function onPageShow(event: PageTransitionEvent) {
      if (!event.persisted) return;
      // bfcache 복원은 메모리가 남아 있어도 확인 상태를 버린다.
      const decision = resolveHistoryEntry({ stateStep: readHistoryStep(history.state), memoryStep: null });
      backToPick();
      if (decision.back) history.back();
    }
    function stateRefCurrent(): Step {
      return stepRef.current;
    }
    const initial = resolveHistoryEntry({ stateStep: readHistoryStep(history.state), memoryStep: null });
    if (initial.back) history.back();
    window.addEventListener("popstate", onPopState);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      window.removeEventListener("popstate", onPopState);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, []);

  // 짧은 잠김 풀림 — 마감 도달 또는 화면이 다시 보일 때 지났으면.
  const shortLock = step.kind === "verify" && step.lock?.kind === "short" ? step.lock : undefined;
  useEffect(() => {
    if (!shortLock) return;
    const deadline = shortLock.deadline;
    function unlockIfDue() {
      if (Date.now() < deadline) return;
      const active = document.activeElement;
      const area = document.getElementById(submitAreaId);
      // 포커스가 문서 바깥 · 잠김 표시 자리 안(1차 포함)이면 칸으로, 다른 곳이면 그대로.
      if (!active || active === document.body || (area?.contains(active) ?? false)) focusRef.current = "input";
      setStep((current) =>
        current.kind === "verify" ? { ...current, lock: undefined, fieldError: undefined } : current,
      );
    }
    const timer = setTimeout(unlockIfDue, Math.max(0, deadline - Date.now()));
    function onVisible() {
      if (document.visibilityState === "visible") unlockIfDue();
    }
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pageshow", unlockIfDue);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pageshow", unlockIfDue);
    };
  }, [shortLock, submitAreaId]);

  function toResult(next: Step) {
    setDraft(null);
    history.replaceState({ step: "result" }, "");
    focusRef.current = "result";
    setStep(next);
  }

  async function pick(row: IntakeRowDto) {
    if (pendingRowId !== null) return;
    lastRowRef.current = row.rowId;
    setDraft(null);
    setStep({ kind: "pick" });
    setShowProgress(false);
    setPendingRowId(row.rowId);
    const result = await withDeadline(() => selectWinnerAction({ token, rowId: row.rowId }));
    setPendingRowId(null);
    const data = result?.data;
    if (data?.kind === "ok") {
      history.pushState({ step: "verify" }, "");
      pendingKeyRef.current = null;
      if (data.hardLocked) {
        focusRef.current = "group";
        setStep({ kind: "verify", rowId: row.rowId, maskedName: data.maskedName, last4: "", lock: { kind: "hard" } });
        return;
      }
      if (data.locked) {
        focusRef.current = "primary";
        setStep({
          kind: "verify",
          rowId: row.rowId,
          maskedName: data.maskedName,
          last4: "",
          lock: {
            kind: "short",
            limit: data.locked.limit,
            unlockAtDisplay: data.locked.unlockAtDisplay,
            deadline: deadlineAfter(data.locked.remainingSeconds),
          },
        });
        return;
      }
      focusRef.current = "input";
      setStep({ kind: "verify", rowId: row.rowId, maskedName: data.maskedName, last4: "" });
      return;
    }
    if (data?.kind === "closed") {
      toResult({ kind: "closed", reason: data.reason, at: data.at });
      return;
    }
    focusRef.current = "row";
    setStep({ kind: "pick", error: true });
  }

  async function verify() {
    const current = stepRef.current;
    if (current.kind !== "verify" || busy || current.lock || current.last4.length !== 4) return;
    const reused = pendingKeyRef.current;
    const key =
      reused && reused.rowId === current.rowId && reused.last4 === current.last4 ? reused.key : randomIdemKey();
    pendingKeyRef.current = { key, rowId: current.rowId, last4: current.last4 };
    setShowProgress(false);
    setBusy(true);
    const result = await withDeadline(() =>
      verifyLast4Action({ token, rowId: current.rowId, last4: current.last4, idemKey: key }),
    );
    setBusy(false);
    // 그사이 E2로 돌아갔거나(뒤로 가기) 다른 이름을 골랐으면 늦은 응답을 버린다 —
    // 화면 · 기록 항목을 건드리지 않는다(Opus 검토 M1).
    const latest = stepRef.current;
    if (latest.kind !== "verify" || latest.rowId !== current.rowId || pendingKeyRef.current?.key !== key) return;
    if (isDefiniteResult(result)) pendingKeyRef.current = null;
    const data = result?.data;
    const base: VerifyStep = {
      ...current,
      fieldError: undefined,
      line: undefined,
      lock: undefined,
      recheckError: undefined,
    };

    if (data?.kind === "ok") {
      history.replaceState({ step: "form" }, "");
      focusRef.current = "prize";
      const terms = { consentVersion: data.consent.version, retentionYears: data.consent.retentionYears };
      setDraft((kept) => restoreDraft(kept, current.rowId, terms) ?? emptyDraft(current.rowId, terms));
      setStep({
        kind: "form",
        rowId: current.rowId,
        proof: data.proof,
        prizeLine: data.prizeLine,
        delivery: data.delivery,
        consentVersion: data.consent.version,
        retentionYears: data.consent.retentionYears,
        winnerVersion: data.version,
      });
    } else if (data?.kind === "submitted") {
      toResult({ kind: "alreadySubmitted", maskedName: data.maskedName, submittedAt: data.submittedAt });
    } else if (data?.kind === "closed") {
      toResult({ kind: "closed", reason: data.reason, at: data.at });
    } else if (data?.kind === "wrong") {
      focusRef.current = "input";
      setStep({ ...base, last4: "", fieldError: { kind: "wrong", remaining: data.remaining } });
    } else if (data?.kind === "locked") {
      setStep({
        ...base,
        last4: "",
        lock: {
          kind: "short",
          limit: data.limit,
          unlockAtDisplay: data.unlockAtDisplay,
          deadline: deadlineAfter(data.remainingSeconds),
        },
      });
    } else if (data?.kind === "hardLocked") {
      focusRef.current = "group";
      setStep({ ...base, last4: "", lock: { kind: "hard" } });
    } else if (data?.kind === "expiredProof") {
      focusRef.current = "input";
      setStep({ ...base, last4: "", fieldError: { kind: "expired" } });
    } else if (data?.kind === "notFound") {
      // 링크 · 자리가 없어졌다 — 이름 고르기 실패와 같이 E2 오류 줄로 돌아간다.
      history.replaceState(null, "");
      focusRef.current = "row";
      setStep({ kind: "pick", error: true });
    } else if (data?.kind === "throttled") {
      setStep({ ...base, fieldError: current.fieldError, line: "throttled" });
    } else {
      // 결과 불명(연결 끊김 · 20초 · 5xx · serverError) — 4자리 유지 · 같은 키로 다시.
      setStep({ ...base, fieldError: current.fieldError, line: "unknown" });
    }
  }

  // 누적 잠김 복구 길 — 잠금 상태만 서버에 다시 묻는다(읽기 · 한 번에 하나).
  async function recheck(trigger: RecheckTrigger) {
    const current = stepRef.current;
    if (current.kind !== "verify" || current.lock?.kind !== "hard" || recheckInFlightRef.current) return;
    recheckInFlightRef.current = true;
    if (trigger === "button") {
      // 누르는 즉시(응답 전) 실패 줄과 그 연결을 지운다.
      setRecheckBusy(true);
      setStep({ ...current, recheckError: false });
    }
    const result = await withDeadline(() => recheckLockAction({ token, rowId: current.rowId }));
    recheckInFlightRef.current = false;
    if (trigger === "button") setRecheckBusy(false);
    const latest = stepRef.current;
    if (latest.kind !== "verify" || latest.rowId !== current.rowId || latest.lock?.kind !== "hard") return;
    const outcome = recheckOutcome(result, trigger);
    const data = result?.data;
    if (outcome.next === "closed" && data?.kind === "closed") {
      toResult({ kind: "closed", reason: data.reason, at: data.at });
      return;
    }
    if (outcome.next === "open") {
      focusRef.current = "input";
      setStep({ ...latest, last4: "", lock: undefined, fieldError: undefined, line: undefined, recheckError: false });
      return;
    }
    if (outcome.next === "shortLock" && data?.kind === "shortLocked") {
      focusRef.current = "group";
      setStep({
        ...latest,
        recheckError: false,
        lock: {
          kind: "short",
          limit: data.limit,
          unlockAtDisplay: data.unlockAtDisplay,
          deadline: deadlineAfter(data.remainingSec),
          inGroup: true,
        },
      });
      return;
    }
    if (outcome.next === "networkError") {
      focusRef.current = "group";
      setStep({ ...latest, recheckError: true });
      return;
    }
    if (outcome.focus === "group") {
      focusRef.current = "group";
      setStep({ ...latest, recheckError: false });
    }
  }

  const recheckRef = useRef(recheck);
  useEffect(() => {
    recheckRef.current = recheck;
  });

  // 누적 잠김인 동안만 화면이 다시 보일 때 조용히 다시 묻는다.
  const hardLocked = step.kind === "verify" && step.lock?.kind === "hard";
  useEffect(() => {
    if (!hardLocked) return;
    function onVisible() {
      if (document.visibilityState === "visible") void recheckRef.current("visible");
    }
    function onPageShow() {
      void recheckRef.current("visible");
    }
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [hardLocked]);

  const progressBar = showProgress && inFlight ? <div className={styles.progress} aria-hidden="true" /> : null;

  if (step.kind === "pick") {
    return (
      <div>
        {progressBar}
        <h1 className={styles.title}>{TITLE}</h1>
        <p className={styles.subtitle}>
          {eventName} · {wonOn} 당첨
        </p>
        <p className={styles.listLabel}>이름을 골라 주세요 · {rows.length}명</p>
        {step.error ? (
          <p role="alert" className={styles.blockedDanger}>
            이름을 불러오지 못했습니다 · 잠시 뒤 다시 골라 주세요
          </p>
        ) : null}
        <ul className={styles.pickList}>
          {rows.map((row) => (
            <li key={row.rowId}>
              <button
                type="button"
                data-row-id={row.rowId}
                className={styles.pickRow}
                aria-disabled={pendingRowId !== null || undefined}
                onClick={() => void pick(row)}
              >
                <span>{row.maskedName}</span>
                {pendingRowId === row.rowId ? <span aria-hidden="true">…</span> : null}
                {pendingRowId === row.rowId ? <span className="sr-only">처리 중</span> : null}
                {row.prizeLine ? (
                  <span className={styles.pickRowSecondLine}>
                    {row.prizeLine}
                    {row.label ? ` · ${row.label}` : ""}
                  </span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
        <p className={styles.inquiryLine}>목록에 이름이 없으면 {contactLine}에 전화해 주세요</p>
      </div>
    );
  }

  if (step.kind === "verify") {
    const lock = step.lock;
    const locked = Boolean(lock);
    const hasFour = step.last4.length === 4;
    const disabled = locked || !hasFour;
    const shortLockText =
      lock?.kind === "short"
        ? `틀린 번호가 ${lock.limit}번 들어와 확인이 잠겼습니다 · ${lock.unlockAtDisplay}부터 다시 해 주세요`
        : undefined;
    // 묶음 안 잠김(누적 잠김 · 복구 길에서 온 짧은 잠김)은 1차가 disabledReason 없이
    // 묶음 안 두 <p> id만 가리킨다 — 묶음 id도 실패 줄 id도 아니다(4차 E3 계약).
    const inGroup = lock?.kind === "hard" || (lock?.kind === "short" && lock.inGroup === true);
    const fieldErrorText =
      step.fieldError?.kind === "wrong"
        ? `전화번호 뒤 4자리가 맞지 않습니다 · 다시 적어 주세요 · 남은 횟수 ${step.fieldError.remaining}번`
        : step.fieldError?.kind === "expired"
          ? "확인 시간이 지났습니다 · 전화번호 뒤 4자리를 다시 적어 주세요"
          : undefined;
    const describedBy = inGroup
      ? `${lockLine1InGroupId} ${lockLine2InGroupId}`
      : locked
        ? lockLine2Id
        : !disabled && step.line
          ? resultLineId
          : undefined;
    return (
      <div>
        {progressBar}
        <h1 className={styles.title}>{TITLE}</h1>
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void verify();
          }}
        >
          <p className={styles.fieldLabel}>이름</p>
          <div className={styles.verifyNameRow}>
            <span className={styles.verifyName}>{step.maskedName}</span>
            <Button
              variant="tertiary"
              disabled={busy}
              aria-describedby={busy ? PRIMARY_ID : undefined}
              onClick={() => history.back()}
            >
              다른 이름 고르기
            </Button>
          </div>
          <div aria-live="polite">
            <TextField
              id={LAST4_FIELD_ID}
              label="전화번호 뒤 4자리"
              size="external"
              inputMode="numeric"
              autoComplete="off"
              placeholder="0000"
              maxLength={4}
              disabled={locked}
              value={step.last4}
              onChange={(e) => {
                const last4 = e.target.value.replace(/\D/g, "").slice(0, 4);
                setStep({ ...step, last4, line: undefined });
              }}
              error={fieldErrorText}
            />
          </div>
          <div id={submitAreaId} className={styles.stickySubmit}>
            <Button
              id={PRIMARY_ID}
              type="submit"
              variant="primary"
              size="external"
              disabled={disabled}
              disabledReason={inGroup ? undefined : (shortLockText ?? BLOCKED_FIRST)}
              reasonTone={locked ? "block" : "info"}
              pending={busy}
              aria-describedby={describedBy}
            >
              전화번호 확인
            </Button>
            {lock?.kind === "short" && !inGroup ? (
              <p id={lockLine2Id} className={styles.inquiryLine}>
                등록한 번호가 다르면 {contactLine}에 전화해 주세요
              </p>
            ) : null}
            <div aria-live="polite">
              {!disabled && step.line ? (
                <p id={resultLineId} className={styles.blockedDanger}>
                  {LINE_TEXT[step.line]}
                </p>
              ) : null}
            </div>
            {/* 잠김 알림 묶음 — aria-live 없음(포커스 이동이 낭독을 대신한다, 4차). */}
            <div id={LOCK_GROUP_ID} tabIndex={-1}>
              {lock?.kind === "hard" ? (
                <>
                  <p id={lockLine1InGroupId} className={styles.blockedDanger}>
                    {HARD_LOCK_LINE_1}
                  </p>
                  <p id={lockLine2InGroupId} className={styles.inquiryLine}>
                    담당자 {managerName} · {contactLine}에 전화해 주세요
                  </p>
                  <Button
                    variant="secondary"
                    pending={recheckBusy}
                    aria-describedby={step.recheckError ? recheckFailId : undefined}
                    onClick={() => void recheck("button")}
                  >
                    잠금 확인
                  </Button>
                  {step.recheckError ? (
                    <p id={recheckFailId} className={styles.blockedDanger}>
                      {LINE_TEXT.unknown}
                    </p>
                  ) : null}
                </>
              ) : null}
              {lock?.kind === "short" && inGroup ? (
                <>
                  <p id={lockLine1InGroupId} className={styles.blockedDanger}>
                    {shortLockText}
                  </p>
                  <p id={lockLine2InGroupId} className={styles.inquiryLine}>
                    등록한 번호가 다르면 {contactLine}에 전화해 주세요
                  </p>
                </>
              ) : null}
            </div>
          </div>
        </form>
      </div>
    );
  }

  if (step.kind === "form") {
    // 값의 주인은 같은 자리의 draft — 확인 통과와 같은 순간에 선다.
    if (draft?.rowId !== step.rowId) return null;
    return (
      <div>
        {progressBar}
        <h1 className={styles.title}>{TITLE}</h1>
        <IntakeForm
          token={token}
          step={step}
          draft={draft}
          busy={busy}
          contactLine={contactLine}
          stepRef={stepRef}
          onDraft={(patch) => setDraft((d) => (d && d.rowId === step.rowId ? { ...d, ...patch } : d))}
          onBusy={(value) => {
            if (value) setShowProgress(false);
            setBusy(value);
          }}
          onSaved={(data) =>
            toResult({
              kind: "submitted",
              name: data.name,
              submittedAt: data.submittedAt,
              prizeLine: data.prizeLine,
              delivery: data.delivery,
            })
          }
          onAlreadySubmitted={(maskedName, submittedAt) => toResult({ kind: "alreadySubmitted", maskedName, submittedAt })}
          onClosed={(reason, at) => toResult({ kind: "closed", reason, at })}
          onExpired={() => {
            // E4 → E3(값은 draft에 남는다 — 같은 자리 재확인이 되살린다).
            history.replaceState({ step: "verify" }, "");
            pendingKeyRef.current = null;
            focusRef.current = "input";
            setStep({
              kind: "verify",
              rowId: step.rowId,
              maskedName: rows.find((r) => r.rowId === step.rowId)?.maskedName ?? "",
              last4: "",
              fieldError: { kind: "expired" },
            });
          }}
          onNotFound={() => {
            history.replaceState(null, "");
            setDraft(null);
            focusRef.current = "row";
            setStep({ kind: "pick", error: true });
          }}
        />
      </div>
    );
  }

  if (step.kind === "closed") {
    return (
      <div>
        <h1 className={styles.title}>{TITLE}</h1>
        <ClosedResult reason={step.reason} at={step.at} managerName={managerName} contactPhone={contactPhone} />
      </div>
    );
  }

  if (step.kind === "submitted") {
    return (
      <div>
        <h1 className={styles.title}>{TITLE}</h1>
        <section className={styles.resultBlock} aria-live="polite">
          <p id={RESULT_LEAD_ID} tabIndex={-1} className={styles.resultLead}>
            제출되었습니다 · 다시 제출할 수 없습니다
          </p>
          <p className={styles.resultMuted}>
            {step.name} · {formatSubmittedAtKst(step.submittedAt)} 제출 · {step.prizeLine}{" "}
            {step.delivery === "parcel" ? "적은 주소로 보내 드립니다" : "현장 수령"}
          </p>
          <p className={styles.resultMuted}>
            확인이 필요하면 담당자 {managerName} · {contactLine}에 전화해 주세요
          </p>
        </section>
      </div>
    );
  }

  // alreadySubmitted
  return (
    <div>
      <h1 className={styles.title}>{TITLE}</h1>
      <section className={styles.resultBlock}>
        <p id={RESULT_LEAD_ID} tabIndex={-1} className={styles.resultLead}>
          이미 제출하셨습니다
        </p>
        <p className={styles.resultMuted}>
          {step.maskedName} · {formatSubmittedAtKst(step.submittedAt)} 제출됨. 내용을 고치려면 담당자 {managerName} ·{" "}
          {contactLine}에 전화해 주세요
        </p>
      </section>
    </div>
  );
}

const FIELD_LABEL: Record<SubmitField, string> = {
  name: "이름",
  rrn: "주민등록번호",
  address: "주소",
  phone: "연락처",
  consent: "동의",
  signature: "서명",
};

const FIELD_FOCUS_ID: Record<SubmitField, string> = {
  name: "name",
  rrn: RRN_FRONT_ID,
  address: "address",
  phone: "phone",
  consent: CONSENT_CHECKBOX_ID,
  signature: "cert-signature",
};

const RRN_ERROR = "주민등록번호가 맞지 않습니다 · 앞 6자리(생년월일)와 뒤 7자리를 다시 확인해 주세요";
const PHONE_ERROR = "연락처 형식이 아닙니다 · 010-0000-0000처럼 적어 주세요";
const SUBMIT_UNKNOWN = "제출됐는지 확인하지 못했습니다 · 다시 눌러 주세요 · 적은 내용은 남아 있습니다";

// 칸 오류 제출 줄 — §6-5 확정 문장 `주민등록번호를 고쳐 주세요 · 나머지는 채워졌습니다`의
// 꼴로 틀린 칸 이름을 나열한다(받침에 맞는 을/를).
function fixFieldsLine(fields: readonly SubmitField[]): string | undefined {
  const names = fields.filter((f) => f !== "signature" && f !== "consent").map((f) => FIELD_LABEL[f]);
  if (names.length === 0) return undefined;
  const last = names[names.length - 1] ?? "";
  const code = last.charCodeAt(last.length - 1) - 0xac00;
  const particle = code >= 0 && code <= 11171 && code % 28 !== 0 ? "을" : "를";
  return `${names.join(" · ")}${particle} 고쳐 주세요 · 나머지는 채워졌습니다`;
}

type SavedData = { name: string; submittedAt: string; prizeLine: string; delivery: "onsite" | "parcel" };

function IntakeForm({
  token,
  step,
  draft,
  busy,
  contactLine,
  stepRef,
  onDraft,
  onBusy,
  onSaved,
  onAlreadySubmitted,
  onClosed,
  onExpired,
  onNotFound,
}: {
  token: string;
  step: Extract<Step, { kind: "form" }>;
  draft: FormDraft;
  busy: boolean;
  contactLine: ReactNode;
  stepRef: { current: Step };
  onDraft: (patch: Partial<FormDraft>) => void;
  onBusy: (busy: boolean) => void;
  onSaved: (data: SavedData) => void;
  onAlreadySubmitted: (maskedName: string, submittedAt: string) => void;
  onClosed: (reason: ClosedReason, at: string) => void;
  onExpired: () => void;
  onNotFound: () => void;
}) {
  const [fieldErrors, setFieldErrors] = useState<SubmitField[]>([]);
  const [rrnMessage, setRrnMessage] = useState<string | undefined>(undefined);
  const [unknownLine, setUnknownLine] = useState(false);
  const signatureRef = useRef<SignaturePadHandle>(null);
  const focusFieldRef = useRef<SubmitField | null>(null);
  // 멱등 키는 시도 단위 — 결과 불명이고 보낼 본문이 그대로일 때만 같은 키를 다시 쓴다.
  const pendingSubmitRef = useRef<{ key: string; fingerprint: string } | null>(null);
  const dangerLineId = useId();
  const parcel = step.delivery === "parcel";

  useEffect(() => {
    const field = focusFieldRef.current;
    if (!field) return;
    focusFieldRef.current = null;
    document.getElementById(FIELD_FOCUS_ID[field])?.focus();
  }, [fieldErrors, rrnMessage]);

  // 「서명 있음」은 서명 칸이 잉크 픽셀로 정한다(서버와 같은 함수 · 상수) · 「다시 쓰기」는 잉크가 조금이라도 있으면.
  const [signed, setSigned] = useState(false);
  const hasInk = draft.strokes.some((s) => s.length > 0);
  const missingFields: string[] = [];
  if (!draft.name.trim()) missingFields.push("이름");
  if (!(draft.rrnFront6.length === 6 && draft.rrnBack7.length === 7)) missingFields.push("주민등록번호");
  if (parcel && !draft.address.trim()) missingFields.push("주소");
  if (!draft.phone.trim()) missingFields.push("연락처");
  if (!draft.consent) missingFields.push("동의");
  if (!signed) missingFields.push("서명");
  const canSubmit = missingFields.length === 0;
  const blockedReason = submitBlockedReason(missingFields);

  const fixLine = fixFieldsLine(fieldErrors);
  const dangerLine = unknownLine ? SUBMIT_UNKNOWN : fixLine;

  function edit(field: SubmitField, patch: Partial<FormDraft>) {
    onDraft(patch);
    setUnknownLine(false);
    if (fieldErrors.includes(field)) setFieldErrors((list) => list.filter((f) => f !== field));
    if (field === "rrn") setRrnMessage(undefined);
  }

  function showFieldErrors(fields: SubmitField[]) {
    if (fields.includes("signature")) signatureRef.current?.clear();
    setRrnMessage(fields.includes("rrn") ? RRN_ERROR : undefined);
    focusFieldRef.current = fields[0] ?? null;
    setFieldErrors(fields);
  }

  async function submit() {
    if (busy || !canSubmit) return;
    const rrn = `${draft.rrnFront6}${draft.rrnBack7}`;
    const body = {
      token,
      rowId: step.rowId,
      proof: step.proof,
      name: draft.name,
      rrnFront6: draft.rrnFront6,
      rrnBack7: draft.rrnBack7,
      phone: draft.phone,
      address: parcel ? draft.address : undefined,
      consent: true as const,
      signaturePngBase64: signatureRef.current?.toPngBase64() ?? "",
      winnerVersion: step.winnerVersion,
      consentVersion: step.consentVersion,
      retentionYears: step.retentionYears,
      rrnRecheckConfirmed: nextRrnRecheckConfirmed({ armedRrn: draft.armedRrn, rrn }),
    };
    const fingerprint = JSON.stringify(body);
    const reused = pendingSubmitRef.current;
    const key = reused && reused.fingerprint === fingerprint ? reused.key : randomIdemKey();
    pendingSubmitRef.current = { key, fingerprint };
    onBusy(true);
    const result = await withDeadline(() => submitCertificateAction({ ...body, idempotencyKey: key }));
    onBusy(false);
    // 그사이 E4를 떠났으면 늦은 응답을 버린다.
    const latest = stepRef.current;
    if (latest.kind !== "form" || latest.rowId !== step.rowId || pendingSubmitRef.current?.key !== key) return;
    if (isDefiniteResult(result)) pendingSubmitRef.current = null;
    setUnknownLine(false);

    const data = result?.data;
    if (result?.validationErrors) {
      const outcome = submitOutcomeFromValidationErrors(result.validationErrors);
      if (outcome?.kind === "invalid") showFieldErrors(outcome.fields);
      else if (outcome?.kind === "expiredProof") onExpired();
      else setUnknownLine(true);
      return;
    }
    if (data?.kind === "saved") {
      onSaved(data);
    } else if (data?.kind === "invalid") {
      showFieldErrors(data.fields.filter((f): f is SubmitField => f in FIELD_LABEL));
    } else if (data?.kind === "rrnRecheck") {
      onDraft({ armedRrn: rrn });
      showFieldErrors(["rrn"]);
    } else if (data?.kind === "expiredProof") {
      onExpired();
    } else if (data?.kind === "alreadySubmitted") {
      onAlreadySubmitted(data.maskedName, data.submittedAt);
    } else if (data?.kind === "closed") {
      onClosed(data.reason, data.at);
    } else if (data?.kind === "notFound") {
      onNotFound();
    } else {
      // 결과 불명(연결 끊김 · 20초 · 5xx · serverError · 해석 불가) — 값 그대로 · 같은 키로 다시.
      setUnknownLine(true);
    }
  }

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <div id={PRIZE_ID} tabIndex={-1} className={styles.prizeBlock}>
        <span className={styles.prizeLabel}>경품</span>
        <span className={styles.prizeValue}>{step.prizeLine}</span>
      </div>
      <p className={styles.prizeInquiry}>경품이나 받는 방법이 다르면 제출하기 전에 {contactLine}에 전화해 주세요</p>

      <div className={styles.formFields}>
        <TextField
          id="name"
          label="이름"
          size="external"
          maxLength={40}
          value={draft.name}
          className={fieldErrors.includes("name") ? styles.fieldInvalid : undefined}
          onChange={(e) => edit("name", { name: e.target.value })}
        />

        <RrnFields
          front={draft.rrnFront6}
          back={draft.rrnBack7}
          error={rrnMessage}
          onChange={({ front, back }) => edit("rrn", { rrnFront6: front, rrnBack7: back })}
        />

        {parcel ? (
          <div className={styles.fieldRow}>
            <label htmlFor="address" className={styles.fieldLabel}>
              주소 <span className={styles.labelSub}>택배로 보내 드립니다</span>
            </label>
            <input
              id="address"
              maxLength={200}
              placeholder="도로명 주소"
              value={draft.address}
              aria-invalid={fieldErrors.includes("address") || undefined}
              className={fieldErrors.includes("address") ? `${styles.textInput} ${styles.fieldInvalid}` : styles.textInput}
              onChange={(e) => edit("address", { address: e.target.value })}
            />
          </div>
        ) : null}

        <TextField
          id="phone"
          label="연락처"
          size="external"
          inputMode="tel"
          maxLength={40}
          placeholder="010-0000-0000"
          value={draft.phone}
          onChange={(e) => edit("phone", { phone: e.target.value })}
          error={fieldErrors.includes("phone") ? PHONE_ERROR : undefined}
        />
      </div>

      <ConsentBlock
        checked={draft.consent}
        parcel={parcel}
        retentionYears={step.retentionYears}
        invalid={fieldErrors.includes("consent")}
        onChange={(consent) => edit("consent", { consent })}
      />

      <div className={styles.fieldRow}>
        <span className={styles.fieldLabel}>서명</span>
        <SignaturePad
          ref={signatureRef}
          id={FIELD_FOCUS_ID.signature}
          strokes={draft.strokes}
          onStrokesChange={(strokes) => edit("signature", { strokes })}
          onSignedChange={setSigned}
        />
        {hasInk ? (
          <div className={styles.signatureRedo}>
            <Button variant="tertiary" onClick={() => signatureRef.current?.clear()}>
              다시 쓰기
            </Button>
          </div>
        ) : null}
      </div>

      <div className={styles.stickySubmit}>
        <Button
          type="submit"
          variant="primary"
          size="external"
          disabled={!canSubmit}
          disabledReason={blockedReason}
          reasonTone="info"
          pending={busy}
          aria-describedby={dangerLine ? dangerLineId : undefined}
        >
          확인증 제출
        </Button>
        <div aria-live="polite">
          {dangerLine ? (
            <p id={dangerLineId} className={styles.blockedDanger}>
              {dangerLine}
            </p>
          ) : null}
        </div>
      </div>
    </form>
  );
}
