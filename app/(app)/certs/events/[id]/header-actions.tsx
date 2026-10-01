"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/ui/button/Button";
import { ConfirmDialog } from "@/ui/confirm-dialog/ConfirmDialog";
import { Toast } from "@/ui/toast/Toast";
import { cancelCertRequestAction, closeCertEventAction } from "../actions";
import { FORBIDDEN_SERVER_ERROR } from "./prize-table-rules";
import styles from "./event-detail.module.css";

// 04.3-17 — I′3 머리 2차(UI-SPEC I′3 「링크 닫기」 · 「신청 취소」). 둘 다 서버가 보낸 판정(canClose · cancelRole)일 때만 선다.
// 「링크 닫기」: 공용 확인 부품(§7-17) — 다시 보내면 되는 실패는 모달 안 1차 왼쪽 줄(`primary.failure`), 1차는 막지 않는다.
// 확정된 거부(권한 — 화면을 연 뒤 빠짐)는 막힘 자리(`disabledReason`)라 다시 열 때까지 1차를 막는다(검토 X3).
// 「신청 취소」: 저장된 경품 줄이 0일 때만 켜지고 확인 없이 지운다(N4 a) — 1 이상이면 비활성 + 이유(경영관리 · 신청자 문장 둘).

// 실패 문장은 명사형(사용자 결정 A 2026-09-26 · error-copy-noun-style — UI-SPEC 「닫지 못했습니다」를 옮김, /design-review 확인).
const CLOSE_FAILED = "링크 닫기 실패 · 다시 시도";
// 결과 불명 — 신청 · 생성 · 저장과 같은 명사형(04.3-10 선례).
const CANCEL_UNKNOWN = "신청 취소 결과 모름 · 다시 누르기";
// 확정된 거부(ForbiddenError — serverError로 온다) — 다시 눌러도 같은 답이라 「다시 시도」 · 「결과 모름」이 아니다(검토 X3).
const CLOSE_DENIED = "링크 닫기 실패 · 권한 없음";
const CANCEL_DENIED = "신청 취소 실패 · 권한 없음";

type CloseResponse = Awaited<ReturnType<typeof closeCertEventAction>> | undefined;
type CancelResponse = Awaited<ReturnType<typeof cancelCertRequestAction>> | undefined;

export function HeaderActions(props: {
  eventId: string;
  eventName: string;
  submittedCount: number;
  canClose: boolean;
  cancelRole: "manager" | "applicant" | null;
  prizeCount: number;
}) {
  const router = useRouter();
  const [closeOpen, setCloseOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [closeFailure, setCloseFailure] = useState<{ text: string; rejected: boolean } | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [toast, setToast] = useState<{ message: string; tone: "default" | "error" } | null>(null);
  // 닫힌 뒤 머리 「링크 닫기」가 사라진다 — 새 화면이 그려진 뒤 화면 제목으로 포커스(§7-17 · DOM 감사 C-M2). refresh 전에
  // 옮기면 확인 부품이 사라질 트리거로 돌려 놓은 포커스가 body로 떨어진다.
  const [refreshing, startRefresh] = useTransition();
  const focusTitleRef = useRef(false);
  useEffect(() => {
    if (!focusTitleRef.current || refreshing) return;
    focusTitleRef.current = false;
    document.querySelector<HTMLElement>("h1")?.focus();
  }, [refreshing]);

  async function confirmClose() {
    if (closing) return;
    setClosing(true);
    setCloseFailure(null);
    let response: CloseResponse;
    try {
      response = await closeCertEventAction({ eventId: props.eventId });
    } catch {
      response = undefined;
    }
    setClosing(false);
    const data = response?.data;
    if (data?.kind === "closed") {
      setCloseOpen(false);
      setToast({ message: `링크 닫기 · 제출 ${data.submitted}건`, tone: "default" });
      focusTitleRef.current = true;
      startRefresh(() => router.refresh());
      return;
    }
    if (data?.kind === "alreadyClosed" || data?.kind === "notFound") {
      // 그새 닫혔거나(다른 사람 · 마감) 없어졌다 — 문장 없이 지금 상태로 다시 그린다.
      setCloseOpen(false);
      router.refresh();
      return;
    }
    if (response?.serverError === FORBIDDEN_SERVER_ERROR) {
      setCloseFailure({ text: CLOSE_DENIED, rejected: true });
      return;
    }
    setCloseFailure({ text: CLOSE_FAILED, rejected: false });
  }

  async function cancelRequest() {
    if (cancelling) return;
    setCancelling(true);
    let response: CancelResponse;
    try {
      response = await cancelCertRequestAction({ eventId: props.eventId });
    } catch {
      response = undefined;
    }
    const data = response?.data;
    if (data?.kind === "cancelled") {
      // 목록이 토스트를 띄운다(화면 이동이 따르는 행동 — §7-6). 이름은 주소가 아니라 액션이 남긴 한 번 쓰는 httpOnly 쿠키로
      // 넘긴다 — 서버가 아는 사실만 토스트가 된다(검토 X4 · 사용자 결정 PR #88 5934173511).
      router.push("/certs/events");
      return;
    }
    setCancelling(false);
    if (data?.kind === "hasPrizes" || data?.kind === "notFound") {
      router.refresh();
      return;
    }
    if (response?.serverError === FORBIDDEN_SERVER_ERROR) {
      setToast({ message: CANCEL_DENIED, tone: "error" });
      router.refresh();
      return;
    }
    setToast({ message: CANCEL_UNKNOWN, tone: "error" });
  }

  const cancelBlocked =
    props.prizeCount > 0
      ? props.cancelRole === "manager"
        ? `경품 ${props.prizeCount}줄 있음 · 경품 줄 지운 뒤 취소`
        : `경품 ${props.prizeCount}줄 있음 · 취소는 경영관리`
      : undefined;

  return (
    <>
      {props.canClose || props.cancelRole ? (
        <div className={styles.headerActions}>
          {props.canClose ? (
            <Button
              variant="secondary"
              onClick={() => {
                setCloseFailure(null);
                setCloseOpen(true);
              }}
            >
              링크 닫기
            </Button>
          ) : null}
          {props.cancelRole ? (
            <Button
              variant="secondary"
              pending={cancelling}
              disabled={cancelBlocked !== undefined}
              disabledReason={cancelBlocked}
              onClick={() => void cancelRequest()}
            >
              신청 취소
            </Button>
          ) : null}
        </div>
      ) : null}
      {props.canClose ? (
        <ConfirmDialog
          open={closeOpen}
          onClose={() => setCloseOpen(false)}
          title="링크 닫기"
          subtitle={`${props.eventName} · 제출 ${props.submittedCount}건`}
          resultLines={["더 제출할 수 없습니다 · 다시 열 수 없습니다"]}
          primary={{
            label: "링크 닫기",
            pending: closing,
            onConfirm: () => void confirmClose(),
            ...(closeFailure ? (closeFailure.rejected ? { disabledReason: closeFailure.text } : { failure: closeFailure.text }) : {}),
          }}
        />
      ) : null}
      {toast ? <Toast message={toast.message} tone={toast.tone} onDismiss={() => setToast(null)} /> : null}
    </>
  );
}
