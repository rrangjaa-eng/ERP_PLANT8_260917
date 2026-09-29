import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { seedMasterData } from "@/domain/seed";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { CEO_ROLE_ID, DEFAULT_ROLE_ID, SYSADMIN_ROLE_ID } from "@/domain/permissions/roles";
import { createAccount } from "@/domain/auth/accounts";
import { setSettingValue } from "@/domain/settings/registry";
import { CERT_CONTACT_PHONE, CERT_ENABLED } from "@/domain/settings/keys";
import { createEvent, getEventDetail } from "@/domain/certs/events";
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
});

// 04.3-09 — 확인증 기본 권한 · 노출. 매 테스트 전 setup.ts가 TRUNCATE + 시드한다 —
// 아래 「빈 DB 첫 시드」 케이스는 그 첫 시드 결과를 그대로 본다.
async function allowed(roleId: string, menu: string, action: "view" | "write"): Promise<boolean> {
  return (await findPermission(SYSTEM_VIEWER, roleId, menu, action))?.allowed === true;
}

async function visible(roleId: string, infoItem: string): Promise<boolean> {
  return (await findVisibility(SYSTEM_VIEWER, roleId, infoItem))?.visible === true;
}

async function makeUser(roleId: string): Promise<Viewer> {
  const { userId } = await createAccount(SYSTEM_VIEWER, {
    email: `seed-cert-${randomUUID()}@example.test`,
    name: "시드 검증 PM",
    roleId,
  });
  return { id: userId, roleId };
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
    // cert_event.value · cert_winner.value는 04-20의 staffDefault 규칙(대표 포함)으로 켜지지만
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

describe("확인증 정보 항목 노출 시드(04.3-09, codex final2 C)", () => {
  it("빈 DB 첫 시드는 PM에게 cert_event.value · cert_winner.value를 켜고 cert_submission.value · cert.rrn_unmasked는 끈다", async () => {
    expect(await visible(DEFAULT_ROLE_ID, "cert_event.value")).toBe(true);
    expect(await visible(DEFAULT_ROLE_ID, "cert_winner.value")).toBe(true);
    expect(await visible(DEFAULT_ROLE_ID, "cert_submission.value")).toBe(false);
    expect(await visible(DEFAULT_ROLE_ID, "cert.rrn_unmasked")).toBe(false);
  });

  it("관리자가 PM의 cert_winner.value를 끈 뒤 재시드해도 꺼진 채이고 PM의 행사 상세에 당첨자 이름 · 전화번호가 없다", async () => {
    await setSettingValue(SYSTEM_VIEWER, CERT_ENABLED, true);
    await setSettingValue(SYSTEM_VIEWER, CERT_CONTACT_PHONE, "02-123-4567");
    // 04.3-04 cert-events 선례 — 이 케이스는 노출만 본다. 메뉴 시드와 무관하게 PM에게 행사 권한을 준다.
    await upsertPermission(SYSTEM_VIEWER, { roleId: DEFAULT_ROLE_ID, menu: "certs.events", action: "view", allowed: true });
    await upsertPermission(SYSTEM_VIEWER, { roleId: DEFAULT_ROLE_ID, menu: "certs.events", action: "write", allowed: true });
    const pm = await makeUser(DEFAULT_ROLE_ID);

    const created = await createEvent(pm, {
      name: `시드 회귀-${randomUUID().slice(0, 8)}`,
      wonOn: "2026-09-13",
      winners: [{ name: "김하늘", phone: "010-4821-7730", prizeName: "갤럭시 탭 S10", quantity: "1", delivery: "현장" }],
    });
    if (created.kind !== "ok") throw new Error(`createEvent 실패: ${created.kind}`);

    // 대조 — 끄기 전에는 이름이 보인다.
    const before = await getEventDetail(pm, created.eventId);
    if (before.kind !== "ok") throw new Error("상세 실패");
    expect(JSON.stringify(before)).toContain("김하늘");

    await upsertVisibility(SYSTEM_VIEWER, { roleId: DEFAULT_ROLE_ID, infoItem: "cert_winner.value", visible: false });
    await seedMasterData(SYSTEM_VIEWER);

    expect((await findVisibility(SYSTEM_VIEWER, DEFAULT_ROLE_ID, "cert_winner.value"))?.visible).toBe(false);
    const after = await getEventDetail(pm, created.eventId);
    if (after.kind !== "ok") throw new Error("상세 실패");
    const dump = JSON.stringify(after);
    for (const secret of ["김하늘", "01048217730", "010-4821-7730"]) expect(dump).not.toContain(secret);
    const winner = after.event.winners?.[0];
    expect(winner).toBeDefined();
    expect(winner).not.toHaveProperty("name");
    expect(winner).not.toHaveProperty("phone");
    // 시스템 관리자의 cert_winner.value는 재시드 뒤에도 켜져 있다.
    expect(await visible(SYSADMIN_ROLE_ID, "cert_winner.value")).toBe(true);
  });
});

// E3-13 — 시스템 관리자도 확인증 개인정보 열람 셋(cert.rrn_unmasked ·
// cert_submission.value · 메뉴 certs.submissions)은 시드가 자동으로 켜지 않는다.
describe("시스템 관리자의 확인증 개인정보 열람 셋(E3-13)", () => {
  it("빈 DB 첫 시드 뒤 세 값은 거짓이고 cert_event.value · cert_winner.value · certs.events(view)는 참이다", async () => {
    expect(await visible(SYSADMIN_ROLE_ID, "cert.rrn_unmasked")).toBe(false);
    expect(await visible(SYSADMIN_ROLE_ID, "cert_submission.value")).toBe(false);
    expect(await allowed(SYSADMIN_ROLE_ID, "certs.submissions", "view")).toBe(false);
    expect(await allowed(SYSADMIN_ROLE_ID, "certs.submissions", "write")).toBe(false);

    expect(await visible(SYSADMIN_ROLE_ID, "cert_event.value")).toBe(true);
    expect(await visible(SYSADMIN_ROLE_ID, "cert_winner.value")).toBe(true);
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
