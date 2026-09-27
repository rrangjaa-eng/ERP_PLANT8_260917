import { describe, expect, it, vi } from "vitest";
import {
  NotAdminError,
  connectionBanner,
  emailFailureBannerFrom,
  emailFailureBannerText,
  getSystemStatus,
  type StatusDeps,
} from "@/domain/system-status";
import { getLastBackup } from "@/lib/gcp/cloud-sql-admin";
import type { Viewer } from "@/domain/viewer";

const adminViewer: Viewer = { id: "admin-1", roleId: "role-sysadmin" };
const employeeViewer: Viewer = { id: "emp-1", roleId: "role-pm" };

// D-36(03-02) 이후 판정은 권한표(can())를 읽는다 — 여기서는 StatusDeps.can을
// 스텁해 Postgres 없이 두 계급을 흉내낸다.
const allowCan = () => Promise.resolve(true);
const denyCan = () => Promise.resolve(false);

// 04.2-13: 새 항목(알림 발송·이메일)의 읽기를 기본으로 스텁해 기존 케이스가 DB 없이 돈다.
const quietDeps: Partial<StatusDeps> = {
  getLastTickRun: () => Promise.resolve(null),
  getLastEmailOutcome: () => Promise.resolve(null),
  getUnresolvedEmail: () => Promise.resolve({ bundles: 0, since: null }),
  smtpConfig: () => null,
};

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
    await expect(getSystemStatus(employeeViewer, { ...quietDeps, can: denyCan })).rejects.toBeInstanceOf(NotAdminError);
  });

  // D-36 이후 판정이 계급 이름이 아니라 권한표를 읽는다는 증명 — 기본 계급
  // (role-pm) viewer라도 can()이 허용을 돌려주면 성공한다.
  it("권한표에서 시스템 상태 보기 칸이 켜진 기본 계급 viewer는 성공한다", async () => {
    const status = await getSystemStatus(employeeViewer, {
      ...quietDeps,
      can: allowCan,
      countConnections: () => Promise.resolve(1),
      maxConnections: () => Promise.resolve(25),
      getLastBackup: () => Promise.resolve({ kind: "none" as const }),
    });
    expect(status.backup.kind).toBe("none");
  });

  it("정상 조회 시 db.ratio·banner·backup.kind·version.sha를 계산한다", async () => {
    const status = await getSystemStatus(adminViewer, {
      ...quietDeps,
      can: allowCan,
      countConnections: () => Promise.resolve(3),
      maxConnections: () => Promise.resolve(25),
      getLastBackup: () => Promise.resolve({ kind: "unavailable" as const, reason: "not-configured" }),
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
        ...quietDeps,
        can: allowCan,
        countConnections: () => {
          throw new Error("connection refused");
        },
        maxConnections: () => Promise.resolve(25),
        getLastBackup: () => Promise.resolve({ kind: "none" as const }),
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
      ...quietDeps,
      can: allowCan,
      countConnections: () => Promise.resolve(1),
      maxConnections: () => Promise.resolve(25),
      getLastBackup: () => Promise.resolve({ kind: "none" as const }),
    });
    expect(status.backup.kind).toBe("none");
  });
});

// 2026-09-24 00:00Z = KST 09:00.
const at0900 = new Date("2026-09-24T00:00:00Z");
const at0900prev = new Date("2026-09-23T00:00:00Z");

function statusDeps(extra: Partial<StatusDeps>): Partial<StatusDeps> {
  return {
    ...quietDeps,
    can: allowCan,
    countConnections: () => Promise.resolve(1),
    maxConnections: () => Promise.resolve(25),
    getLastBackup: () => Promise.resolve({ kind: "none" as const }),
    now: () => new Date("2026-09-24T03:00:00Z"),
    ...extra,
  };
}

const tickRow = {
  startedAt: at0900,
  businessDay: true,
  sent: 12,
  skipped: 3,
  remaining: 0,
};

