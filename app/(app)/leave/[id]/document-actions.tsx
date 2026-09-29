"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { Button } from "@/ui/button/Button";
import { Toast, type ToastTone } from "@/ui/toast/Toast";
import { isCtrlCombo } from "@/lib/shortcut";
import { approveAction } from "@/app/(app)/approvals/actions";
import { approveToast } from "@/app/(app)/approvals/approve-toast";
import { ConflictLine } from "@/app/(app)/approvals/conflict-line";
import { RejectDialog, WithdrawDialog, type DecisionTarget, type RejectMessages } from "@/app/(app)/approvals/decision-dialogs";
import { LeaveForm } from "../new/leave-form";
import styles from "./document-actions.module.css";

// 04.1-05 S3 행동 줄 — 서버 가능 행동 목록을 **전부** 그대로 그린다(클라이언트는 상태로 고르지 않는다 · 권한을
// 따로 보지 않는다, CXF-B-F01 · CX-W1): 승인 = 1차(Ctrl+Enter, 즉시) · 반려 = 2차(→ 반려 확인) · 회수 = 2차
// (→ 회수 확인) · 다시 신청 = 값이 채워진 같은 폼(1차 `연차 다시 신청`). 목록이 비면 행동 줄이 없다.
// 제출 중: 누른 버튼 pending(라벨 뒤 `…`) · 같은 줄 나머지는 ui/button disabled(= aria-disabled, 네이티브
// disabled 아님 — §7-1 ⑦ DR-11) · 동기 ref 가드로 두 번째 누름 · 연속 Ctrl+Enter 무시(T7).

type Action = "approve" | "reject" | "withdraw" | "resubmit";

export type DocumentActionsProps = {
  instanceId: string | null;
  version: number | null;
  actions: Action[];
  decision: DecisionTarget | null;
  rejectMessages: RejectMessages;
  resubmit: {
    leaveId: string;
    expectedVersion: number;
    initial: { kind: string; startDate: string; endDate: string; half: string | null; note: string | null };
  } | null;
  resubmitRoute: ReactNode;
};

export function DocumentActions({ instanceId, version, actions, decision, rejectMessages, resubmit, resubmitRoute }: DocumentActionsProps) {
  const router = useRouter();
  const [toast, setToast] = useState<{ message: string; tone: ToastTone } | null>(null);
  const [conflict, setConflict] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<DecisionTarget | null>(null);
  const [withdrawTarget, setWithdrawTarget] = useState<DecisionTarget | null>(null);
  const submittingRef = useRef(false);
  const showToast = (message: string) => setToast({ message, tone: "default" });

  const { execute } = useAction(approveAction, {
    onSuccess: ({ data }) => {
      if (!data) return;
      showToast(approveToast(data));
      router.refresh();
    },
    onError: ({ error }) => {
      if (error.serverError) setConflict(error.serverError);
    },
    onSettled: () => {
      submittingRef.current = false;
      setPending(false);
    },
  });

  const canApprove = actions.includes("approve") && instanceId !== null && version !== null;

  function approve() {
    if (!canApprove || submittingRef.current || instanceId === null || version === null) return;
    submittingRef.current = true;
    setPending(true);
    setConflict(null);
    execute({ instanceId, expectedVersion: version });
  }

  // 문서 화면의 1차 `승인` = Ctrl+Enter(§7-9). 확인 다이얼로그가 열려 있으면 그쪽 1차가 받는다. 렌더마다 다시
  // 건다(지금 렌더의 approve · 열린 다이얼로그 상태를 쓴다).
  const dialogOpen = rejectTarget !== null || withdrawTarget !== null;
  useEffect(() => {
    if (!canApprove || dialogOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (!isCtrlCombo(event, "Enter")) return;
      event.preventDefault();
      approve();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  });

  const secondary = actions.find((action): action is "reject" | "withdraw" => action === "reject" || action === "withdraw");

  return (
    <>
      {resubmit ? (
        <div className={styles.resubmit}>
          <LeaveForm resubmit={{ ...resubmit, route: resubmitRoute, onResubmitted: showToast }} />
        </div>
      ) : null}
      {canApprove || secondary ? (
        <>
          <div className={styles.bar}>
            {conflict ? <ConflictLine message={conflict} /> : null}
            <div className={styles.buttons}>
              {canApprove ? (
                <span className={styles.primaryWrap}>
                  <Button variant="primary" shortcut="Ctrl+Enter" pending={pending} onClick={approve}>
                    승인
                  </Button>
                </span>
              ) : null}
              {secondary && decision ? (
                <span className={styles.secondaryWrap}>
                  <Button
                    variant="secondary"
                    disabled={pending}
                    onClick={() => (secondary === "reject" ? setRejectTarget(decision) : setWithdrawTarget(decision))}
                  >
                    {secondary === "reject" ? "반려" : "회수"}
                  </Button>
                </span>
              ) : null}
            </div>
          </div>
          <div className={styles.spacer} aria-hidden="true" />
        </>
      ) : null}
      <RejectDialog target={rejectTarget} messages={rejectMessages} onClose={() => setRejectTarget(null)} onDone={showToast} />
      <WithdrawDialog target={withdrawTarget} onClose={() => setWithdrawTarget(null)} onDone={showToast} />
      {toast ? <Toast message={toast.message} tone={toast.tone} onDismiss={() => setToast(null)} /> : null}
    </>
  );
}
