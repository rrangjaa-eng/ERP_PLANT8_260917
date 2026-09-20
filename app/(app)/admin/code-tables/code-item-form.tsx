"use client";

import { useRef, type FormEvent } from "react";
import { useAction } from "next-safe-action/hooks";
import { createCodeItemAction, setCodeItemActiveAction } from "./actions";
import { TextField } from "@/ui/input/TextField";
import { Button } from "@/ui/button/Button";
import { FormAlert } from "@/ui/form-alert/FormAlert";

function getStringField(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

// SYSTEM.md §6-3 폼 템플릿 재사용(D-39) — 목록 위에 펼치는 폼이고 모달이 아니다.
export function CodeItemForm({ tableKey }: { tableKey: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const { execute, result, isExecuting } = useAction(createCodeItemAction, {
    onSuccess: () => formRef.current?.reset(),
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    execute({
      tableKey,
      value: getStringField(formData, "value"),
      label: getStringField(formData, "label"),
      sortOrder: Number(getStringField(formData, "sortOrder") || "0"),
    });
  }

  const valueError = result.validationErrors?.value?._errors?.[0];
  const labelError = result.validationErrors?.label?._errors?.[0];

  return (
    <form ref={formRef} onSubmit={handleSubmit} id="code-item-form">
      <TextField id="value" name="value" label="값" required error={valueError} />
      <TextField id="label" name="label" label="이름" required error={labelError} />
      <TextField id="sortOrder" name="sortOrder" label="정렬 순서" type="number" defaultValue={0} />
      {result.serverError ? <FormAlert>{result.serverError}</FormAlert> : null}
      <Button type="submit" variant="primary" pending={isExecuting}>
        코드 추가
      </Button>
    </form>
  );
}

// §6-1 목록 행 3차 버튼 — 되돌릴 수 있는 상태 변경이라 확인 모달 없음, 즉시
// 반영(03-UI-SPEC.md 「비활성화 표현」).
export function CodeItemActiveToggle({ id, active }: { id: string; active: boolean }) {
  const { execute, isExecuting } = useAction(setCodeItemActiveAction);

  return (
    <Button
      variant="tertiary"
      pending={isExecuting}
      onClick={() => execute({ id, active: !active })}
    >
      {active ? "비활성화" : "활성화"}
    </Button>
  );
}
