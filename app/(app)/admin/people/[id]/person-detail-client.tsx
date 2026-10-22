"use client";

import { useRef, useState } from "react";
import { useAction } from "next-safe-action/hooks";
import { changePersonRoleAction, assignTeamAction, cancelAssignmentAction } from "../actions";
import { DetailScreen } from "@/ui/detail-screen/DetailScreen";
import { HistoryList, type HistoryEntry } from "@/ui/history-list/HistoryList";
import { Form } from "@/ui/form/Form";
import { Select } from "@/ui/select/Select";
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
  lockedReason,
}: {
  userId: string;
  roles: { id: string; name: string }[];
  currentRoleId: string | null;
  lockedReason?: string | null;
}) {
  // 보관된 계급은 roles에서 빠진다 — 맞는 항목이 없으면 브라우저가 첫 계급을
  // 골라 현재 계급처럼 보이므로 빈 값(「계급 선택」)에서 시작한다.
  const hasCurrentRole = roles.some((role) => role.id === currentRoleId);
  const initial = hasCurrentRole ? (currentRoleId ?? "") : "";
  // 06.4(D-6414 · D4 · D5 · D7): 잠기면 이유 한 줄만, 거부되면 저장값으로 — 저장 중 바꾸기는 무시(포커스 유지)
  const savedRef = useRef(initial);
  const [value, setValue] = useState(initial);
  const {
    execute: executeRoleChange,
    result: roleResult,
    isExecuting,
  } = useAction(changePersonRoleAction, {
    onSuccess: ({ input }) => {
      savedRef.current = input.roleId;
    },
    onError: () => setValue(savedRef.current),
  });

  if (lockedReason) return <Form.Hint>{lockedReason}</Form.Hint>;

  const roleError = errorMessageOf(roleResult);

  return (
    <>
      {/* 07-17 N10(SC-15): 공용 Select — 즉시 저장 · 저장 중 aria-busy · 오류 줄(Select 것)은 그대로. */}
      <div className={styles.roleChange}>
        <Form.Field id="person-role-change" label="계급 변경" width="select">
          <Select
            id="person-role-change"
            hideEmptyOption
            value={value}
            aria-busy={isExecuting || undefined}
            error={roleError ?? undefined}
            options={[
              ...(hasCurrentRole ? [] : [{ value: "", label: "계급 선택" }]),
              ...roles.map((role) => ({ value: role.id, label: role.name })),
            ]}
            onChange={(event) => {
              // 「계급 선택」(빈 값)은 고를 수 없던 자리 — 저장하지 않는다(이관 전 disabled 옵션과 같은 결과).
              if (isExecuting || event.target.value === "") return;
              setValue(event.target.value);
              executeRoleChange({ userId, roleId: event.target.value });
            }}
          />
        </Form.Field>
      </div>
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
    <DetailScreen.Section title="소속 발령 이력">
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
    </DetailScreen.Section>
  );
}
