"use client";

import { useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { isCtrlCombo } from "@/lib/shortcut";
import { Button } from "@/ui/button/Button";
import { ConfirmDialog } from "@/ui/confirm-dialog/ConfirmDialog";
import { Form } from "@/ui/form/Form";
import { KvList } from "@/ui/kv-list/KvList";
import { ReasonField } from "@/ui/reason-field/ReasonField";
import { usePhoneWidth } from "@/app/(app)/leave/use-phone-width";
import { requestDateChangeAction } from "../actions";
import styles from "../expense.module.css";

// 07.2-18 S16 요청 폼 — 칸 둘(`새 희망일` 네이티브 날짜 · 비워 두고 포커스, `변경 사유` ReasonField). 1차 `변경 요청 Ctrl+Enter` · 2차 `취소`
// (PC 1차 왼쪽 · 폰 고정 줄 2차 왼쪽 · 1차 오른쪽 — 지출결의 폼 제출 줄과 같은 클래스). 막힘 이유는 1차 옆 `원인 · 다음 행동`(3차가 그 칸으로).
// 성공하면 상세로 돌아가고 상세가 토스트 `변경 요청 · 경영관리 확인 대기`를 띄운다(`?dateRequested=1` — 제출 착지 선례).
const DATE_EMPTY = { field: "newDate", cause: "새 희망일 없음", next: "날짜 고르기" } as const;
const REASON_EMPTY = { field: "reason", cause: "사유 없음", next: "사유 적기" } as const;
const REASON_MAX = 500;

function nextDay(date: string): string {
  const at = new Date(`${date}T00:00:00Z`);
  at.setUTCDate(at.getUTCDate() + 1);
  return at.toISOString().slice(0, 10);
}

export function DateRequestForm({
  expenseId,
  currentDate,
  today,
  reasonOptions,
}: {
  expenseId: string;
  currentDate: string | null;
  today: string;
  reasonOptions: string[];
}) {
  const router = useRouter();
  const phone = usePhoneWidth();
  const detailHref = `/expenses/${expenseId}`;
  const [newDate, setNewDate] = useState("");
  const [reason, setReason] = useState("");
  const [failure, setFailure] = useState<string | null>(null);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  // 누른 즉시 켜는 동기 ref — 한 렌더 사이에 온 두 keydown이 요청을 두 번 보내지 않는다.
  const submittingRef = useRef(false);

  const blocked = newDate === "" ? DATE_EMPTY : reason.trim() === "" ? REASON_EMPTY : null;

  async function submit() {
    if (submittingRef.current || blocked) return;
    submittingRef.current = true;
    setSubmitting(true);
    setFailure(null);
    let result: Awaited<ReturnType<typeof requestDateChangeAction>> | undefined;
    try {
      result = await requestDateChangeAction({ expenseId, newDate, reason });
    } catch {
      result = undefined;
    }
    if (result?.data) {
      router.push(`${detailHref}?dateRequested=1`);
      return;
    }
    submittingRef.current = false;
    setSubmitting(false);
    setFailure(result?.serverError ?? result?.validationErrors?.newDate?._errors?.[0] ?? result?.validationErrors?.reason?._errors?.[0] ?? "요청 실패 · 다시 시도");
  }

  function cancel() {
    if (submittingRef.current) return;
    if (newDate === "" && reason.trim() === "") router.push(detailHref);
    else setDiscardOpen(true);
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
    // `Enter` 기본 제출은 막는다 — 제출은 `Ctrl+Enter`와 1차 누름뿐(§7-15).
    if (event.key === "Enter" && event.target instanceof HTMLInputElement) {
      event.preventDefault();
      return;
    }
    if (event.key === "Escape") {
      if (event.defaultPrevented || event.nativeEvent.isComposing) return;
      event.preventDefault();
      cancel();
    }
  }

  const submitButton = (
    <span className={styles.submitWrap}>
      <Button
        id="date-request-submit"
        type="submit"
        variant="primary"
        shortcut="Ctrl+Enter"
        pending={submitting}
        disabled={blocked !== null}
        aria-describedby={blocked ? "date-request-blocked" : undefined}
      >
        변경 요청
      </Button>
    </span>
  );

  return (
    <>
      <Form id="date-request-form" layout="page" onSubmit={handleSubmit} onKeyDown={handleKeyDown}>
        <KvList items={[{ label: "현재 희망일", value: currentDate ?? <span className={styles.muted}>—</span> }]} />
        <Form.Field id="newDate" label="새 희망일" width="short">
          <input
            id="newDate"
            name="newDate"
            type="date"
            min={nextDay(today)}
            autoFocus
            value={newDate}
            onChange={(event) => setNewDate(event.target.value)}
            className={styles.textInput}
            aria-describedby={blocked?.field === "newDate" ? "date-request-blocked" : undefined}
          />
        </Form.Field>
        <Form.Field id="reason" label="변경 사유" width="long">
          <ReasonField id="reason" options={reasonOptions} value={reason} onChange={setReason} maxLength={REASON_MAX} locked={submitting} />
        </Form.Field>

        <div className={styles.formBar} data-testid="date-request-actions" data-fixed-bar="">
          <Form.Actions>
            {phone ? null : submitButton}
            {blocked && !submitting ? (
              <span className={styles.blockedLine}>
                <span id="date-request-blocked" role="status" className={styles.blockedReason}>{`${blocked.cause} · `}</span>
                <Button variant="tertiary" onClick={() => document.getElementById(blocked.field)?.focus()}>
                  {blocked.next}
                </Button>
              </span>
            ) : null}
            {!blocked && failure ? (
              <span role="status" className={styles.blockedReason}>
                {failure}
              </span>
            ) : null}
            <span className={styles.saveWrap}>
              <Button variant="secondary" shortcut="Esc" disabled={submitting} aria-describedby={submitting ? "date-request-submit" : undefined} onClick={cancel}>
                취소
              </Button>
            </span>
            {phone ? submitButton : null}
          </Form.Actions>
        </div>
        <div className={styles.formBarSpacer} aria-hidden="true" />
      </Form>

      {/* <form> 밖(형제) — 다이얼로그 안의 Esc · Enter가 폼 keydown · 제출로 가지 않게(연차 신청 폼 선례). */}
      <ConfirmDialog
        open={discardOpen}
        onClose={() => setDiscardOpen(false)}
        title="입력 버리기"
        subtitle="희망 지급일 변경 요청"
        primary={{ label: "입력 버리기", onConfirm: () => router.push(detailHref) }}
      />
    </>
  );
}
