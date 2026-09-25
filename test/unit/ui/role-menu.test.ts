import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { NOTIFICATIONS_HREF, adminIndexGroups, roleMenu, type RoleMenuViewer } from "../../../ui/shell/role-menu";
import { notificationsMenuLabel } from "../../../ui/shell/unread-count";

// D-23의 계약 고정: 역할 → (상단 바 메뉴, 폰 하단 탭, 계정 그룹, 관리자 메뉴 진입점)
// 매핑이 순수 함수 한 곳에 데이터로 있는지를 검증한다. 계정 그룹 항목 이름과 폰 하단
// 탭은 SYSTEM.md §6-0/§7-8에서 읽어 비교한다 — 문서가 바뀌면 이 파일을 고치지
// 않아도 실패로 드러난다(플랜 지시).
//
// D-36(03-02): 계급 5종으로 교체됐다. 관리자 메뉴 진입점 판정은 이제 계급 이름이
// 아니라 app/(app)/layout.tsx가 can()으로 미리 계산한 allowedMenus를 읽는다 —
// 이 파일은 그 계산 결과를 흉내낸 데이터만 넘긴다(ui는 domain을 import할 수 없다).
//
// 「관리」 한 줄로 접기(2026-09-22, quick/260922-i3k, 사용자 결정 옵션 B): 관리자
// 화면 10개의 개별 이름을 PC 사용자 메뉴·「더보기」 시트에 나열하던 것을 그만두고,
// adminMenu는 이제 "허용된 admin.* 메뉴가 하나라도 있으면 { label: "관리",
// href: "/admin" } 한 줄"로 접힌다. 개별 화면 이름·순서는 새 `adminIndexGroups`가
// SYSTEM.md §6-10 표(정본)를 그대로 옮긴 세 그룹으로 돌려준다 — `/admin` 인덱스
// 화면(app/(app)/admin/page.tsx)이 그 결과로 렌더한다.

function readSystemDoc(): string {
  return readFileSync(resolve(process.cwd(), "docs", "design", "SYSTEM.md"), "utf8");
}

function section(doc: string, startHeading: string, endHeading: string): string {
  const start = doc.indexOf(startHeading);
  const end = doc.indexOf(endHeading);
  if (start === -1 || end === -1 || end <= start) {
    throw new Error(`구간을 찾을 수 없다: '${startHeading}' ~ '${endHeading}'`);
  }
  return doc.slice(start, end);
}

const SYSTEM = readSystemDoc();
const SHELL_SECTION = section(SYSTEM, "### 6-0", "### 6-1");

/** SYSTEM.md의 「계정」 그룹 문장(`「계정」 그룹(내 정보 · 설정 · 로그아웃)`)에서 항목 이름을 읽는다. */
function expectedAccountGroupLabels(doc: string): string[] {
  const match = doc.match(/「계정」\s*그룹\(([^)]+)\)/);
  const captured = match?.[1];
  if (!captured) {
    throw new Error("SYSTEM.md에서 「계정」 그룹 목록 문장을 찾을 수 없다");
  }
  return captured.split("·").map((label) => label.trim());
}

/** SYSTEM.md 역할별 탭 표에서 `role` 행의 탭 1~4 라벨을 읽는다. */
function expectedBottomTabRow(doc: string, role: string): string[] {
  const lineRe = new RegExp(`^\\|\\s*${role}\\s*\\|.*\\|\\s*$`, "m");
  const line = doc.match(lineRe)?.[0];
  if (!line) {
    throw new Error(`SYSTEM.md 탭 표에서 역할 '${role}' 행을 찾을 수 없다`);
  }
  const cells = line
    .split("|")
    .map((cell) => cell.trim())
    .filter((cell) => cell.length > 0);
  // cells[0]은 계급 이름, 나머지 넷이 탭 1~4다.
  return cells.slice(1);
}

type ExpectedAdminIndexGroup = { label: string; items: string[] };

/** SYSTEM.md §6-10의 그룹 표(| 그룹 | 항목 |)를 읽어 그룹 라벨·항목 목록을 돌려준다.
 * 구분선(`---`)과 머리글 행(첫 칸이 `그룹`)은 걸러낸다 — 이 표가 §6-10의 정본이라
 * adminIndexGroups는 이 결과와 원소 단위로 같아야 한다(role-menu.ts를 하드코딩
 * 기준으로 쓰지 않는다). */
