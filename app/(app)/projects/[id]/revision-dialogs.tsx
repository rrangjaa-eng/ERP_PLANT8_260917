"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { createRevisionAction, setCustomerApprovalAction } from "../actions";
import { Button } from "@/ui/button/Button";
import { ConfirmDialog } from "@/ui/confirm-dialog/ConfirmDialog";
import { Form } from "@/ui/form/Form";
import { FORMAT_ERROR, isCalendarDate } from "@/domain/projects/period";
import { formatKrw } from "@/lib/format-number";
import { unsavedEditsReason } from "./unsaved-edits";
import styles from "./project-detail.module.css";

// 04-24(PROJ-05 · PROJ-07 · DR-12) — 상세 머리 줄의 차수 확인 다이얼로그. 전부 ui/confirm-dialog이고, 렌더 조건·
// 줄 수·기준값은 서버가 계산해 넘긴다(page.tsx) — 이 파일은 그 값과 서버 거부 문자열을 그대로 그린다.

export type NewRevisionProps = {
  projectId: string;
  /** 화면이 보고 있는 현재 차수 id — 액션의 fromRevisionId(B-02). */
  revisionId: string;
  seq: number;
  /** 복사 대상 줄 수(견적 줄 + 견적 외 비용, 조정 제외) — 서버 요약 행. */
  lineCount: number;
  /** 새 차수로 옮겨 가는 조정 줄 수 — 서버가 센다. */
  adjustmentCount: number;
};

// D-53 · UI-SPEC rev 5 Copywriting 「Destructive — 새 차수」 · 「SUCCESS — 새 차수」(DR-21 — 누른 1차 라벨).
export function NewRevisionDialog({
  dirtyCount,
  onCreated,
  ...props
}: NewRevisionProps & { dirtyCount: number; onCreated: (message: string) => void }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [rejection, setRejection] = useState<string | null>(null);
  // 1차 dblclick의 두 번째 누름은 isExecuting이 아직 거짓인 렌더에서 오므로 동기 래치로 막는다(status-change.tsx와 같은 이유).
  const submittingRef = useRef(false);
  const nextSeq = props.seq + 1;

  const { execute, isExecuting } = useAction(createRevisionAction, {
    onSettled: () => {
      submittingRef.current = false;
    },
    onSuccess: ({ data }) => {
      setOpen(false);
      onCreated(`새 차수 만들기 · 상세 견적 ${data?.seq ?? nextSeq}차`);
      router.refresh();
    },
    onError: ({ error }) => {
      // 서버 문자열 그대로(빈 차수 · 다른 사람이 먼저 새 차수) — 다이얼로그는 열린 채, 토스트 없음.
      setRejection(error.serverError ?? null);
    },
  });

  function submit() {
    if (submittingRef.current || unsavedEditsReason(dirtyCount)) return;
    submittingRef.current = true;
    setRejection(null);
    execute({ projectId: props.projectId, fromRevisionId: props.revisionId });
  }

  const resultLines = [`${props.seq}차 ${props.lineCount}줄을 복사해 ${nextSeq}차 · 되돌리기 없음`];
  if (props.adjustmentCount > 0) resultLines.push(`조정 ${props.adjustmentCount}줄은 ${nextSeq}차에도 그대로`);

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        onClick={() => {
          setRejection(null);
          setOpen(true);
        }}
      >
        복사해 새 차수
      </Button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        title="복사해 새 차수"
        subtitle={`상세 견적 ${props.seq}차 · ${props.lineCount}줄`}
        resultLines={resultLines}
        primary={{
          label: "새 차수 만들기",
          onConfirm: submit,
          pending: isExecuting,
          // B-03 · DR-6 — 미저장 편집 막힘이 먼저, 그다음 서버 거부.
          disabledReason: unsavedEditsReason(dirtyCount) ?? rejection ?? undefined,
        }}
      />
    </>
  );
}

// D-56 · ENG-D9 · CEO-D19 — 부제 옆 고객 승인 줄. 글자(`고객 승인 {날짜} {이름}`)·렌더 조건·기준값은 서버가 만든다.
export type CustomerApprovalProps = {
  revisionId: string;
  seq: number;
  /** 서버가 만든 `고객 승인 {KST 날짜} {승인자}` — 승인 전 null. */
  approvalText: string | null;
  approvedOn: string | null;
  /** 담당 PM + 쓰기 + 완료 아님(서버 판정) — 승인 전 「고객 승인 표시」, 승인 뒤 연결 문서가 없으면 「승인 표시 취소」. */
  control: { kind: "approve"; totalKrw: number; contentToken: string; todayKst: string } | { kind: "cancel" } | null;
};

export function CustomerApprovalLine({
  className,
  dirtyCount,
  ...props
}: CustomerApprovalProps & { className?: string; dirtyCount: number }) {
  if (!props.approvalText && !props.control) return null;
  const control = props.control;
  // 다이얼로그는 <p> 밖에 둔다(<dialog>는 문단 안에 둘 수 없다) — 이 줄에는 글자와 트리거만.
  const line = (trigger: ReactNode) => (
    <p className={className}>
      {props.approvalText ? <span>{props.approvalText}</span> : null}
      {trigger}
    </p>
  );
  if (control?.kind === "approve") {
    return <ApprovalDialog key={`approve-${props.revisionId}`} line={line} revisionId={props.revisionId} seq={props.seq} dirtyCount={dirtyCount} {...control} />;
  }
  if (control?.kind === "cancel") {
    return <ApprovalCancelDialog key={`cancel-${props.revisionId}`} line={line} revisionId={props.revisionId} seq={props.seq} approvedOn={props.approvedOn ?? ""} />;
  }
  return line(null);
}

