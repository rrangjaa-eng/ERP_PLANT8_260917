import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/db/client";
import { codeItems, permissionMatrix, visibilityMatrix } from "@/db/schema";
import { seedMasterData } from "@/domain/seed";
import { seedApprovalsLeave } from "@/domain/seed/approvals-leave";
import { seedExpenses } from "@/domain/seed/expenses";
import { ROLE_DEFAULT_PERMISSIONS } from "@/domain/seed/role-defaults";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import {
  CEO_ROLE_ID,
  DEFAULT_ROLE_ID,
  DIVISION_HEAD_ROLE_ID,
  SYSADMIN_ROLE_ID,
  TEAM_LEAD_ROLE_ID,
} from "@/domain/permissions/roles";
import { can } from "@/domain/permissions/can";
import { insertRole } from "@/repositories/roles";
import { setCodeItemActive } from "@/repositories/code-tables";
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

// 06.2(D-6210): 참여자 붙이기 · 떼기 권한 키 — 시드가 대표 · 본부 책임자 · 팀장 · 기획 PM에 쓰기를 켜고(없을 때만), 시스템 관리자는 MENUS 루프가 켠다.
describe("projects.member 시드(06.2 D-6210)", () => {
  it("첫 시드 뒤 네 계급 · 시스템 관리자는 쓰기가 참, 권한 없는 새 계급은 거짓, 관리자가 끈 값은 재시드가 되살리지 않는다", async () => {
    for (const roleId of [CEO_ROLE_ID, DIVISION_HEAD_ROLE_ID, TEAM_LEAD_ROLE_ID, DEFAULT_ROLE_ID, SYSADMIN_ROLE_ID]) {
      expect(await can({ id: `viewer-${roleId}`, roleId }, "projects.member", "write")).toBe(true);
    }
    const fresh = await insertRole(SYSTEM_VIEWER, { id: `role-test-${randomUUID()}`, name: `새 계급-${randomUUID()}` });
    expect(await can({ id: "viewer-fresh", roleId: fresh.id }, "projects.member", "write")).toBe(false);

    await upsertPermission(SYSTEM_VIEWER, { roleId: TEAM_LEAD_ROLE_ID, menu: "projects.member", action: "write", allowed: false });
    await seedMasterData(SYSTEM_VIEWER);
    expect(await can({ id: "viewer-lead", roleId: TEAM_LEAD_ROLE_ID }, "projects.member", "write")).toBe(false);
  });
});

// 06.1(D-6113): 증빙 보기는 기획 PM · 팀장에게만 없을 때 켠다. 시스템 관리자는 MENUS 루프가 켠다.
describe("evidence 시드(06.1 D-6113)", () => {
  it("첫 시드 뒤 기획 PM · 팀장은 evidence 보기가 켜져 있고 대표 · 본부 책임자는 행이 없다 · 시스템 관리자는 evidence · evidence.intake 보기 · 쓰기가 참", async () => {
    expect((await findPermission(SYSTEM_VIEWER, DEFAULT_ROLE_ID, "evidence", "view"))?.allowed).toBe(true);
    expect((await findPermission(SYSTEM_VIEWER, TEAM_LEAD_ROLE_ID, "evidence", "view"))?.allowed).toBe(true);
    expect(await findPermission(SYSTEM_VIEWER, CEO_ROLE_ID, "evidence", "view")).toBeNull();
    expect(await findPermission(SYSTEM_VIEWER, DIVISION_HEAD_ROLE_ID, "evidence", "view")).toBeNull();
    for (const menu of ["evidence", "evidence.intake"]) {
      for (const action of ["view", "write"] as const) {
        expect(await can({ id: "viewer-admin", roleId: SYSADMIN_ROLE_ID }, menu, action), `${menu}:${action}`).toBe(true);
      }
    }
    expect(await can({ id: "viewer-pm", roleId: DEFAULT_ROLE_ID }, "evidence.intake", "write")).toBe(false);
  });

  it("기획 PM의 evidence 보기를 끈 뒤 시드를 다시 돌려도 꺼진 채다", async () => {
    await upsertPermission(SYSTEM_VIEWER, { roleId: DEFAULT_ROLE_ID, menu: "evidence", action: "view", allowed: false });

    await seedMasterData(SYSTEM_VIEWER);

    expect((await findPermission(SYSTEM_VIEWER, DEFAULT_ROLE_ID, "evidence", "view"))?.allowed).toBe(false);
  });

  it("정보 항목 evidence.value · evidence.amount가 staffDefault 참으로 있다", () => {
    expect(INFO_ITEMS.filter((item) => item.key.startsWith("evidence."))).toEqual([
      { key: "evidence.value", label: "증빙 내용", staffDefault: true },
      { key: "evidence.amount", label: "증빙 금액", staffDefault: true },
    ]);
  });
});

