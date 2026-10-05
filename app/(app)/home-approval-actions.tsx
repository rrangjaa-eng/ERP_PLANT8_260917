"use client";

import { createContext, useContext, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { Button } from "@/ui/button/Button";
import { ListEmpty } from "@/ui/list-empty/ListEmpty";
import { Toast } from "@/ui/toast/Toast";
import nextTurnStyles from "@/ui/next-turn/NextTurn.module.css";
import { approveAction } from "@/app/(app)/approvals/actions";
import { approveToast } from "@/app/(app)/approvals/approve-toast";
import { APPROVE_FAILED_MESSAGE, ApprovalSheet, type ApprovalSheetItem, type ApproveOutcome } from "@/app/(app)/approvals/approval-sheet";
import { ConflictLine } from "@/app/(app)/approvals/conflict-line";
import { evidenceViewUrl } from "@/app/(app)/approvals/evidence-url";
import { rowApprovalActions } from "@/app/(app)/approvals/row-actions";
import { useRefreshThenFocus } from "@/app/(app)/approvals/refresh-then-focus";
import { RejectDialog, WithdrawDialog, type DecisionTarget, type RejectMessages } from "@/app/(app)/approvals/decision-dialogs";
import styles from "./home-approval-actions.module.css";

// 05-10 S11 — 첫 화면 「내 차례」 [결재] 행 행동. 서버(page.tsx)가 행마다 이 노드를 `NextTurn actionSlots`로 넘긴다(`ui/`는 `app/` 액션을 import하지 않는다).
// PC = 3차 `승인`(확인 없이 즉시) · `반려`(04.1 S6 반려 확인), 폰 = 행 전체가 결재함과 같은 결재 시트를 여는 버튼(Z3 A — 시트는 옮기지 않았다).
// 처리한 행은 새로 고침으로 사라지므로 토스트는 행 바깥(공급자)에 둔다.

type HomeApprovalsContextValue = {
  showToast: (message: string) => void;
  // 05-16 새로 고침이 끝난 뒤 포커스를 옮긴다 — 처리한 줄이 사라지면 그 DOM이 다음 줄에 재사용돼 포커스가 다음 줄의 `승인`에 남기 때문(Enter 한 번 더 = 다음 문서 승인).
  refreshThenFocus: (resolveTarget: () => HTMLElement | null) => void;
};

const HomeApprovalsContext = createContext<HomeApprovalsContextValue>({ showToast: () => undefined, refreshThenFocus: () => undefined });

export function HomeApprovalsProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<string | null>(null);
  const refreshThenFocus = useRefreshThenFocus();
  return (
    <HomeApprovalsContext.Provider value={{ showToast: setMessage, refreshThenFocus }}>
      {children}
      {message ? <Toast message={message} onDismiss={() => setMessage(null)} /> : null}
    </HomeApprovalsContext.Provider>
  );
}

// 다음 줄(li)의 포커스 대상 — 폰은 줄 전체를 덮는 `열기`, PC는 대상 글자(NextTurn이 승인 행동이 있는 줄의 대상 글자에 tabIndex -1을 준다).
function nextRowTarget(labelId: string | null): HTMLElement | null {
  const label = labelId ? document.getElementById(labelId) : null;
  if (!label) return null;
  const open = label.closest("li")?.querySelector<HTMLElement>("[data-home-open]");
  return open && open.getClientRects().length > 0 ? open : label;
}

// 시트 `승인` — 서버 액션 호출 · 토스트 문구 · 서버 거부 → 충돌 문구 변환(결재함 `approveFromSheet`와 같다).
async function approveFromSheet(target: { instanceId: string; version: number }): Promise<ApproveOutcome> {
  try {
    const result = await approveAction({ instanceId: target.instanceId, expectedVersion: target.version });
    if (result?.data) return { message: approveToast(result.data) };
    return { conflict: result?.serverError ?? APPROVE_FAILED_MESSAGE };
  } catch {
    return { conflict: APPROVE_FAILED_MESSAGE };
  }
}

export type HomeApprovalRowProps = {
  // 행 대상 글자 요소 id — 승인 · 반려의 aria-describedby.
  labelId: string;
  instanceId: string;
  version: number;
  // 서버 가능 행동(구조 값).
  actions: ApprovalSheetItem["actions"];
  // 결재 시트 · 반려 확인 재료 — 결재 정보가 꺼진 계급은 상세가 없어 null(그 행은 서버가 기본 링크로 그린다).
  sheet: ApprovalSheetItem;
  decision: DecisionTarget | null;
  rejectMessages: RejectMessages;
};

