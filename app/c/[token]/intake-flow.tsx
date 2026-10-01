"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Button } from "@/ui/button/Button";
import { TextField } from "@/ui/input/TextField";
import { formatContactPhone, formatSubmittedAtKst } from "@/domain/certs/format";
import { submitCertificateAction } from "./actions";
import {
  draftAfterBack,
  isDefiniteResult,
  nextRrnRecheckConfirmed,
  resolveHistoryEntry,
  submitBlockedReason,
  submitOutcomeFromValidationErrors,
  type HistoryStep,
  type SubmitField,
} from "./flow-rules";
import { ConsentBlock, CONSENT_CHECKBOX_ID } from "./consent-block";
import { RrnFields, RRN_FRONT_ID } from "./rrn-fields";
import { SignaturePad, type SignaturePadHandle, type Stroke } from "./signature-pad";
import styles from "./intake.module.css";

// 04.3-15 — 수령자 흐름 E′2 경품 고르기 → E′4 입력 → E5(SYSTEM §6-5 · D-c). 명단 · 이름 고르기 · 전화번호
// 확인이 없다(5909578685). 서버가 보낸 경품은 불투명 id · 경품명 · 전달뿐이다(금액 칸 없음 — 5905714131).

export type IntakePrizeDto = { id: string; name: string; delivery: "onsite" | "parcel" };
export type IntakeTermsDto = { consentVersion: string; retentionYears: number };

export type IntakeFlowProps = {
  token: string;
  eventName: string;
  wonOn: string;
  prizes: IntakePrizeDto[];
  terms: IntakeTermsDto;
  managerName: string;
  contactPhone: string;
};

type ClosedReason = "expired" | "manual";

type Step =
  | { kind: "pick" }
  | { kind: "form"; prizeId: string }
  | { kind: "submitted"; name: string; submittedAt: string; prizeLine: string; delivery: "onsite" | "parcel" }
  | { kind: "closed"; reason: ClosedReason; at: string }
  | { kind: "noPrize" }
  | { kind: "notYetOpen"; eventName: string; wonOn: string; managerName: string; contactPhone: string }
  | { kind: "notFound" };

type FocusTarget = "row" | "result" | "prize" | "notice";

// E′4 값(서명 획 포함)은 같은 사람의 것이라 메모리에만 있다. 「다른 경품 고르기」로 경품을 바꾸면 주소만
// 버리고, 표시 없는 뒤로(브라우저 뒤로) · 결과 화면으로 가면 전부 버린다. armedRrn = 되물음(rrnRecheck)을
// 받은 요청이 보낸 번호.
type FormDraft = {
  name: string;
  rrnFront6: string;
  rrnBack7: string;
  phone: string;
  address: string;
  consent: boolean;
  strokes: Stroke[];
  armedRrn: string | null;
};

const EMPTY_DRAFT: FormDraft = {
  name: "",
  rrnFront6: "",
  rrnBack7: "",
  phone: "",
  address: "",
  consent: false,
  strokes: [],
  armedRrn: null,
};

function randomIdemKey(): string {
  return crypto.randomUUID();
}

const TITLE = "기타소득 지급 확인";
const RESPONSE_TIMEOUT_MS = 20_000;
const PROGRESS_DELAY_MS = 300;
const RESULT_LEAD_ID = "cert-result-lead";
const PRIZE_ID = "cert-prize";
const PRIZE_GONE_ID = "cert-prize-gone";
// 「목록에서 빠짐」과 「같은 경품의 전달 방식 바뀜」을 함께 덮는다(사용자 결정 PR #88 5928674957 — V3 a).
const PRIZE_GONE_NOTICE = "고른 경품의 내용이 바뀌었습니다 · 다시 골라 주세요";

const STEP_TITLE: Record<Step["kind"], string> = {
  pick: "경품 고르기",
  form: "확인증 입력",
  submitted: "제출됨",
  closed: "링크 닫힘",
  noPrize: "경품 없음",
  notYetOpen: "열리기 전",
  notFound: "링크 없음",
};

function memoryStepOf(step: Step): HistoryStep {
  if (step.kind === "pick") return "pick";
  if (step.kind === "form") return "form";
  return "result";
}