// 06.1(G15 · RP-15 · Round 2 R6): 개인카드 전표 종류 — 「올린 사람 · 경영관리만」 속성을 켜고 종류는 꺼 둔 채 넣는다(켜는 것은 06.1-14).
describe("개인카드 전표 증빙 종류 시드(06.1 G15)", () => {
  async function personalCardReceipt() {
    const [row] = await db
      .select()
      .from(codeItems)
      .where(and(eq(codeItems.tableKey, "evidence_type"), eq(codeItems.value, "personal_card_receipt")));
    return row ?? null;
  }

  it("첫 시드 뒤 personal_card_receipt가 「개인카드 전표」 · private_to_owner 참 · active 거짓으로 있고 다른 증빙 종류는 private_to_owner 거짓이다", async () => {
    const row = await personalCardReceipt();
    expect(row).toMatchObject({ label: "개인카드 전표", privateToOwner: true, active: false, sortOrder: 7 });
    expect(row?.taxRule).toEqual({ ruleKind: "vat_surcharge", roundingUnit: 1, roundingMethod: "round", minWithholdingAmount: 0, basisDate: "evidence_date" });
    const others = await db.select().from(codeItems).where(eq(codeItems.tableKey, "evidence_type"));
    expect(others.filter((item) => item.value !== "personal_card_receipt" && item.privateToOwner)).toEqual([]);
  });

  it("관리자가 켠 종류 · 끈 속성은 시드를 다시 돌려도 그대로다(onConflictDoNothing)", async () => {
    const row = await personalCardReceipt();
    if (!row) throw new Error("personal_card_receipt 없음");
    await setCodeItemActive(SYSTEM_VIEWER, row.id, true);
    await db.update(codeItems).set({ privateToOwner: false }).where(eq(codeItems.id, row.id));

    await seedMasterData(SYSTEM_VIEWER);

    expect(await personalCardReceipt()).toMatchObject({ active: true, privateToOwner: false });
  });
});

