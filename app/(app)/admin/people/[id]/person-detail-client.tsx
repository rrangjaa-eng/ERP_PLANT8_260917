"use client";

import { useAction } from "next-safe-action/hooks";
import { changePersonRoleAction, assignTeamAction, cancelAssignmentAction } from "../actions";
import { HistoryList, type HistoryEntry } from "@/ui/history-list/HistoryList";
import styles from "../people.module.css";

function errorMessageOf(result: { serverError?: unknown; validationErrors?: unknown }): string | null {
  if (typeof result.serverError === "string") return `저장하지 못했습니다 · ${result.serverError}`;
  if (result.validationErrors) return "저장하지 못했습니다 · 입력값을 확인하세요";
  return null;
}

export function PersonDetailClient({
  userId,
  roles,
  currentRoleId,
  teamOptions,
  entries,
}: {
  userId: string;
  roles: { id: string; name: string }[];
  currentRoleId: string | null;
  teamOptions: { value: string; label: string }[];
  entries: HistoryEntry[];
}) {
  const { execute: executeRoleChange, result: roleResult } = useAction(changePersonRoleAction);
  const { executeAsync: executeAssign } = useAction(assignTeamAction);
  const { executeAsync: executeCancel } = useAction(cancelAssignmentAction);

  const roleError = errorMessageOf(roleResult);

  return (
    <>
      <div className={styles.selectLabel}>
        <label htmlFor="person-role-change">계급 변경</label>
        <select
          id="person-role-change"
          className={styles.select}
          defaultValue={currentRoleId ?? ""}
          onChange={(event) => executeRoleChange({ userId, roleId: event.target.value })}
        >
          {roles.map((role) => (
            <option key={role.id} value={role.id}>
              {role.name}
            </option>
          ))}
        </select>
      </div>
      {roleError ? <p className={styles.registeredHint}>{roleError}</p> : null}

      <HistoryList
        entries={entries}
        valueKind={{ kind: "enum", options: teamOptions }}
        onAdd={async ({ effectiveFrom, value }) => {
          const result = await executeAssign({ userId, teamId: value, effectiveFrom });
          const message = errorMessageOf(result ?? {});
          if (message) throw new Error(message);
        }}
        onCancel={async (effectiveFrom) => {
          const result = await executeCancel({ userId, effectiveFrom });
          const message = errorMessageOf(result ?? {});
          if (message) throw new Error(message);
        }}
      />
    </>
  );
}
