import { describe, expect, it, vi } from "vitest";
import { can } from "@/domain/permissions/can";
import { FUND_SCOPED_MENUS } from "@/domain/permissions/fund-scope";
import { MENUS } from "@/domain/permissions/menus";
import { INFO_ITEMS } from "@/domain/permissions/info-items";
import type { Viewer } from "@/domain/viewer";

const roleViewer: Viewer = { id: "u1", roleId: "role-pm" };
const noRoleViewer: Viewer = { id: "u2", roleId: null };

function permissionRow(allowed: boolean) {
  return {
    id: "p1",
    roleId: "role-pm",
    menu: "admin.code-tables",
    action: "view",
    allowed,
    updatedAt: new Date(),
    updatedBy: null,
  };
}

describe("can (ADMN-01)", () => {
  it("viewer에 계급 식별자가 없으면(undefined/null) 항상 false다 — 권한표를 조회하지도 않는다", async () => {
    const result = await can(noRoleViewer, "admin.code-tables", "view", {
      findPermission: () => {
        throw new Error("findPermission이 호출되면 안 된다");
      },
    });
    expect(result).toBe(false);
  });

  it("권한표에 해당 행이 없으면 false다", async () => {
    const result = await can(roleViewer, "admin.code-tables", "view", {
      findPermission: () => Promise.resolve(null),
    });
    expect(result).toBe(false);
  });

  it("권한표 행의 allowed가 거짓이면 false다 — 거짓인 행은 없는 것과 같다", async () => {
    const result = await can(roleViewer, "admin.code-tables", "view", {
      findPermission: () => Promise.resolve(permissionRow(false)),
    });
    expect(result).toBe(false);
  });

  it("권한표 행의 allowed가 참일 때만 true다", async () => {
    const result = await can(roleViewer, "admin.code-tables", "view", {
      findPermission: () => Promise.resolve(permissionRow(true)),
    });
    expect(result).toBe(true);
  });
});

// 06-27(D-601): 경영관리 전용 메뉴 키는 상위 메뉴(expenses · cards) 권한으로 대신 통과하지 않는다 — 정확 일치 조회.
describe("Phase 6 메뉴 키 · 정보 항목 (06-27)", () => {
  // 07.3-01: 자금 키는 권한 행 뒤에 자금 게이트를 거친다 — 여기서는 게이트를 참으로 스텁해 DB에 닿지 않는다.
  function grantsOnly(grantedMenu: string, fundGate: () => Promise<boolean> = () => Promise.resolve(true)) {
    return {
      findPermission: (_viewer: Viewer, roleId: string, menu: string, action: string) =>
        Promise.resolve(
          menu === grantedMenu && action === "write"
            ? { id: "p1", roleId, menu, action, allowed: true, updatedAt: new Date(), updatedBy: null }
            : null,
        ),
      fundGate,
    };
  }

  it.each([
    ["expenses.payments", "expenses"],
    ["cards.purchases", "cards"],
    ["cards.proxy", "cards"],
  ])("상위 메뉴 write만 가진 역할은 %s write가 거짓이다(%s 권한으로 대신 통과 없음)", async (key, parent) => {
    await expect(can(roleViewer, key, "write", grantsOnly(parent))).resolves.toBe(false);
  });

  it.each(["expenses.payments", "cards.purchases", "cards.proxy"])("%s write를 가진 역할은 참이다", async (key) => {
    await expect(can(roleViewer, key, "write", grantsOnly(key))).resolves.toBe(true);
  });

  it.each(["expenses.payments", "cards.purchases"])("자금 게이트가 거짓이면 %s write를 가진 역할도 거짓이다(07.3-01 D-7301)", async (key) => {
    await expect(can(roleViewer, key, "write", grantsOnly(key, () => Promise.resolve(false)))).resolves.toBe(false);
  });

  it("cards.proxy는 자금 게이트와 무관하다(D-7308) — 게이트를 부르지 않는다", async () => {
    const fundGate = vi.fn(() => Promise.resolve(false));
    await expect(can(roleViewer, "cards.proxy", "write", grantsOnly("cards.proxy", fundGate))).resolves.toBe(true);
    expect(fundGate).not.toHaveBeenCalled();
  });

  it("MENUS에 세 키가 명세 라벨로 있다", () => {
    const labels = Object.fromEntries(MENUS.map((menu) => [menu.key, menu.label]));
    expect({
      payments: labels["expenses.payments"],
      purchases: labels["cards.purchases"],
      proxy: labels["cards.proxy"],
    }).toEqual({ payments: "지급 처리", purchases: "구매 처리", proxy: "카드 대리 등록" });
  });

  it("INFO_ITEMS에 네 키가 staffDefault 참으로 있다", () => {
    const keys = ["card_usage.value", "card_usage.amount", "purchase_request.value", "purchase_request.amount"];
    expect(INFO_ITEMS.filter((item) => keys.includes(item.key))).toEqual([
      { key: "card_usage.value", label: "법인카드 사용 정보", staffDefault: true },
      { key: "card_usage.amount", label: "법인카드 사용 금액", staffDefault: true },
      { key: "purchase_request.value", label: "구매 요청 정보", staffDefault: true },
      { key: "purchase_request.amount", label: "구매 요청 금액", staffDefault: true },
    ]);
  });

  it("06.1 이름은 정해진 것뿐이다", () => {
    const keys = [...MENUS.map((menu) => menu.key), ...INFO_ITEMS.map((item) => item.key)];
    expect(keys.filter((key) => key.startsWith("evidence"))).toEqual(["evidence", "evidence.intake", "evidence.value", "evidence.amount"]);
  });
});

