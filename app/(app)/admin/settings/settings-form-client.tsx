"use client";

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { TextField } from "@/ui/input/TextField";
import { Button } from "@/ui/button/Button";
import { ConfirmDialog } from "@/ui/confirm-dialog/ConfirmDialog";
import { HistoryList, type HistoryEntry } from "@/ui/history-list/HistoryList";
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
  | { kind: "multi-enum"; options: string[] };

export type SettingsFieldViewModel = {
  key: string;
  label: string;
  hint?: string;
  field:
    | { kind: "simple"; descriptor: SettingsFieldDescriptorView; value: unknown }
    | { kind: "historized"; descriptor: SettingsFieldDescriptorView; entries: HistoryEntry[] };
  options?: { value: string; label: string }[];
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
  options,
  disabled,
  warning,
}: {
  fieldKey: string;
  label: string;
  hint?: string;
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

  if (descriptor.kind === "enum" || options) {
    return (
      <div className={styles.field}>
        <label className={styles.selectLabel}>
          {label}
          <select
            className={styles.select}
            value={selected}
            disabled={disabled}
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
        {hint ? <p className={styles.hint}>{hint}</p> : null}
        {warning ? <p className={styles.warning}>{warning}</p> : null}
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
type StepDirtyChange = (key: string, stepIndex: number, dirty: boolean) => void;

function RouteStepEditor({
  kind,
  stepIndex,
  fields,
  onDirtyChange,
}: {
  kind: string;
  stepIndex: number;
  fields: SettingsFieldViewModel[];
  onDirtyChange: StepDirtyChange;
}) {
  const { execute, result, isExecuting } = useAction(saveApprovalRouteStepAction);
  const errorId = useId();
  const saved: StepValues = Object.fromEntries(fields.map((field) => [field.key, savedValueOf(field)]));
  const [state, setState] = useState(() => ({ base: saved, draft: saved }));
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
      if (leaveConfirmed) return;
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [dirty]);

  // 앱 안 링크 확인은 화면 전체에서 한 번 — 저장하지 않은 단계를 SettingsFormClient에 알린다.
  const stepKey = `${kind}-${stepIndex}`;
  useEffect(() => onDirtyChange(stepKey, stepIndex, dirty), [stepKey, stepIndex, dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange(stepKey, stepIndex, false), [stepKey, stepIndex, onDirtyChange]);

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
    <div role="group" aria-label={`${stepIndex}단`}>
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
                  onChange={(event) => change(field.key, event.target.checked)}
                />
                {field.label}
              </label>
              {field.hint ? <p className={styles.hint}>{field.hint}</p> : null}
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
                onChange={(event) => change(field.key, event.target.value)}
              >
                {(field.options ?? []).map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            {field.hint ? <p className={styles.hint}>{field.hint}</p> : null}
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

// 결재선 단계 칸은 (종류, 단계)마다 한 묶음으로 — 첫 칸 자리에 그린다(SETTING_DEFS 순서가 바뀌어도 묶음이 쪼개지지 않게).
function renderFields(fields: SettingsFieldViewModel[], onDirtyChange: StepDirtyChange): ReactNode[] {
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
          key={key}
          kind={field.step.kind}
          stepIndex={field.step.stepIndex}
          fields={groups.get(key) ?? []}
          onDirtyChange={onDirtyChange}
        />,
      );
      continue;
    }
    nodes.push(
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
// 뒤로 · 앞으로도 같은 확인(Codex P2 r4141687057 — popstate는 링크 누름도 문서 이탈도 아니다).
const LEAVE_BACK = "back";
// 뒤로 가기 확인 뒤 떠나는 중 — 앞 화면이 다른 문서면 각 단계의 브라우저 이탈 경고가 한 번 더 뜨므로 건너뛴다.
let leaveConfirmed = false;

function useLeaveGuard(dirtySteps: number[]) {
  const router = useRouter();
  const [leaveHref, setLeaveHref] = useState<string | null>(null);
  const dirty = dirtySteps.length > 0;
  const trapped = useRef(false);
  useEffect(() => {
    leaveConfirmed = false;
  }, []);

  // 지금 기록을 한 칸 더 쌓아 두고, 뒤로 가면 다시 쌓아 머문 채 확인을 연다(앞으로 갈 기록은 쌓을 때 사라진다).
  // 저장할 것이 없어지면 쌓은 칸을 되돌려 뒤로 가기 한 번이 그대로 앞 화면으로 간다.
  useEffect(() => {
    if (!dirty) {
      if (trapped.current) {
        trapped.current = false;
        window.history.back();
      }
      return;
    }
    if (!trapped.current) {
      window.history.pushState(window.history.state, "", window.location.href);
      trapped.current = true;
    }
    function handlePopState() {
      if (leaveConfirmed) return;
      window.history.pushState(window.history.state, "", window.location.href);
      setLeaveHref(LEAVE_BACK);
    }
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [dirty]);

  function leave() {
    if (leaveHref === LEAVE_BACK) {
      leaveConfirmed = true;
      window.history.go(-2);
    } else if (leaveHref) {
      router.push(leaveHref);
    }
  }

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

  return { leaveHref, setLeaveHref, leave };
}

export function SettingsFormClient({ sections }: { sections: SettingsSection[] }) {
  const [dirtyByStep, setDirtyByStep] = useState<Record<string, number>>({});
  const onDirtyChange = useCallback<StepDirtyChange>((key, stepIndex, dirty) => {
    setDirtyByStep((current) => {
      if (dirty === key in current) return current;
      const next = { ...current };
      if (dirty) next[key] = stepIndex;
      else delete next[key];
      return next;
    });
  }, []);
  const dirtySteps = Object.values(dirtyByStep).sort((a, b) => a - b);
  const { leaveHref, setLeaveHref, leave } = useLeaveGuard(dirtySteps);

  return (
    <div>
      <ExportButton />
      {sections.map((section) => (
        <section key={section.namespace} className={styles.section}>
          <h2 className={styles.sectionTitle}>{section.namespace}</h2>
          {renderFields(section.fields, onDirtyChange)}
        </section>
      ))}
      <ConfirmDialog
        open={leaveHref !== null}
        onClose={() => setLeaveHref(null)}
        title="입력 버리기"
        subtitle={`결재선 ${dirtySteps.map((step) => `${step}단`).join(" · ")}`}
        primary={{ label: "입력 버리기", onConfirm: leave }}
      />
    </div>
  );
}
