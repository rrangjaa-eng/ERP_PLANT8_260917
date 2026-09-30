"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useAction } from "next-safe-action/hooks";
import { Form } from "@/ui/form/Form";
import { Select } from "@/ui/select/Select";
import { Button } from "@/ui/button/Button";
import { ListEmpty } from "@/ui/list-empty/ListEmpty";
import { Table } from "@/ui/table/Table";
import type { TableColumn } from "@/ui/table/types";
import { addLeaveAdjustmentAction, setHireDateAction, setResignationDateAction } from "./actions";
import leaveStyles from "@/app/(app)/leave/leave.module.css";
import { DayNumbers } from "@/app/(app)/leave/day-numbers";
import styles from "../people.module.css";

// 04.1-06 S9 — 관리자 사람 상세 `연차` 섹션. 2px 섹션 선 + 제목(발령 이력 섹션과 같은 모양), 칸은 단일 기둥 720 ·
// 조정 기록 표만 컨테이너 폭. 입사일 · 퇴직일은 blur 즉시 저장(계급 변경 select 선례), 잔고는 서버가 준 S1과 같은 줄(퇴직
// 연도면 퇴직 줄), 연차 조정 추가는 잔고 Select(처음 값 `연차` — 공용 Select의 `—`는 그대로)와 부호 있는 일수 · 사유.
// 연차 조정은 섹션 연도(서버가 한 번 정한 값)에 기록되고 월차는 연도 없이 보낸다(S9-FY) — 연도 select는 없다. 쓰기
// 권한이 없으면 입력 · 조정 폼을 그리지 않고 기록 표는 읽기 전용(서버가 판정해 넘긴다, CX-R2).
export type LeaveAdjustmentRow = { id: string; date: string; kind: string; days: string; reason: string; author: string };

export type LeaveSectionProps = {
  userId: string;
  year: number;
  thisYear: number;
  balanceLines: string[];
  hireDate: string | null;
  resignationDate: string | null;
  // 입사일 · 퇴직일이 잔고 DTO 투영(leave.value)을 지났는가 — 가려졌으면 빈 칸이 「없음」처럼 보여 실제 값을 덮어쓰게
  // 되므로 두 칸을 그리지 않는다(/review red-team).
  datesVisible: boolean;
  adjustments: LeaveAdjustmentRow[];
  canWrite: boolean;
  // 오늘 기준 월차 조정 거부 이유(04.1-03 checkLeaveAdjustment 문구 그대로) — 있으면 `월차` 옵션을 뺀다(CX-R5).
  monthlyBlockedReason: string | null;
};

// 04.1-03 checkLeaveAdjustment의 사유 빈 칸 문구와 같은 글자(서버도 같은 문구로 거부한다).
const REASON_CAUSE = "사유 비어 있음";
const REASON_NEXT = "사유 적기";

const COLUMNS: TableColumn<LeaveAdjustmentRow>[] = [
  { key: "date", header: "날짜", priority: "p2", cell: (row) => row.date },
  { key: "kind", header: "잔고", priority: "p2", cell: (row) => row.kind },
  { key: "days", header: "일수", priority: "p1", align: "right", cell: (row) => row.days },
  { key: "reason", header: "사유", priority: "p1", cell: (row) => <span className={leaveStyles.wrapText}>{row.reason}</span> },
  { key: "author", header: "입력", priority: "p3", cell: (row) => row.author },
];

function EmploymentDate({ userId, id, label, initial, kind }: { userId: string; id: string; label: string; initial: string | null; kind: "hire" | "resignation" }) {
  const [saved, setSaved] = useState(initial ?? "");
  const hire = useAction(setHireDateAction, { onSuccess: ({ input }) => setSaved(input.date) });
  const resignation = useAction(setResignationDateAction, { onSuccess: ({ input }) => setSaved(input.date) });
  const { execute, result } = kind === "hire" ? hire : resignation;
  const error = result.serverError ?? result.validationErrors?.date?._errors?.[0];
  return (
    <Form.Field id={id} label={label} width="short">
      <input
        id={id}
        type="date"
        defaultValue={initial ?? ""}
        className={leaveStyles.textInput}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        onBlur={(event) => {
          if (event.target.value !== saved) execute({ userId, date: event.target.value });
        }}
      />
      {error ? <Form.Error id={`${id}-error`}>{error}</Form.Error> : null}
    </Form.Field>
  );
}

