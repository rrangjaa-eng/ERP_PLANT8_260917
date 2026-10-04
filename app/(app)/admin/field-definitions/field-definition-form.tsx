"use client";

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAction } from "next-safe-action/hooks";
import { Form } from "@/ui/form/Form";
import { PanelForm, type PanelFormHandle } from "@/ui/side-panel/PanelForm";
import { TextField } from "@/ui/input/TextField";
import { Select } from "@/ui/select/Select";
import { Button, buttonLinkClassName } from "@/ui/button/Button";
import { StatusTag } from "@/ui/status-tag/StatusTag";
import { ACTIVE_OPTIONS_MAX, FIELD_NAME_MAX, OPTION_MAX_LENGTH } from "@/domain/custom-fields/targets";
import {
  FIELD_DEFINITION_CONFLICT_CAUSE,
  NAME_CONFLICT_ARCHIVED_RESTORE_MESSAGE,
  OPTION_DUPLICATE_MESSAGE,
  OPTION_EMPTY_MESSAGE,
  OPTION_LIMIT_MESSAGE,
  OPTIONS_ZERO_CAUSE,
} from "@/domain/custom-fields/admin-input";
import { addOption, removeOption, type OptionError, type OptionState } from "@/domain/custom-fields/options";
import { formReason } from "@/lib/actions/form-reason";
import { DeleteToArchive } from "@/app/(app)/admin/archive/delete-to-archive";
import { archiveFieldDefinitionAction, createFieldDefinitionAction, updateFieldDefinitionAction } from "./actions";
import styles from "./field-definitions.module.css";

type FieldType = "text" | "number" | "date" | "select";

const TYPE_OPTIONS: Array<{ value: FieldType; label: string }> = [
  { value: "text", label: "텍스트" },
  { value: "number", label: "숫자" },
  { value: "date", label: "날짜" },
  { value: "select", label: "선택" },
];

const OPTION_ERROR_MESSAGES: Record<OptionError, string> = {
  empty: OPTION_EMPTY_MESSAGE,
  duplicate: OPTION_DUPLICATE_MESSAGE,
  limit: OPTION_LIMIT_MESSAGE,
};

const NEW_OPTION_ID = "fd-new-option";

function isFieldType(value: string): value is FieldType {
  return TYPE_OPTIONS.some((option) => option.value === value);
}

function stringField(data: FormData, key: string): string {
  const value = data.get(key);
  return typeof value === "string" ? value : "";
}

const FORM_ID = "field-definition-form";
const REASON_ID = "fd-form-reason";
const NAME_ERROR_ID = "fd-name-error";
const VISIBILITY_HREF = "/admin/visibility";
const NEW_HREF = "/admin/field-definitions?new=1";

// 충돌 원인의 「 · 」 앞 — 이유 자리 글자(「수정할 수 없음 — {이것} · 」)이고 뒤의 다음 한 수는 3차 버튼이 그린다.
const CONFLICT_REASON = FIELD_DEFINITION_CONFLICT_CAUSE.split(" · ")[0] ?? FIELD_DEFINITION_CONFLICT_CAUSE;

type FieldErrors = { _errors?: string[] } | Array<{ _errors?: string[] }> | undefined;

// 배열 칸의 오류 모양은 칸 전체({ _errors }) 또는 원소별 배열이다 — 칸 전체 오류만 이 칸 아래에 보인다.
function wholeFieldError(node: FieldErrors): string | undefined {
  return node && !Array.isArray(node) ? node._errors?.[0] : undefined;
}

type EditingField = {
  id: string;
  version: number;
  name: string;
  type: FieldType;
  required: boolean;
  sortOrder: number;
  options: string[];
  archivedOptions: string[];
};

type SubmitPayload = {
  name: string;
  type: FieldType;
  required: boolean;
  sortOrder: number;
  options: string[] | undefined;
  version: number;
};

const EMPTY_OPTIONS: OptionState = { active: [], archived: [] };

type FormProps = {
  cancelHref: string;
  /** null이면 등록 모드. */
  editing: EditingField | null;
  /** 정렬 순서 기본값 = min(활성 최대값 + 1, 999), 활성 정의가 없으면 1(서버가 계산해 넘긴다). */
  defaultSortOrder: number;
  /** `admin.visibility` 보기 권한이 있을 때만 등록 성공 뒤 「정보 노출표 보기」(D10-13 자동 등록 확인). */
  canViewVisibility: boolean;
};

