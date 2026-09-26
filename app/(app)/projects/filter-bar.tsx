"use client";

import { Fragment, useRef, useState, type FocusEvent, type KeyboardEvent, type ReactNode } from "react";
import Link from "next/link";
import { Button } from "@/ui/button/Button";
import { filterSummary, parseListPeriod, periodOverlapsYear } from "@/domain/projects/list-view";
import styles from "./projects.module.css";

// SYSTEM.md §6-1 필터 한 줄 — 네이티브 GET 폼(action-log/filter-bar.tsx와
// 같은 패턴, 04-05 Task 1 ④). 값이 바뀌면 즉시 다시 제출해 URL 검색
// 파라미터로 상태를 관리한다(새로 고침·공유 가능). 검색만 타이핑 중 매
// 글자 제출을 피하려고 blur에서, 기간 두 칸은 묶음을 벗어날 때 제출한다.
// 필터를 바꾸면 1쪽이다(`page`를 싣지 않는다) — 지금 정렬 `sort`·`dir`은
// 숨은 값으로 실어 그대로 남긴다(C-24).
export type ProjectFilterValues = {
  status?: string;
  teamId?: string;
  /** 정규화된 보기 연도(`all` 또는 4자리) — 늘 있다. */
  year: string;
  q?: string;
  from?: string;
  to?: string;
};

export type ProjectFilterOption = { value: string; label: string };

const FILTER_FIELDS_ID = "project-filter-fields";

