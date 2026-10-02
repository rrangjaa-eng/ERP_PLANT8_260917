"use client";

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAction } from "next-safe-action/hooks";
import { Form } from "@/ui/form/Form";
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
import { createFieldDefinitionAction, updateFieldDefinitionAction } from "./actions";
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

type CreateProps = {
  cancelHref: string;
  /** 정렬 순서 기본값 = min(활성 최대값 + 1, 999), 활성 정의가 없으면 1(서버가 계산해 넘긴다). */
  defaultSortOrder: number;
  /** `admin.visibility` 보기 권한이 있을 때만 결과 줄에 「정보 노출표 보기」(D10-13 자동 등록 확인). */
  canViewVisibility: boolean;
};

// 04.5 등록 폼(UI-SPEC 화면 2) — 빈 상태가 없다: 칸은 항상 있고 타입 「텍스트」 · 정렬 기본값이 채워져 있다.
// 액션 상태(결과 · 서버 오류)는 이 바깥 컴포넌트가 쥐고, 입력 · 선택지 상태는 본문 컴포넌트가 쥔다.
// 「하나 더 추가」는 본문의 key를 바꿔 React 상태까지 다시 마운트한다(재마운트된 이름 입력이 autoFocus로 포커스를 받는다).
export function FieldDefinitionForm(props: CreateProps) {
  const [generation, setGeneration] = useState(0);
  const [addedName, setAddedName] = useState<string | null>(null);
  const submittedName = useRef("");
  const { execute, result, isExecuting, reset } = useAction(createFieldDefinitionAction, {
    onSuccess: () => setAddedName(submittedName.current),
  });

  function addAnother() {
    reset();
    setAddedName(null);
    setGeneration((value) => value + 1);
  }

  return (
    <FieldDefinitionFormBody
      key={generation}
      cancelHref={props.cancelHref}
      editing={null}
      defaultSortOrder={props.defaultSortOrder}
      canViewVisibility={props.canViewVisibility}
      isExecuting={isExecuting}
      serverError={result.serverError}
      nameError={wholeFieldError(result.validationErrors?.name)}
      sortOrderError={wholeFieldError(result.validationErrors?.sortOrder)}
      optionsError={wholeFieldError(result.validationErrors?.options)}
      savedName={addedName}
      onSubmit={(payload) => {
        submittedName.current = payload.name;
        execute({
          name: payload.name,
          type: payload.type,
          required: payload.required,
          sortOrder: payload.sortOrder,
          options: payload.options,
        });
      }}
      onReset={reset}
      onAddAnother={addAnother}
    />
  );
}

// 04.5-02 수정 폼 — 타입은 읽기 전용(새 칸을 만든다), 숨은 version을 싣고 버전 조건부로 저장한다.
// 저장 성공으로 page가 새 version을 넘기면 본문만 key={version}으로 다시 마운트돼 입력 · 선택지 상태가 저장된 값으로
// 다시 시작하고, 결과 줄(savedName)은 이 바깥 상태라 남는다. 「새로 불러오기」도 같은 다시 마운트로 최신 행을 채운다.
export function FieldDefinitionEditForm(props: { cancelHref: string; editing: EditingField }) {
  const { editing } = props;
  const [savedName, setSavedName] = useState<string | null>(null);
  const submittedName = useRef("");
  const { execute, result, isExecuting, reset } = useAction(updateFieldDefinitionAction, {
    onSuccess: () => setSavedName(submittedName.current),
  });

  return (
    <FieldDefinitionFormBody
      key={editing.version}
      cancelHref={props.cancelHref}
      editing={editing}
      defaultSortOrder={editing.sortOrder}
      canViewVisibility={false}
      isExecuting={isExecuting}
      serverError={result.serverError}
      nameError={wholeFieldError(result.validationErrors?.name)}
      sortOrderError={wholeFieldError(result.validationErrors?.sortOrder)}
      optionsError={wholeFieldError(result.validationErrors?.options)}
      savedName={savedName}
      onSubmit={(payload) => {
        submittedName.current = payload.name;
        execute({
          id: editing.id,
          version: payload.version,
          name: payload.name,
          required: payload.required,
          sortOrder: payload.sortOrder,
          options: payload.options,
        });
      }}
      onReset={reset}
    />
  );
}