// 04.5 등록(UI-SPEC 화면 2) · 04.5-02 수정 폼 — 옆 패널 안 `PanelForm`(04.6-23). 등록은 빈 상태가 없다: 칸은 항상 있고 타입 「텍스트」 ·
// 정렬 기본값이 채워져 있다. 성공 뒤(UQ-8 B): 등록은 패널을 열어 둔 채 칸을 비우고(`PanelForm.succeed` — 첫 칸 포커스 · 결과 한 줄) 다음 정렬 기본값을
// 채운다 · 수정은 닫힌다. 화면 항목에는 상세 화면이 없어 R9 D의 상세 이동은 해당 없다. 수정 폼은 타입이 읽기 전용(새 칸을 만든다)이고 숨은 version을
// 싣고 버전 조건부로 저장한다 — page.tsx가 `key`에 version을 넣어 「새로 불러오기」가 최신 행으로 폼을 다시 채운다.
export function FieldDefinitionForm({ cancelHref, editing, defaultSortOrder, canViewVisibility }: FormProps) {
  const router = useRouter();
  const panelRef = useRef<PanelFormHandle>(null);
  const submitted = useRef({ name: "", sortOrder: 0 });
  const [type, setType] = useState<FieldType>(editing?.type ?? "text");
  // 선택지 상태는 options.ts 함수로만 바꾼다. 저장된 선택지(초기 활성 ∪ 초기 보관)는 savedOptions다 — 삭제하면 보관으로 간다.
  const [options, setOptions] = useState<OptionState>({
    active: editing?.options ?? [],
    archived: editing?.archivedOptions ?? [],
  });
  const [savedOptions] = useState<string[]>([...(editing?.options ?? []), ...(editing?.archivedOptions ?? [])]);
  const [newOption, setNewOption] = useState("");
  const [optionError, setOptionError] = useState<OptionError | null>(null);
  // 서버 재검증으로 page가 새 기본값을 넘겨도 열린 폼의 입력값이 바뀌지 않게 마운트 시점 값을 쥐고, 등록 성공 때만 다음 값으로 올린다.
  const [sortDefault, setSortDefault] = useState(defaultSortOrder);
  const [added, setAdded] = useState<{ name: string } | null>(null);
  const verb = editing ? "수정" : "추가";
  const submitLabel = `화면 항목 ${verb}`;

  // 두 액션 모두 훅 규칙대로 매 렌더 무조건 호출하고, editing으로 어느 쪽 결과를 화면에 쓸지만 고른다.
  const createState = useAction(createFieldDefinitionAction, {
    onSuccess: () => {
      // 칸을 비우는 상태를 한 번에 바꾸고, DOM이 반영된 뒤(아래 effect) `PanelForm`이 폼 reset · 포커스 · 결과 줄을 맡는다.
      setType("text");
      setOptions(EMPTY_OPTIONS);
      setNewOption("");
      setOptionError(null);
      setSortDefault((value) => Math.min(Math.max(value, submitted.current.sortOrder + 1), 999));
      setAdded({ name: submitted.current.name });
    },
  });
  const updateState = useAction(updateFieldDefinitionAction, {
    // 수정 완료 — 패널이 닫힌다(PanelForm이 SidePanel의 닫기 경로로 넘긴다).
    onSuccess: () => panelRef.current?.succeed(),
  });
  const { result, isExecuting, reset } = editing ? updateState : createState;

  // 선택지 목록은 숨은 입력으로 폼에 실려 바뀐 칸 수(DR1 A)에 든다 — 버튼 클릭은 입력 이벤트가 아니라 직접 알린다.
  useEffect(() => {
    document.getElementById(FORM_ID)?.dispatchEvent(new Event("input", { bubbles: true }));
  }, [options]);

  useEffect(() => {
    if (added) panelRef.current?.succeed({ status: `화면 항목 추가 · ${added.name} 추가됨` });
  }, [added]);

  const nameError = wholeFieldError(result.validationErrors?.name);
  const sortOrderError = wholeFieldError(result.validationErrors?.sortOrder);
  const optionsError = wholeFieldError(result.validationErrors?.options);
  const serverError = result.serverError;

  const isSelect = type === "select";
  const zeroOptions = isSelect && options.active.length === 0;
  const atOptionLimit = options.active.length >= ACTIVE_OPTIONS_MAX;

  function focusNewOption() {
    document.getElementById(NEW_OPTION_ID)?.focus();
  }

  function handleAddOption() {
    const next = addOption(options, newOption);
    if (next.error) {
      setOptionError(next.error);
    } else {
      setOptions(next.state);
      setNewOption("");
      setOptionError(null);
    }
    focusNewOption();
  }

  function handleRemoveOption(value: string) {
    setOptions(removeOption(options, value, savedOptions));
    setOptionError(null);
    focusNewOption();
  }

  // Enter는 폼 제출 대신 선택지를 더한다. 한글 조합을 확정하는 Enter(isComposing)는 아무것도 하지 않는다 —
  // 조합 전 글자가 더해지거나 두 번 더해지지 않게(R9 · D9).
  function handleNewOptionKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    if (event.nativeEvent.isComposing) return;
    handleAddOption();
  }

  function submitPayload(payload: SubmitPayload) {
    submitted.current = { name: payload.name, sortOrder: payload.sortOrder };
    if (editing) {
      updateState.execute({
        id: editing.id,
        version: payload.version,
        name: payload.name,
        required: payload.required,
        sortOrder: payload.sortOrder,
        options: payload.options,
      });
      return;
    }
    createState.execute({
      name: payload.name,
      type: payload.type,
      required: payload.required,
      sortOrder: payload.sortOrder,
      options: payload.options,
    });
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isExecuting || zeroOptions) return;
    const data = new FormData(event.currentTarget);
    const sortOrderText = stringField(data, "sortOrder").trim();
    submitPayload({
      name: stringField(data, "name").trim(),
      type,
      required: data.get("required") === "on",
      // 빈 칸은 0이 아니라 숫자가 아닌 값으로 보내 서버의 범위 오류 문구를 받는다.
      sortOrder: sortOrderText === "" ? Number.NaN : Number(sortOrderText),
      options: isSelect ? options.active : undefined,
      version: Number(stringField(data, "version")),
    });
  }

  const shownOptionError = optionError ? OPTION_ERROR_MESSAGES[optionError] : optionsError;
  const archivedRestoreLink = nameError === NAME_CONFLICT_ARCHIVED_RESTORE_MESSAGE;
  const conflict = serverError === FIELD_DEFINITION_CONFLICT_CAUSE;
  const reason = serverError && !conflict ? formReason(verb, serverError) : null;

  function refresh() {
    reset();
    router.refresh();
  }

  function backToList() {
    router.replace(cancelHref);
  }

  // 행동 줄 위 한 줄(PanelForm `reason`) — 막힘(권한 · 보관 · 없음) · 충돌 · 그 밖의 서버 오류. 막힘이면 1차도 막는다.
  const reasonNode = reason?.blocked ? (
    <>
      {reason.text}
      <Button variant="tertiary" onClick={reason.next === "list" ? backToList : refresh}>
        {reason.next === "list" ? "목록으로" : "새로 불러오기"}
      </Button>
    </>
  ) : conflict ? (
    <>
      {verb}할 수 없음 — {CONFLICT_REASON} ·{" "}
      <Button variant="tertiary" onClick={refresh}>
        새로 불러오기
      </Button>
    </>
  ) : (
    (reason?.text ?? null)
  );
  const blockedReason = reason?.blocked ? reason.text : zeroOptions ? formReason(verb, OPTIONS_ZERO_CAUSE).text : undefined;

  return (
    <PanelForm
      ref={panelRef}
      id={FORM_ID}
      label={submitLabel}
      intent={editing ? "edit" : "create"}
      onSubmit={handleSubmit}
      pending={isExecuting}
      blockedReason={blockedReason}
      reason={reasonNode}
      reasonId={REASON_ID}
    >
      {editing ? <input type="hidden" name="version" value={editing.version} /> : null}
      <fieldset className={styles.fields} disabled={isExecuting} onInput={() => setAdded(null)}>
        <div className={styles.nameGroup}>
          <TextField
            id="fd-name"
            name="name"
            label="이름"
            autoComplete="off"
            autoFocus
            maxLength={FIELD_NAME_MAX}
            defaultValue={editing?.name}
            error={archivedRestoreLink ? undefined : nameError}
            aria-invalid={archivedRestoreLink ? true : undefined}
            aria-describedby={archivedRestoreLink ? NAME_ERROR_ID : undefined}
          />
          {archivedRestoreLink ? (
            <Form.Error id={NAME_ERROR_ID}>
              보관함에 같은 이름의 화면 항목 있음 ·{" "}
              <Link href="/admin/archive" className={buttonLinkClassName("tertiary")}>
                보관함에서 복원
              </Link>
            </Form.Error>
          ) : null}
        </div>
        <div className={styles.block}>
          {editing ? (
            <Form.Field id="fd-type" label="타입" width="select">
              <span className={styles.typeText}>
                <output id="fd-type">{TYPE_OPTIONS.find((option) => option.value === editing.type)?.label}</output>
                <Link href={NEW_HREF} className={buttonLinkClassName("tertiary")}>
                  새 화면 항목 추가
                </Link>
              </span>
            </Form.Field>
          ) : (
            <Form.Field id="fd-type" label="타입" width="select">
              <Select
                id="fd-type"
                name="type"
                options={TYPE_OPTIONS}
                value={type}
                onChange={(event) => {
                  if (isFieldType(event.target.value)) setType(event.target.value);
                }}
              />
            </Form.Field>
          )}
        </div>
        <div className={styles.block}>
          <Form.Field id="fd-required" label="필수" width="short">
            <input id="fd-required" name="required" type="checkbox" defaultChecked={editing?.required} />
          </Form.Field>
        </div>
        <TextField
          id="fd-sort-order"
          name="sortOrder"
          label="정렬 순서"
          inputMode="numeric"
          autoComplete="off"
          defaultValue={editing ? editing.sortOrder : sortDefault}
          error={sortOrderError}
        />
        {isSelect ? (
          <div className={styles.optionEditor}>
            {options.active.map((value) => (
              <input key={value} type="hidden" name="options" value={value} />
            ))}
            <div role="list" className={styles.optionList}>
              {options.active.map((value) => (
                <div role="listitem" key={value} className={styles.optionRow}>
                  <span className={styles.optionText}>{value}</span>
                  <Button variant="tertiary" aria-label={`${value} 삭제`} onClick={() => handleRemoveOption(value)}>
                    삭제
                  </Button>
                </div>
              ))}
            </div>
            {options.archived.length > 0 ? (
              <details className={styles.archivedOptions}>
                <summary className={styles.archivedSummary}>보관된 선택지 {options.archived.length}개</summary>
                <div role="list" className={styles.optionList}>
                  {options.archived.map((value) => (
                    <div role="listitem" key={value} className={styles.optionRow}>
                      <span className={styles.optionText}>{value}</span>
                      <StatusTag status="보관됨" variant="text" />
                    </div>
                  ))}
                </div>
              </details>
            ) : null}
            <div className={styles.optionAdd}>
              <TextField
                id={NEW_OPTION_ID}
                label="새 선택지"
                autoComplete="off"
                maxLength={OPTION_MAX_LENGTH}
                value={newOption}
                onChange={(event) => setNewOption(event.target.value)}
                onKeyDown={handleNewOptionKeyDown}
                error={shownOptionError}
              />
              <Button
                variant="tertiary"
                onClick={handleAddOption}
                disabled={atOptionLimit}
                disabledReason={atOptionLimit ? OPTION_LIMIT_MESSAGE : undefined}
              >
                선택지 추가
              </Button>
            </div>
          </div>
        ) : null}
        {added && canViewVisibility ? (
          <Link href={VISIBILITY_HREF} className={buttonLinkClassName("tertiary")}>
            정보 노출표 보기
          </Link>
        ) : null}
      </fieldset>
    </PanelForm>
  );
}

// 04.5-04: 목록 행 「삭제」 — 보관함으로 이동한다(VendorDeleteButton과 같은 모양, DeleteToArchive는 그대로).
export function FieldDefinitionDeleteButton({ id, name }: { id: string; name: string }) {
  return (
    <DeleteToArchive
      name={name}
      onArchive={async () => {
        const result = await archiveFieldDefinitionAction({ id });
        if (result?.serverError) throw new Error(result.serverError);
      }}
    />
  );
}
