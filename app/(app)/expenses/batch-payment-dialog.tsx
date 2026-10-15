"use client";

import { useId } from "react";
import { ConfirmDialog } from "@/ui/confirm-dialog/ConfirmDialog";
import { Button } from "@/ui/button/Button";
import { Form } from "@/ui/form/Form";
import { isCalendarDate } from "@/lib/dates";
import { formatKrw } from "@/lib/format-number";
import styles from "./expenses.module.css";

// 06-15(UI-SPEC S2 · Copywriting 「Destructive — 일괄 지급 완료」): 일괄 지급 확인 모달 — 제목 `지급 완료` · 부제 `N건` · 결과 줄
// ① 견적 줄 잠김 ② 선결제 증빙 기한 · 확인 근거 한 칸 `지급일`(기본 오늘 KST · 미래 허용 — Q6, 고른 건 전부 같은 날 — O-3).
// 날짜 판정은 05 isCalendarDate, 글자는 05 DATE_FORMAT_ERROR 그대로(서버 page가 dateError로 넘긴다 — draft-fields는 서버 모듈을 끌어와 클라이언트 번들에 못 든다)
// — 서버 zod와 같은 둘이라 화면과 서버가 같은 날짜를 거른다(E-20).
// O-3(확정 U-6): 지급일은 모달 밖 한 곳(화면 상태 + 아래 기억)에 둔다 — 다시 열면 방금 고른 날, 같은 필터에서 쪽을 넘겨도(화면이 다시 마운트돼도)
// 남고, 필터를 바꾸면(다른 키) · 새로 고치면(모듈 상태가 비므로) 오늘로 돌아간다.
let remembered: { key: string; payDate: string } | null = null;

export function rememberedPayDate(key: string, today: string): string {
  return remembered?.key === key ? remembered.payDate : today;
}

export function rememberPayDate(key: string, payDate: string): void {
  remembered = { key, payDate };
}

// 응답이 없으면 모달을 닫지 않고 막힘 자리 `결과를 받지 못함 · 새로 고침`. 토스트 없음(C12).
// 06-17: 부제 `N건 · 이체액 합계 {합}` — 합은 모달을 연 순간 합계 번호의 서버 합(totalKrw). 아직이면 `…` + 1차 막힘(Ctrl+Enter 무반응),
// 합 요청이 실패하면 「거부 — 이체액 합계 응답 없음」 `합계를 받지 못함` + 2차 `다시 시도`(같은 합계 번호).
export function BatchPaymentDialog({
  open,
  onClose,
  count,
  totalKrw,
  sumFailed,
  onRetrySum,
  lineCount,
  subtotalLines,
  prepaidCount,
  prepaidDueDays,
  otherPageCount,
  diffCount,
  payDate,
  onPayDateChange,
  pending,
  rejection,
  dateError,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  count: number;
  // undefined = 그 번호의 합이 아직 오지 않음 · null = 금액을 볼 수 없음.
  totalKrw: number | null | undefined;
  sumFailed: boolean;
  onRetrySum: () => void;
  lineCount: number;
  // 06.5-06(V14 · SP-65-7): 2건 이상 지급처의 소계 행(`{지급처} {합} · {n}건`) — 결과 줄이 아니라 소계 칸. 없으면 칸 DOM 0.
  subtotalLines: string[];
  prepaidCount: number;
  prepaidDueDays: number;
  // H-5 결과 줄 ③ — 지금 쪽 밖에서 고른 건수 · 차이 2행이 선 고른 행 수(둘 다 개수라 화면이 센다).
  otherPageCount: number;
  diffCount: number;
  payDate: string;
  onPayDateChange: (payDate: string) => void;
  pending: boolean;
  rejection: string | null;
  dateError: string;
  onConfirm: (payDate: string) => void;
}) {
  const fieldId = useId();
  const errorId = `${fieldId}-error`;
  const invalid = !isCalendarDate(payDate);
  const resultLines = [
    lineCount > 0 ? `견적 줄 ${lineCount}줄 잠김` : null,
    prepaidCount > 0 ? `선결제 ${prepaidCount}건 · 증빙 기한 지급일부터 ${prepaidDueDays}일` : null,
    [otherPageCount > 0 ? `다른 쪽 ${otherPageCount}건 포함` : null, diffCount > 0 ? `차이 있음 ${diffCount}건` : null].filter(Boolean).join(" · ") || null,
  ].filter((line): line is string => line !== null);

  return (
    <ConfirmDialog
      open={open}
      onClose={onClose}
      title="지급 완료"
      subtitle={totalKrw === null ? `${count}건` : `${count}건 · 이체액 합계 ${totalKrw === undefined ? "…" : formatKrw(totalKrw)}`}
      resultLines={resultLines}
      subtotals={subtotalLines.length > 0 ? { label: "지급처 소계", lines: subtotalLines } : undefined}
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
            onChange={(event) => onPayDateChange(event.target.value)}
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
        ...(sumFailed
          ? {
              disabledReason: "합계를 받지 못함",
              nextStep: (
                <Button variant="secondary" onClick={onRetrySum}>
                  다시 시도
                </Button>
              ),
            }
          : totalKrw === undefined
            ? { disabledReason: "…", reasonTone: "info" as const }
            : { disabledReason: invalid ? undefined : (rejection ?? undefined) }),
        blockedBy: invalid ? errorId : undefined,
      }}
    />
  );
}
