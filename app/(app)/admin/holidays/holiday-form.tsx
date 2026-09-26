"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Form } from "@/ui/form/Form";
import { Button, buttonLinkClassName } from "@/ui/button/Button";
import { addHolidayAction } from "./actions";
import styles from "./holidays.module.css";

type ManualKind = "temporary" | "election";

const REASON_ID = "holiday-form-reason";

// 04.2-UI-SPEC S2-d — `?new=1`일 때만 page.tsx가 렌더한다(§6-1 목록 우선). 열리면 날짜
// 칸에 포커스가 있다. 날짜는 네이티브 날짜 입력(`min` 내일 · `max` 음력 표 마지막 해
// 12-31 — page.tsx가 계산한다), 종류는 `임시공휴일`이 미리 골라져 있다(빈 옵션 없음 —
// 막힘 이유는 날짜·이름만 센다). `noValidate`라 범위 밖 값의 마지막 관문은 서버 칸 오류다.
export function HolidayForm({ min, max, cancelHref }: { min: string; max: string; cancelHref: string }) {
  const router = useRouter();
  const [date, setDate] = useState("");
  const [kind, setKind] = useState<ManualKind>("temporary");
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);
  const [dateError, setDateError] = useState<string | undefined>();
  const [nameError, setNameError] = useState<string | undefined>();
  const [failed, setFailed] = useState(false);

  // §7-15 PARTIAL — 빈 필수 칸(날짜·이름)을 세어 1차 옆 이유 + 첫 빈 칸 다음 한 수.
  const empty = [
    ...(date === "" ? [{ label: "날짜", id: "holiday-date" }] : []),
    ...(name.trim() === "" ? [{ label: "이름", id: "holiday-name" }] : []),
  ];
  const firstEmpty = empty[0];
  const blockedReason = firstEmpty
    ? `추가할 수 없음 — ${empty.map((field) => field.label).join(" · ")} ${empty.length}칸 ·`
    : undefined;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || blockedReason) return;
    setPending(true);
    setDateError(undefined);
    setNameError(undefined);
    setFailed(false);
    try {
      const result = await addHolidayAction({ date, kind, name });
      if (result?.data) {
        router.push(`/admin/holidays?year=${result.data.year}&added=${result.data.date}`);
        return;
      }
      const fieldDateError = result?.validationErrors?.date?._errors?.[0];
      const fieldNameError = result?.validationErrors?.name?._errors?.[0];
      setDateError(fieldDateError);
      setNameError(fieldNameError);
      setFailed(!fieldDateError && !fieldNameError);
    } catch {
      // 연결이 끊긴 경우 — 폼 전체 오류(이유 자리)로 보인다.
      setFailed(true);
    }
    setPending(false);
  }

  return (
    <Form id="holiday-form" className={styles.form} onSubmit={(event) => void handleSubmit(event)}>
      <Form.Field id="holiday-date" label="날짜" width="short">
        <input
          id="holiday-date"
          name="date"
          type="date"
          min={min}
          max={max}
          autoFocus
          className={styles.textInput}
          value={date}
          onChange={(event) => setDate(event.target.value)}
          aria-invalid={dateError ? true : undefined}
          aria-describedby={dateError ? "holiday-date-error" : undefined}
        />
        {dateError ? <Form.Error id="holiday-date-error">{dateError}</Form.Error> : null}
      </Form.Field>

      <Form.Field id="holiday-kind" label="종류" width="select">
        <select
          id="holiday-kind"
          name="kind"
          className={styles.textInput}
          value={kind}
          onChange={(event) => setKind(event.target.value === "election" ? "election" : "temporary")}
        >
          <option value="temporary">임시공휴일</option>
          <option value="election">선거일</option>
        </select>
      </Form.Field>

      <Form.Field id="holiday-name" label="이름" width="long">
        <input
          id="holiday-name"
          name="name"
          type="text"
          autoComplete="off"
          maxLength={50}
          className={styles.textInput}
          value={name}
          onChange={(event) => setName(event.target.value)}
          aria-invalid={nameError ? true : undefined}
          aria-describedby={nameError ? "holiday-name-error" : undefined}
        />
        {nameError ? <Form.Error id="holiday-name-error">{nameError}</Form.Error> : null}
      </Form.Field>

      <Form.Actions>
        <Button
          type="submit"
          variant="primary"
          pending={pending}
          disabled={Boolean(blockedReason)}
          disabledReason={blockedReason}
          reasonId={REASON_ID}
          aria-describedby={!blockedReason && failed ? REASON_ID : undefined}
        >
          공휴일 추가
        </Button>
        {!blockedReason && failed && !pending ? (
          <span id={REASON_ID} className={styles.rowError}>
            추가 실패 · 다시 시도
          </span>
        ) : null}
        {firstEmpty && !pending ? (
          <Button variant="tertiary" onClick={() => document.getElementById(firstEmpty.id)?.focus()}>
            {`${firstEmpty.label} 적기`}
          </Button>
        ) : null}
        <Link
          href={cancelHref}
          className={`${buttonLinkClassName("secondary")} ${styles.cancel}`}
          aria-disabled={pending ? "true" : undefined}
          onClick={(event) => {
            if (pending) event.preventDefault();
          }}
        >
          취소
        </Link>
      </Form.Actions>
    </Form>
  );
}
