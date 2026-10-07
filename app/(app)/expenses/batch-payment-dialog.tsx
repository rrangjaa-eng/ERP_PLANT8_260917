"use client";

import { useId, useState } from "react";
import { ConfirmDialog } from "@/ui/confirm-dialog/ConfirmDialog";
import { Form } from "@/ui/form/Form";
import { isCalendarDate } from "@/lib/dates";
import styles from "./expenses.module.css";

// 06-15(UI-SPEC S2 · Copywriting 「Destructive — 일괄 지급 완료」): 일괄 지급 확인 모달 — 제목 `지급 완료` · 부제 `N건` · 결과 줄
// ① 견적 줄 잠김 ② 선결제 증빙 기한 · 확인 근거 한 칸 `지급일`(기본 오늘 KST · 미래 허용 — Q6, 고른 건 전부 같은 날 — O-3).
// 날짜 판정은 05 isCalendarDate, 글자는 05 DATE_FORMAT_ERROR 그대로(서버 page가 dateError로 넘긴다 — draft-fields는 서버 모듈을 끌어와 클라이언트 번들에 못 든다)
// — 서버 zod와 같은 둘이라 화면과 서버가 같은 날짜를 거른다(E-20).
// 응답이 없으면 모달을 닫지 않고 막힘 자리 `결과를 받지 못함 · 새로 고침`. 토스트 없음(C12). 이체액 합계 부제 · `다른 쪽` 줄은 06-17.
export function BatchPaymentDialog({
  open,
  onClose,
  count,
  lineCount,
  prepaidCount,
  prepaidDueDays,
  today,
  pending,
  rejection,
  dateError,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  count: number;
  lineCount: number;
  prepaidCount: number;
  prepaidDueDays: number;
  today: string;
  pending: boolean;
  rejection: string | null;
  dateError: string;
  onConfirm: (payDate: string) => void;
}) {
  const fieldId = useId();
  const errorId = `${fieldId}-error`;
  const [payDate, setPayDate] = useState(today);
  const invalid = !isCalendarDate(payDate);
  const resultLines = [
    lineCount > 0 ? `견적 줄 ${lineCount}줄 잠김` : null,
    prepaidCount > 0 ? `선결제 ${prepaidCount}건 · 증빙 기한 지급일부터 ${prepaidDueDays}일` : null,
  ].filter((line): line is string => line !== null);

  return (
    <ConfirmDialog
      open={open}
      onClose={onClose}
      title="지급 완료"
      subtitle={`${count}건`}
      resultLines={resultLines}
      evidenceField={
        <Form.Field id={fieldId} label="지급일" width="short">
          <input
            id={fieldId}
            type="date"
            autoComplete="off"
            value={payDate}
            aria-invalid={invalid ? "true" : undefined}
            aria-describedby={invalid ? errorId : undefined}
            className={styles.dateInput}
            onChange={(event) => setPayDate(event.target.value)}
          />
          {invalid ? <Form.Error id={errorId}>{dateError}</Form.Error> : null}
        </Form.Field>
      }
      primary={{
        label: `지급 완료 ${count}건`,
        shortcut: "Ctrl+Enter",
        pending,
        onConfirm: () => {
          if (!invalid) onConfirm(payDate);
        },
        disabledReason: invalid ? undefined : (rejection ?? undefined),
        blockedBy: invalid ? errorId : undefined,
      }}
    />
  );
}
