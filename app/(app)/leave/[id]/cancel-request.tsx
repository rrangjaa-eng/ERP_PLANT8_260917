"use client";

import { useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { Button } from "@/ui/button/Button";
import { ConfirmDialog } from "@/ui/confirm-dialog/ConfirmDialog";
import { ReasonField } from "@/ui/reason-field/ReasonField";
import type { RejectMessages } from "@/app/(app)/approvals/decision-dialogs";
import reasonStyles from "@/app/(app)/approvals/decision-dialogs.module.css";
import { requestLeaveCancelAction, resubmitLeaveCancelAction } from "../actions";

// 07.2-15(S18 · PU10): 승인된 연차의 `취소 요청` 입구 + 확인 창. 입구를 그릴지는 서버(page — previewLeaveCancel 통과)가 정한다.
// 창 갈래는 하나 — 대표 본인 연차도 같은 라벨이고 결과 줄 이름만 다르다(07.2 D-7310). 사유는 자유 입력 필수(코드표 항목 없음).
// 반려 · 회수된 취소는 같은 창으로 다시 요청한다(입구만 3차 `취소 다시 요청`). 서버 거부는 막힘 자리, 창은 닫히지 않는다.

export type LeaveCancelEntry = {
  leaveId: string;
  /** 반려 · 회수된 취소 인스턴스의 version — 있으면 다시 요청(resubmit). */
  resubmitVersion: number | null;
  /** 창 부제 `{종류} {기간}`. */
  subtitle: string;
  approverName: string | null;
};

export function CancelRequest({ entry, messages, onDone }: { entry: LeaveCancelEntry; messages: RejectMessages; onDone: (toast: string) => void }) {
  const router = useRouter();
  const fieldId = useId();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const submittingRef = useRef(false);

  // 제출 뒤 이 입구는 사라진다(취소 요청 중) — 토스트는 남아 있는 행동 줄(onDone)이 띄운다.
  function done(name: string | null | undefined) {
    onDone(name ? `취소 요청 · 결재 요청됨 → ${name}` : "취소 요청 · 결재 요청됨");
    close();
    router.refresh();
  }
  function settled() {
    submittingRef.current = false;
    setPending(false);
  }
  const request = useAction(requestLeaveCancelAction, {
    onSuccess: ({ data }) => (data ? done(data.result.nextHolderNames) : undefined),
    onError: ({ error }) => (error.serverError ? setServerError(error.serverError) : undefined),
    onSettled: settled,
  });
  const resubmit = useAction(resubmitLeaveCancelAction, {
    onSuccess: ({ data }) => (data ? done(data.result.nextHolderNames) : undefined),
    onError: ({ error }) => (error.serverError ? setServerError(error.serverError) : undefined),
    onSettled: settled,
  });

  function close() {
    setReason("");
    setServerError(null);
    setOpen(false);
  }

  const trimmed = reason.trim();
  const inputReason = trimmed.length === 0 ? messages.empty : trimmed.length > messages.max ? messages.tooLong : undefined;
  const blocked = serverError ?? inputReason;

  function confirm() {
    if (submittingRef.current || blocked) return;
    submittingRef.current = true;
    setPending(true);
    if (entry.resubmitVersion === null) request.execute({ leaveId: entry.leaveId, reason: trimmed });
    else resubmit.execute({ leaveId: entry.leaveId, expectedVersion: entry.resubmitVersion, reason: trimmed });
  }

  return (
    <>
      <Button variant={entry.resubmitVersion === null ? "secondary" : "tertiary"} onClick={() => setOpen(true)}>
        {entry.resubmitVersion === null ? "취소 요청" : "취소 다시 요청"}
      </Button>
      <ConfirmDialog
        open={open}
        onClose={close}
        title="연차 취소 요청"
        subtitle={entry.subtitle}
        resultLines={[entry.approverName ? `결재 → ${entry.approverName} · 승인 시 잔고 복귀` : "승인 시 잔고 복귀"]}
        evidenceField={
          <div className={reasonStyles.reason}>
            <label htmlFor={fieldId}>사유</label>
            <ReasonField
              id={fieldId}
              options={[]}
              value={reason}
              maxLength={messages.max}
              locked={pending}
              onChange={(next) => {
                setReason(next);
                setServerError(null);
              }}
            />
          </div>
        }
        primary={{ label: "취소 요청", pending, onConfirm: confirm, disabledReason: blocked }}
      />
    </>
  );
}
