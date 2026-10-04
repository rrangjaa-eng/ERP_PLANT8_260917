"use client";

import { useRef, useState, type FormEvent } from "react";
import { Form } from "@/ui/form/Form";
import { Button } from "@/ui/button/Button";
import { PanelForm, type PanelFormHandle } from "@/ui/side-panel/PanelForm";
import { addHolidayAction } from "./actions";
import styles from "./holidays.module.css";

type ManualKind = "temporary" | "election";

const REASON_ID = "holiday-form-reason";

// 04.2-UI-SPEC S2-d — `?new=1`일 때만 page.tsx가 `SidePanel` 안에 렌더한다(04.6-16: 옆 패널 · `PanelForm`). 열리면 날짜
// 칸에 포커스가 있다(패널이 첫 입력에 준다). 날짜는 네이티브 날짜 입력(`min` 내일 · `max` 음력 표 마지막 해
// 12-31 — page.tsx가 계산한다), 종류는 `임시공휴일`이 미리 골라져 있다(빈 옵션 없음 —
// 막힘 이유는 날짜·이름만 센다). `noValidate`라 범위 밖 값의 마지막 관문은 서버 칸 오류다.
// 성공 뒤 = R9 D의 공휴일 예외 — 패널에 남지 않고 `?added=`로 이동해(패널이 닫힌다) 추가 토스트를 띄운다.
export function HolidayForm({ min, max }: { min: string; max: string }) {
  const panelRef = useRef<PanelFormHandle>(null);
  const [date, setDate] = useState("");
  const [kind, setKind] = useState<ManualKind>("temporary");
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);
  const [dateError, setDateError] = useState<string | undefined>();
  const [nameError, setNameError] = useState<string | undefined>();
  const [failed, setFailed] = useState(false);

  // §7-15 PARTIAL — 빈 필수 칸(날짜·이름)을 세어 1차 옆 이유 + 첫 빈 칸 다음 한 수.
  // 날짜는 네이티브 날짜 입력이라 다음 한 수가 「고르기」다(DECISIONS.md 2026-09-26 날짜 입력 네이티브 통일).
  const empty = [
    ...(date === "" ? [{ label: "날짜", id: "holiday-date", nextLabel: "날짜 고르기" }] : []),
    ...(name.trim() === "" ? [{ label: "이름", id: "holiday-name", nextLabel: "이름 적기" }] : []),
  ];
  const firstEmpty = empty[0];
  const blockedReason = firstEmpty
    ? `${empty.map((field) => field.label).join(", ")} ${empty.length}칸 비어 있음`
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
        panelRef.current?.succeed({ href: `/admin/holidays?year=${result.data.year}&added=${result.data.date}` });
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

  // 막힘 이유 + 다음 한 수(3차) · 연결 실패 한 줄 — 행동 줄 위 전폭 한 줄 자리(PanelForm `reason`)에 그린다. 제출 중에는 그리지 않는다.
  const reason =
    pending || !(blockedReason || failed) ? undefined : blockedReason && firstEmpty ? (
      <>
        {blockedReason}
        <Button variant="tertiary" onClick={() => document.getElementById(firstEmpty.id)?.focus()}>
          {firstEmpty.nextLabel}
        </Button>
      </>
    ) : (
      "추가 실패 · 다시 시도"
    );

  return (
    <PanelForm
      ref={panelRef}
      id="holiday-form"
      label="공휴일 추가"
      intent="create"
      onSubmit={(event) => void handleSubmit(event)}
      pending={pending}
      blockedReason={blockedReason}
      reason={reason}
      reasonId={REASON_ID}
    >
      <Form.Field id="holiday-date" label="날짜" width="short">
        <input
          id="holiday-date"
          name="date"
          type="date"
          min={min}
          max={max}
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
    </PanelForm>
  );
}
