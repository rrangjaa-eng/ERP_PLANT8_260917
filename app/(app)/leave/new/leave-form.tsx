"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAction } from "next-safe-action/hooks";
import { Form } from "@/ui/form/Form";
import { Select } from "@/ui/select/Select";
import { Button, buttonLinkClassName } from "@/ui/button/Button";
import { Toast } from "@/ui/toast/Toast";
import { DEFAULT_HALF_PERIOD, LEAVE_KINDS, HALF_PERIODS, type LeaveFieldError } from "@/domain/leave/days";
import { HALF_LABELS, LEAVE_KIND_LABELS } from "../labels";
import { resubmitLeaveAction, submitLeaveAction } from "../actions";
import styles from "../leave.module.css";

// 04.1-02 S2 첫 형태 — 종류 · 날짜(종일·재택은 시작·종료, 반차·반반차는 하루 + 오전/오후) · 비고.
// 잔고 행 · 결재선 한 줄 · Ctrl+Enter · 입력 버리기 확인은 04.1-06이 더한다. 칸 오류는 서버가 돌려준
// 칸별 문구를 칸 아래 한 줄로(입력값은 비제어 칸이라 그대로 남는다).
const KIND_OPTIONS = LEAVE_KINDS.map((kind) => ({ value: kind, label: LEAVE_KIND_LABELS[kind] ?? kind }));
const HALF_OPTIONS = HALF_PERIODS.map((half) => ({ value: half, label: HALF_LABELS[half] ?? half }));

function fieldValue(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

// 04.1-05(S3 반려된 내 문서): 다시 신청 모드 — 값이 채워진 같은 폼(두 벌을 만들지 않는다). 번호는 그대로,
// 1차 라벨 `연차 다시 신청`, 액션 resubmitLeaveAction. 토스트는 문서 화면(호출부)이 띄운다 — 성공하면 같은
// 화면이 다시 그려져 폼이 사라지기 때문이다.
export type LeaveFormResubmit = {
  leaveId: string;
  expectedVersion: number;
  initial: { kind: string; startDate: string; endDate: string; half: string | null; note: string | null };
  onResubmitted: (toast: string) => void;
};

export function LeaveForm({ resubmit }: { resubmit?: LeaveFormResubmit } = {}) {
  const router = useRouter();
  const [kind, setKind] = useState<string>(resubmit?.initial.kind ?? "full_day");
  const [half, setHalf] = useState<string>(resubmit?.initial.half ?? DEFAULT_HALF_PERIOD);
  const [toast, setToast] = useState<string | null>(null);
  const submitted = useAction(submitLeaveAction, {
    onSuccess: ({ data }) => {
      if (!data || !("result" in data)) return;
      const names = data.result.nextHolderNames;
      setToast(names ? `연차 신청 · 결재 요청됨 → ${names}` : "연차 신청 · 결재 요청됨");
      router.push(`/leave/${data.result.documentId}`);
    },
  });
  const resubmitted = useAction(resubmitLeaveAction, {
    onSuccess: ({ data }) => {
      if (!data || !("result" in data)) return;
      const names = data.result.nextHolderNames;
      resubmit?.onResubmitted(names ? `연차 다시 신청 · 결재 요청됨 → ${names}` : "연차 다시 신청 · 결재 요청됨");
      router.refresh();
    },
  });
  const { result, isExecuting } = resubmit ? resubmitted : submitted;

  const singleDay = kind === "half_day" || kind === "quarter_day";
  const fieldErrors: LeaveFieldError[] = result.data && "rejected" in result.data ? result.data.rejected.errors : [];
  const errorOf = (field: LeaveFieldError["field"]) => fieldErrors.find((error) => error.field === field)?.message;
  const noteError = resubmit
    ? resubmitted.result.validationErrors?.input?.note?._errors?.[0]
    : submitted.result.validationErrors?.note?._errors?.[0];
  const blockedReason = result.serverError ?? fieldErrors[0]?.message;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const startDate = fieldValue(formData, "startDate");
    const input = {
      kind,
      startDate,
      endDate: singleDay ? startDate : fieldValue(formData, "endDate"),
      half: singleDay ? half : "",
      note: fieldValue(formData, "note"),
    };
    if (resubmit) resubmitted.execute({ leaveId: resubmit.leaveId, expectedVersion: resubmit.expectedVersion, input });
    else submitted.execute(input);
  }

  const startError = errorOf("startDate");
  const endError = errorOf("endDate");
  return (
    <>
      <Form id="leave-form" onSubmit={handleSubmit}>
        <Form.Field id="kind" label="종류" width="select">
          <Select id="kind" options={KIND_OPTIONS} value={kind} onChange={(event) => setKind(event.target.value)} error={errorOf("kind")} />
        </Form.Field>

        <Form.Field id="startDate" label={singleDay ? "날짜" : "시작일"} width="short">
          <input
            id="startDate"
            name="startDate"
            type="date"
            defaultValue={resubmit?.initial.startDate}
            className={styles.textInput}
            aria-invalid={startError ? true : undefined}
            aria-describedby={startError ? "startDate-error" : undefined}
          />
          {startError ? <Form.Error id="startDate-error">{startError}</Form.Error> : null}
        </Form.Field>

        {singleDay ? (
          <Form.Field id="half" label="시간" width="select">
            <Select id="half" options={HALF_OPTIONS} value={half} onChange={(event) => setHalf(event.target.value)} error={errorOf("half")} />
          </Form.Field>
        ) : (
          <Form.Field id="endDate" label="종료일" width="short">
            <input
              id="endDate"
              name="endDate"
              type="date"
              defaultValue={resubmit?.initial.endDate}
              className={styles.textInput}
              aria-invalid={endError ? true : undefined}
              aria-describedby={endError ? "endDate-error" : undefined}
            />
            {endError ? <Form.Error id="endDate-error">{endError}</Form.Error> : null}
          </Form.Field>
        )}

        <Form.Field id="note" label="비고" width="long">
          <input
            id="note"
            name="note"
            type="text"
            maxLength={500}
            autoComplete="off"
            defaultValue={resubmit?.initial.note ?? undefined}
            className={styles.textInput}
            aria-invalid={noteError ? true : undefined}
            aria-describedby={noteError ? "note-error" : undefined}
          />
          {noteError ? <Form.Error id="note-error">{noteError}</Form.Error> : null}
        </Form.Field>

        <Form.Actions>
          <Button type="submit" variant="primary" pending={isExecuting}>
            {resubmit ? "연차 다시 신청" : "연차 신청"}
          </Button>
          {blockedReason ? <span className={styles.blockedReason}>{blockedReason}</span> : null}
          {resubmit ? null : (
            <Link href="/leave" className={buttonLinkClassName("secondary")}>
              취소
            </Link>
          )}
        </Form.Actions>
      </Form>
      {toast ? <Toast message={toast} onDismiss={() => setToast(null)} /> : null}
    </>
  );
}
