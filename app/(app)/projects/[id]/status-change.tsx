"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { changeProjectStatusAction } from "../actions";
import { Button } from "@/ui/button/Button";
import { ConfirmDialog } from "@/ui/confirm-dialog/ConfirmDialog";
import type { ProjectStatus } from "@/domain/projects/status-transitions";
import { unsavedEditsReason } from "./unsaved-edits";

// 04-21(PROJ-04 · S7) — 상세 머리 줄의 「상태 바꾸기」. 갈 곳·막힘 이유는 서버가
// 판정해 보낸다(04-20 statusDestinations) — 이 파일은 그 결과를 그대로 그린다.
// 모든 고르기 목록·확인은 ui/confirm-dialog(DR-12).
export type StatusDestinationOption = {
  value: ProjectStatus;
  label: string;
  description: string | null;
  blockedReason: string | null;
};

export type StatusChangeProps = {
  projectId: string;
  projectNumber: string;
  /** `{번호} {프로젝트명}` — 확인 모달 부제. */
  projectLabel: string;
  /** 서버가 읽은 현재 상태 — 액션의 from(A-11). */
  from: ProjectStatus;
  destinations: StatusDestinationOption[];
  startDate: string | null;
  endDate: string | null;
  /** 종료일 + 1일(KST), 종료일이 없으면 null. */
  settleOn: string | null;
  /** 저장될 종료일(비면 시작일)이 오늘(KST)보다 이른가 — 서버 계산. */
  endDateBeforeToday: boolean;
  currentRevisionSeq: number;
  currentRevisionApproved: boolean;
};

type Step = { kind: "closed" } | { kind: "pick" } | { kind: "confirm"; to: ProjectStatus };

const REVERT_LABEL = "진행으로 되돌리기";

function approvalLine(props: StatusChangeProps): string[] {
  return props.currentRevisionApproved ? [] : [`${props.currentRevisionSeq}차 고객 승인 전 · 진행부터 지출결의 멈춤`];
}

// UI-SPEC rev 5 Copywriting 「확인 — 진행으로 바꾸기 · 진행으로 되돌리기」 — 해당하는 것만, 최대 셋.
function progressResultLines(props: StatusChangeProps): string[] {
  const lines: string[] = [];
  if (props.endDate === null) lines.push("종료일 없음 · 시작일로 저장");
  if (props.endDateBeforeToday) lines.push("종료일 지남 · 바로 정산");
  else if (props.endDate !== null) lines.push(`기간 ${props.startDate ?? ""} ~ ${props.endDate} · ${props.settleOn ?? ""} 정산`);
  return [...lines, ...approvalLine(props)];
}

function confirmCopy(props: StatusChangeProps, to: ProjectStatus): { label: string; resultLines: string[] } | null {
  if (to === "in_progress" && props.from === "lost") {
    const lines = props.endDateBeforeToday ? ["종료일 지남 · 바로 정산"] : [];
    return { label: REVERT_LABEL, resultLines: [...lines, ...approvalLine(props)] };
  }
  if (to === "in_progress") return { label: "진행으로 바꾸기", resultLines: progressResultLines(props) };
  if (to === "lost") {
    return { label: "미수주로 닫기", resultLines: ["쌓인 비용이 팀 미수주 비용이 됨 · 진행으로 되돌리기 있음"] };
  }
  if (to === "completed") {
    return { label: "완료로 바꾸기", resultLines: ["견적 줄 잠김 · 새 지출결의 받지 않음 · 되돌리기 없음"] };
  }
  return null;
}

