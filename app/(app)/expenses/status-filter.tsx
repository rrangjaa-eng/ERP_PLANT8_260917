"use client";

import { useRef } from "react";
import { EXPENSE_STATUS_VIEWS, type ExpenseStatusView } from "./list-columns";
import styles from "./expenses.module.css";

// 05-08(UI-SPEC S8 필터 줄): 상태 select 하나 — 네이티브 GET 폼, 고르면 바로 다시 제출해 URL `?status=`로 서버가 다시 그린다
// (action-log · projects 필터 선례). 값 낱말은 list-columns.ts.
export function StatusFilter({ value }: { value: ExpenseStatusView }) {
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
          {EXPENSE_STATUS_VIEWS.map((view) => (
            <option key={view} value={view}>
              {view}
            </option>
          ))}
        </select>
      </div>
    </form>
  );
}