export function HomeApprovalRow({ labelId, instanceId, version, actions, sheet, decision, rejectMessages }: HomeApprovalRowProps) {
  const { showToast, refreshThenFocus } = useContext(HomeApprovalsContext);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<DecisionTarget | null>(null);
  const [withdrawTarget, setWithdrawTarget] = useState<DecisionTarget | null>(null);
  const [pending, setPending] = useState(false);
  const [conflict, setConflict] = useState<string | null>(null);
  const submittingRef = useRef(false);
  const actionsRef = useRef<HTMLSpanElement>(null);
  // 누른 시점의 다음 줄 대상 글자 id — 새로 고침 뒤에는 이 줄이 사라져 DOM으로 다시 찾을 수 없다.
  const nextLabelIdRef = useRef<string | null>(null);
  const { execute } = useAction(approveAction, {
    onSuccess: ({ data }) => {
      if (!data) return;
      showToast(approveToast(data));
      refreshThenFocus(() => nextRowTarget(nextLabelIdRef.current));
    },
    onError: ({ error }) => {
      if (error.serverError) setConflict(error.serverError);
    },
    onSettled: () => {
      submittingRef.current = false;
      setPending(false);
    },
  });

  const cell = rowApprovalActions({ approveBlockedReason: sheet.approveBlockedReason, canReject: actions.includes("reject") && decision !== null });

  return (
    <>
      <span ref={actionsRef} className={styles.pcActions}>
        {actions.includes("approve") && cell.showApprove ? (
          <Button
            variant="tertiary"
            pending={pending}
            aria-describedby={labelId}
            onClick={() => {
              if (submittingRef.current) return;
              submittingRef.current = true;
              nextLabelIdRef.current = actionsRef.current?.closest("li")?.nextElementSibling?.querySelector('[id^="next-turn-label-"]')?.id ?? null;
              setPending(true);
              setConflict(null);
              execute({ instanceId, expectedVersion: version });
            }}
          >
            승인
          </Button>
        ) : null}
        {actions.includes("approve") && cell.reasonText ? <span className={styles.blockedReason}>{cell.reasonText}</span> : null}
        {cell.showReject && decision ? (
          <Button variant="tertiary" disabled={pending} aria-describedby={labelId} onClick={() => setRejectTarget(decision)}>
            반려
          </Button>
        ) : null}
        {conflict ? <ConflictLine message={conflict} /> : null}
      </span>
      <button type="button" data-home-open="" className={[nextTurnStyles.tertiary, styles.phoneTap].join(" ")} aria-haspopup="dialog" aria-describedby={labelId} onClick={() => setSheetOpen(true)}>
        열기
      </button>
      <ApprovalSheet
        item={sheetOpen ? sheet : null}
        onClose={() => setSheetOpen(false)}
        onApprove={approveFromSheet}
        onApproved={(message) => {
          // 시트는 새로 고침을 하지 않는다(05-11 웨이브 13 D3) — 행 `승인`과 같이 새로 고침 뒤 다음 줄로 포커스를 옮긴다.
          showToast(message);
          const nextLabelId = actionsRef.current?.closest("li")?.nextElementSibling?.querySelector('[id^="next-turn-label-"]')?.id ?? null;
          refreshThenFocus(() => nextRowTarget(nextLabelId));
        }}
        evidenceUrl={evidenceViewUrl}
        onSecondary={(action) => {
          if (!decision) return;
          if (action === "reject") setRejectTarget(decision);
          else setWithdrawTarget(decision);
        }}
      />
      <WithdrawDialog target={withdrawTarget} onClose={() => setWithdrawTarget(null)} onDone={showToast} />
      <RejectDialog target={rejectTarget} messages={rejectMessages} onClose={() => setRejectTarget(null)} onDone={showToast} />
    </>
  );
}

// 05-10 §7-7 ERROR — 공급 함수가 실패했을 때 블록 자리 한 줄. `다시 시도`는 이동이 아니라 새로 읽기라 onClick 갈래(클라이언트 함수라 이 파일에 둔다).
export function HomeNextTurnError() {
  const router = useRouter();
  return <ListEmpty tone="error" message="불러오기 실패" action={{ label: "다시 시도", onClick: () => router.refresh() }} />;
}
