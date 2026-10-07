"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { RowAction } from "@/ui/row-actions/RowActions";
import { formatKrw } from "@/lib/format-number";
import { deleteCardUsageAction, restoreCardUsageAction } from "./actions";
import styles from "./cards.module.css";

// 06-09(UI-SPEC S8 · §7-8 :1008): 행 `삭제` = 확인 없이 보관 → 표 위 결과 줄 `카드 사용 삭제됨 · {합계}` + `되돌리기`(마지막 한 건만).
// 결과 줄은 URL이 아니라 이 클라이언트 상태다(T-06-533 — 만든 링크가 `되돌리기`를 띄우지 못한다). page.tsx가 목록 화면 전체를 감싸고
// (마지막 행을 지워 빈 화면으로 바뀌어도 줄이 남게) 필터 · 월 · 쪽을 `key`로 줘 바뀌면 줄이 사라진다. 줄은 `CardUsageUndoLine`이 표 위에 그린다. 막힘은 서버 문구 그대로 `--status-danger`(공휴일의 `되돌리기 실패 ·` 머리는 붙이지 않는다 — S8 error 행).

const FAILED_REQUEST = "처리 중 오류 · 잠시 후 다시 시도";

type Removed = { id: string; version: number; totalKrw: number };
type ResultLine = { kind: "removed"; removed: Removed } | { kind: "failed"; text: string };
type ActionOutcome = { data?: { version: number; totalKrw: number }; serverError?: string } | undefined;

type DeleteUndoValue = {
  pendingId: string | null;
  line: ResultLine | null;
  shown: number;
  remove: (target: { id: string; version: number }) => void;
  undo: (removed: Removed) => void;
};

const DeleteUndoContext = createContext<DeleteUndoValue | null>(null);

function useDeleteUndo(): DeleteUndoValue {
  const value = useContext(DeleteUndoContext);
  if (!value) throw new Error("CardUsageDeleteUndo 밖에서 카드 사용 행동을 그렸다");
  return value;
}

async function run(action: () => Promise<ActionOutcome>): Promise<ActionOutcome> {
  try {
    return await action();
  } catch {
    return undefined;
  }
}

export function CardUsageDeleteUndo({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [line, setLine] = useState<ResultLine | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  // 새로 지울 때마다 `되돌리기`를 다시 그려 포커스를 준다.
  const [shown, setShown] = useState(0);

  async function remove(target: { id: string; version: number }) {
    setPendingId(target.id);
    const outcome = await run(() => deleteCardUsageAction(target));
    setPendingId(null);
    if (outcome?.data) {
      setLine({ kind: "removed", removed: { id: target.id, version: outcome.data.version, totalKrw: outcome.data.totalKrw } });
      setShown((count) => count + 1);
      router.refresh();
      return;
    }
    setLine({ kind: "failed", text: outcome?.serverError ?? FAILED_REQUEST });
  }

  async function undo(removed: Removed) {
    setPendingId(removed.id);
    const outcome = await run(() => restoreCardUsageAction({ id: removed.id, version: removed.version }));
    setPendingId(null);
    if (outcome?.data) {
      setLine(null);
      router.refresh();
      return;
    }
    setLine({ kind: "failed", text: outcome?.serverError ?? FAILED_REQUEST });
  }

  return (
    <DeleteUndoContext.Provider value={{ pendingId, line, shown, remove: (target) => void remove(target), undo: (removed) => void undo(removed) }}>
      {children}
    </DeleteUndoContext.Provider>
  );
}

// 표 위 결과 줄 — 마지막으로 지운 한 건(또는 막힘 문구). 포커스 → `되돌리기`.
export function CardUsageUndoLine() {
  const { line, shown, pendingId, undo } = useDeleteUndo();
  if (!line) return null;
  return (
    <p role="status" className={styles.undoLine}>
      {line.kind === "failed" ? (
        <span className={styles.undoFailed}>{line.text}</span>
      ) : (
        <>
          <span>
            카드 사용 삭제됨 · <span className={styles.undoAmount}>{formatKrw(line.removed.totalKrw)}</span>
          </span>
          <RowAction key={shown} pending={pendingId === line.removed.id} autoFocus onClick={() => undo(line.removed)}>
            되돌리기
          </RowAction>
        </>
      )}
    </p>
  );
}

// 행 `수정` — 같은 행 `삭제` 요청 중에는 누름을 막는다(aria-disabled, UI-SPEC S8 loading 행).
export function CardUsageEditAction({ id, href, name }: { id: string; href: string; name: string }) {
  const { pendingId } = useDeleteUndo();
  const label = (
    <>
      <span className="sr-only">{name}</span>수정
    </>
  );
  if (pendingId === id) {
    return (
      <RowAction busy onClick={() => undefined}>
        {label}
      </RowAction>
    );
  }
  return <RowAction href={href}>{label}</RowAction>;
}

// 행 `삭제`(RowAction danger — 맨 끝 · 위험 색). 접근 이름 `{사용일} {가맹점} 삭제`.
export function CardUsageDeleteButton({ id, version, name }: { id: string; version: number; name: string }) {
  const { pendingId, remove } = useDeleteUndo();
  return (
    <RowAction danger pending={pendingId === id} onClick={() => remove({ id, version })}>
      <span className="sr-only">{name}</span>삭제
    </RowAction>
  );
}