function expectedAdminIndexGroups(doc: string): ExpectedAdminIndexGroup[] {
  const sec = section(doc, "### 6-10", "## 7. 컴포넌트 규칙");
  const rows = sec
    .split("\n")
    .filter((line) => line.trim().startsWith("|"))
    .filter((line) => !line.includes("---"))
    .map((line) => line.split("|").map((cell) => cell.trim()).filter((cell) => cell.length > 0))
    .filter((cells) => cells[0] !== "그룹");
  if (rows.length === 0) {
    throw new Error("SYSTEM.md §6-10에서 그룹 표를 찾을 수 없다");
  }
  return rows.map((cells) => {
    const [label, itemsCell] = cells;
    if (!label || !itemsCell) {
      throw new Error(`SYSTEM.md §6-10 표 행을 해석할 수 없다: ${cells.join(" | ")}`);
    }
    return { label, items: itemsCell.split("·").map((item) => item.trim()) };
  });
}

/** app/(app)/admin/page.tsx(「관리」 인덱스 라우트)가 실재하는지. */
function adminIndexPageExists(): boolean {
  return existsSync(resolve(process.cwd(), "app", "(app)", "admin", "page.tsx"));
}

// SYSTEM.md §6-0 표의 계급 이름(한글) ↔ domain/permissions/roles.ts SEED_ROLES 식별자.
// ui/shell/role-menu.test.ts는 domain을 import할 수 없어(D-26) 이 매핑을 여기 복제한다
// — 03-01-SUMMARY.md·domain/permissions/roles.ts가 정본이다.
const SEED_ROLE_NAMES: ReadonlyArray<[roleId: string, name: string]> = [
  ["role-ceo", "대표"],
  ["role-division-head", "본부 책임자"],
  ["role-team-lead", "팀장"],
  ["role-pm", "기획 PM"],
  ["role-sysadmin", "시스템 관리자"],
];

const SYSADMIN_ROLE_ID = "role-sysadmin";
const DEFAULT_ROLE_ID = "role-pm";

const ADMIN: RoleMenuViewer = { roleId: SYSADMIN_ROLE_ID, allowedMenus: ["admin.system-status"] };
const EMPLOYEE: RoleMenuViewer = { roleId: DEFAULT_ROLE_ID, allowedMenus: [] };

describe("roleMenu — 상단 바 1차 메뉴 (D-22)", () => {
  it("시스템 관리자 입력이면 1차 메뉴 5개가 전부 들어 있다", () => {
    expect(roleMenu(ADMIN).topBarMenu).toHaveLength(5);
  });

  it("기획 PM 입력이면 1차 메뉴 5개가 전부 들어 있다 — 대응 화면 유무와 무관하다", () => {
    expect(roleMenu(EMPLOYEE).topBarMenu).toHaveLength(5);
  });

  it("두 계급의 상단 바 메뉴 결과가 같다(허용 메뉴와 무관하다, D-22)", () => {
    expect(roleMenu(EMPLOYEE).topBarMenu).toEqual(roleMenu(ADMIN).topBarMenu);
  });
});

// domain/permissions/menus.ts MENUS의 admin.* 키 전부(정본) ↔ role-menu.ts
// ADMIN_MENUS(ui 쪽 복제본). 이 테스트 파일 자체가 경로에 "ui/"를 포함해
// boundaries/element-types가 "ui" 요소로 잡는다(위 SEED_ROLE_NAMES 주석과 같은
// 이유) — domain을 import할 수 없어 이 목록도 여기 복제한다. 03-01·03-02가
// 만든 domain/permissions/menus.ts MENUS·03-*가 만든 app/(app)/admin/ 라우트가
// 정본이고, 셋 중 하나가 바뀌면 이 파일이나 role-menu.ts가 먼저 어긋난다.
const ADMIN_MENU_KEYS = [
  "admin.system-status",
  "admin.code-tables",
  "admin.people",
  "admin.vendors",
  "admin.corp-cards",
  "admin.permissions",
  "admin.visibility",
  "admin.settings",
  "admin.action-log",
  "admin.archive",
];

/** admin.<name> 키의 실제 라우트 디렉터리(app/(app)/admin/<name>/page.tsx)가 있는지. */
function adminRouteExists(key: string): boolean {
  const name = key.slice("admin.".length);
  return existsSync(resolve(process.cwd(), "app", "(app)", "admin", name, "page.tsx"));
}

