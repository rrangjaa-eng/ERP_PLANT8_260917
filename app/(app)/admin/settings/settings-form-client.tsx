"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { TextField } from "@/ui/input/TextField";
import { Button } from "@/ui/button/Button";
import { DetailScreen } from "@/ui/detail-screen/DetailScreen";
import { ConfirmDialog } from "@/ui/confirm-dialog/ConfirmDialog";
import { HistoryList, type HistoryEntry } from "@/ui/history-list/HistoryList";
import { Toast } from "@/ui/toast/Toast";
import { PermissionGrid, buildCellKey } from "@/ui/permission-grid/PermissionGrid";
import { clearDirtyEdits, loadDirtyEdits, saveDirtyEdits, viewerDirtyScope, type DirtyStorageLike } from "@/ui/table/use-dirty-storage";
import { parseNumberInput, type NumberInputKind } from "@/lib/format-number";
import {
  setSimpleSettingAction,
  saveApprovalRouteStepAction,
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
  | { kind: "multi-enum"; options: string[] }
  | { kind: "pair-grid"; rows: string; cols: string; rowField: string; colField: string };

export type SettingsFieldViewModel = {
  key: string;
  label: string;
  hint?: string;
  // 05-04(UI-SPEC S13): number 칸 값 옆 정적 단위 글자(`MB`) — 입력 밖에 둔다(SYSTEM §7-2).
  unitLabel?: string;
  field:
    | { kind: "simple"; descriptor: SettingsFieldDescriptorView; value: unknown }
    | { kind: "historized"; descriptor: SettingsFieldDescriptorView; entries: HistoryEntry[] };
  options?: { value: string; label: string }[];
  // 06-02(SP-9): 짝 격자 칸의 행 · 열 — 두 코드표의 활성 값(서버가 미리 읽는다).
  pairGrid?: {
    rows: { value: string; label: string }[];
    cols: { value: string; label: string }[];
    rowField: string;
    colField: string;
  };
  disabled?: boolean;
  warning?: string;
  // 결재선 단계 칸(사용자 결정 2026-09-30 A): 켜짐 조건과 속한 단계 — 단계 네 칸은 화면에 모았다가 한 번에 저장한다.
  // 모양은 domain/approvals/settings-options의 SettingCondition · RouteStepField와 같다 — "use client" 파일은
  // 결재 모듈을 import하지 않는다(test/unit/document-kinds-import.test.ts).
  activeWhen?: { key: string; equals: unknown }[];
  step?: { kind: string; stepIndex: number; field: "enabled" | "roleId" | "scope" | "orgUnitId" };
};

export type SettingsSection = {
  namespace: string;
  fields: SettingsFieldViewModel[];
};

// 힌트 · 오류 <p>의 id를 칸의 aria-describedby로 잇는다 — 오류 먼저, 힌트 뒤. 없으면 속성을 달지 않는다.
function describedBy(...ids: (string | undefined)[]): string | undefined {
  return ids.filter(Boolean).join(" ") || undefined;
}

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
  unitLabel,
  descriptor,
  initialValue,
  options,
  disabled,
  warning,
}: {
  fieldKey: string;
  label: string;
  hint?: string;
  unitLabel?: string;
  descriptor: SettingsFieldDescriptorView;
  initialValue: unknown;
  options?: { value: string; label: string }[];
  disabled?: boolean;
  warning?: string;
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
  const hintId = `setting-${fieldKey}-hint`;
  const unitId = `setting-${fieldKey}-unit`;
  const errorId = `setting-${fieldKey}-error`;
  const fieldDescribedBy = describedBy(error ? errorId : undefined, hint ? hintId : undefined);

  if (descriptor.kind === "boolean") {
    return (
      <div className={styles.field}>
        <label className={styles.checkboxLabel}>
          <input
            type="checkbox"
            checked={checked}
            aria-describedby={fieldDescribedBy}
            onChange={(event) => {
              setChecked(event.target.checked);
              execute({ key: fieldKey, value: event.target.checked });
            }}
          />
          {label}
        </label>
        {hint ? <p id={hintId} className={styles.hint}>{hint}</p> : null}
        {error ? <p id={errorId} className={styles.error}>{error}</p> : null}
      </div>
    );
  }

  if (descriptor.kind === "enum" || options) {
    return (
      <div className={styles.field}>
        <label className={styles.selectLabel}>
          {label}
          <select
            className={styles.select}
            value={selected}
            disabled={disabled}
            aria-describedby={fieldDescribedBy}
            onChange={(event) => {
              setSelected(event.target.value);
              execute({ key: fieldKey, value: event.target.value });
            }}
          >
            {(options ?? (descriptor.kind === "enum" ? descriptor.options.map((option) => ({ value: option, label: option })) : [])).map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        {hint ? <p id={hintId} className={styles.hint}>{hint}</p> : null}
        {warning ? <p className={styles.warning}>{warning}</p> : null}
        {error ? <p id={errorId} className={styles.error}>{error}</p> : null}
      </div>
    );
  }

  if (descriptor.kind === "multi-enum") {
    return (
      <fieldset className={styles.field} aria-describedby={fieldDescribedBy}>
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
        {hint ? <p id={hintId} className={styles.hint}>{hint}</p> : null}
        {error ? <p id={errorId} className={styles.error}>{error}</p> : null}
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
          hintId={hint ? hintId : undefined}
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
        {hint ? <p id={hintId} className={styles.hint}>{hint}</p> : null}
      </div>
    );
  }

  // number(numberKind 없음) | string — 텍스트 입력, blur에서 즉시 저장
  // (§7-2 자동 생성 설정 화면 필드 렌더 규칙). 단위가 있으면 입력 밖 오른쪽에 정적 글자로(§7-2 `10` `MB`).
  const input = (
    <TextField
      id={`setting-${fieldKey}`}
      label={label}
      type={descriptor.kind === "number" ? "number" : "text"}
      numeric={descriptor.kind === "number"}
      // 단위 글자도 설명에 잇는다 — 힌트 id 뒤에 단위 id를 이어 스크린리더가 값만 읽지 않게(05 /review B6).
      hintId={[hint ? hintId : null, unitLabel ? unitId : null].filter(Boolean).join(" ") || undefined}
      value={text}
      onChange={(event) => setText(event.target.value)}
      onBlur={() => execute({ key: fieldKey, value: text })}
      error={error ?? undefined}
    />
  );
  return (
    <div className={styles.field}>
      {unitLabel ? (
        <div className={styles.withUnit}>
          {input}
          <span id={unitId} className={styles.unit}>
            {unitLabel}
          </span>
        </div>
      ) : (
        input
      )}
      {hint ? <p id={hintId} className={styles.hint}>{hint}</p> : null}
    </div>
  );
}

type Pair = Record<string, string>;
type PairGridView = NonNullable<SettingsFieldViewModel["pairGrid"]>;

function pairsOf(value: unknown): Pair[] {
  return Array.isArray(value) ? (value as Pair[]) : [];
}

// 06-02(SP-9 · SYSTEM §7-2 짝 격자): 새 컴포넌트 없이 §7-13 PermissionGrid를 설정 입력으로 쓴다. PermissionGrid는 「계급 = PC 열,
// 항목 = PC 행」이라 prop 이름이 반대다 — 열 코드표(증빙 종류)를 rows prop, 행 코드표(지급 방식)를 columns prop으로 넘긴다.
// 칸 하나 = 그 짝 하나만 더하거나 빼고(격자에 안 보이는 비활성 값의 짝은 그대로 남는다) 짝 목록 전체를 즉시 저장한다.
// 저장 차례(E-45): promise 사슬 하나로 줄 세워, 앞 저장이 끝난 뒤(성공 · 실패 모두) 최신 목록에서 다음 목록을 계산해 보낸다.
function PairGridEditor({
  fieldKey,
  label,
  hint,
  initialValue,
  pairGrid,
}: {
  fieldKey: string;
  label: string;
  hint?: string;
  initialValue: unknown;
  pairGrid: PairGridView;
}) {
  const { executeAsync } = useAction(setSimpleSettingAction);
  const { rowField, colField } = pairGrid;
  // 저장마다 서버가 화면을 다시 그려도 격자가 다시 계산되지 않게 처음 값을 잡아 둔다(상태가 이 칸의 정본).
  const [grid] = useState(() => ({
    rows: pairGrid.cols.map((col) => ({ id: col.value, label: col.label })),
    columns: pairGrid.rows.map((row) => ({ id: row.value, label: row.label })),
  }));
  const [pairs, setPairs] = useState<Pair[]>(() => pairsOf(initialValue));
  const latest = useRef(pairs);
  const chain = useRef<Promise<void>>(Promise.resolve());
  const values = useMemo(
    () => Object.fromEntries(pairs.map((pair) => [buildCellKey(pair[colField] ?? "", pair[rowField] ?? ""), true])),
    [pairs, rowField, colField],
  );

  function apply(next: Pair[]) {
    latest.current = next;
    setPairs(next);
  }

  function onToggle(evidenceId: string, methodId: string, next: boolean): Promise<void> {
    const run = chain.current.then(async () => {
      const before = latest.current;
      const same = (pair: Pair) => pair[rowField] === methodId && pair[colField] === evidenceId;
      const after = next
        ? before.some(same)
          ? before
          : [...before, { [rowField]: methodId, [colField]: evidenceId }]
        : before.filter((pair) => !same(pair));
      apply(after);
      // 끊김 · 액션 ID 불일치처럼 executeAsync가 던져도 목록을 되돌린다 — 다음 저장이 실패한 짝을 싣지 않게(06-02 검토 P2-1).
      let result: Awaited<ReturnType<typeof executeAsync>>;
      try {
        result = await executeAsync({ key: fieldKey, value: after });
      } catch (error) {
        apply(before);
        throw error;
      }
      const message = errorMessageOf(result ?? {});
      if (message) {
        apply(before);
        throw new Error(message);
      }
    });
    chain.current = run.catch(() => {});
    return run;
  }

  const hintId = `setting-${fieldKey}-hint`;
  return (
    <fieldset className={styles.field} aria-describedby={hint ? hintId : undefined}>
      <legend>{label}</legend>
      <PermissionGrid
        caption={label}
        rowSelectLabel="증빙 종류"
        itemHeaderLabel="지급 방식"
        rows={grid.rows}
        columns={grid.columns}
        values={values}
        cellAriaLabel={(evidence, method) => `${method.label} · ${evidence.label}`}
        columnAriaLabel={(method) => `${method.label} 전체`}
        onToggle={onToggle}
        saveNoun="짝"
      />
      {hint ? <p id={hintId} className={styles.hint}>{hint}</p> : null}
    </fieldset>
  );
}

function savedValueOf(field: SettingsFieldViewModel): unknown {
  return field.field.kind === "simple" ? field.field.value : undefined;
}

type StepValues = Record<string, unknown>;

function sameValues(a: StepValues, b: StepValues): boolean {
  return Object.keys(b).every((key) => a[key] === b[key]);
}

// 사용자 결정(2026-09-30 A · PR #90 Codex r4137164384): 결재선 한 단계의 네 칸은 칸마다 저장하지 않고 화면에
// 모았다가 `N단 저장` 하나로 한 트랜잭션에 저장한다 — 두 칸을 바꾸는 사이의 중간 결재선이 생기지 않게.
// 칸의 비활성은 저장 전 화면 값으로 다시 판정한다(서버가 넘긴 조건 그대로). base = 초안을 시작한 저장값 —
// 저장 때 기대값으로 보내, 그 사이 다른 저장이 있었으면 도메인이 거부한다. 손대지 않은 단계는 새 저장값을 따라간다.
// 저장 안 한 단계 — 화면(SettingsFormClient)이 앱 안 링크 확인과 브라우저 저장소 보관에 쓴다.
type StepDraft = { stepIndex: number; draft: StepValues; base: StepValues };
type StepDraftChange = (key: string, snapshot: StepDraft | null) => void;

function RouteStepEditor({
  kind,
  stepIndex,
  fields,
  initialDraft,
  onDraftChange,
}: {
  kind: string;
  stepIndex: number;
  fields: SettingsFieldViewModel[];
  // 복원 줄의 「복원」 — 보관된 초안으로 다시 그린다(저장값 위에 덮는다).
  initialDraft?: StepValues;
  onDraftChange: StepDraftChange;
}) {
  const { execute, result, isExecuting } = useAction(saveApprovalRouteStepAction);
  const errorId = useId();
  const saved: StepValues = Object.fromEntries(fields.map((field) => [field.key, savedValueOf(field)]));
  const [state, setState] = useState(() => ({ base: saved, draft: initialDraft ? { ...saved, ...initialDraft } : saved }));
  let { base, draft } = state;
  if (!sameValues(base, saved) && (sameValues(draft, base) || sameValues(draft, saved))) {
    base = saved;
    draft = saved;
    setState({ base, draft });
  }
  const dirty = !sameValues(draft, base);
  const error = dirty ? errorMessageOf(result) : null;
  // 저장 대기(isExecuting) 중엔 칸을 잠근다 — 대기 중 바꾼 값이 다음 저장의 기대값(base)을 어긋나게 하지 않게(Codex P2).

  // 이 화면에서 저장하지 않은 값은 단계 칸뿐이다 — 새로 고침 · 창 닫기는 브라우저 이탈 경고(§7-3 편집 표와 같은
  // 방식, 문구 없음). 바뀐 칸과 같은 커밋에 등록한다(부모를 거치면 한 박자 늦어 곧바로 새로 고치면 빠진다).
  useEffect(() => {
    if (!dirty) return;
    function handleBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [dirty]);

  // 앱 안 링크 확인 · 저장소 보관은 화면 전체에서 한 번 — 저장하지 않은 단계를 SettingsFormClient에 알린다.
  const stepKey = `${kind}-${stepIndex}`;
  useEffect(
    () => onDraftChange(stepKey, dirty ? { stepIndex, draft, base } : null),
    [stepKey, stepIndex, dirty, draft, base, onDraftChange],
  );
  useEffect(() => () => onDraftChange(stepKey, null), [stepKey, onDraftChange]);

  function change(key: string, value: unknown) {
    setState((current) => ({ ...current, draft: { ...current.draft, [key]: value } }));
  }

  function valuesOf(source: StepValues) {
    const valueOf = (name: NonNullable<SettingsFieldViewModel["step"]>["field"]) => {
      const field = fields.find((candidate) => candidate.step?.field === name);
      return field ? source[field.key] : undefined;
    };
    return { enabled: valueOf("enabled"), roleId: valueOf("roleId"), scope: valueOf("scope"), orgUnitId: valueOf("orgUnitId") };
  }

  return (
    <div role="group" aria-label={`${stepIndex}단`} data-step={stepKey}>
      {fields.map((field) => {
        const value = draft[field.key];
        const disabled = !(field.activeWhen ?? []).every((condition) => draft[condition.key] === condition.equals);
        if (field.field.kind === "simple" && field.field.descriptor.kind === "boolean") {
          return (
            <div key={field.key} className={styles.field}>
              <label className={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={value === true}
                  disabled={isExecuting}
                  aria-describedby={field.hint ? `setting-${field.key}-hint` : undefined}
                  onChange={(event) => change(field.key, event.target.checked)}
                />
                {field.label}
              </label>
              {field.hint ? <p id={`setting-${field.key}-hint`} className={styles.hint}>{field.hint}</p> : null}
            </div>
          );
        }
        // 경고는 저장값 기준이다 — 초안에서 칸이 꺼졌거나 값이 바뀌면 그 칸에 맞지 않아 숨긴다.
        const showWarning = Boolean(field.warning) && !disabled && value === base[field.key];
        return (
          <div key={field.key} className={styles.field}>
            <label className={styles.selectLabel}>
              {field.label}
              <select
                className={styles.select}
                value={typeof value === "string" ? value : ""}
                disabled={disabled || isExecuting}
                aria-describedby={field.hint ? `setting-${field.key}-hint` : undefined}
                onChange={(event) => change(field.key, event.target.value)}
              >
                {(field.options ?? []).map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            {field.hint ? <p id={`setting-${field.key}-hint`} className={styles.hint}>{field.hint}</p> : null}
            {showWarning ? <p className={styles.warning}>{field.warning}</p> : null}
          </div>
        );
      })}
      <div className={styles.field}>
        <Button
          variant="secondary"
          pending={isExecuting}
          disabled={!dirty}
          disabledReason="바뀐 칸 없음"
          reasonTone="info"
          aria-describedby={error ? errorId : undefined}
          onClick={() => execute({ kind, stepIndex, values: valuesOf(draft), expected: valuesOf(base) })}
        >
          {stepIndex}단 저장
        </Button>
        {error ? (
          <p id={errorId} role="alert" className={styles.error}>
            {error}
          </p>
        ) : null}
      </div>
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
    <div
      className={styles.field}
      role="group"
      aria-labelledby={`setting-${fieldKey}-label`}
      aria-describedby={hint ? `setting-${fieldKey}-hint` : undefined}
    >
      <p id={`setting-${fieldKey}-label`} className={styles.historizedLabel}>{label}</p>
      {hint ? <p id={`setting-${fieldKey}-hint`} className={styles.hint}>{hint}</p> : null}
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

// 결재선 단계 칸은 (종류, 단계)마다 한 묶음으로 — 첫 칸 자리에 그린다(SETTING_DEFS 순서가 바뀌어도 묶음이 쪼개지지 않게).
function renderFields(
  fields: SettingsFieldViewModel[],
  onDraftChange: StepDraftChange,
  restored: { drafts: Record<string, StepValues>; generation: Record<string, number> },
): ReactNode[] {
  const groups = new Map<string, SettingsFieldViewModel[]>();
  for (const field of fields) {
    if (!field.step) continue;
    const key = `${field.step.kind}-${field.step.stepIndex}`;
    groups.set(key, [...(groups.get(key) ?? []), field]);
  }

  const nodes: ReactNode[] = [];
  const rendered = new Set<string>();
  for (const field of fields) {
    if (field.step) {
      const key = `${field.step.kind}-${field.step.stepIndex}`;
      if (rendered.has(key)) continue;
      rendered.add(key);
      nodes.push(
        <RouteStepEditor
          key={`${key}-${restored.generation[key] ?? 0}`}
          kind={field.step.kind}
          stepIndex={field.step.stepIndex}
          fields={groups.get(key) ?? []}
          initialDraft={restored.drafts[key]}
          onDraftChange={onDraftChange}
        />,
      );
      continue;
    }
    nodes.push(
      field.pairGrid && field.field.kind === "simple" ? (
        <PairGridEditor
          key={field.key}
          fieldKey={field.key}
          label={field.label}
          hint={field.hint}
          initialValue={field.field.value}
          pairGrid={field.pairGrid}
        />
      ) : field.field.kind === "historized" ? (
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
          unitLabel={field.unitLabel}
          descriptor={field.field.descriptor}
          initialValue={field.field.value}
          options={field.options}
          disabled={field.disabled}
          warning={field.warning}
        />
      ),
    );
  }
  return nodes;
}

// 저장하지 않은 단계가 있으면 앱 안 링크로 떠날 때 확인한다 — next/link는 beforeunload 없이 이동한다(Codex P2
// r4140619759). 연차 신청 폼과 같은 `입력 버리기` 확인. 새로 고침 · 창 닫기는 각 단계의 브라우저 이탈 경고.
function useLeaveGuard(dirtySteps: number[]) {
  const [leaveHref, setLeaveHref] = useState<string | null>(null);
  const dirty = dirtySteps.length > 0;

  useEffect(() => {
    if (!dirty) return;
    // 캡처 단계에서 앱 안 링크 누름을 먼저 받아 이동을 멈춘다(React 루트의 Link 처리보다 앞선다).
    function handleClick(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!(anchor instanceof HTMLAnchorElement) || anchor.hasAttribute("download")) return;
      if (anchor.target && anchor.target !== "_self") return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      event.preventDefault();
      event.stopPropagation();
      setLeaveHref(url.pathname + url.search + url.hash);
    }
    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, [dirty]);

  return { leaveHref, setLeaveHref };
}

// 사용자 결정 2026-09-30 A-2(Codex P2 r4141687057): 뒤로 · 앞으로는 막지 않는다(브라우저 기록을 조작하는 가드는 Chrome이
// 두 번째 뒤로를 통과시켜 구멍이 남는다). 저장 안 한 단계를 브라우저 저장소에 보관하고, 다시 열면 한 줄로 알린다 —
// §7-3 (마) D-68과 같은 모양 · 같은 저장소 키 규칙(보는 사람 id를 앞세움, 로그아웃 때 지워짐).
const DRAFT_SUB_SCOPE = "approval-route";
const subscribeNothing = () => () => {};

function draftStorage(): DirtyStorageLike | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function readStoredDrafts(scope: string): Record<string, StepDraft> {
  const storage = typeof window === "undefined" ? null : draftStorage();
  const stored = storage ? loadDirtyEdits(storage, scope, DRAFT_SUB_SCOPE) : null;
  const drafts: Record<string, StepDraft> = {};
  for (const [key, value] of Object.entries(stored ?? {})) {
    if (typeof value !== "object" || value === null) continue;
    const { stepIndex, draft, base } = value as Partial<StepDraft>;
    if (typeof stepIndex === "number" && draft && base) drafts[key] = { stepIndex, draft, base };
  }
  return drafts;
}

function writeStoredDrafts(scope: string, drafts: Record<string, StepDraft>) {
  const storage = draftStorage();
  if (!storage) return;
  try {
    if (Object.keys(drafts).length === 0) clearDirtyEdits(storage, scope, DRAFT_SUB_SCOPE);
    else saveDirtyEdits(storage, scope, DRAFT_SUB_SCOPE, drafts);
  } catch {
    // 저장소가 가득 찼거나 막혔으면 보관만 건너뛴다 — 화면의 편집은 그대로다.
  }
}

function stepList(steps: number[]): string {
  return [...steps].sort((a, b) => a - b).map((step) => `${step}단`).join(" · ");
}

function withoutKeys<T>(entries: Record<string, T>, keys: Record<string, unknown>): Record<string, T> {
  return Object.fromEntries(Object.entries(entries).filter(([key]) => !(key in keys)));
}

// 보관본의 칸 값은 지금 칸에 맞을 때만 쓴다 — 저장값과 같은 형식이고, 고르는 칸이면 지금 선택지에 있어야 한다
// (그 사이 보관된 계급 · 부서, 손으로 고친 저장소). 아니면 저장값.
function sanitizeDraft(draft: StepValues, fields: SettingsFieldViewModel[]): StepValues {
  return Object.fromEntries(
    fields.map((field) => {
      const saved = savedValueOf(field);
      const value = draft[field.key];
      const fits =
        value === saved ||
        (field.options
          ? typeof value === "string" && field.options.some((option) => option.value === value)
          : typeof value === typeof saved);
      return [field.key, fits ? value : saved];
    }),
  );
}

export function SettingsFormClient({ sections, viewerId }: { sections: SettingsSection[]; viewerId: string }) {
  const router = useRouter();
  const scope = viewerDirtyScope(viewerId, "settings");
  // 지난번 보관본 — 연 때 한 번 읽는다(아래 stash가 지금도 맞는 것만 남긴다).
  const [stored, setStored] = useState(() => readStoredDrafts(scope));
  const [drafts, setDrafts] = useState<Record<string, StepDraft>>({});
  const onDraftChange = useCallback<StepDraftChange>((key, snapshot) => {
    // 이번에 고친 단계는 그 편집이 보관본을 대신한다 — 고친 값을 저장값으로 되돌려도 옛 보관본이 다시 뜨지 않게.
    if (snapshot) setStored((current) => (key in current ? withoutKeys(current, { [key]: true }) : current));
    setDrafts((current) => {
      if (!snapshot && !(key in current)) return current;
      const next = { ...current };
      if (snapshot) next[key] = snapshot;
      else delete next[key];
      return next;
    });
  }, []);
  const dirtySteps = Object.values(drafts).map((draft) => draft.stepIndex);
  const { leaveHref, setLeaveHref } = useLeaveGuard(dirtySteps);

  const fieldsByStep = useMemo(() => {
    const groups = new Map<string, SettingsFieldViewModel[]>();
    for (const field of sections.flatMap((section) => section.fields)) {
      if (!field.step) continue;
      const key = `${field.step.kind}-${field.step.stepIndex}`;
      groups.set(key, [...(groups.get(key) ?? []), field]);
    }
    return groups;
  }, [sections]);

  // 보관본은 지금도 맞는 것만 남긴다 — 보관 때 기준값이 지금 저장값과 같아야 한다
  // (그 사이 다른 저장이 그 단계를 바꿨으면 옛 값 위에서 만든 초안이라 뺀다). 복원 · 버림 전까지 저장소에 그대로 둔다.
  const stash = useMemo(() => {
    const kept: Record<string, StepDraft> = {};
    for (const [key, entry] of Object.entries(stored)) {
      const fields = fieldsByStep.get(key);
      if (!fields) continue;
      const saved = Object.fromEntries(fields.map((field) => [field.key, savedValueOf(field)]));
      if (!sameValues(entry.base, saved) || !sameValues(saved, entry.base)) continue;
      const draft = sanitizeDraft(entry.draft, fields);
      if (!sameValues(draft, saved)) kept[key] = { stepIndex: fields[0]!.step!.stepIndex, draft, base: saved };
    }
    return kept;
  }, [stored, fieldsByStep]);

  // 저장소 = 아직 복원 · 버림하지 않은 보관본 + 이번에 고친 단계(같은 단계면 이번 편집이 대신한다).
  useEffect(() => {
    writeStoredDrafts(scope, { ...withoutKeys(stash, drafts), ...drafts });
  }, [scope, stash, drafts]);

  // 서버 HTML과 수화 첫 렌더는 저장소를 모르므로 수화 뒤에만 보인다(React #418). 이번에 고친 단계는 줄에서 뺀다.
  const hydrated = useSyncExternalStore(subscribeNothing, () => true, () => false);
  const restorable = hydrated ? withoutKeys(stash, drafts) : {};

  // 복원 줄은 보관본의 단계가 있는 섹션(결재선 종류)에만 뜨고, 그 줄의 「복원」 · 「버림」도 그 섹션 단계만 다룬다(WINDOWS #42).
  function restorableIn(section: SettingsSection): Record<string, StepDraft> {
    const keys = new Set(section.fields.flatMap((field) => (field.step ? [`${field.step.kind}-${field.step.stepIndex}`] : [])));
    return Object.fromEntries(Object.entries(restorable).filter(([key]) => keys.has(key)));
  }

  const [restored, setRestored] = useState<{ drafts: Record<string, StepValues>; generation: Record<string, number> }>({
    drafts: {},
    generation: {},
  });
  const [discarded, setDiscarded] = useState<Record<string, StepDraft> | null>(null);

  function restore(entries: Record<string, StepDraft>) {
    const keys = Object.keys(entries);
    if (keys.length === 0) return;
    setRestored((current) => ({
      drafts: { ...current.drafts, ...Object.fromEntries(keys.map((key) => [key, entries[key]!.draft])) },
      generation: { ...current.generation, ...Object.fromEntries(keys.map((key) => [key, (current.generation[key] ?? 0) + 1])) },
    }));
    setStored((current) => withoutKeys(current, entries));
    // 누른 줄이 사라진다 — 초점을 되살린 첫 단계의 첫 칸으로 옮긴다.
    const first = keys.sort((a, b) => entries[a]!.stepIndex - entries[b]!.stepIndex)[0];
    requestAnimationFrame(() => {
      document.querySelector<HTMLElement>(`[data-step="${first}"] input:not(:disabled), [data-step="${first}"] select:not(:disabled)`)?.focus();
    });
  }

  // 사용자 결정 2026-09-26(C-1)과 같은 규칙 — 「버림」은 확인 없이 지우고 알림의 「되돌리기」로 되살린다.
  function discard(entries: Record<string, StepDraft>) {
    setDiscarded(entries);
    setStored((current) => withoutKeys(current, entries));
  }

  // 되돌리기는 그 사이 고친 단계 · 다른 저장이 바꾼 단계를 빼고, 지금 선택지로 다시 걸러 되살린다.
  function undoDiscard(entries: Record<string, StepDraft>) {
    const current: Record<string, StepDraft> = {};
    for (const [key, entry] of Object.entries(withoutKeys(entries, drafts))) {
      const fields = fieldsByStep.get(key) ?? [];
      const saved = Object.fromEntries(fields.map((field) => [field.key, savedValueOf(field)]));
      if (fields.length === 0 || !sameValues(entry.base, saved) || !sameValues(saved, entry.base)) continue;
      current[key] = { ...entry, draft: sanitizeDraft(entry.draft, fields) };
    }
    restore(current);
  }

  // `입력 버리기` — 이번에 고친 단계만 버린다. 아직 복원하지 않은 보관본은 남긴다.
  function leave() {
    if (!leaveHref) return;
    writeStoredDrafts(scope, withoutKeys(stash, drafts));
    router.push(leaveHref);
  }

  return (
    <div>
      <ExportButton />
      {sections.map((section) => {
        const sectionRestorable = restorableIn(section);
        const restorableSteps = Object.values(sectionRestorable).map((entry) => entry.stepIndex);
        return (
          <DetailScreen.Section key={section.namespace} title={section.namespace}>
            {restorableSteps.length > 0 ? (
              <p className={styles.restoreBanner}>
                <span>{`저장 안 한 편집 ${stepList(restorableSteps)}`}</span>
                <span className={styles.restoreActions}>
                  <button type="button" className={styles.restoreAction} onClick={() => restore(sectionRestorable)}>
                    복원
                  </button>
                  <button type="button" className={styles.restoreAction} onClick={() => discard(sectionRestorable)}>
                    버림
                  </button>
                </span>
              </p>
            ) : null}
            {renderFields(section.fields, onDraftChange, restored)}
          </DetailScreen.Section>
        );
      })}
      <ConfirmDialog
        open={leaveHref !== null}
        onClose={() => setLeaveHref(null)}
        title="입력 버리기"
        subtitle={`결재선 ${stepList(dirtySteps)}`}
        primary={{ label: "입력 버리기", onConfirm: leave }}
      />
      {discarded ? (
        <Toast
          message="편집을 버렸습니다"
          actionLabel="되돌리기"
          onAction={() => {
            undoDiscard(discarded);
            setDiscarded(null);
          }}
          onDismiss={() => setDiscarded(null)}
        />
      ) : null}
    </div>
  );
}
