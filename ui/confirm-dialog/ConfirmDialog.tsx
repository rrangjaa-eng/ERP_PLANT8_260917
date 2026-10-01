"use client";

import { useEffect, useId, useRef, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Button, type ButtonReasonTone } from "@/ui/button/Button";
import { isCtrlCombo } from "@/lib/shortcut";
import styles from "./ConfirmDialog.module.css";

// SYSTEM.md §7-17(⑮, DR-12 · DR-20) — 공용 확인 모달·시트. §7-8의 PC 모달과
// 폰 위험 행동 시트를 하나의 컴포넌트로 만든다(교차 그룹 계약 2). 포커스
// 트랩·가림막·Esc는 ui/shell/MoreSheet.tsx · ui/table/RowSheet.tsx 선례대로
// 네이티브 <dialog>.showModal()이 브라우저 차원에서 제공한다.

export type ConfirmDialogPrimary = {
  label: string;
  shortcut?: string;
  onConfirm: () => void;
  pending?: boolean;
  disabledReason?: string;
  /** §7-1 개정 ⑦ — 막힘(block, 기본) · 정상 상태(info) 이유 색. */
  reasonTone?: ButtonReasonTone;
  /** 막힘 이유 옆에 두는 다음 한 수 3차(예: 04-21 「기간 적기」). 이유가 ` · 새로 고침`으로 끝나면 그 꼬리의 「새로 고침」이 대신 선다. */
  nextStep?: ReactNode;
  /**
   * 04-24 — 이유가 이미 근거 칸 아래(Form.Error)에 있을 때 그 요소의 id. 1차를 막고 aria-describedby로 그 글자를
   * 가리키며, 1차 왼쪽 이유 자리에는 다시 쓰지 않는다(같은 사실을 두 자리에 쓰지 않는다). disabledReason이 먼저다.
   */
  blockedBy?: string;
};

export type ConfirmDialogOption = {
  label: string;
  description?: string;
  onSelect: () => void;
};

type ConfirmDialogBaseProps = {
  open: boolean;
  onClose: () => void;
  /** = 실제 동작. */
  title: string;
  /** 대상 한 줄. */
  subtitle?: string;
  /** 0~3줄. */
  resultLines?: ReactNode[];
  /** 확인의 근거 한 칸(사유 또는 날짜, §7-8 예외). */
  evidenceField?: ReactNode;
  /** 기본값은 secondaryLabelFor(primary.label) — 목록형은 "닫기"다. */
  secondaryLabel?: string;
};

export type ConfirmDialogProps = ConfirmDialogBaseProps &
  ({ primary: ConfirmDialogPrimary; options?: undefined } | { primary?: undefined; options: ConfirmDialogOption[] });

// 2차 라벨은 1차 라벨에서 기계적으로 파생된다 — 1차에 「취소」가 들어가면
// 「닫기」, 그 밖에는 「취소」다(§7-8 보강, Phase 4).
export function secondaryLabelFor(primaryLabel: string): string {
  return primaryLabel.includes("취소") ? "닫기" : "취소";
}

// 막힘 이유가 ` · 새로 고침`으로 끝나면 그 꼬리는 글자가 아니라 다음 한 수 3차 버튼이다(§7-17 ERROR — 같은 말을
// 두 자리에 쓰지 않는다). 서버 거부 문자열 · 서버가 계산한 막힘 이유 모두 같다.
const REFRESH_TAIL = " · 새로 고침";

export function splitRefreshTail(reason: string | undefined): { reason: string | undefined; refresh: boolean } {
  if (!reason?.endsWith(REFRESH_TAIL)) return { reason, refresh: false };
  return { reason: reason.slice(0, -REFRESH_TAIL.length), refresh: true };
}

