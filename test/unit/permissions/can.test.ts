import { describe, expect, it } from "vitest";
import { can } from "@/domain/permissions/can";
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
  function grantsOnly(grantedMenu: string) {
    return {
      findPermission: (_viewer: Viewer, roleId: string, menu: string, action: string) =>
        Promise.resolve(
          menu === grantedMenu && action === "write"
            ? { id: "p1", roleId, menu, action, allowed: true, updatedAt: new Date(), updatedBy: null }
            : null,
        ),
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

  it("6.1 이름(evidence로 시작하는 메뉴 · 정보 항목 키)은 없다", () => {
    const keys = [...MENUS.map((menu) => menu.key), ...INFO_ITEMS.map((item) => item.key)];
    expect(keys.filter((key) => key.startsWith("evidence"))).toEqual([]);
  });
});
