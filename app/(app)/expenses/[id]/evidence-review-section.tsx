"use client";

import type { ReactNode } from "react";
import { KvList, type KvItem } from "@/ui/kv-list/KvList";
import { Num } from "@/ui/num/Num";
import { StatusTag } from "@/ui/status-tag/StatusTag";
import { usePaymentPanel } from "./payment-section";
import styles from "./expense.module.css";

// 06-06(UI-SPEC S4 · D-601 · D-602 · O-2): 결재 통과 문서의 「증빙」 섹션 확인부 — 05 첨부 영역 아래 `증빙 금액` · `확인` 두 행.
// 값은 서버 DTO(getPaymentView)만 그린다 — 상태 낱말은 resolveEvidenceStatus, 1차 `증빙 확인`은 행동 줄(payment-action-row.tsx)이 서버 행으로 세운다.
// 금액 칸 · 정보 항목이 안 보이면(project가 칸을 뺀다) 그 행을 그리지 않는다.

export function EvidenceReviewBlock() {
  const { view } = usePaymentPanel();
  const dash = <span className={styles.muted}>—</span>;
  const items: KvItem[] = [];

  const amount = view.evidenceAmountDisplay;
  if (amount !== undefined) {
    items.push({
      label: "증빙 금액",
      value:
        amount.valueKrw === null ? (
          dash
        ) : (
          <>
            <Num value={amount.valueKrw} />
            {amount.enteredByName ? (
              <span className={`${styles.subLine} ${styles.muted}`} data-testid="evidence-amount-by">
                {[amount.enteredByName, amount.enteredAt].filter(Boolean).join(" ")}
              </span>
            ) : null}
          </>
        ),
    });
  }

  const status = view.evidenceStatus;
  if (status !== undefined) {
    // 증빙 필수 off의 증빙 없음은 상태 낱말이 아니라 빈 값 `—`(UI-SPEC rev 10).
    const word = status === "증빙 없음" && view.evidenceRequired === false ? null : status;
    const review = view.reviewLine ?? null;
    const amounts = view.reviewAmounts ?? null;
    let second: ReactNode = null;
    if (status === "확인됨" && review) {
      second = (
        <>
          {`${review.byName} ${review.at}`}
          {amounts ? (
            <>
              {" · "}
              <span className={styles.taxSegment}>
                <Num value={amounts.beforeKrw} /> → <Num value={amounts.afterKrw} />
              </span>
            </>
          ) : null}
        </>
      );
    } else if (status === "면제" && review) {
      second = [`${review.byName} ${review.at.slice(0, 5)}`, review.waiveReason].filter(Boolean).join(" · ");
    } else if (status === "확인 전" && view.row?.primary !== "confirm") {
      // 지급 권한 없는 사람 — 버튼 대신 담당 표기(D-601).
      second = "확인은 경영관리";
    }
    items.push({
      label: "확인",
      value: (
        <>
          {word ? <StatusTag status={word} variant="text" /> : dash}
          {second ? (
            <span className={`${styles.subLine} ${styles.muted}`} data-testid="evidence-review-line">
              {second}
            </span>
          ) : null}
        </>
      ),
    });
  }

  if (items.length === 0) return null;
  return (
    <div data-testid="evidence-review">
      <KvList items={items} />
    </div>
  );
}
