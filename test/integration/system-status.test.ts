import { describe, expect, it } from "vitest";
import { getSystemStatus } from "@/domain/system-status";
import { SYSTEM_VIEWER } from "@/domain/viewer";

describe("getSystemStatus (실제 Postgres, D-18)", () => {
  it("실제 DB에서 커넥션 수를 조회하고 로컬(GCP 미설정)에서는 backup이 unavailable이다", async () => {
    const status = await getSystemStatus(SYSTEM_VIEWER);

    expect("unavailable" in status.db).toBe(false);
    if (!("unavailable" in status.db)) {
      expect(status.db.connections).toBeGreaterThanOrEqual(1);
      expect(status.db.maxConnections).toBeGreaterThanOrEqual(1);
    }
    expect(status.backup.kind).toBe("unavailable");
  });
});
