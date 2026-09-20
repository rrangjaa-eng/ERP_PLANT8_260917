"use client";

import { useRef, useState, type FormEvent } from "react";
import { useAction } from "next-safe-action/hooks";
import { createRoleAction, renameRoleAction, archiveRoleAction } from "../actions";
import { TextField } from "@/ui/input/TextField";
import { Button } from "@/ui/button/Button";
import { FormAlert } from "@/ui/form-alert/FormAlert";
import styles from "../people.module.css";

export type RoleRowView = { id: string; name: string; isSeed: boolean; sortOrder: number };

function getStringField(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function RoleRow({ role }: { role: RoleRowView }) {
  const [name, setName] = useState(role.name);
  const { execute: executeRename, result: renameResult } = useAction(renameRoleAction);
  const { execute: executeArchive, isExecuting: archiving } = useAction(archiveRoleAction);

  return (
    <tr>
      <td>
        <input
          className={styles.select}
          aria-label={`${role.name} 이름`}
          value={name}
          onChange={(event) => setName(event.target.value)}
          onBlur={() => {
            if (name.trim() && name !== role.name) executeRename({ id: role.id, name });
          }}
        />
        {renameResult.serverError ? <p className={styles.registeredHint}>{renameResult.serverError}</p> : null}
      </td>
      <td>{role.isSeed ? "시드" : ""}</td>
      <td>{role.sortOrder}</td>
      <td>
        {role.isSeed ? null : (
          <Button variant="tertiary" pending={archiving} onClick={() => executeArchive({ id: role.id })}>
            보관
          </Button>
        )}
      </td>
    </tr>
  );
}

export function RolesClient({ roles }: { roles: RoleRowView[] }) {
  const formRef = useRef<HTMLFormElement>(null);
  const { execute, result, isExecuting } = useAction(createRoleAction, {
    onSuccess: () => formRef.current?.reset(),
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    execute({ name: getStringField(formData, "name") });
  }

  const nameError = result.validationErrors?.name?._errors?.[0];

  return (
    <>
      <form ref={formRef} onSubmit={handleSubmit} id="role-form">
        <TextField id="role-name" name="name" label="이름" required error={nameError} />
        {result.serverError ? <FormAlert>{result.serverError}</FormAlert> : null}
        <Button type="submit" variant="primary" pending={isExecuting}>
          계급 추가
        </Button>
      </form>

      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col">이름</th>
            <th scope="col">시드 여부</th>
            <th scope="col">정렬</th>
            <th scope="col">동작</th>
          </tr>
        </thead>
        <tbody>
          {roles.map((role) => (
            <RoleRow key={role.id} role={role} />
          ))}
        </tbody>
      </table>
    </>
  );
}
