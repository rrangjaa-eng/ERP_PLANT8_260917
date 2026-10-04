"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { RowAction, RowActions } from "@/ui/row-actions/RowActions";
import { restoreHolidayAction } from "./actions";
import styles from "./holidays.module.css";

// 04.2-UI-SPEC S2-f — 확인 대신 되돌리기. 결과 줄 상태는 URL이 아니라 이 클라이언트
// 상태가 들고 있다(T-4.2-74 — 만든 링크가 `되돌리기`를 띄우지 못한다). page.tsx가
// `key={연도}`로 감싸 연도를 바꾸면 줄이 사라진다(패널은 목록을 바꾸지 않아 열고 닫아도 남는다 — 04.6-16 R4). 지운 행은 쌓아 두고 맨 나중 것을
// 보인다 — 되돌리면 그 앞 것이 다시 보인다(04.2 /review 이월 — 다음 삭제가 앞 되돌리기를 지우지 않게).
export type RemovedHoliday = { id: string; date: string; name: string; kind: "temporary" | "election" };

type UndoResult =
  | { data?: unknown; validationErrors?: { _errors?: string[] }; serverError?: unknown }
  | null
  | undefined;

// 되돌리기 결과 → 결과 줄 실패 문구. 거절(루트 오류)은 원인(마지막 ` · ` 앞부분 — 이름에 ` · `가 있어도 잘리지 않게)을 싣고
// `되돌리기`를 치운다. 연결·서버 실패(던짐은 null로 넘긴다)는 `다시 시도`로 남긴다.
export function undoFailure(result: UndoResult): { text: string; retry: boolean } | null {
  if (result?.data) return null;
  const reason = result?.validationErrors?._errors?.[0];
  if (reason) {
    const cut = reason.lastIndexOf(" · ");
    return { text: `되돌리기 실패 · ${cut < 0 ? reason : reason.slice(0, cut)}`, retry: false };
  }
  return { text: "되돌리기 실패 · 다시 시도", retry: true };
}

type DeleteUndoContextValue = {
  show: (removed: RemovedHoliday) => void;
  focusDate: string | null;
  clearFocus: () => void;
};

const DeleteUndoContext = createContext<DeleteUndoContextValue | null>(null);

export function useDeleteUndo(): DeleteUndoContextValue {
  const value = useContext(DeleteUndoContext);
  if (!value) throw new Error("DeleteUndoSection 밖에서 useDeleteUndo를 불렀다");
  return value;
}

export function DeleteUndoSection({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [stack, setStack] = useState<RemovedHoliday[]>([]);
  // 새로 지울 때만 `되돌리기`를 다시 그려 포커스를 준다 — 되돌린 뒤 앞 것이 보일 때는 복원된 행이 포커스를 받는다.
  const [shown, setShown] = useState(0);
  // 대기 · 연결 실패는 그 행(id)에만 붙는다 — 다른 행이 맨 위에 와도 옮겨 붙지 않는다(/review PR #146).
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [retryFailure, setRetryFailure] = useState<{ id: string; text: string } | null>(null);
  // 다시 해도 안 되는 거절 — 그 행은 결과 줄에서 빼고 문구만 남겨 앞서 지운 행을 계속 되돌릴 수 있게 한다.
  const [rejection, setRejection] = useState<string | null>(null);
  const [focusDate, setFocusDate] = useState<string | null>(null);
  // 같은 함수를 유지한다 — 먼저 되돌린 행의 효과가 다시 돌며 다음 되돌린 행의 표식을 지우지 않게.
  const clearFocus = useCallback(() => setFocusDate(null), []);

  const removed = stack.at(-1) ?? null;
  const removedFailure = removed && retryFailure?.id === removed.id ? retryFailure.text : null;

  function show(next: RemovedHoliday) {
    setStack((current) => [...current.filter((item) => item.id !== next.id), next]);
    setShown((count) => count + 1);
    setRejection(null);
  }

  async function handleUndo() {
    if (!removed) return;
    const target = removed;
    setPendingId(target.id);
    setRetryFailure(null);
    setRejection(null);
    let result: UndoResult = null;
    try {
      result = await restoreHolidayAction({ id: target.id });
    } catch {
      result = null;
    }
    setPendingId((current) => (current === target.id ? null : current));
    const failed = undoFailure(result);
    if (failed?.retry) {
      setRetryFailure({ id: target.id, text: failed.text });
      return;
    }
    setStack((current) => current.filter((item) => item.id !== target.id));
    if (failed) {
      setRejection(failed.text);
      return;
    }
    setFocusDate(target.date);
    router.refresh();
  }

  return (
    <DeleteUndoContext.Provider value={{ show, focusDate, clearFocus }}>
      {removed || rejection ? (
        <p role="status" className={styles.undoLine}>
          {rejection ? <span className={styles.undoFailed}>{rejection}</span> : null}
          {removed ? (
            <>
              <span className={removedFailure ? styles.undoFailed : undefined}>
                {removedFailure ?? `${removed.date} ${removed.name} 삭제됨`}
              </span>
              <RowActions>
                <RowAction key={shown} pending={pendingId === removed.id} autoFocus onClick={() => void handleUndo()}>
                  되돌리기
                </RowAction>
              </RowActions>
            </>
          ) : null}
        </p>
      ) : null}
      {children}
    </DeleteUndoContext.Provider>
  );
}
