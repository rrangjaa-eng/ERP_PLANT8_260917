"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import type { PaymentViewDto } from "@/domain/payments";
import { Button } from "@/ui/button/Button";
import { DetailScreen } from "@/ui/detail-screen/DetailScreen";
import { KvList, type KvItem } from "@/ui/kv-list/KvList";
import { Num } from "@/ui/num/Num";
import { StatusTag } from "@/ui/status-tag/StatusTag";
import { isCtrlCombo } from "@/lib/shortcut";
import { ConflictLine } from "@/app/(app)/approvals/conflict-line";
// 05 문서 화면 행동 줄과 같은 자리 · 같은 폰 고정 규칙(UI-SPEC S4 「1차 자리는 Phase 5 문서 화면의 행동 자리 그대로」 · UA-605).
import barStyles from "@/app/(app)/leave/[id]/document-actions.module.css";
import { completeExpensePaymentAction } from "./actions";
import styles from "./expense.module.css";

// 06-03(UI-SPEC S5 · 「지출결의 상태 → 1차」): 결재 통과 문서의 지급 섹션 뼈대 + 행동 줄. 1차는 서버가 정한 `row`(resolveExpenseActionRow)
// 그대로 — 클라이언트는 상태로 고르지 않고 금액 셈도 하지 않는다(O-18). 지급 완료는 확인 모달 없이 1차로 끝나고(되돌리기 = 지급 취소, 06-04),
// 성공하면 응답 뒤 다시 읽은 표로 1차 자리에 결과 글자가 선다(토스트 없음 — §7-6). 행동 뒤 포커스는 결과 글자(r2 F5).
// 06-04가 이체액 · 지급일 · 차이 사유 칸, 06-06이 증빙 금액 칸을 같은 패널 상태(PaymentPanelProvider)에 더한다.

type PaymentView = Partial<PaymentViewDto>;

type PanelState = {
  view: PaymentView;
  conflict: string | null;
  setConflict: (message: string | null) => void;
};

const PanelContext = createContext<PanelState | null>(null);

function usePanel(): PanelState {
  const state = useContext(PanelContext);
  if (!state) throw new Error("PaymentPanelProvider 밖");
  return state;
}

export function PaymentPanelProvider({ view, children }: { view: PaymentView; children: ReactNode }) {
  const [conflict, setConflict] = useState<string | null>(null);
  return <PanelContext.Provider value={{ view, conflict, setConflict }}>{children}</PanelContext.Provider>;
}

// 이체액 라벨은 지급 방식 이름(UI-SPEC S5 · 용어 줄).
const TRANSFER_LABELS: Record<string, string> = {
  corp_card: "카드 결제액",
  cash: "현금 지급액",
};

export function PaymentSection({
  paymentMethod,
  paymentMethodName,
  scheduledPaymentDate,
}: {
  paymentMethod: string | null;
  paymentMethodName: string | null;
  scheduledPaymentDate: string | null;
}) {
  const { view } = usePanel();
  const dash = <span className={styles.muted}>—</span>;
  const paid = view.row?.row === "P6";
  const items: KvItem[] = [
    {
      label: "지급 예정일",
      value: (
        <>
          {scheduledPaymentDate ?? dash}
          {view.row?.ownerNote ? <span className={`${styles.subLine} ${styles.muted}`}>{view.row.ownerNote}</span> : null}
        </>
      ),
    },
    { label: "지급 방식", value: paymentMethodName ?? dash },
  ];
  if (paid) {
    items.push({ label: "지급일", value: view.payDate ?? dash });
    if (view.transferKrw !== undefined) {
      items.push({
        label: (paymentMethod && TRANSFER_LABELS[paymentMethod]) ?? "이체액",
        value: (
          <>
            <Num value={view.transferKrw} />
            <span className={styles.taxLine} data-testid="payment-paid-line">
              지급 총액 <Num value={view.payableKrw ?? null} />
              {view.diffKrw ? (
                <>
                  {" · 차이 "}
                  <Num value={view.diffKrw} />
                </>
              ) : null}
              {view.grossSupplyKrw !== null && view.grossSupplyKrw !== undefined ? (
                <>
                  {" · 공급가 역산 "}
                  <Num value={view.grossSupplyKrw} />
                </>
              ) : null}
            </span>
          </>
        ),
      });
    }
  }
  return (
    <DetailScreen.Section title="지급">
      <KvList items={items} />
    </DetailScreen.Section>
  );
}

