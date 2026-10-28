"use client";

import { useRef } from "react";
import { RowAction, RowActions } from "@/ui/row-actions/RowActions";
import { EXPENSE_STATUS_VIEWS } from "./list-columns";
import styles from "./expenses.module.css";

// 05-08(UI-SPEC S8 필터 줄): 상태 select — 네이티브 GET 폼, 고르면 바로 다시 제출해 URL `?status=`로 서버가 다시 그린다
// (action-log · projects 필터 선례). 값 낱말은 list-columns.ts.
// 06-15(S1): `views` = 서버가 그 사람에게 보일 값만(지급 권한자면 `지급 대상`이 더해진다). `selects` = 보기 다음 select 목록(서버가 채운다 —
// S1은 팀 · 증빙, 06-20 S3은 팀 · 월). 같은 GET 폼이라 하나를 바꾸면 모두 함께 제출된다.
export type FilterSelect = { name: string; label: string; value: string; options: readonly { value: string; label: string }[] };

// 06.5-08(D-6508 · UI-SPEC V1): `searchValue`가 있으면(빈 문자열 포함) 맨 앞에 검색 칸 — Enter만 제출한다(DM-1: blur · 매 글자 제출 없음 — 검색어를 고치고 Tab으로
// 옮기는 순간 페이지가 바뀌지 않게). 텍스트 칸이 이 폼에 하나뿐이라 버튼 없이도 Enter가 같은 GET 폼을 제출하고, select의 requestSubmit()이 `q`를 함께 싣는다.
// 06.1-05(P-3 · SP-6105): `endLink`가 있으면 폼 끝에 하위 목록 3차 링크(`증빙 {N}` — SYSTEM §6-1 「하위 목록」, 카드 사용 `구매 요청 {N}` 꼴).
// 없으면 마크업은 그대로다.
// 07.1-09(PF4 · U-7 · W11): `mine`이 있으면 select들 뒤에 네이티브 체크박스 `내 것만`(꺼짐이 기본 — 켜면 `mine=1`) — 같은 GET 폼이라 바꾸면 바로 제출되고 쪽은 1로 간다.
export function StatusFilter({
  value,
  views = EXPENSE_STATUS_VIEWS,
  selects = [],
  searchValue,
  mine,
  endLink,
}: {
  value: string;
  views?: readonly string[];
  selects?: readonly FilterSelect[];
  searchValue?: string;
  mine?: { checked: boolean };
  endLink?: { label: string; href: string };
}) {
  const formRef = useRef<HTMLFormElement>(null);
  return (
    <form ref={formRef} method="get" aria-label="지출결의 보기" className={styles.filterForm}>
      {searchValue === undefined ? null : (
        <div className={`${styles.selectLabel} ${styles.searchLabel}`}>
          <label htmlFor="expense-search">검색</label>
          {/* 뒤로 가기 · 필터 지우기로 URL이 바뀌면 key로 새로 마운트한다(상태 select와 같은 이유). */}
          <input key={searchValue} id="expense-search" name="q" type="text" className={styles.textInput} defaultValue={searchValue} autoComplete="off" />
        </div>
      )}
      <div className={styles.selectLabel}>
        <label htmlFor="expense-status">상태</label>
        <select
          // 뒤로 가기 · 빈 화면의 보기 넓히기로 URL이 바뀌면 key로 새로 마운트한다(defaultValue는 마운트 뒤 반영되지 않는다).
          key={value}
          id="expense-status"
          name="status"
          className={styles.select}
          defaultValue={value}
          onChange={() => formRef.current?.requestSubmit()}
        >
          {views.map((view) => (
            <option key={view} value={view}>
              {view}
            </option>
          ))}
        </select>
      </div>
      {selects.map((select) => (
        <div key={select.name} className={styles.selectLabel}>
          <label htmlFor={`expense-filter-${select.name}`}>{select.label}</label>
          <select
            key={select.value}
            id={`expense-filter-${select.name}`}
            name={select.name}
            className={styles.select}
            defaultValue={select.value}
            onChange={() => formRef.current?.requestSubmit()}
          >
            {select.options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      ))}
      {mine ? (
        <label className={styles.checkboxLabel}>
          <input key={String(mine.checked)} id="expense-filter-mine" name="mine" type="checkbox" value="1" defaultChecked={mine.checked} onChange={() => formRef.current?.requestSubmit()} />
          내 것만
        </label>
      ) : null}
      {endLink ? (
        <RowActions>
          <RowAction href={endLink.href}>{endLink.label}</RowAction>
        </RowActions>
      ) : null}
    </form>
  );
}