describe("roleMenu — 관리자 메뉴 진입점 (「관리」 한 줄로 접힘, D-17)", () => {
  it("전제 확인: 위에 복제한 admin.* 키 10개 전부 실제 라우트 디렉터리가 있고, /admin 인덱스 라우트도 있다", () => {
    expect(ADMIN_MENU_KEYS.length).toBe(10);
    for (const key of ADMIN_MENU_KEYS) {
      expect(adminRouteExists(key)).toBe(true);
    }
    expect(adminIndexPageExists()).toBe(true);
  });

  it("allowedMenus에 admin.system-status 하나만 있어도 관리자 메뉴는 정확히 「관리」 한 줄이다", () => {
    expect(roleMenu(ADMIN).adminMenu).toEqual([{ label: "관리", href: "/admin" }]);
  });

  it("allowedMenus가 비어 있으면 관리자 메뉴도 비어 있다", () => {
    expect(roleMenu(EMPLOYEE).adminMenu).toEqual([]);
  });

  it("계급 이름이 아니라 allowedMenus만 본다 — 시스템 관리자라도 허용 목록이 비면 진입점이 없다", () => {
    const sysadminWithoutPermission: RoleMenuViewer = { roleId: SYSADMIN_ROLE_ID, allowedMenus: [] };
    expect(roleMenu(sysadminWithoutPermission).adminMenu).toEqual([]);
  });

  it.each(ADMIN_MENU_KEYS)("%s 하나만 허용돼도 관리자 메뉴는 여전히 「관리」 한 줄이다", (key) => {
    const viewer: RoleMenuViewer = { roleId: SYSADMIN_ROLE_ID, allowedMenus: [key] };
    expect(roleMenu(viewer).adminMenu).toEqual([{ label: "관리", href: "/admin" }]);
  });

  it("allowedMenus에 admin.* 키 10개가 전부 있어도 관리자 메뉴는 여전히 「관리」 한 줄이다(개별 화면 이름은 adminIndexGroups가 담당)", () => {
    const viewer: RoleMenuViewer = { roleId: SYSADMIN_ROLE_ID, allowedMenus: ADMIN_MENU_KEYS };
    expect(roleMenu(viewer).adminMenu).toEqual([{ label: "관리", href: "/admin" }]);
  });

  it("허용된 관리자 메뉴는 매번 같은 순서로 나온다(allowedMenus의 순서와 무관, 순수 함수)", () => {
    const forward: RoleMenuViewer = { roleId: SYSADMIN_ROLE_ID, allowedMenus: [...ADMIN_MENU_KEYS] };
    const reversed: RoleMenuViewer = { roleId: SYSADMIN_ROLE_ID, allowedMenus: [...ADMIN_MENU_KEYS].reverse() };
    expect(roleMenu(forward).adminMenu).toEqual(roleMenu(reversed).adminMenu);
  });
});