export function ProjectsFilterBar({
  teams,
  statusOptions,
  yearOptions,
  defaultValues,
  sort,
  hasFilter,
  periodErrors = {},
  primaryAction,
}: {
  teams: { id: string; name: string }[];
  statusOptions: ProjectFilterOption[];
  yearOptions: number[];
  defaultValues: ProjectFilterValues;
  /** 지금 정렬(기본값이면 비움) — 필터를 바꿔도 남긴다(C-24). */
  sort?: { key?: string; dir?: string };
  hasFilter: boolean;
  /** 04-48(UX-04) — 서버가 판정한 기간 칸 오류(칸 아래 한 줄). */
  periodErrors?: { from?: string; to?: string };
  /** 04-48(DR-26) — 오른쪽 1차 「프로젝트 등록」 자리(없으면 비움). PC는 줄 끝, 폰은 「필터」 · 요약 줄 오른쪽. */
  primaryAction?: ReactNode;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const fromRef = useRef<HTMLInputElement>(null);
  const toRef = useRef<HTMLInputElement>(null);
  // 폰(<700) 「필터」 disclosure — 기본 접힘. 기간 칸 서버 오류가 있으면 오류 한 줄이 보이게 펼친 채 연다.
  const [expanded, setExpanded] = useState(Boolean(periodErrors.from || periodErrors.to));
  // 검색 칸은 폰 자리(맨 위)와 PC 자리(기간 뒤) 둘에 그리고 700 중단점에서 하나만 보인다 — 두 칸이 한 값을 쓰고
  // 제출 값은 숨은 `q` 하나로만 싣는다(보이지 않는 칸의 낡은 값이 실리지 않게).
  const [query, setQuery] = useState(defaultValues.q ?? "");
  const summary = filterSummary({
    year: defaultValues.year === "all" ? "all" : Number(defaultValues.year),
    statusLabel: statusOptions.find((option) => option.value === defaultValues.status)?.label ?? "전체 상태",
    teamLabel: teams.find((team) => team.id === defaultValues.teamId)?.name ?? "전체 팀",
    from: defaultValues.from,
    to: defaultValues.to,
  });

  // 04-48(엔지 리뷰 C §2 P2) — 기간 두 칸은 묶음 단위로 제출한다: 묶음의 focusout(React onBlur는 focusout으로
  // 올라온다)에서 포커스가 두 칸 밖으로 나갈 때(relatedTarget)만, 값이 처음과 달라졌을 때만. 시작일 → Tab → 종료일
  // 사이에는 제출하지 않는다.
  function onPeriodFocusOut(event: FocusEvent<HTMLDivElement>) {
    // 창 자체가 포커스를 잃을 때(창 전환 · 폰 앱 전환)도 relatedTarget 없는 focusout이 온다 — 그때는 묶음을 떠난 것이 아니다.
    if (event.relatedTarget === null && !document.hasFocus()) return;
    if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return;
    const changed =
      (fromRef.current?.value ?? "") !== (defaultValues.from ?? "") || (toRef.current?.value ?? "") !== (defaultValues.to ?? "");
    if (changed) formRef.current?.requestSubmit();
  }

  // DR-30 반대 방향 — 기간이 있는 채 연도를 바꿔 겹치지 않게 되면 방금 고른 연도를 되돌리지 않고 기간 두 칸을 비운다.
  // 비운 칸은 비활성으로 두어 GET 주소에 `from=`·`to=`가 남지 않게 한다.
  function onYearChange(value: string) {
    const from = fromRef.current;
    const to = toRef.current;
    const { period } = parseListPeriod(from?.value, to?.value);
    if (from && to && period && !periodOverlapsYear(period, value === "all" ? "all" : Number(value))) {
      from.value = "";
      to.value = "";
      from.disabled = true;
      to.disabled = true;
    }
    formRef.current?.requestSubmit();
  }

  function searchField(id: string, slotClassName: string | undefined) {
    return (
      <div className={`${styles.selectLabel} ${styles.searchField} ${slotClassName ?? ""}`}>
        <label htmlFor={id}>검색</label>
        <input
          id={id}
          type="text"
          className={styles.textInput}
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
          onBlur={(event) => {
            // 값이 바뀌었을 때만 제출한다(기간 묶음과 같은 규칙) — 그대로 나가면 Tab이 다음 컨트롤로 간다.
            if (event.currentTarget.value !== (defaultValues.q ?? "")) formRef.current?.requestSubmit();
          }}
          onKeyDown={submitOnEnter}
        />
      </div>
    );
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
      {/* DR-26 — 폰 첫 화면: 검색(전폭) → 「필터」 · 요약 · 1차 → (펼치면) 네 칸 → 필터 지우기. PC(≥700): 네 칸 → 검색 →
          필터 지우기 → 1차. 포커스 순서 = 시각 순서(SYSTEM.md §10)라 CSS 순서 바꾸기 대신 DOM이 곧 순서다 — 검색과 1차는
          폰 자리 · PC 자리 둘에 그리고 700 중단점에서 하나만 보인다(display: none — 탭 순서 · 접근성 트리에서도 빠진다,
          Pagination 넓은 창 · 폰 창 선례). 「필터」 · 요약 줄은 폰에만 있다. */}
      {searchField("q", styles.phoneSlot)}
      <div className={styles.filterBar}>
        <div>
          <Button
            type="button"
            className={styles.filterToggleButton}
            aria-expanded={expanded}
            aria-controls={FILTER_FIELDS_ID}
            onClick={() => setExpanded((open) => !open)}
          >
            필터
          </Button>
        </div>
        <p className={styles.filterSummary} data-testid="filter-summary">
          {summary.map((part, index) => (
            <Fragment key={`${index}-${part}`}>
              {index > 0 ? " · " : null}
              <span className={styles.filterSummaryPart}>{part}</span>
            </Fragment>
          ))}
        </p>
        {primaryAction ? <div className={styles.primarySlot}>{primaryAction}</div> : null}
      </div>

      <div id={FILTER_FIELDS_ID} className={styles.detailFields} data-open={expanded}>
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
            defaultValue={defaultValues.year}
            onChange={(event) => onYearChange(event.currentTarget.value)}
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
      </div>

      {searchField("q-wide", styles.wideSlot)}
      <input type="hidden" name="q" value={query} />

      {sort?.key ? <input type="hidden" name="sort" value={sort.key} /> : null}
      {sort?.dir ? <input type="hidden" name="dir" value={sort.dir} /> : null}

      {hasFilter ? (
        <Link href="/projects" className={styles.toggle}>
          필터 지우기
        </Link>
      ) : null}

      {primaryAction ? <div className={`${styles.primarySlot} ${styles.wideSlot}`}>{primaryAction}</div> : null}
    </form>
  );
}
