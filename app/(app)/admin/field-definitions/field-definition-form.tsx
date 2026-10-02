"use client";

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAction } from "next-safe-action/hooks";
import { Form } from "@/ui/form/Form";
import { TextField } from "@/ui/input/TextField";
import { Select } from "@/ui/select/Select";
import { Button, buttonLinkClassName } from "@/ui/button/Button";
import { ACTIVE_OPTIONS_MAX, FIELD_NAME_MAX, OPTION_MAX_LENGTH } from "@/domain/custom-fields/targets";
import {
  NAME_CONFLICT_ARCHIVED_RESTORE_MESSAGE,
  OPTION_DUPLICATE_MESSAGE,
  OPTION_EMPTY_MESSAGE,
  OPTION_LIMIT_MESSAGE,
  OPTIONS_ZERO_CAUSE,
} from "@/domain/custom-fields/admin-input";
import { addOption, removeOption, type OptionError, type OptionState } from "@/domain/custom-fields/options";
import { formReason } from "@/lib/actions/form-reason";
import { createFieldDefinitionAction } from "./actions";
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

type FormProps = {
  cancelHref: string;
  /** 정렬 순서 기본값 = min(활성 최대값 + 1, 999), 활성 정의가 없으면 1(서버가 계산해 넘긴다). */
  defaultSortOrder: number;
  /** `admin.visibility` 보기 권한이 있을 때만 결과 줄에 「정보 노출표 보기」(D10-13 자동 등록 확인). */
  canViewVisibility: boolean;
};

// 04.5 등록 폼(UI-SPEC 화면 2) — 빈 상태가 없다: 칸은 항상 있고 타입 「텍스트」 · 정렬 기본값이 채워져 있다.
// 「하나 더 추가」는 이 래퍼가 본체의 key를 바꿔 React 상태까지 다시 마운트한다(재마운트된 이름 입력이 autoFocus로 포커스를 받는다).
export function FieldDefinitionForm(props: FormProps) {
  const [generation, setGeneration] = useState(0);
  return <FieldDefinitionFormBody key={generation} {...props} onAddAnother={() => setGeneration((value) => value + 1)} />;
}

function FieldDefinitionFormBody({
  cancelHref,
  defaultSortOrder,
  canViewVisibility,
  onAddAnother,
}: FormProps & { onAddAnother: () => void }) {
  const router = useRouter();
  const [type, setType] = useState<FieldType>("text");
  // 등록 모드의 선택지는 전부 저장 전이라 삭제는 목록에서 빼기뿐이다(savedOptions 빈 배열).
  const [options, setOptions] = useState<OptionState>({ active: [], archived: [] });
  const [newOption, setNewOption] = useState("");
  const [optionError, setOptionError] = useState<OptionError | null>(null);
  // 서버 재검증으로 page가 새 기본값을 넘겨도 열린 폼의 입력값이 바뀌지 않게 마운트 시점 값을 쥔다.
  const [initialSortOrder] = useState(defaultSortOrder);
  const [addedName, setAddedName] = useState<string | null>(null);
  const resultRef = useRef<HTMLParagraphElement>(null);
  const submittedName = useRef("");

  const { execute, result, isExecuting, reset } = useAction(createFieldDefinitionAction, {
    onSuccess: () => setAddedName(submittedName.current),
  });

  useEffect(() => {
    if (addedName !== null) resultRef.current?.focus();
  }, [addedName]);

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
    setOptions(removeOption(options, value, []));
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
    if (isExecuting || addedName !== null || zeroOptions) return;
    const data = new FormData(event.currentTarget);
    submittedName.current = stringField(data, "name").trim();
    const sortOrderText = stringField(data, "sortOrder").trim();
    execute({
      name: stringField(data, "name"),
      type,
      required: data.get("required") === "on",
      // 빈 칸은 0이 아니라 숫자가 아닌 값으로 보내 서버의 범위 오류 문구를 받는다.
      sortOrder: sortOrderText === "" ? Number.NaN : Number(sortOrderText),
      options: isSelect ? options.active : undefined,
    });
  }

  const done = addedName !== null;
  const nameError = result.validationErrors?.name?._errors?.[0];
  const sortOrderError = result.validationErrors?.sortOrder?._errors?.[0];
  // 배열 칸의 오류 모양은 칸 전체({ _errors }) 또는 원소별 배열이다 — 칸 전체 오류만 이 칸 아래에 보인다.
  const optionsErrors = result.validationErrors?.options;
  const serverOptionsError = optionsErrors && !Array.isArray(optionsErrors) ? optionsErrors._errors?.[0] : undefined;
  const shownOptionError = optionError ? OPTION_ERROR_MESSAGES[optionError] : serverOptionsError;
  const archivedRestoreLink = nameError === NAME_CONFLICT_ARCHIVED_RESTORE_MESSAGE;
  const reason = result.serverError && !done ? formReason("추가", result.serverError) : null;

  function refresh() {
    reset();
    router.refresh();
  }

  return (
    <Form id="field-definition-form" className="single-column" onSubmit={handleSubmit}>
      <fieldset className={styles.fields} disabled={isExecuting}>
        <div className={styles.nameGroup}>
          <TextField
            id="fd-name"
            name="name"
            label="이름"
            autoComplete="off"
            autoFocus
            maxLength={FIELD_NAME_MAX}
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
        <Form.Field id="fd-required" label="필수" width="short">
          <input id="fd-required" name="required" type="checkbox" disabled={done} />
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
              화면 항목 추가 · {addedName} 추가됨
            </p>
            {canViewVisibility ? (
              <Link href={VISIBILITY_HREF} className={buttonLinkClassName("tertiary")}>
                정보 노출표 보기
              </Link>
            ) : null}
            <Button variant="tertiary" onClick={onAddAnother}>
              하나 더 추가
            </Button>
            <Button variant="secondary" onClick={() => router.replace(cancelHref)}>
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
                  <Button variant="tertiary" onClick={refresh}>
                    새로 불러오기
                  </Button>
                }
              >
                화면 항목 추가
              </Button>
            ) : zeroOptions ? (
              <Button
                type="submit"
                variant="primary"
                disabled
                disabledReason={formReason("추가", OPTIONS_ZERO_CAUSE).text}
              >
                화면 항목 추가
              </Button>
            ) : (
              <>
                <Button
                  type="submit"
                  variant="primary"
                  pending={isExecuting}
                  aria-describedby={reason ? REASON_ID : undefined}
                >
                  화면 항목 추가
                </Button>
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
