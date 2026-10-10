"use client";

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { Form } from "@/ui/form/Form";
import { Select } from "@/ui/select/Select";
import { Button } from "@/ui/button/Button";
import { KvList, type KvItem } from "@/ui/kv-list/KvList";
import { ConfirmDialog } from "@/ui/confirm-dialog/ConfirmDialog";
import { ApprovalRoute } from "@/ui/approval-route/ApprovalRoute";
import { isCtrlCombo } from "@/lib/shortcut";
import {
  DEFAULT_HALF_PERIOD,
  HALF_PERIODS,
  LEAVE_DATE_EMPTY_ERROR,
  LEAVE_HALF_EMPTY_ERROR,
  LEAVE_KIND_EMPTY_ERROR,
  LEAVE_KINDS,
  LEAVE_START_EMPTY_ERROR,
  type LeaveFieldError,
} from "@/domain/leave/days";
import { DayNumbers } from "../day-numbers";
import { HALF_LABELS, LEAVE_KIND_LABELS } from "../labels";
import { previewLeaveAction, resubmitLeaveAction, submitLeaveAction } from "../actions";
import { usePhoneWidth } from "../use-phone-width";
import { formBlocked } from "./form-state";
import styles from "../leave.module.css";

// 04.1-02 S2 첫 형태 → 04.1-06 완성형(S2): 종류에 따라 칸이 바뀐다(종일·재택 = 시작 · 종료, 반차·반반차 = 날짜 하나 +
// 오전/오후). 제어 기본값(종류 `종일` · 시간 = DEFAULT_HALF_PERIOD — `—`로 열리지 않는다, T1) · 시작일을 고르면 종료일이
// 비었거나 더 빠를 때 시작일로 채운다(T10) · 칸이 바뀔 때마다 서버 미리보기 한 번(previewLeaveAction — 힌트 재료 · 잔고 행 ·
// 결재선. 서버 액션 순차 전송이라 늦은 옛 응답이 최신 입력을 덮지 않는다, CX-R4) · `Ctrl+Enter` 제출 · `Esc`/`취소` =
// 입력이 있으면 `입력 버리기` 확인. 제출 중에는 1차 pending + 동기 ref로 두 번째 누름 · `Ctrl+Enter`를 무시한다(CEO-12) —
// 새 신청 · 다시 신청 두 모드가 같은 가드를 쓴다.
const KIND_OPTIONS = LEAVE_KINDS.map((kind) => ({ value: kind, label: LEAVE_KIND_LABELS[kind] ?? kind }));
const HALF_OPTIONS = HALF_PERIODS.map((half) => ({ value: half, label: HALF_LABELS[half] ?? half }));
const CANCEL_HREF = "/leave";

// 04.1-05(S3 반려된 내 문서): 다시 신청 모드 — 값이 채워진 같은 폼(두 벌을 만들지 않는다). 번호는 그대로,
// 1차 라벨 `연차 다시 신청`, 액션 resubmitLeaveAction. 토스트는 문서 화면(호출부)이 띄운다 — 성공하면 같은
// 화면이 다시 그려져 폼이 사라지기 때문이다. 결재선 한 줄은 문서 화면이 그려 `route`로 넘기고, 폼은 새 신청과 같은
// 자리(라벨·값 목록 `결재선` 행)에 둔다 — 폰 고정 행동 줄 여백 위에 와야 가리지 않는다(04.1-06 DOM 감사).
export type LeaveFormResubmit = {
  leaveId: string;
  expectedVersion: number;
  initial: { kind: string; startDate: string; endDate: string; half: string | null; note: string | null };
  route: ReactNode;
  onResubmitted: (toast: string) => void;
};

type Values = { kind: string; half: string; startDate: string; endDate: string; note: string };
type LeaveInput = { kind: string; startDate: string; endDate: string; half: string; note: string };
type Blocked = { field: LeaveFieldError["field"]; message: string };

const FIELD_LABELS: Record<LeaveFieldError["field"], string> = { kind: "종류", startDate: "시작일", endDate: "종료일", half: "시간" };

function isSingleDay(kind: string): boolean {
  return kind === "half_day" || kind === "quarter_day";
}

function toInput(values: Values): LeaveInput {
  const singleDay = isSingleDay(values.kind);
  return {
    kind: values.kind,
    startDate: values.startDate,
    endDate: singleDay ? values.startDate : values.endDate,
    half: singleDay ? values.half : "",
    note: values.note,
  };
}

// 종료일 = 시작일로 채우는 규칙(T10) — 종료일이 비었거나 시작일보다 빠르면. 종료일 칸에 「비어 있음」 상태가 없다.
function withEndFilled(values: Values): Values {
  if (isSingleDay(values.kind) || values.startDate === "") return values;
  return values.endDate === "" || values.endDate < values.startDate ? { ...values, endDate: values.startDate } : values;
}

