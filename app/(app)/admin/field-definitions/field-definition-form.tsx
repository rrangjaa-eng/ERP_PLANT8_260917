"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAction } from "next-safe-action/hooks";
import { Form } from "@/ui/form/Form";
import { TextField } from "@/ui/input/TextField";
import { Select } from "@/ui/select/Select";
import { Button, buttonLinkClassName } from "@/ui/button/Button";
import { createFieldDefinitionAction } from "./actions";

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

// 04.5-01 등록 폼(UI-SPEC 화면 2) — 칸 넷 + 1차 「화면 항목 추가」 + 2차 「취소」. 성공하면 폼을 닫는다.
// 결과 줄 · 칸 오류 · 이유 자리 · 제출 중 잠금 · 정렬 기본값은 08(E2 행).
export function FieldDefinitionForm({ cancelHref }: { cancelHref: string }) {
  const router = useRouter();
  const [type, setType] = useState<FieldType>("text");
  const { execute, isExecuting } = useAction(createFieldDefinitionAction, {
    onSuccess: () => router.replace(cancelHref),
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    execute({
      name: stringField(data, "name"),
      type,
      required: data.get("required") === "on",
      sortOrder: Number(stringField(data, "sortOrder")),
    });
  }

  return (
    <Form id="field-definition-form" className="single-column" onSubmit={handleSubmit}>
      <TextField id="fd-name" name="name" label="이름" autoComplete="off" autoFocus />
      <Form.Field id="fd-type" label="타입" width="select">
        <Select
          id="fd-type"
          options={TYPE_OPTIONS}
          value={type}
          onChange={(event) => {
            if (isFieldType(event.target.value)) setType(event.target.value);
          }}
        />
      </Form.Field>
      <Form.Field id="fd-required" label="필수" width="short">
        <input id="fd-required" name="required" type="checkbox" />
      </Form.Field>
      <TextField id="fd-sort-order" name="sortOrder" label="정렬 순서" inputMode="numeric" autoComplete="off" />
      <Form.Actions>
        <Button type="submit" variant="primary" pending={isExecuting}>
          화면 항목 추가
        </Button>
        <Link href={cancelHref} className={buttonLinkClassName("secondary")}>
          취소
        </Link>
      </Form.Actions>
    </Form>
  );
}
