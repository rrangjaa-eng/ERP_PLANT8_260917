"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { createRevisionAction, setCustomerApprovalAction } from "../actions";
import { Button } from "@/ui/button/Button";
import { ConfirmDialog } from "@/ui/confirm-dialog/ConfirmDialog";
import { Form } from "@/ui/form/Form";
import { Select } from "@/ui/select/Select";
import { TextField } from "@/ui/input/TextField";
import { PanelForm } from "@/ui/side-panel/PanelForm";
import { SidePanel } from "@/ui/side-panel/SidePanel";
import { unsavedEditsReason } from "./unsaved-edits";
import styles from "./project-detail.module.css";

// 04-24(PROJ-05 · PROJ-07 · DR-12) — 상세 머리 줄의 차수 확인 다이얼로그. 전부 ui/confirm-dialog이고, 렌더 조건·
// 줄 수·기준값은 서버가 계산해 넘긴다(page.tsx) — 이 파일은 그 값과 서버 거부 문자열을 그대로 그린다.

// 검토 S5 — 서버 거부 문자열이 없는 실패(요청 끊김 · 검증 오류). UI-SPEC rev 5에 없는 문구다(SUMMARY 「검토 반영」).
// 1차는 이 이유로 막히고, 다이얼로그를 닫고 다시 열면 풀린다(트리거가 rejection을 지운다).
const REQUEST_FAILED = "처리하지 못함 · 닫고 다시 시도";

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
      setRejection(error.serverError ?? REQUEST_FAILED);
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
        className={styles.headerTouchButton}
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

// D-56 · ENG-D9 · CEO-D19 · 07-18(W6) — 정보 면 `고객 승인` 섹션의 승인 상태와 행동. 글자 · 렌더 조건 · 기준값은 서버가 만든다.
export type CustomerApprovalBasisKey = "purchase_order" | "email" | "verbal";
const BASIS_LABEL: Record<CustomerApprovalBasisKey, string> = { purchase_order: "발주서", email: "이메일", verbal: "구두" };
const BASIS_OPTIONS = [
  { value: "", label: "근거 선택" },
  { value: "purchase_order", label: BASIS_LABEL.purchase_order },
  { value: "email", label: BASIS_LABEL.email },
  { value: "verbal", label: BASIS_LABEL.verbal },
];
const BASIS_REQUIRED = "근거 선택";
// 서버 거부 이유가 ` · 새로 고침`으로 끝나면 그 꼬리는 글자가 아니라 다음 한 수 3차 버튼이다(ConfirmDialog와 같은 규칙 — §7-17 ERROR).
const REFRESH_TAIL = " · 새로 고침";
const MEMO_MAX = 500;
export const CUSTOMER_APPROVAL_TRIGGER_ID = "customer-approval-trigger";

export type CustomerApprovalProps = {
  revisionId: string;
  seq: number;
  approvedOn: string | null;
  approverName: string | null;
  /** 07-18 — 승인 근거 · 메모. 옛 승인(근거 NULL)은 둘 다 null. */
  basis: CustomerApprovalBasisKey | null;
  memo: string | null;
  /** 근거가 발주서인데 발주서 서류가 없다 — 경고 글자만, 저장은 막지 않는다. */
  purchaseOrderMissing: boolean;
  /** 담당 PM + 쓰기 + 완료 아님(서버 판정) — 승인 전 「승인 표시」, 승인 뒤 연결 문서가 없으면 「승인 표시 취소」. */
  control: { kind: "approve"; totalKrw: number; contentToken: string; todayKst: string } | { kind: "cancel" } | null;
};

