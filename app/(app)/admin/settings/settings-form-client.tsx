"use client";

import { useState } from "react";
import { useAction } from "next-safe-action/hooks";
import { TextField } from "@/ui/input/TextField";
import { Button } from "@/ui/button/Button";
import { HistoryList, type HistoryEntry } from "@/ui/history-list/HistoryList";
import { parseNumberInput, type NumberInputKind } from "@/lib/format-number";
import {
  setSimpleSettingAction,
  addHistorizedSettingAction,
  cancelHistorizedSettingAction,
  exportSettingsAction,
} from "./actions";
import styles from "./settings.module.css";

// ADMN-05: 레지스트리에서 파생된 계산된 뷰모델만 받는다 — 이 파일도
// page.tsx도 실제 키 이름 문자열을 담지 않는다(SETTING_DEFS를 순회한
// 결과만 props로 받는다).
export type SettingsFieldDescriptorView =
  | { kind: "boolean" }
  | { kind: "number"; numberKind?: NumberInputKind }
  | { kind: "string" }
  | { kind: "enum"; options: string[] }
  | { kind: "multi-enum"; options: string[] };

export type SettingsFieldViewModel = {
  key: string;
  label: string;
  hint?: string;
  field:
    | { kind: "simple"; descriptor: SettingsFieldDescriptorView; value: unknown }
    | { kind: "historized"; descriptor: SettingsFieldDescriptorView; entries: HistoryEntry[] };
};

export type SettingsSection = {
  namespace: string;
  fields: SettingsFieldViewModel[];
};

function errorMessageOf(result: { serverError?: unknown; validationErrors?: unknown }): string | null {
  if (typeof result.serverError === "string") return `저장 실패 · ${result.serverError}`;
  if (result.validationErrors) return "저장 실패 · 입력값 확인";
  return null;
}

