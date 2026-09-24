import { describe, expect, it } from "vitest";
import {
  dirtyStorageKey,
  saveDirtyEdits,
  loadDirtyEdits,
  clearDirtyEdits,
  countDirtyEdits,
  type DirtyStorageLike,
} from "@/ui/table/use-dirty-storage";

// 04-04 Task 1 ④ — 미저장 편집의 브라우저 임시 보관(D-68). 키는 프로젝트
// id + 차수 id(다른 표는 화면 id)로 만들어 다른 프로젝트의 편집이 섞이지
// 않는다. 브라우저 없이 테스트 더블(Map 기반 storage)로 돈다.
function createFakeStorage(): DirtyStorageLike {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
  };
}

describe("dirtyStorageKey", () => {
  it("프로젝트 id + 차수 id로 서로 다른 표의 키가 갈린다", () => {
    const keyA = dirtyStorageKey("project-1", "revision-1");
    const keyB = dirtyStorageKey("project-2", "revision-1");
    const keyC = dirtyStorageKey("project-1", "revision-2");
    expect(keyA).not.toBe(keyB);
    expect(keyA).not.toBe(keyC);
    expect(keyB).not.toBe(keyC);
  });
});

describe("saveDirtyEdits / loadDirtyEdits / clearDirtyEdits", () => {
  it("세 칸을 저장하면 3칸으로 읽히고, 다른 프로젝트 키는 영향받지 않는다", () => {
    const storage = createFakeStorage();
    const edits = { "line-1:itemName": "A", "line-1:quantity": 2, "line-2:note": "메모" };

    saveDirtyEdits(storage, "project-1", "revision-1", edits);

    const restored = loadDirtyEdits(storage, "project-1", "revision-1");
    expect(restored).toEqual(edits);
    expect(countDirtyEdits(restored)).toBe(3);

    // 다른 프로젝트의 보관은 비어 있다 — 키가 섞이지 않는다.
    expect(loadDirtyEdits(storage, "project-2", "revision-1")).toBeNull();
  });

  it("「버림」(clearDirtyEdits)을 누르면 보관이 지워진다", () => {
    const storage = createFakeStorage();
    saveDirtyEdits(storage, "project-1", "revision-1", { "line-1:itemName": "A" });

    clearDirtyEdits(storage, "project-1", "revision-1");

    expect(loadDirtyEdits(storage, "project-1", "revision-1")).toBeNull();
  });

  it("보관된 편집이 없으면 null을 돌려준다(0칸 — 배너 미표시 신호)", () => {
    const storage = createFakeStorage();
    expect(loadDirtyEdits(storage, "project-1", "revision-1")).toBeNull();
    expect(countDirtyEdits(null)).toBe(0);
  });

  it("저장된 값이 손상된 JSON이면 null로 안전하게 처리한다(조용히 크래시하지 않는다)", () => {
    const storage = createFakeStorage();
    storage.setItem(dirtyStorageKey("project-1", "revision-1"), "{ this is not json");
    expect(loadDirtyEdits(storage, "project-1", "revision-1")).toBeNull();
  });
});
