"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { Form } from "@/ui/form/Form";
import { KvList, type KvItem } from "@/ui/kv-list/KvList";
import { Button } from "@/ui/button/Button";
import { PageHeader } from "@/ui/page-header/PageHeader";
import { StatusTag } from "@/ui/status-tag/StatusTag";
import { ConfirmDialog } from "@/ui/confirm-dialog/ConfirmDialog";
import type { CorrectionField, CorrectionFieldError } from "@/domain/certs/review";
import { formatSubmittedAtKst } from "@/domain/certs/format";
import { LOGIN_REQUIRED_MESSAGE } from "@/lib/actions/user-facing-error";
import { privacyLoginHref } from "@/lib/login-next";
import { correctCertSubmissionAction, excludeCertSubmissionAction } from "./actions";
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
  quantity: "수량",
};

function fieldErrorText(field: CorrectionField, code: CorrectionFieldError): string {
  if (field === "rrn") return "주민등록번호 맞지 않음 · 앞 6자리와 뒤 7자리 확인";
  if (field === "quantity") return "1~99 정수 아님 · 1처럼 입력";
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

type Values = { name: string; phone: string; address: string | null; quantity: string };

type Outcome =
  | { kind: "saved"; text: string }
  | { kind: "conflict"; text: string }
  | { kind: "failed"; text: string; reload?: boolean }
  | null;

const SAVE_FAILED: Outcome = { kind: "failed", text: "저장 실패 · 다시 시도" };
// 서버가 확정해 거부한 정정 — 다시 보내도 같은 답이라 「다시 시도」가 아니다(대조 제외 거부와 같은 꼴 · PR #88 /review F2).
// 그새 없어진 제출은 화면이 낡았으니 충돌과 같은 꼬리 「다시 불러오기」.
const SAVE_DENIED: Outcome = { kind: "failed", text: "저장 실패 · 권한 없음" };
const SAVE_NOT_FOUND: Outcome = { kind: "failed", text: "저장 실패 · 없는 제출 · ", reload: true };
// 04.3-17 「대조 제외」 실패 — 다시 보내면 되는 실패(연결 끊김 · 결과 불명)만 모달 안 실패 줄(§7-17 failure, 1차 안 막음).
// 서버 거부(버전 충돌 · 권한 없음 · 없는 제출)는 막힘 자리(disabledReason) — 다시 받거나 다시 열 때까지 1차를 막는다(검토 X2 · X3).
// 충돌은 정정 충돌 꼴(`저장 실패 · …` → `대조 제외 실패 · …`). 명사형은 사용자 결정 A(2026-09-26 — UI-SPEC 「제외하지
// 못했습니다」를 옮김, /design-review 확인).
const EXCLUDE_FAILED = "대조 제외 실패 · 다시 시도";
const EXCLUDE_DENIED = "대조 제외 실패 · 권한 없음";
// 그새 파기됐거나 행사가 없어졌다 — 화면이 낡았으니 꼬리 「새로 고침」(§7-17 · 확인 부품이 3차로 세운다).
const EXCLUDE_NOT_FOUND = "대조 제외 실패 · 없는 제출 · 새로 고침";

type ExcludeResponse = Awaited<ReturnType<typeof excludeCertSubmissionAction>> | undefined;

export function ReviewForm(props: {
  submissionId: string;
  title: string;
  subtitle: string;
  version: number;
  name: string;
  rrnMasked: string;
  phone: string;
  address: string | null;
  prizeLine: string;
  consentLine: string;
  signatureDataUrl: string | null;
  canReveal: boolean;
  canCorrect: boolean;
  /** 04.3-17 — 가액 × 수량 ≤ 50,000(서버 판정 결과만 — 가액 숫자 없음). */
  purgeTarget: boolean;
  /** 04.3-17 — 수량 정정 칸(N3 a · 1~99). */
  quantity: number;
  /** 04.3-17 「대조 제외」 확인 창 부제 재료 — `{이름} · {경품명} · {MM-dd HH:mm} 제출`. */
  prizeName: string;
  submittedAt: string;
  /** 04.3-17 — I4 머리 2차 「대조 제외」(정정과 같은 쓰기 판정 ∧ 제외 안 된 제출 — 서버 판정, NF-2). */
  canExclude: boolean;
  /** 04.3-17 — 대조 제외된 제출(DR-1 제외된 I4 — 값 `—` · 행동 없음). */
  excluded: boolean;
  /** 04.3-17 ⑥-b — 주민등록번호 암호문이 비었다(값 `—` · 전체 보기 · 주민번호 정정 · 인쇄 없음). */
  rrnCleared: boolean;
}) {
  const router = useRouter();
  // 끊기면 이유 줄 · 이 I4로 돌아오는 로그인 화면(04.3-14 U5 a) — 전체 이동이라 기록에 이 화면이 남지 않는다.
  const toLogin = () => window.location.replace(privacyLoginHref(`/certs/submissions/${props.submissionId}`));
  const initial: Values = { name: props.name, phone: props.phone, address: props.address, quantity: String(props.quantity) };
  const [saved, setSaved] = useState<Values>(initial);
  const [values, setValues] = useState<Values>(initial);
  const [version, setVersion] = useState(props.version);
  const [rrnMasked, setRrnMasked] = useState(props.rrnMasked);
  const [rrn, setRrn] = useState<RrnState>(RRN_CLOSED);
  const [rrnPending, setRrnPending] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<CorrectionField, string>>>({});
  const [outcome, setOutcome] = useState<Outcome>(null);
  const [signatureFailed, setSignatureFailed] = useState(props.signatureDataUrl === null);
  const [purgeTarget, setPurgeTarget] = useState(props.purgeTarget);
  const [excludeOpen, setExcludeOpen] = useState(false);
  const [excluding, setExcluding] = useState(false);
  const [excludeFailure, setExcludeFailure] = useState<{ text: string; rejected: boolean; reload: boolean } | null>(null);
  // 보낸 값 — 성공하면 이것이 저장된 값이다(DOM 감사 H1). 응답을 처리하면 비운다(평문 번호 포함 · 검토 R-M1).
  const submittedRef = useRef<{ values: Values; rrn: string | null } | null>(null);

  const changedCount =
    (values.name !== saved.name ? 1 : 0) +
    (values.phone !== saved.phone ? 1 : 0) +
    (values.address !== saved.address ? 1 : 0) +
    (values.quantity !== saved.quantity ? 1 : 0) +
    (isRrnDirty(rrn) ? 1 : 0);

  // 04.3-17 「대조 제외」 — 확인 창(§7-17) → 성공이면 I′3로 돌아가 그 줄에 포커스 + 토스트(착지 화면이 띄운다, T3).
  async function confirmExclude() {
    if (excluding) return;
    setExcluding(true);
    setExcludeFailure(null);
    let response: ExcludeResponse;
    try {
      response = await excludeCertSubmissionAction({ id: props.submissionId, version });
    } catch {
      response = undefined;
    }
    const data = response?.data;
    if (data?.kind === "excluded") {
      router.push(`/certs/events/${data.eventId}?excluded=${props.submissionId}`);
      return;
    }
    setExcluding(false);
    if (data?.kind === "sessionExpired") return toLogin();
    if (data?.kind === "alreadyExcluded") {
      setExcludeOpen(false);
      router.refresh();
      return;
    }
    if (data?.kind === "conflict") {
      const name = data.byName || "다른 사람";
      const at = HHMM_FORMAT.format(new Date(data.at));
      setExcludeFailure({ text: `대조 제외 실패 · ${name}${subjectParticle(name)} ${at}에 먼저 고침`, rejected: true, reload: true });
      return;
    }
    if (data?.kind === "denied") return setExcludeFailure({ text: EXCLUDE_DENIED, rejected: true, reload: false });
    if (data?.kind === "notFound") return setExcludeFailure({ text: EXCLUDE_NOT_FOUND, rejected: true, reload: false });
    setExcludeFailure({ text: EXCLUDE_FAILED, rejected: false, reload: false });
  }

  const excludeDialog = props.canExclude ? (
    <ConfirmDialog
      open={excludeOpen}
      onClose={() => setExcludeOpen(false)}
      title="대조 제외"
      subtitle={`${props.name} · ${props.prizeName} · ${formatSubmittedAtKst(props.submittedAt).slice(5)} 제출`}
      resultLines={["주민등록번호 · 주소 · 연락처 · 서명을 지웁니다 · 되돌릴 수 없습니다", "지급 대상에서 빠집니다"]}
      primary={{
        label: "대조 제외",
        pending: excluding,
        onConfirm: () => void confirmExclude(),
        ...(excludeFailure ? (excludeFailure.rejected ? { disabledReason: excludeFailure.text } : { failure: excludeFailure.text }) : {}),
        ...(excludeFailure?.reload
          ? {
              nextStep: (
                <Button variant="tertiary" onClick={() => router.refresh()}>
                  다시 불러오기
                </Button>
              ),
            }
          : {}),
      }}
    />
  ) : null;

  // 머리 줄 — PageHeader에는 행동 자리가 없어(D-25) 폼이 그린다. 2차 「인쇄」는 저장된 값을 찍는 인쇄 라우트를 새 탭으로
  // 연다 — 고친 칸이 있으면 화면 값과 인쇄물이 달라지므로 비활성 + 이유(aria-disabled, UI-SPEC I4 머리 2차 · D-7).
  const header = (
    <div className={styles.header}>
      <div className={styles.titleBlock}>
        <PageHeader title={props.title} subtitle={props.subtitle} />
      </div>
      {props.excluded ? (
        <StatusTag kind="muted" variant="tag">
          대조 제외
        </StatusTag>
      ) : (
        <StatusTag kind="success" variant="tag">
          제출됨
        </StatusTag>
      )}
      {/* 04.3-17 — 「인쇄」는 대조 제외 · 주민번호만 비운 제출에 없다(인쇄 라우트 404 — DR-1 · ⑥-b). */}
      {props.canExclude || !(props.excluded || props.rrnCleared) ? (
        <div className={styles.headerActions}>
          {/* 04.3-17 「대조 제외」 — 「인쇄」 왼쪽(정정 1차와 떨어진 쪽 · UD-2 a). 저장 안 한 정정 칸이 있어도 켜진다(그 값도 지워질 값). */}
          {props.canExclude ? (
            <Button
              variant="secondary"
              onClick={() => {
                setExcludeFailure(null);
                setExcludeOpen(true);
              }}
            >
              대조 제외
            </Button>
          ) : null}
          {props.excluded || props.rrnCleared ? null : (
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
          )}
        </div>
      ) : null}
    </div>
  );

  const correct = useAction(correctCertSubmissionAction, {
    onSuccess: ({ data }) => {
      const submitted = submittedRef.current;
      submittedRef.current = null;
      if (!data || !submitted) return setOutcome(SAVE_FAILED);
      if (data.kind === "sessionExpired") return toLogin();
      if (data.kind === "saved") {
        setSaved(submitted.values);
        setVersion(data.version);
        setRrnMasked(data.rrnMasked);
        setPurgeTarget(data.purgeTarget);
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
      if (data.kind === "denied") return setOutcome(SAVE_DENIED);
      if (data.kind === "notFound") return setOutcome(SAVE_NOT_FOUND);
      setOutcome(SAVE_FAILED);
    },
    onError: ({ error }) => {
      submittedRef.current = null;
      if (error.serverError === LOGIN_REQUIRED_MESSAGE) return toLogin();
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
      quantity: values.quantity,
    });
  }

  function update(field: keyof Values, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
  }

  function textField(field: "name" | "phone" | "address" | "quantity", width: "short" | "long") {
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
          inputMode={field === "phone" ? "tel" : field === "quantity" ? "numeric" : undefined}
          className={[styles.textInput, error ? styles.textInputError : ""].filter(Boolean).join(" ")}
          value={values[field] ?? ""}
          onChange={(event) => update(field, event.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
        />
        {error ? <Form.Error id={`${id}-error`}>{error}</Form.Error> : null}
      </Form.Field>
    );
  }

  // ⑥-b — 주민등록번호 암호문이 빈 줄은 값 `—` 글자 하나(전체 보기 · 주민번호 정정 · 파기 대상 표시 없음).
  const rrnField = props.rrnCleared ? (
    <div className={styles.rrnRow} role="group" aria-label="주민등록번호">
      <span className={styles.rrnText}>—</span>
    </div>
  ) : (
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
      purgeTarget={purgeTarget}
    />
  );

  const detailItems: KvItem[] = [
    { label: "경품", value: props.prizeLine },
    { label: "수집 안내", value: props.consentLine },
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

  // 04.3-17 — 대조 제외된 제출(DR-1): 이름 · 수량은 글자, 주민등록번호 · 연락처 · 주소 · 서명 `—`, 행동(저장 · 전체 보기 · 인쇄 ·
  // 대조 제외)은 그리지 않는다.
  if (props.excluded) {
    return (
      <>
        {header}
        <div className={styles.form}>
          <KvList
            items={[
              { label: FIELD_LABELS.name, value: props.name },
              { label: FIELD_LABELS.quantity, value: <span className={styles.num}>{props.quantity}</span> },
              { label: FIELD_LABELS.rrn, value: "—" },
              { label: FIELD_LABELS.phone, value: "—" },
              ...(props.address !== null ? [{ label: FIELD_LABELS.address, value: "—" }] : []),
              { label: "경품", value: props.prizeLine },
              { label: "수집 안내", value: props.consentLine },
              { label: "서명", value: "—" },
            ]}
          />
        </div>
      </>
    );
  }

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
                value: values.name,
              },
              { label: FIELD_LABELS.rrn, value: rrnField },
              { label: FIELD_LABELS.phone, value: <span className={styles.num}>{values.phone}</span> },
              ...(values.address !== null ? [{ label: FIELD_LABELS.address, value: values.address }] : []),
              { label: FIELD_LABELS.quantity, value: <span className={styles.num}>{values.quantity}</span> },
              ...detailItems,
            ]}
          />
        </div>
        {excludeDialog}
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
        {textField("quantity", "short")}

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
                  {outcome.kind === "conflict" || (outcome.kind === "failed" && outcome.reload) ? (
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
      {excludeDialog}
    </>
  );
}