// 사용자가 바꾼 칸 수(T10) — 제어 기본값 · 자동으로 채운 종료일(= 시작일)은 세지 않는다.
function changedFieldCount(initial: Values, current: Values): number {
  const singleDay = isSingleDay(current.kind);
  let count = 0;
  if (current.kind !== initial.kind) count++;
  if (singleDay && current.half !== initial.half) count++;
  if (current.startDate !== initial.startDate) count++;
  if (!singleDay && current.endDate !== initial.endDate && current.endDate !== current.startDate) count++;
  if (current.note !== initial.note) count++;
  return count;
}

function blockedOf(values: Values): Blocked | null {
  const singleDay = isSingleDay(values.kind);
  if (values.kind === "") return { field: "kind", message: LEAVE_KIND_EMPTY_ERROR };
  if (singleDay && values.half === "") return { field: "half", message: LEAVE_HALF_EMPTY_ERROR };
  if (values.startDate === "") return { field: "startDate", message: singleDay ? LEAVE_DATE_EMPTY_ERROR : LEAVE_START_EMPTY_ERROR };
  return null;
}

// 「원인 · 다음 행동」 — 다음 행동은 그 칸으로 가는 3차 버튼이다.
function splitReason(message: string): [string, string] {
  const index = message.lastIndexOf(" · ");
  return index < 0 ? [message, ""] : [message.slice(0, index), message.slice(index + 3)];
}