describe("getSystemStatus — 알림 발송 줄 (18A, 04.2-13)", () => {
  it("실행 기록이 없으면 notify.kind = none", async () => {
    const status = await getSystemStatus(adminViewer, statusDeps({}));
    expect(status.notify).toEqual({ kind: "none" });
  });

  it("영업일 실행은 KST 분 단위 시각과 건수를 싣는다", async () => {
    const status = await getSystemStatus(adminViewer, statusDeps({ getLastTickRun: () => Promise.resolve(tickRow) }));
    expect(status.notify).toEqual({
      kind: "ok",
      at: "2026-09-24 09:00",
      businessDay: true,
      sent: 12,
      skipped: 3,
      remaining: 0,
    });
  });

  it("비영업일 실행은 businessDay: false", async () => {
    const status = await getSystemStatus(
      adminViewer,
      statusDeps({ getLastTickRun: () => Promise.resolve({ ...tickRow, businessDay: false, sent: 0, skipped: 0 }) }),
    );
    expect(status.notify).toMatchObject({ kind: "ok", businessDay: false });
  });

  it("읽기가 던지면 notify만 unavailable이고 다른 항목은 정상이다(로그를 남긴다)", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      const status = await getSystemStatus(
        adminViewer,
        statusDeps({
          getLastTickRun: () => Promise.reject(new Error("boom")),
          smtpConfig: () => ({ host: "h", user: "u", password: "p", from: "erp@plant8.kr" }),
        }),
      );
      expect(status.notify).toEqual({ kind: "unavailable" });
      expect(status.email).toEqual({ kind: "configured", from: "erp@plant8.kr" });
      expect(status.emailOutcome.kind).toBe("ok");
      expect("unavailable" in status.db).toBe(false);
      expect(logSpy.mock.calls.some((args) => String(args[0]).includes('"event":"status.notify_unavailable"'))).toBe(
        true,
      );
    } finally {
      logSpy.mockRestore();
    }
  });
});

describe("getSystemStatus — 이메일 설정과 결과 (D-711 · Codex #18 · D-4217)", () => {
  it("SMTP 설정이 없으면 email.kind = unconfigured, 있으면 from만 싣는다(host·user·password 없음)", async () => {
    const off = await getSystemStatus(adminViewer, statusDeps({}));
    expect(off.email).toEqual({ kind: "unconfigured" });

    const on = await getSystemStatus(
      adminViewer,
      statusDeps({ smtpConfig: () => ({ host: "smtp.secret-host", user: "secret-user", password: "secret-pw", from: "erp@plant8.kr" }) }),
    );
    expect(on.email).toEqual({ kind: "configured", from: "erp@plant8.kr" });
    const json = JSON.stringify(on);
    expect(json).not.toContain("secret-host");
    expect(json).not.toContain("secret-user");
    expect(json).not.toContain("secret-pw");
  });

  it("이메일 시도가 없고 결과 불명도 없으면 0과 null", async () => {
    const status = await getSystemStatus(adminViewer, statusDeps({}));
    expect(status.emailOutcome).toEqual({ kind: "ok", failed: 0, failedAt: null, unknown: 0, unknownSince: null });
  });

  it("마지막 시도에 실패 3건이면 failed·failedAt을 싣는다", async () => {
    const status = await getSystemStatus(
      adminViewer,
      statusDeps({ getLastEmailOutcome: () => Promise.resolve({ at: at0900, failed: 3 }) }),
    );
    expect(status.emailOutcome).toEqual({
      kind: "ok",
      failed: 3,
      failedAt: "2026-09-24 09:00",
      unknown: 0,
      unknownSince: null,
    });
  });

  it("결과 불명은 마지막 실행과 떨어져 온다 — 마지막 시도 실패 0이어도 unknown이 보인다(Codex 2차 #1)", async () => {
    const calls: { now: Date; unknownAfterMs: number; visibleDays: number }[] = [];
    const status = await getSystemStatus(
      adminViewer,
      statusDeps({
        getLastEmailOutcome: () => Promise.resolve({ at: at0900, failed: 0 }),
        getUnresolvedEmail: (_viewer, opts) => {
          calls.push(opts);
          return Promise.resolve({ bundles: 2, since: at0900prev });
        },
      }),
    );
    expect(status.emailOutcome).toEqual({
      kind: "ok",
      failed: 0,
      failedAt: null,
      unknown: 2,
      unknownSince: "2026-09-23 09:00",
    });
    expect(calls[0]).toEqual({ now: new Date("2026-09-24T03:00:00Z"), unknownAfterMs: 600_000, visibleDays: 7 });
  });

  it("두 읽기 중 하나라도 던지면 emailOutcome만 unavailable이고 email은 정상", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      const a = await getSystemStatus(
        adminViewer,
        statusDeps({ getUnresolvedEmail: () => Promise.reject(new Error("x")) }),
      );
      expect(a.emailOutcome).toEqual({ kind: "unavailable" });
      expect(a.email).toEqual({ kind: "unconfigured" });
      const b = await getSystemStatus(
        adminViewer,
        statusDeps({ getLastEmailOutcome: () => Promise.reject(new Error("y")) }),
      );
      expect(b.emailOutcome).toEqual({ kind: "unavailable" });
    } finally {
      logSpy.mockRestore();
    }
  });

  it("SMTP가 지금 미설정이어도 이전 실패는 결과에 남는다(Codex #18)", async () => {
    const status = await getSystemStatus(
      adminViewer,
      statusDeps({ smtpConfig: () => null, getLastEmailOutcome: () => Promise.resolve({ at: at0900, failed: 3 }) }),
    );
    expect(status.email).toEqual({ kind: "unconfigured" });
    expect(status.emailOutcome).toMatchObject({ kind: "ok", failed: 3 });
  });
});

