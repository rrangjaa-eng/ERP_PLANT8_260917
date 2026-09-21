"use client";

import { useState } from "react";
import { Button } from "@/ui/button/Button";
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

// 보관함 화면(page.tsx) 자신의 3차 「복원」은 ./archive-table.tsx가 담당한다
// — 그 파일의 머리 주석 참고: 복원 성공 토스트는 행이 사라지는 재렌더보다
// 오래 살아남아야 해서 토스트 상태를 표 전체로 끌어올린 클라이언트
// 컴포넌트가 필요했다(이 파일의 행 단위 컴포넌트로는 불가능한 요구).
