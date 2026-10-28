import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

// U1-2(06 교차 검토) → 07.1-17(PF1 · E-P2-45): 레이아웃(폰 탭 `내 차례 N`)과 홈(목록)이 한 요청 안에서 「내 차례」 계산을 겹쳐 하지 않는다.
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
// Phase 6 계산 — 한 요청에서 사람마다 몇 번 도는지가 이 시험의 핵심이다.
const listPhase6NextTurnItems = vi.hoisted(() => vi.fn((viewer: { id: string }) => Promise.resolve([{ key: `phase6-${viewer.id}` }])));
vi.mock("@/domain/next-turn/phase6-items", () => ({ listPhase6NextTurnItems }));
// 공급 함수 모의 — 실제처럼 결재 · 막힘 몫(시트 재료 유무가 다름) 뒤에 세 번째 인자의 `phase6`를 불러 목록 끝에 붙인다.
const listNextTurnItems = vi.hoisted(() =>
  vi.fn(async (viewer: { id: string }, deps?: { withDetails?: boolean }, options?: { phase6?: () => Promise<{ key: string }[]> }) => [
    { key: `${viewer.id}-${String(deps?.withDetails)}` },
    ...(options?.phase6 ? await options.phase6() : []),
  ]),
);
vi.mock("@/domain/next-turn", () => ({ listNextTurnItems }));

const { countNextTurnItemsForRequest, listNextTurnItemsForRequest } = await import("@/app/(app)/next-turn-request");

beforeEach(() => {
  scope.store = new Map();
  listNextTurnItems.mockClear();
  listPhase6NextTurnItems.mockClear();
  listPhase6NextTurnItems.mockImplementation((viewer: { id: string }) => Promise.resolve([{ key: `phase6-${viewer.id}` }]));
});

const U1 = { id: "u1", roleId: "r1" };

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
    expect(listPhase6NextTurnItems).toHaveBeenCalledTimes(2);
  });

  it("다른 사람 · 다른 계급이면 따로 계산한다(Phase 6 층도 따로)", async () => {
    await listNextTurnItemsForRequest({ id: "u1", roleId: "r1" });
    await listNextTurnItemsForRequest({ id: "u2", roleId: "r1" });
    await listNextTurnItemsForRequest({ id: "u1", roleId: "r2" });
    expect(listNextTurnItems).toHaveBeenCalledTimes(3);
    expect(listPhase6NextTurnItems).toHaveBeenCalledTimes(3);
  });
});

describe("countNextTurnItemsForRequest — 시트 재료 없이 · 목록이 있으면 재사용 (PF1 · C-32)", () => {
  it("건수 함수만 부르면 공급 함수를 시트 재료(withDetails) 없이 한 번 부르고, 세 번째 인자에 phase6 함수를 넘긴다", async () => {
    const count = await countNextTurnItemsForRequest(U1);
    expect(count).toBe(2);
    expect(listNextTurnItems).toHaveBeenCalledTimes(1);
    const [, deps, options] = listNextTurnItems.mock.calls[0] ?? [];
    expect(deps).toBeUndefined();
    expect(options).toEqual({ phase6: expect.any(Function) });
  });

  it("같은 요청에서 건수 함수를 두 번 불러도 공급 함수는 한 번", async () => {
    await countNextTurnItemsForRequest({ id: "u1", roleId: "r1" });
    await countNextTurnItemsForRequest({ id: "u1", roleId: "r1" });
    expect(listNextTurnItems).toHaveBeenCalledTimes(1);
  });

  it("목록 함수(시트 재료 포함)가 먼저 불렸으면 건수 함수는 공급 함수를 더 부르지 않고 그 목록 길이를 준다", async () => {
    const list = await listNextTurnItemsForRequest(U1);
    const count = await countNextTurnItemsForRequest({ id: "u1", roleId: "r1" });
    expect(count).toBe(list.length);
    expect(listNextTurnItems).toHaveBeenCalledTimes(1);
    expect(listNextTurnItems.mock.calls[0]?.[1]).toEqual({ withDetails: true });
  });

  it("다음 요청 · 다른 사람 · 다른 계급은 따로 센다", async () => {
    await countNextTurnItemsForRequest(U1);
    scope.store = new Map();
    await countNextTurnItemsForRequest(U1);
    await countNextTurnItemsForRequest({ id: "u2", roleId: "r1" });
    await countNextTurnItemsForRequest({ id: "u1", roleId: "r2" });
    expect(listNextTurnItems).toHaveBeenCalledTimes(4);
  });
});

