"use client";

import type { FormEvent } from "react";
import { useAction } from "next-safe-action/hooks";
import { changePasswordAction } from "./actions";
import { TextField } from "@/ui/input/TextField";
import { Button } from "@/ui/button/Button";

function getStringField(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

// SYSTEM.md §6-3 폼 템플릿 재사용(D-30). next-safe-action 배선·필드 오류 추출
// 모양은 그대로 — 서버가 돌려주는 검증 메시지 문자열은 한 글자도 바꾸지 않는다
// (test/e2e/change-password.spec.ts 계약). 버튼 위계(§7-1): 이 화면의 1차 버튼은
// 이 하나뿐 — 로그아웃은 2차(logout-button.tsx).
export function ChangePasswordForm() {
  const { execute, result, isExecuting } = useAction(changePasswordAction);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    execute({
      currentPassword: getStringField(formData, "currentPassword"),
      newPassword: getStringField(formData, "newPassword"),
    });
  }

  const currentPasswordError = result.validationErrors?.currentPassword?._errors?.[0];
  const newPasswordError = result.validationErrors?.newPassword?._errors?.[0];

  return (
    <form onSubmit={handleSubmit}>
      <h2>비밀번호 변경</h2>
      <TextField
        id="currentPassword"
        name="currentPassword"
        label="현재 비밀번호"
        type="password"
        autoComplete="current-password"
        required
        error={currentPasswordError}
      />
      <TextField
        id="newPassword"
        name="newPassword"
        label="새 비밀번호"
        type="password"
        autoComplete="new-password"
        required
        error={newPasswordError}
      />
      {result.serverError ? <p role="alert">{result.serverError}</p> : null}
      <Button type="submit" variant="primary" pending={isExecuting}>
        비밀번호 변경
      </Button>
    </form>
  );
}
