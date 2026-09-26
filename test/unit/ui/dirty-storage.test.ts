import { describe, expect, it } from "vitest";
import {
  dirtyStorageKey,
  saveDirtyEdits,
  loadDirtyEdits,
  clearDirtyEdits,
  countDirtyEdits,
  readRestorableCount,
  findOtherRevisionDrafts,
  carrySharedEdits,
  type DirtyStorageLike,
  type EnumerableDirtyStorage,
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

  it("검토 8 — 기준값 키(`{owner}:base`)는 칸으로 세지 않는다(현재·이전 차수 모두)", () => {
    const edits = { "line-1:unitPrice": 5000, "line-1:base": { version: 1 }, "period:end": "2026-11-15", "period:base": {} };
    expect(countDirtyEdits(edits)).toBe(2);
    const storage = createEnumerableStorage({ [dirtyStorageKey("P", "R1")]: JSON.stringify(edits) });
    expect(findOtherRevisionDrafts(storage, "P", "R2", ["period"])).toEqual([{ revisionId: "R1", count: 1 }]);
  });

  it("저장된 값이 손상된 JSON이면 null로 안전하게 처리한다(조용히 크래시하지 않는다)", () => {
    const storage = createFakeStorage();
    storage.setItem(dirtyStorageKey("project-1", "revision-1"), "{ this is not json");
    expect(loadDirtyEdits(storage, "project-1", "revision-1")).toBeNull();
  });
});

// 04-22(D-68 · DR-6) — 상태 바뀜 거부 뒤 화면이 서버 값으로 다시 그려지면 복원 줄 수를 저장소에서
// 다시 읽는다(useDirtyStorage의 recount가 이 함수를 쓴다). 서버 값으로 다시 그리는 것은 저장소를
// 건드리지 않으므로 편집 순간 보관한 칸 수가 그대로 돌아온다.
describe("readRestorableCount — recount", () => {
  it("저장소에 편집 3칸이 있으면 3을 다시 읽는다", () => {
    const storage = createFakeStorage();
    saveDirtyEdits(storage, "project-1", "revision-1", { "line-1:itemName": "A", "line-1:quantity": 2, "period:end": "2026-10-01" });
    expect(readRestorableCount(storage, "project-1", "revision-1")).toBe(3);
  });

  it("보관본이 없거나 저장소가 없으면 0", () => {
    expect(readRestorableCount(createFakeStorage(), "project-1", "revision-1")).toBe(0);
    expect(readRestorableCount(null, "project-1", "revision-1")).toBe(0);
  });
});

// 04-24(DR-4) — 같은 프로젝트의 다른 차수 보관본 찾기. localStorage처럼 키를 훑을 수 있는 저장소 더블.
function createEnumerableStorage(entries: Record<string, string>): EnumerableDirtyStorage {
  const map = new Map(Object.entries(entries));
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
    get length() {
      return map.size;
    },
    key: (index) => [...map.keys()][index] ?? null,
  };
}

describe("findOtherRevisionDrafts — 이전 차수 보관본(04-24 DR-4)", () => {
  it("같은 프로젝트의 다른 차수 중 칸이 있는 보관본만 — 현재 차수·다른 프로젝트·손상 JSON·빈 객체·다른 접두는 뺀다", () => {
    const storage = createEnumerableStorage({
      [dirtyStorageKey("P", "R1")]: JSON.stringify({ "line-1:itemName": "고친 항목", "line-1:note": "비고" }),
      [dirtyStorageKey("P", "R2")]: JSON.stringify({ "line-9:itemName": "현재 차수" }),
      [dirtyStorageKey("Q", "R9")]: JSON.stringify({ "line-3:itemName": "다른 프로젝트" }),
      [dirtyStorageKey("P", "R3")]: "{not json",
      [dirtyStorageKey("P", "R4")]: JSON.stringify({}),
      "other-prefix:P:R5": JSON.stringify({ "line-5:itemName": "다른 접두" }),
    });
    expect(findOtherRevisionDrafts(storage, "P", "R2")).toEqual([{ revisionId: "R1", count: 2 }]);
  });

  it("저장소 항목이 0개면 빈 배열", () => {
    expect(findOtherRevisionDrafts(createEnumerableStorage({}), "P", "R2")).toEqual([]);
  });

  it("그 차수 보관본은 기존 clearDirtyEdits로 지우고 현재 차수 키는 그대로다", () => {
    const storage = createEnumerableStorage({
      [dirtyStorageKey("P", "R1")]: JSON.stringify({ "line-1:itemName": "고친 항목" }),
      [dirtyStorageKey("P", "R2")]: JSON.stringify({ "line-9:itemName": "현재 차수" }),
    });
    clearDirtyEdits(storage, "P", "R1");
    expect(findOtherRevisionDrafts(storage, "P", "R2")).toEqual([]);
    expect(loadDirtyEdits(storage, "P", "R2")).toEqual({ "line-9:itemName": "현재 차수" });
  });
});

describe("차수와 무관한 칸(프로젝트 칸)은 이전 차수 보관본으로 세지 않고 현재 차수 보관본으로 옮긴다(04-24 검토 B1)", () => {
  const SHARED = ["period", "preEstimate"] as const;

  it("findOtherRevisionDrafts는 공유 owner 칸을 세지 않는다 — 공유 칸만 든 보관본은 빠진다", () => {
    const storage = createEnumerableStorage({
      [dirtyStorageKey("P", "R1")]: JSON.stringify({ "period:start": "2026-10-01" }),
      [dirtyStorageKey("P", "R0")]: JSON.stringify({ "line-1:itemName": "고친 항목", "preEstimate:amount": "1,000" }),
    });
    expect(findOtherRevisionDrafts(storage, "P", "R2", SHARED)).toEqual([{ revisionId: "R0", count: 1 }]);
  });

  it("carrySharedEdits는 다른 차수의 공유 칸을 현재 차수 키로 옮기고 옛 키에서 지운다 — 현재 차수 값이 이기고, 빈 옛 키는 없어진다", () => {
    const storage = createEnumerableStorage({
      [dirtyStorageKey("P", "R1")]: JSON.stringify({ "period:start": "2026-10-01", "period:end": "2026-10-31" }),
      [dirtyStorageKey("P", "R0")]: JSON.stringify({ "line-1:itemName": "고친 항목", "preEstimate:amount": "1,000" }),
      [dirtyStorageKey("P", "R2")]: JSON.stringify({ "period:end": "2026-11-30" }),
      [dirtyStorageKey("Q", "R9")]: JSON.stringify({ "period:start": "2026-01-01" }),
    });
    expect(carrySharedEdits(storage, "P", "R2", SHARED)).toBe(3);
    expect(loadDirtyEdits(storage, "P", "R2")).toEqual({
      "period:start": "2026-10-01",
      "period:end": "2026-11-30",
      "preEstimate:amount": "1,000",
    });
    expect(loadDirtyEdits(storage, "P", "R1")).toBeNull();
    expect(loadDirtyEdits(storage, "P", "R0")).toEqual({ "line-1:itemName": "고친 항목" });
    expect(loadDirtyEdits(storage, "Q", "R9")).toEqual({ "period:start": "2026-01-01" });
  });

  it("옮길 칸이 없으면 0이고 저장소는 그대로다", () => {
    const storage = createEnumerableStorage({
      [dirtyStorageKey("P", "R1")]: JSON.stringify({ "line-1:itemName": "고친 항목" }),
    });
    expect(carrySharedEdits(storage, "P", "R2", SHARED)).toBe(0);
    expect(loadDirtyEdits(storage, "P", "R2")).toBeNull();
  });
});
