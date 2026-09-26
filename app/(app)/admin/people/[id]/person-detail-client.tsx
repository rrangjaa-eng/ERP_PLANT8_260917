"use client";

import { useAction } from "next-safe-action/hooks";
import { changePersonRoleAction, assignTeamAction, cancelAssignmentAction } from "../actions";
import { HistoryList, type HistoryEntry } from "@/ui/history-list/HistoryList";
import styles from "../people.module.css";

function errorMessageOf(result: { serverError?: unknown; validationErrors?: unknown }): string | null {
  if (typeof result.serverError === "string") return `저장 실패 · ${result.serverError}`;
  if (result.validationErrors) return "저장 실패 · 입력값 확인";
  return null;
}

// SYSTEM.md §3 「단일 기둥 최대 폭」은 데이터 표를 제외한다 — 계급 변경은
// page.tsx의 .single-column 안에, 발령 이력(표)은 PersonHistorySection으로
// 나눠 .single-column 밖에 둔다(260922-o2b 후속).
export function PersonRoleChange({
  userId,
  roles,
  currentRoleId,
}: {
  userId: string;
  roles: { id: string; name: string }[];
  currentRoleId: string | null;
}) {
  const { execute: executeRoleChange, result: roleResult } = useAction(changePersonRoleAction);

  const roleError = errorMessageOf(roleResult);
  // 보관된 계급은 roles에서 빠진다 — 맞는 항목이 없으면 브라우저가 첫 계급을
  // 골라 현재 계급처럼 보이므로 빈 값(「계급 선택」)에서 시작한다.
  const hasCurrentRole = roles.some((role) => role.id === currentRoleId);

  return (
    <>
      <div className={styles.selectLabel}>
        <label htmlFor="person-role-change">계급 변경</label>
        <select
          id="person-role-change"
          className={styles.select}
          defaultValue={hasCurrentRole ? (currentRoleId ?? "") : ""}
          onChange={(event) => executeRoleChange({ userId, roleId: event.target.value })}
        >
          {hasCurrentRole ? null : (
            <option value="" disabled>
              계급 선택
            </option>
          )}
          {roles.map((role) => (
            <option key={role.id} value={role.id}>
              {role.name}
            </option>
          ))}
        </select>
      </div>
      {roleError ? <p className={styles.registeredHint}>{roleError}</p> : null}
    </>
  );
}

export function PersonHistorySection({
  userId,
  teamOptions,
  entries,
}: {
  userId: string;
  teamOptions: { value: string; label: string }[];
  entries: HistoryEntry[];
}) {
  const { executeAsync: executeAssign } = useAction(assignTeamAction);
  const { executeAsync: executeCancel } = useAction(cancelAssignmentAction);

  return (
    <section className={styles.historySection}>
      <h2 className={styles.historySectionTitle}>소속 발령 이력</h2>
      <HistoryList
        entries={entries}
        valueKind={{ kind: "enum", options: teamOptions }}
        idPrefix={`person-team-history-${userId}`}
        caption="소속 발령 이력"
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
    </section>
  );
}
