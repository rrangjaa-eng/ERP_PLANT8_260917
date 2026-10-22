import { describe, expect, it } from "vitest";
import { adminIndexGroups } from "../../../ui/shell/role-menu";

// 07-12 AQ-06 — `알림 규칙` 관리 메뉴 자리. 키 시드는 07-15, 화면 · §6-10 표 줄 · 관리 메뉴 키 목록은 07-19.
// 그 전에는 키를 가진 계급이 없어 걸러져 보이지 않는다(T-07-12-01).

describe("ADMIN_MENUS — admin.notification-rules 자리 (07-12 AQ-06)", () => {
  it("키가 있으면 설정·권한 그룹의 시스템 설정 바로 뒤에 알림 규칙이 선다", () => {
    const groups = adminIndexGroups({
      roleId: "role-x",
      allowedMenus: ["admin.notification-rules", "admin.settings", "admin.visibility", "admin.permissions"],
    });
    const group = groups.find((g) => g.label === "설정·권한");
    expect(group?.items.map((item) => item.label)).toEqual(["권한표", "정보 노출표", "시스템 설정", "알림 규칙"]);
    expect(group?.items.at(-1)?.href).toBe("/admin/notification-rules");
  });

  it("키가 없는 viewer에게는 알림 규칙 항목이 없다", () => {
    const groups = adminIndexGroups({
      roleId: "role-x",
      allowedMenus: ["admin.permissions", "admin.visibility", "admin.settings"],
    });
    const labels = groups.flatMap((g) => g.items).map((item) => item.label);
    expect(labels).not.toContain("알림 규칙");
  });
});