// 승인·취소 성공 뒤 새로 고침으로 트리거(이 컴포넌트)가 사라지면 포커스를 머리 줄 제목으로(S16 — status-change.tsx와 같다).
function useFocusTitleAfterSuccess() {
  const succeededRef = useRef(false);
  useEffect(
    () => () => {
      if (succeededRef.current) document.querySelector<HTMLElement>("h1")?.focus();
    },
    [],
  );
  return succeededRef;
}

// UI-SPEC rev 5 Copywriting 「확인 — 고객 승인 표시」 · S16 — 확인 근거 칸 하나(승인일, 개정 ⑭ · DR-20), 결과 줄 없음.
function ApprovalDialog({
  line,
  revisionId,
  seq,
  totalKrw,
  contentToken,
  todayKst,
  dirtyCount,
}: {
  line: (trigger: ReactNode) => ReactNode;
  revisionId: string;
  seq: number;
  totalKrw: number;
  contentToken: string;
  todayKst: string;
  dirtyCount: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [approvedOn, setApprovedOn] = useState(todayKst);
  const [rejection, setRejection] = useState<string | null>(null);
  const submittingRef = useRef(false);
  const succeededRef = useFocusTitleAfterSuccess();
  const fieldId = useId();
  const errorId = `${fieldId}-error`;

  const { execute, isExecuting } = useAction(setCustomerApprovalAction, {
    onSettled: () => {
      submittingRef.current = false;
    },
    onSuccess: () => {
      // 토스트 없음 — 결과는 부제(승인일)에 보인다.
      succeededRef.current = true;
      setOpen(false);
      router.refresh();
    },
    onError: ({ error }) => {
      // 서버 문자열 그대로(빈 차수 · 견적이 바뀜 · 미래 날짜) — 다이얼로그는 열린 채.
      setRejection(error.serverError ?? null);
    },
  });

  const unsaved = unsavedEditsReason(dirtyCount);
  const formatInvalid = !isCalendarDate(approvedOn);

  function submit() {
    if (submittingRef.current || unsaved || formatInvalid) return;
    submittingRef.current = true;
    succeededRef.current = false;
    setRejection(null);
    // ENG-D9 — PM이 본 기준값(요약 행의 합계·내용 토큰)을 그대로 싣는다.
    execute({ revisionId, approval: { approvedOn, seenTotalKrw: totalKrw, contentToken } });
  }

  return (
    <>
      {line(
        <Button
          type="button"
          variant="tertiary"
          onClick={() => {
            setApprovedOn(todayKst);
            setRejection(null);
            setOpen(true);
          }}
        >
          고객 승인 표시
        </Button>,
      )}
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        title="고객 승인 표시"
        subtitle={`상세 견적 ${seq}차 · ${formatKrw(totalKrw)}`}
        evidenceField={
          <Form.Field id={fieldId} label="승인일" width="short">
            <input
              id={fieldId}
              type="text"
              inputMode="numeric"
              autoComplete="off"
              placeholder="2026-09-18"
              value={approvedOn}
              aria-invalid={formatInvalid ? "true" : undefined}
              aria-describedby={formatInvalid ? errorId : undefined}
              className={styles.periodInput}
              onChange={(event) => {
                setApprovedOn(event.target.value);
                setRejection(null);
              }}
            />
            {formatInvalid ? <Form.Error id={errorId}>{FORMAT_ERROR}</Form.Error> : null}
          </Form.Field>
        }
        primary={{
          label: "고객 승인 표시",
          onConfirm: submit,
          pending: isExecuting,
          // 막힘 순서: 미저장 편집(DR-6) → 날짜 형식(칸 아래 한 자리) → 서버 거부.
          disabledReason: unsaved ?? (formatInvalid ? undefined : (rejection ?? undefined)),
          blockedBy: formatInvalid ? errorId : undefined,
        }}
      />
    </>
  );
}

// UI-SPEC rev 5 Copywriting 「Destructive — 고객 승인 표시 취소」 — 2차 `닫기 Esc`는 1차의 「취소」에서 파생된다.
function ApprovalCancelDialog({
  line,
  revisionId,
  seq,
  approvedOn,
}: {
  line: (trigger: ReactNode) => ReactNode;
  revisionId: string;
  seq: number;
  approvedOn: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [rejection, setRejection] = useState<string | null>(null);
  const submittingRef = useRef(false);
  const succeededRef = useFocusTitleAfterSuccess();

  const { execute, isExecuting } = useAction(setCustomerApprovalAction, {
    onSettled: () => {
      submittingRef.current = false;
    },
    onSuccess: () => {
      succeededRef.current = true;
      setOpen(false);
      router.refresh();
    },
    onError: ({ error }) => {
      setRejection(error.serverError ?? null);
    },
  });

  function submit() {
    if (submittingRef.current) return;
    submittingRef.current = true;
    succeededRef.current = false;
    setRejection(null);
    execute({ revisionId, approval: null });
  }

  return (
    <>
      {line(
        <Button
          type="button"
          variant="tertiary"
          onClick={() => {
            setRejection(null);
            setOpen(true);
          }}
        >
          승인 표시 취소
        </Button>,
      )}
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        title="고객 승인 표시 취소"
        subtitle={`상세 견적 ${seq}차 · 승인일 ${approvedOn}`}
        resultLines={["승인일 지워짐 · 이 차수의 지출결의가 다시 막힘"]}
        primary={{
          label: "승인 표시 취소",
          onConfirm: submit,
          pending: isExecuting,
          disabledReason: rejection ?? undefined,
        }}
      />
    </>
  );
}
