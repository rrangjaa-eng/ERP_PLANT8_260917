"use client";

import { useCallback, useEffect, useState } from "react";

// SYSTEM.md §7-3 보강 (마) — 미저장 편집 복원(D-68). dirty 셀이 하나라도
// 있으면 이탈을 경고하고, 편집은 브라우저 저장소에 임시 보관한다. 키는
// **프로젝트 id + 차수 id**(다른 표는 화면 id)로 만들어 다른 프로젝트·표의
// 편집이 섞이지 않는다(단위 테스트가 이 분리를 단언).
//
// 순수 함수(saveDirtyEdits/loadDirtyEdits/clearDirtyEdits/countDirtyEdits)는
// 저장소를 인자로 받아 브라우저 없이 테스트된다. useDirtyStorage 훅은 그
// 함수들을 window.localStorage + beforeunload에 배선한다.

export type DirtyStorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

const STORAGE_PREFIX = "quote-ledger:dirty";

export function dirtyStorageKey(scopeId: string, subScopeId: string): string {
  return `${STORAGE_PREFIX}:${scopeId}:${subScopeId}`;
}

export function saveDirtyEdits(
  storage: DirtyStorageLike,
  scopeId: string,
  subScopeId: string,
  edits: Record<string, unknown>,
): void {
  storage.setItem(dirtyStorageKey(scopeId, subScopeId), JSON.stringify(edits));
}

export function loadDirtyEdits(
  storage: DirtyStorageLike,
  scopeId: string,
  subScopeId: string,
): Record<string, unknown> | null {
  const raw = storage.getItem(dirtyStorageKey(scopeId, subScopeId));
  if (raw === null) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    // 손상된 JSON(예: 이전 버전이 다른 형식으로 쓴 값) — 조용히 무시하고
    // 복원 배너를 띄우지 않는다. 크래시하지 않는다.
    return null;
  }
}

export function clearDirtyEdits(storage: DirtyStorageLike, scopeId: string, subScopeId: string): void {
  storage.removeItem(dirtyStorageKey(scopeId, subScopeId));
}

export function countDirtyEdits(edits: Record<string, unknown> | null): number {
  if (!edits) return 0;
  return Object.keys(edits).length;
}

export type UseDirtyStorageResult = {
  /** 다시 열었을 때 보관된 편집이 있으면 그 칸 수(표 위 한 줄 배너 트리거). */
  restorableCount: number;
  /** 「복원」 — 보관된 편집을 돌려받는다(호출부가 draft 상태에 병합). */
  restore: () => Record<string, unknown> | null;
  /** 「버림」 — 확인 모달 없이 즉시 지운다. */
  discard: () => void;
  /** 매 dirty 변화마다 현재 편집을 보관에 쓴다(저장 성공 시에는 clear를 부른다). */
  persist: (edits: Record<string, unknown>) => void;
  /** 저장 성공 — 서버 초안을 만들지 않고 보관만 지운다(D-68). */
  clearAfterSave: () => void;
};

// window가 없는 SSR/테스트 환경에서도 안전하게 no-op으로 동작한다.
function browserStorage(): DirtyStorageLike | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function useDirtyStorage(scopeId: string, subScopeId: string, dirtyCount: number): UseDirtyStorageResult {
  // 지연 초기화(lazy initializer) — 마운트 시점 한 번만 저장소를 읽는다.
  // useEffect + setState로 하면 "마운트 뒤 setState"가 불필요한 캐스케이드
  // 렌더를 만든다(react-hooks/set-state-in-effect) — 이 값은 리액트 상태와
  // 동기화할 대상이 아니라 세션 시작 시점의 스냅샷 한 번이면 충분하다(이후
  // 편집이 같은 키에 계속 쓰여도 배너 숫자는 바뀌지 않는다 — "복원 대상"은
  // 이전 세션이 남긴 것이지 지금 편집 중인 것이 아니다).
  const [restorableCount, setRestorableCount] = useState(() => {
    const storage = browserStorage();
    if (!storage) return 0;
    return countDirtyEdits(loadDirtyEdits(storage, scopeId, subScopeId));
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    function handleBeforeUnload(event: BeforeUnloadEvent) {
      if (dirtyCount > 0) {
        event.preventDefault();
        event.returnValue = "";
      }
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [dirtyCount]);

  const restore = useCallback((): Record<string, unknown> | null => {
    const storage = browserStorage();
    if (!storage) return null;
    const edits = loadDirtyEdits(storage, scopeId, subScopeId);
    setRestorableCount(0);
    return edits;
  }, [scopeId, subScopeId]);

  const discard = useCallback(() => {
    const storage = browserStorage();
    if (storage) clearDirtyEdits(storage, scopeId, subScopeId);
    setRestorableCount(0);
  }, [scopeId, subScopeId]);

  const persist = useCallback(
    (edits: Record<string, unknown>) => {
      const storage = browserStorage();
      if (!storage) return;
      if (Object.keys(edits).length === 0) {
        clearDirtyEdits(storage, scopeId, subScopeId);
      } else {
        saveDirtyEdits(storage, scopeId, subScopeId, edits);
      }
    },
    [scopeId, subScopeId],
  );

  const clearAfterSave = useCallback(() => {
    const storage = browserStorage();
    if (storage) clearDirtyEdits(storage, scopeId, subScopeId);
  }, [scopeId, subScopeId]);

  return { restorableCount, restore, discard, persist, clearAfterSave };
}