// Rules-of-hooks: descriptor.kind는 필드마다 고정이지만(리마운트 없이 값만
// 바뀌지 않는다) 정적 분석이 그것을 알 수 없으므로, 쓰일 수 있는 useState
// 넷을 전부 무조건 호출한 뒤 렌더링만 분기한다.
function SimpleFieldEditor({
  fieldKey,
  label,
  hint,
  descriptor,
  initialValue,
}: {
  fieldKey: string;
  label: string;
  hint?: string;
  descriptor: SettingsFieldDescriptorView;
  initialValue: unknown;
}) {
  const { execute, result } = useAction(setSimpleSettingAction);
  const [checked, setChecked] = useState(initialValue === true);
  const [selected, setSelected] = useState(
    typeof initialValue === "string" ? initialValue : descriptor.kind === "enum" ? (descriptor.options[0] ?? "") : "",
  );
  const [multiValue, setMultiValue] = useState<string[]>(
    descriptor.kind === "multi-enum" && Array.isArray(initialValue) ? (initialValue as string[]) : [],
  );
  const [text, setText] = useState(() => {
    if (typeof initialValue === "string") return initialValue;
    if (typeof initialValue === "number") return String(initialValue);
    return "";
  });
  const error = errorMessageOf(result);

  if (descriptor.kind === "boolean") {
    return (
      <div className={styles.field}>
        <label className={styles.checkboxLabel}>
          <input
            type="checkbox"
            checked={checked}
            onChange={(event) => {
              setChecked(event.target.checked);
              execute({ key: fieldKey, value: event.target.checked });
            }}
          />
          {label}
        </label>
        {hint ? <p className={styles.hint}>{hint}</p> : null}
        {error ? <p className={styles.error}>{error}</p> : null}
      </div>
    );
  }

  if (descriptor.kind === "enum") {
    return (
      <div className={styles.field}>
        <label className={styles.selectLabel}>
          {label}
          <select
            className={styles.select}
            value={selected}
            onChange={(event) => {
              setSelected(event.target.value);
              execute({ key: fieldKey, value: event.target.value });
            }}
          >
            {descriptor.options.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        {hint ? <p className={styles.hint}>{hint}</p> : null}
        {error ? <p className={styles.error}>{error}</p> : null}
      </div>
    );
  }

  if (descriptor.kind === "multi-enum") {
    return (
      <fieldset className={styles.field}>
        <legend>{label}</legend>
        {descriptor.options.map((option) => (
          <label key={option} className={styles.checkboxLabel}>
            <input
              type="checkbox"
              checked={multiValue.includes(option)}
              onChange={(event) => {
                const next = event.target.checked
                  ? [...multiValue, option]
                  : multiValue.filter((value) => value !== option);
                setMultiValue(next);
                execute({ key: fieldKey, value: next });
              }}
            />
            {option}
          </label>
        ))}
        {hint ? <p className={styles.hint}>{hint}</p> : null}
        {error ? <p className={styles.error}>{error}</p> : null}
      </fieldset>
    );
  }

  // 쉼표 입력 종류가 있는 number 칸(04-09, UI-SPEC S15) — useCommaInput이
  // 자기 상태를 갖는 비제어 칸이라 blur에서 표시 텍스트를 직접 읽는다
  // (parseNumberInput이 쉼표를 지우므로 rawValue를 따로 넘기지 않아도 된다).
  if (descriptor.kind === "number" && descriptor.numberKind) {
    return (
      <div className={styles.field}>
        <TextField
          id={`setting-${fieldKey}`}
          label={label}
          numberKind={descriptor.numberKind}
          defaultValue={text}
          onBlur={(event) => {
            const parsed = parseNumberInput(event.target.value);
            // "-"·"." 만 남은 칸은 NaN이다 — 0으로 대체하지 않고(??는
            // null만 대체한다) 이전 값을 유지한 채 저장을 건너뛴다.
            if (parsed !== null && !Number.isFinite(parsed)) return;
            execute({ key: fieldKey, value: parsed ?? 0 });
          }}
          error={error ?? undefined}
        />
        {hint ? <p className={styles.hint}>{hint}</p> : null}
      </div>
    );
  }

  // number(numberKind 없음) | string — 텍스트 입력, blur에서 즉시 저장
  // (§7-2 자동 생성 설정 화면 필드 렌더 규칙).
  return (
    <div className={styles.field}>
      <TextField
        id={`setting-${fieldKey}`}
        label={label}
        type={descriptor.kind === "number" ? "number" : "text"}
        numeric={descriptor.kind === "number"}
        value={text}
        onChange={(event) => setText(event.target.value)}
        onBlur={() => execute({ key: fieldKey, value: text })}
        error={error ?? undefined}
      />
      {hint ? <p className={styles.hint}>{hint}</p> : null}
    </div>
  );
}

function HistorizedFieldEditor({
  fieldKey,
  label,
  hint,
  descriptor,
  entries,
}: {
  fieldKey: string;
  label: string;
  hint?: string;
  descriptor: SettingsFieldDescriptorView;
  entries: HistoryEntry[];
}) {
  const { executeAsync: executeAdd } = useAction(addHistorizedSettingAction);
  const { executeAsync: executeCancel } = useAction(cancelHistorizedSettingAction);

  const valueKind =
    descriptor.kind === "enum"
      ? { kind: "enum" as const, options: descriptor.options.map((option) => ({ value: option, label: option })) }
      : descriptor.kind === "boolean"
        ? { kind: "boolean" as const }
        : descriptor.kind === "number"
          ? { kind: "number" as const }
          : { kind: "text" as const };

  return (
    <div className={styles.field}>
      <p className={styles.historizedLabel}>{label}</p>
      {hint ? <p className={styles.hint}>{hint}</p> : null}
      <HistoryList
        entries={entries}
        valueKind={valueKind}
        idPrefix={`setting-history-${fieldKey}`}
        caption={`${label} 이력`}
        onAdd={async ({ effectiveFrom, value }) => {
          const result = await executeAdd({ key: fieldKey, effectiveFrom, value });
          const message = errorMessageOf(result ?? {});
          if (message) throw new Error(message);
        }}
        onCancel={async (effectiveFrom) => {
          const result = await executeCancel({ key: fieldKey, effectiveFrom });
          const message = errorMessageOf(result ?? {});
          if (message) throw new Error(message);
        }}
      />
    </div>
  );
}

function ExportButton() {
  const { execute, isExecuting } = useAction(exportSettingsAction, {
    onSuccess: ({ data }) => {
      if (!data) return;
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `settings-export-${new Date().toISOString().slice(0, 10)}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
    },
  });

  return (
    <div className={styles.exportRow}>
      <Button variant="secondary" pending={isExecuting} onClick={() => execute({})}>
        설정 내보내기
      </Button>
      <p className={styles.hint}>
        가져오기는 명령줄로 합니다 — `pnpm settings:import --file &lt;내보낸 JSON 경로&gt;` (docs/OPERATIONS.md §12).
      </p>
    </div>
  );
}

export function SettingsFormClient({ sections }: { sections: SettingsSection[] }) {
  return (
    <div>
      <ExportButton />
      {sections.map((section) => (
        <section key={section.namespace} className={styles.section}>
          <h2 className={styles.sectionTitle}>{section.namespace}</h2>
          {section.fields.map((field) =>
            field.field.kind === "historized" ? (
              <HistorizedFieldEditor
                key={field.key}
                fieldKey={field.key}
                label={field.label}
                hint={field.hint}
                descriptor={field.field.descriptor}
                entries={field.field.entries}
              />
            ) : (
              <SimpleFieldEditor
                key={field.key}
                fieldKey={field.key}
                label={field.label}
                hint={field.hint}
                descriptor={field.field.descriptor}
                initialValue={field.field.value}
              />
            ),
          )}
        </section>
      ))}
    </div>
  );
}
