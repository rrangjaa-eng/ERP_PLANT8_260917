"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { changeProjectStatusAction } from "../actions";
import { Button } from "@/ui/button/Button";
import { ConfirmDialog } from "@/ui/confirm-dialog/ConfirmDialog";
import type { ProjectStatus } from "@/domain/projects/status-transitions";

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

function progressResultLines(props: StatusChangeProps): string[] {
  const lines: string[] = [];
  if (props.endDate === null) lines.push("종료일 없음 · 시작일로 저장");
  if (props.endDateBeforeToday) lines.push("종료일 지남 · 바로 정산");
  else if (props.endDate !== null) lines.push(`기간 ${props.startDate ?? ""} ~ ${props.endDate} · ${props.settleOn ?? ""} 정산`);
  if (!props.currentRevisionApproved) {
    lines.push(`${props.currentRevisionSeq}차 고객 승인 전 · 진행부터 지출결의 멈춤`);
  }
  return lines;
}

function confirmCopy(props: StatusChangeProps, to: ProjectStatus): { label: string; resultLines: string[] } | null {
  if (to === "in_progress") return { label: "진행으로 바꾸기", resultLines: progressResultLines(props) };
  return null;
}

export function StatusChange({ onChanged, ...props }: StatusChangeProps & { onChanged: (message: string) => void }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>({ kind: "closed" });
  const [rejection, setRejection] = useState<string | null>(null);
  // 같은 틱의 두 번째 제출(1차 dblclick)은 isExecuting이 아직 거짓인 렌더에서
  // 처리되므로 동기 래치로 막는다(A-34, quote-table.tsx의 savingRef와 같은 이유).
  const submittingRef = useRef(false);
  // 성공 토스트 = 누른 버튼 라벨 · 번호(DR-21) — 제출하는 순간의 라벨을 둔다.
  const submittedLabelRef = useRef("");

  const { execute, isExecuting } = useAction(changeProjectStatusAction, {
    onSettled: () => {
      submittingRef.current = false;
    },
    onSuccess: () => {
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
    submittedLabelRef.current = label;
    execute({ projectId: props.projectId, from: props.from, to });
  }

  function openFor(to: ProjectStatus) {
    setRejection(null);
    setStep({ kind: "confirm", to });
  }

  function handleTrigger() {
    const [only] = props.destinations;
    if (props.destinations.length === 1 && only) openFor(only.value);
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
      <Button type="button" variant="secondary" onClick={handleTrigger}>
        상태 바꾸기
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
