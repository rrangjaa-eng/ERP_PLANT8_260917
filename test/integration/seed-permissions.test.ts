import { describe, expect, it } from "vitest";
import { seedMasterData } from "@/domain/seed";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { CEO_ROLE_ID, DEFAULT_ROLE_ID, SYSADMIN_ROLE_ID, TEAM_LEAD_ROLE_ID } from "@/domain/permissions/roles";
import { MENUS } from "@/domain/permissions/menus";
import { INFO_ITEMS } from "@/domain/permissions/info-items";
import {
  findPermission,
  findVisibility,
  listPermissions,
  upsertPermission,
  upsertVisibility,
} from "@/repositories/permissions";

// 버그: seedMasterData가 DEFAULT_ROLE_ID의 projects view/write를 매번
// upsertPermission(onConflictDoUpdate)으로 다시 켠다 — 관리자가 권한표에서
// 껐어도 다음 배포(=다음 시드 실행)에서 조용히 되살아난다.
describe("seedMasterData가 관리자의 권한 회수를 덮어쓰지 않는다", () => {
  it("DEFAULT_ROLE_ID의 projects write를 꺼둔 뒤 시드를 다시 돌려도 꺼진 채로 유지된다", async () => {
    await upsertPermission(SYSTEM_VIEWER, { roleId: DEFAULT_ROLE_ID, menu: "projects", action: "write", allowed: false });

    await seedMasterData(SYSTEM_VIEWER);

    const row = await findPermission(SYSTEM_VIEWER, DEFAULT_ROLE_ID, "projects", "write");
    expect(row?.allowed).toBe(false);
  });

  // 04.5-09(UI-SPEC 화면 1 — 이미 있는 행은 덮지 않는다): 화면 항목 메뉴는 시스템 관리자 view·write만 insert-if-absent.
  it("시스템 관리자의 admin.field-definitions write를 꺼둔 뒤 시드를 다시 돌려도 꺼진 채로 유지된다", async () => {
    expect((await findPermission(SYSTEM_VIEWER, SYSADMIN_ROLE_ID, "admin.field-definitions", "view"))?.allowed).toBe(true);
    expect((await findPermission(SYSTEM_VIEWER, SYSADMIN_ROLE_ID, "admin.field-definitions", "write"))?.allowed).toBe(true);
    expect(await findPermission(SYSTEM_VIEWER, SYSADMIN_ROLE_ID, "admin.field-definitions", "approve")).toBeNull();
    await upsertPermission(SYSTEM_VIEWER, { roleId: SYSADMIN_ROLE_ID, menu: "admin.field-definitions", action: "write", allowed: false });
    try {
      await seedMasterData(SYSTEM_VIEWER);

      const row = await findPermission(SYSTEM_VIEWER, SYSADMIN_ROLE_ID, "admin.field-definitions", "write");
      expect(row?.allowed).toBe(false);
    } finally {
      await upsertPermission(SYSTEM_VIEWER, { roleId: SYSADMIN_ROLE_ID, menu: "admin.field-definitions", action: "write", allowed: true });
    }
  });
});

// 04.3-09 — 확인증 기본 권한 · 노출. 매 테스트 전 setup.ts가 TRUNCATE + 시드한다 —
// 아래 「빈 DB 첫 시드」 케이스는 그 첫 시드 결과를 그대로 본다.
async function allowed(roleId: string, menu: string, action: "view" | "write"): Promise<boolean> {
  return (await findPermission(SYSTEM_VIEWER, roleId, menu, action))?.allowed === true;
}

async function visible(roleId: string, infoItem: string): Promise<boolean> {
  return (await findVisibility(SYSTEM_VIEWER, roleId, infoItem))?.visible === true;
}