export function CustomerApprovalItems({ dirtyCount, ...props }: CustomerApprovalProps & { dirtyCount: number }) {
  const approved = props.approvedOn !== null;
  const control = props.control;
  return (
    <>
      <p className={styles.infoItem}>
        <span className={styles.infoLabel}>상태</span>
        {approved ? (
          <span className={styles.infoValue}>{props.basis ? `승인됨 · ${BASIS_LABEL[props.basis]}` : "승인됨"}</span>
        ) : (
          <span className={styles.infoNone}>승인 전</span>
        )}
        {approved && props.purchaseOrderMissing ? <span className={styles.infoWarn}>발주서 파일 없음</span> : null}
      </p>
      {approved ? <p className={styles.infoAux}>{[props.approvedOn, props.approverName].filter(Boolean).join(" ")}</p> : null}
      {approved && props.memo ? <p className={styles.infoAux}>{props.memo}</p> : null}
      {control?.kind === "approve" ? (
        <ApprovalPanel key={`approve-${props.revisionId}`} revisionId={props.revisionId} dirtyCount={dirtyCount} {...control} />
      ) : null}
      {control?.kind === "cancel" ? (
        <ApprovalCancelDialog key={`cancel-${props.revisionId}`} revisionId={props.revisionId} seq={props.seq} approvedOn={props.approvedOn ?? ""} />
      ) : null}
    </>
  );
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

// 07-18(W6 · SC-19) — 승인 표시는 근거(필수) + 메모(선택)가 더해져 입력 칸이 둘이라 옆 패널이다. 1차 `승인 표시`, 2차 `취소 Esc`.
// 승인일은 칸이 아니라 오늘(KST)이다 — 사용자가 하지 않아도 될 결정이다.
function ApprovalPanel({
  revisionId,
  totalKrw,
  contentToken,
  todayKst,
  dirtyCount,
}: {
  revisionId: string;
  totalKrw: number;
  contentToken: string;
  todayKst: string;
  dirtyCount: number;
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
      // 토스트 없음 — 결과는 면의 `승인됨 · {근거}`에 보인다.
      succeededRef.current = true;
      setOpen(false);
      router.refresh();
    },
    onError: ({ error }) => {
      // 서버 문자열 그대로(빈 차수 · 견적이 바뀜 · 근거 · 메모) — 패널은 열린 채.
      setRejection(error.serverError ?? REQUEST_FAILED);
    },
  });

  function submit(basis: CustomerApprovalBasisKey, memo: string) {
    if (submittingRef.current) return;
    submittingRef.current = true;
    succeededRef.current = false;
    setRejection(null);
    // ENG-D9 — PM이 본 기준값(요약 행의 합계 · 내용 토큰)을 그대로 싣는다.
    execute({ revisionId, approval: { approvedOn: todayKst, seenTotalKrw: totalKrw, contentToken, approvalBasis: basis, approvalMemo: memo } });
  }

  return (
    <>
      <p className={styles.infoItem}>
        <Button
          id={CUSTOMER_APPROVAL_TRIGGER_ID}
          type="button"
          variant="tertiary"
          onClick={() => {
            setRejection(null);
            setOpen(true);
          }}
        >
          승인 표시
        </Button>
      </p>
      {open ? (
        <SidePanel title="고객 승인 표시" onClose={() => setOpen(false)}>
          <ApprovalPanelForm
            pending={isExecuting}
            unsaved={unsavedEditsReason(dirtyCount) ?? undefined}
            rejection={rejection}
            onSubmit={submit}
            onRefresh={() => {
              setOpen(false);
              router.refresh();
            }}
          />
        </SidePanel>
      ) : null}
    </>
  );
}

function ApprovalPanelForm({
  pending,
  unsaved,
  rejection,
  onSubmit,
  onRefresh,
}: {
  pending: boolean;
  unsaved: string | undefined;
  rejection: string | null;
  onSubmit: (basis: CustomerApprovalBasisKey, memo: string) => void;
  onRefresh: () => void;
}) {
  const [basis, setBasis] = useState("");
  const [basisError, setBasisError] = useState<string | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (unsaved) return;
    const memoValue = new FormData(event.currentTarget).get("approvalMemo");
    const memo = typeof memoValue === "string" ? memoValue : "";
    if (basis !== "purchase_order" && basis !== "email" && basis !== "verbal") {
      setBasisError(BASIS_REQUIRED);
      document.getElementById("approval-basis")?.focus();
      return;
    }
    onSubmit(basis, memo);
  }

  return (
    <PanelForm
      id="customer-approval-form"
      label="승인 표시"
      intent="edit"
      onSubmit={handleSubmit}
      pending={pending}
      blockedReason={unsaved}
      reason={
        basisError ??
        (rejection?.endsWith(REFRESH_TAIL) ? (
          <>
            <span>{rejection.slice(0, -REFRESH_TAIL.length)}</span>
            <Button type="button" variant="tertiary" onClick={onRefresh}>
              새로 고침
            </Button>
          </>
        ) : (
          (rejection ?? undefined)
        ))
      }
    >
      <Form.Field id="approval-basis" label="근거" width="select">
        <Select
          id="approval-basis"
          name="approvalBasis"
          hideEmptyOption
          value={basis}
          options={BASIS_OPTIONS}
          error={basisError ?? undefined}
          onChange={(event) => {
            setBasis(event.target.value);
            setBasisError(null);
          }}
        />
      </Form.Field>
      <TextField id="approval-memo" name="approvalMemo" label="메모" maxLength={MEMO_MAX} autoComplete="off" />
    </PanelForm>
  );
}

// UI-SPEC rev 5 Copywriting 「Destructive — 고객 승인 표시 취소」 — 2차 `닫기 Esc`는 1차의 「취소」에서 파생된다.
function ApprovalCancelDialog({
  revisionId,
  seq,
  approvedOn,
}: {
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
      setRejection(error.serverError ?? REQUEST_FAILED);
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
      <p className={styles.infoItem}>
        <Button
          id={CUSTOMER_APPROVAL_TRIGGER_ID}
          type="button"
          variant="tertiary"
          onClick={() => {
            setRejection(null);
            setOpen(true);
          }}
        >
          승인 표시 취소
        </Button>
      </p>
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