describe("adminIndexGroups — 「관리」 인덱스 3그룹 (SYSTEM.md §6-10 표가 정본)", () => {
  const expectedGroups = expectedAdminIndexGroups(SYSTEM);

  it("전제 확인: SYSTEM.md §6-10 표에서 그룹 3개를 읽었고 항목 합이 admin.* 키 10개와 같다", () => {
    expect(expectedGroups).toHaveLength(3);
    const totalItems = expectedGroups.reduce((sum, group) => sum + group.items.length, 0);
    expect(totalItems).toBe(ADMIN_MENU_KEYS.length);
  });

  it("10개 전부 허용이면 그룹 3개, 라벨·항목 순서가 SYSTEM.md §6-10 표와 원소 단위로 같다", () => {
    const viewer: RoleMenuViewer = { roleId: SYSADMIN_ROLE_ID, allowedMenus: ADMIN_MENU_KEYS };
    const groups = adminIndexGroups(viewer);
    expect(groups.map((group) => group.label)).toEqual(expectedGroups.map((group) => group.label));
    groups.forEach((group, index) => {
      expect(group.items.map((item) => item.label)).toEqual(expectedGroups[index]?.items);
    });
  });

  it("빈 allowedMenus면 []다", () => {
    const viewer: RoleMenuViewer = { roleId: SYSADMIN_ROLE_ID, allowedMenus: [] };
    expect(adminIndexGroups(viewer)).toEqual([]);
  });

  it("한 그룹의 항목만 허용되면 그 그룹 하나만 돌아온다(빈 그룹은 배열에 없다)", () => {
    const full = adminIndexGroups({ roleId: SYSADMIN_ROLE_ID, allowedMenus: ADMIN_MENU_KEYS });
    const masterGroup = full.find((group) => group.label === "마스터");
    if (!masterGroup) throw new Error("전체 허용 시 「마스터」 그룹이 없다 — 전제가 깨졌다");
    const masterKeys = masterGroup.items.map((item) => `admin.${item.href.slice("/admin/".length)}`);

    const filtered = adminIndexGroups({ roleId: SYSADMIN_ROLE_ID, allowedMenus: masterKeys });

    expect(filtered).toHaveLength(1);
    expect(filtered[0]).toEqual(masterGroup);
  });

  it("allowedMenus의 순서를 뒤집어도 결과가 같다(순수 함수)", () => {
    const forward = adminIndexGroups({ roleId: SYSADMIN_ROLE_ID, allowedMenus: [...ADMIN_MENU_KEYS] });
    const reversed = adminIndexGroups({
      roleId: SYSADMIN_ROLE_ID,
      allowedMenus: [...ADMIN_MENU_KEYS].reverse(),
    });
    expect(forward).toEqual(reversed);
  });

  it("모든 항목 href가 /admin/<키 뒤쪽 이름>이고, 세 그룹의 합집합이 admin.* 키 10개를 빠짐없이 덮는다", () => {
    const groups = adminIndexGroups({ roleId: SYSADMIN_ROLE_ID, allowedMenus: ADMIN_MENU_KEYS });
    const allItems = groups.flatMap((group) => group.items);
    for (const item of allItems) {
      expect(item.href).toMatch(/^\/admin\/[a-z-]+$/);
    }
    const coveredKeys = new Set(allItems.map((item) => `admin.${item.href.slice("/admin/".length)}`));
    expect(coveredKeys).toEqual(new Set(ADMIN_MENU_KEYS));
  });

  // WR-07(260922-i3k 리뷰) 회귀 방지 — 위 검증은 라벨 집합·href 정규식·href에서
  // 역산한 키 집합을 각각 따로 본다. 같은 그룹 안 두 항목의 href만 서로 맞바꿔도
  // (예: 사람 → /admin/vendors, 거래처 → /admin/people) 세 축 어디도 깨지지
  // 않는다 — 이 테스트는 "이 라벨의 href는 이것"이라는 짝을 직접 단언한다.
  const KEY_BY_LABEL: Record<string, string> = {
    사람: "admin.people",
    거래처: "admin.vendors",
    "법인카드 마스터": "admin.corp-cards",
    코드표: "admin.code-tables",
    권한표: "admin.permissions",
    "정보 노출표": "admin.visibility",
    "시스템 설정": "admin.settings",
    "시스템 상태": "admin.system-status",
    "행동 로그": "admin.action-log",
    보관함: "admin.archive",
  };

  it("항목마다 라벨과 href가 정확히 짝지어져 있다 — 같은 그룹 안 두 항목의 href를 맞바꿔도 잡아낸다", () => {
    const groups = adminIndexGroups({ roleId: SYSADMIN_ROLE_ID, allowedMenus: ADMIN_MENU_KEYS });
    const allItems = groups.flatMap((group) => group.items);
    expect(allItems).toHaveLength(Object.keys(KEY_BY_LABEL).length);
    for (const item of allItems) {
      const key = KEY_BY_LABEL[item.label];
      if (!key) throw new Error(`KEY_BY_LABEL에 라벨 '${item.label}'이 없다`);
      expect(item.href).toBe(`/admin/${key.slice("admin.".length)}`);
    }
  });

  it("admin.settings(관리자용 설정 화면)는 사용자 자신의 「설정」(/settings)과 라벨·경로가 다르다", () => {
    const viewer: RoleMenuViewer = { roleId: SYSADMIN_ROLE_ID, allowedMenus: ["admin.settings"] };
    const entry = adminIndexGroups(viewer)[0]?.items[0];
    expect(entry?.href).toBe("/admin/settings");
    expect(entry?.href).not.toBe("/settings");
    expect(entry?.label).not.toBe("설정");
  });
});

describe("roleMenu — 폰 하단 탭 (SYSTEM.md §6-0 표, 계급 5종)", () => {
  it.each(SEED_ROLE_NAMES)("%s(%s) 탭이 정확히 4개이고 4번째는 「더보기」다", (roleId) => {
    const tabs = roleMenu({ roleId, allowedMenus: [] }).bottomTabs;
    expect(tabs).toHaveLength(4);
    expect(tabs[3]).toEqual({ kind: "more", label: "더보기" });
  });

  it.each(SEED_ROLE_NAMES)("%s(%s) 탭 라벨이 SYSTEM.md 표의 그 행과 원소 단위로 같다", (roleId, name) => {
    const expected = expectedBottomTabRow(SYSTEM, name);
    const actual = roleMenu({ roleId, allowedMenus: [] }).bottomTabs.map((tab) => tab.label);
    expect(actual).toEqual(expected);
  });

  it("모르는 계급 식별자는 기본 계급(기획 PM) 탭으로 떨어지고 탭 수가 여전히 4다", () => {
    const unknown = roleMenu({ roleId: "role-does-not-exist", allowedMenus: [] }).bottomTabs;
    const fallback = roleMenu({ roleId: DEFAULT_ROLE_ID, allowedMenus: [] }).bottomTabs;
    expect(unknown).toHaveLength(4);
    expect(unknown).toEqual(fallback);
  });
});

