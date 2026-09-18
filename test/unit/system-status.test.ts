import { describe, expect, it, vi } from "vitest";
import { NotAdminError, connectionBanner, getSystemStatus } from "@/domain/system-status";
import { getLastBackup } from "@/lib/gcp/cloud-sql-admin";
import type { Viewer } from "@/domain/viewer";

const adminViewer: Viewer = { id: "admin-1", isAdmin: true };
const employeeViewer: Viewer = { id: "emp-1", isAdmin: false };

describe("connectionBanner (OPS-06, D-17)", () => {
  it("정확히 80%면 배너가 뜬다(경계 포함)", () => {
    expect(connectionBanner(20, 25, 0.8)).toBe(true);
  });

  it("79%면 배너가 뜨지 않는다", () => {
    expect(connectionBanner(19, 25, 0.8)).toBe(false);
  });

  it("100%면 배너가 뜬다", () => {
    expect(connectionBanner(25, 25, 0.8)).toBe(true);
  });
});

describe("getSystemStatus", () => {
  it("관리자가 아니면 NotAdminError를 throw한다", async () => {
    await expect(getSystemStatus(employeeViewer)).rejects.toBeInstanceOf(NotAdminError);
  });

  it("정상 조회 시 db.ratio·banner·backup.kind·version.sha를 계산한다", async () => {
    const status = await getSystemStatus(adminViewer, {
      countConnections: async () => 3,
      maxConnections: async () => 25,
      getLastBackup: async () => ({ kind: "unavailable", reason: "not-configured" }),
    });

    expect("unavailable" in status.db).toBe(false);
    if (!("unavailable" in status.db)) {
      expect(status.db.ratio).toBeCloseTo(0.12);
      expect(status.db.banner).toBe(false);
    }
    expect(status.backup.kind).toBe("unavailable");
    expect(status.version.sha).toBe("local");
  });

  it("countConnections가 throw하면 db가 unavailable이 되고 화면은 계속 렌더한다(조용히 삼키지 않는다)", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      const status = await getSystemStatus(adminViewer, {
        countConnections: async () => {
          throw new Error("connection refused");
        },
        maxConnections: async () => 25,
        getLastBackup: async () => ({ kind: "none" }),
      });

      expect(status.db).toEqual({ unavailable: true });

      const calls = [...logSpy.mock.calls];
      const found = calls.some((args) =>
        args.some(
          (arg) => typeof arg === "string" && arg.includes('"event":"status.db_unavailable"'),
        ),
      );
      expect(found).toBe(true);
    } finally {
      logSpy.mockRestore();
    }
  });

  it("getLastBackup이 none이면 backup.kind가 none이다", async () => {
    const status = await getSystemStatus(adminViewer, {
      countConnections: async () => 1,
      maxConnections: async () => 25,
      getLastBackup: async () => ({ kind: "none" }),
    });
    expect(status.backup.kind).toBe("none");
  });
});

describe("getLastBackup (D-18)", () => {
  it("project·instance 미설정이면 네트워크 없이 즉시 not-configured를 반환한다", async () => {
    const result = await getLastBackup({});
    expect(result).toEqual({ kind: "unavailable", reason: "not-configured" });
  });

  it("items가 비어 있으면(또는 없으면) none이다 — 첫 자동 백업 전", async () => {
    const result = await getLastBackup(
      { project: "p", instance: "i" },
      { list: async () => ({ items: [] }) },
    );
    expect(result).toEqual({ kind: "none" });
  });

  it("items[0]이 있으면 ok를 반환한다", async () => {
    const result = await getLastBackup(
      { project: "p", instance: "i" },
      {
        list: async () => ({
          items: [{ status: "SUCCESSFUL", endTime: "2026-09-19T18:30:00Z" }],
        }),
      },
    );
    expect(result).toEqual({ kind: "ok", status: "SUCCESSFUL", endTime: "2026-09-19T18:30:00Z" });
  });

  it("list가 throw하면 unavailable + reason=Error다(확인 불가)", async () => {
    const result = await getLastBackup(
      { project: "p", instance: "i" },
      {
        list: async () => {
          throw new Error("boom");
        },
      },
    );
    expect(result).toEqual({ kind: "unavailable", reason: "Error" });
  });
});
