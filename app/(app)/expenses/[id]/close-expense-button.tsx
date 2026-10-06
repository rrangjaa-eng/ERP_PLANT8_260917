"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/ui/button/Button";
import { ConfirmDialog, RefreshStep } from "@/ui/confirm-dialog/ConfirmDialog";
import dialogStyles from "@/app/(app)/approvals/decision-dialogs.module.css";
import { closeExpenseAction } from "../actions";

// 06-28(UI-SPEC S23 · Copywriting 「Destructive — 지출결의 종결」): 반려 · 회수 문서 머리 행동 자리의 2차 `종결` → 05 ConfirmDialog.
// 부제 · 결과 줄은 서버(getExpense의 closeDialog)가 만든다. 사유 한 칸 필수 — 비면 1차 비활성 + 「Error — 사유 근거 칸」(1차 왼쪽, 05 반려 ·
// 06-04 지급 취소 선례). 서버 거부(다시 제출됨 · 이미 종결 · version 다름)는 1차 왼쪽 이유 자리 + 꼬리 `새로 고침`(ConfirmDialog가
// 05 RefreshStep으로 바꾼다), 응답 없음은 실패 줄 `결과를 받지 못함 · 새로 고침` — 어느 경우든 모달은 열려 있고 사유는 남는다.
// 성공하면 화면을 다시 받고(버튼은 사라진다) 포커스는 제목으로 — 토스트 없음. 붉은 버튼 없음(위험은 확인 모달이 가른다).

export type CloseExpenseDialog = { subtitle: string; resultLines: string[] };
export type CloseReasonMessages = { empty: string; tooLong: string; max: number };

const NO_RESPONSE = "결과를 받지 못함";

function focusScreenTitle() {
  document.querySelector<HTMLElement>('[data-ui="screen-title"]')?.focus();
}

export function CloseExpenseButton({
  expenseId,
  version,
  dialog,
  messages,
}: {
  expenseId: string;
  version: number;
  dialog: CloseExpenseDialog;
  messages: CloseReasonMessages;
}) {
  const router = useRouter();
  const fieldId = useId();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [serverError, setServerError] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | undefined>(undefined);
  const [submitting, setSubmitting] = useState(false);
  const [refreshing, startRefresh] = useTransition();
  const busyRef = useRef(false);
  const closedRef = useRef(false);

  // 종결 뒤 다시 받은 화면에서 이 버튼은 대개 사라진다 — 사라질 때 포커스를 제목으로(남아 있으면 아래 효과가 닫고 옮긴다).
  useEffect(
    () => () => {
      if (closedRef.current) focusScreenTitle();
    },
    [],
  );
  useEffect(() => {
    if (!closedRef.current || refreshing) return;
    closedRef.current = false;
    busyRef.current = false;
    setSubmitting(false);
    setOpen(false);
    // 닫힘 이벤트(트리거로 포커스를 돌림) 뒤에 제목으로 옮긴다.
    window.setTimeout(focusScreenTitle, 0);
  }, [refreshing]);

  const trimmed = reason.trim();
  const inputReason = trimmed.length === 0 ? messages.empty : trimmed.length > messages.max ? messages.tooLong : undefined;
  const blocked = serverError ?? inputReason;
  const pending = submitting || refreshing;

  function close() {
    setOpen(false);
    setServerError(null);
    setFailure(undefined);
  }

  async function confirm() {
    if (busyRef.current || blocked) return;
    busyRef.current = true;
    setSubmitting(true);
    setFailure(undefined);
    let response: Awaited<ReturnType<typeof closeExpenseAction>> | undefined;
    try {
      response = await closeExpenseAction({ expenseId, expectedVersion: version, reason: trimmed });
    } catch {
      response = undefined;
    }
    if (response?.data) {
      closedRef.current = true;
      setReason("");
      startRefresh(() => router.refresh());
      return;
    }
    busyRef.current = false;
    setSubmitting(false);
    const message = response?.serverError ?? response?.validationErrors?.reason?._errors?.[0];
    if (message) setServerError(message);
    else setFailure(NO_RESPONSE);
  }

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        종결
      </Button>
      <ConfirmDialog
        open={open}
        onClose={close}
        title="지출결의 종결"
        subtitle={dialog.subtitle}
        resultLines={dialog.resultLines}
        evidenceField={
          <div className={dialogStyles.reason}>
            <label htmlFor={fieldId}>사유</label>
            <textarea
              id={fieldId}
              rows={2}
              autoComplete="off"
              value={reason}
              aria-disabled={pending ? "true" : undefined}
              readOnly={pending}
              onChange={(event) => {
                setReason(event.target.value);
                setServerError(null);
              }}
            />
          </div>
        }
        primary={{
          label: "종결",
          shortcut: "Ctrl+Enter",
          pending,
          onConfirm: () => void confirm(),
          disabledReason: blocked,
          failure,
          // 응답 없음의 다음 한 수 — 화면을 다시 받은 뒤 닫는다(거부 꼬리 `새로 고침`과 같은 동작).
          nextStep: failure ? <RefreshStep onDone={close} /> : undefined,
        }}
      />
    </>
  );
}
