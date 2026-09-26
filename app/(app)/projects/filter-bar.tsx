"use client";

import { useRef, type FocusEvent, type KeyboardEvent } from "react";
import Link from "next/link";
import styles from "./projects.module.css";

// SYSTEM.md §6-1 필터 한 줄 — 네이티브 GET 폼(action-log/filter-bar.tsx와
// 같은 패턴, 04-05 Task 1 ④). 값이 바뀌면 즉시 다시 제출해 URL 검색
// 파라미터로 상태를 관리한다(새로 고침·공유 가능). 검색만 타이핑 중 매
// 글자 제출을 피하려고 blur에서 제출한다. 제출 시 `sort`/`dir`/`count`는
// 이 폼에 없어 자연히 초기화된다 — 필터를 바꾸면 정렬·더 보기 누적도
// 처음부터 다시 보는 것이 맞다.
export type ProjectFilterValues = {
  status?: string;
  teamId?: string;
  year?: string;
  q?: string;
  from?: string;
  to?: string;
};

export type ProjectFilterOption = { value: string; label: string };

export function ProjectsFilterBar({
  teams,
  statusOptions,
  yearOptions,
  defaultValues,
  hasFilter,
  periodErrors = {},
}: {
  teams: { id: string; name: string }[];
  statusOptions: ProjectFilterOption[];
  yearOptions: number[];
  defaultValues: ProjectFilterValues;
  hasFilter: boolean;
  /** 04-48(UX-04) — 서버가 판정한 기간 칸 오류(칸 아래 한 줄). */
  periodErrors?: { from?: string; to?: string };
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const fromRef = useRef<HTMLInputElement>(null);
  const toRef = useRef<HTMLInputElement>(null);

  // 04-48(엔지 리뷰 C §2 P2) — 기간 두 칸은 묶음 단위로 제출한다: 묶음의 focusout(React onBlur는 focusout으로
  // 올라온다)에서 포커스가 두 칸 밖으로 나갈 때(relatedTarget)만, 값이 처음과 달라졌을 때만. 시작일 → Tab → 종료일
  // 사이에는 제출하지 않는다.
  function onPeriodFocusOut(event: FocusEvent<HTMLDivElement>) {
    if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return;
    const changed =
      (fromRef.current?.value ?? "") !== (defaultValues.from ?? "") || (toRef.current?.value ?? "") !== (defaultValues.to ?? "");
    if (changed) formRef.current?.requestSubmit();
  }

  // 텍스트 칸이 여럿이고 제출 버튼이 없는 폼은 브라우저가 Enter로 제출하지 않는다 — Enter는 직접 제출한다.
  function submitOnEnter(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    formRef.current?.requestSubmit();
  }

  return (
    // autoComplete="off": 이 폼 제출은 전체 페이지 이동이라, 뒤로 가기 때
    // 브라우저가 떠나기 직전 고른 값을 칸에 되살려 URL과 어긋난다(/qa ISSUE-001).
    <form ref={formRef} method="get" autoComplete="off" className={styles.filterFields} aria-label="프로젝트 필터">
      <div className={styles.selectLabel}>
        <label htmlFor="status">상태</label>
        <select
          id="status"
          name="status"
          className={styles.select}
          defaultValue={defaultValues.status ?? ""}
          onChange={() => formRef.current?.requestSubmit()}
        >
          <option value="">전체 상태</option>
          {statusOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.selectLabel}>
        <label htmlFor="teamId">팀</label>
        <select
          id="teamId"
          name="teamId"
          className={styles.select}
          defaultValue={defaultValues.teamId ?? ""}
          onChange={() => formRef.current?.requestSubmit()}
        >
          <option value="">전체 팀</option>
          {teams.map((team) => (
            <option key={team.id} value={team.id}>
              {team.name}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.selectLabel}>
        <label htmlFor="year">연도</label>
        <select
          id="year"
          name="year"
          className={styles.select}
          defaultValue={defaultValues.year ?? ""}
          onChange={() => formRef.current?.requestSubmit()}
        >
          <option value="all">전체 연도</option>
          {yearOptions.map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.selectLabel}>
        <label htmlFor="from">기간</label>
        <div className={styles.periodFields} onBlur={onPeriodFocusOut}>
          <input
            ref={fromRef}
            id="from"
            name="from"
            type="text"
            inputMode="numeric"
            placeholder="2026-09-18"
            className={`${styles.textInput} ${styles.periodInput}`}
            defaultValue={defaultValues.from ?? ""}
            aria-invalid={periodErrors.from ? true : undefined}
            aria-describedby={periodErrors.from ? "from-error" : undefined}
            onKeyDown={submitOnEnter}
          />
          <span aria-hidden="true">~</span>
          <input
            ref={toRef}
            id="to"
            name="to"
            type="text"
            inputMode="numeric"
            placeholder="2026-09-18"
            aria-label="기간 끝"
            className={`${styles.textInput} ${styles.periodInput}`}
            defaultValue={defaultValues.to ?? ""}
            aria-invalid={periodErrors.to ? true : undefined}
            aria-describedby={periodErrors.to ? "to-error" : undefined}
            onKeyDown={submitOnEnter}
          />
        </div>
        {periodErrors.from ? (
          <p id="from-error" className={styles.fieldError}>
            {periodErrors.from}
          </p>
        ) : null}
        {periodErrors.to ? (
          <p id="to-error" className={styles.fieldError}>
            {periodErrors.to}
          </p>
        ) : null}
      </div>

      <div className={styles.selectLabel}>
        <label htmlFor="q">검색</label>
        <input
          id="q"
          name="q"
          type="text"
          className={styles.textInput}
          defaultValue={defaultValues.q ?? ""}
          onBlur={() => formRef.current?.requestSubmit()}
          onKeyDown={submitOnEnter}
        />
      </div>

      {hasFilter ? (
        <Link href="/projects" className={styles.toggle}>
          필터 지우기
        </Link>
      ) : null}
    </form>
  );
}