export function StatusChange({
  dirtyCount,
  onChanged,
  ...props
}: StatusChangeProps & { dirtyCount: number; onChanged: (message: string) => void }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>({ kind: "closed" });
  const [rejection, setRejection] = useState<string | null>(null);
  // 같은 틱의 두 번째 제출(1차 dblclick)은 isExecuting이 아직 거짓인 렌더에서
  // 처리되므로 동기 래치로 막는다(A-34, quote-table.tsx의 savingRef와 같은 이유).
  const submittingRef = useRef(false);
  // 성공 토스트 = 누른 버튼 라벨 · 번호(DR-21) — 제출하는 순간의 라벨을 둔다.
  const submittedLabelRef = useRef("");
  // 전환 성공 뒤 새로 고침으로 이 컴포넌트(트리거)가 사라지면 포커스를 머리 줄 제목으로(S16).
  const succeededRef = useRef(false);
  useEffect(
    () => () => {
      if (succeededRef.current) document.querySelector<HTMLElement>("h1")?.focus();
    },
    [],
  );

  const { execute, isExecuting } = useAction(changeProjectStatusAction, {
    onSettled: () => {
      submittingRef.current = false;
    },
    onSuccess: () => {
      succeededRef.current = true;
      setStep({ kind: "closed" });
      onChanged(`${submittedLabelRef.current} · ${props.projectNumber}`);
      router.refresh();
    },
    onError: ({ error }) => {
      // 서버 문자열 그대로(게이트 이유 · 「상태가 … 바뀜 · 새로 고침」) — 모달은 열린 채, 토스트 없음.
      setRejection(error.serverError ?? null);
    },
  });

  function submit(to: ProjectStatus, label: string) {
    if (submittingRef.current) return;
    submittingRef.current = true;
    succeededRef.current = false;
    submittedLabelRef.current = label;
    execute({ projectId: props.projectId, from: props.from, to });
  }

  function openFor(to: ProjectStatus) {
    setRejection(null);
    setStep({ kind: "confirm", to });
  }

  // 미수주에서는 갈 곳이 진행 하나라 버튼이 곧 동작이다(DR-7) — 종료일이 지났거나 현재 차수가
  // 승인 전이면 확인 모달을 거치고, 아니면 즉시 전환한다(잃는 것이 없다, D-44).
  const reverting = props.from === "lost";
  const [only] = props.destinations;
  const revertNeedsConfirm = props.endDateBeforeToday || !props.currentRevisionApproved;
  const immediateBlockedReason = reverting && !revertNeedsConfirm ? (only?.blockedReason ?? null) : null;
  // DR-6 — 미저장 편집이 있으면 트리거 자체가 막힌다(고르기 목록·확인 모달이 열리지 않는다).
  // 트리거를 막는 이유가 시작일 게이트 이유보다 먼저다.
  const triggerBlockedReason =
    unsavedEditsReason(dirtyCount) ?? (step.kind === "closed" ? rejection : null) ?? immediateBlockedReason;

  function handleTrigger() {
    if (reverting && only && !revertNeedsConfirm) {
      setRejection(null);
      submit(only.value, REVERT_LABEL);
    } else if (props.destinations.length === 1 && only) openFor(only.value);
    else setStep({ kind: "pick" });
  }

  function closeConfirm() {
    setRejection(null);
    setStep((current) => (current.kind === "confirm" ? { kind: "closed" } : current));
  }

  const target = step.kind === "confirm" ? props.destinations.find((d) => d.value === step.to) : undefined;
  const copy = step.kind === "confirm" ? confirmCopy(props, step.to) : null;

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        onClick={handleTrigger}
        pending={reverting && step.kind === "closed" && isExecuting}
        disabled={triggerBlockedReason !== null}
        disabledReason={triggerBlockedReason ?? undefined}
      >
        {reverting ? REVERT_LABEL : "상태 바꾸기"}
      </Button>

      <ConfirmDialog
        open={step.kind === "pick"}
        onClose={() => setStep((current) => (current.kind === "pick" ? { kind: "closed" } : current))}
        title="상태 바꾸기"
        secondaryLabel="취소"
        options={props.destinations.map((destination) => ({
          label: destination.label,
          description: destination.description ?? undefined,
          onSelect: () => openFor(destination.value),
        }))}
      />

      <ConfirmDialog
        open={step.kind === "confirm" && copy !== null}
        onClose={closeConfirm}
        title={copy?.label ?? ""}
        subtitle={props.projectLabel}
        resultLines={copy?.resultLines}
        primary={{
          label: copy?.label ?? "",
          onConfirm: () => {
            if (step.kind === "confirm" && copy) submit(step.to, copy.label);
          },
          pending: isExecuting,
          disabledReason: rejection ?? target?.blockedReason ?? undefined,
        }}
      />
    </>
  );
}