export function LeaveForm({ resubmit }: { resubmit?: LeaveFormResubmit } = {}) {
  const router = useRouter();
  const phone = usePhoneWidth();
  const [initial] = useState<Values>(() => ({
    kind: resubmit?.initial.kind ?? "full_day",
    half: resubmit?.initial.half ?? DEFAULT_HALF_PERIOD,
    startDate: resubmit?.initial.startDate ?? "",
    endDate: resubmit?.initial.endDate ?? "",
    note: resubmit?.initial.note ?? "",
  }));
  const [values, setValues] = useState<Values>(initial);
  const [discardCount, setDiscardCount] = useState<number | null>(null);
  const [networkFailed, setNetworkFailed] = useState(false);
  // 제출 중 — 누른 즉시 켠다(렌더 상태 + 동기 ref). 서버 액션 순차 전송 때문에 제출이 대기 중인 미리보기 뒤에 줄을 서도
  // 1차는 누른 직후 `연차 신청…`이다(C-P2). ref는 한 렌더 사이에 온 두 keydown을 막는다(CEO-12).
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);

  function release() {
    submittingRef.current = false;
    setSubmitting(false);
  }

  const previewed = useAction(previewLeaveAction);
  const preview = previewed.result.data ?? null;
  const submitted = useAction(submitLeaveAction, {
    onSuccess: ({ data }) => {
      if (!data || !("result" in data)) {
        release();
        return;
      }
      // 토스트는 착지 화면(문서 화면)이 띄운다 — 이 폼은 이동하며 사라진다(04.1-06 DOM 감사 #3).
      router.push(`/leave/${data.result.documentId}?submitted=1`);
    },
    onError: ({ error }) => {
      release();
      if (error.thrownError) setNetworkFailed(true);
    },
  });
  const resubmitted = useAction(resubmitLeaveAction, {
    onSuccess: ({ data }) => {
      if (!data || !("result" in data)) {
        release();
        return;
      }
      const names = data.result.nextHolderNames;
      resubmit?.onResubmitted(names ? `연차 다시 신청 · 결재 요청됨 → ${names}` : "연차 다시 신청 · 결재 요청됨");
      release();
      router.refresh();
    },
    onError: ({ error }) => {
      release();
      if (error.thrownError) setNetworkFailed(true);
    },
  });
  const { result } = resubmit ? resubmitted : submitted;

  // 처음 연 값으로 미리보기 한 번 — 결재선 한 줄은 날짜 전에도 보인다. 하이드레이션 전에 들어온 입력이 이 효과보다 먼저
  // 처리되면(React가 이벤트를 다시 재생한다) 그 입력의 미리보기가 이미 나갔으므로 건너뛴다 — 처음 값 미리보기가 나중에
  // 나가 최신 입력의 결과를 덮지 않게.
  const previewedOnce = useRef(false);
  useEffect(() => {
    if (previewedOnce.current) return;
    previewedOnce.current = true;
    previewed.execute(toInput(initial));
  });

  function change(next: Values, refreshPreview = true) {
    const filled = withEndFilled(next);
    setValues(filled);
    if (!refreshPreview) return;
    previewedOnce.current = true;
    previewed.execute(toInput(filled));
  }

  const singleDay = isSingleDay(values.kind);
  const blocked = formBlocked(blockedOf(values), preview);
  const fieldErrors: LeaveFieldError[] = result.data && "rejected" in result.data ? result.data.rejected.errors : [];
  const errorOf = (field: LeaveFieldError["field"]) => fieldErrors.find((error) => error.field === field)?.message;
  const noteError = resubmit
    ? resubmitted.result.validationErrors?.input?.note?._errors?.[0]
    : submitted.result.validationErrors?.note?._errors?.[0];
  const firstField = fieldErrors[0]?.field;
  const failure = networkFailed
    ? null
    : (result.serverError ?? (firstField ? `신청 실패 · ${FIELD_LABELS[firstField]} ${fieldErrors.length}칸` : noteError ? "신청 실패 · 비고 1칸" : null));

  function run(input: LeaveInput) {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    setNetworkFailed(false);
    if (resubmit) resubmitted.execute({ leaveId: resubmit.leaveId, expectedVersion: resubmit.expectedVersion, input });
    else submitted.execute(input);
  }

  function submit() {
    if (submittingRef.current || blocked) return;
    run(toInput(values));
  }

  // 네트워크 실패 뒤 3차 `다시 신청` = 지금 칸의 값으로 같은 제출을 한 번 더(ref 가드 그대로, #24). 실패 뒤 고친
  // 입력을 옛 입력으로 덮어 보내지 않는다(04.1-06 코드 검토 L2).

  function cancel() {
    if (submittingRef.current) return;
    const count = changedFieldCount(initial, values);
    if (count === 0) router.push(CANCEL_HREF);
    else setDiscardCount(count);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    submit();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLFormElement>) {
    if (isCtrlCombo(event, "Enter")) {
      event.preventDefault();
      submit();
      return;
    }
    // `Enter` 기본 제출은 막는다 — 제출은 `Ctrl+Enter`와 1차 누름뿐(§7-15).
    if (event.key === "Enter" && event.target instanceof HTMLInputElement) {
      event.preventDefault();
      return;
    }
    if (event.key === "Escape") {
      // 열린 네이티브 선택 목록 · 자동 완성이 먼저 처리했으면 아무것도 하지 않는다(DR-27). 기본 동작(열린 다이얼로그
      // 닫기)도 막는다 — 이 Escape가 방금 연 확인을 바로 닫지 않게(project-form 04-46 편차와 같다).
      if (event.defaultPrevented || event.nativeEvent.isComposing) return;
      event.preventDefault();
      cancel();
    }
  }

  function focusField(field: Blocked["field"]) {
    document.getElementById(field)?.focus();
  }

  const hint = preview ? (preview.remote ? "재택 · 차감 없음" : preview.offDays ? `휴일 ${preview.offDays}일 제외` : null) : null;
  const route = !resubmit && preview ? preview.route : null;
  const skippedNote =
    route?.steps
      .filter((step) => step.skipped)
      .map((step) => `${step.label ?? ""} 단계 건너뜀(자기 승인 없음)`)
      .join(" · ") || null;
  const items: KvItem[] = [];
  if (preview?.balance) {
    items.push({
      label: "잔고",
      value: (
        <span data-testid="leave-balance-row">
          {preview.balance.map((line) => (
            <span key={line.text} className={styles[`balance-${line.tone}`]}>
              <DayNumbers text={line.text} />
            </span>
          ))}
        </span>
      ),
    });
  }
  if (resubmit?.route) {
    items.push({ label: "결재선", value: resubmit.route });
  } else if (!resubmit && preview?.routeBlocked) {
    // 결재선이 막히면 이유를 결재선 자리에 한 줄(04.1-06 코드 검토 L3) — 제출해도 같은 이유로 거부된다.
    items.push({ label: "결재선", value: <span className={styles.blockedReason}>{preview.routeBlocked}</span> });
  } else if (route) {
    items.push({
      label: "결재선",
      value: (
        <ApprovalRoute
          mode="line"
          drafter={route.drafterName ?? ""}
          steps={route.steps.filter((step) => !step.skipped).map((step) => ({ person: step.holderNames ?? "", label: step.label ?? "" }))}
          skippedNote={skippedNote}
        />
      ),
    });
  }

  const startError = errorOf("startDate");
  const endError = errorOf("endDate");
  const hintLine = hint ? (
    <div data-testid="leave-days-hint">
      <Form.Hint>
        <DayNumbers text={hint} />
      </Form.Hint>
    </div>
  ) : null;
  const [blockedCause, blockedNext] = blocked ? splitReason(blocked.message) : ["", ""];
  const primaryLabel = resubmit ? "연차 다시 신청" : "연차 신청";

  // 사용자 결정(2026-09-29 A, PR #90 5894348076) — 폰 고정 제출 줄은 취소(2차) 왼쪽 · 1차 오른쪽, 수화 뒤 DOM · Tab 순서도
  // 취소 → 1차(문서 화면 행동 줄과 같은 방식 — 수화 전 보이는 순서는 CSS order). PC 폼 줄은 §6-3대로 1차 왼쪽.
  const submitButton = (
    <span className={styles.submitWrap}>
      <Button
        id="leave-submit"
        type="submit"
        variant="primary"
        shortcut="Ctrl+Enter"
        pending={submitting}
        disabled={blocked !== null}
        aria-describedby={blocked ? "leave-blocked" : undefined}
      >
        {primaryLabel}
      </Button>
    </span>
  );

  return (
    <>
      <Form id="leave-form" layout="page" onSubmit={handleSubmit} onKeyDown={handleKeyDown}>
        <Form.Field id="kind" label="종류" width="select">
          <Select
            id="kind"
            options={KIND_OPTIONS}
            value={values.kind}
            onChange={(event) => change({ ...values, kind: event.target.value })}
            error={errorOf("kind")}
          />
        </Form.Field>

        <Form.Field id="startDate" label={singleDay ? "날짜" : "시작일"} width="short">
          <input
            id="startDate"
            name="startDate"
            type="date"
            value={values.startDate}
            onChange={(event) => change({ ...values, startDate: event.target.value })}
            className={styles.textInput}
            aria-invalid={startError ? true : undefined}
            aria-describedby={startError ? "startDate-error" : undefined}
          />
          {startError ? <Form.Error id="startDate-error">{startError}</Form.Error> : null}
          {singleDay ? hintLine : null}
        </Form.Field>

        {singleDay ? (
          <Form.Field id="half" label="시간" width="select">
            <Select
              id="half"
              options={HALF_OPTIONS}
              value={values.half}
              onChange={(event) => change({ ...values, half: event.target.value })}
              error={errorOf("half")}
            />
          </Form.Field>
        ) : (
          <Form.Field id="endDate" label="종료일" width="short">
            <input
              id="endDate"
              name="endDate"
              type="date"
              value={values.endDate}
              onChange={(event) => change({ ...values, endDate: event.target.value })}
              className={styles.textInput}
              aria-invalid={endError ? true : undefined}
              aria-describedby={endError ? "endDate-error" : undefined}
            />
            {endError ? <Form.Error id="endDate-error">{endError}</Form.Error> : null}
            {hintLine}
          </Form.Field>
        )}

        <Form.Field id="note" label="비고" width="long">
          <input
            id="note"
            name="note"
            type="text"
            maxLength={500}
            autoComplete="off"
            value={values.note}
            onChange={(event) => change({ ...values, note: event.target.value }, false)}
            className={styles.textInput}
            aria-invalid={noteError ? true : undefined}
            aria-describedby={noteError ? "note-error" : undefined}
          />
          {noteError ? <Form.Error id="note-error">{noteError}</Form.Error> : null}
        </Form.Field>

        {items.length > 0 ? <KvList items={items} /> : null}

        <div className={styles.formBar} data-testid="leave-form-actions" data-fixed-bar="">
          <Form.Actions>
            {phone ? null : submitButton}
            {blocked && !submitting ? (
              <span className={styles.blockedLine}>
                <span id="leave-blocked" className={styles.blockedReason}>{`${blockedCause} · `}</span>
                <Button variant="tertiary" onClick={() => focusField(blocked.field)}>
                  {blockedNext}
                </Button>
              </span>
            ) : null}
            {!blocked && networkFailed ? (
              <span className={styles.blockedLine}>
                <span className={styles.blockedReason}>신청 실패 · 네트워크 · </span>
                <Button variant="tertiary" onClick={submit}>
                  다시 신청
                </Button>
              </span>
            ) : null}
            {!blocked && failure ? <span className={styles.blockedReason}>{failure}</span> : null}
            <span className={styles.cancelWrap}>
              {/* 제출 중 비활성 이유 = 제출 중인 1차(UX-06 · 04.1-06 코드 검토 L5). */}
              <Button
                variant="secondary"
                shortcut="Esc"
                disabled={submitting}
                aria-describedby={submitting ? "leave-submit" : undefined}
                onClick={cancel}
              >
                취소
              </Button>
            </span>
            {phone ? submitButton : null}
          </Form.Actions>
        </div>
        <div className={styles.formBarSpacer} aria-hidden="true" />
      </Form>

      {/* <form> 밖(형제)에 렌더해 다이얼로그 안의 Esc · Enter가 폼 keydown · 폼 제출로 가지 않게 한다(project-form 선례). */}
      <ConfirmDialog
        open={discardCount !== null}
        onClose={() => setDiscardCount(null)}
        title="입력 버리기"
        subtitle={`${primaryLabel} · ${discardCount ?? 0}칸`}
        primary={{ label: "입력 버리기", onConfirm: () => router.push(CANCEL_HREF) }}
      />
    </>
  );
}
