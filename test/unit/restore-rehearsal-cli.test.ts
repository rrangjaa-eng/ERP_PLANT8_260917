import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Codex #11: 대상 가드는 DB 모듈을 불러오기 전에 돈다 — db/client가 top-level await로
// Cloud SQL 커넥터를 만들기 때문이다. 팩토리가 불리면 표시가 켜진다(= 커넥터 초기화).
const loaded = vi.hoisted(() => ({ db: false, closed: false }));
vi.mock("@/db/client", () => {
  loaded.db = true;
  return {
    closeDb: () => {
      loaded.closed = true;
      return Promise.resolve();
    },
  };
});
const verifyMock = vi.hoisted(() => vi.fn());
vi.mock("@/domain/ops/restore-verify", () => ({ verifyRestoredDatabase: verifyMock }));

const { main, parseArgs, UsageError } = await import("@/scripts/restore-rehearsal-cli");

const REHEARSAL = "p:asia-northeast3:plant8-staging-rehearsal-123-1";

beforeEach(() => {
  loaded.db = false;
  loaded.closed = false;
  process.exitCode = undefined;
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  process.exitCode = undefined;
});

describe("restore-rehearsal-cli verify — 대상 가드", () => {
  it("원본 연결 이름이 설정된 채 원본을 대상으로 넘기면 1이고 DB 모듈을 불러오지 않는다", async () => {
    vi.stubEnv("CLOUD_SQL_CONNECTION_NAME", "p:asia-northeast3:plant8-prod-db");
    vi.stubEnv("APP_ENV", "prod");
    await main(["verify", "--target", "p:asia-northeast3:plant8-prod-db"]);
    expect(process.exitCode).toBe(1);
    expect(loaded.db).toBe(false);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("검증 대상이 임시 인스턴스가 아닙니다"));
  });

  it("rehearsal 이름이어도 env 연결 이름과 다르면 1이고 DB 모듈을 불러오지 않는다", async () => {
    vi.stubEnv("CLOUD_SQL_CONNECTION_NAME", "a:b:plant8-staging-rehearsal-1-2");
    await main(["verify", "--target", "a:b:plant8-staging-rehearsal-1-1"]);
    expect(process.exitCode).toBe(1);
    expect(loaded.db).toBe(false);
  });

  it("대상이 맞으면 확인을 돌리고 결과로 종료 코드를 정한 뒤 DB를 닫는다", async () => {
    vi.stubEnv("CLOUD_SQL_CONNECTION_NAME", REHEARSAL);
    verifyMock.mockResolvedValueOnce({ ok: true, checks: [{ name: "마이그레이션", ok: true, detail: "적용 18개" }] });
    await main(["verify", "--target", REHEARSAL]);
    expect(process.exitCode ?? 0).toBe(0);
    expect(loaded.db).toBe(true);
    expect(loaded.closed).toBe(true);
    expect(console.log).toHaveBeenCalledWith("복원본 확인을 통과했습니다.");
  });

  it("확인 결과가 실패면 1이다", async () => {
    vi.stubEnv("CLOUD_SQL_CONNECTION_NAME", REHEARSAL);
    verifyMock.mockResolvedValueOnce({ ok: false, checks: [{ name: "roles", ok: false, detail: "0행" }] });
    await main(["verify", "--target", REHEARSAL]);
    expect(process.exitCode).toBe(1);
    expect(console.log).toHaveBeenCalledWith("복원본 확인에 실패했습니다.");
  });
});

describe("restore-rehearsal-cli — 인자 규약", () => {
  it("APP_ENV=local인 채 record는 2이고 DB 모듈을 불러오지 않는다", async () => {
    vi.stubEnv("APP_ENV", "local");
    await main([
      "record",
      "--succeeded",
      "true",
      "--started-at",
      "2026-09-26T00:00:00Z",
      "--finished-at",
      "2026-09-26T00:10:00Z",
      "--run-key",
      "1-1",
    ]);
    expect(process.exitCode).toBe(2);
    expect(loaded.db).toBe(false);
  });

  it("verify는 --target을 파싱한다", () => {
    expect(parseArgs(["verify", "--target", REHEARSAL])).toEqual({ cmd: "verify", target: REHEARSAL });
  });

  it.each([
    ["--target 없음", ["verify"]],
    ["모르는 플래그", ["verify", "--target", REHEARSAL, "--force", "x"]],
    ["record 전용 플래그", ["verify", "--run-key", "1-1"]],
  ])("verify: %s → UsageError", (_label, argv) => {
    expect(() => parseArgs(argv)).toThrow(UsageError);
  });

  it("verify에 --target이 없으면 종료 코드 2다", async () => {
    await main(["verify"]);
    expect(process.exitCode).toBe(2);
    expect(loaded.db).toBe(false);
  });
});