function readHistoryStep(state: unknown): HistoryStep | null {
  if (typeof state !== "object" || state === null || !("step" in state)) return null;
  const value = (state as { step?: unknown }).step;
  return value === "pick" || value === "form" || value === "result" ? value : null;
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

// 문의 전화 3차 링크 + 조사 「에」 — 줄바꿈 금지 묶음이라 「에」가 줄 맨 앞으로 떨어지지 않는다(04.3-16 V1).
function TelGroup({ phone }: { phone: string }) {
  return (
    <span className={styles.telGroup}>
      <a href={`tel:${phone}`} className={styles.telLink}>
        {formatContactPhone(phone)}
      </a>
      에
    </span>
  );
}

// E6-b 링크 닫힘 — 서버가 준 사유의 문장(사유 둘: 기한 · 담당자가 닫음). 진입(page)과 제출 결과 모두
// 이 블록을 그린다.
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
  const reasonText = reason === "manual" ? "담당자가 접수를 마쳤습니다" : `제출 기한 ${formatSubmittedAtKst(at)}이 지났습니다`;
  return (
    <section className={styles.resultBlock}>
      <p id={RESULT_LEAD_ID} tabIndex={-1} className={styles.resultLead}>
        이 링크는 닫혔습니다
      </p>
      <p className={styles.resultMuted}>
        {reasonText} · 확인이 필요하면 담당자 {managerName} · PLANT8 경영관리 <TelGroup phone={contactPhone} /> 전화해 주세요
      </p>
    </section>
  );
}

// E6-d 경품 없음 — 링크는 열렸는데 보낼 경품이 0(첫 진입 · 제출 중 마지막 경품이 빠짐). 1차 · 입력 없음.
export function NoPrizeResult({
  managerName,
  contactPhone,
  focusOnMount,
}: {
  managerName: string;
  contactPhone: string;
  focusOnMount?: boolean;
}) {
  useEffect(() => {
    if (focusOnMount) document.getElementById(RESULT_LEAD_ID)?.focus();
  }, [focusOnMount]);
  return (
    <section className={styles.resultBlock}>
      <p id={RESULT_LEAD_ID} tabIndex={-1} className={styles.resultLead}>
        받을 수 있는 경품이 없습니다
      </p>
      <p className={styles.resultMuted}>
        확인이 필요하면 담당자 {managerName} · PLANT8 경영관리 <TelGroup phone={contactPhone} /> 전화해 주세요
      </p>
    </section>
  );
}

// E6-e 열리기 전(E8 b — 당첨일 00:00 KST 전) — E6-b 모양: E1 공통 머리의 부제(행사 이름 · 당첨일) + 결과 블록 두 줄.
// 1차 · 입력 · 경품 목록 없음 · 자동 새로 고침 없음(시각을 재지 않는다). 첫 진입 · 제출 결과 둘 다 이 화면이다.
export function NotYetOpenResult({
  eventName,
  wonOn,
  managerName,
  contactPhone,
  focusOnMount,
}: {
  eventName: string;
  wonOn: string;
  managerName: string;
  contactPhone: string;
  focusOnMount?: boolean;
}) {
  useEffect(() => {
    if (focusOnMount) document.getElementById(RESULT_LEAD_ID)?.focus();
  }, [focusOnMount]);
  return (
    <>
      <p className={styles.subtitle}>
        {eventName} · {wonOn} 당첨
      </p>
      <section className={styles.resultBlock}>
        <p id={RESULT_LEAD_ID} tabIndex={-1} className={styles.resultLead}>
          아직 열리지 않았습니다
        </p>
        <p className={styles.resultMuted}>
          {wonOn} 00:00부터 제출할 수 있습니다 · 확인이 필요하면 담당자 {managerName} · PLANT8 경영관리{" "}
          <TelGroup phone={contactPhone} /> 전화해 주세요
        </p>
      </section>
    </>
  );
}

