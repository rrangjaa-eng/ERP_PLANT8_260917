"use client";

import { useRef } from "react";
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
};

export type ProjectFilterOption = { value: string; label: string };

export function ProjectsFilterBar({
  teams,
  statusOptions,
  yearOptions,
  defaultValues,
  hasFilter,
}: {
  teams: { id: string; name: string }[];
  statusOptions: ProjectFilterOption[];
  yearOptions: number[];
  defaultValues: ProjectFilterValues;
  hasFilter: boolean;
}) {
  const formRef = useRef<HTMLFormElement>(null);

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
        <label htmlFor="q">검색</label>
        <input
          id="q"
          name="q"
          type="text"
          className={styles.textInput}
          defaultValue={defaultValues.q ?? ""}
          onBlur={() => formRef.current?.requestSubmit()}
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
