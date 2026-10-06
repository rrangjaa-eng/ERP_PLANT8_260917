"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { CANCEL_REASON_REQUIRED, DIFF_REASON_REQUIRED, scheduleDirtyBar, type ExpenseActionBar } from "@/domain/payments/action-row";
import { Button } from "@/ui/button/Button";
import { ConfirmDialog } from "@/ui/confirm-dialog/ConfirmDialog";
import { DetailScreen } from "@/ui/detail-screen/DetailScreen";
import { StatusTag } from "@/ui/status-tag/StatusTag";
import { isCtrlCombo } from "@/lib/shortcut";
import { formatKrw } from "@/lib/format-number";
import { ConflictLine } from "@/app/(app)/approvals/conflict-line";
// 05 문서 화면 행동 줄과 같은 자리 · 같은 폰 고정 규칙(UI-SPEC S4 「1차 자리는 Phase 5 문서 화면의 행동 자리 그대로」 · UA-605).
import barStyles from "@/app/(app)/leave/[id]/document-actions.module.css";
import dialogStyles from "@/app/(app)/approvals/decision-dialogs.module.css";
import { cancelExpensePaymentAction, completeExpensePaymentAction, saveScheduledPayDateAction } from "./actions";
import { diffReasonNeeded, PaymentFields, PaymentPanelProvider, transferError, transferNumber, usePaymentPanel, type PaymentFieldErrors } from "./payment-section";
import styles from "./expense.module.css";

// 06-03(UI-SPEC S5 · 「지출결의 상태 → 1차」): 결재 통과 문서의 지급 섹션 뼈대 + 행동 줄. 1차는 서버가 정한 `row`(resolveExpenseActionRow)
// 그대로 — 클라이언트는 상태로 고르지 않고 금액 셈도 하지 않는다(O-18). 지급 완료는 확인 모달 없이 1차로 끝나고(되돌리기 = 지급 취소, 06-04),
// 성공하면 응답 뒤 다시 읽은 표로 1차 자리에 결과 글자가 선다(토스트 없음 — §7-6). 행동 뒤 포커스는 결과 글자(r2 F5).
// 06-04: 이체액 · 지급일 · 차이 사유 칸(payment-section.tsx PaymentFields)이 같은 패널 상태를 쓰고 1차 `지급 완료`가 함께 보낸다.
// 06-06이 증빙 금액 칸을 같은 패널 상태(PaymentPanelProvider)에 더한다.

export { PaymentPanelProvider };