export function IntakeFlow({ token, eventName, wonOn, prizes, terms, managerName, contactPhone }: IntakeFlowProps) {
  const [step, setStep] = useState<Step>({ kind: "pick" });
  // 서버가 prizeGone으로 돌려준 새 목록 — E′2로 돌아온 뒤(popstate)에 바꿔 그린다.
  const [prizeList, setPrizeList] = useState<IntakePrizeDto[]>(prizes);
  const [prizeGone, setPrizeGone] = useState(false);
  const pendingPrizesRef = useRef<IntakePrizeDto[] | null>(null);
  // 서버가 termsChanged로 돌려준 새 안내 판 — 안내 블록을 새 판으로 다시 그린다(체크만 풀림).
  const [termsNow, setTermsNow] = useState<IntakeTermsDto>(terms);
  const [draft, setDraft] = useState<FormDraft>(EMPTY_DRAFT);
  const [busy, setBusy] = useState(false);
  const [showProgress, setShowProgress] = useState(false);
  const stepRef = useRef<Step>(step);
  const focusRef = useRef<FocusTarget | null>(null);
  const lastPrizeRef = useRef<string | null>(null);
  // 「다른 경품 고르기」가 부른 history.back()이면 참 — 그 popstate만 값을 남긴다(주소만 버림).
  const keepDraftRef = useRef(false);

  // U12 — 문의 전화는 어디서나 tel: 링크(숫자만)로 건다, 보이는 값은 하이픈 표기.
  const contactLine: ReactNode = (
    <>
      PLANT8 경영관리 <TelGroup phone={contactPhone} />
    </>
  );
  const inquiryText: ReactNode = (
    <>받은 경품이 목록에 없으면 제출하지 않아도 됩니다 · 확인이 필요하면 담당자 {managerName} · {contactLine} 전화해 주세요</>
  );

  // 진행 바 — 300ms 안에 끝나면 보이지 않는다(UI-SPEC E1 LOADING). 제출만 서버 왕복이다.
  useEffect(() => {
    if (!busy) return;
    const timer = setTimeout(() => setShowProgress(true), PROGRESS_DELAY_MS);
    return () => clearTimeout(timer);
  }, [busy]);

  useEffect(() => {
    stepRef.current = step;
  }, [step]);

  // 단계 전환 — 제목과 포커스(UI-SPEC E′ 「포커스 · 제목」).
  useEffect(() => {
    document.title = `${STEP_TITLE[step.kind]} · ${TITLE}`;
    const target = focusRef.current;
    if (!target) return;
    focusRef.current = null;
    if (target === "result") document.getElementById(RESULT_LEAD_ID)?.focus();
    else if (target === "prize") document.getElementById(PRIZE_ID)?.focus();
    else if (target === "notice") document.getElementById(PRIZE_GONE_ID)?.focus();
    else if (target === "row" && lastPrizeRef.current) {
      document.querySelector<HTMLButtonElement>(`[data-prize-id="${lastPrizeRef.current}"]`)?.focus();
    }
  }, [step]);

  // 기록 항목 둘(E′2 · E′4) — E′2 항목으로 돌아오면 E′2를 그리고, 메모리에 없는 뒤 단계 항목(앞으로 가기 ·
  // 새로 고침 · bfcache 복원)이면 E′2를 그리고 뒤로 간다.
  useEffect(() => {
    function backToPick(keepDraft: boolean) {
      setDraft((d) => draftAfterBack({ draft: d, empty: EMPTY_DRAFT, keep: keepDraft }));
      const nextPrizes = pendingPrizesRef.current;
      pendingPrizesRef.current = null;
      if (nextPrizes) setPrizeList(nextPrizes);
      setPrizeGone(nextPrizes !== null);
      focusRef.current = nextPrizes ? "notice" : "row";
      setStep({ kind: "pick" });
    }
    function onPopState(event: PopStateEvent) {
      const decision = resolveHistoryEntry({
        stateStep: readHistoryStep(event.state),
        memoryStep: memoryStepOf(stepRef.current),
      });
      if (decision.render !== "E2′") return;
      const keep = keepDraftRef.current;
      keepDraftRef.current = false;
      backToPick(keep);
      if (decision.back) history.back();
    }
    function onPageShow(event: PageTransitionEvent) {
      if (!event.persisted) return;
      const decision = resolveHistoryEntry({ stateStep: readHistoryStep(history.state), memoryStep: null });
      backToPick(false);
      if (decision.back) history.back();
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

  function toResult(next: Step) {
    setDraft(EMPTY_DRAFT);
    history.replaceState({ step: "result" }, "");
    focusRef.current = "result";
    setStep(next);
  }

  // 행 누름은 서버를 부르지 않는다 — 곧바로 E′4.
  function choose(prize: IntakePrizeDto) {
    setPrizeGone(false);
    lastPrizeRef.current = prize.id;
    keepDraftRef.current = false;
    history.pushState({ step: "form" }, "");
    focusRef.current = "prize";
    setStep({ kind: "form", prizeId: prize.id });
  }

  const progressBar = showProgress && busy ? <div className={styles.progress} aria-hidden="true" /> : null;

  if (step.kind === "pick") {
    return (
      <div>
        <h1 className={styles.title}>{TITLE}</h1>
        <p className={styles.subtitle}>
          {eventName} · {wonOn} 당첨
        </p>
        {prizeGone ? (
          <p id={PRIZE_GONE_ID} tabIndex={-1} className={styles.goneNotice}>
            {PRIZE_GONE_NOTICE}
          </p>
        ) : null}
        <p className={styles.listLabel}>받은 경품을 골라 주세요</p>
        <ul className={styles.pickList}>
          {prizeList.map((prize) => (
            <li key={prize.id}>
              <button type="button" data-prize-id={prize.id} className={styles.pickRow} onClick={() => choose(prize)}>
                <span>{prize.name}</span>
                {prize.delivery === "parcel" ? <span className={styles.pickRowSecondLine}>택배</span> : null}
              </button>
            </li>
          ))}
        </ul>
        <p className={styles.inquiryLine}>{inquiryText}</p>
      </div>
    );
  }

  if (step.kind === "form") {
    const prize = prizeList.find((p) => p.id === step.prizeId);
    if (!prize) return null;
    return (
      <div>
        {progressBar}
        <h1 className={styles.title}>{TITLE}</h1>
        <IntakeForm
          token={token}
          prize={prize}
          terms={termsNow}
          draft={draft}
          busy={busy}
          inquiryText={inquiryText}
          stepRef={stepRef}
          onDraft={(patch) => setDraft((d) => ({ ...d, ...patch }))}
          onBusy={(value) => {
            if (value) setShowProgress(false);
            setBusy(value);
          }}
          onOtherPrize={() => {
            keepDraftRef.current = true;
            history.back();
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
          onClosed={(reason, at) => toResult({ kind: "closed", reason, at })}
          onPrizeGone={(next) => {
            // 새 목록이 비면 E6-d(값 버림). 아니면 표시를 남긴 history.back()으로 E′2 항목에 돌아가 값(주소만 버림)을 지킨다.
            if (next.length === 0) {
              toResult({ kind: "noPrize" });
              return;
            }
            pendingPrizesRef.current = next;
            keepDraftRef.current = true;
            history.back();
          }}
          onTermsChanged={(next) => {
            setTermsNow(next);
            setDraft((d) => ({ ...d, consent: false }));
          }}
          onNotYetOpen={(data) => toResult({ kind: "notYetOpen", ...data })}
          onNotFound={() => toResult({ kind: "notFound" })}
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

  if (step.kind === "notYetOpen") {
    return (
      <div>
        <h1 className={styles.title}>{TITLE}</h1>
        <NotYetOpenResult
          eventName={step.eventName}
          wonOn={step.wonOn}
          managerName={step.managerName}
          contactPhone={step.contactPhone}
        />
      </div>
    );
  }

  if (step.kind === "noPrize") {
    return (
      <div>
        <h1 className={styles.title}>{TITLE}</h1>
        <NoPrizeResult managerName={managerName} contactPhone={contactPhone} />
      </div>
    );
  }

  if (step.kind === "notFound") {
    // E6-c — 링크 · 행사가 그새 없어졌다(행사를 모른다 — 문의 전화 없음).
    return (
      <div>
        <h1 className={styles.title}>{TITLE}</h1>
        <section className={styles.resultBlock}>
          <p id={RESULT_LEAD_ID} tabIndex={-1} className={styles.resultLead}>
            링크를 찾을 수 없습니다
          </p>
          <p className={styles.resultMuted}>받은 QR이나 링크를 다시 열어 주세요 · 계속 안 되면 행사 담당자에게 알려 주세요</p>
        </section>
      </div>
    );
  }

  return (
    <div>
      <h1 className={styles.title}>{TITLE}</h1>
      <section className={styles.resultBlock} aria-live="polite">
        <p id={RESULT_LEAD_ID} tabIndex={-1} className={styles.resultLead}>
          제출되었습니다
        </p>
        <p className={styles.resultMuted}>
          {step.name} · {formatSubmittedAtKst(step.submittedAt)} 제출 · {step.prizeLine}{" "}
          {step.delivery === "parcel" ? "적은 주소로 보내 드립니다" : "현장 수령"}
        </p>
        <p className={styles.resultMuted}>
          확인이 필요하면 담당자 {managerName} · {contactLine} 전화해 주세요
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
const SUBMIT_THROTTLED = "제출이 잠시 멈췄습니다 · 잠시 뒤 다시 눌러 주세요";

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
  prize,
  terms,
  draft,
  busy,
  inquiryText,
  stepRef,
  onDraft,
  onBusy,
  onOtherPrize,
  onSaved,
  onClosed,
  onPrizeGone,
  onTermsChanged,
  onNotYetOpen,
  onNotFound,
}: {
  token: string;
  prize: IntakePrizeDto;
  terms: IntakeTermsDto;
  draft: FormDraft;
  busy: boolean;
  inquiryText: ReactNode;
  stepRef: { current: Step };
  onDraft: (patch: Partial<FormDraft>) => void;
  onBusy: (busy: boolean) => void;
  onOtherPrize: () => void;
  onSaved: (data: SavedData) => void;
  onClosed: (reason: ClosedReason, at: string) => void;
  onPrizeGone: (prizes: IntakePrizeDto[]) => void;
  onTermsChanged: (terms: IntakeTermsDto) => void;
  onNotYetOpen: (head: { eventName: string; wonOn: string; managerName: string; contactPhone: string }) => void;
  onNotFound: () => void;
}) {
  const [fieldErrors, setFieldErrors] = useState<SubmitField[]>([]);
  const [rrnMessage, setRrnMessage] = useState<string | undefined>(undefined);
  // 제출 줄의 결과 불명 · 속도 제한 문장 — 둘 다 같은 키로 다시 보낸다(키는 끝나지 않았다).
  const [retryLine, setRetryLine] = useState<"unknown" | "throttled" | null>(null);
  const signatureRef = useRef<SignaturePadHandle>(null);
  const focusFieldRef = useRef<SubmitField | null>(null);
  // 멱등 키는 시도 단위 — 결과 불명이고 보낼 본문이 그대로일 때만 같은 키를 다시 쓴다.
  const pendingSubmitRef = useRef<{ key: string; fingerprint: string } | null>(null);
  const dangerLineId = useId();
  const parcel = prize.delivery === "parcel";

  useEffect(() => {
    const field = focusFieldRef.current;
    if (!field) return;
    focusFieldRef.current = null;
    document.getElementById(FIELD_FOCUS_ID[field])?.focus();
  }, [fieldErrors, rrnMessage]);

  // 문서 scroll-padding-bottom = sticky 제출 줄의 지금 높이(DR-16 — 이유 줄이 접히면 바뀐다). CSS가 이 값을 읽는다.
  const submitBarRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const bar = submitBarRef.current;
    if (!bar) return;
    const root = document.documentElement;
    const apply = () => root.style.setProperty("--cert-submit-bar-h", `${Math.ceil(bar.getBoundingClientRect().height)}px`);
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(bar);
    return () => {
      observer.disconnect();
      root.style.removeProperty("--cert-submit-bar-h");
    };
  }, []);

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
  const dangerLine = retryLine === "throttled" ? SUBMIT_THROTTLED : retryLine === "unknown" ? SUBMIT_UNKNOWN : fixLine;
  // 제출 줄이 칸 이름을 부르는 동안만 그 칸이 줄을 가리킨다(N2 — 칸 아래 줄이 없는 이름 · 주소).
  const fixLineId = !retryLine && fixLine ? dangerLineId : undefined;

  function edit(field: SubmitField, patch: Partial<FormDraft>) {
    onDraft(patch);
    setRetryLine(null);
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
      prizeId: prize.id,
      name: draft.name,
      rrnFront6: draft.rrnFront6,
      rrnBack7: draft.rrnBack7,
      phone: draft.phone,
      address: parcel ? draft.address : undefined,
      consent: true as const,
      signaturePngBase64: signatureRef.current?.toPngBase64() ?? "",
      consentVersion: terms.consentVersion,
      retentionYears: terms.retentionYears,
      rrnRecheckConfirmed: nextRrnRecheckConfirmed({ armedRrn: draft.armedRrn, rrn }),
    };
    const fingerprint = JSON.stringify(body);
    const reused = pendingSubmitRef.current;
    const key = reused && reused.fingerprint === fingerprint ? reused.key : randomIdemKey();
    pendingSubmitRef.current = { key, fingerprint };
    onBusy(true);
    const result = await withDeadline(() => submitCertificateAction({ ...body, idempotencyKey: key }));
    onBusy(false);
    // 그사이 E′4를 떠났으면 늦은 응답을 버린다.
    const latest = stepRef.current;
    if (latest.kind !== "form" || latest.prizeId !== prize.id || pendingSubmitRef.current?.key !== key) return;
    if (isDefiniteResult(result)) pendingSubmitRef.current = null;
    setRetryLine(null);

    const data = result?.data;
    if (result?.validationErrors) {
      const outcome = submitOutcomeFromValidationErrors(result.validationErrors);
      if (outcome) showFieldErrors(outcome.fields);
      else setRetryLine("unknown");
      return;
    }
    if (data?.kind === "saved") {
      onSaved(data);
    } else if (data?.kind === "invalid") {
      showFieldErrors(data.fields.filter((f): f is SubmitField => f in FIELD_LABEL));
    } else if (data?.kind === "rrnRecheck") {
      onDraft({ armedRrn: rrn });
      showFieldErrors(["rrn"]);
    } else if (data?.kind === "closed") {
      onClosed(data.reason, data.at);
    } else if (data?.kind === "prizeGone") {
      onPrizeGone(data.prizes);
    } else if (data?.kind === "termsChanged") {
      // 안내 블록을 새 판으로 다시 그리고 체크만 푼다 — 다른 값 · 서명은 남고 포커스 = 그 체크박스. 새 문장 없음
      // (제출 막힘 이유 줄이 빈 칸 목록 규칙대로 안내 확인 체크를 부른다).
      onTermsChanged(data.terms);
      focusFieldRef.current = "consent";
      setFieldErrors([]);
    } else if (data?.kind === "notYetOpen") {
      onNotYetOpen({ eventName: data.eventName, wonOn: data.wonOn, managerName: data.managerName, contactPhone: data.contactPhone });
    } else if (data?.kind === "throttled") {
      setRetryLine("throttled");
    } else if (data?.kind === "notFound") {
      onNotFound();
    } else {
      // 결과 불명(연결 끊김 · 20초 · 5xx · serverError · 해석 불가) — 같은 키로 다시 보낸다.
      setRetryLine("unknown");
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
        <div className={styles.prizeHead}>
          <span className={styles.prizeLabel}>경품</span>
          <Button variant="tertiary" disabled={busy} onClick={onOtherPrize}>
            다른 경품 고르기
          </Button>
        </div>
        <p className={styles.prizeName}>{prize.name} 1개</p>
      </div>
      <p className={styles.prizeInquiry}>{inquiryText}</p>

      <div className={styles.formFields}>
        <TextField
          id="name"
          label="이름"
          size="external"
          maxLength={40}
          autoComplete="off"
          value={draft.name}
          aria-invalid={fieldErrors.includes("name") || undefined}
          aria-describedby={fieldErrors.includes("name") ? fixLineId : undefined}
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
              aria-describedby={fieldErrors.includes("address") ? fixLineId : undefined}
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
        retentionYears={terms.retentionYears}
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
        <div className={hasInk ? styles.signatureRedo : `${styles.signatureRedo} ${styles.signatureRedoIdle}`}>
          <Button variant="tertiary" onClick={() => signatureRef.current?.clear()}>
            다시 쓰기
          </Button>
        </div>
      </div>

      <div ref={submitBarRef} className={styles.stickySubmit}>
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
