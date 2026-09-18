import { describe, expect, it, vi } from "vitest";

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
});
