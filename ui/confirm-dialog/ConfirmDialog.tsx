"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
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
  /** 막힘 이유 옆에 두는 다음 한 수 3차(예: 04-21 「기간 적기」). */
  nextStep?: ReactNode;
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
  const titleId = useId();

  const submitting = Boolean(primary?.pending);

  const focusTarget = initialFocusTarget({
    hasEvidence: Boolean(evidenceField),
    hasPrimary: Boolean(primary),
    primaryBlocked: Boolean(primary?.disabledReason),
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

  function handleDialogClose() {
    onClose();
    const trigger = previouslyFocusedRef.current;
    if (trigger && document.contains(trigger)) {
      trigger.focus();
    } else {
      document.querySelector<HTMLElement>("h1")?.focus();
    }
  }

  function handleCancelNative(event: React.SyntheticEvent<HTMLDialogElement>) {
    // 네이티브 Esc(cancel 이벤트) — 제출 중에는 무시한다.
    event.preventDefault();
    if (submitting) return;
    dialogRef.current?.close();
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLDialogElement>) {
    if (primary && !submitting && !primary.disabledReason && isCtrlCombo(event, "Enter")) {
      event.preventDefault();
      primary.onConfirm();
    }
  }

  function handleBackdropClick(event: React.MouseEvent<HTMLDialogElement>) {
    // dialog 요소 자체를 눌렀을 때만 가림막 클릭이다(내용 클릭과 구분).
    if (event.target === dialogRef.current && !submitting) {
      dialogRef.current?.close();
    }
  }

  function handleCloseButtonClick() {
    if (submitting) return;
    dialogRef.current?.close();
  }

  const resolvedSecondaryLabel = secondaryLabel ?? (primary ? secondaryLabelFor(primary.label) : "닫기");

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

      {primary ? (
        <div className={styles.actions}>
          {primary.disabledReason ? (
            <span className={primary.reasonTone === "info" ? styles.reasonInfo : styles.reason}>
              {primary.disabledReason}
            </span>
          ) : null}
          {primary.nextStep ? <span className={styles.nextStep}>{primary.nextStep}</span> : null}
          <span ref={primaryWrapRef} className={styles.primaryWrap}>
            <Button
              variant="primary"
              shortcut={primary.shortcut ?? "Ctrl+Enter"}
              pending={primary.pending}
              disabled={Boolean(primary.disabledReason)}
              disabledReason={primary.disabledReason}
              reasonTone={primary.reasonTone}
              onClick={primary.onConfirm}
            >
              {primary.label}
            </Button>
          </span>
          <span className={styles.secondaryWrap}>
            <Button
              variant="secondary"
              shortcut="Esc"
              disabled={submitting}
              onClick={() => {
                if (submitting) return;
                dialogRef.current?.close();
              }}
            >
              {resolvedSecondaryLabel}
            </Button>
          </span>
        </div>
      ) : null}
    </dialog>
  );
}
