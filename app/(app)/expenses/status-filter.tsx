"use client";

import { useRef } from "react";
import { EXPENSE_STATUS_VIEWS } from "./list-columns";
import styles from "./expenses.module.css";

// 05-08(UI-SPEC S8 필터 줄): 상태 select — 네이티브 GET 폼, 고르면 바로 다시 제출해 URL `?status=`로 서버가 다시 그린다
// (action-log · projects 필터 선례). 값 낱말은 list-columns.ts.
// 06-15(S1): `views` = 서버가 그 사람에게 보일 값만(지급 권한자면 `지급 대상`이 더해진다). `selects` = 보기 다음 select 목록(서버가 채운다 —
// S1은 팀 · 증빙, 06-20 S3은 팀 · 월). 같은 GET 폼이라 하나를 바꾸면 모두 함께 제출된다.
export type FilterSelect = { name: string; label: string; value: string; options: readonly { value: string; label: string }[] };

export function StatusFilter({ value, views = EXPENSE_STATUS_VIEWS, selects = [] }: { value: string; views?: readonly string[]; selects?: readonly FilterSelect[] }) {
  const formRef = useRef<HTMLFormElement>(null);
  return (
    <form ref={formRef} method="get" aria-label="지출결의 보기" className={styles.filterForm}>
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
    </form>
  );
}