type BodyProps = {
  cancelHref: string;
  /** null이면 등록 모드. */
  editing: EditingField | null;
  defaultSortOrder: number;
  canViewVisibility: boolean;
  isExecuting: boolean;
  serverError: string | undefined;
  nameError: string | undefined;
  sortOrderError: string | undefined;
  optionsError: string | undefined;
  /** 저장 성공 뒤 결과 줄의 이름 — null이면 아직 저장 전. */
  savedName: string | null;
  onSubmit: (payload: SubmitPayload) => void;
  /** 서버 결과(오류)를 지운다. */
  onReset: () => void;
  onAddAnother?: () => void;
};

function FieldDefinitionFormBody({
  cancelHref,
  editing,
  defaultSortOrder,
  canViewVisibility,
  isExecuting,
  serverError,
  nameError,
  sortOrderError,
  optionsError,
  savedName,
  onSubmit,
  onReset,
  onAddAnother,
}: BodyProps) {
  const router = useRouter();
  const [type, setType] = useState<FieldType>(editing?.type ?? "text");
  // 선택지 상태는 options.ts 함수로만 바꾼다. 저장된 선택지(초기 활성 ∪ 초기 보관)는 savedOptions다 — 삭제하면 보관으로 간다.
  const [options, setOptions] = useState<OptionState>({
    active: editing?.options ?? [],
    archived: editing?.archivedOptions ?? [],
  });
  const [savedOptions] = useState<string[]>([...(editing?.options ?? []), ...(editing?.archivedOptions ?? [])]);
  const [newOption, setNewOption] = useState("");
  const [optionError, setOptionError] = useState<OptionError | null>(null);
  // 서버 재검증으로 page가 새 기본값을 넘겨도 열린 폼의 입력값이 바뀌지 않게 마운트 시점 값을 쥔다.
  const [initialSortOrder] = useState(defaultSortOrder);
  const resultRef = useRef<HTMLParagraphElement>(null);
  const verb = editing ? "수정" : "추가";
  const submitLabel = `화면 항목 ${verb}`;

  const done = savedName !== null;
  // 마운트 때 이미 저장된 상태(저장 뒤 새 version으로 다시 마운트)여도 결과 줄이 포커스를 받는다.
  useEffect(() => {
    if (savedName !== null) resultRef.current?.focus();
  }, [savedName]);

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

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isExecuting || done || zeroOptions) return;
    const data = new FormData(event.currentTarget);
    const sortOrderText = stringField(data, "sortOrder").trim();
    onSubmit({
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
  const conflict = serverError === FIELD_DEFINITION_CONFLICT_CAUSE && !done;
  const reason = serverError && !done && !conflict ? formReason(verb, serverError) : null;

  function refresh() {
    onReset();
    router.refresh();
  }

  function backToList() {
    router.replace(cancelHref);
  }

  return (
    <Form id="field-definition-form" className="single-column" onSubmit={handleSubmit}>
      {editing ? <input type="hidden" name="version" value={editing.version} /> : null}
      <fieldset className={styles.fields} disabled={isExecuting}>
        <div className={styles.nameGroup}>
          <TextField
            id="fd-name"
            name="name"
            label="이름"
            autoComplete="off"
            autoFocus={!done}
            maxLength={FIELD_NAME_MAX}
            defaultValue={editing?.name}
            readOnly={done}
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
        {editing ? (
          <Form.Field id="fd-type" label="타입" width="select">
            <span className={styles.typeText}>
              <span id="fd-type">{TYPE_OPTIONS.find((option) => option.value === editing.type)?.label}</span>
              <Link href={NEW_HREF} className={buttonLinkClassName("tertiary")}>
                새 화면 항목 추가
              </Link>
            </span>
          </Form.Field>
        ) : (
          <Form.Field id="fd-type" label="타입" width="select">
            <Select
              id="fd-type"
              options={TYPE_OPTIONS}
              value={type}
              disabled={done}
              onChange={(event) => {
                if (isFieldType(event.target.value)) setType(event.target.value);
              }}
            />
          </Form.Field>
        )}
        <Form.Field id="fd-required" label="필수" width="short">
          <input
            id="fd-required"
            name="required"
            type="checkbox"
            defaultChecked={editing?.required}
            disabled={done}
          />
        </Form.Field>
        <TextField
          id="fd-sort-order"
          name="sortOrder"
          label="정렬 순서"
          inputMode="numeric"
          autoComplete="off"
          defaultValue={initialSortOrder}
          readOnly={done}
          error={sortOrderError}
        />
        {isSelect ? (
          <div className={styles.optionEditor}>
            <div role="list" className={styles.optionList}>
              {options.active.map((value) => (
                <div role="listitem" key={value} className={styles.optionRow}>
                  <span className={styles.optionText}>{value}</span>
                  {done ? null : (
                    <Button variant="tertiary" aria-label={`${value} 삭제`} onClick={() => handleRemoveOption(value)}>
                      삭제
                    </Button>
                  )}
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
                      <StatusTag kind="muted" variant="text">
                        보관됨
                      </StatusTag>
                    </div>
                  ))}
                </div>
              </details>
            ) : null}
            {done ? null : (
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
            )}
          </div>
        ) : null}
      </fieldset>
      <Form.Actions>
        {done ? (
          <>
            <p ref={resultRef} role="status" tabIndex={-1} className={styles.resultLine}>
              화면 항목 {verb} · {savedName} {verb}됨
            </p>
            {!editing && canViewVisibility ? (
              <Link href={VISIBILITY_HREF} className={buttonLinkClassName("tertiary")}>
                정보 노출표 보기
              </Link>
            ) : null}
            {!editing ? (
              <Button variant="tertiary" onClick={onAddAnother}>
                하나 더 추가
              </Button>
            ) : null}
            <Button variant="secondary" onClick={backToList}>
              닫기
            </Button>
          </>
        ) : (
          <>
            {reason?.blocked ? (
              <Button
                type="submit"
                variant="primary"
                disabled
                disabledReason={reason.text}
                nextStep={
                  <Button variant="tertiary" onClick={reason.next === "list" ? backToList : refresh}>
                    {reason.next === "list" ? "목록으로" : "새로 불러오기"}
                  </Button>
                }
              >
                {submitLabel}
              </Button>
            ) : zeroOptions ? (
              <Button
                type="submit"
                variant="primary"
                disabled
                disabledReason={formReason(verb, OPTIONS_ZERO_CAUSE).text}
              >
                {submitLabel}
              </Button>
            ) : (
              <>
                <Button
                  type="submit"
                  variant="primary"
                  pending={isExecuting}
                  aria-describedby={reason || conflict ? REASON_ID : undefined}
                >
                  {submitLabel}
                </Button>
                {conflict ? (
                  <span id={REASON_ID} className={styles.reason}>
                    {verb}할 수 없음 — {CONFLICT_REASON} ·{" "}
                    <Button variant="tertiary" onClick={refresh}>
                      새로 불러오기
                    </Button>
                  </span>
                ) : null}
                {reason ? (
                  <span id={REASON_ID} className={styles.reason}>
                    {reason.text}
                  </span>
                ) : null}
              </>
            )}
            {isExecuting ? (
              <span aria-disabled="true" className={buttonLinkClassName("secondary")}>
                취소
              </span>
            ) : (
              <Link href={cancelHref} className={buttonLinkClassName("secondary")}>
                취소
              </Link>
            )}
          </>
        )}
      </Form.Actions>
    </Form>
  );
}