describe("emailFailureBannerFrom (B2 판정)", () => {
  it("unavailable이면 null", () => {
    expect(emailFailureBannerFrom({ kind: "unavailable" })).toBeNull();
  });

  it("실패·결과 불명이 모두 0이면 null", () => {
    expect(
      emailFailureBannerFrom({ kind: "ok", failed: 0, failedAt: null, unknown: 0, unknownSince: null }),
    ).toBeNull();
  });

  it("실패만 있으면 실패 모양", () => {
    expect(
      emailFailureBannerFrom({ kind: "ok", failed: 3, failedAt: "2026-09-24 09:00", unknown: 0, unknownSince: null }),
    ).toEqual({ failed: 3, failedAt: "2026-09-24 09:00", unknown: 0, unknownSince: null });
  });

  it("결과 불명만 있어도 배너", () => {
    expect(
      emailFailureBannerFrom({ kind: "ok", failed: 0, failedAt: null, unknown: 2, unknownSince: "2026-09-23 09:00" }),
    ).toEqual({ failed: 0, failedAt: null, unknown: 2, unknownSince: "2026-09-23 09:00" });
  });
});

describe("emailFailureBannerText (B2 글자 — D-4217)", () => {
  it("실패만", () => {
    expect(
      emailFailureBannerText({ failed: 3, failedAt: "2026-09-24 09:00", unknown: 0, unknownSince: null }),
    ).toBe("이메일 발송 실패 3건 (2026-09-24 09:00)");
  });

  it("결과 불명만 — 0건 조각 없음", () => {
    expect(
      emailFailureBannerText({ failed: 0, failedAt: null, unknown: 2, unknownSince: "2026-09-23 09:00" }),
    ).toBe("이메일 결과 불명 2건 (2026-09-23 09:00)");
  });

  it("둘 다 — 시각은 조각마다 괄호", () => {
    expect(
      emailFailureBannerText({ failed: 1, failedAt: "2026-09-24 09:00", unknown: 1, unknownSince: "2026-09-23 09:00" }),
    ).toBe("이메일 발송 실패 1건 (2026-09-24 09:00) · 결과 불명 1건 (2026-09-23 09:00)");
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