describe("기획 PM의 확인증 행사 기본 권한(04.3-09)", () => {
  it("빈 DB 첫 시드 뒤 PM은 certs.events 보기 · 쓰기가 있고 certs.submissions는 없다", async () => {
    expect(await allowed(DEFAULT_ROLE_ID, "certs.events", "view")).toBe(true);
    expect(await allowed(DEFAULT_ROLE_ID, "certs.events", "write")).toBe(true);
    expect(await allowed(DEFAULT_ROLE_ID, "certs.submissions", "view")).toBe(false);
    expect(await allowed(DEFAULT_ROLE_ID, "certs.submissions", "write")).toBe(false);
  });

  it("대표 계급에는 확인증 메뉴가 하나도 켜져 있지 않고 개인정보 열람 항목 둘도 꺼져 있다", async () => {
    const menus = await listPermissions(SYSTEM_VIEWER, { roleId: CEO_ROLE_ID });
    expect(menus.filter((row) => row.menu.startsWith("certs.") && row.allowed)).toEqual([]);
    // cert_event.value는 04-20의 staffDefault 규칙(대표 포함)으로 켜지지만
    // 메뉴 권한이 없어 행사 화면에 닿지 않는다 — 개인정보 열람 둘은 어느 계급에도 기본으로 켜지 않는다.
    expect(await visible(CEO_ROLE_ID, "cert_submission.value")).toBe(false);
    expect(await visible(CEO_ROLE_ID, "cert.rrn_unmasked")).toBe(false);
  });

  it("PM의 certs.events를 권한표에서 끈 뒤 시드를 다시 돌려도 꺼진 채다", async () => {
    await upsertPermission(SYSTEM_VIEWER, { roleId: DEFAULT_ROLE_ID, menu: "certs.events", action: "view", allowed: false });
    await upsertPermission(SYSTEM_VIEWER, { roleId: DEFAULT_ROLE_ID, menu: "certs.events", action: "write", allowed: false });

    await seedMasterData(SYSTEM_VIEWER);

    expect(await allowed(DEFAULT_ROLE_ID, "certs.events", "view")).toBe(false);
    expect(await allowed(DEFAULT_ROLE_ID, "certs.events", "write")).toBe(false);
  });
});

describe("확인증 정보 항목 노출 시드(04.3-09, codex final2 C · 04.3-10 E12)", () => {
  it("빈 DB 첫 시드는 PM에게 cert_event.value를 켜고 cert_prize.value · cert_submission.value · cert.rrn_unmasked는 끈다", async () => {
    expect(await visible(DEFAULT_ROLE_ID, "cert_event.value")).toBe(true);
    expect(await visible(DEFAULT_ROLE_ID, "cert_prize.value")).toBe(false);
    expect(await visible(DEFAULT_ROLE_ID, "cert_submission.value")).toBe(false);
    expect(await visible(DEFAULT_ROLE_ID, "cert.rrn_unmasked")).toBe(false);
  });

  it("정보 항목 등록부에 옛 당첨자 항목이 없고 cert_prize.value(staffDefault false)가 있다", () => {
    expect(INFO_ITEMS.map((item) => item.key).filter((key) => key.startsWith("cert"))).toEqual([
      "cert_event.value",
      "cert_prize.value",
      "cert_submission.value",
      "cert.rrn_unmasked",
    ]);
    expect(INFO_ITEMS.find((item) => item.key === "cert_prize.value")).toEqual({
      key: "cert_prize.value",
      label: "확인증 경품 가액",
      staffDefault: false,
    });
  });
});

// 04.3-10(5909578685 · E12) — 경영관리 권한 키 certs.qr은 시스템 관리자 계급만 시드가 켠다(경영관리 계급은 권한표에서).
// 가액 항목 cert_prize.value는 cert_submission.value와 같은 규칙 — 시스템 관리자에게도 없을 때만 거짓으로 넣는다.
describe("certs.qr · cert_prize.value 시드(04.3-10)", () => {
  it("MENUS에 certs.qr이 있고 시드 뒤 시스템 관리자 쓰기 허용 · PM은 없다", async () => {
    expect(MENUS.find((menu) => menu.key === "certs.qr")).toEqual({ key: "certs.qr", label: "확인증 QR 생성 · 경품 목록" });
    expect(await allowed(SYSADMIN_ROLE_ID, "certs.qr", "write")).toBe(true);
    expect(await allowed(DEFAULT_ROLE_ID, "certs.qr", "write")).toBe(false);
    expect(await allowed(CEO_ROLE_ID, "certs.qr", "write")).toBe(false);
  });

  it("시스템 관리자의 cert_prize.value는 첫 시드에 거짓 · 소유자가 켠 값은 재시드가 덮지 않는다(insert-if-absent)", async () => {
    expect(await visible(SYSADMIN_ROLE_ID, "cert_prize.value")).toBe(false);
    await upsertVisibility(SYSTEM_VIEWER, { roleId: SYSADMIN_ROLE_ID, infoItem: "cert_prize.value", visible: true });
    await seedMasterData(SYSTEM_VIEWER);
    expect(await visible(SYSADMIN_ROLE_ID, "cert_prize.value")).toBe(true);
  });
});