// C13 · §7-7 ERROR — 결재 통과 문서인데 지급 정보를 못 읽음: 섹션 자리에 한 줄 + 2차 `다시 시도`.
export function PaymentLoadError() {
  const router = useRouter();
  return (
    <DetailScreen.Section title="지급">
      <p className={styles.blockedReason} role="alert">
        지급 정보 불러오지 못함 ·{" "}
        <Button variant="secondary" onClick={() => router.refresh()}>
          다시 시도
        </Button>
      </p>
    </DetailScreen.Section>
  );
}

export function PaymentActionRow() {
  const router = useRouter();
  const { view, conflict, setConflict } = usePanel();
  const [pending, setPending] = useState(false);
  const submittingRef = useRef(false);
  const justPaidRef = useRef(false);
  const resultRef = useRef<HTMLSpanElement>(null);

  const { execute } = useAction(completeExpensePaymentAction, {
    onSuccess: () => {
      justPaidRef.current = true;
      router.refresh();
    },
    onError: ({ error }) => setConflict(error.serverError ?? "결과를 받지 못함 · 새로 고침"),
    onSettled: () => {
      submittingRef.current = false;
      setPending(false);
    },
  });

  const canPay = view.row?.primary === "pay" && view.expenseId !== undefined && view.version !== undefined;
  const paid = view.row?.row === "P6" && view.payDate !== undefined;

  function pay() {
    if (!canPay || submittingRef.current || view.expenseId === undefined || view.version === undefined) return;
    submittingRef.current = true;
    setPending(true);
    setConflict(null);
    execute({
      expenseId: view.expenseId,
      payDate: view.payDate,
      expectedPayableKrw: view.payableKrw ?? 0,
      version: view.version,
    });
  }

  // 1차 `지급 완료` = Ctrl+Enter(§7-9). 렌더마다 다시 건다(지금 렌더의 pay를 쓴다).
  useEffect(() => {
    if (!canPay) return;
    function onKeyDown(event: KeyboardEvent) {
      if (!isCtrlCombo(event, "Enter")) return;
      event.preventDefault();
      pay();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  });

  // 지급 완료 뒤 다시 읽은 표가 P6이면 1차 자리의 결과 글자로 포커스(누른 버튼이 사라져 body로 빠지지 않게 — r2 F5).
  useEffect(() => {
    if (paid && justPaidRef.current) {
      justPaidRef.current = false;
      resultRef.current?.focus();
    }
  }, [paid]);

  // 지급 뒤(P6)는 1차 없이 결과 글자만(버튼 아님). 지급 권한이 없는 사람에게는 이 페이즈의 버튼이 없다(D-601 — 지급 전 담당 표기는 섹션 지급 예정일 2행).
  const showResult = paid && view.paidTime !== undefined;
  if (!canPay && !showResult) return null;
  return (
    <>
      <div className={barStyles.bar} data-fixed-bar="">
        {conflict ? <ConflictLine message={conflict} /> : null}
        <div className={barStyles.buttons}>
          {canPay ? (
            <span className={barStyles.primaryWrap}>
              <Button variant="primary" shortcut="Ctrl+Enter" pending={pending} onClick={pay}>
                지급 완료
              </Button>
            </span>
          ) : (
            <>
              <StatusTag status="지급 완료" />
              <span ref={resultRef} tabIndex={-1} role="status" data-testid="payment-result">
                지급 완료 → {view.payDate} · {view.paidTime}
              </span>
            </>
          )}
        </div>
      </div>
      <div className={barStyles.spacer} aria-hidden="true" />
    </>
  );
}