export function LeaveSection(props: LeaveSectionProps) {
  const { userId, year, thisYear, canWrite, monthlyBlockedReason } = props;
  const [bucket, setBucket] = useState("annual");
  const [amountDays, setAmountDays] = useState("");
  const [reason, setReason] = useState("");
  // 고른 `월차`를 쓸 수 없게 되면(입사일 재저장 뒤 재렌더) 선택값을 `연차`로 되돌린다(CX2-03).
  if (monthlyBlockedReason && bucket === "monthly") setBucket("annual");
  const { execute, result, isExecuting } = useAction(addLeaveAdjustmentAction, {
    onSuccess: ({ data }) => {
      if (data && "added" in data) {
        setAmountDays("");
        setReason("");
      }
    },
  });

  const rejected = result.data && "rejected" in result.data ? result.data.rejected : null;
  const fieldError = (field: string) => (rejected?.field === field ? rejected.message : undefined);
  const fiscalYearError = fieldError("fiscalYear") ?? result.validationErrors?.fiscalYear?._errors?.[0];
  const bucketOptions = [{ value: "annual", label: "연차" }, ...(monthlyBlockedReason ? [] : [{ value: "monthly", label: "월차" }])];
  const primaryLabel = year !== thisYear && bucket === "annual" ? `${year} 연차 조정 추가` : "연차 조정 추가";
  const reasonBlocked = reason.trim() === "";

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (reasonBlocked || isExecuting) return;
    execute({ userId, bucket, amountDays, reason, ...(bucket === "annual" ? { fiscalYear: year } : {}) });
  }

  return (
    <section className={styles.historySection} aria-labelledby="person-leave-title">
      <h2 id="person-leave-title" className={styles.historySectionTitle}>
        연차
      </h2>
      <div className="single-column">
        {canWrite && props.datesVisible ? (
          <Form onSubmit={(event) => event.preventDefault()}>
            <EmploymentDate userId={userId} id="hireDate" label="입사일" initial={props.hireDate} kind="hire" />
            <EmploymentDate userId={userId} id="resignationDate" label="퇴직일" initial={props.resignationDate} kind="resignation" />
          </Form>
        ) : null}
        {/* `잔고` 줄 — 사람 상세 위 KvList와 dl을 겹치지 않게(단일 기둥 단언은 main의 dl 하나를 잰다) 라벨 · 값 한 묶음으로. */}
        <div className={leaveStyles.sectionRow}>
          <span className={leaveStyles.sectionLabel}>
            잔고
          </span>
          <div>
            <span className={leaveStyles.yearLine}>
              <span>{`${year} 회계연도`}</span>
              {year - 1 >= 2000 ? (
                <Link href={`/admin/people/${userId}?year=${year - 1}`} className={leaveStyles.link}>
                  {`${year - 1} 회계연도`}
                </Link>
              ) : null}
              {year !== thisYear ? (
                <Link href={`/admin/people/${userId}?year=${thisYear}`} className={leaveStyles.link}>
                  올해 보기
                </Link>
              ) : null}
            </span>
            <div data-testid="person-leave-balance" className={leaveStyles.balanceLines}>
              {props.balanceLines.map((line) => (
                <p key={line}>
                  <DayNumbers text={line} />
                </p>
              ))}
            </div>
          </div>
        </div>
        {canWrite ? (
          <Form id="leave-adjustment-form" onSubmit={handleSubmit}>
            <Form.Field id="adjustBucket" label="잔고" width="select">
              <Select
                id="adjustBucket"
                options={bucketOptions}
                value={bucket}
                onChange={(event) => setBucket(event.target.value)}
                error={fieldError("bucket") ?? fiscalYearError}
              />
              {monthlyBlockedReason ? <Form.Hint>{monthlyBlockedReason}</Form.Hint> : null}
            </Form.Field>
            <Form.Field id="adjustDays" label="일수" width="short">
              <input
                id="adjustDays"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={amountDays}
                onChange={(event) => setAmountDays(event.target.value)}
                className={leaveStyles.textInput}
                aria-invalid={fieldError("amountDays") ? true : undefined}
                aria-describedby={fieldError("amountDays") ? "adjustDays-error" : "adjustDays-hint"}
              />
              {fieldError("amountDays") ? (
                <Form.Error id="adjustDays-error">{fieldError("amountDays")}</Form.Error>
              ) : (
                <span id="adjustDays-hint">
                  <Form.Hint>빼려면 -1처럼</Form.Hint>
                </span>
              )}
            </Form.Field>
            <Form.Field id="adjustReason" label="사유" width="long">
              <input
                id="adjustReason"
                type="text"
                maxLength={500}
                autoComplete="off"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                className={leaveStyles.textInput}
                aria-invalid={fieldError("reason") ? true : undefined}
                aria-describedby={fieldError("reason") ? "adjustReason-error" : undefined}
              />
              {fieldError("reason") ? <Form.Error id="adjustReason-error">{fieldError("reason")}</Form.Error> : null}
            </Form.Field>
            <Form.Actions>
              <Button
                type="submit"
                variant="primary"
                pending={isExecuting}
                disabled={reasonBlocked}
                aria-describedby={reasonBlocked ? "adjust-blocked" : undefined}
              >
                {primaryLabel}
              </Button>
              {/* 막힘 줄 = 이유 + 다음 한 수 3차(SYSTEM §7-15 · 신청 폼 blockedLine과 같은 모양, 04.1-06 DOM 감사 #8). */}
              {reasonBlocked && !isExecuting ? (
                <span className={leaveStyles.blockedLine}>
                  <span id="adjust-blocked" className={leaveStyles.blockedReason}>{`${REASON_CAUSE} · `}</span>
                  <Button variant="tertiary" onClick={() => document.getElementById("adjustReason")?.focus()}>
                    {REASON_NEXT}
                  </Button>
                </span>
              ) : null}
              {result.serverError ? <span className={leaveStyles.blockedReason}>{result.serverError}</span> : null}
            </Form.Actions>
          </Form>
        ) : null}
      </div>
      {props.adjustments.length === 0 ? (
        <ListEmpty message="연차 조정 기록이 없습니다" />
      ) : (
        <Table caption="연차 조정 기록" columns={COLUMNS} rows={props.adjustments} getRowId={(row) => row.id} />
      )}
    </section>
  );
}
