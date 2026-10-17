"use client";

import { useId, useRef, useState } from "react";
import { formatKrw } from "@/lib/format-number";
import { ConfirmDialog } from "@/ui/confirm-dialog/ConfirmDialog";
import dialogStyles from "@/app/(app)/approvals/decision-dialogs.module.css";
import { detachEvidenceRecordAction, previewDetachAction } from "./attach/actions";

// 06.1-06 S7: 증빙 떼기(반려 · 회수) · 증빙 무효 처리(승인 뒤) — 공용 ConfirmDialog(사유 슬롯). 05 무효 처리 창과 같은 모양이고(사유 textarea ·
// 빈 칸이면 1차 막힘), 결과 줄은 떼면 비용 기준이 확정 → 예상으로 바뀔 때만 한 줄(PA-PREVIEW — 서버 previewDetach). 성공하면 부르는 쪽이
// router.refresh() — 그 행이 제자리에서 사라진다(토스트 없음).
// D-5 — 창은 미리 보기를 받은 뒤에 연다(§7-17 LOADING 「해당 없음 — 이미 로드된 데이터로 연다」). 받는 동안은 부르는 쪽 트리거가 `…`다.

export type DetachTarget = { linkId: string; subtitle: string; mode: "detach" | "void"; expectedKrw: number | null };

/** 떼면 비용 기준이 예상으로 바뀔 때의 예상 금액(아니면 null). 미리 보기를 받지 못하면 결과 줄 없이 연다(전과 같다). */
export async function previewExpectedKrw(linkId: string): Promise<number | null> {
  try {
    const data = (await previewDetachAction({ linkId }))?.data;
    return data?.result === "expected" && typeof data.amountKrw === "number" ? data.amountKrw : null;
  } catch {
    return null;
  }
}

const COPY = {
  detachTitle: "증빙 떼기",
  voidTitle: "증빙 무효 처리",
  detach: "증빙 떼기",
  void: "무효 처리",
  reason: "사유",
  reasonEmpty: "사유 없음 · 사유 적기",
  failed: "떼지 못함 · 다시 시도",
} as const;

export function DetachDialog({ target, onClose, onDone }: { target: DetachTarget | null; onClose: () => void; onDone: () => void }) {
  const fieldId = useId();
  const [reason, setReason] = useState("");
  const [serverError, setServerError] = useState<string | null>(null);
  const [failureLine, setFailureLine] = useState<string | undefined>(undefined);
  const [pending, setPending] = useState(false);
  const submittingRef = useRef(false);
  const expected = target?.expectedKrw ?? null;

  function close() {
    setReason("");
    setServerError(null);
    setFailureLine(undefined);
    onClose();
  }

  const trimmed = reason.trim();
  const blocked = serverError ?? (trimmed.length === 0 ? COPY.reasonEmpty : undefined);

  // 서버 거부(결재 중 잠김 · 권한)는 막힘 자리, 응답이 없으면 다시 보내면 되는 실패 한 줄 — 창은 닫히지 않고 사유는 남는다.
  async function confirm() {
    if (!target || submittingRef.current || blocked) return;
    submittingRef.current = true;
    setPending(true);
    setFailureLine(undefined);
    let response: Awaited<ReturnType<typeof detachEvidenceRecordAction>> | undefined;
    try {
      response = await detachEvidenceRecordAction({ linkId: target.linkId, reason: trimmed });
    } catch {
      response = undefined;
    }
    submittingRef.current = false;
    setPending(false);
    if (response?.data) {
      close();
      onDone();
      return;
    }
    if (response?.serverError) setServerError(response.serverError);
    else setFailureLine(COPY.failed);
  }

  const isVoid = target?.mode === "void";
  return (
    <ConfirmDialog
      open={target !== null}
      onClose={close}
      title={isVoid ? COPY.voidTitle : COPY.detachTitle}
      subtitle={target?.subtitle}
      resultLines={expected !== null ? [`비용이 예상 ${formatKrw(expected)}으로`] : []}
      evidenceField={
        <div className={dialogStyles.reason}>
          <label htmlFor={fieldId}>{COPY.reason}</label>
          <textarea
            id={fieldId}
            rows={2}
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
      primary={{ label: isVoid ? COPY.void : COPY.detach, pending, onConfirm: () => void confirm(), disabledReason: blocked, failure: failureLine }}
    />
  );
}
