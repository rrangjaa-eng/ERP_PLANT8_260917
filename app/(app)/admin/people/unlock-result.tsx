"use client";

import { createContext, useContext, useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { RowAction } from "@/ui/row-actions/RowActions";
import { unlockPersonAction } from "./actions";
import styles from "./people.module.css";

// 07-17 SC-11(N4 · U6 · U7): 확인 창 없이 바로 푸는 즉시 동작 — 결과는 토스트가 아니라 표 위 결과 줄 한 줄
// `잠금 풀기 · {이름}`(`DeleteUndoSection` 꼴에서 되돌리기를 뺀 것). 마지막 한 건만 보이고 다음 제자리 행동이나
// 화면 이탈까지 남는다(타이머로 지우지 않는다). 요청 중 그 행동만 aria-busy · aria-disabled(연타 요청 하나).
type UnlockTarget = { id: string; name: string };

type UnlockContextValue = { unlock: (target: UnlockTarget) => void; pendingIds: ReadonlySet<string> };

const UnlockContext = createContext<UnlockContextValue | null>(null);

export function UnlockResultSection({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [line, setLine] = useState<{ text: string; failed: boolean } | null>(null);
  const [pendingIds, setPendingIds] = useState<ReadonlySet<string>>(new Set());
  // 상태 갱신 전 같은 틱의 두 번째 누름도 막는다 — 요청 하나.
  const inflight = useRef(new Set<string>());
  const [refreshing, startRefresh] = useTransition();
  const focusId = useRef<string | null>(null);
  const lineRef = useRef<HTMLParagraphElement>(null);

  // 사라진 `잠금 풀기` 자리 — 같은 행의 남은 행동(`상세`)으로, 그 행이 목록에서 빠졌으면(`잠김` 필터) 결과 줄로.
  // 새로 고침(transition)이 끝난 뒤 한 번 — 새 목록에서 찾는다.
  useEffect(() => {
    if (refreshing || focusId.current === null) return;
    const link = document.querySelector<HTMLAnchorElement>(`tbody a[href="/admin/people/${focusId.current}"]`);
    focusId.current = null;
    (link ?? lineRef.current)?.focus();
  }, [refreshing]);

  function setPending(id: string, on: boolean) {
    setPendingIds((current) => {
      const next = new Set(current);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function run(target: UnlockTarget) {
    inflight.current.add(target.id);
    setPending(target.id, true);
    let failure: string | null = null;
    let unlocked = true;
    try {
      const result = await unlockPersonAction({ personId: target.id });
      if (!result) failure = "잠금 풀기 실패 · 다시 시도";
      else if (result.serverError) failure = result.serverError;
      else if (result.validationErrors) failure = "잠금 풀기 실패 · 다시 시도";
      else unlocked = result.data?.unlocked !== false;
    } catch {
      failure = "잠금 풀기 실패 · 다시 시도";
    }
    inflight.current.delete(target.id);
    setPending(target.id, false);
    if (failure) {
      setLine({ text: failure, failed: true });
      return;
    }
    // 07-17 독립 검토 L3: 이미 풀려 있었으면(다른 관리자 · 낡은 목록) 서버가 아무것도 하지 않았으므로 성공 줄도 없다 — 행이 새 값으로 바뀐다.
    setLine(unlocked ? { text: `잠금 풀기 · ${target.name}`, failed: false } : null);
    focusId.current = target.id;
    startRefresh(() => router.refresh());
  }

  function unlock(target: UnlockTarget) {
    if (inflight.current.has(target.id)) return;
    void run(target);
  }

  return (
    <UnlockContext.Provider value={{ unlock, pendingIds }}>
      {line ? (
        <p ref={lineRef} tabIndex={-1} role="status" className={line.failed ? `${styles.resultLine} ${styles.resultFailed}` : styles.resultLine}>
          {line.text}
        </p>
      ) : null}
      {children}
    </UnlockContext.Provider>
  );
}

export function UnlockAction({ id, name }: UnlockTarget) {
  const context = useContext(UnlockContext);
  if (!context) throw new Error("UnlockResultSection 밖에서 UnlockAction을 그렸다");
  return (
    <RowAction pending={context.pendingIds.has(id)} onClick={() => context.unlock({ id, name })}>
      잠금 풀기
    </RowAction>
  );
}
