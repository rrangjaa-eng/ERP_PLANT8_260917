import { describe, expect, it, vi } from "vitest";

// 도메인은 deps로 리포지토리를 받는다 — 모듈 로드가 db/client(커넥터·env)를 끌어오지 않게 막는다.
vi.mock("@/repositories/restore-verify", () => ({
  readAppliedMigrations: () => Promise.reject(new Error("deps를 주입해야 한다")),
  countTableRows: () => Promise.reject(new Error("deps를 주입해야 한다")),
}));

const { verifyRestoredDatabase } = await import("@/domain/ops/restore-verify");
const { SYSTEM_VIEWER } = await import("@/domain/viewer");

const journal = {
  entries: [
    { idx: 0, when: 100, tag: "0000_a" },
    { idx: 1, when: 200, tag: "0001_b" },
    { idx: 2, when: 300, tag: "0002_c" },
  ],
};

function deps(applied: number[] | Error) {
  return {
    readAppliedMigrations: () => (applied instanceof Error ? Promise.reject(applied) : Promise.resolve(applied)),
    countTableRows: () => Promise.resolve(1),
  };
}

async function migrationCheck(applied: number[] | Error) {
  const result = await verifyRestoredDatabase(SYSTEM_VIEWER, journal, deps(applied));
  const check = result.checks.find((c) => c.name === "마이그레이션");
  expect(check).toBeDefined();
  return { result, check: check! };
}

describe("verifyRestoredDatabase — 마이그레이션 접두 전체 비교(Codex #10)", () => {
  it("journal과 같은 수열이면 통과한다", async () => {
    const { result, check } = await migrationCheck([100, 200, 300]);
    expect(check.ok).toBe(true);
    expect(result.ok).toBe(true);
  });

  it("이미지가 1개 앞선 것(백업 뒤 배포)은 통과하고 차이를 적는다", async () => {
    const { result, check } = await migrationCheck([100, 200]);
    expect(check.ok).toBe(true);
    expect(check.detail).toContain("이미지보다 1개 뒤");
    expect(result.ok).toBe(true);
  });

  it.each([
    ["중복", [100, 200, 200]],
    ["빠짐", [100, 300]],
    ["중간 바뀜", [100, 999, 300]],
    ["0개", []],
    ["복원본이 이미지보다 앞섬", [100, 200, 300, 400]],
  ])("%s이면 실패한다", async (_label, applied) => {
    const { result, check } = await migrationCheck(applied);
    expect(check.ok).toBe(false);
    expect(result.ok).toBe(false);
  });

  it("읽기가 throw하면 그 항목이 실패하고 예외가 밖으로 새지 않는다", async () => {
    const { result, check } = await migrationCheck(new Error("relation does not exist"));
    expect(check.ok).toBe(false);
    expect(check.detail).toContain("relation does not exist");
    expect(result.ok).toBe(false);
  });
});

describe("verifyRestoredDatabase — 핵심 표", () => {
  it("필수 표가 0행이면 그 표만 실패하고, 읽기 실패도 그 표의 실패가 된다", async () => {
    const result = await verifyRestoredDatabase(SYSTEM_VIEWER, journal, {
      readAppliedMigrations: () => Promise.resolve([100, 200, 300]),
      countTableRows: (_viewer, table) => {
        if (table === "roles") return Promise.resolve(0);
        if (table === "teams") return Promise.reject(new Error("permission denied"));
        return Promise.resolve(3);
      },
    });
    const failed = result.checks.filter((c) => !c.ok).map((c) => c.name);
    expect(failed).toEqual(["roles", "teams"]);
    expect(result.ok).toBe(false);
  });

  it("0행을 허용하는 표는 0행이어도 통과한다", async () => {
    const result = await verifyRestoredDatabase(SYSTEM_VIEWER, journal, {
      readAppliedMigrations: () => Promise.resolve([100, 200, 300]),
      countTableRows: (_viewer, table) => Promise.resolve(table === "vendors" ? 0 : 1),
    });
    expect(result.ok).toBe(true);
  });
});
