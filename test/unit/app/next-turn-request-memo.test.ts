import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

// U1-2(06 교차 검토): 레이아웃(폰 탭 `내 차례 N`)과 홈(목록)이 한 요청 안에서 「내 차례」 계산을 두 번 했다.
// React cache()는 react-server 조건에서만 요청 단위로 memo한다 — vitest(일반 react)에서는 그냥 통과하므로,
// 여기서는 cache를 「한 요청 = 한 memo」로 흉내 내 열쇠 · 재사용 규칙만 본다. 실제 요청 단위 동작은 Next 문서의 cache 계약이다.
const scope = vi.hoisted(() => ({ store: new Map<unknown, unknown>() }));
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    cache: <A extends unknown[], R>(fn: (...args: A) => R) =>
      (...args: A): R => {
        if (!scope.store.has(fn)) scope.store.set(fn, fn(...args));
        return scope.store.get(fn) as R;
      },
  };
});
const listNextTurnItems = vi.hoisted(() => vi.fn((viewer: { id: string }, deps?: { withDetails?: boolean }) => Promise.resolve([{ key: `${viewer.id}-${String(deps?.withDetails)}` }])));
vi.mock("@/domain/next-turn", () => ({ listNextTurnItems }));

const { listNextTurnItemsForRequest } = await import("@/app/(app)/next-turn-request");

beforeEach(() => {
  scope.store = new Map();
  listNextTurnItems.mockClear();
});

describe("listNextTurnItemsForRequest — 한 요청에 한 번", () => {
  it("레이아웃 · 홈이 서로 다른 viewer 객체(같은 사람)로 불러도 공급 함수는 한 번 · 결재 시트 재료(withDetails) 포함 · 같은 결과", async () => {
    const fromLayout = await listNextTurnItemsForRequest({ id: "u1", roleId: "r1" });
    const fromHome = await listNextTurnItemsForRequest({ id: "u1", roleId: "r1" });
    expect(listNextTurnItems).toHaveBeenCalledTimes(1);
    expect(listNextTurnItems.mock.calls[0]?.[1]).toEqual({ withDetails: true });
    expect(fromHome).toBe(fromLayout);
  });

  it("다음 요청은 새로 계산한다(요청 사이에 남지 않는다)", async () => {
    await listNextTurnItemsForRequest({ id: "u1", roleId: "r1" });
    scope.store = new Map();
    await listNextTurnItemsForRequest({ id: "u1", roleId: "r1" });
    expect(listNextTurnItems).toHaveBeenCalledTimes(2);
  });

  it("다른 사람 · 다른 계급이면 따로 계산한다", async () => {
    await listNextTurnItemsForRequest({ id: "u1", roleId: "r1" });
    await listNextTurnItemsForRequest({ id: "u2", roleId: "r1" });
    await listNextTurnItemsForRequest({ id: "u1", roleId: "r2" });
    expect(listNextTurnItems).toHaveBeenCalledTimes(3);
  });

  it("레이아웃 · 홈은 공급 함수를 직접 부르지 않고 이 함수를 거친다", () => {
    for (const file of ["app/(app)/layout.tsx", "app/(app)/page.tsx"]) {
      const source = readFileSync(resolve(import.meta.dirname, "../../..", file), "utf8");
      expect(source, file).toContain("listNextTurnItemsForRequest(");
      expect(source, file).not.toMatch(/\blistNextTurnItems\(/);
    }
  });
});
