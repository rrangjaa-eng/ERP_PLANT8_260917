"use client";

import { useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { ConfirmDialog } from "@/ui/confirm-dialog/ConfirmDialog";
import { ReasonField } from "@/ui/reason-field/ReasonField";
import { rejectAction, withdrawAction } from "./actions";
import styles from "./decision-dialogs.module.css";

// 04.1-05 S6 반려 · 회수 확인 — ui/confirm-dialog(main의 공용 확인 모달 · 폰 시트) 그대로. 결재함(PC 행 ·
// 폰 결재 시트)과 문서 화면이 같이 쓴다. 제출 중: 1차 pending(`반려…`/`회수…`), 2차 · 확인 근거 칸은
// aria-disabled, Esc 무시(ConfirmDialog) + 동기 ref 가드로 두 번째 누름 · 연속 Ctrl+Enter 무시(T7).
// 서버 거부는 막힘 자리(1차 왼쪽), 다이얼로그는 닫히지 않는다 — 끝의 ` · 새로 고침`은 ConfirmDialog가 3차 버튼으로 바꾼다.

export type RejectMessages = { empty: string; tooLong: string; max: number };

export type DecisionTarget = {
  instanceId: string;
  version: number;
  // 05-01(Round 4 D8): 종류 라벨 — 확인 창 제목 `{종류} 반려` · `{종류} 회수`.
  kindLabel: string;
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
  reasonOptions,
  onClose,
  onDone,
}: {
  target: DecisionTarget | null;
  messages: RejectMessages;
  // 07.2-07 X3: 반려 사유 코드표의 활성 항목 label. 필수 — 기본값을 두지 않아 호출부가 빠뜨리면 타입 검사가 잡는다.
  reasonOptions: string[];
  onClose: () => void;
  onDone: (toast: string) => void;
}) {
  const router = useRouter();
  const fieldId = useId();
  const [reason, setReason] = useState("");
  // 닫을 때 ReasonField를 새로 세워 고른 항목 상태도 비운다(글만 setReason("")으로는 select가 남는다).
  const [fieldKey, setFieldKey] = useState(0);
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
    setFieldKey((key) => key + 1);
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
      title={`${target?.kindLabel ?? ""} 반려`}
      subtitle={target?.subtitle}
      resultLines={[`${target?.drafterName ?? "기안자"}에게 돌아감 · 내 결재에서 빠짐`]}
      evidenceField={
        <div className={styles.reason}>
          <label htmlFor={fieldId}>사유</label>
          <ReasonField
            key={fieldKey}
            id={fieldId}
            options={reasonOptions}
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
  const { execute } = useAction(withdrawAction, {
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
      title={`${target?.kindLabel ?? ""} 회수`}
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

// 07.2-16(S13 · D-7270 · D-7272): 결재함 일괄 확인 — 승인이 되돌릴 수 없는 일이라서만 확인 1회. 서버 호출 · 결과 처리는 결재함 표가 한다
// (막힌 행 · 결과 글자 · 포커스가 표 쪽 상태라서). 창은 건수 · 요약 부제 · 막힘 · 전체 실패 줄만 그린다.
export type BatchDialogBase = {
  open: boolean;
  count: number;
  // 부제 `{N}건 · 지출결의 {합계} · 연차 {N}일`(조각은 해당할 때만).
  subtitle: string;
  pending: boolean;
  // 액션 전체 실패(연결 끊김 · 서버 거부) — 창은 열린 채 행동 줄 왼쪽 한 줄(SYSTEM §7-17 실패 줄).
  failure: string | null;
  onClose: () => void;
};

export function BatchApproveDialog({ overdrawCount, onConfirm, ...base }: BatchDialogBase & { overdrawCount: number; onConfirm: () => void }) {
  return (
    <ConfirmDialog
      open={base.open}
      onClose={base.onClose}
      title="일괄 승인"
      subtitle={base.subtitle}
      // 잔여 초과는 막지 않는다(D-7266) — 결과 줄에 경고 조각만.
      resultLines={overdrawCount > 0 ? [`잔여 초과 연차 ${overdrawCount}건 포함`] : undefined}
      primary={{
        label: `승인 ${base.count}건`,
        shortcut: "Ctrl+Enter",
        pending: base.pending,
        onConfirm,
        ...(base.failure ? { failure: base.failure } : {}),
      }}
    />
  );
}

export function BatchRejectDialog({
  messages,
  reasonOptions,
  serverError,
  onReasonChange,
  onConfirm,
  ...base
}: BatchDialogBase & {
  messages: RejectMessages;
  reasonOptions: string[];
  // 서버가 사유를 거부한 글자(UserFacingError 원문) — 입력을 바꾸면 onReasonChange로 호출부가 지운다.
  serverError: string | null;
  onReasonChange: () => void;
  onConfirm: (reason: string) => void;
}) {
  const fieldId = useId();
  const [reason, setReason] = useState("");
  const [fieldKey, setFieldKey] = useState(0);
  // 처리 성공으로 호출부가 창을 닫아도(onClose를 거치지 않는다) 다음에 열 때 사유가 비어 있게 — 닫히는 렌더에서 비운다.
  const [wasOpen, setWasOpen] = useState(base.open);
  if (wasOpen !== base.open) {
    setWasOpen(base.open);
    if (!base.open) {
      setReason("");
      setFieldKey((key) => key + 1);
    }
  }
  const trimmed = reason.trim();
  const inputReason = trimmed.length === 0 ? messages.empty : trimmed.length > messages.max ? messages.tooLong : undefined;
  const blocked = serverError ?? inputReason;

  return (
    <ConfirmDialog
      open={base.open}
      onClose={base.onClose}
      title="일괄 반려"
      subtitle={base.subtitle}
      evidenceField={
        <div className={styles.reason}>
          <label htmlFor={fieldId}>사유</label>
          <ReasonField
            key={fieldKey}
            id={fieldId}
            options={reasonOptions}
            value={reason}
            maxLength={messages.max}
            locked={base.pending}
            onChange={(next) => {
              setReason(next);
              onReasonChange();
            }}
          />
        </div>
      }
      primary={{
        label: `반려 ${base.count}건`,
        shortcut: "Ctrl+Enter",
        pending: base.pending,
        onConfirm: () => {
          if (!blocked) onConfirm(trimmed);
        },
        disabledReason: blocked,
        ...(base.failure && !blocked ? { failure: base.failure } : {}),
      }}
    />
  );
}
