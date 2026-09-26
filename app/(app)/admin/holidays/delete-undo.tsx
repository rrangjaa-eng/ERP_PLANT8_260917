"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/ui/button/Button";
import { addHolidayAction } from "./actions";
import styles from "./holidays.module.css";

// 04.2-UI-SPEC S2-f — 확인 대신 되돌리기. 결과 줄 상태는 URL이 아니라 이 클라이언트
// 상태가 들고 있다(T-4.2-74 — 만든 링크가 `되돌리기`를 띄우지 못한다). page.tsx가
// `key={연도:폼}`로 감싸 연도를 바꾸거나 폼을 열면 줄이 사라진다.
export type RemovedHoliday = { date: string; name: string; kind: "temporary" | "election" };

type UndoResult =
  | { data?: unknown; validationErrors?: { date?: { _errors?: string[] } }; serverError?: unknown }
  | null
  | undefined;

// 되돌리기 결과 → 결과 줄 실패 문구. 거절(날짜 칸 오류)은 원인(` · ` 앞부분)을 싣고
// `되돌리기`를 치운다. 연결·서버 실패(던짐은 null로 넘긴다)는 `다시 시도`로 남긴다.
export function undoFailure(result: UndoResult): { text: string; retry: boolean } | null {
  if (result?.data) return null;
  const reason = result?.validationErrors?.date?._errors?.[0];
  if (reason) return { text: `되돌리기 실패 · ${reason.split(" · ")[0]}`, retry: false };
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
  const [removed, setRemoved] = useState<RemovedHoliday | null>(null);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<{ text: string; retry: boolean } | null>(null);
  const [focusDate, setFocusDate] = useState<string | null>(null);

  function show(next: RemovedHoliday) {
    setRemoved(next);
    setFailure(null);
    setPending(false);
  }

  async function handleUndo() {
    if (!removed) return;
    setPending(true);
    let result: UndoResult = null;
    try {
      result = await addHolidayAction(removed);
    } catch {
      result = null;
    }
    const failed = undoFailure(result);
    if (!failed) {
      setFocusDate(removed.date);
      setRemoved(null);
      setPending(false);
      router.refresh();
      return;
    }
    setFailure(failed);
    setPending(false);
  }

  return (
    <DeleteUndoContext.Provider value={{ show, focusDate, clearFocus: () => setFocusDate(null) }}>
      {removed ? (
        <p role="status" className={styles.undoLine}>
          <span className={failure ? styles.undoFailed : undefined}>
            {failure ? failure.text : `${removed.date} ${removed.name} 삭제됨`}
          </span>
          {!failure || failure.retry ? (
            <Button
              key={removed.date}
              variant="tertiary"
              pending={pending}
              autoFocus
              onClick={() => void handleUndo()}
            >
              되돌리기
            </Button>
          ) : null}
        </p>
      ) : null}
      {children}
    </DeleteUndoContext.Provider>
  );
}