// 07.3-01(D-7301 · D-7312): 자금 키 8개만 권한 행 뒤에 자금 게이트를 거친다 — 한 곳 목록 · 한 접점.
describe("자금 게이트 접점 (07.3-01)", () => {
  function rows(allowed: boolean | null) {
    return (_viewer: Viewer, roleId: string, menu: string, action: string) =>
      Promise.resolve(allowed === null ? null : { id: "p1", roleId, menu, action, allowed, updatedAt: new Date(), updatedBy: null });
  }

  it("자금 키 목록은 정확히 8개다(카드 대리 등록 제외)", () => {
    expect([...FUND_SCOPED_MENUS]).toEqual([
      "evidence.intake",
      "expenses.evidence_void",
      "expenses.evidence_attach",
      "projects.adjustment",
      "expenses.payments",
      "cards.purchases",
      "projects.budget",
      "projects.revenue",
    ]);
  });

  it.each(FUND_SCOPED_MENUS.flatMap((menu) => (["view", "write"] as const).map((action) => [menu, action] as const)))(
    "%s %s — 권한 행이 참이어도 게이트가 거짓이면 거짓, 참이면 참이다",
    async (menu, action) => {
      await expect(can(roleViewer, menu, action, { findPermission: rows(true), fundGate: () => Promise.resolve(false) })).resolves.toBe(false);
      await expect(can(roleViewer, menu, action, { findPermission: rows(true), fundGate: () => Promise.resolve(true) })).resolves.toBe(true);
    },
  );

  it("권한 행이 없거나 거짓이면 게이트를 부르지 않고 거짓이다", async () => {
    const fundGate = vi.fn(() => Promise.resolve(true));
    await expect(can(roleViewer, "expenses.payments", "write", { findPermission: rows(null), fundGate })).resolves.toBe(false);
    await expect(can(roleViewer, "expenses.payments", "write", { findPermission: rows(false), fundGate })).resolves.toBe(false);
    expect(fundGate).not.toHaveBeenCalled();
  });

  it.each(["projects", "expenses", "evidence", "leave", "certs.qr", "cards.proxy"])("자금 키가 아닌 %s는 게이트를 부르지 않는다", async (menu) => {
    const fundGate = vi.fn(() => Promise.resolve(false));
    await expect(can(roleViewer, menu, "view", { findPermission: rows(true), fundGate })).resolves.toBe(true);
    expect(fundGate).not.toHaveBeenCalled();
  });
});
