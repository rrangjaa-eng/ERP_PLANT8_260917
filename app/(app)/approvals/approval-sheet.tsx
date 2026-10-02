/* eslint-disable no-restricted-syntax -- 04.6 스킨 A 이관 전 */
"use client";

import { Fragment, useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { Button } from "@/ui/button/Button";
import { ApprovalRoute, type ApprovalRouteEndLine, type ApprovalRouteListStep } from "@/ui/approval-route/ApprovalRoute";
import { approveAction } from "./actions";
import { DayNumbers } from "@/app/(app)/leave/day-numbers";
import { approveToast } from "./approve-toast";
import { ConflictLine } from "./conflict-line";
import styles from "./approval-sheet.module.css";

// 04.1-05 S5 폰 결재 시트(§7-8 · A3 — 「결재 옆판」의 폰 자리). 본문 행은 문서 종류가 준 상세(엔진이
// detailDto로 투영한 뒤 buildDetailRows가 만든 행)라 이 파일은 연차를 모른다. 행동 줄은 서버 가능 행동
// 그대로 — 1차 `승인`(첫 포커스) + 2차 `반려` 또는 `회수`(기안자이면서 담당). 골격은 ui/shell/MoreSheet의
// 네이티브 <dialog>(포커스 트랩 · 가림막 · Esc) 모양을 이 파일 안에서 따른다(ui/shell은 고치지 않는다).

export type SheetDetailRow = { label: string; lines: { text: string; tone: "default" | "muted" | "warning" }[] };
export type SheetAction = "approve" | "reject" | "withdraw" | "resubmit";

export type ApprovalSheetItem = {
  instanceId: string;
  version: number;
  title: string;
  subtitle: string;
  rows: SheetDetailRow[];
  steps: ApprovalRouteListStep[];
  endLines: ApprovalRouteEndLine[];
  actions: SheetAction[];
};

export type ApprovalSheetProps = {
  item: ApprovalSheetItem | null;
  onClose: () => void;
  onApproved: (message: string) => void;
  // 2차(반려 · 회수) — 이 시트를 닫고 확인 시트를 연다(시트 중첩 없음).
  onSecondary: (action: "reject" | "withdraw", item: ApprovalSheetItem) => void;
};

const SECONDARY_LABEL: Record<"reject" | "withdraw", string> = { reject: "반려", withdraw: "회수" };
// 잔고·일수 숫자만 700(문서 화면과 같은 행 — 04.1-06 DOM 감사 #4).
const DAY_NUMBER_ROWS = new Set(["잔고", "일수"]);

export function ApprovalSheet({ item, onClose, onApproved, onSecondary }: ApprovalSheetProps) {
  const router = useRouter();
  const titleId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const approveWrapRef = useRef<HTMLSpanElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  // 제출 중 — 렌더를 기다리지 않고 동기로 바뀌어 두 번째 누름을 무시한다(T7 · §7-17).
  const submittingRef = useRef(false);
  // 이 컴포넌트가 직접 닫으면 바로 마무리하고, 뒤늦게 오는 close 이벤트 한 번은 건너뛴다(ConfirmDialog와 같은 방식 —
  // 그 사이 열린 확인 시트의 포커스를 빼앗지 않게).
  const closedByUsRef = useRef(false);
  const [pending, setPending] = useState(false);
  const [conflict, setConflict] = useState<string | null>(null);

  const { execute } = useAction(approveAction, {
    onSuccess: ({ data }) => {
      if (!data) return;
      onApproved(approveToast(data));
      closeNow();
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

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (item && !dialog.open) {
      triggerRef.current = document.activeElement as HTMLElement | null;
      setConflict(null);
      dialog.showModal();
      approveWrapRef.current?.querySelector<HTMLElement>("button")?.focus();
    } else if (!item && dialog.open) {
      dialog.close();
    }
  }, [item]);

  function restoreFocus() {
    const trigger = triggerRef.current;
    if (trigger && document.contains(trigger)) trigger.focus();
    else document.querySelector<HTMLElement>("h1")?.focus();
  }

  function closeNow() {
    const dialog = dialogRef.current;
    if (!dialog?.open) return;
    dialog.close();
    closedByUsRef.current = true;
    restoreFocus();
    onClose();
  }

  function handleClose() {
    if (closedByUsRef.current) {
      closedByUsRef.current = false;
      return;
    }
    restoreFocus();
    onClose();
  }

  function handleCancel(event: React.SyntheticEvent<HTMLDialogElement>) {
    // Esc — 제출 중에는 무시한다.
    event.preventDefault();
    if (!submittingRef.current) closeNow();
  }

  function handleBackdrop(event: React.MouseEvent<HTMLDialogElement>) {
    if (event.target === dialogRef.current && !submittingRef.current) closeNow();
  }

  function approve() {
    if (!item || submittingRef.current) return;
    submittingRef.current = true;
    setPending(true);
    setConflict(null);
    execute({ instanceId: item.instanceId, expectedVersion: item.version });
  }

  function secondary(action: "reject" | "withdraw") {
    if (!item || submittingRef.current) return;
    const current = item;
    closeNow();
    onSecondary(action, current);
  }

  const secondaryAction = item?.actions.find((action): action is "reject" | "withdraw" => action === "reject" || action === "withdraw");

  return (
    <dialog
      ref={dialogRef}
      className={styles.sheet}
      aria-labelledby={titleId}
      onCancel={handleCancel}
      onClose={handleClose}
      onClick={handleBackdrop}
    >
      {item ? (
        <>
          <div className={styles.hd}>
            <div className={styles.titleBlock}>
              <h2 id={titleId} className={styles.title}>
                {item.title}
              </h2>
              {item.subtitle ? <p className={styles.subtitle}>{item.subtitle}</p> : null}
            </div>
            <button type="button" className={styles.close} aria-label="닫기" onClick={() => !submittingRef.current && closeNow()}>
              <svg viewBox="0 0 24 24" aria-hidden="true" className={styles.closeIcon}>
                <path d="M18 6 6 18" />
                <path d="m6 6 12 12" />
              </svg>
            </button>
          </div>
          <div className={styles.body}>
            <dl className={styles.kv}>
              {item.rows.map((row) => (
                <Fragment key={row.label}>
                  <dt>{row.label}</dt>
                  <dd>
                    {row.lines.map((line, index) => (
                      <span key={index} className={styles[`tone-${line.tone}`]}>
                        {DAY_NUMBER_ROWS.has(row.label) ? <DayNumbers text={line.text} /> : line.text}
                      </span>
                    ))}
                  </dd>
                </Fragment>
              ))}
              <dt>결재선</dt>
              <dd>
                <ApprovalRoute mode="list" steps={item.steps} endLines={item.endLines} />
              </dd>
            </dl>
          </div>
          <div className={styles.actions}>
            {conflict ? <ConflictLine message={conflict} /> : null}
            <div className={styles.buttons}>
              {secondaryAction ? (
                <span className={styles.secondaryWrap}>
                  {/* 제출 중 나머지 버튼 — ui/button의 disabled는 네이티브 disabled가 아니라 aria-disabled다(§7-1 ⑦ DR-11). */}
                  <Button variant="secondary" disabled={pending} onClick={() => secondary(secondaryAction)}>
                    {SECONDARY_LABEL[secondaryAction]}
                  </Button>
                </span>
              ) : null}
              {item.actions.includes("approve") ? (
                <span ref={approveWrapRef} className={styles.primaryWrap}>
                  <Button variant="primary" pending={pending} onClick={approve}>
                    승인
                  </Button>
                </span>
              ) : null}
            </div>
          </div>
        </>
      ) : null}
    </dialog>
  );
}
