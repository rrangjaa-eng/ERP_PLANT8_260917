"use client";

import { useEffect, useRef, useState } from "react";
import { useAction } from "next-safe-action/hooks";
import { ConfirmDialog } from "@/ui/confirm-dialog/ConfirmDialog";
import { Attachments, type AttachmentActions } from "@/ui/attachments/Attachments";
import { Button } from "@/ui/button/Button";
import type { ConfirmEvidenceResult } from "@/domain/evidence-reviews";
import type { EvidenceConfirmView } from "@/domain/payments/targets";
import { CONFIRM_SUPPLY_SAME } from "@/domain/payments/action-row";
import { EVIDENCE_UPLOAD_FAILED } from "@/domain/evidence/upload-checks";
import { createEvidenceViewUrlAction, getEvidenceConfirmViewAction } from "./actions";
import { confirmEvidenceAction } from "./[id]/actions";
import { TaxParts } from "./[id]/tax-parts";
import { formatForeignAmount, formatKrw } from "@/lib/format-number";

// 06-17(UI-SPEC S1 「제자리 증빙 확인」 · DR-4 · r2 B-1): 목록을 떠나지 않는 증빙 확인 — 06-29 ConfirmDialog(SP-7 첨부 보기 칸 · loading ·
// refreshKeepsOpen)에 서버 보기(getEvidenceConfirmViewAction)를 그린다. 확인은 06-06 confirmEvidenceAction(금액 없는 갈래)을 보기의
// version + evidenceStamp로 부른다 — 모달을 연 뒤 증빙이 바뀌면 서버가 거부하고, 보지 않은 증빙이 「확인됨」이 되지 않는다.
// 06-20 S3이 같은 컴포넌트를 쓴다(이름 있는 export). 행 version이 바뀌면(목록 새로 고침) 보기를 다시 받아 새 파일 · 새 지문으로 다시 선다.
// 06.5 D-6520(UI-SPEC V8 S1): 금액은 공급가액 하나 — 증빙 금액 · Q-F 넘침 줄을 그리지 않고 1차는 `공급가액과 같음`(고침 칸 없음).

const LOAD_FAILED = "증빙 불러오지 못함";

// 보기 전용 — 올리기 · 지우기 없음, `크게 보기`만 05 보기 주소 액션을 쓴다.
const READ_ONLY_ACTIONS: AttachmentActions = {
  request: () => Promise.resolve({ ok: false, message: EVIDENCE_UPLOAD_FAILED }),
  complete: () => Promise.resolve({ ok: false, message: EVIDENCE_UPLOAD_FAILED, retry: "restart" }),
  remove: () => Promise.resolve(false),
  viewUrl: async (fileId) => (await createEvidenceViewUrlAction({ fileId }))?.data?.url ?? null,
};

type Loaded = { key: string } & ({ view: Partial<EvidenceConfirmView> } | { failed: true } | { refused: string });

export function EvidenceConfirmDialog(props: {
  open: boolean;
  expenseId: string | null;
  // 목록 행이 가진 version — 보기의 지금 version과 다르면 서버가 동시성 이유를 싣는다.
  rowVersion: number;
  onClose: () => void;
  onConfirmed: (result: ConfirmEvidenceResult) => void;
}) {
  const { open, expenseId, rowVersion, onConfirmed } = props;
  const [loadTick, setLoadTick] = useState(0);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [rejection, setRejection] = useState<string | null>(null);
  const key = `${expenseId ?? ""}#${rowVersion}#${loadTick}`;
  const keyRef = useRef(key);
  useEffect(() => {
    keyRef.current = key;
  });

  useEffect(() => {
    if (!open || !expenseId) return;
    const forKey = key;
    getEvidenceConfirmViewAction({ expenseId, rowVersion }).then(
      (result) => {
        if (forKey !== keyRef.current) return;
        setRejection(null);
        if (result?.data) setLoaded({ key: forKey, view: result.data });
        else if (result?.serverError) setLoaded({ key: forKey, refused: result.serverError });
        else setLoaded({ key: forKey, failed: true });
      },
      () => {
        if (forKey === keyRef.current) setLoaded({ key: forKey, failed: true });
      },
    );
    // 열쇠(문서 · 행 version · 다시 시도)가 바뀔 때만 받는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, key]);

  const current = loaded?.key === key ? loaded : null;
  const view = current && "view" in current ? current.view : null;
  const failed = current !== null && "failed" in current;
  const refused = current && "refused" in current ? current.refused : null;

  const { execute, isExecuting } = useAction(confirmEvidenceAction, {
    onSuccess: ({ data }) => {
      if (data) onConfirmed(data);
      else setRejection(LOAD_FAILED);
    },
    onError: ({ error }) => setRejection(error.serverError ?? LOAD_FAILED),
  });

  // UI-SPEC V8 S1 — 부제 끝 `공급가액 {금액}`(문서 통화 · 영수증과 대조하는 값).
  const supplyText = view?.supply ? (view.supply.currency === "KRW" ? formatKrw(view.supply.amount) : `${view.supply.currency} ${formatForeignAmount(view.supply.amount)}`) : null;
  const subtitle = view ? [view.number, view.title, supplyText && `공급가액 ${supplyText}`].filter(Boolean).join(" · ") : undefined;
  const resultLines = view
    ? [
        view.taxLine ? (
          <span key="tax" data-testid="evidence-confirm-tax-line">
            <TaxParts parts={view.taxLine} />
          </span>
        ) : null,
      ].filter((line) => line !== null)
    : undefined;

  const disabledReason = rejection ?? refused ?? (failed ? LOAD_FAILED : (view?.conflict ?? undefined));

  return (
    <ConfirmDialog
      open={open}
      onClose={() => {
        if (isExecuting) return;
        setRejection(null);
        props.onClose();
      }}
      title="증빙 확인"
      subtitle={subtitle}
      loading={open && current === null}
      refreshKeepsOpen
      attachments={
        view?.files ? (
          <Attachments mode="read" files={view.files} actions={READ_ONLY_ACTIONS} maxMb={0} uploadFailedText={EVIDENCE_UPLOAD_FAILED} canAdd={false} deletableIds={[]} />
        ) : undefined
      }
      resultLines={resultLines}
      primary={{
        label: CONFIRM_SUPPLY_SAME,
        shortcut: "Ctrl+Enter",
        pending: isExecuting,
        ...(disabledReason ? { disabledReason } : {}),
        ...(failed && !rejection
          ? {
              nextStep: (
                <Button variant="secondary" onClick={() => setLoadTick((tick) => tick + 1)}>
                  다시 시도
                </Button>
              ),
            }
          : {}),
        onConfirm: () => {
          if (!view?.expenseId || typeof view.version !== "number" || isExecuting) return;
          setRejection(null);
          execute({ expenseId: view.expenseId, version: view.version, ...(view.evidenceStamp ? { evidenceStamp: view.evidenceStamp } : {}) });
        },
      }}
    />
  );
}
