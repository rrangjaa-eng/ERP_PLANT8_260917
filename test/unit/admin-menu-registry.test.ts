import { describe, expect, it } from "vitest";
import { MENUS } from "@/domain/permissions/menus";
import { adminIndexGroups } from "@/ui/shell/role-menu";

// 코드 리뷰(260922-i3k) WR-04 회귀 방지 — 같은 admin.* 키 10개가 세 곳에 복제돼
// 있다: domain/permissions/menus.ts의 MENUS(정본), ui/shell/role-menu.ts의
// ADMIN_MENUS(D-26 경계 때문에 domain을 import 못 해 복제), test/unit/ui/
// role-menu.test.ts의 ADMIN_MENU_KEYS(같은 이유로 또 복제). 셋을 대조하는
// 테스트가 없었다 — 「관리」가 유일한 진입점이 된 뒤로는 한쪽에만 키를 등록하고
// 잊으면 그 화면이 UI에서 완전히 도달 불가가 되는데도 전 스위트가 녹색이었다.
//
// 이 파일은 경로에 "ui/"가 없어(test/unit/ 바로 아래) boundaries/element-types가
// "test" 요소로 잡는다 — domain을 import할 수 있다(ui/shell/role-menu.test.ts는
// 경로에 "ui/"가 있어 domain을 import할 수 없어 이 대조를 할 수 없었다).
describe("MENUS(domain, 정본) ↔ adminIndexGroups(ui/shell/role-menu.ts) — admin.* 키 대조 (WR-04)", () => {
  it("MENUS의 admin.* 키 전부가 /admin 인덱스에 정확히 그 href로 나타난다", () => {
    const adminKeys = MENUS.map((menu) => menu.key).filter((key) => key.startsWith("admin."));
    const groups = adminIndexGroups({ roleId: "role-sysadmin", allowedMenus: adminKeys });
    const hrefs = groups.flatMap((group) => group.items).map((item) => item.href);

    expect(new Set(hrefs)).toEqual(
      new Set(adminKeys.map((key) => `/admin/${key.slice("admin.".length)}`)),
    );
  });
});
