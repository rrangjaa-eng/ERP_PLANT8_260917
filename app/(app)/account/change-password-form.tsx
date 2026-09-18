"use client";

import type { FormEvent } from "react";
import { useAction } from "next-safe-action/hooks";
import { changePasswordAction } from "./actions";

function getStringField(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

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
      <div>
        <label htmlFor="currentPassword">현재 비밀번호</label>
        <input
          id="currentPassword"
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          required
        />
        {currentPasswordError ? <p role="alert">{currentPasswordError}</p> : null}
      </div>
      <div>
        <label htmlFor="newPassword">새 비밀번호</label>
        <input id="newPassword" name="newPassword" type="password" autoComplete="new-password" required />
        {newPasswordError ? <p role="alert">{newPasswordError}</p> : null}
      </div>
      {result.serverError ? <p role="alert">{result.serverError}</p> : null}
      <button type="submit" disabled={isExecuting}>
        비밀번호 변경
      </button>
    </form>
  );
}
