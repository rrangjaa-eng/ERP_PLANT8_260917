"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import type { ReactNode } from "react";
import type { PaymentViewDto } from "@/domain/payments";
import {
  CANCEL_REASON_REQUIRED,
  CONFIRM_SUPPLY_CORRECTED,
  CONFIRM_SUPPLY_SAME,
  CORRECTED_SUPPLY_EMPTY,
  DIFF_REASON_REQUIRED,
  NOT_BUSINESS_DAY,
  scheduleDirtyBar,
  type ExpenseActionBar,
} from "@/domain/payments/action-row";
import { Button, buttonLinkClassName } from "@/ui/button/Button";
import { ConfirmDialog } from "@/ui/confirm-dialog/ConfirmDialog";
import { DetailScreen } from "@/ui/detail-screen/DetailScreen";
import { StatusTag } from "@/ui/status-tag/StatusTag";
import { isCtrlCombo } from "@/lib/shortcut";
import { formatKrw } from "@/lib/format-number";
import { ConflictLine } from "@/app/(app)/approvals/conflict-line";
// 05 문서 화면 행동 줄과 같은 자리 · 같은 폰 고정 규칙(UI-SPEC S4 「1차 자리는 Phase 5 문서 화면의 행동 자리 그대로」 · UA-605).
import barStyles from "@/app/(app)/leave/[id]/document-actions.module.css";
import dialogStyles from "@/app/(app)/approvals/decision-dialogs.module.css";
import { cancelExpensePaymentAction, completeExpensePaymentAction, confirmEvidenceAction, saveScheduledPayDateAction } from "./actions";
import {
  diffReasonNeeded,
  PaymentFields,
  PaymentPanelProvider as PaymentFieldsProvider,
  transferError,
  transferNumber,
  usePaymentPanel,
  type PaymentFieldErrors,
  type PaymentScheduleValueProps,
} from "./payment-section";
import { CORRECTED_SUPPLY_ID, correctedSupplyInput, EvidenceEditProvider, useEvidenceEdit, type DocSupply } from "./evidence-review-section";
import styles from "./expense.module.css";
import listStyles from "../expenses.module.css";

// 06-03(UI-SPEC S5 · 「지출결의 상태 → 1차」): 결재 통과 문서의 지급 섹션 뼈대 + 행동 줄. 1차는 서버가 정한 `row`(resolveExpenseActionRow)
// 그대로 — 클라이언트는 상태로 고르지 않고 금액 셈도 하지 않는다(O-18). 지급 완료는 확인 모달 없이 1차로 끝나고(되돌리기 = 지급 취소, 06-04),
// 성공하면 응답 뒤 다시 읽은 표로 1차 자리에 결과 글자가 선다(토스트 없음 — §7-6). 행동 뒤 포커스는 결과 글자(r2 F5).
// 06-04: 이체액 · 지급일 · 차이 사유 칸(payment-section.tsx PaymentFields)이 같은 패널 상태를 쓰고 1차 `지급 완료`가 함께 보낸다.
// 06-06이 증빙 칸을 같은 패널 상태(PaymentPanelProvider)에 더한다. P2 · P5의 1차 확인(confirmEvidenceAction — 06.5 D-6520 글자 `공급가액과 같음` /
// 고침 칸 값이 다를 때 `공급가액 고쳐 확인`)도 이 줄이 세우고,
// 응답 뒤 다시 읽은 행이 다음 1차를 정한다(P2 → P4 `지급 완료` · P5 → P6). 토스트 없음.

// 패널 상태 = 지급 칸(payment-section) + 공급가액 고침 칸(evidence-review-section — 문서 공급가 supply). 문서 화면은 이 하나로 증빙 · 지급 섹션과 행동 줄을 감싼다.
export function PaymentPanelProvider({ view, supply, children }: { view: Partial<PaymentViewDto>; supply: DocSupply | null; children: ReactNode }) {
  return (
    <PaymentFieldsProvider view={view}>
      <EvidenceEditProvider supply={supply}>{children}</EvidenceEditProvider>
    </PaymentFieldsProvider>
  );
}

