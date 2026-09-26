"use client";

import { useId, useRef, useState } from "react";
import { useAction } from "next-safe-action/hooks";
import { Button } from "@/ui/button/Button";
import { TextField } from "@/ui/input/TextField";
import { formatContactPhone } from "@/domain/certs/format";
import { selectWinnerAction, submitCertificateAction, verifyLast4Action } from "./actions";
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

type Step =
  | { kind: "pick"; error?: string }
  | { kind: "verify"; rowId: string; maskedName: string; last4: string; error?: string }
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
  | { kind: "alreadySubmitted"; maskedName: string; submittedAt: string };

function randomIdemKey(): string {
  return crypto.randomUUID();
}

export function IntakeFlow({ token, eventName, wonOn, rows, managerName, contactPhone }: IntakeFlowProps) {
  const [step, setStep] = useState<Step>({ kind: "pick" });
  const selectAction = useAction(selectWinnerAction);
  const verifyAction = useAction(verifyLast4Action);
  const contactLine = `PLANT8 경영관리 ${formatContactPhone(contactPhone)}`;

  async function pick(row: IntakeRowDto) {
    const result = await selectAction.executeAsync({ token, rowId: row.rowId });
    if (result?.data?.kind === "ok") {
      setStep({ kind: "verify", rowId: row.rowId, maskedName: result.data.maskedName, last4: "" });
    } else {
      setStep({ kind: "pick", error: "이름을 불러오지 못했습니다 · 잠시 뒤 다시 골라 주세요" });
    }
  }

  async function verify() {
    if (step.kind !== "verify") return;
    const result = await verifyAction.executeAsync({
      token,
      rowId: step.rowId,
      last4: step.last4,
      idemKey: randomIdemKey(),
    });
    const data = result?.data;
    if (data?.kind === "ok") {
      setStep({
        kind: "form",
        rowId: step.rowId,
        proof: data.proof,
        prizeLine: data.prizeLine,
        delivery: data.delivery,
        consentVersion: data.consent.version,
        retentionYears: data.consent.retentionYears,
        rrnRecheck: false,
      });
    } else if (data?.kind === "submitted") {
      setStep({ kind: "alreadySubmitted", maskedName: data.maskedName, submittedAt: data.submittedAt });
    } else {
      setStep({ ...step, error: "전화번호 뒤 4자리가 맞지 않습니다 · 다시 적어 주세요" });
    }
  }

  if (step.kind === "pick") {
    return (
      <div>
        <h1 className={styles.title}>기타소득 지급 확인</h1>
        <p className={styles.subtitle}>
          {eventName} · {wonOn} 당첨
        </p>
        <p className={styles.listLabel}>이름을 골라 주세요 · {rows.length}명</p>
        {step.error ? <p className={styles.blockedDanger}>{step.error}</p> : null}
        <ul className={styles.pickList}>
          {rows.map((row) => (
            <li key={row.rowId}>
              <button type="button" className={styles.pickRow} onClick={() => void pick(row)}>
                <span>{row.maskedName}</span>
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
    const canSubmit = step.last4.length === 4;
    return (
      <div>
        <label className={styles.fieldLabel}>이름</label>
        <div className={styles.verifyNameRow}>
          <span className={styles.verifyName}>{step.maskedName}</span>
          <button type="button" className={styles.tertiaryLink} onClick={() => setStep({ kind: "pick" })}>
            다른 이름 고르기
          </button>
        </div>
        <TextField
          id="last4"
          label="전화번호 뒤 4자리"
          size="external"
          inputMode="numeric"
          autoComplete="off"
          maxLength={4}
          value={step.last4}
          onChange={(e) => setStep({ ...step, last4: e.target.value.replace(/\D/g, "").slice(0, 4) })}
          error={step.error}
        />
        <div className={styles.stickySubmit}>
          <Button
            size="external"
            disabled={!canSubmit}
            disabledReason="뒤 4자리 숫자를 적으면 확인할 수 있습니다"
            reasonTone="info"
            pending={verifyAction.isExecuting}
            onClick={() => void verify()}
          >
            전화번호 확인
          </Button>
        </div>
      </div>
    );
  }

  if (step.kind === "form") {
    return (
      <IntakeForm
        token={token}
        step={step}
        contactLine={contactLine}
        onSubmitted={(name, submittedAt) =>
          setStep({ kind: "submitted", name, submittedAt, prizeLine: step.prizeLine, delivery: step.delivery })
        }
        onExpired={() => setStep({ kind: "pick" })}
      />
    );
  }

  if (step.kind === "submitted") {
    return (
      <div>
        <p>제출되었습니다 · 다시 제출할 수 없습니다</p>
        <p>
          {step.name} · {new Date(step.submittedAt).toLocaleString("ko-KR")} 제출 · {step.prizeLine}{" "}
          {step.delivery === "parcel" ? "적은 주소로 보내 드립니다" : "현장 수령"}
        </p>
        <p>확인이 필요하면 담당자 {managerName} · {contactLine}에 전화해 주세요</p>
      </div>
    );
  }

  // alreadySubmitted
  return (
    <div>
      <p>이미 제출하셨습니다</p>
      <p>
        {step.maskedName} · {new Date(step.submittedAt).toLocaleString("ko-KR")} 제출됨. 내용을 고치려면 담당자{" "}
        {managerName} · {contactLine}에 전화해 주세요
      </p>
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
  contactLine: string;
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
      setRrnError("주민등록번호가 맞지 않습니다 · 앞 6자리(생년월일)와 뒤 7자리를 다시 확인해 주세요");
    } else if (data?.kind === "expiredProof" || data?.kind === "notFound") {
      onExpired();
    }
  }

  return (
    <div>
      <p className={styles.prizeLine}>{step.prizeLine}</p>
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

      <TextField id="phone" label="연락처" size="external" value={phone} onChange={(e) => setPhone(e.target.value)} />

      <div className={styles.consentBlock}>
        <label className={styles.consentLabel}>
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          <span id={consentSummaryId}>
            수집 항목 이름 · 주민등록번호 · {step.delivery === "parcel" ? "주소 · " : ""}연락처 · 서명 — 기타소득 세무
            신고와 경품 전달에만 씁니다. 제출한 해가 끝나고 법정 신고기한이 지난 날부터 {step.retentionYears}년 동안
            보관한 뒤 파기합니다. 동의하지 않으면 경품을 드릴 수 없습니다.
          </span>
        </label>
        <button
          type="button"
          className={styles.tertiaryLink}
          aria-expanded={showFullConsent}
          onClick={() => setShowFullConsent((v) => !v)}
        >
          {showFullConsent ? "전문 접기" : "전문 보기"}
        </button>
        {showFullConsent ? <p className={styles.consentFull}>{consentFullText(step.retentionYears)}</p> : null}
      </div>

      <SignaturePad ref={signatureRef} hasStroke={hasSignature} onChange={setHasSignature} />

      <div className={styles.stickySubmit}>
        <Button
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
