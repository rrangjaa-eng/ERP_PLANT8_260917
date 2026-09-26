"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useAction } from "next-safe-action/hooks";
import { Button } from "@/ui/button/Button";
import { TextField } from "@/ui/input/TextField";
import { formatContactPhone, formatSubmittedAtKst } from "@/domain/certs/format";
import { recheckLockAction, selectWinnerAction, submitCertificateAction, verifyLast4Action } from "./actions";
import {
  invalidSubmitField,
  isDefiniteResult,
  recheckOutcome,
  resolveHistoryEntry,
  type HistoryStep,
  type RecheckTrigger,
} from "./flow-rules";
import { SignaturePad, type SignaturePadHandle } from "./signature-pad";
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
      rrnRecheck: boolean;
    }
  | { kind: "submitted"; name: string; submittedAt: string; prizeLine: string; delivery: "onsite" | "parcel" }
  | { kind: "alreadySubmitted"; maskedName: string; submittedAt: string }
  | { kind: "closed"; reason: ClosedReason; at: string };

type FocusTarget = "input" | "row" | "result" | "prize" | "primary" | "group";

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
    history.replaceState({ step: "result" }, "");
    focusRef.current = "result";
    setStep(next);
  }

  async function pick(row: IntakeRowDto) {
    if (pendingRowId !== null) return;
    lastRowRef.current = row.rowId;
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
      setStep({
        kind: "form",
        rowId: current.rowId,
        proof: data.proof,
        prizeLine: data.prizeLine,
        delivery: data.delivery,
        consentVersion: data.consent.version,
        retentionYears: data.consent.retentionYears,
        rrnRecheck: false,
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
                disabled={pendingRowId !== null}
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
            {!disabled && step.line ? (
              <p id={resultLineId} className={styles.blockedDanger}>
                {LINE_TEXT[step.line]}
              </p>
            ) : null}
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
    return (
      <div>
        <h1 className={styles.title}>{TITLE}</h1>
        <IntakeForm
          token={token}
          step={step}
          contactLine={contactLine}
          onSubmitted={(name, submittedAt) =>
            toResult({ kind: "submitted", name, submittedAt, prizeLine: step.prizeLine, delivery: step.delivery })
          }
          onExpired={() => setStep({ kind: "pick" })}
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
        <section className={styles.resultBlock}>
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

function IntakeForm({
  token,
  step,
  contactLine,
  onSubmitted,
  onExpired,
}: {
  token: string;
  step: Extract<Step, { kind: "form" }>;
  contactLine: ReactNode;
  onSubmitted: (name: string, submittedAt: string) => void;
  onExpired: () => void;
}) {
  const submitAction = useAction(submitCertificateAction);
  const [name, setName] = useState("");
  const [rrnFront6, setRrnFront6] = useState("");
  const [rrnBack7, setRrnBack7] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [consent, setConsent] = useState(false);
  const [showFullConsent, setShowFullConsent] = useState(false);
  const [rrnError, setRrnError] = useState<string | undefined>(undefined);
  const [phoneError, setPhoneError] = useState<string | undefined>(undefined);
  const [hasSignature, setHasSignature] = useState(false);
  const [rrnRecheckConfirmed, setRrnRecheckConfirmed] = useState(false);
  const signatureRef = useRef<SignaturePadHandle>(null);
  const consentSummaryId = useId();

  const missingFields: string[] = [];
  if (!name) missingFields.push("이름");
  if (!(rrnFront6.length === 6 && rrnBack7.length === 7)) missingFields.push("주민등록번호");
  if (step.delivery === "parcel" && !address) missingFields.push("주소");
  if (!phone) missingFields.push("연락처");
  if (!consent) missingFields.push("동의");
  if (!hasSignature) missingFields.push("서명");

  const canSubmit = missingFields.length === 0;
  const blockedReason =
    missingFields.length === 1 && missingFields[0] === "서명"
      ? "서명을 해 주세요"
      : missingFields.length > 0
        ? `${missingFields.join(" · ")}을 채우면 제출할 수 있습니다`
        : undefined;

  async function submit() {
    const signaturePngBase64 = signatureRef.current?.toPngBase64() ?? "";
    const result = await submitAction.executeAsync({
      token,
      rowId: step.rowId,
      proof: step.proof,
      name,
      rrnFront6,
      rrnBack7,
      phone,
      address: step.delivery === "parcel" ? address : undefined,
      consent: true,
      signaturePngBase64,
      idempotencyKey: randomIdemKey(),
      consentVersion: step.consentVersion,
      retentionYears: step.retentionYears,
      rrnRecheckConfirmed,
    });
    const data = result?.data;
    if (data?.kind === "submitted") {
      onSubmitted(data.name, data.submittedAt);
    } else if (data?.kind === "rrnRecheck") {
      setRrnError("주민등록번호가 맞지 않습니다 · 앞 6자리(생년월일)와 뒤 7자리를 다시 확인해 주세요");
      setRrnRecheckConfirmed(true);
    } else if (data?.kind === "invalid") {
      const field = invalidSubmitField(data.fields);
      if (field === "signature") {
        signatureRef.current?.clear();
      } else if (field === "phone") {
        setPhoneError("연락처 형식이 아닙니다 · 010-0000-0000처럼 적어 주세요");
      } else {
        setRrnError("주민등록번호가 맞지 않습니다 · 앞 6자리(생년월일)와 뒤 7자리를 다시 확인해 주세요");
      }
    } else if (data?.kind === "expiredProof" || data?.kind === "notFound") {
      onExpired();
    }
  }

  return (
    <div>
      <p id={PRIZE_ID} tabIndex={-1} className={styles.prizeLine}>
        {step.prizeLine}
      </p>
      <p className={styles.inquiryLine}>경품이나 받는 방법이 다르면 제출하기 전에 {contactLine}에 전화해 주세요</p>

      <TextField
        id="name"
        label="이름"
        size="external"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />

      <div className={styles.rrnRow}>
        <TextField
          id="rrn-front"
          label="주민등록번호"
          size="external"
          maxLength={6}
          inputMode="numeric"
          value={rrnFront6}
          onChange={(e) => {
            setRrnFront6(e.target.value.replace(/\D/g, "").slice(0, 6));
            setRrnRecheckConfirmed(false);
            setRrnError(undefined);
          }}
          error={rrnError}
        />
        <TextField
          id="rrn-back"
          label=""
          size="external"
          type="password"
          maxLength={7}
          inputMode="numeric"
          value={rrnBack7}
          onChange={(e) => {
            setRrnBack7(e.target.value.replace(/\D/g, "").slice(0, 7));
            setRrnRecheckConfirmed(false);
            setRrnError(undefined);
          }}
        />
      </div>

      {step.delivery === "parcel" ? (
        <>
          <p className={styles.fieldSubtitle}>택배로 보내 드립니다</p>
          <TextField id="address" label="주소" size="external" value={address} onChange={(e) => setAddress(e.target.value)} />
        </>
      ) : null}

      <TextField
        id="phone"
        label="연락처"
        size="external"
        value={phone}
        onChange={(e) => {
          setPhone(e.target.value);
          setPhoneError(undefined);
        }}
        error={phoneError}
      />

      <div className={styles.consentBlock}>
        <label className={styles.consentLabel}>
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          <span id={consentSummaryId}>
            수집 항목 이름 · 주민등록번호 · {step.delivery === "parcel" ? "주소 · " : ""}연락처 · 서명 — 기타소득 세무
            신고와 경품 전달에만 씁니다. 제출한 해가 끝나고 법정 신고기한이 지난 날부터 {step.retentionYears}년 동안
            보관한 뒤 파기합니다. 동의하지 않으면 경품을 드릴 수 없습니다.
          </span>
        </label>
        <Button variant="tertiary" aria-expanded={showFullConsent} onClick={() => setShowFullConsent((v) => !v)}>
          {showFullConsent ? "전문 접기" : "전문 보기"}
        </Button>
        {showFullConsent ? <p className={styles.consentFull}>{consentFullText(step.retentionYears)}</p> : null}
      </div>

      <SignaturePad ref={signatureRef} hasStroke={hasSignature} onChange={setHasSignature} />
      {hasSignature ? (
        <Button variant="tertiary" onClick={() => signatureRef.current?.clear()}>
          다시 쓰기
        </Button>
      ) : null}

      <div className={styles.stickySubmit}>
        <Button
          variant="primary"
          size="external"
          disabled={!canSubmit}
          disabledReason={blockedReason}
          reasonTone="info"
          pending={submitAction.isExecuting}
          onClick={() => void submit()}
        >
          확인증 제출
        </Button>
      </div>
    </div>
  );
}

function consentFullText(retentionYears: number): string {
  return `수집한 개인정보(이름·주민등록번호·주소·연락처·서명)는 기타소득 세무 신고와 경품 전달 목적으로만 사용합니다. 제출한 해가 끝나고 법정 신고기한이 지난 날부터 ${retentionYears}년 동안 보관한 뒤 파기합니다. 동의하지 않으면 경품을 드릴 수 없습니다.`;
}
