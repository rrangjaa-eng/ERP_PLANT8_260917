import { describe, expect, it, vi } from "vitest";
import { MissingEncryptionKeyError } from "@/lib/crypto";

vi.mock("@/domain/health", async () => {
  const actual = await vi.importActual<typeof import("@/domain/health")>("@/domain/health");
  return {
    ...actual,
    checkHealth: vi.fn(actual.checkHealth),
  };
});

import { checkHealth } from "@/domain/health";
import { GET } from "@/app/api/health/route";

type HealthzBody = { ok: boolean; sha?: string };

describe("domain/health.checkHealth", () => {
  it("실패하는 ping을 주입하면 { ok: false }를 반환한다", async () => {
    const result = await checkHealth({
      ping: () => {
        throw new Error("down");
      },
    });
    expect(result).toEqual({ ok: false });
  });

  // 04.3-08 RB-P1 — 라우트 쪽 모듈 인스턴스에서 데이터 키가 준비됐는지 고정 문자열의
  // encrypt → decrypt 왕복으로 증명한다. 로컬은 평문 APP_DATA_KEY_v1(global-setup)이다.
  it("주입 없이(로컬 평문 키) DB ping과 데이터 키 왕복이 모두 되면 { ok: true }", async () => {
    await expect(checkHealth()).resolves.toEqual({ ok: true });
  });

  it("데이터 키 왕복이 MissingEncryptionKeyError를 던지면 { ok: false } · 로그 필드는 오류 이름뿐", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    try {
      const result = await checkHealth({
        dataKeyRoundTrip: () => {
          throw new MissingEncryptionKeyError("키를 아직 풀지 않았습니다: APP_DATA_KEY_v1");
        },
      });
      expect(result).toEqual({ ok: false });

      const line = logSpy.mock.calls.map((c) => String(c[0])).find((l) => l.includes("healthz.data_key_unavailable"));
      expect(line).toBeDefined();
      const entry = JSON.parse(line ?? "{}") as Record<string, unknown>;
      expect(Object.keys(entry).sort()).toEqual(["event", "message", "name", "severity", "time"]);
      expect(entry.name).toBe("MissingEncryptionKeyError");
      expect(line).not.toContain("APP_DATA_KEY_v1");
    } finally {
      logSpy.mockRestore();
    }
  });
});

describe("app/api/health/route GET", () => {
  it("checkHealth 성공 시 200 { ok: true, sha: 'local' }를 반환한다", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    const body = (await response.json()) as HealthzBody;
    expect(body.ok).toBe(true);
    expect(body.sha).toBe("local");
  });

  it("checkHealth가 { ok: false }면 503 { ok: false }를 반환한다", async () => {
    vi.mocked(checkHealth).mockResolvedValueOnce({ ok: false });

    const response = await GET();
    expect(response.status).toBe(503);
    const body = (await response.json()) as HealthzBody;
    expect(body.ok).toBe(false);
  });

  // T-1-03 — 응답 필드는 ok · sha · deployedAt 그대로(RB-P1이 새 필드를 더하지 않는다).
  it("성공 본문의 키가 정확히 deployedAt · ok · sha 셋이다", async () => {
    const response = await GET();
    const body = (await response.json()) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(["deployedAt", "ok", "sha"]);
  });

  it("checkHealth가 { ok: false }면 503 본문이 정확히 { ok: false }다", async () => {
    vi.mocked(checkHealth).mockResolvedValueOnce({ ok: false });

    const response = await GET();
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ ok: false });
  });
});