// 거부는 화면이 본 값이 낡았다는 뜻이라 다시 받은 뒤 이 다이얼로그의 값도 낡았다 — 화면을 다시 받고 닫는다.
// 새 화면이 그려진 뒤에 닫는다(먼저 닫으면 다시 열어 낡은 값으로 또 보낼 수 있고, 포커스는 사라질 트리거로 간다).
// 다이얼로그 밖 막힘 이유(04-21 즉시 되돌리기 트리거)도 같은 버튼을 쓴다 — onDone이 그 거부를 지운다.
export function RefreshStep({ onDone }: { onDone: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const startedRef = useRef(false);
  useEffect(() => {
    if (!startedRef.current || pending) return;
    startedRef.current = false;
    onDone();
  }, [pending, onDone]);
  return (
    <Button
      variant="tertiary"
      pending={pending}
      onClick={() => {
        startedRef.current = true;
        startTransition(() => router.refresh());
      }}
    >
      새로 고침
    </Button>
  );
}

// 닫힌 뒤 포커스 — 트리거, 트리거가 사라졌으면 화면 제목(§7-17).
function returnFocus(trigger: HTMLElement | null) {
  if (trigger && document.contains(trigger)) {
    trigger.focus();
  } else {
    document.querySelector<HTMLElement>("h1")?.focus();
  }
}

// 열릴 때 첫 포커스 — 확인 근거 칸 → 없으면 1차(막혔어도) → 목록형이면 첫 행.
export function initialFocusTarget(args: {
  hasEvidence?: boolean;
  hasPrimary?: boolean;
  primaryBlocked?: boolean;
  optionCount?: number;
}): "evidence" | "primary" | "firstOption" {
  if (args.hasEvidence) return "evidence";
  if (args.hasPrimary) return "primary";
  return "firstOption";
}

export function ConfirmDialog(props: ConfirmDialogProps) {
  const { open, onClose, title, subtitle, resultLines, evidenceField, secondaryLabel } = props;
  const primary = props.primary;
  const options = props.options;

  const dialogRef = useRef<HTMLDialogElement>(null);
  const evidenceRef = useRef<HTMLDivElement>(null);
  const primaryWrapRef = useRef<HTMLSpanElement>(null);
  const firstOptionRef = useRef<HTMLButtonElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  // close()가 부르는 close 이벤트는 따로 줄 선 작업이라, 입력 작업(예: Esc
  // 직후의 Delete)이 그보다 먼저 처리될 수 있다. 이 컴포넌트가 직접 닫을 때는
  // 바로 마무리하고, 뒤늦게 오는 그 close 이벤트 한 번은 건너뛴다.
  const closedByUsRef = useRef(false);
  const titleId = useId();

  const submitting = Boolean(primary?.pending);
  // 꼬리를 뗀 이유 하나가 1차 비활성 · Ctrl+Enter · 첫 포커스를 함께 정한다.
  const refreshSplit = splitRefreshTail(primary?.disabledReason);
  const disabledReason = refreshSplit.reason;
  // 꼬리가 있으면 그 이유의 다음 한 수는 「새로 고침」이다 — 호출처가 준 다음 한 수는 다른 이유의 짝이라 내린다.
  const nextStep = refreshSplit.refresh ? <RefreshStep onDone={closeNow} /> : (primary?.nextStep ?? null);

  const focusTarget = initialFocusTarget({
    hasEvidence: Boolean(evidenceField),
    hasPrimary: Boolean(primary),
    primaryBlocked: Boolean(disabledReason),
    optionCount: options?.length ?? 0,
  });

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      previouslyFocusedRef.current = document.activeElement as HTMLElement | null;
      dialog.showModal();
      if (focusTarget === "evidence") {
        evidenceRef.current?.querySelector<HTMLElement>("input, select, textarea, button")?.focus();
      } else if (focusTarget === "firstOption") {
        firstOptionRef.current?.focus();
      } else {
        primaryWrapRef.current?.querySelector<HTMLElement>("button")?.focus();
      }
    } else if (!open && dialog.open) {
      dialog.close();
    }
    // focusTarget은 open이 바뀌는 순간의 슬롯 구성에서만 다시 계산하면 된다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // 열린 채로 사라질 때(예: 「새로 고침」 뒤 호스트 목록이 비어 빈 화면으로 바뀜)도 포커스를 닫힘 규칙대로 돌린다.
  // 문서에서 실제로 빠졌을 때만 — StrictMode의 가짜 언마운트는 노드가 남아 있어 열릴 때 포커스를 건드리지 않는다.
  useEffect(() => {
    const dialog = dialogRef.current;
    return () => {
      if (dialog?.open && !dialog.isConnected) returnFocus(previouslyFocusedRef.current);
    };
  }, []);

  function closeNow() {
    const dialog = dialogRef.current;
    if (!dialog?.open) return;
    dialog.close();
    closedByUsRef.current = true;
    finishClose();
  }

  function handleDialogClose() {
    if (closedByUsRef.current) {
      closedByUsRef.current = false;
      return;
    }
    finishClose();
  }

  function finishClose() {
    onClose();
    returnFocus(previouslyFocusedRef.current);
  }

  function handleCancelNative(event: React.SyntheticEvent<HTMLDialogElement>) {
    // 네이티브 Esc(cancel 이벤트) — 제출 중에는 무시한다.
    event.preventDefault();
    if (submitting) return;
    closeNow();
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLDialogElement>) {
    if (primary && !submitting && !disabledReason && !primary.blockedBy && isCtrlCombo(event, "Enter")) {
      event.preventDefault();
      primary.onConfirm();
    }
  }

  function handleBackdropClick(event: React.MouseEvent<HTMLDialogElement>) {
    // dialog 요소 자체를 눌렀을 때만 가림막 클릭이다(내용 클릭과 구분).
    if (event.target === dialogRef.current && !submitting) {
      closeNow();
    }
  }

  function handleCloseButtonClick() {
    if (submitting) return;
    closeNow();
  }

  const resolvedSecondaryLabel = secondaryLabel ?? (primary ? secondaryLabelFor(primary.label) : "닫기");
  // 사용자 결정(2026-09-29 A, PR #90 5894348076) — PC · 폰 모두 2차 왼쪽 · 1차 오른쪽이고 DOM · Tab 순서도 같다
  // (실물 sheet-modal · §7-17 슬롯 순서, 결재 시트 → 확인 시트로 넘어가도 주 버튼 자리가 그대로).
  const secondaryButton = (
    <span className={styles.secondaryWrap}>
      <Button
        variant="secondary"
        shortcut="Esc"
        disabled={submitting}
        onClick={() => {
          if (submitting) return;
          closeNow();
        }}
      >
        {resolvedSecondaryLabel}
      </Button>
    </span>
  );

  return (
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      aria-labelledby={titleId}
      onCancel={handleCancelNative}
      onKeyDown={handleKeyDown}
      onClick={handleBackdropClick}
      onClose={handleDialogClose}
    >
      <div className={styles.hd}>
        <div className={styles.titleBlock}>
          <h2 id={titleId} className={styles.title}>
            {title}
          </h2>
          {subtitle ? <p className={styles.subtitle}>{subtitle}</p> : null}
        </div>
        <button type="button" className={styles.close} aria-label="닫기" onClick={handleCloseButtonClick}>
          <svg viewBox="0 0 24 24" aria-hidden="true" className={styles.closeIcon}>
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
        </button>
      </div>

      <div className={styles.body}>
        {resultLines && resultLines.length > 0 ? (
          <div className={styles.resultLines}>
            {resultLines.map((line, index) => (
              <p key={index} className={styles.resultLine}>
                {line}
              </p>
            ))}
          </div>
        ) : null}

        {evidenceField ? (
          <div
            ref={evidenceRef}
            className={styles.evidence}
            aria-disabled={submitting ? "true" : undefined}
          >
            {evidenceField}
          </div>
        ) : null}

        {options ? (
          <ul className={styles.options}>
            {options.map((option, index) => (
              <li key={option.label}>
                <button
                  type="button"
                  ref={index === 0 ? firstOptionRef : undefined}
                  className={styles.optionButton}
                  aria-disabled={submitting ? "true" : undefined}
                  onClick={(event) => {
                    if (submitting) {
                      event.preventDefault();
                      return;
                    }
                    option.onSelect();
                  }}
                >
                  <span className={styles.optionLabel}>{option.label}</span>
                  {option.description ? <span className={styles.optionDescription}>{option.description}</span> : null}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <div className={styles.actions}>
        {primary ? (
          <>
            {disabledReason || nextStep ? (
              // 막힘 이유 + 다음 한 수 한 묶음 — PC는 행동 줄 왼쪽 그대로(display: contents), 폰은 버튼 윗줄(사용자 결정 2026-10-01).
              <span className={styles.blocker}>
                {disabledReason ? (
                  <span className={primary.reasonTone === "info" ? styles.reasonInfo : styles.reason}>{disabledReason}</span>
                ) : null}
                {nextStep ? <span className={styles.nextStep}>{nextStep}</span> : null}
              </span>
            ) : null}
            {secondaryButton}
            <span ref={primaryWrapRef} className={styles.primaryWrap}>
              <Button
                variant="primary"
                shortcut={primary.shortcut ?? "Ctrl+Enter"}
                pending={primary.pending}
                disabled={Boolean(disabledReason || primary.blockedBy)}
                disabledReason={disabledReason}
                aria-describedby={disabledReason ? undefined : primary.blockedBy}
                reasonTone={primary.reasonTone}
                onClick={primary.onConfirm}
              >
                {primary.label}
              </Button>
            </span>
          </>
        ) : (
          secondaryButton
        )}
      </div>
    </dialog>
  );
}
