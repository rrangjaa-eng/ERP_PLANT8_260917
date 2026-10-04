"use client";

import { useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { ConfirmDialog } from "@/ui/confirm-dialog/ConfirmDialog";
import { rejectAction } from "./actions";
import { withdrawLeaveAction } from "@/app/(app)/leave/actions";
import styles from "./decision-dialogs.module.css";

// 04.1-05 S6 반려 · 회수 확인 — ui/confirm-dialog(main의 공용 확인 모달 · 폰 시트) 그대로. 결재함(PC 행 ·
// 폰 결재 시트)과 문서 화면이 같이 쓴다. 제출 중: 1차 pending(`반려…`/`회수…`), 2차 · 확인 근거 칸은
// aria-disabled, Esc 무시(ConfirmDialog) + 동기 ref 가드로 두 번째 누름 · 연속 Ctrl+Enter 무시(T7).
// 서버 거부는 막힘 자리(1차 왼쪽), 다이얼로그는 닫히지 않는다 — 끝의 ` · 새로 고침`은 ConfirmDialog가 3차 버튼으로 바꾼다.

export type RejectMessages = { empty: string; tooLong: string; max: number };

export type DecisionTarget = {
  instanceId: string;
  version: number;
  // 반려 부제 `{번호} · {기안자} · {종류 기간} · {일수}`.
  subtitle: string;
  // 회수 부제 `{번호} · {종류 기간} · {일수}`(기안자 본인이 보므로 이름 없음).
  withdrawSubtitle: string;
  drafterName: string | null;
  // 회수 결과 줄(서버 결재선에서 — 지금 담당 · 이미 승인한 단계).
  withdrawLines: string[];
};

export function RejectDialog({
  target,
  messages,
  onClose,
  onDone,
}: {
  target: DecisionTarget | null;
  messages: RejectMessages;
  onClose: () => void;
  onDone: (toast: string) => void;
}) {
  const router = useRouter();
  const fieldId = useId();
  const [reason, setReason] = useState("");
  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const submittingRef = useRef(false);
  const { execute } = useAction(rejectAction, {
    onSuccess: ({ data }) => {
      if (!data) return;
      onDone(data.drafterName ? `반려 · ${data.drafterName}에게 돌아감` : "반려 · 기안자에게 돌아감");
      close();
      router.refresh();
    },
    onError: ({ error }) => {
      if (error.serverError) setServerError(error.serverError);
    },
    onSettled: () => {
      submittingRef.current = false;
      setPending(false);
    },
  });

  function close() {
    setReason("");
    setServerError(null);
    onClose();
  }

  const trimmed = reason.trim();
  const inputReason = trimmed.length === 0 ? messages.empty : trimmed.length > messages.max ? messages.tooLong : undefined;
  const blocked = serverError ?? inputReason;

  function confirm() {
    if (!target || submittingRef.current || blocked) return;
    submittingRef.current = true;
    setPending(true);
    execute({ instanceId: target.instanceId, expectedVersion: target.version, reason: trimmed });
  }

  return (
    <ConfirmDialog
      open={target !== null}
      onClose={close}
      title="연차 반려"
      subtitle={target?.subtitle}
      resultLines={[`${target?.drafterName ?? "기안자"}에게 돌아감 · 내 결재에서 빠짐`]}
      evidenceField={
        <div className={styles.reason}>
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
        label: "반려",
        pending,
        onConfirm: confirm,
        disabledReason: blocked,
      }}
    />
  );
}

export function WithdrawDialog({
  target,
  onClose,
  onDone,
}: {
  target: DecisionTarget | null;
  onClose: () => void;
  onDone: (toast: string) => void;
}) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const submittingRef = useRef(false);
  const { execute } = useAction(withdrawLeaveAction, {
    onSuccess: () => {
      onDone("회수 · 결재 멈춤");
      close();
      router.refresh();
    },
    onError: ({ error }) => {
      if (error.serverError) setServerError(error.serverError);
    },
    onSettled: () => {
      submittingRef.current = false;
      setPending(false);
    },
  });

  function close() {
    setServerError(null);
    onClose();
  }

  function confirm() {
    if (!target || submittingRef.current || serverError) return;
    submittingRef.current = true;
    setPending(true);
    execute({ instanceId: target.instanceId, expectedVersion: target.version });
  }

  return (
    <ConfirmDialog
      open={target !== null}
      onClose={close}
      title="연차 회수"
      subtitle={target?.withdrawSubtitle}
      resultLines={target?.withdrawLines}
      primary={{
        label: "회수",
        pending,
        onConfirm: confirm,
        disabledReason: serverError ?? undefined,
      }}
    />
  );
}