export function PaymentSection(props: { paymentMethod: string | null; paymentMethodName: string | null; scheduledPaymentDate: string | null }) {
  return (
    <DetailScreen.Section title="지급">
      <PaymentFields {...props} />
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
  const { view, conflict, setConflict, fields, preview, previewing, refreshPreview, setFieldErrors, schedule, setSchedule, scheduleDirty } = usePaymentPanel();
  const [pending, setPending] = useState(false);
  const submittingRef = useRef(false);
  const justPaidRef = useRef(false);
  const justSavedScheduleRef = useRef(false);
  const resultRef = useRef<HTMLSpanElement>(null);
  const primaryRef = useRef<HTMLSpanElement>(null);

  // 칸 오류가 서면 그 칸으로(입력값은 남는다).
  function showFieldErrors(errors: PaymentFieldErrors) {
    setFieldErrors(errors);
    const id = errors.payDate ? "payment-pay-date" : errors.transferKrw ? "payment-transfer" : errors.diffReason ? "payment-diff-reason" : null;
    if (id) requestAnimationFrame(() => document.getElementById(id)?.focus());
  }

  const { execute } = useAction(completeExpensePaymentAction, {
    onSuccess: () => {
      justPaidRef.current = true;
      router.refresh();
    },
    onError: ({ error }) => {
      const validation = error.validationErrors;
      if (validation) {
        const errors: PaymentFieldErrors = {
          payDate: validation.payDate?._errors?.[0],
          transferKrw: validation.transferKrw?._errors?.[0],
          diffReason: validation.diffReason?._errors?.[0],
        };
        if (errors.payDate || errors.transferKrw || errors.diffReason) return showFieldErrors(errors);
      }
      if (error.serverError === DIFF_REASON_REQUIRED) return showFieldErrors({ diffReason: DIFF_REASON_REQUIRED });
      setConflict(error.serverError ?? "결과를 받지 못함 · 새로 고침");
      // 거부 뒤(지급 총액 바뀜 · 동시성) 문서를 다시 읽고 지급 총액 미리보기도 다시 받는다 — 다음 1차가 새 값 · 새 version을 보낸다.
      // 안 고친 이체액 칸은 새 지급 총액을 따르고, 고친 칸은 그대로 두고 차이 힌트만 새 값으로 선다(06-03 검토 P2-1).
      router.refresh();
      refreshPreview();
    },
    onSettled: () => {
      submittingRef.current = false;
      setPending(false);
    },
  });

  // 예정일 저장(P1) — 예정일만 보낸다. 이체액 · 지급일 · 차이 사유 칸 입력값은 그대로 남아 다음 1차가 가져간다.
  const { execute: executeSchedule } = useAction(saveScheduledPayDateAction, {
    onSuccess: () => {
      justSavedScheduleRef.current = true;
      setSchedule(null);
      router.refresh();
    },
    onError: ({ error }) => {
      const dateError = error.validationErrors?.scheduledPayDate?._errors?.[0];
      if (dateError && schedule) {
        setSchedule({ ...schedule, error: dateError });
        requestAnimationFrame(() => document.getElementById("payment-scheduled-date")?.focus());
        return;
      }
      setConflict(error.serverError ?? "결과를 받지 못함 · 새로 고침");
      router.refresh();
    },
    onSettled: () => {
      submittingRef.current = false;
      setPending(false);
    },
  });

  // 1차는 서버가 정한 행(resolveExpenseActionRow) — 예정일 칸이 dirty인 동안만 같은 순수 함수로 P1(`예정일 저장`)로 바꾼다.
  const serverBar: ExpenseActionBar | null = view.row
    ? { ...view.row, blockReason: view.row.blockReason ?? null, secondary: view.row.secondary ?? null, tertiary: view.row.tertiary ?? null }
    : null;
  const bar = serverBar && scheduleDirty ? scheduleDirtyBar(serverBar) : serverBar;
  const ready = view.expenseId !== undefined && view.version !== undefined;
  const canPay = bar?.primary === "pay" && ready;
  const canSaveSchedule = bar?.primary === "saveSchedule" && ready;
  // P3 증빙 없음 · 짝 아님 · 지급 총액 볼 권한 없음 — `지급 완료` 비활성 + 이유(block).
  const blockReason = bar?.blockReason ?? null;
  const paid = view.row?.row === "P6" && view.payDate !== undefined;
  // 2차 `지급 취소`(D-606) — 지급 뒤 지급 권한자에게만(서버 행의 secondary).
  const canCancel = paid && bar?.secondary === "cancel" && ready;
  const [cancelOpen, setCancelOpen] = useState(false);
  const justCancelledRef = useRef(false);

  function saveSchedule() {
    if (!canSaveSchedule || !schedule || submittingRef.current || view.expenseId === undefined || view.version === undefined) return;
    submittingRef.current = true;
    setPending(true);
    setConflict(null);
    executeSchedule({ expenseId: view.expenseId, scheduledPayDate: schedule.value, version: view.version });
  }

  function pay() {
    if (!canPay || blockReason !== null || submittingRef.current || previewing || view.expenseId === undefined || view.version === undefined) return;
    const expectedPayableKrw = preview.payableKrw ?? view.payableKrw ?? null;
    if (expectedPayableKrw === null) return;
    const transferProblem = transferError(fields);
    const transferKrw = transferNumber(fields.transferRaw);
    const needReason = diffReasonNeeded(fields, preview);
    if (transferProblem || transferKrw === null) return showFieldErrors({ transferKrw: transferProblem ?? undefined });
    if (needReason && fields.diffReason.trim() === "") return showFieldErrors({ diffReason: DIFF_REASON_REQUIRED });
    submittingRef.current = true;
    setPending(true);
    setConflict(null);
    setFieldErrors({});
    execute({
      expenseId: view.expenseId,
      payDate: fields.payDate,
      expectedPayableKrw,
      version: view.version,
      transferKrw,
      ...(needReason ? { diffReason: fields.diffReason } : {}),
    });
  }

  // Ctrl+Enter = 그때 보이는 1차(§7-9 — dirty면 `예정일 저장`). 렌더마다 다시 건다(지금 렌더의 함수를 쓴다).
  useEffect(() => {
    if (!canPay && !canSaveSchedule) return;
    function onKeyDown(event: KeyboardEvent) {
      if (!isCtrlCombo(event, "Enter")) return;
      event.preventDefault();
      if (canSaveSchedule) saveSchedule();
      else pay();
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

  // 예정일 저장 · 지급 취소 뒤 응답으로 다시 읽은 표에 1차가 서면 그 1차로 포커스(r2 F5).
  useEffect(() => {
    if ((justSavedScheduleRef.current || justCancelledRef.current) && canPay) {
      justSavedScheduleRef.current = false;
      justCancelledRef.current = false;
      primaryRef.current?.querySelector("button")?.focus();
    }
  }, [canPay]);

  // 지급 뒤(P6)는 1차 없이 결과 글자만(버튼 아님). 지급 권한이 없는 사람에게는 이 페이즈의 버튼이 없다(D-601 — 지급 전 담당 표기는 섹션 지급 예정일 2행).
  const showResult = paid && view.paidTime !== undefined;
  if (!canPay && !canSaveSchedule && !showResult) return null;
  return (
    <>
      <div className={barStyles.bar} data-fixed-bar="">
        {conflict ? <ConflictLine message={conflict} /> : null}
        <div className={barStyles.buttons}>
          {canSaveSchedule ? (
            <span className={barStyles.primaryWrap} ref={primaryRef}>
              <Button variant="primary" shortcut="Ctrl+Enter" pending={pending} onClick={saveSchedule}>
                예정일 저장
              </Button>
            </span>
          ) : canPay ? (
            <span className={barStyles.primaryWrap} ref={primaryRef}>
              <Button
                variant="primary"
                shortcut="Ctrl+Enter"
                pending={blockReason === null && (pending || previewing)}
                disabled={blockReason !== null}
                disabledReason={blockReason ?? undefined}
                onClick={pay}
              >
                지급 완료
              </Button>
            </span>
          ) : (
            <>
              <StatusTag status="지급 완료" />
              <span ref={resultRef} tabIndex={-1} role="status" data-testid="payment-result">
                지급 완료 → {view.payDate} · {view.paidTime}
              </span>
              {canCancel ? (
                <span className={barStyles.secondaryWrap}>
                  <Button variant="secondary" onClick={() => setCancelOpen(true)}>
                    지급 취소
                  </Button>
                </span>
              ) : null}
            </>
          )}
        </div>
      </div>
      <div className={barStyles.spacer} aria-hidden="true" />
      {canCancel && view.expenseId !== undefined && view.version !== undefined ? (
        <CancelPaymentDialog
          open={cancelOpen}
          onClose={() => setCancelOpen(false)}
          expenseId={view.expenseId}
          version={view.version}
          subtitle={[view.number ?? null, `${view.payDate} 지급`, view.transferKrw === undefined || view.transferKrw === null ? null : formatKrw(view.transferKrw)]
            .filter((part): part is string => part !== null)
            .join(" · ")}
          onCancelled={() => {
            justCancelledRef.current = true;
            setCancelOpen(false);
            setConflict(null);
            router.refresh();
          }}
        />
      ) : null}
    </>
  );
}

const CANCEL_FAILED = "결과를 받지 못함 · 새로 고침";

// 지급 취소 확인 모달(UI-SPEC 「Destructive — 지급 취소(S5)」) — 사유 한 칸 필수. 서버 거부(동시성 · 권한)는 막힘 자리,
// 응답이 없으면 다시 보내면 되는 실패 한 줄 — 창은 닫히지 않고 사유는 남는다. 다음 1차는 응답 뒤 다시 읽은 표가 정한다.
function CancelPaymentDialog({
  open,
  onClose,
  expenseId,
  version,
  subtitle,
  onCancelled,
}: {
  open: boolean;
  onClose: () => void;
  expenseId: string;
  version: number;
  subtitle: string;
  onCancelled: () => void;
}) {
  const fieldId = useId();
  const [reason, setReason] = useState("");
  const [serverError, setServerError] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | undefined>(undefined);
  const [pending, setPending] = useState(false);
  const submittingRef = useRef(false);

  function close() {
    setReason("");
    setServerError(null);
    setFailure(undefined);
    onClose();
  }

  const trimmed = reason.trim();
  const blocked = serverError ?? (trimmed === "" ? CANCEL_REASON_REQUIRED : undefined);

  async function confirm() {
    if (submittingRef.current || blocked) return;
    submittingRef.current = true;
    setPending(true);
    setFailure(undefined);
    let response: Awaited<ReturnType<typeof cancelExpensePaymentAction>> | undefined;
    try {
      response = await cancelExpensePaymentAction({ expenseId, reason: trimmed, version });
    } catch {
      response = undefined;
    }
    submittingRef.current = false;
    setPending(false);
    if (response?.data) {
      setReason("");
      onCancelled();
      return;
    }
    const message = response?.serverError ?? response?.validationErrors?.reason?._errors?.[0];
    if (message) setServerError(message);
    else setFailure(CANCEL_FAILED);
  }

  return (
    <ConfirmDialog
      open={open}
      onClose={close}
      title="지급 취소"
      subtitle={subtitle}
      resultLines={["지급 전으로 돌아감 · 견적 줄 잠금 풀림"]}
      evidenceField={
        <div className={dialogStyles.reason}>
          <label htmlFor={fieldId}>사유</label>
          <textarea
            id={fieldId}
            rows={2}
            maxLength={480}
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
        label: "지급 취소",
        shortcut: "Ctrl+Enter",
        pending,
        onConfirm: () => void confirm(),
        disabledReason: blocked,
        failure,
      }}
    />
  );
}