// 07-05(D-722 · T-07-05-03): 시드 계급 기본값을 domain/seed/role-defaults.ts 표 하나로 옮긴 리팩터가 행을 하나도 바꾸지 않는다.
// 고정값은 리팩터 전 main(4f6236ee)으로 시드한 DB에서 뽑았다 — 시드 계급 4종 줄만(시스템 관리자는 MENUS · INFO_ITEMS 루프 사례가 따로 본다).
// 시드 계급 기본값을 바꾸는 플랜은 이 고정값을 바꾼 줄만 고친다(diff가 확인 카드의 바꿀 칸과 1:1).
const SEED_ROLE_PERMISSIONS_BEFORE_0705 = [
  "role-ceo|expenses|view|true",
  "role-ceo|expenses|write|true",
  "role-ceo|leave|view|true",
  "role-ceo|leave|write|true",
  "role-ceo|projects.complete|write|true",
  "role-ceo|projects.member|write|true",
  "role-ceo|projects.period|write|true",
  "role-ceo|projects.status|write|true",
  "role-ceo|projects|view|true",
  "role-division-head|expenses|view|true",
  "role-division-head|expenses|write|true",
  "role-division-head|leave|view|true",
  "role-division-head|leave|write|true",
  "role-division-head|projects.member|write|true",
  "role-division-head|projects.period|write|true",
  "role-division-head|projects.status|write|true",
  "role-division-head|projects|view|true",
  "role-pm|certs.events|view|true",
  "role-pm|certs.events|write|true",
  "role-pm|evidence|view|true",
  "role-pm|expenses|view|true",
  "role-pm|expenses|write|true",
  "role-pm|leave|view|true",
  "role-pm|leave|write|true",
  "role-pm|projects.member|write|true",
  "role-pm|projects|view|true",
  "role-pm|projects|write|true",
  "role-team-lead|evidence|view|true",
  "role-team-lead|expenses.team|view|true",
  "role-team-lead|expenses|view|true",
  "role-team-lead|expenses|write|true",
  "role-team-lead|leave|view|true",
  "role-team-lead|leave|write|true",
  "role-team-lead|projects.member|write|true",
  "role-team-lead|projects.period|write|true",
  "role-team-lead|projects.status|write|true",
  "role-team-lead|projects|view|true",
];
const SEED_ROLE_VISIBLE_ITEMS_BEFORE_0705: Record<string, { visible: string[]; hidden: string[] }> = {
  "role-ceo": {
    visible: ["approval.value", "card_usage.amount", "card_usage.value", "cert_event.value", "code_item.label", "code_item.value", "corp_card.value", "evidence.amount", "evidence.value", "expense.amount", "expense.value", "leave.value", "org_unit.value", "person.value", "project.value", "purchase_request.amount", "purchase_request.value", "quote.amount", "revenue.issued_amount", "revenue.paid_amount", "role.value", "team.value", "team_assignment.value", "vendor.value"],
    hidden: ["action_log.detail", "archive.value", "budget.amount", "cert.rrn_unmasked", "cert_prize.value", "cert_submission.value", "incentive.amount", "notification_rule.value", "pnl.amount", "reserve.amount", "target.amount", "team.cost", "vendor.account_number_unmasked", "vendor.amount"],
  },
  "role-division-head": {
    visible: ["approval.value", "card_usage.amount", "card_usage.value", "cert_event.value", "code_item.label", "code_item.value", "corp_card.value", "evidence.amount", "evidence.value", "expense.amount", "expense.value", "leave.value", "org_unit.value", "person.value", "project.value", "purchase_request.amount", "purchase_request.value", "quote.amount", "role.value", "team.value", "team_assignment.value", "vendor.value"],
    hidden: ["action_log.detail", "archive.value", "budget.amount", "cert.rrn_unmasked", "cert_prize.value", "cert_submission.value", "incentive.amount", "notification_rule.value", "pnl.amount", "reserve.amount", "revenue.issued_amount", "revenue.paid_amount", "target.amount", "team.cost", "vendor.account_number_unmasked", "vendor.amount"],
  },
  "role-pm": {
    visible: ["approval.value", "card_usage.amount", "card_usage.value", "cert_event.value", "code_item.label", "code_item.value", "corp_card.value", "evidence.amount", "evidence.value", "expense.amount", "expense.value", "leave.value", "org_unit.value", "person.value", "project.value", "purchase_request.amount", "purchase_request.value", "quote.amount", "revenue.issued_amount", "role.value", "team.value", "team_assignment.value", "vendor.value"],
    hidden: ["action_log.detail", "archive.value", "budget.amount", "cert.rrn_unmasked", "cert_prize.value", "cert_submission.value", "incentive.amount", "notification_rule.value", "pnl.amount", "reserve.amount", "revenue.paid_amount", "target.amount", "team.cost", "vendor.account_number_unmasked", "vendor.amount"],
  },
  "role-team-lead": {
    visible: ["approval.value", "card_usage.amount", "card_usage.value", "cert_event.value", "code_item.label", "code_item.value", "corp_card.value", "evidence.amount", "evidence.value", "expense.amount", "expense.value", "leave.value", "org_unit.value", "person.value", "project.value", "purchase_request.amount", "purchase_request.value", "quote.amount", "role.value", "team.value", "team_assignment.value", "vendor.value"],
    hidden: ["action_log.detail", "archive.value", "budget.amount", "cert.rrn_unmasked", "cert_prize.value", "cert_submission.value", "incentive.amount", "notification_rule.value", "pnl.amount", "reserve.amount", "revenue.issued_amount", "revenue.paid_amount", "target.amount", "team.cost", "vendor.account_number_unmasked", "vendor.amount"],
  },
};

