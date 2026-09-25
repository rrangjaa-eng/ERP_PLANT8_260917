"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { createRevisionAction } from "../actions";
import { Button } from "@/ui/button/Button";
import { ConfirmDialog } from "@/ui/confirm-dialog/ConfirmDialog";
import { unsavedEditsReason } from "./unsaved-edits";

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
