"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/ui/button/Button";
import { isCtrlCombo } from "@/lib/shortcut";
import { ConflictLine } from "@/app/(app)/approvals/conflict-line";
import { DocumentActions, type DocumentActionsProps } from "@/app/(app)/leave/[id]/document-actions";
import barStyles from "@/app/(app)/leave/[id]/document-actions.module.css";
import { submitSettlementAction } from "../../actions";
import { useSettlementSubmitToast } from "../settlement-button";
import styles from "./settlement.module.css";

// 05-11(UI-SPEC S10 (나)): 정산 결재 문서 화면 행동 줄 — 04.1 행동 줄(`DocumentActions`)을 그대로 쓴다(승인 1차 Ctrl+Enter · 반려 / 회수 2차 →
// 04.1 S6 확인, 제목은 종류 라벨 `정산 결재`). 승인 막힘(진행 복귀)은 서버 이유를 `승인`에 싣는다. 다시 올리기는 폼이 아니라 이 화면의 1차
// `정산 결재 다시 올리기`(Ctrl+Enter · 확인 없음)이고, 프로젝트가 진행으로 돌아가 올릴 수 없으면 그 자리에 한 줄만 둔다.
// 다시 올린 뒤 토스트는 머리 줄 첫 올리기와 같은 `되돌리기` 토스트다(사용자 확정 10/5 16:14).

const RESUBMIT_LABEL = "정산 결재 다시 올리기";

type SettlementActionsProps = Omit<DocumentActionsProps, "resubmit" | "resubmitRoute"> & {
  /** 문서 id = 프로젝트 id. */
  projectId: string;
  /** 다시 올릴 수 있는가(가능 행동 resubmit — 서버 판정). */
  canResubmit: boolean;
  /** 반려 · 회수된 내 문서인데 프로젝트가 진행 — `진행 중 · 정산 뒤 다시 올리기`. */
  resubmitWaiting: boolean;
};

export function SettlementActions({ projectId, canResubmit, resubmitWaiting, ...props }: SettlementActionsProps) {
  // 토스트는 다시 올린 뒤 행동 줄이 사라져도(새로 고침) 남아야 해서 여기서 든다.
  const { showSubmitted, toastNode } = useSettlementSubmitToast(projectId);
  return (
    <>
      <DocumentActions {...props} resubmit={null} resubmitRoute={null} />
      {canResubmit ? <ResubmitBar projectId={projectId} onSubmitted={(data) => showSubmitted(RESUBMIT_LABEL, data)} /> : null}
      {!canResubmit && resubmitWaiting ? <p className={styles.waiting}>진행 중 · 정산 뒤 다시 올리기</p> : null}
      {toastNode}
    </>
  );
}

function ResubmitBar({ projectId, onSubmitted }: { projectId: string; onSubmitted: (data: { round: number; nextHolderNames: string | null }) => void }) {
  const router = useRouter();
  const busyRef = useRef(false);
  const [pending, setPending] = useState(false);
  const [conflict, setConflict] = useState<string | null>(null);

  async function resubmit() {
    if (busyRef.current) return;
    busyRef.current = true;
    setPending(true);
    setConflict(null);
    let result: Awaited<ReturnType<typeof submitSettlementAction>> | undefined;
    try {
      result = await submitSettlementAction({ projectId });
    } catch {
      result = undefined;
    }
    busyRef.current = false;
    setPending(false);
    const data = result?.data;
    if (!data) {
      setConflict(result?.serverError ?? `${RESUBMIT_LABEL} 실패 · 다시 시도`);
      return;
    }
    if (data.kind === "submitted") onSubmitted(data);
    router.refresh();
  }

  // 문서 화면의 1차 = Ctrl+Enter(§7-9). 렌더마다 다시 건다(지금 렌더의 resubmit을 쓴다).
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!isCtrlCombo(event, "Enter")) return;
      event.preventDefault();
      void resubmit();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  });

  return (
    <>
      <div className={barStyles.bar} data-fixed-bar="">
        {conflict ? <ConflictLine message={conflict} /> : null}
        <div className={barStyles.buttons}>
          <span className={barStyles.primaryWrap}>
            <Button variant="primary" shortcut="Ctrl+Enter" pending={pending} onClick={() => void resubmit()}>
              {RESUBMIT_LABEL}
            </Button>
          </span>
        </div>
      </div>
      <div className={barStyles.spacer} aria-hidden="true" />
    </>
  );
}
