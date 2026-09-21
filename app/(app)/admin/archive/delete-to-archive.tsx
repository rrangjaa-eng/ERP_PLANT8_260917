"use client";

import { useState } from "react";
import { useAction } from "next-safe-action/hooks";
import { restoreArchivedAction } from "./actions";
import { Button } from "@/ui/button/Button";
import { Toast } from "@/ui/toast/Toast";
import styles from "./archive.module.css";

// 03-UI-SPEC.md § Copywriting Contract 「Destructive confirmation」 —
// 여섯 마스터 화면(코드표·사람·계급·본부·팀·법인카드·거래처)이 이 컴포넌트
// 하나를 공유한다(D-25 모달 컴포넌트 부재 — 두 단계 제출로 확인을 대신
// 한다). 붉은 버튼을 쓰지 않는다(§7-1 — 위험 행동은 색이 아니라 확인으로
// 구분한다). 사유 입력 없음(되돌릴 수 있는 행동이다).
export type DeleteToArchiveProps = {
  /** 확인 문구에 들어갈 대상 이름. */
  name: string;
  /** 실제 보관 호출 — 실패하면 이 Promise가 reject해야 한다. */
  onArchive: () => Promise<void>;
  /** 실패 시 보여줄 문구. 기본값은 일반 문구. */
  failureMessage?: string;
};

export function DeleteToArchive({ name, onArchive, failureMessage }: DeleteToArchiveProps) {
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!confirming) {
    return (
      <Button variant="tertiary" onClick={() => setConfirming(true)}>
        삭제
      </Button>
    );
  }

  async function handleConfirm() {
    setPending(true);
    setError(null);
    try {
      await onArchive();
      setConfirming(false);
    } catch {
      setError(failureMessage ?? "삭제하지 못했습니다 · 다시 시도");
    } finally {
      setPending(false);
    }
  }

  return (
    <span className={styles.confirmRow}>
      <span className={styles.confirmText}>{`${name} 삭제 · 보관함으로 이동합니다 · 관리자가 복원할 수 있습니다`}</span>
      <Button variant="primary" pending={pending} onClick={() => void handleConfirm()}>
        삭제
      </Button>
      <Button variant="secondary" onClick={() => setConfirming(false)}>
        취소
      </Button>
      {error ? <span className={styles.confirmError}>{error}</span> : null}
    </span>
  );
}

// 보관함 화면(page.tsx) 자신의 3차 「복원」 — 확인 없이 즉시 실행(비파괴적)
// 하고 결과 토스트를 낸다(03-UI-SPEC.md). delete-to-archive.tsx 파일 하나에
// 함께 둔 이유: 이 플랜의 <files> 목록이 archive 디렉터리에 이 파일 하나만
// 클라이언트 컴포넌트로 지정했고, filter-bar.tsx(Task 2)가 이미 같은
// 방식으로 여러 상호작용 컴포넌트를 한 파일에 모은 선례를 세웠다.
export function RestoreButton({ entity, id, name }: { entity: string; id: string; name: string }) {
  const [toast, setToast] = useState<{ message: string; tone: "default" | "error" } | null>(null);
  const { execute, isExecuting } = useAction(restoreArchivedAction, {
    onSuccess: () => setToast({ message: `복원 · ${name} 복원됨`, tone: "default" }),
    onError: () => setToast({ message: "복원 · 실패 · 다시 시도", tone: "error" }),
  });

  return (
    <>
      <Button variant="tertiary" pending={isExecuting} onClick={() => execute({ entity, id })}>
        복원
      </Button>
      {toast ? <Toast message={toast.message} tone={toast.tone} onDismiss={() => setToast(null)} /> : null}
    </>
  );
}
