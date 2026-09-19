import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { roleMenu, type RoleMenuViewer } from "../../../ui/shell/role-menu";

// D-23의 계약 고정: 역할 → (상단 바 메뉴, 폰 하단 탭, 계정 그룹, 시스템 상태 진입점)
// 매핑이 순수 함수 한 곳에 데이터로 있는지를 검증한다. 계정 그룹 항목 이름은
// SYSTEM.md §6-0/§7-8에서 읽어 비교한다 — 문서가 바뀌면(예: 02-01 체크포인트 H가
// 나중에 바뀌면) 이 파일을 고치지 않아도 실패로 드러난다(플랜 지시).

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
  // cells[0]은 역할 이름, 나머지 넷이 탭 1~4다.
  return cells.slice(1);
}

const ADMIN: RoleMenuViewer = { isAdmin: true };
const EMPLOYEE: RoleMenuViewer = { isAdmin: false };

describe("roleMenu — 상단 바 1차 메뉴 (D-22)", () => {
  it("관리자 입력이면 1차 메뉴 5개가 전부 들어 있다", () => {
    expect(roleMenu(ADMIN).topBarMenu).toHaveLength(5);
  });

  it("직원 입력이면 1차 메뉴 5개가 전부 들어 있다 — 대응 화면 유무와 무관하다", () => {
    expect(roleMenu(EMPLOYEE).topBarMenu).toHaveLength(5);
  });

  it("관리자·직원의 상단 바 메뉴 결과가 같다(Phase 2는 역할별로 다르지 않다)", () => {
    expect(roleMenu(EMPLOYEE).topBarMenu).toEqual(roleMenu(ADMIN).topBarMenu);
  });
});

describe("roleMenu — 시스템 상태 진입점 (D-17)", () => {
  it("관리자 입력이면 시스템 상태 진입점이 있다", () => {
    expect(roleMenu(ADMIN).systemStatus).not.toBeNull();
  });

  it("직원 입력이면 시스템 상태 진입점이 없다", () => {
    expect(roleMenu(EMPLOYEE).systemStatus).toBeNull();
  });
});

describe("roleMenu — 폰 하단 탭 (SYSTEM.md §6-0 표)", () => {
  it("결과가 정확히 4개이고 4번째는 항상 「더보기」다(관리자)", () => {
    const tabs = roleMenu(ADMIN).bottomTabs;
    expect(tabs).toHaveLength(4);
    expect(tabs[3]).toEqual({ kind: "more", label: "더보기" });
  });

  it("결과가 정확히 4개이고 4번째는 항상 「더보기」다(직원)", () => {
    const tabs = roleMenu(EMPLOYEE).bottomTabs;
    expect(tabs).toHaveLength(4);
    expect(tabs[3]).toEqual({ kind: "more", label: "더보기" });
  });

  it("관리자 탭 라벨이 SYSTEM.md 표의 「관리자」 행과 같다", () => {
    const expected = expectedBottomTabRow(SYSTEM, "관리자");
    expect(roleMenu(ADMIN).bottomTabs.map((tab) => tab.label)).toEqual(expected);
  });

  it("직원 탭 라벨이 SYSTEM.md 표의 「직원」 행과 같다", () => {
    const expected = expectedBottomTabRow(SYSTEM, "직원");
    expect(roleMenu(EMPLOYEE).bottomTabs.map((tab) => tab.label)).toEqual(expected);
  });

  it("탭 1은 §6-0 표가 그 역할에 지정한 첫 화면이다(관리자·직원 모두 「내 차례」)", () => {
    expect(roleMenu(ADMIN).bottomTabs[0]!.label).toBe(expectedBottomTabRow(SYSTEM, "관리자")[0]);
    expect(roleMenu(EMPLOYEE).bottomTabs[0]!.label).toBe(expectedBottomTabRow(SYSTEM, "직원")[0]);
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

  it("accountGroup은 관리자·직원에 대해 같다(§6-0/§7-8 목록은 역할로 갈라지지 않는다)", () => {
    expect(roleMenu(EMPLOYEE).accountGroup).toEqual(roleMenu(ADMIN).accountGroup);
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
  });
});
