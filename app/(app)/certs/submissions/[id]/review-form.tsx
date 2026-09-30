"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { Form } from "@/ui/form/Form";
import { KvList, type KvItem } from "@/ui/kv-list/KvList";
import { Button } from "@/ui/button/Button";
import { PageHeader } from "@/ui/page-header/PageHeader";
import { StatusTag } from "@/ui/status-tag/StatusTag";
import type { CorrectionField, CorrectionFieldError } from "@/domain/certs/review";
import { LOGIN_REQUIRED_MESSAGE } from "@/lib/actions/user-facing-error";
import { correctCertSubmissionAction } from "./actions";
import { RrnField } from "./rrn-field";
import { RRN_CLOSED, afterRrnSave, isRrnDirty, type RrnState } from "./rrn-state";
import styles from "./review.module.css";

// 04.3-07 — I4 정정 폼(UI-SPEC I4 · SYSTEM §6-3 · §7-15 정정 폼). 오류 문구는 사용자 결정 A
// (2026-09-29) — UI-SPEC의 「~하지 못했습니다」 · 「~습니다」를 명사형 「원인 · 다음 행동」으로 옮겼다.

const REASON_ID = "cert-review-reason";
const FIELD_LABELS: Record<CorrectionField, string> = {
  name: "이름",
  rrn: "주민등록번호",
  phone: "연락처",
  address: "주소",
};

function fieldErrorText(field: CorrectionField, code: CorrectionFieldError): string {
  if (field === "rrn") return "주민등록번호 맞지 않음 · 앞 6자리와 뒤 7자리 확인";
  if (field === "phone") return "연락처 형식 아님 · 010-0000-0000처럼 입력";
  if (code === "tooLong") return field === "name" ? "40자 초과 · 40자 안으로" : "200자 초과 · 200자 안으로";
  return `${FIELD_LABELS[field]} 비어 있음 · 입력`;
}

// 받침이 있으면 「이」, 없으면 「가」(먼저 고친 사람 이름 뒤).
function subjectParticle(name: string): string {
  const code = name.charCodeAt(name.length - 1) - 0xac00;
  return code >= 0 && code <= 11171 && code % 28 === 0 ? "가" : "이";
}

const HHMM_FORMAT = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Seoul",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

type Values = { name: string; phone: string; address: string | null };

type Outcome =
  | { kind: "saved"; text: string }
  | { kind: "conflict"; text: string }
  | { kind: "failed"; text: string }
  | null;

const SAVE_FAILED: Outcome = { kind: "failed", text: "저장 실패 · 다시 시도" };

