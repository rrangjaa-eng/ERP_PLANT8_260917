"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { Form } from "@/ui/form/Form";
import { KvList } from "@/ui/kv-list/KvList";
import { Button } from "@/ui/button/Button";
import type { CorrectionField, CorrectionFieldError } from "@/domain/certs/review";
import { correctCertSubmissionAction } from "./actions";
import { RrnField, RRN_CLOSED, isRrnDirty, type RrnState } from "./rrn-field";
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

export function ReviewForm(props: {
  submissionId: string;
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
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<CorrectionField, string>>>({});
  const [outcome, setOutcome] = useState<Outcome>(null);
  const [signatureFailed, setSignatureFailed] = useState(props.signatureDataUrl === null);

  const changedCount =
    (values.name !== saved.name ? 1 : 0) +
    (values.phone !== saved.phone ? 1 : 0) +
    (values.address !== saved.address ? 1 : 0) +
    (isRrnDirty(rrn) ? 1 : 0);

  const correct = useAction(correctCertSubmissionAction, {
    onSuccess: ({ data }) => {
      if (!data) return setOutcome({ kind: "failed", text: "저장 실패 · 다시 시도" });
      if (data.kind === "sessionExpired") return router.push("/login");
      if (data.kind === "saved") {
        setSaved(values);
        setVersion(data.version);
        setRrnMasked(data.rrnMasked);
        setRrn(RRN_CLOSED);
        setFieldErrors({});
        setOutcome({ kind: "saved", text: `저장됨 · ${data.fields.join(" · ")} · ${HHMM_FORMAT.format(new Date(data.at))}` });
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
      setOutcome({ kind: "failed", text: "저장 실패 · 다시 시도" });
    },
    onError: () => setOutcome({ kind: "failed", text: "저장 실패 · 다시 시도" }),
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (changedCount === 0 || correct.isExecuting) return;
    setOutcome(null);
    correct.execute({
      id: props.submissionId,
      version,
      name: values.name,
      phone: values.phone,
      ...(values.address !== null ? { address: values.address } : {}),
      ...(isRrnDirty(rrn) && rrn.input !== null ? { rrn: rrn.input } : {}),
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
          readOnly={!props.canCorrect}
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

  const showSavedText = outcome?.kind === "saved" && changedCount === 0;

  return (
    <Form id="cert-review-form" className={styles.form} onSubmit={handleSubmit}>
      {textField("name", "long")}
      <Form.Field id="cert-review-rrn" label="주민등록번호" width="long">
        <RrnField
          id="cert-review-rrn"
          submissionId={props.submissionId}
          rrnMasked={rrnMasked}
          canReveal={props.canReveal}
          canEdit={props.canCorrect}
          state={rrn}
          onChange={setRrn}
          error={fieldErrors.rrn}
          idleMinutes={props.idleMinutes}
        />
      </Form.Field>
      {textField("phone", "short")}
      {values.address !== null ? textField("address", "long") : null}

      <KvList
        items={[
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
        ]}
      />

      {props.canCorrect ? (
        <div className={styles.actionsBar}>
          <Form.Actions>
            {showSavedText ? (
              <p className={styles.savedText} role="status">
                {outcome?.text}
              </p>
            ) : (
              <Button
                type="submit"
                variant="primary"
                pending={correct.isExecuting}
                disabled={changedCount === 0}
                disabledReason="바뀐 칸 없음"
                reasonTone="info"
                reasonId={REASON_ID}
                aria-describedby={changedCount > 0 && outcome && outcome.kind !== "saved" ? REASON_ID : undefined}
              >
                고친 내용 저장
              </Button>
            )}
            {changedCount > 0 && outcome && outcome.kind !== "saved" && !correct.isExecuting ? (
              <p id={REASON_ID} className={styles.reason}>
                {outcome.text}
                {outcome.kind === "conflict" ? (
                  <Button variant="tertiary" onClick={() => router.refresh()}>
                    다시 불러오기
                  </Button>
                ) : null}
              </p>
            ) : null}
          </Form.Actions>
        </div>
      ) : null}
    </Form>
  );
}
