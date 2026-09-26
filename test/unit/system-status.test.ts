import { describe, expect, it, vi } from "vitest";
import { NotAdminError, connectionBanner, getSystemStatus } from "@/domain/system-status";
import { getLastBackup } from "@/lib/gcp/cloud-sql-admin";
import type { Viewer } from "@/domain/viewer";

const adminViewer: Viewer = { id: "admin-1", roleId: "role-sysadmin" };
const employeeViewer: Viewer = { id: "emp-1", roleId: "role-pm" };

// D-36(03-02) 이후 판정은 권한표(can())를 읽는다 — 여기서는 StatusDeps.can을
// 스텁해 Postgres 없이 두 계급을 흉내낸다.
const allowCan = () => Promise.resolve(true);
const denyCan = () => Promise.resolve(false);
// 04.4-01: 복원 리허설 기록 조회 — 기존 테스트는 기록 없음(null)만 주입한다.
const noRehearsal = () => Promise.resolve(null);

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
  it("권한표에서 시스템 상태 보기 권한이 없으면 NotAdminError를 throw한다", async () => {
    await expect(getSystemStatus(employeeViewer, { can: denyCan })).rejects.toBeInstanceOf(NotAdminError);
  });

  // D-36 이후 판정이 계급 이름이 아니라 권한표를 읽는다는 증명 — 기본 계급
  // (role-pm) viewer라도 can()이 허용을 돌려주면 성공한다.
  it("권한표에서 시스템 상태 보기 칸이 켜진 기본 계급 viewer는 성공한다", async () => {
    const status = await getSystemStatus(employeeViewer, {
      can: allowCan,
      countConnections: () => Promise.resolve(1),
      maxConnections: () => Promise.resolve(25),
      getLastBackup: () => Promise.resolve({ kind: "none" as const }),
      getLatestRestoreRehearsal: noRehearsal,
    });
    expect(status.backup.kind).toBe("none");
  });

  it("정상 조회 시 db.ratio·banner·backup.kind·version.sha를 계산한다", async () => {
    const status = await getSystemStatus(adminViewer, {
      can: allowCan,
      countConnections: () => Promise.resolve(3),
      maxConnections: () => Promise.resolve(25),
      getLastBackup: () => Promise.resolve({ kind: "unavailable" as const, reason: "not-configured" }),
      getLatestRestoreRehearsal: noRehearsal,
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
        can: allowCan,
        countConnections: () => {
          throw new Error("connection refused");
        },
        maxConnections: () => Promise.resolve(25),
        getLastBackup: () => Promise.resolve({ kind: "none" as const }),
        getLatestRestoreRehearsal: noRehearsal,
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
      can: allowCan,
      countConnections: () => Promise.resolve(1),
      maxConnections: () => Promise.resolve(25),
      getLastBackup: () => Promise.resolve({ kind: "none" as const }),
      getLatestRestoreRehearsal: noRehearsal,
    });
    expect(status.backup.kind).toBe("none");
  });
});

describe("getSystemStatus — 복원 리허설 (04.4-01)", () => {
  it("기록이 없으면 restoreRehearsal이 none이다", async () => {
    const status = await getSystemStatus(adminViewer, {
      can: allowCan,
      countConnections: () => Promise.resolve(1),
      maxConnections: () => Promise.resolve(25),
      getLastBackup: () => Promise.resolve({ kind: "none" as const }),
      getLatestRestoreRehearsal: noRehearsal,
    });
    expect(status.restoreRehearsal).toEqual({ kind: "none" });
  });

  it("권한 없는 viewer는 NotAdminError이고 리허설 기록을 조회하지 않는다", async () => {
    const getLatestRestoreRehearsal = vi.fn(noRehearsal);
    await expect(
      getSystemStatus(employeeViewer, { can: denyCan, getLatestRestoreRehearsal }),
    ).rejects.toBeInstanceOf(NotAdminError);
    expect(getLatestRestoreRehearsal).not.toHaveBeenCalled();
  });

  it("리허설 조회가 throw하면 restoreRehearsal만 unavailable이고 나머지는 정상이다", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      const status = await getSystemStatus(adminViewer, {
        can: allowCan,
        countConnections: () => Promise.resolve(3),
        maxConnections: () => Promise.resolve(25),
        getLastBackup: () => Promise.resolve({ kind: "none" as const }),
        getLatestRestoreRehearsal: () => Promise.reject(new Error("lock timeout")),
      });
      expect(status.restoreRehearsal).toEqual({ kind: "unavailable" });
      expect(status.db).toMatchObject({ connections: 3, maxConnections: 25 });
      expect(status.backup).toEqual({ kind: "none" });
      expect(status.version.sha).toBe("local");
    } finally {
      logSpy.mockRestore();
    }
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
      { list: () => Promise.resolve({ items: [] }) },
    );
    expect(result).toEqual({ kind: "none" });
  });

  it("items[0]이 있으면 ok를 반환한다", async () => {
    const result = await getLastBackup(
      { project: "p", instance: "i" },
      {
        list: () =>
          Promise.resolve({
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
        list: () => {
          throw new Error("boom");
        },
      },
    );
    expect(result).toEqual({ kind: "unavailable", reason: "Error" });
  });
});