// E3-13 — 시스템 관리자도 확인증 개인정보 열람 셋(cert.rrn_unmasked ·
// cert_submission.value · 메뉴 certs.submissions)은 시드가 자동으로 켜지 않는다.
describe("시스템 관리자의 확인증 개인정보 열람 셋(E3-13)", () => {
  it("빈 DB 첫 시드 뒤 세 값은 거짓이고 cert_event.value · certs.events(view)는 참이다", async () => {
    expect(await visible(SYSADMIN_ROLE_ID, "cert.rrn_unmasked")).toBe(false);
    expect(await visible(SYSADMIN_ROLE_ID, "cert_submission.value")).toBe(false);
    expect(await allowed(SYSADMIN_ROLE_ID, "certs.submissions", "view")).toBe(false);
    expect(await allowed(SYSADMIN_ROLE_ID, "certs.submissions", "write")).toBe(false);

    expect(await visible(SYSADMIN_ROLE_ID, "cert_event.value")).toBe(true);
    expect(await allowed(SYSADMIN_ROLE_ID, "certs.events", "view")).toBe(true);
  });

  it("cert.setup처럼 켠 뒤 재시드해도 세 값이 참으로 유지된다", async () => {
    await upsertVisibility(SYSTEM_VIEWER, { roleId: SYSADMIN_ROLE_ID, infoItem: "cert.rrn_unmasked", visible: true });
    await upsertVisibility(SYSTEM_VIEWER, { roleId: SYSADMIN_ROLE_ID, infoItem: "cert_submission.value", visible: true });
    await upsertPermission(SYSTEM_VIEWER, { roleId: SYSADMIN_ROLE_ID, menu: "certs.submissions", action: "view", allowed: true });

    await seedMasterData(SYSTEM_VIEWER);

    expect(await visible(SYSADMIN_ROLE_ID, "cert.rrn_unmasked")).toBe(true);
    expect(await visible(SYSADMIN_ROLE_ID, "cert_submission.value")).toBe(true);
    expect(await allowed(SYSADMIN_ROLE_ID, "certs.submissions", "view")).toBe(true);
  });

  it("소유자가 켠 값을 끈 뒤 재시드해도 거짓이 유지된다(되살리지 않는다)", async () => {
    await upsertVisibility(SYSTEM_VIEWER, { roleId: SYSADMIN_ROLE_ID, infoItem: "cert.rrn_unmasked", visible: true });
    await upsertVisibility(SYSTEM_VIEWER, { roleId: SYSADMIN_ROLE_ID, infoItem: "cert_submission.value", visible: true });
    await upsertPermission(SYSTEM_VIEWER, { roleId: SYSADMIN_ROLE_ID, menu: "certs.submissions", action: "view", allowed: true });
    await upsertVisibility(SYSTEM_VIEWER, { roleId: SYSADMIN_ROLE_ID, infoItem: "cert.rrn_unmasked", visible: false });
    await upsertVisibility(SYSTEM_VIEWER, { roleId: SYSADMIN_ROLE_ID, infoItem: "cert_submission.value", visible: false });
    await upsertPermission(SYSTEM_VIEWER, { roleId: SYSADMIN_ROLE_ID, menu: "certs.submissions", action: "view", allowed: false });

    await seedMasterData(SYSTEM_VIEWER);

    expect(await visible(SYSADMIN_ROLE_ID, "cert.rrn_unmasked")).toBe(false);
    expect(await visible(SYSADMIN_ROLE_ID, "cert_submission.value")).toBe(false);
    expect(await allowed(SYSADMIN_ROLE_ID, "certs.submissions", "view")).toBe(false);
  });
});

// 05-08(사용자 결정 2026-09-26 #5): 팀 지출결의 보기 — 팀장 계급에 보기만 insert-if-absent. 관리자가 끈 값은 재시드가 되살리지 않는다.
describe("expenses.team 시드(05-08)", () => {
  it("MENUS에 expenses.team이 있고 첫 시드 뒤 팀장 계급 보기가 켜져 있고 기획 PM은 없다", async () => {
    expect(MENUS.find((menu) => menu.key === "expenses.team")?.label).toBe("팀 지출결의 보기");
    expect(await allowed(TEAM_LEAD_ROLE_ID, "expenses.team", "view")).toBe(true);
    expect(await allowed(DEFAULT_ROLE_ID, "expenses.team", "view")).toBe(false);
  });

  it("팀장 계급의 expenses.team 보기를 끈 뒤 시드를 다시 돌려도 꺼진 채다", async () => {
    await upsertPermission(SYSTEM_VIEWER, { roleId: TEAM_LEAD_ROLE_ID, menu: "expenses.team", action: "view", allowed: false });

    await seedMasterData(SYSTEM_VIEWER);

    expect(await allowed(TEAM_LEAD_ROLE_ID, "expenses.team", "view")).toBe(false);
  });
});
