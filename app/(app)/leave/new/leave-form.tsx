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
import { submitLeaveAction } from "../actions";
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

export function LeaveForm() {
  const router = useRouter();
  const [kind, setKind] = useState<string>("full_day");
  const [half, setHalf] = useState<string>(DEFAULT_HALF_PERIOD);
  const [toast, setToast] = useState<string | null>(null);
  const { execute, result, isExecuting } = useAction(submitLeaveAction, {
    onSuccess: ({ data }) => {
      if (!data || !("result" in data)) return;
      const names = data.result.nextHolderNames;
      setToast(names ? `연차 신청 · 결재 요청됨 → ${names}` : "연차 신청 · 결재 요청됨");
      router.push(`/leave/${data.result.documentId}`);
    },
  });

  const singleDay = kind === "half_day" || kind === "quarter_day";
  const fieldErrors: LeaveFieldError[] = result.data && "rejected" in result.data ? result.data.rejected.errors : [];
  const errorOf = (field: LeaveFieldError["field"]) => fieldErrors.find((error) => error.field === field)?.message;
  const noteError = result.validationErrors?.note?._errors?.[0];
  const blockedReason = result.serverError ?? fieldErrors[0]?.message;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const startDate = fieldValue(formData, "startDate");
    execute({
      kind,
      startDate,
      endDate: singleDay ? startDate : fieldValue(formData, "endDate"),
      half: singleDay ? half : "",
      note: fieldValue(formData, "note"),
    });
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
            className={styles.textInput}
            aria-invalid={noteError ? true : undefined}
            aria-describedby={noteError ? "note-error" : undefined}
          />
          {noteError ? <Form.Error id="note-error">{noteError}</Form.Error> : null}
        </Form.Field>

        <Form.Actions>
          <Button type="submit" variant="primary" pending={isExecuting}>
            연차 신청
          </Button>
          {blockedReason ? <span className={styles.blockedReason}>{blockedReason}</span> : null}
          <Link href="/leave" className={buttonLinkClassName("secondary")}>
            취소
          </Link>
        </Form.Actions>
      </Form>
      {toast ? <Toast message={toast} onDismiss={() => setToast(null)} /> : null}
    </>
  );
}