export function PaymentSection(props: {
  paymentMethod: string | null;
  paymentMethodName: string | null;
  scheduledPaymentDate: string | null;
  scheduleValueProps: PaymentScheduleValueProps;
  requested: { date: string | null; reason: string | null };
}) {
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
  const { view, conflict, setConflict, fields, preview, previewing, refreshPreview, fieldErrors, setFieldErrors, schedule, setSchedule, scheduleDirty } = usePaymentPanel();
  const { edit: evidenceEdit, setEdit: setEvidenceEdit, supply } = useEvidenceEdit();
  const evidenceInput = correctedSupplyInput(view, evidenceEdit, supply);
  const [pending, setPending] = useState(false);
  const submittingRef = useRef(false);
  const justPaidRef = useRef(false);
  const justSavedScheduleRef = useRef(false);
  const justConfirmedRef = useRef(false);
  const correctedSentRef = useRef(false);
  // 고친 공급가 확인 뒤 이체액 칸 포커스 — 새 미리보기가 시작(start → waiting)하고 끝난 뒤에 준다(D-1).
  const focusTransferAfterPreviewRef = useRef<"start" | "waiting" | null>(null);
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
      // 기준일이 지급 예정일이면 저장한 날짜로 지급 총액이 바뀐다 — 미리보기를 다시 받아 다음 1차가 새 값을 보낸다(06-04 검토 P3-2).
      refreshPreview();
    },
    onError: ({ error }) => {
      // 07-16(SC-03): 휴일 · 주말 서버 거부도 칸 아래(서버 사유 그대로 — 화면 검증과 같은 문구).
      const dateError = error.validationErrors?.scheduledPayDate?._errors?.[0] ?? (error.serverError === NOT_BUSINESS_DAY ? NOT_BUSINESS_DAY : undefined);
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

  // 증빙 확인(P2 · P5) — 응답 뒤 문서를 다시 읽는다. 다음 1차 · 포커스는 다시 읽은 행이 정한다(아래 effect).
  // 칸 오류(0 · 형식 · 남은 실행가 상한 — 액션이 오류 종류로 `correctedSupplyAmount` 칸 오류로 옮긴다, L-3)는 고침 칸에 세우고 칸 값은 남긴다 —
  // `새로 고침` · 다시 읽기 없음. 그 밖(동시성 · 지급 뒤 LOCKED · 응답 없음)은 행동 줄 이유 자리 + 다시 읽기.
  function showEvidenceError(message: string) {
    setEvidenceEdit({ raw: evidenceInput.raw, inputError: null, error: message });
    requestAnimationFrame(() => document.getElementById(CORRECTED_SUPPLY_ID)?.focus());
  }

  const { execute: executeConfirm } = useAction(confirmEvidenceAction, {
    onSuccess: () => {
      justConfirmedRef.current = true;
      setEvidenceEdit(null);
      router.refresh();
    },
    onError: ({ error }) => {
      const fieldError = error.validationErrors?.correctedSupplyAmount?._errors?.[0];
      if (fieldError) return showEvidenceError(fieldError);
      setConflict(error.serverError ?? "결과를 받지 못함 · 새로 고침");
      router.refresh();
    },
    onSettled: () => {
      submittingRef.current = false;
      setPending(false);
    },
  });

  // 1차는 서버가 정한 행(resolveExpenseActionRow) — 예정일 칸이 열린 동안은 같은 순수 함수로 P1(`예정일 저장`)로 바꾸고(07-16 U13 · 화면당 1차 하나),
  // 원래 1차(`지급 완료` — 칸은 그 행에만 열린다)는 2차 꼴로 내린다. 칸을 닫으면(저장 · 취소 · Esc) 원래 1차로 돌아온다.
  const serverBar: ExpenseActionBar | null = view.row
    ? { ...view.row, blockReason: view.row.blockReason ?? null, secondary: view.row.secondary ?? null, tertiary: view.row.tertiary ?? null }
    : null;
  const bar = serverBar && schedule !== null ? scheduleDirtyBar(serverBar) : serverBar;
  const lowered = bar !== serverBar ? (serverBar?.primary ?? null) : null;
  const ready = view.expenseId !== undefined && view.version !== undefined;
  const canPay = (bar?.primary === "pay" || lowered === "pay") && ready;
  const canSaveSchedule = bar?.primary === "saveSchedule" && ready;
  const canConfirm = bar?.primary === "confirm" && ready;
  // 열린 고침 칸이 비면 1차는 비활성 + 빈 칸 이유(칸 오류로 되풀이하지 않는다 — 이유는 버튼 옆 한 자리만).
  const confirmBlock = canConfirm && evidenceInput.open && evidenceInput.raw === "" && !evidenceInput.fieldError ? CORRECTED_SUPPLY_EMPTY : null;
  // 버튼 = 실제 동작(SYSTEM §8) — 고침 칸 값이 지금 공급가와 다를 때만 `공급가액 고쳐 확인`.
  const confirmLabel = evidenceInput.corrected === undefined ? CONFIRM_SUPPLY_SAME : CONFIRM_SUPPLY_CORRECTED;
  // P3 증빙 없음 · 짝 아님 · 지급 총액 볼 권한 없음 — `지급 완료` 비활성 + 이유(block). 예정일 칸이 열려 2차로 내려도 같은 이유(서버 행).
  const blockReason = serverBar?.blockReason ?? null;
  // 06.5-11 W-2: 지급일 칸 오류(미래)가 서 있는 동안 1차는 일괄 대화상자의 blockedBy처럼 꺼진 모양 — 이유는 칸 아래 오류 줄 한 자리(aria-describedby), 날짜를 바꾸면 풀린다.
  const payDateBlocked = Boolean(fieldErrors.payDate);
  const paid = view.row?.row === "P6" && view.payDate !== undefined;
  // 2차 `지급 취소`(D-606) — 지급 뒤(P5 · P6) 지급 권한자에게만(서버 행의 secondary).
  const canCancel = (paid || (view.row?.row === "P5" && view.payDate !== undefined)) && bar?.secondary === "cancel" && ready;
  const [cancelOpen, setCancelOpen] = useState(false);
  const justCancelledRef = useRef(false);

  function saveSchedule() {
    if (!canSaveSchedule || !schedule || submittingRef.current || view.expenseId === undefined || view.version === undefined) return;
    // 값을 바꾸지 않았으면 저장할 것이 없다 — 칸만 닫고 `지급 예정일 바꾸기`로 포커스(Esc와 같은 끝).
    if (!scheduleDirty) {
      setSchedule(null);
      requestAnimationFrame(() => document.getElementById("payment-schedule-edit")?.focus());
      return;
    }
    submittingRef.current = true;
    setPending(true);
    setConflict(null);
    executeSchedule({ expenseId: view.expenseId, scheduledPayDate: schedule.value, version: view.version });
  }

  function confirmEvidence() {
    if (!canConfirm || confirmBlock !== null || submittingRef.current || view.expenseId === undefined || view.version === undefined) return;
    if (evidenceInput.fieldError) return showEvidenceError(evidenceInput.fieldError);
    submittingRef.current = true;
    setPending(true);
    setConflict(null);
    correctedSentRef.current = evidenceInput.corrected !== undefined;
    // 화면이 본 증빙 지문을 version과 함께 — 그 사이 증빙이 바뀌었으면 서버가 동시성으로 거부한다. 공급가는 지금 값과 다를 때만.
    executeConfirm({
      expenseId: view.expenseId,
      version: view.version,
      ...(view.evidenceStamp === undefined ? {} : { evidenceStamp: view.evidenceStamp }),
      ...(evidenceInput.corrected === undefined ? {} : { correctedSupplyAmount: evidenceInput.corrected }),
    });
  }

  function pay() {
    if (!canPay || blockReason !== null || payDateBlocked || submittingRef.current || previewing || view.expenseId === undefined || view.version === undefined) return;
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

  // Ctrl+Enter = 그때 보이는 1차(§7-9 — dirty면 `예정일 저장`). 렌더마다 다시 건다(지금 렌더의 함수를 쓴다). 모달 안 키는 모달 몫(G-06-H).
  useEffect(() => {
    if (!canPay && !canSaveSchedule && !canConfirm) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.target instanceof Element && event.target.closest("dialog[open]")) return;
      if (!isCtrlCombo(event, "Enter")) return;
      event.preventDefault();
      // 누른 채 자동 반복된 keydown은 받지 않는다 — `증빙 확인` 응답으로 1차가 `지급 완료`로 바뀐 직후 지급되지 않게(M-3).
      if (event.repeat) return;
      if (canSaveSchedule) saveSchedule();
      else if (canConfirm) confirmEvidence();
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

  // 증빙 확인 뒤 다시 읽은 행: P4면 이체액 칸으로(M-3 — 입력 → 1차 흐름, 칸이 없으면 1차), P6(P5에서 확인)이면 결과 글자로.
  useEffect(() => {
    if (!justConfirmedRef.current || canConfirm) return;
    if (canPay) {
      justConfirmedRef.current = false;
      // 고친 공급가면 지급 총액이 바뀐다 — 지금(1차 `지급 완료`가 선 뒤) 미리보기를 다시 받아 안 고친 이체액 칸이 새 값을 따른다.
      // 새 값이 오면 이체액 칸이 다시 서므로(key) 포커스는 미리보기가 끝난 뒤에 준다 — 지금 주면 body로 빠진다(06-06 DOM 감사 D-1).
      if (correctedSentRef.current && fields.payDate !== "") {
        focusTransferAfterPreviewRef.current = "start";
        refreshPreview();
        return;
      }
      (document.getElementById("payment-transfer") ?? primaryRef.current?.querySelector("button"))?.focus();
    } else if (paid) {
      justConfirmedRef.current = false;
      resultRef.current?.focus();
    }
  }, [canConfirm, canPay, paid, refreshPreview, fields.payDate]);

  useEffect(() => {
    const stage = focusTransferAfterPreviewRef.current;
    if (stage === null) return;
    if (previewing) {
      focusTransferAfterPreviewRef.current = "waiting";
      return;
    }
    if (stage !== "waiting") return;
    focusTransferAfterPreviewRef.current = null;
    (document.getElementById("payment-transfer") ?? primaryRef.current?.querySelector("button"))?.focus();
  }, [previewing]);

  // 예정일 저장 · 지급 취소 뒤 응답으로 다시 읽은 표에 1차가 서면 그 1차로 포커스(r2 F5).
  // 예정일 칸이 열린 동안은 `지급 완료`가 2차라 1차 자리가 아니다 — 칸이 닫혀 1차로 돌아온 때를 본다.
  const payIsPrimary = canPay && !canSaveSchedule;
  useEffect(() => {
    if ((justSavedScheduleRef.current || justCancelledRef.current) && payIsPrimary) {
      justSavedScheduleRef.current = false;
      justCancelledRef.current = false;
      primaryRef.current?.querySelector("button")?.focus();
    }
  }, [payIsPrimary]);

  // 06-20(C-1 · UI-SPEC S1 「문서 화면 왕복」): `from=pay`로 열었을 때만 행동 줄 오른쪽 3차 `지급 대상으로`(서버가 새로 만든 href),
  // 증빙이 `확인됨`이고 같은 필터에 다음 `확인 전`이 있으면 같은 자리에 `다음 확인 전 {번호}`. 1차 규칙은 그대로다.
  const payReturn = view.payReturn ?? null;
  const nextUnreviewed = payReturn?.next && view.evidenceStatus === "확인됨" ? payReturn.next : null;

  // 거부 뒤 다시 읽은 행이 달라지면(예: 지급 뒤 LOCKED → P5) 거부 줄은 새 행이 대신 말한다 — 같은 행이면(응답 없음 등) 줄이 남는다.
  const rowKey = `${view.row?.row ?? ""}:${view.version ?? ""}`;
  useEffect(() => {
    setConflict(null);
  }, [rowKey, setConflict]);

  // 지급 뒤(P6)는 1차 없이 결과 글자만(버튼 아님). 지급 권한이 없는 사람에게는 이 페이즈의 버튼이 없다(D-601 — 지급 전 담당 표기는 섹션 지급 예정일 2행).
  const showResult = paid && view.paidTime !== undefined;
  if (!canPay && !canSaveSchedule && !canConfirm && !showResult) return null;
  return (
    <>
      <div className={barStyles.bar} data-fixed-bar="">
        {conflict ? <ConflictLine message={conflict} /> : null}
        <div className={payReturn ? `${barStyles.buttons} ${listStyles.payReturnButtons}` : barStyles.buttons}>
          {canSaveSchedule ? (
            <>
              <span className={barStyles.primaryWrap} ref={primaryRef}>
                <Button variant="primary" shortcut="Ctrl+Enter" pending={pending} onClick={saveSchedule}>
                  예정일 저장
                </Button>
              </span>
              {lowered === "pay" ? (
                <span className={barStyles.secondaryWrap}>
                  <Button variant="secondary" disabled={blockReason !== null || payDateBlocked} disabledReason={blockReason ?? undefined} onClick={pay}>
                    지급 완료
                  </Button>
                </span>
              ) : null}
            </>
          ) : canConfirm ? (
            <span className={barStyles.primaryWrap} ref={primaryRef}>
              <Button
                variant="primary"
                shortcut="Ctrl+Enter"
                pending={confirmBlock === null && pending}
                disabled={confirmBlock !== null}
                disabledReason={confirmBlock ?? undefined}
                onClick={confirmEvidence}
              >
                {confirmLabel}
              </Button>
            </span>
          ) : canPay ? (
            <span className={barStyles.primaryWrap} ref={primaryRef}>
              <Button
                variant="primary"
                shortcut="Ctrl+Enter"
                pending={blockReason === null && !payDateBlocked && (pending || previewing)}
                disabled={blockReason !== null || payDateBlocked}
                disabledReason={blockReason ?? undefined}
                aria-describedby={blockReason === null && payDateBlocked ? "payment-pay-date-error" : undefined}
                onClick={pay}
              >
                지급 완료
              </Button>
            </span>
          ) : (
            <>
              <StatusTag status="지급 완료" />
              <span ref={resultRef} tabIndex={-1} role="status" className={styles.resultSuccess} data-testid="payment-result">
                지급 완료 → {view.payDate} · {view.paidTime}
              </span>
            </>
          )}
          {payReturn ? (
            <span className={canCancel ? listStyles.payReturn : `${listStyles.payReturn} ${listStyles.payReturnEnd}`} data-pay-return="">
              <Link href={payReturn.backHref} className={buttonLinkClassName("tertiary")}>
                지급 대상으로
              </Link>
              {nextUnreviewed ? (
                <Link href={nextUnreviewed.href} className={buttonLinkClassName("tertiary")}>
                  다음 확인 전 {nextUnreviewed.number}
                </Link>
              ) : null}
            </span>
          ) : null}
          {canCancel ? (
            <span className={barStyles.secondaryWrap}>
              <Button variant="secondary" onClick={() => setCancelOpen(true)}>
                지급 취소
              </Button>
            </span>
          ) : null}
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
  const router = useRouter();
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
    // 서버 거부(동시성 · 이미 취소됨) 뒤 문서를 다시 읽는다 — 다음 시도가 새 version을 보낸다(지급 경로 onError와 같은 꼴, 06-04 검토 P3-3).
    if (response?.serverError) router.refresh();
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