describe("시드 계급 기본값 표 리팩터 전후 행 집합(07-05 D-722)", () => {
  it("빈 DB 첫 시드 뒤 시드 계급 4종의 권한 · 노출 행 집합이 리팩터 전과 같고 반환 카운트도 같다", async () => {
    const permissions = (await db.select().from(permissionMatrix))
      .filter((row) => row.roleId !== SYSADMIN_ROLE_ID)
      .map((row) => `${row.roleId}|${row.menu}|${row.action}|${row.allowed}`)
      .sort();
    expect(permissions).toEqual(SEED_ROLE_PERMISSIONS_BEFORE_0705);

    const visibility: Record<string, { visible: string[]; hidden: string[] }> = {};
    for (const row of (await db.select().from(visibilityMatrix)).filter((r) => r.roleId !== SYSADMIN_ROLE_ID)) {
      const entry = (visibility[row.roleId] ??= { visible: [], hidden: [] });
      entry[row.visible ? "visible" : "hidden"].push(row.infoItem);
    }
    for (const entry of Object.values(visibility)) {
      entry.visible.sort();
      entry.hidden.sort();
    }
    expect(visibility).toEqual(SEED_ROLE_VISIBLE_ITEMS_BEFORE_0705);

    // 재시드는 행을 바꾸지 않고, 반환 카운트는 리팩터 전 값과 같다(시스템 관리자 루프 + 시드 계급 표).
    // 07-19: 알림 규칙 메뉴(view · write · approve 셋)가 시스템 관리자 루프에 들어와 권한 128 → 131(PC-08 예외 지움).
    // 07.1(D-7107): 연차 · 지출결의 시드 루프의 17행이 표로 와 표 루프가 센다 — 131 → 148(행 집합은 위 스냅숏 그대로).
    const result = await seedMasterData(SYSTEM_VIEWER);
    expect({ permissions: result.permissions, visibility: result.visibility }).toEqual({ permissions: 148, visibility: 190 });
  });
});

// 07-05(D-722 확인 카드 2026-10-22 답 A · ⑧ 끔 · 사용자 결정 2026-10-22): ⑧(대표 action_log.detail)이 꺼진 동안 ① 대표 행동 로그 보기
// 시드를 보류한다 — ①만 켜면 대표 사이드바에 「관리 › 행동 로그」가 생기고 누르면 queryActionLog가 막는다(독립 검토 P2). ⑧과 함께 켠다.
describe("대표 행동 로그 보기 시드 보류(07-05 D-722 ① · ⑧ 끔)", () => {
  it("빈 DB 첫 시드 뒤 시드 계급 4종 모두 admin.action-log 보기 행이 없고 대표 action_log.detail은 숨김이다", async () => {
    for (const roleId of [CEO_ROLE_ID, DIVISION_HEAD_ROLE_ID, TEAM_LEAD_ROLE_ID, DEFAULT_ROLE_ID]) {
      expect(await findPermission(SYSTEM_VIEWER, roleId, "admin.action-log", "view")).toBeNull();
    }
    expect((await findVisibility(SYSTEM_VIEWER, CEO_ROLE_ID, "action_log.detail"))?.visible).toBe(false);
  });
});

