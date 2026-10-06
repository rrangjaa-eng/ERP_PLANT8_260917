"use client";

import { useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, buttonLinkClassName } from "@/ui/button/Button";
import { Toast } from "@/ui/toast/Toast";
import { submitSettlementAction, withdrawSettlementAction } from "../actions";
import { unsavedEditsReason } from "./unsaved-edits";
import styles from "./project-detail.module.css";

// 05-11(UI-SPEC S10 (가) · 확정 #4): 정산 프로젝트 머리 줄의 「상태 바꾸기」 자리. 문서가 없고 담당 PM이면 2차 `정산 결재 올리기` —
// 확인 창 없이 즉시 기안하고 토스트 3차 `되돌리기`(= 확인 없는 회수). 문서가 있으면 3차 링크 `정산 결재 {중|반려|회수|승인}` → 문서 화면.
// 미저장 편집이 있으면 비활성 + DR-6 글자(같은 함수). 실패는 버튼 옆 한 줄(버튼은 살아 있다).

export type SettlementHeaderProps = {
  projectId: string;
  /** 문서가 있으면 그 결재 상태 낱말(`중` · `반려` · `회수` · `승인`), 없으면 null. */
  statusWord: string | null;
  /** 문서가 없을 때 올릴 수 있는 사람(담당 PM의 쓰기 권리 · 정산 — 서버 판정). */
  canSubmit: boolean;
};

const SUBMIT_LABEL = "정산 결재 올리기";

type Shown = { message: string; tone: "default" | "error"; actionLabel?: string; does?: "undo" | "reload" };

type SubmittedData = { round: number; nextHolderNames: string | null };

// 올리기 · 다시 올리기 성공 토스트 + 3차 `되돌리기`(= 확인 없는 회수, 올린 차수만) — 늦으면 서버 거부 원문을 오류 토스트 + `새로 고침`으로 나눈다.
// 사용자 확정(10/5 16:14): 문서 화면 `정산 결재 다시 올리기`도 머리 줄 첫 올리기와 같은 토스트다.
export function useSettlementSubmitToast(projectId: string): { showSubmitted: (label: string, data: SubmittedData) => void; toastNode: ReactNode } {
  const router = useRouter();
  const undoingRef = useRef(false);
  const [toast, setToast] = useState<Shown | null>(null);
  // 올린 차수 — 토스트 `되돌리기`가 이 차수만 회수한다(늦으면 서버가 거부).
  const roundRef = useRef<number | null>(null);

  function showSubmitted(label: string, data: SubmittedData) {
    roundRef.current = data.round;
    const names = data.nextHolderNames;
    setToast({ message: names ? `${label} · 결재 요청됨 → ${names}` : `${label} · 결재 요청됨`, tone: "default", actionLabel: "되돌리기", does: "undo" });
  }

  async function undo() {
    const round = roundRef.current;
    if (undoingRef.current || round === null) return;
    undoingRef.current = true;
    let result: Awaited<ReturnType<typeof withdrawSettlementAction>> | undefined;
    try {
      result = await withdrawSettlementAction({ projectId, undo: true, round });
    } catch {
      result = undefined;
    }
    undoingRef.current = false;
    if (result?.data) {
      setToast({ message: "되돌리기 · 결재 멈춤", tone: "default" });
      router.refresh();
      return;
    }
    const text = result?.serverError;
    const cut = text ? text.lastIndexOf(" · ") : -1;
    if (!text || cut < 0) {
      setToast({ message: "되돌리기 실패", tone: "error", actionLabel: "되돌리기", does: "undo" });
      return;
    }
    setToast({ message: text.slice(0, cut), tone: "error", actionLabel: text.slice(cut + 3), does: "reload" });
  }

  function reload() {
    setToast(null);
    router.refresh();
  }

  const toastNode = toast ? (
    <Toast
      message={toast.message}
      tone={toast.tone}
      actionLabel={toast.actionLabel}
      onAction={toast.does === "undo" ? () => void undo() : toast.does === "reload" ? reload : undefined}
      onDismiss={() => setToast(null)}
    />
  ) : null;
  return { showSubmitted, toastNode };
}

export function SettlementButton({ projectId, statusWord, canSubmit, dirtyCount }: SettlementHeaderProps & { dirtyCount: number }) {
  const router = useRouter();
  const busyRef = useRef(false);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const { showSubmitted, toastNode } = useSettlementSubmitToast(projectId);

  async function submit() {
    if (busyRef.current) return;
    busyRef.current = true;
    setPending(true);
    setFailure(null);
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
      setFailure(result?.serverError ?? `${SUBMIT_LABEL} 실패 · 다시 시도`);
      return;
    }
    if (data.kind === "submitted") showSubmitted(SUBMIT_LABEL, data);
    router.refresh();
  }

  const blocked = unsavedEditsReason(dirtyCount);

  if (statusWord !== null) {
    return (
      <>
        <Link href={`/projects/${projectId}/settlement`} className={`${buttonLinkClassName("tertiary")} ${styles.headerTouchButton}`}>
          {`정산 결재 ${statusWord}`}
        </Link>
        {toastNode}
      </>
    );
  }
  if (!canSubmit) return toastNode;
  return (
    <>
      <span className={styles.settlementAction}>
        {failure && !blocked ? <span className={styles.doorFailure}>{failure}</span> : null}
        <Button
          type="button"
          variant="secondary"
          className={styles.headerTouchButton}
          pending={pending}
          disabled={blocked !== null}
          disabledReason={blocked ?? undefined}
          onClick={() => void submit()}
        >
          {SUBMIT_LABEL}
        </Button>
      </span>
      {toastNode}
    </>
  );
}
