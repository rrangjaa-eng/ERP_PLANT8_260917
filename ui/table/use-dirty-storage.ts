"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

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

// 04-22(D-68 · DR-6) — 복원 줄의 칸 수를 저장소에서 읽는다(마운트 때 한 번 · recount 때 다시).
export function readRestorableCount(storage: DirtyStorageLike | null, scopeId: string, subScopeId: string): number {
  if (!storage) return 0;
  return countDirtyEdits(loadDirtyEdits(storage, scopeId, subScopeId));
}

// 04-24(DR-4) — 키를 훑을 수 있는 저장소(window.localStorage가 만족한다).
export type EnumerableDirtyStorage = DirtyStorageLike & { readonly length: number; key(index: number): string | null };

function otherSubScopeIds(storage: EnumerableDirtyStorage, scopeId: string, currentSubScopeId: string): string[] {
  const prefix = dirtyStorageKey(scopeId, "");
  const ids: string[] = [];
  for (let index = 0; index < storage.length; index++) {
    const key = storage.key(index);
    if (!key?.startsWith(prefix)) continue;
    const subScopeId = key.slice(prefix.length);
    if (subScopeId !== currentSubScopeId) ids.push(subScopeId);
  }
  return ids;
}

function isSharedKey(key: string, sharedOwners: readonly string[]): boolean {
  return sharedOwners.includes(key.slice(0, key.lastIndexOf(":")));
}

// 04-24(DR-4 · S18) — 같은 프로젝트의 다른 차수 보관본. 현재 차수 키·다른 프로젝트·손상 JSON·빈 보관본은 뺀다.
// 검토 B1 — 차수와 무관한 칸(owner가 sharedOwners)은 세지 않는다 — 그 칸은 carrySharedEdits가 현재 차수로 옮긴다.
export function findOtherRevisionDrafts(
  storage: EnumerableDirtyStorage,
  scopeId: string,
  currentSubScopeId: string,
  sharedOwners: readonly string[] = [],
): { revisionId: string; count: number }[] {
  const drafts: { revisionId: string; count: number }[] = [];
  for (const revisionId of otherSubScopeIds(storage, scopeId, currentSubScopeId)) {
    const edits = loadDirtyEdits(storage, scopeId, revisionId) ?? {};
    const count = Object.keys(edits).filter((key) => !isSharedKey(key, sharedOwners)).length;
    if (count > 0) drafts.push({ revisionId, count });
  }
  return drafts;
}

// 04-24 검토 B1 — 다른 차수 보관본의 공유 칸을 현재 차수 보관본으로 옮긴다(현재 차수 값이 이기고, 그다음은 먼저 읽은 값).
// 옮긴 칸은 옛 키에서 지운다 — 빈 옛 키는 없어진다. 옛 키에서 뺀 칸 수를 돌려준다(0보다 크면 현재 차수 복원 줄이 다시 센다).
export function carrySharedEdits(
  storage: EnumerableDirtyStorage,
  scopeId: string,
  currentSubScopeId: string,
  sharedOwners: readonly string[],
): number {
  const current = loadDirtyEdits(storage, scopeId, currentSubScopeId) ?? {};
  let moved = 0;
  for (const revisionId of otherSubScopeIds(storage, scopeId, currentSubScopeId)) {
    const edits = loadDirtyEdits(storage, scopeId, revisionId);
    if (!edits) continue;
    const kept: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(edits)) {
      if (!isSharedKey(key, sharedOwners)) {
        kept[key] = value;
        continue;
      }
      if (!(key in current)) current[key] = value;
      moved++;
    }
    if (Object.keys(kept).length === Object.keys(edits).length) continue;
    if (Object.keys(kept).length === 0) clearDirtyEdits(storage, scopeId, revisionId);
    else saveDirtyEdits(storage, scopeId, revisionId, kept);
  }
  if (moved > 0) saveDirtyEdits(storage, scopeId, currentSubScopeId, current);
  return moved;
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
  /** 04-22 — 저장소를 다시 읽어 복원 줄 수를 갱신한다(상태 바뀜 거부 뒤 서버 값으로 다시 그린 때). */
  recount: () => void;
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

// 04-49(#418) — 수화가 끝났는가. 서버 렌더와 수화 중 첫 렌더는 거짓(저장소를 모른다), 그 뒤는 참이다.
const subscribeNothing = () => () => {};

export function useDirtyStorage(scopeId: string, subScopeId: string, dirtyCount: number): UseDirtyStorageResult {
  // 지연 초기화(lazy initializer) — 마운트 시점 한 번만 저장소를 읽는다.
  // useEffect + setState로 하면 "마운트 뒤 setState"가 불필요한 캐스케이드
  // 렌더를 만든다(react-hooks/set-state-in-effect) — 이 값은 리액트 상태와
  // 동기화할 대상이 아니라 세션 시작 시점의 스냅샷 한 번이면 충분하다(이후
  // 편집이 같은 키에 계속 쓰여도 배너 숫자는 바뀌지 않는다 — "복원 대상"은
  // 이전 세션이 남긴 것이지 지금 편집 중인 것이 아니다).
  const [storedCount, setRestorableCount] = useState(() => readRestorableCount(browserStorage(), scopeId, subScopeId));
  // 서버는 저장소를 읽지 못해 0으로 그린다 — 수화 중 첫 렌더도 0으로 맞춰 복원 줄의 서버 HTML과 어긋나지 않게 하고,
  // 수화 뒤에 마운트 때 읽은 칸 수를 보인다(React #418).
  const hydrated = useSyncExternalStore(subscribeNothing, () => true, () => false);
  const restorableCount = hydrated ? storedCount : 0;

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

  const recount = useCallback(() => {
    setRestorableCount(readRestorableCount(browserStorage(), scopeId, subScopeId));
  }, [scopeId, subScopeId]);

  return { restorableCount, restore, discard, persist, clearAfterSave, recount };
}