describe("roleMenu — 계정 그룹 (SYSTEM.md 목록과 원소 단위로 같다)", () => {
  const expectedLabels = expectedAccountGroupLabels(SYSTEM);

  it("SYSTEM.md의 계정 그룹 목록에 「내 정보」와 「로그아웃」이 있다(전제 확인)", () => {
    expect(expectedLabels).toContain("내 정보");
    expect(expectedLabels).toContain("로그아웃");
  });

  it("roleMenu의 accountGroup 라벨 집합이 SYSTEM.md 목록과 원소 단위로 같다", () => {
    const actualLabels = roleMenu(ADMIN).accountGroup.map((entry) => entry.label);
    expect(new Set(actualLabels)).toEqual(new Set(expectedLabels));
  });

  it("「내 정보」는 /account로, 「로그아웃」은 라우트 없는 행동(action)으로 표현된다", () => {
    const group = roleMenu(ADMIN).accountGroup;
    const myInfo = group.find((entry) => entry.label === "내 정보");
    const logout = group.find((entry) => entry.label === "로그아웃");
    expect(myInfo).toEqual({ kind: "link", label: "내 정보", href: "/account" });
    expect(logout).toEqual({ kind: "action", label: "로그아웃", action: "logout" });
  });

  it("「설정」이 SYSTEM.md 목록에 있을 때만 accountGroup에도 있다", () => {
    const hasSettingsInDoc = expectedLabels.includes("설정");
    const settingsEntry = roleMenu(ADMIN).accountGroup.find((entry) => entry.label === "설정");
    if (hasSettingsInDoc) {
      expect(settingsEntry).toEqual({ kind: "link", label: "설정", href: "/settings" });
    } else {
      expect(settingsEntry).toBeUndefined();
    }
  });

  it("accountGroup은 계급과 무관하게 같다(§6-0/§7-8 목록은 역할로 갈라지지 않는다)", () => {
    expect(roleMenu(EMPLOYEE).accountGroup).toEqual(roleMenu(ADMIN).accountGroup);
  });

  it("accountGroup 맨 앞이 「알림함」이고 href가 NOTIFICATIONS_HREF다(04.2-09 Task 1)", () => {
    expect(roleMenu(ADMIN).accountGroup[0]).toEqual({
      kind: "link",
      label: "알림함",
      href: NOTIFICATIONS_HREF,
    });
  });

  it("accountGroup 라벨 순서가 SYSTEM.md 「계정」 그룹 목록과 원소 단위로 같다(순서 포함, 04.2-09 Task 1)", () => {
    const actualLabels = roleMenu(ADMIN).accountGroup.map((entry) => entry.label);
    expect(actualLabels).toEqual(expectedLabels);
  });
});

describe("notificationsMenuLabel — 「알림함 N」 라벨 조립 (04.2-09 Task 2, unreadCountLabel과 결합)", () => {
  it.each([
    [0, "알림함"],
    [1, "알림함 1"],
    [99, "알림함 99"],
    [100, "알림함 99+"],
  ])("count=%d → %s", (count, expected) => {
    expect(notificationsMenuLabel("알림함", count)).toBe(expected);
  });
});

describe("roleMenu — 순수 함수 (부작용 없음, §6-0 셸 절이 이 계약의 근거)", () => {
  it("같은 입력에 대해 항상 같은 결과를 돌려준다", () => {
    expect(roleMenu(ADMIN)).toEqual(roleMenu(ADMIN));
    expect(roleMenu(EMPLOYEE)).toEqual(roleMenu(EMPLOYEE));
  });

  it("SYSTEM.md §6-0 절이 실제로 이 계약들의 근거 문장을 담고 있다(전제 확인)", () => {
    expect(SHELL_SECTION).toContain("PC 상단 바 우측 사용자 진입점");
    expect(SHELL_SECTION).toContain("시스템 상태");
    expect(SHELL_SECTION).toContain("「관리」");
  });
});
