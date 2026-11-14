"use client";

import { useRef } from "react";
import { Select } from "@/ui/select/Select";
import styles from "./CustomField.module.css";

// 07.5-01(D-7524 · eng P1-1): 관리자 추가 칸 선택 거르개 — 필터 줄의 네이티브 select(제출 버튼 없음, 바꾸면 즉시 이동).
// 칸마다 GET 폼 하나(칸 사이 레이아웃은 필터 줄이 맡는다 — 새 클래스 없이). 폼은 지금 필터(검색어 · 갈래 · 숨김 · 다른 추가 칸 거르개)를 숨은 칸으로 지킨다.
// 라벨은 칸 이름, 첫 옵션 「전체 {칸 이름}」(값 빈 글자). 칸이 없으면 DOM 0. select id는 거래처 폼 입력 칸(`cf_<key>`)과 겹치지 않게 `filter-` 접두.
// name은 URL 파라미터 `cf_<key>`(정의 키가 이미 `cf_`로 시작해 `cf_cf_xxxxxxxx`) — page가 접두를 한 번 벗긴다.
export type CustomFieldFilterDef = { key: string; label: string; options: string[] };

function FilterField({
  action,
  preserve,
  def,
  defs,
  values,
}: {
  action: string;
  preserve: Record<string, string>;
  def: CustomFieldFilterDef;
  defs: readonly CustomFieldFilterDef[];
  values: Record<string, string>;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const name = `cf_${def.key}`;
  const id = `filter-${name}`;
  return (
    <form ref={formRef} method="get" action={action}>
      {Object.entries(preserve).map(([key, value]) => (value === "" ? null : <input key={key} type="hidden" name={key} value={value} />))}
      {defs.map((other) => {
        const value = values[other.key];
        return other.key === def.key || !value ? null : <input key={other.key} type="hidden" name={`cf_${other.key}`} value={value} />;
      })}
      <div className={styles.filterLabel}>
        <label htmlFor={id}>{def.label}</label>
        <Select
          id={id}
          name={name}
          hideEmptyOption
          options={[{ value: "", label: `전체 ${def.label}` }, ...def.options.map((option) => ({ value: option, label: option }))]}
          defaultValue={values[def.key] ?? ""}
          onChange={() => formRef.current?.requestSubmit()}
        />
      </div>
    </form>
  );
}

export function CustomFieldFilter({
  action,
  preserve,
  defs,
  values,
}: {
  action: string;
  preserve: Record<string, string>;
  defs: readonly CustomFieldFilterDef[];
  values: Record<string, string>;
}) {
  if (defs.length === 0) return null;
  return (
    <>
      {defs.map((def) => (
        <FilterField key={`${def.key}:${values[def.key] ?? ""}`} action={action} preserve={preserve} def={def} defs={defs} values={values} />
      ))}
    </>
  );
}