export function ReviewForm(props: {
  submissionId: string;
  title: string;
  subtitle: string;
  version: number;
  name: string;
  registeredName: string | null;
  rrnMasked: string;
  phone: string;
  address: string | null;
  prizeLine: string;
  consentLine: string;
  signatureDataUrl: string | null;
  canReveal: boolean;
  canCorrect: boolean;
  idleMinutes: number;
}) {
  const router = useRouter();
  const initial: Values = { name: props.name, phone: props.phone, address: props.address };
  const [saved, setSaved] = useState<Values>(initial);
  const [values, setValues] = useState<Values>(initial);
  const [version, setVersion] = useState(props.version);
  const [rrnMasked, setRrnMasked] = useState(props.rrnMasked);
  const [rrn, setRrn] = useState<RrnState>(RRN_CLOSED);
  const [rrnPending, setRrnPending] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<CorrectionField, string>>>({});
  const [outcome, setOutcome] = useState<Outcome>(null);
  const [signatureFailed, setSignatureFailed] = useState(props.signatureDataUrl === null);
  // 보낸 값 — 성공하면 이것이 저장된 값이다(DOM 감사 H1). 응답을 처리하면 비운다(평문 번호 포함 · 검토 R-M1).
  const submittedRef = useRef<{ values: Values; rrn: string | null } | null>(null);

  const changedCount =
    (values.name !== saved.name ? 1 : 0) +
    (values.phone !== saved.phone ? 1 : 0) +
    (values.address !== saved.address ? 1 : 0) +
    (isRrnDirty(rrn) ? 1 : 0);

  // 머리 줄 — PageHeader에는 행동 자리가 없어(D-25) 폼이 그린다. 2차 「인쇄」는 저장된 값을 찍는 인쇄 라우트를 새 탭으로
  // 연다 — 고친 칸이 있으면 화면 값과 인쇄물이 달라지므로 비활성 + 이유(aria-disabled, UI-SPEC I4 머리 2차 · D-7).
  const header = (
    <div className={styles.header}>
      <div className={styles.titleBlock}>
        <PageHeader title={props.title} subtitle={props.subtitle} />
      </div>
      <StatusTag kind="success" variant="tag">
        제출됨
      </StatusTag>
      <div className={styles.headerActions}>
        <Button
          variant="secondary"
          disabled={changedCount > 0}
          disabledReason={changedCount > 0 ? `저장 안 한 칸 ${changedCount} · 먼저 저장` : undefined}
          onClick={() => window.open(`/print/certs/${props.submissionId}`, "_blank", "noopener")}
        >
          <span className={styles.printLabel}>
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinejoin="round"
              aria-hidden="true"
              focusable="false"
            >
              <path d="M4 6V2h8v4" />
              <path d="M4 12H2V6h12v6h-2" />
              <path d="M4 9.5h8V14H4z" />
            </svg>
            인쇄
          </span>
        </Button>
      </div>
    </div>
  );

  const correct = useAction(correctCertSubmissionAction, {
    onSuccess: ({ data }) => {
      const submitted = submittedRef.current;
      submittedRef.current = null;
      if (!data || !submitted) return setOutcome(SAVE_FAILED);
      if (data.kind === "sessionExpired") return router.push("/login");
      if (data.kind === "saved") {
        setSaved(submitted.values);
        setVersion(data.version);
        setRrnMasked(data.rrnMasked);
        setRrn((current) => afterRrnSave(current, submitted.rrn));
        setFieldErrors({});
        setOutcome({ kind: "saved", text: `저장됨 · ${data.fields.join(" · ")} · ${HHMM_FORMAT.format(new Date(data.at))}` });
        // 저장 버튼이 결과 문장으로 바뀌어 사라진다 — 그 버튼의 포커스를 머리 줄 제목으로(DOM 감사 M2 · S16 선례).
        const active = document.activeElement;
        if (active instanceof HTMLButtonElement && active.type === "submit") {
          document.querySelector<HTMLElement>("h1")?.focus();
        }
        return;
      }
      if (data.kind === "conflict") {
        const name = data.byName || "다른 사람";
        setOutcome({
          kind: "conflict",
          text: `저장 실패 · ${name}${subjectParticle(name)} ${HHMM_FORMAT.format(new Date(data.at))}에 먼저 고침 · `,
        });
        return;
      }
      if (data.kind === "invalid") {
        const entries = Object.entries(data.fields) as Array<[CorrectionField, CorrectionFieldError]>;
        setFieldErrors(Object.fromEntries(entries.map(([field, code]) => [field, fieldErrorText(field, code)])));
        const labels = entries.map(([field]) => FIELD_LABELS[field]).join(" · ");
        setOutcome({ kind: "failed", text: `저장 실패 · ${labels} ${entries.length}칸` });
        return;
      }
      if (data.kind === "unchanged") return setOutcome(null);
      setOutcome(SAVE_FAILED);
    },
    onError: ({ error }) => {
      submittedRef.current = null;
      if (error.serverError === LOGIN_REQUIRED_MESSAGE) return router.push("/login");
      setOutcome(SAVE_FAILED);
    },
    // 결과를 화면 상태로 옮긴 뒤 훅의 보낸 입력(주민등록번호 평문 포함)을 비운다(검토 R-M1).
    onSettled: (): void => correct.reset(),
  });

  // 진행 중엔 같은 폼의 다른 조작도 잠근다(§7-1 · DOM 감사 H1 · L1).
  const busy = correct.isExecuting || rrnPending;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (changedCount === 0 || busy) return;
    setOutcome(null);
    const sentRrn = isRrnDirty(rrn) ? rrn.input : null;
    submittedRef.current = { values, rrn: sentRrn };
    correct.execute({
      id: props.submissionId,
      version,
      name: values.name,
      phone: values.phone,
      ...(values.address !== null ? { address: values.address } : {}),
      ...(sentRrn !== null ? { rrn: sentRrn } : {}),
    });
  }

  function update(field: keyof Values, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
  }

  function textField(field: "name" | "phone" | "address", width: "short" | "long") {
    const id = `cert-review-${field}`;
    const error = fieldErrors[field];
    return (
      <Form.Field id={id} label={FIELD_LABELS[field]} width={width}>
        <input
          id={id}
          name={field}
          type="text"
          autoComplete="off"
          readOnly={busy}
          inputMode={field === "phone" ? "tel" : undefined}
          className={[styles.textInput, error ? styles.textInputError : ""].filter(Boolean).join(" ")}
          value={values[field] ?? ""}
          onChange={(event) => update(field, event.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
        />
        {field === "name" && props.registeredName ? <Form.Hint>등록 이름 {props.registeredName}</Form.Hint> : null}
        {error ? <Form.Error id={`${id}-error`}>{error}</Form.Error> : null}
      </Form.Field>
    );
  }

  const rrnField = (
    <RrnField
      id="cert-review-rrn"
      submissionId={props.submissionId}
      rrnMasked={rrnMasked}
      canReveal={props.canReveal}
      canEdit={props.canCorrect}
      busy={correct.isExecuting}
      state={rrn}
      onChange={setRrn}
      onPendingChange={setRrnPending}
      error={fieldErrors.rrn}
      idleMinutes={props.idleMinutes}
    />
  );

  const detailItems: KvItem[] = [
    { label: "경품", value: props.prizeLine },
    { label: "동의", value: props.consentLine },
    {
      label: "서명",
      value: (
        <div className={styles.signature}>
          {signatureFailed || props.signatureDataUrl === null ? (
            <p className={styles.signatureError}>
              서명 이미지 불러오기 실패 ·{" "}
              <Button
                variant="tertiary"
                disabled={busy}
                onClick={() => {
                  setSignatureFailed(false);
                  router.refresh();
                }}
              >
                다시 시도
              </Button>
            </p>
          ) : (
            // 서버가 권한 확인 뒤 내려준 data URL — next/image 최적화 대상이 아니다.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              className={styles.signatureImage}
              src={props.signatureDataUrl}
              alt={`${props.name} 서명`}
              onError={() => setSignatureFailed(true)}
            />
          )}
          <span className={styles.signatureCaption}>수령자 서명 · 고칠 수 없음</span>
        </div>
      ),
    },
  ];

  // 쓰기 권한이 없으면 값은 입력이 아니라 글자다(§6-3 · §7-2 · DOM 감사 L3).
  if (!props.canCorrect) {
    return (
      <>
        {header}
        <div className={styles.form}>
          <KvList
            items={[
              {
                label: FIELD_LABELS.name,
                value: (
                  <>
                    {values.name}
                    {props.registeredName ? <Form.Hint>등록 이름 {props.registeredName}</Form.Hint> : null}
                  </>
                ),
              },
              { label: FIELD_LABELS.rrn, value: rrnField },
              { label: FIELD_LABELS.phone, value: <span className={styles.num}>{values.phone}</span> },
              ...(values.address !== null ? [{ label: FIELD_LABELS.address, value: values.address }] : []),
              ...detailItems,
            ]}
          />
        </div>
      </>
    );
  }

  const showSavedText = outcome?.kind === "saved" && changedCount === 0;
  const showReason = changedCount > 0 && outcome !== null && outcome.kind !== "saved" && !correct.isExecuting;

  return (
    <>
      {header}
      <Form id="cert-review-form" className={styles.form} onSubmit={handleSubmit}>
        {textField("name", "long")}
        <Form.Field id="cert-review-rrn" label="주민등록번호" width="long">
          {rrnField}
        </Form.Field>
        {textField("phone", "short")}
        {values.address !== null ? textField("address", "long") : null}

        <KvList items={detailItems} />

        <div className={styles.actionsBar}>
          <Form.Actions>
            {showSavedText ? null : (
              <Button
                type="submit"
                variant="primary"
                className={styles.saveButton}
                pending={correct.isExecuting}
                disabled={changedCount === 0 || rrnPending}
                disabledReason={changedCount === 0 ? "바뀐 칸 없음" : undefined}
                reasonTone="info"
                reasonId={REASON_ID}
                aria-describedby={changedCount > 0 && outcome && outcome.kind !== "saved" ? REASON_ID : undefined}
              >
                고친 내용 저장
              </Button>
            )}
            {/* 결과 · 실패 문장은 늘 있는 알림 영역 안에서 바뀐다(DOM 감사 M3). */}
            <div aria-live="polite">
              {showSavedText ? <p className={styles.savedText}>{outcome?.text}</p> : null}
              {showReason && outcome ? (
                <p id={REASON_ID} className={styles.reason}>
                  {outcome.text}
                  {outcome.kind === "conflict" ? (
                    <Button variant="tertiary" onClick={() => router.refresh()}>
                      다시 불러오기
                    </Button>
                  ) : null}
                </p>
              ) : null}
            </div>
          </Form.Actions>
        </div>
      </Form>
    </>
  );
}