// 07-15(D-722 · 07-05 「07-15 입력」 ⑤ · D-739 · PC-08): 07 새 메뉴 키 셋 · 정보 항목 둘. 시드 계급 중 시스템 관리자만 MENUS · INFO_ITEMS 루프로 켠다.
describe("07 새 권한 키 · 정보 항목 시드(07-15)", () => {
  const SEED_ROLES_4 = [CEO_ROLE_ID, DIVISION_HEAD_ROLE_ID, TEAM_LEAD_ROLE_ID, DEFAULT_ROLE_ID];

  it("빈 DB 첫 시드 뒤 projects.budget 보기는 시스템 관리자만 참이고 시드 계급 4종은 거짓", async () => {
    expect(MENUS.find((menu) => menu.key === "projects.budget")?.label).toBe("예산 현황");
    expect(await can({ id: "viewer-admin", roleId: SYSADMIN_ROLE_ID }, "projects.budget", "view")).toBe(true);
    for (const roleId of SEED_ROLES_4) {
      expect(await can({ id: `viewer-${roleId}`, roleId }, "projects.budget", "view"), roleId).toBe(false);
    }
  });

  it("운영에서 켠 시드 계급의 projects.budget 보기 · 끈 시스템 관리자 밖 값은 재시드가 바꾸지 않는다(insert-if-absent)", async () => {
    await upsertPermission(SYSTEM_VIEWER, { roleId: CEO_ROLE_ID, menu: "projects.budget", action: "view", allowed: true });
    await upsertPermission(SYSTEM_VIEWER, { roleId: TEAM_LEAD_ROLE_ID, menu: "vendors.account", action: "write", allowed: false });

    await seedMasterData(SYSTEM_VIEWER);

    expect((await findPermission(SYSTEM_VIEWER, CEO_ROLE_ID, "projects.budget", "view"))?.allowed).toBe(true);
    expect((await findPermission(SYSTEM_VIEWER, TEAM_LEAD_ROLE_ID, "vendors.account", "write"))?.allowed).toBe(false);
  });

  it("vendors.account는 admin. 접두가 아니고 시스템 관리자만 쓰기가 켜진다(AQ-16 · 07-05 표)", async () => {
    const keys = MENUS.map((menu) => menu.key);
    expect(keys).toContain("vendors.account");
    expect(keys.filter((key) => key.startsWith("admin.") && key.includes("account"))).toEqual([]);
    expect(await can({ id: "viewer-admin", roleId: SYSADMIN_ROLE_ID }, "vendors.account", "write")).toBe(true);
    for (const roleId of SEED_ROLES_4) {
      expect(await can({ id: `viewer-${roleId}`, roleId }, "vendors.account", "write"), roleId).toBe(false);
    }
  });

  it("admin.notification-rules는 빈 DB 시드 뒤 시스템 관리자에게만 켜진 행이 있다(PC-08 — 07-19가 화면과 함께 시드 예외를 지움 · 07-05 표 ⑤)", async () => {
    expect(MENUS.find((menu) => menu.key === "admin.notification-rules")?.label).toBe("알림 규칙");
    const rows = (await db.select().from(permissionMatrix)).filter((row) => row.menu === "admin.notification-rules" && row.allowed);
    expect(rows.length).toBeGreaterThan(0);
    expect([...new Set(rows.map((row) => row.roleId))]).toEqual([SYSADMIN_ROLE_ID]);
    expect(await can({ id: "viewer-admin", roleId: SYSADMIN_ROLE_ID }, "admin.notification-rules", "view")).toBe(true);
    for (const roleId of SEED_ROLES_4) {
      expect(await can({ id: `viewer-${roleId}`, roleId }, "admin.notification-rules", "view"), roleId).toBe(false);
    }
  });

  it("시스템 관리자 행: vendors.account는 write 한 줄 · admin.vendors는 view · write 두 줄만(정의 밖 칸 행 없음 — K24 · D-739)", async () => {
    const rows = await listPermissions(SYSTEM_VIEWER, { roleId: SYSADMIN_ROLE_ID });
    const actionsOf = (menu: string) => rows.filter((row) => row.menu === menu).map((row) => row.action).sort();
    expect(actionsOf("vendors.account")).toEqual(["write"]);
    expect(actionsOf("admin.vendors")).toEqual(["view", "write"]);
  });

  it("이미 있는 admin.vendors 승인 행은 재시드가 지우지 않는다", async () => {
    await upsertPermission(SYSTEM_VIEWER, { roleId: SYSADMIN_ROLE_ID, menu: "admin.vendors", action: "approve", allowed: true });

    await seedMasterData(SYSTEM_VIEWER);

    expect((await findPermission(SYSTEM_VIEWER, SYSADMIN_ROLE_ID, "admin.vendors", "approve"))?.allowed).toBe(true);
  });

  it("정보 항목 notification_rule.value · budget.amount가 staffDefault 거짓으로 있고 시스템 관리자만 보임", async () => {
    expect(INFO_ITEMS.find((item) => item.key === "notification_rule.value")).toEqual({
      key: "notification_rule.value",
      label: "알림 규칙 정보",
      staffDefault: false,
    });
    expect(INFO_ITEMS.find((item) => item.key === "budget.amount")).toEqual({ key: "budget.amount", label: "예산", staffDefault: false });
    for (const item of ["notification_rule.value", "budget.amount"]) {
      expect(await visible(SYSADMIN_ROLE_ID, item), item).toBe(true);
      for (const roleId of SEED_ROLES_4) {
        expect((await findVisibility(SYSTEM_VIEWER, roleId, item))?.visible, `${roleId} ${item}`).toBe(false);
      }
    }
  });
});