describe("홈에서 Phase 6 계산은 사람마다 한 번 (E-P2-45)", () => {
  it("순서 ① 건수 → 목록: Phase 6 호출 1번 · 건수 = 목록 길이", async () => {
    const count = await countNextTurnItemsForRequest(U1);
    const list = await listNextTurnItemsForRequest({ id: "u1", roleId: "r1" });
    expect(listPhase6NextTurnItems).toHaveBeenCalledTimes(1);
    expect(count).toBe(list.length);
  });

  it("순서 ② 목록 → 건수: Phase 6 호출 1번 · 건수 = 목록 길이", async () => {
    const list = await listNextTurnItemsForRequest(U1);
    const count = await countNextTurnItemsForRequest({ id: "u1", roleId: "r1" });
    expect(listPhase6NextTurnItems).toHaveBeenCalledTimes(1);
    expect(count).toBe(list.length);
  });

  it("순서 ③ 레이아웃 · 페이지 병렬(Promise.all): Phase 6 호출 1번 · 건수 = 목록 길이", async () => {
    // App Router는 레이아웃과 페이지를 병렬로 그린다 — 어느 쪽이 먼저든 Phase 6는 한 번이어야 한다. 느린 Phase 6로 두 호출이 겹치게 한다.
    listPhase6NextTurnItems.mockImplementation(async (viewer: { id: string }) => {
      await new Promise((done) => setTimeout(done, 10));
      return [{ key: `phase6-${viewer.id}` }];
    });
    const [count, list] = await Promise.all([countNextTurnItemsForRequest(U1), listNextTurnItemsForRequest({ id: "u1", roleId: "r1" })]);
    expect(listPhase6NextTurnItems).toHaveBeenCalledTimes(1);
    expect(count).toBe(list.length);
  });

  it("순서 ③' 병렬(목록이 먼저 시작): Phase 6 호출 1번", async () => {
    const [list, count] = await Promise.all([listNextTurnItemsForRequest(U1), countNextTurnItemsForRequest({ id: "u1", roleId: "r1" })]);
    expect(listPhase6NextTurnItems).toHaveBeenCalledTimes(1);
    expect(count).toBe(list.length);
  });

  it("Phase 6 층도 다음 요청 새로 · 다른 사람 · 다른 계급 따로", async () => {
    await countNextTurnItemsForRequest(U1);
    await countNextTurnItemsForRequest({ id: "u2", roleId: "r1" });
    await countNextTurnItemsForRequest({ id: "u1", roleId: "r2" });
    expect(listPhase6NextTurnItems).toHaveBeenCalledTimes(3);
    scope.store = new Map();
    await countNextTurnItemsForRequest(U1);
    expect(listPhase6NextTurnItems).toHaveBeenCalledTimes(4);
  });

  it("Phase 6가 거절하면 건수 · 목록 둘 다 같은 오류로 거절한다(06-23 PN-3 — 숨기지 않는다)", async () => {
    const failure = new Error("phase6 실패");
    listPhase6NextTurnItems.mockRejectedValue(failure);
    const settled = await Promise.allSettled([countNextTurnItemsForRequest(U1), listNextTurnItemsForRequest({ id: "u1", roleId: "r1" })]);
    expect(settled.map((result) => result.status)).toEqual(["rejected", "rejected"]);
    for (const result of settled) expect(result.status === "rejected" && result.reason).toBe(failure);
    expect(listPhase6NextTurnItems).toHaveBeenCalledTimes(1);
  });
});

describe("호출부 소스 검사", () => {
  it("레이아웃은 건수 함수를, 홈은 목록 함수를 부르고 둘 다 공급 함수를 직접 부르지 않는다", () => {
    const expected: Record<string, string> = { "app/(app)/layout.tsx": "countNextTurnItemsForRequest(", "app/(app)/(home)/page.tsx": "listNextTurnItemsForRequest(" };
    for (const [file, call] of Object.entries(expected)) {
      const source = readFileSync(resolve(import.meta.dirname, "../../..", file), "utf8");
      expect(source, file).toContain(call);
      expect(source, file).not.toMatch(/\blistNextTurnItems\(/);
      expect(source, file).not.toMatch(/\blistPhase6NextTurnItems\(/);
    }
    const layout = readFileSync(resolve(import.meta.dirname, "../../..", "app/(app)/layout.tsx"), "utf8");
    expect(layout).not.toContain("listNextTurnItemsForRequest(");
  });
});
