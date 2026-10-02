"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAction } from "next-safe-action/hooks";
import { Form } from "@/ui/form/Form";
import { TextField } from "@/ui/input/TextField";
import { Select } from "@/ui/select/Select";
import { Button, buttonLinkClassName } from "@/ui/button/Button";
import { FIELD_NAME_MAX } from "@/domain/custom-fields/targets";
import { NAME_CONFLICT_ARCHIVED_RESTORE_MESSAGE } from "@/domain/custom-fields/admin-input";
import { formReason } from "@/lib/actions/form-reason";
import { createFieldDefinitionAction } from "./actions";
import styles from "./field-definitions.module.css";

type FieldType = "text" | "number" | "date";

const TYPE_OPTIONS: Array<{ value: FieldType; label: string }> = [
  { value: "text", label: "텍스트" },
  { value: "number", label: "숫자" },
  { value: "date", label: "날짜" },
];

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

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isExecuting || addedName !== null) return;
    const data = new FormData(event.currentTarget);
    submittedName.current = stringField(data, "name").trim();
    const sortOrderText = stringField(data, "sortOrder").trim();
    execute({
      name: stringField(data, "name"),
      type,
      required: data.get("required") === "on",
      // 빈 칸은 0이 아니라 숫자가 아닌 값으로 보내 서버의 범위 오류 문구를 받는다.
      sortOrder: sortOrderText === "" ? Number.NaN : Number(sortOrderText),
    });
  }

  const done = addedName !== null;
  const nameError = result.validationErrors?.name?._errors?.[0];
  const sortOrderError = result.validationErrors?.sortOrder?._errors?.[0];
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
