"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { changePersonRoleAction, assignTeamAction, cancelAssignmentAction, unlockPersonAction } from "../actions";
import { resetPersonPasswordAction } from "./actions";
import { Button } from "@/ui/button/Button";
import { ConfirmDialog } from "@/ui/confirm-dialog/ConfirmDialog";
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

// 07-17 SC-12(N4 · D-P2-2 · D-P2-7): 상세 로그인 섹션의 두 행동. `잠금 풀기` 성공의 결과는 위 `로그인 상태` 값 변화뿐(토스트 · 결과 줄 없음 —
// 액션이 상세 경로를 재검증한다). `비밀번호 초기화`는 확인 모달 → 같은 창 결과 단계. 임시 비밀번호는 이 컴포넌트 상태에만 있고
// `닫기`가 지운다 — 토스트 · URL · console에 넣지 않고, 화면 갱신은 값과 무관한 `router.refresh`로 한다.
const RESET_BUTTON_ID = "person-password-reset";

export function PersonLoginActions({ userId, name, canUnlock }: { userId: string; name: string; canUnlock: boolean }) {
  const router = useRouter();
  const [unlocking, setUnlocking] = useState(false);
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [tempPassword, setTempPassword] = useState<string | null>(null);

  async function unlock() {
    if (unlocking) return;
    setUnlocking(true);
    const result = await unlockPersonAction({ personId: userId }).catch(() => undefined);
    setUnlocking(false);
    if (!result || result.serverError || result.validationErrors) {
      setUnlockError(typeof result?.serverError === "string" ? result.serverError : "잠금 풀기 실패 · 다시 시도");
      return;
    }
    setUnlockError(null);
    // 사라지는 `잠금 풀기` 자리 — 같은 줄에 남는 `비밀번호 초기화`로.
    document.getElementById(RESET_BUTTON_ID)?.focus();
  }

  async function reset() {
    if (resetting) return;
    setResetting(true);
    const result = await resetPersonPasswordAction({ personId: userId }).catch(() => undefined);
    setResetting(false);
    if (!result?.data) {
      setResetError(typeof result?.serverError === "string" ? result.serverError : "비밀번호 초기화 실패 · 다시 시도");
      return;
    }
    setTempPassword(result.data.tempPassword);
    router.refresh();
  }

  function close() {
    setOpen(false);
    setTempPassword(null);
    setResetError(null);
  }

  return (
    <>
      <div className={styles.loginActions}>
        {canUnlock ? (
          <Button variant="tertiary" pending={unlocking} onClick={() => void unlock()}>
            잠금 풀기
          </Button>
        ) : null}
        <Button id={RESET_BUTTON_ID} variant="tertiary" onClick={() => setOpen(true)}>
          비밀번호 초기화
        </Button>
      </div>
      {unlockError ? (
        <p role="alert" className={`${styles.resultLine} ${styles.resultFailed}`}>
          {unlockError}
        </p>
      ) : null}
      <ConfirmDialog
        open={open}
        onClose={close}
        title="비밀번호 초기화"
        subtitle={name}
        resultLines={["기존 비밀번호는 쓸 수 없게 됨 · 잠금도 풀림"]}
        primary={{ label: "비밀번호 초기화", onConfirm: () => void reset(), pending: resetting, disabledReason: resetError ?? undefined }}
        result={tempPassword === null ? undefined : { label: "임시 비밀번호", value: tempPassword }}
      />
    </>
  );
}

export function PersonHistorySection({
  userId,
  teamOptions,
  entries,
  canAdd = true,
}: {
  userId: string;
  teamOptions: { value: string; label: string }[];
  entries: HistoryEntry[];
  // 07-17 R15: 상한 밖 대상이면 「새 이력 추가」를 그리지 않는다.
  canAdd?: boolean;
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
        canAdd={canAdd}
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
