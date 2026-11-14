import type { KeyboardEvent, ReactNode } from "react";
import { Form } from "@/ui/form/Form";
import { Select } from "@/ui/select/Select";
import { TextField } from "@/ui/input/TextField";
import styles from "./CustomField.module.css";

// 04.5-06 → 07.5-02: 관리자가 만든 추가 칸 하나의 입력(거래처 폼 · 프로젝트 등록 · 정보 면 공용). 이름 · id = `cf_<key>`.
// 상태 없는 렌더 함수 — 부모(클라이언트 폼)가 값을 갖는다. `value`가 있으면 제어 갈래(정보 면 고치기 — dirty · N을 부모가 센다),
// 없으면 비제어(`defaultValue`, FormData로 읽는다).
export type CustomFieldInputDef = {
  key: string;
  label: string;
  type: "text" | "number" | "date" | "select";
  options: string[] | null;
  required: boolean;
};

// 저장값을 입력 글자로. date는 저장값이 ISO 타임스탬프일 수 있어(zod Date → JSON 직렬화) 앞 10자(YYYY-MM-DD)만 —
// <input type="date">는 그 형식만 받는다.
export function customFieldDefaultValue(def: Pick<CustomFieldInputDef, "type">, value: unknown): string {
  if (typeof value !== "string" && typeof value !== "number") return "";
  const asString = typeof value === "string" ? value : String(value);
  if (def.type === "date") return asString.slice(0, 10);
  return asString;
}

export function CustomFieldInput({
  def,
  defaultValue,
  error,
  value,
  onChange,
  className,
  onKeyDown,
}: {
  def: CustomFieldInputDef;
  defaultValue?: unknown;
  error?: string;
  /** 제어 갈래 — 입력 글자 그대로. */
  value?: string;
  onChange?: (value: string) => void;
  /** 입력 · select 요소에 붙는다(정보 면 고친 칸 표시). */
  className?: string;
  onKeyDown?: (event: KeyboardEvent<HTMLInputElement | HTMLSelectElement>) => void;
}) {
  const id = `cf_${def.key}`;
  const controlled = value !== undefined;
  const stringValue = controlled ? value : customFieldDefaultValue(def, defaultValue);
  const valueProps = controlled
    ? { value, onChange: (event: { target: { value: string } }) => onChange?.(event.target.value) }
    : { defaultValue: stringValue };
  if (def.type === "select") {
    const options = def.options ?? [];
    // 04.5-06: 저장값이 활성 선택지에 없으면(보관된 선택지) 그 값을 「(보관됨)」 옵션으로 활성화한 채 목록 끝에 더한다 —
    // disabled 옵션은 FormData에서 빠져 「안 바꿈」과 「지움」을 구분할 수 없다(SYSTEM.md §7-15 예외 · DECISIONS 07.5). 판정은 서버가 한다.
    // 제어 갈래는 처음 값(defaultValue)을 보관 옵션의 출처로 쓴다 — 고르는 중에 옵션이 사라지지 않게.
    const storedValue = controlled ? customFieldDefaultValue(def, defaultValue) : stringValue;
    const archivedValue = storedValue !== "" && !options.includes(storedValue) ? storedValue : null;
    return (
      <div className={styles.field}>
        <Form.Field id={id} label={def.label}>
          <Select
            id={id}
            name={id}
            options={[
              ...options.map((option) => ({ value: option, label: option })),
              ...(archivedValue !== null ? [{ value: archivedValue, label: `${archivedValue} (보관됨)` }] : []),
            ]}
            {...valueProps}
            className={className}
            onKeyDown={onKeyDown}
            error={error}
          />
        </Form.Field>
      </div>
    );
  }

  const inputType = def.type === "number" ? "number" : def.type === "date" ? "date" : "text";
  return (
    <TextField
      id={id}
      name={id}
      label={def.label}
      type={inputType}
      {...valueProps}
      className={className}
      onKeyDown={onKeyDown}
      error={error}
    />
  );
}

// 기본 칸과 추가 칸 사이 구분선 묶음(1px 행 선 + 위아래 --s-6, 머리 글자 없음). 칸이 0개면 호출부가 그리지 않는다.
export function CustomFieldGroup({ children, ...rest }: { children: ReactNode; "data-testid"?: string }) {
  return (
    <div className={styles.group} {...rest}>
      {children}
    </div>
  );
}