// 07-15(A-P2-10 · 07-05 카드 ⑦ 답 「켬」): R18 뒤 evidence.intake 쓰기만 켜진 운영 계급이 조용히 증빙을 잃지 않게, 시드가 그 계급마다
// evidence 보기를 없을 때만 넣는다 — 명시적으로 꺼진 보기는 그대로(D-722).
describe("등록 쓰기 계급 증빙 보기 시드(07-15 R18 · A-P2-10)", () => {
  it("보기 행이 없는 등록 계급은 재시드 뒤 보기 켬 · 꺼진 보기 계급은 그대로 · 두 번째 재시드 변경 0", async () => {
    const missing = (await insertRole(SYSTEM_VIEWER, { id: `role-test-${randomUUID()}`, name: `등록만-${randomUUID()}` })).id;
    const explicitOff = (await insertRole(SYSTEM_VIEWER, { id: `role-test-${randomUUID()}`, name: `보기끔-${randomUUID()}` })).id;
    for (const roleId of [missing, explicitOff]) {
      await upsertPermission(SYSTEM_VIEWER, { roleId, menu: "evidence.intake", action: "write", allowed: true });
    }
    await upsertPermission(SYSTEM_VIEWER, { roleId: explicitOff, menu: "evidence", action: "view", allowed: false });

    await seedMasterData(SYSTEM_VIEWER);

    expect((await findPermission(SYSTEM_VIEWER, missing, "evidence", "view"))?.allowed).toBe(true);
    expect((await findPermission(SYSTEM_VIEWER, explicitOff, "evidence", "view"))?.allowed).toBe(false);

    const snapshot = async () =>
      (await db.select().from(permissionMatrix)).map((row) => `${row.roleId}|${row.menu}|${row.action}|${row.allowed}`).sort();
    const before = await snapshot();
    await seedMasterData(SYSTEM_VIEWER);
    expect(await snapshot()).toEqual(before);
  });
});

// 07.1(D-7107 · S1): 연차 · 지출결의 시드 루프의 권한 17행이 기본값 표 한 곳으로 옮겨졌다 — 결과 집합은 위 스냅숏(SEED_ROLE_PERMISSIONS_BEFORE_0705)이 지킨다.
describe("연차 · 지출결의 기본 권한 표 이동(07.1 D-7107)", () => {
  const SEED_ROLES_4 = [CEO_ROLE_ID, DIVISION_HEAD_ROLE_ID, TEAM_LEAD_ROLE_ID, DEFAULT_ROLE_ID];

  it("연차 view · write × 4계급 · 지출결의 view · write × 4계급 · 팀장 expenses.team view 17행이 표에 있다", () => {
    const want = [
      ...SEED_ROLES_4.flatMap((roleId) => (["view", "write"] as const).map((action) => `${roleId}|leave|${action}|true`)),
      ...SEED_ROLES_4.flatMap((roleId) => (["view", "write"] as const).map((action) => `${roleId}|expenses|${action}|true`)),
      `${TEAM_LEAD_ROLE_ID}|expenses.team|view|true`,
    ].sort();
    const rows = ROLE_DEFAULT_PERMISSIONS.filter((row) => row.menu === "leave" || row.menu === "expenses" || row.menu === "expenses.team");
    expect(rows.map((row) => `${row.roleId}|${row.menu}|${row.action}|${row.allowed}`).sort()).toEqual(want);
  });

  it("두 시드 함수는 권한 행을 넣지 않는다(노출 · 설정 값만)", async () => {
    await db.delete(permissionMatrix);

    await seedApprovalsLeave(SYSTEM_VIEWER);
    await seedExpenses(SYSTEM_VIEWER);

    expect(await db.select().from(permissionMatrix)).toEqual([]);
  });

  it("관리자가 끈 연차 · 지출결의 행은 재시드가 덮지 않는다", async () => {
    await upsertPermission(SYSTEM_VIEWER, { roleId: DEFAULT_ROLE_ID, menu: "leave", action: "write", allowed: false });
    await upsertPermission(SYSTEM_VIEWER, { roleId: TEAM_LEAD_ROLE_ID, menu: "expenses.team", action: "view", allowed: false });

    await seedMasterData(SYSTEM_VIEWER);

    expect((await findPermission(SYSTEM_VIEWER, DEFAULT_ROLE_ID, "leave", "write"))?.allowed).toBe(false);
    expect((await findPermission(SYSTEM_VIEWER, TEAM_LEAD_ROLE_ID, "expenses.team", "view"))?.allowed).toBe(false);
  });

  // 07.1(D-7119 · S13): 추적 행 — 권한 변경 0. ⑧을 켜는 플랜이 이 시험을 함께 바꾼다.
  it("대표 action-log 보기는 ⑧(대표 action_log.detail)과 함께 켠다 — D-7119 보류", async () => {
    expect(ROLE_DEFAULT_PERMISSIONS.filter((row) => row.roleId === CEO_ROLE_ID && row.menu === "admin.action-log")).toEqual([]);
    expect(await can({ id: "viewer-ceo", roleId: CEO_ROLE_ID }, "admin.action-log", "view")).toBe(false);
  });
});

