import { randomUUID } from "node:crypto";
import { like } from "drizzle-orm";
import { test, expect, type Locator, type Page } from "@playwright/test";
import { db } from "@/db/client";
import { vendors } from "@/db/schema";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { setPermissionCell } from "@/domain/permissions/matrix";
import { insertRole, setRoleArchived } from "@/repositories/roles";
import { upsertVisibility } from "@/repositories/permissions";
import { insertVendor } from "@/repositories/vendors";
import { createAccount } from "@/domain/auth/accounts";
import { assignTeam, createOrgUnit, createTeam } from "@/domain/org";
import { createProject } from "@/domain/projects";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { kstToday } from "@/lib/kst-date";
import { archiveE2EVendor, createFixtureUser } from "./fixtures";
import { loginAsSysadmin } from "./row-actions-helpers";

// 04.6-04 트레이서 — 거래처 `?new=1` · `?editId=`가 목록을 밀지 않는 옆 패널로 열리고 제출 · 닫기 · 포커스 복귀까지.
// UI-SPEC 「옆 패널 상호작용 계약」 · Q1 A(모든 폭 모달 · 가림막 · 여는 요소 유지) · UQ-8 B(등록은 열어 둠 · 수정은 닫힘) ·
// DR1 A(바뀐 칸이 있으면 「입력 버리기」 확인) · D6 · D7 · D8 · D11 · D12 · D14 · D18 · R4 · R5 · R8 · R15 · R20 · M2.
// 거래처 픽스처는 고정 접두 이름이고 afterAll이 숨긴다(다른 스펙의 목록·폭 단언을 건드리지 않는다).

const PREFIX = "패널E2E";
const PANEL = 'dialog[data-ui="side-panel"]';

let fixtures: { id: string; name: string }[] = [];

test.beforeAll(async () => {
  const stamp = randomUUID().slice(0, 6);
  fixtures = [];
  for (let index = 0; index < 24; index += 1) {
    const name = `${PREFIX}-${stamp}-${String(index).padStart(2, "0")}`;
    const row = await insertVendor(SYSTEM_VIEWER, { name, normalizedName: `${name}-${randomUUID()}` });
    fixtures.push({ id: row.id, name });
  }
});

test.afterAll(async () => {
  await db.update(vendors).set({ hidden: true }).where(like(vendors.name, `${PREFIX}%`));
});

function uniqueName(tag: string): string {
  return `${PREFIX}-${tag}-${randomUUID().slice(0, 6)}`;
}

function panel(page: Page): Locator {
  return page.locator(PANEL);
}

function openLink(page: Page): Locator {
  return page.getByRole("link", { name: "거래처 등록" });
}

async function openNew(page: Page): Promise<void> {
  await openLink(page).click();
  await expect(panel(page)).toBeVisible();
  await expect(page).toHaveURL(/\?new=1$/);
}

function tokenAsColor(page: Page, name: string): Promise<string> {
  return page.evaluate((token) => {
    const probe = document.createElement("div");
    probe.style.backgroundColor = `var(${token})`;
    document.body.appendChild(probe);
    const color = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return color;
  }, name);
}

function backdropColor(page: Page, selector: string): Promise<string> {
  return page.evaluate((sel) => {
    const element = document.querySelector(sel);
    return element ? getComputedStyle(element, "::backdrop").backgroundColor : "";
  }, selector);
}

function scrollY(page: Page): Promise<number> {
  return page.evaluate(() => window.scrollY);
}

async function firstRowBox(page: Page): Promise<{ x: number; y: number }> {
  const box = await page.locator("table tbody tr").first().boundingBox();
  if (!box) throw new Error("첫 행 상자를 잴 수 없다");
  return { x: box.x, y: box.y };
}

test.describe("거래처 옆 패널 — PC 1280 (04.6-04)", () => {
  test("「거래처 등록」은 목록을 밀지 않고 오른쪽 480 모달 패널을 연다 · 첫 칸 포커스 · 해시 없음", async ({ page }) => {
    await loginAsSysadmin(page);
    await page.goto("/admin/vendors");
    await page.evaluate(() => window.scrollTo(0, 40));
    const beforeScroll = await scrollY(page);
    expect(beforeScroll).toBeGreaterThan(0);
    const beforeRow = await firstRowBox(page);

    await openNew(page);
    expect(new URL(page.url()).hash).toBe("");

    const dialog = panel(page);
    expect(await dialog.evaluate((element) => element.matches(":modal"))).toBe(true);
    await expect(dialog.getByRole("heading", { name: "거래처 등록" })).toBeVisible();
    await expect(dialog.locator("#name")).toBeFocused();
    await expect
      .poll(async () => {
        const box = await dialog.boundingBox();
        return box ? [Math.round(box.x + box.width), Math.round(box.width)] : null;
      })
      .toEqual([1280, 480]);

    expect(await scrollY(page)).toBe(beforeScroll);
    const afterRow = await firstRowBox(page);
    expect(afterRow).toEqual(beforeRow);
  });

  test("뒤를 막는다(Q1 A) — PC ::backdrop = --scrim-panel · 뒤 목록은 비활성이라 바뀐 칸이 있으면 눌러도 그대로", async ({ page }) => {
    await loginAsSysadmin(page);
    await page.goto("/admin/vendors");
    await openNew(page);
    const scrim = await tokenAsColor(page, "--scrim-panel");
    expect(scrim).not.toBe("rgba(0, 0, 0, 0)");
    expect(await backdropColor(page, PANEL)).toBe(scrim);

    // 목록 자리의 「수정」 링크 좌표를 누른다 — 바뀐 칸이 있으면 가림막 누르기는 무시되고, 뒤 링크는 눌리지 않는다.
    await panel(page).locator("#name").fill("x");
    const editLink = page.locator("table tbody tr").first().getByRole("link", { name: "수정" });
    const box = await editLink.boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await expect(panel(page)).toBeVisible();
    await expect(page).toHaveURL(/\?new=1$/);
    await expect(page.getByRole("dialog", { name: "입력 버리기" })).toHaveCount(0);
  });

  test("여는 요소는 패널이 열려 있어도 렌더에 남는다(R4)", async ({ page }) => {
    await loginAsSysadmin(page);
    await page.goto("/admin/vendors");
    await openNew(page);
    await expect(openLink(page)).toHaveCount(1);
    await expect(page.locator("table tbody tr").first().getByRole("link", { name: "수정" })).toBeAttached();
  });

  test("누른 직후 패널이 뜨기 전까지 링크가 「진행 중」 모양을 보인다(D6 · Q11)", async ({ page }) => {
    await loginAsSysadmin(page);
    await page.goto("/admin/vendors");
    await page.route(
      (url) => url.pathname === "/admin/vendors" && url.searchParams.get("new") === "1",
      async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        await route.continue();
      },
    );
    const link = openLink(page);
    await link.click();
    const busy = link.locator('[aria-busy="true"]');
    await expect(busy).toBeVisible();
    await expect(busy.locator('[aria-hidden="true"]')).toHaveText("…");
    await expect(busy.locator(".sr-only")).toHaveText("처리 중");
    await expect(panel(page)).toBeVisible();
    await expect(link.locator("[aria-busy]")).toHaveCount(0);
  });

  test("Tab은 패널 안에서 돈다 · 행동 줄 DOM 순서와 시각 순서가 「취소」 → 「거래처 등록」이다", async ({ page }) => {
    await loginAsSysadmin(page);
    await page.goto("/admin/vendors");
    await openNew(page);
    const dialog = panel(page);
    const focusable = await dialog.locator("input:not([type=hidden]), select, button, textarea").count();
    for (let index = 0; index < focusable + 3; index += 1) {
      await page.keyboard.press("Tab");
      expect(await page.evaluate(() => document.activeElement?.closest("dialog")?.matches('[data-ui="side-panel"]') ?? false)).toBe(true);
    }

    const cancel = dialog.getByRole("button", { name: "취소" });
    const submit = dialog.getByRole("button", { name: "거래처 등록" });
    const order = await submit.evaluate((element, cancelHandle) => cancelHandle.compareDocumentPosition(element), await cancel.elementHandle());
    expect(order & 4 /* DOCUMENT_POSITION_FOLLOWING */).toBeTruthy();
    const cancelBox = await cancel.boundingBox();
    const submitBox = await submit.boundingBox();
    expect(cancelBox!.x).toBeLessThan(submitBox!.x);
  });

  test("뒤 문서 스크롤이 잠기고 배치가 움직이지 않는다 · 본문 overscroll-behavior contain(D18)", async ({ page }) => {
    await loginAsSysadmin(page);
    await page.goto("/admin/vendors");
    await page.evaluate(() => window.scrollTo(0, 40));
    const beforeScroll = await scrollY(page);
    const beforeRow = await firstRowBox(page);
    await openNew(page);

    await page.mouse.move(100, 300);
    await page.mouse.wheel(0, 600);
    await page.keyboard.press("PageDown");
    expect(await scrollY(page)).toBe(beforeScroll);
    expect((await firstRowBox(page)).x).toBe(beforeRow.x);

    const behaviors = await panel(page).evaluate((element) => {
      const content = element.querySelector(":scope > div:nth-of-type(2)");
      const fields = element.querySelector("form > div");
      return [content, fields].map((node) => (node ? getComputedStyle(node).overscrollBehaviorY : null));
    });
    expect(behaviors).toEqual(["contain", "contain"]);
  });

  for (const how of ["Esc", "닫기 x", "취소", "가림막"] as const) {
    test(`바뀐 칸이 없으면 ${how}로 목록으로 닫히고 포커스가 「거래처 등록」로 돌아온다(D12)`, async ({ page }) => {
      await loginAsSysadmin(page);
      await page.goto("/admin/vendors");
      await page.evaluate(() => window.scrollTo(0, 40));
      const beforeScroll = await scrollY(page);
      await openNew(page);
      const dialog = panel(page);
      if (how === "Esc") await page.keyboard.press("Escape");
      else if (how === "닫기 x") {
        const close = dialog.getByRole("button", { name: "닫기" });
        const box = await close.boundingBox();
        expect(box!.width).toBeGreaterThanOrEqual(44);
        expect(box!.height).toBeGreaterThanOrEqual(44);
        await close.click();
      } else if (how === "취소") await dialog.getByRole("button", { name: "취소" }).click();
      else await page.mouse.click(100, 400);

      await expect(dialog).toHaveCount(0);
      await expect(page).toHaveURL(/\/admin\/vendors$/);
      await expect(openLink(page)).toBeFocused();
      expect(await scrollY(page)).toBe(beforeScroll);
    });
  }

  test("바뀐 칸이 있으면 Esc는 「입력 버리기」 확인 — 확인 창 Esc는 확인 창만 닫고 칸 값은 그대로 · 가림막 하나(DR1 A · D16)", async ({ page }) => {
    await loginAsSysadmin(page);
    await page.goto("/admin/vendors");
    await openNew(page);
    const dialog = panel(page);
    await dialog.locator("#name").fill("입력함");
    await page.keyboard.press("Escape");

    const confirm = page.getByRole("dialog", { name: "입력 버리기" });
    await expect(confirm).toBeVisible();
    await expect(confirm.getByText("거래처 등록 · 1칸")).toBeVisible();
    const opaque = await page.evaluate(() =>
      Array.from(document.querySelectorAll("dialog[open]")).filter((element) => {
        const color = getComputedStyle(element, "::backdrop").backgroundColor;
        return color !== "rgba(0, 0, 0, 0)" && color !== "transparent";
      }).length,
    );
    expect(opaque).toBe(1);

    await page.keyboard.press("Escape");
    await expect(confirm).toHaveCount(0);
    await expect(dialog).toBeVisible();
    await expect(dialog.locator("#name")).toHaveValue("입력함");

    // x · 「취소」도 같은 확인 — 확인해야 닫힌다.
    await dialog.getByRole("button", { name: "닫기" }).click();
    await expect(confirm).toBeVisible();
    await page.keyboard.press("Escape");
    await dialog.getByRole("button", { name: "취소" }).click();
    await expect(confirm).toBeVisible();
    await confirm.getByRole("button", { name: "입력 버리기" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page).toHaveURL(/\/admin\/vendors$/);
  });

  test("바뀐 칸이 있으면 가림막 누르기는 무시된다(UI-SPEC 기본값)", async ({ page }) => {
    await loginAsSysadmin(page);
    await page.goto("/admin/vendors");
    await openNew(page);
    await panel(page).locator("#name").fill("입력함");
    await page.mouse.click(100, 400);
    await expect(panel(page)).toBeVisible();
    await expect(page.getByRole("dialog", { name: "입력 버리기" })).toHaveCount(0);
  });

  test("앱 안에서 열고 닫은 뒤 뒤로 가기는 패널을 다시 열지 않는다 · 직접 URL도 같다(D12)", async ({ page }) => {
    await loginAsSysadmin(page);
    await page.goto("/admin/vendors");
    await openNew(page);
    await page.keyboard.press("Escape");
    await expect(panel(page)).toHaveCount(0);
    await page.goBack();
    await expect(page).not.toHaveURL(/new=1/);
    await expect(panel(page)).toHaveCount(0);

    // 직접 들어온 URL(앞 기록이 목록이 아니다)은 닫을 때 replace — 뒤로 가기가 패널로 돌아오지 않는다.
    await page.goto("/account");
    await page.goto("/admin/vendors?new=1");
    await expect(panel(page)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(panel(page)).toHaveCount(0);
    await expect(page).toHaveURL(/\/admin\/vendors$/);
    await page.goBack();
    await expect(page).toHaveURL(/\/account$/);
  });

  test("패널이 열린 채 브라우저 뒤로 가기 → 패널이 사라지고 scrollY 그대로(R15-i)", async ({ page }) => {
    await loginAsSysadmin(page);
    await page.goto("/admin/vendors");
    await page.evaluate(() => window.scrollTo(0, 40));
    const beforeScroll = await scrollY(page);
    await openNew(page);
    await page.goBack();
    await expect(panel(page)).toHaveCount(0);
    await expect(page).toHaveURL(/\/admin\/vendors$/);
    expect(await scrollY(page)).toBe(beforeScroll);
  });

  test("네이티브 close(cancel 없이 닫힘)도 URL을 목록으로 맞추고 다시 열린다(R5 · R15-iii)", async ({ page }) => {
    await loginAsSysadmin(page);
    await page.goto("/admin/vendors");
    await openNew(page);
    await page.evaluate((selector) => (document.querySelector(selector) as HTMLDialogElement).close(), PANEL);
    await expect(page).not.toHaveURL(/new=1/);
    await expect(panel(page)).toHaveCount(0);
    await openNew(page);
  });

  test("editId가 바뀌면 key로 패널 내용이 새 대상으로 초기화된다(R5)", async ({ page }) => {
    await loginAsSysadmin(page);
    const [a, b] = fixtures;
    await page.goto(`/admin/vendors?editId=${a!.id}`);
    await expect(panel(page).locator("#name")).toHaveValue(a!.name);
    await page.evaluate((href) => (window as unknown as { next: { router: { push(url: string): void } } }).next.router.push(href), `/admin/vendors?editId=${b!.id}`);
    await expect(panel(page).locator("#name")).toHaveValue(b!.name);
  });

  test("필수 칸 없이 Ctrl+Enter → 패널 유지 · 칸 아래 오류 · 입력값 보존", async ({ page }) => {
    await loginAsSysadmin(page);
    await page.goto("/admin/vendors");
    await openNew(page);
    const dialog = panel(page);
    await dialog.locator("#businessNo").fill("123-45-67890");
    await page.keyboard.press("Control+Enter");
    await expect(dialog.locator("#name-error")).toBeVisible();
    await expect(dialog).toBeVisible();
    await expect(dialog.locator("#businessNo")).toHaveValue("123-45-67890");
  });

  test("제출 중에는 1차 「진행 중」 + aria-disabled · Esc · x · 가림막 무시 · 칸 값 유지(D7)", async ({ page }) => {
    await loginAsSysadmin(page);
    await page.goto("/admin/vendors");
    await openNew(page);
    const dialog = panel(page);
    const name = uniqueName("진행");
    await dialog.locator("#name").fill(name);
    await page.route(
      (url) => url.pathname === "/admin/vendors",
      async (route) => {
        if (route.request().method() === "POST") await new Promise((resolve) => setTimeout(resolve, 1500));
        await route.continue();
      },
    );
    await page.keyboard.press("Control+Enter");
    const submit = dialog.getByRole("button", { name: "거래처 등록" });
    await expect(submit).toHaveAttribute("aria-disabled", "true");
    await expect(submit).toContainText("…");

    await page.keyboard.press("Escape");
    await dialog.getByRole("button", { name: "닫기" }).click();
    await page.mouse.click(100, 400);
    await expect(dialog).toBeVisible();
    await expect(dialog.locator("#name")).toHaveValue(name);
    await expect(page.getByRole("dialog", { name: "입력 버리기" })).toHaveCount(0);
    await expect(dialog.getByRole("status")).toBeVisible();
  });

  test("Ctrl+Enter를 연타해도 거래처가 하나만 생긴다(D7 · R15-ii)", async ({ page }) => {
    await loginAsSysadmin(page);
    await page.goto("/admin/vendors");
    await openNew(page);
    const name = uniqueName("연타");
    await panel(page).locator("#name").fill(name);
    let posts = 0;
    await page.route(
      (url) => url.pathname === "/admin/vendors",
      async (route) => {
        if (route.request().method() === "POST") {
          posts += 1;
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
        await route.continue();
      },
    );
    await page.keyboard.press("Control+Enter");
    await page.keyboard.press("Control+Enter");
    await page.keyboard.press("Control+Enter");
    await expect(panel(page).getByRole("status")).toHaveText("거래처 등록됨");
    expect(posts).toBe(1);
    await expect(page.locator("tr", { hasText: name })).toHaveCount(1);
  });

  test("등록 성공(UQ-8 B) — 패널은 열린 채 칸이 비고 첫 칸 포커스 · 결과 한 줄 · 목록에 새 행 · 새로고침 0 · 바로 Esc는 확인 없이 닫힘", async ({ page }) => {
    await loginAsSysadmin(page);
    await page.goto("/admin/vendors");
    await openNew(page);
    const dialog = panel(page);
    const name = uniqueName("등록");
    await dialog.locator("#name").fill(name);
    await dialog.locator("#businessNo").fill("123-45-67890");

    let refreshes = 0;
    page.on("request", (request) => {
      if (request.method() === "GET" && request.headers()["rsc"] === "1" && !request.headers()["next-router-prefetch"]) refreshes += 1;
    });
    await page.keyboard.press("Control+Enter");
    await expect(dialog.getByRole("status")).toHaveText("거래처 등록됨");
    await expect(dialog.locator("#name")).toHaveValue("");
    await expect(dialog.locator("#businessNo")).toHaveValue("");
    await expect(dialog.locator("#name")).toBeFocused();
    await expect(page.locator("tr", { hasText: name })).toBeAttached();
    await page.waitForTimeout(500);
    expect(refreshes).toBe(0);

    // 같은 이름을 한 번 더 — 기존 「같은 이름 · 확인」 안내가 패널 안에 남는다.
    await dialog.locator("#name").fill(name);
    await page.keyboard.press("Control+Enter");
    await expect(dialog.getByText("같은 이름의 거래처가 이미 있습니다 · 확인")).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "입력 버리기" })).toHaveCount(0);
    await expect(dialog).toHaveCount(0);
  });

  test("수정 성공 — 패널이 닫히고 포커스가 그 행의 「수정」 · 목록에 바뀐 값 · 새로고침 1(UQ-8 B · D8 · R20)", async ({ page }) => {
    await loginAsSysadmin(page);
    const target = fixtures[3]!;
    await page.goto("/admin/vendors");
    const row = page.locator("tr", { hasText: target.name });
    await row.getByRole("link", { name: "수정" }).click();
    const dialog = panel(page);
    await expect(dialog.getByRole("heading", { name: "거래처 수정" })).toBeVisible();
    await expect(dialog.locator("#name")).toHaveValue(target.name);

    const renamed = `${target.name}-수정`;
    await dialog.locator("#name").fill(renamed);
    let refreshes = 0;
    page.on("request", (request) => {
      if (request.method() === "GET" && request.headers()["rsc"] === "1" && !request.headers()["next-router-prefetch"]) refreshes += 1;
    });
    await page.keyboard.press("Control+Enter");
    await expect(dialog).toHaveCount(0);
    await expect(page).toHaveURL(/\/admin\/vendors$/);
    await expect(page.locator("tr", { hasText: renamed })).toBeAttached();
    await expect(page.locator("tr", { hasText: renamed }).getByRole("link", { name: "수정" })).toBeFocused();
    await page.waitForTimeout(500);
    expect(refreshes).toBe(1);
  });

  // 기존 동작 그대로 — 보관된 id의 ?editId=는 수정 모드로 열리지 않는다(page.tsx: editingVendor null + ?new=1 없음 → 패널 없음).
  test("보관된 거래처의 editId는 수정 패널을 열지 않는다", async ({ page }) => {
    await loginAsSysadmin(page);
    const doomed = await insertVendor(SYSTEM_VIEWER, { name: uniqueName("보관"), normalizedName: `보관-${randomUUID()}` });
    await archiveE2EVendor(doomed.id);
    await page.goto(`/admin/vendors?editId=${doomed.id}`);
    await expect(page.getByRole("heading", { name: "거래처", level: 1 })).toBeVisible();
    await expect(panel(page)).toHaveCount(0);
  });

  test("쓰기 권한이 없는 계급의 ?new=1 · ?editId=는 패널이 렌더되지 않는다", async ({ browser }) => {
    const roleId = `role-e2e-panel-${randomUUID()}`;
    await insertRole(SYSTEM_VIEWER, { id: roleId, name: `E2E 패널 ${roleId.slice(-12)}`, sortOrder: 99 });
    await upsertVisibility(SYSTEM_VIEWER, { roleId, infoItem: "vendor.value", visible: true });
    const reader = await createFixtureUser({ roleId });
    try {
      await setPermissionCell(SYSTEM_VIEWER, { roleId, menu: "admin.vendors", action: "view", allowed: true });
      const context = await browser.newContext();
      const page = await context.newPage();
      await page.goto("/login");
      await page.getByLabel("이메일").fill(reader.email);
      await page.getByLabel("비밀번호").fill(reader.password);
      await page.getByRole("button", { name: "로그인" }).click();
      await expect(page).toHaveURL(/\/account$/);
      await page.goto("/admin/vendors?new=1");
      await expect(page.getByRole("heading", { name: "거래처" })).toBeVisible();
      await expect(panel(page)).toHaveCount(0);
      await page.goto(`/admin/vendors?editId=${fixtures[0]!.id}`);
      await expect(panel(page)).toHaveCount(0);
      await context.close();
    } finally {
      await setRoleArchived(SYSTEM_VIEWER, roleId, true);
    }
  });

  // A1 탐침(R8) — 패널 없이 라우터만. `next/link scroll={false}`가 부르는 같은 경로(`router.push(url, { scroll: false })`)로 검색 파라미터만 바꾼다.
  // 실측(2026-10-02): 뼈대(loading.tsx)는 한 번도 보이지 않는다 — 응답이 늦는 동안(1200ms 지연)에도 DOM에 뼈대가 없고 옛 화면이 남는다.
  // 빠른 이동에서 숨은 뼈대 요소가 opacity 0(300ms 지연 표시)로 다시 붙는 일이 0~1회 있어 DOM 노출 수는 기록만 하고(SUMMARY 「A1 탐침」),
  // 단언은 결정적인 둘이다: 스크롤이 어느 쪽에서도 안 바뀐다 · 뼈대가 들어올 때 이미 opacity 0이다.
  test("A1 탐침(R8) — scroll:false 검색 파라미터 이동은 scrollY를 바꾸지 않고 뼈대는 보이지 않는다(opacity 0)", async ({ page }) => {
    await loginAsSysadmin(page);
    await page.goto("/approvals");
    await page.evaluate(() => {
      document.body.style.minHeight = "3000px";
      window.scrollTo(0, 150);
      const probe = { skeleton: 0, insertOpacity: [] as string[] };
      (window as unknown as { __a1: typeof probe }).__a1 = probe;
      new MutationObserver((records) => {
        for (const record of records) {
          record.addedNodes.forEach((node) => {
            if (!(node instanceof Element)) return;
            const skeleton = node.matches('[data-ui="table-skeleton"]') ? node : node.querySelector('[data-ui="table-skeleton"]');
            if (!skeleton) return;
            probe.skeleton += 1;
            probe.insertOpacity.push(getComputedStyle(skeleton).opacity);
          });
        }
      }).observe(document.body, { childList: true, subtree: true });
    });
    const before = await scrollY(page);
    expect(before).toBeGreaterThan(0);

    const results: string[] = [];
    for (const [tag, delayMs] of [["fast", 0], ["slow", 1200]] as const) {
      await page.route(
        (url) => url.pathname === "/approvals" && url.searchParams.get("a1") === tag,
        async (route) => {
          if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
          await route.continue();
        },
      );
      await page.evaluate(
        (name) =>
          (window as unknown as { next: { router: { push(url: string, options: { scroll: boolean }): void } } }).next.router.push(`/approvals?a1=${name}`, { scroll: false }),
        tag,
      );
      // 응답이 늦는 동안(700ms 시점) 뼈대가 보이는지 — 300ms 지연 표시가 지난 뒤라 느린 쪽만 보인다(기록용).
      await page.waitForTimeout(700);
      const midOpacity = await page.evaluate(() => {
        const skeleton = document.querySelector('[data-ui="table-skeleton"]');
        return skeleton ? getComputedStyle(skeleton).opacity : "없음";
      });
      expect(["없음", "0"]).toContain(midOpacity);
      await expect(page).toHaveURL(new RegExp(`a1=${tag}$`));
      await page.waitForTimeout(delayMs + 800);
      expect(await scrollY(page)).toBe(before);
      const probe = await page.evaluate(() => (window as unknown as { __a1: { skeleton: number; insertOpacity: string[] } }).__a1);
      results.push(`${tag}: 뼈대 누적 ${probe.skeleton}회 · 들어올 때 opacity [${probe.insertOpacity.join(",")}] · 700ms 시점 ${midOpacity}`);
      expect(probe.insertOpacity.every((value) => value === "0")).toBe(true);
    }
    console.log(`A1 탐침 — scrollY ${before} → ${await scrollY(page)} · ${results.join(" · ")}`);
  });

  // A1 양성 대조(04.6-17 · R8 탐침 보존) — 위 탐침이 세는 셀렉터(`[data-ui="table-skeleton"]`)가 빈 셀렉터가 아니다: 다른 화면에서 결재함으로 첫 진입(응답 지연)하면
  // 같은 셀렉터가 1회 이상 DOM에 붙고 300ms 지연 표시가 지난 뒤 보인다(opacity > 0). 검색 파라미터만 바꾸는 이동은 위 탐침이 0회로 잰다.
  test("A1 양성 대조 — 다른 화면에서 결재함으로 첫 진입(지연 응답)하면 `table-skeleton`이 보인다", async ({ page }) => {
    await loginAsSysadmin(page);
    await page.goto("/account");
    // 뼈대(loading 틀)는 라우터가 미리 가져온 경우에만 응답이 늦는 동안 보인다 — 먼저 미리 가져오고, 그다음에 응답을 늦춘다.
    const prefetched = page.waitForResponse((response) => response.url().includes("/approvals") && response.request().headers()["next-router-prefetch"] === "1");
    await page.evaluate(() => (window as unknown as { next: { router: { prefetch(url: string): void } } }).next.router.prefetch("/approvals"));
    await prefetched;
    await page.waitForLoadState("networkidle");
    await page.route(
      (url) => url.pathname === "/approvals",
      async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 2500));
        await route.continue();
      },
    );
    await page.evaluate(() => (window as unknown as { next: { router: { push(url: string): void } } }).next.router.push("/approvals"));
    const skeleton = page.locator('[data-ui="table-skeleton"]');
    await expect
      .poll(async () => (await skeleton.count()) > 0 && parseFloat(await skeleton.first().evaluate((element) => getComputedStyle(element).opacity)) > 0)
      .toBe(true);
    await expect(page).toHaveURL(/\/approvals$/);
  });

  test("M2 — 패널 안 라벨이 칸 위 · 입력이 묶음 전폭 · 힌트가 묶음 왼쪽에서 시작한다(PC 1280)", async ({ page }) => {
    await loginAsSysadmin(page);
    const target = fixtures[5]!;
    await page.goto(`/admin/vendors?editId=${target.id}`);
    const dialog = panel(page);
    await expect(dialog.locator("#name")).toBeVisible();
    const metrics = await dialog.evaluate((element) => {
      const rect = (selector: string) => element.querySelector(selector)?.getBoundingClientRect() ?? null;
      const fields = element.querySelector("form > div")!.getBoundingClientRect();
      const pairs = ["name", "defaultEvidenceType"].map((id) => ({
        label: rect(`label[for="${id}"]`)!,
        input: rect(`#${id}`)!,
      }));
      return { fields, pairs, hint: rect("#accountNumber-current") };
    });
    for (const { label, input } of metrics.pairs) {
      expect(input.top).toBeGreaterThanOrEqual(label.bottom - 1);
      expect(Math.abs(input.left - label.left)).toBeLessThanOrEqual(1);
    }
    expect(Math.abs(metrics.pairs[0]!.input.width - metrics.pairs[1]!.input.width)).toBeLessThanOrEqual(1);
    expect(metrics.hint).not.toBeNull();
    expect(Math.abs(metrics.hint!.left - metrics.pairs[0]!.input.left)).toBeLessThanOrEqual(1);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});

test.describe("거래처 옆 패널 — 폰 시트 (04.6-04)", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("아래 시트 · 전폭 · 높이 ≤ 88dvh · 가림막 --scrim-dialog · 뒤로 가기 = 시트 닫힘 · 첫 칸 뒤 1차 버튼이 visualViewport 안(D11)", async ({ page }) => {
    await loginAsSysadmin(page);
    await page.goto("/admin/vendors");
    await openNew(page);
    const dialog = panel(page);
    await expect(dialog.locator("#name")).toBeFocused();
    await expect
      .poll(async () => {
        const box = await dialog.boundingBox();
        return box ? [Math.round(box.x), Math.round(box.width), Math.round(box.y + box.height)] : null;
      })
      .toEqual([0, 390, 844]);
    const box = (await dialog.boundingBox())!;
    expect(box.height).toBeLessThanOrEqual(844 * 0.88 + 1);
    expect(await backdropColor(page, PANEL)).toBe(await tokenAsColor(page, "--scrim-dialog"));

    const submit = dialog.getByRole("button", { name: "거래처 등록" });
    const submitBox = (await submit.boundingBox())!;
    const viewport = await page.evaluate(() => ({ top: window.visualViewport?.offsetTop ?? 0, height: window.visualViewport?.height ?? window.innerHeight }));
    expect(submitBox.y).toBeGreaterThanOrEqual(viewport.top);
    expect(submitBox.y + submitBox.height).toBeLessThanOrEqual(viewport.top + viewport.height + 1);

    await page.goBack();
    await expect(dialog).toHaveCount(0);
  });

  test("폰 320 — 시트가 전폭이고 문서 가로 넘침이 0이다", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await loginAsSysadmin(page);
    await page.goto("/admin/vendors");
    await openNew(page);
    const dialog = panel(page);
    await expect
      .poll(async () => {
        const box = await dialog.boundingBox();
        return box ? [Math.round(box.x), Math.round(box.width)] : null;
      })
      .toEqual([0, 320]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  });
});

// 같은 웨이브 04.6-07 · 08(TextField · Select · Button)이 `height: var(--field-h, var(--control-h))`를 읽어야 초록이다 —
// 자기 트리에서는 옛 값이라 공통 §1 ⑤ 웨이브 합본 묶음이 돈다(--grep-invert @wave-merge로 자기 검증에서 뺀다).
test.describe("합본 뒤 높이 (D14)", { tag: "@wave-merge" }, () => {
  test("PC 패널 입력 계산 높이 40 · 행동 줄 버튼 40", async ({ page }) => {
    await loginAsSysadmin(page);
    await page.goto("/admin/vendors?new=1");
    const dialog = panel(page);
    await expect(dialog.locator("#name")).toBeVisible();
    expect(await dialog.locator("#name").evaluate((element) => parseFloat(getComputedStyle(element).height))).toBe(40);
    for (const name of ["취소", "거래처 등록"]) {
      expect(await dialog.getByRole("button", { name }).evaluate((element) => parseFloat(getComputedStyle(element).height))).toBe(40);
    }
  });

  test("폰 390 — 입력 40 · 행동 줄 버튼 44", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loginAsSysadmin(page);
    await page.goto("/admin/vendors?new=1");
    const dialog = panel(page);
    await expect(dialog.locator("#name")).toBeVisible();
    expect(await dialog.locator("#name").evaluate((element) => parseFloat(getComputedStyle(element).height))).toBe(40);
    for (const name of ["취소", "거래처 등록"]) {
      expect(await dialog.getByRole("button", { name }).evaluate((element) => parseFloat(getComputedStyle(element).height))).toBe(44);
    }
  });
});

// 04.6-10 — 프로젝트 `?new=1` · `&copyFrom=` 옆 패널. A1(`loading.tsx`가 있는 첫 패널 화면에서 검색 파라미터만 바뀌는 이동에 뼈대가 다시 보이지 않고 스크롤·배치가 그대로) ·
// D6(여는 링크 「진행 중」) · DR1 A(입력한 채 닫기 = 「입력 버리기」 확인 — 답 `04.6-ANSWERS.md` 257e5ea2) · R9 D(등록 성공 = 새 상세로 이동) · R15(쓰기 권한 없는 `?new=1` = dialog 0).
const PM_PREFIX = "프로젝트패널E2E";

type ProjectFixture = { email: string; password: string; teamId: string; pmUserId: string; original: { id: string; number: string; name: string; clientId: string } };

// 팀에 발령된 기획 PM + 그 팀의 프로젝트 하나 — 목록이 비지 않아야 머리 1차 「프로젝트 등록」이 있다(빈 목록은 DR5 A로 머리 1차가 없다).
async function makeProjectFixture(): Promise<ProjectFixture> {
  const orgUnit = await createOrgUnit(SYSTEM_VIEWER, { name: `E2E패널본부-${randomUUID()}` });
  const team = await createTeam(SYSTEM_VIEWER, { orgUnitId: orgUnit.id, name: `E2E패널팀-${randomUUID().slice(0, 8)}` });
  const email = `e2e-projpanel-${randomUUID()}@example.test`;
  const { userId, tempPassword } = await createAccount(SYSTEM_VIEWER, { email, name: "E2E 패널 PM", roleId: DEFAULT_ROLE_ID });
  await assignTeam(SYSTEM_VIEWER, { userId, teamId: team.id, effectiveFrom: kstToday(new Date()) });
  const clientName = `${PM_PREFIX}-거래처-${randomUUID().slice(0, 8)}`;
  const client = await insertVendor(SYSTEM_VIEWER, { name: clientName, normalizedName: clientName.toLowerCase() });
  const name = `${PM_PREFIX}-${randomUUID().slice(0, 8)}`;
  const created = await createProject(SYSTEM_VIEWER, { clientId: client.id, teamId: team.id, pmUserId: userId, name });
  return { email, password: tempPassword, teamId: team.id, pmUserId: userId, original: { id: created.id, number: created.number, name, clientId: client.id } };
}

async function loginAs(page: Page, account: { email: string; password: string }): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("이메일").fill(account.email);
  await page.getByLabel("비밀번호").fill(account.password);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/account$/);
}

function projectOpenLink(page: Page): Locator {
  return page.getByRole("link", { name: "프로젝트 등록" });
}

async function openProjectPanel(page: Page): Promise<void> {
  await projectOpenLink(page).click();
  await expect(panel(page)).toBeVisible();
  await expect(page).toHaveURL(/\/projects\?new=1$/);
}

test.describe("프로젝트 옆 패널 — PC 1280 (04.6-10)", () => {
  // A1 실측(R8 · RESEARCH A1) — 패널이 있는 첫 `loading.tsx` 화면. 「프로젝트 등록」 이동(`/projects` → `/projects?new=1`)은 검색 파라미터만 바뀐다.
  // 뼈대(`[data-ui="table-skeleton"]` 또는 옛 `table[aria-hidden]`)는 한 번도 보이지 않고(300ms 지연 표시 — 보이는 순간 opacity > 0) 스크롤 · 제목 위치가 그대로다.
  test("A1 — 「프로젝트 등록」 이동에서 뼈대가 보이지 않고 스크롤 · 제목 위치가 그대로다", async ({ page }) => {
    const account = await makeProjectFixture();
    await loginAs(page, account);
    await page.goto("/projects");
    // 글꼴 · 스트리밍이 끝나 배치가 자리 잡은 뒤에 기준을 잰다(부하가 있으면 첫 측정이 늦은 배치 이동을 섞는다).
    await page.waitForLoadState("networkidle");
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(() => {
      document.body.style.minHeight = "3000px";
      window.scrollTo(0, 40);
    });
    const beforeScroll = await scrollY(page);
    expect(beforeScroll).toBeGreaterThan(0);
    // 이동 중에는 숨은 뼈대 틀의 제목이 DOM에 함께 붙을 수 있다 — 보이는 제목만 잰다.
    // 문서 기준 위치(스크롤을 더한다) — 배치가 밀렸는지만 잰다. 스크롤 자체는 따로 단언한다.
    const titleTop = async () =>
      page.locator('[data-ui="screen-title"]:visible').evaluate((element) => Math.round(element.getBoundingClientRect().top + window.scrollY));
    const beforeTitle = await titleTop();

    await page.route(
      (url) => url.pathname === "/projects" && url.searchParams.get("new") === "1",
      async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 1200));
        await route.continue();
      },
    );
    await projectOpenLink(page).click();
    let visibleSkeleton = 0;
    for (let index = 0; index < 14; index += 1) {
      visibleSkeleton += await page.evaluate(
        () =>
          Array.from(document.querySelectorAll('[data-ui="table-skeleton"], table[aria-hidden="true"]')).filter(
            (element) => parseFloat(getComputedStyle(element.parentElement && element.matches("table") ? element.parentElement : element).opacity) > 0,
          ).length,
      );
      await page.waitForTimeout(100);
    }
    await expect(panel(page)).toBeVisible();
    expect(visibleSkeleton).toBe(0);
    expect(await scrollY(page)).toBe(beforeScroll);
    expect(await titleTop()).toBe(beforeTitle);
    await expect(panel(page).getByRole("heading", { name: "프로젝트 등록" })).toBeVisible();
  });

  test("누른 직후 패널이 뜨기 전까지 「프로젝트 등록」 링크가 「진행 중」 모양을 보인다(D6)", async ({ page }) => {
    const account = await makeProjectFixture();
    await loginAs(page, account);
    await page.goto("/projects");
    await page.route(
      (url) => url.pathname === "/projects" && url.searchParams.get("new") === "1",
      async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        await route.continue();
      },
    );
    const link = projectOpenLink(page);
    await link.click();
    const busy = link.locator('[aria-busy="true"]');
    await expect(busy).toBeVisible();
    await expect(busy.locator('[aria-hidden="true"]')).toHaveText("…");
    await expect(busy.locator(".sr-only")).toHaveText("처리 중");
    await expect(panel(page)).toBeVisible();
    await expect(link.locator("[aria-busy]")).toHaveCount(0);
  });

  test("여는 요소는 패널이 열려 있어도 렌더에 남는다(R4) · 주소에 해시가 없다", async ({ page }) => {
    const account = await makeProjectFixture();
    await loginAs(page, account);
    await page.goto("/projects");
    await openProjectPanel(page);
    expect(new URL(page.url()).hash).toBe("");
    await expect(projectOpenLink(page)).toHaveCount(1);
    await expect(page.locator('[data-ui="primary-button"]').filter({ hasText: "프로젝트 등록" })).toHaveCount(2);
  });

  test("바뀐 칸이 있으면 Esc · x · 「취소」는 「입력 버리기」 확인 — 확인 창 Esc는 확인만 닫고 값은 그대로 · 가림막 하나 · 확인하면 닫히고 포커스가 「프로젝트 등록」으로(DR1 A · D16)", async ({ page }) => {
    const account = await makeProjectFixture();
    await loginAs(page, account);
    await page.goto("/projects");
    await openProjectPanel(page);
    const dialog = panel(page);
    const nameField = dialog.locator("#name");
    await nameField.fill("입력함");

    await page.keyboard.press("Escape");
    const confirm = page.getByRole("dialog", { name: "입력 버리기" });
    await expect(confirm).toBeVisible();
    await expect(confirm.getByText("프로젝트 등록 · 1칸")).toBeVisible();
    await expect(dialog).toBeVisible();
    const opaque = await page.evaluate(
      () =>
        Array.from(document.querySelectorAll("dialog[open]")).filter((element) => {
          const color = getComputedStyle(element, "::backdrop").backgroundColor;
          return color !== "rgba(0, 0, 0, 0)" && color !== "transparent";
        }).length,
    );
    expect(opaque).toBe(1);

    await page.keyboard.press("Escape");
    await expect(confirm).toHaveCount(0);
    await expect(dialog).toBeVisible();
    await expect(nameField).toHaveValue("입력함");

    await dialog.getByRole("button", { name: "닫기" }).click();
    await expect(confirm).toBeVisible();
    await page.keyboard.press("Escape");
    await dialog.getByRole("button", { name: "취소" }).click();
    await expect(confirm).toBeVisible();
    await confirm.getByRole("button", { name: "입력 버리기" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page).toHaveURL(/\/projects$/);
    await expect(projectOpenLink(page)).toBeFocused();
  });

  test("손대지 않은 등록 패널의 Esc는 확인 없이 닫힌다", async ({ page }) => {
    const account = await makeProjectFixture();
    await loginAs(page, account);
    await page.goto("/projects");
    await openProjectPanel(page);
    await page.keyboard.press("Escape");
    await expect(panel(page)).toHaveCount(0);
    await expect(page.getByRole("dialog", { name: "입력 버리기" })).toHaveCount(0);
    await expect(projectOpenLink(page)).toBeFocused();
  });

  test("복사 패널(&copyFrom=) — 원본 값이 미리 채워지고 아무 칸도 바꾸지 않은 Esc는 확인 없이 닫힌다", async ({ page }) => {
    const account = await makeProjectFixture();
    await loginAs(page, account);
    await page.goto(`/projects?new=1&copyFrom=${account.original.id}`);
    const dialog = panel(page);
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("heading", { name: "프로젝트 등록" })).toBeVisible();
    await expect(dialog.locator("#name")).toHaveValue(account.original.name);
    await expect(dialog.getByText(`${account.original.number} ${account.original.name}에서 복사`)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "입력 버리기" })).toHaveCount(0);
    await expect(dialog).toHaveCount(0);
    await expect(page).toHaveURL(/\/projects$/);
  });

  test("등록 성공은 새 프로젝트 상세로 이동한다(R9 D) · 실패는 패널 유지 + 칸 아래 오류 + 값 보존", async ({ page }) => {
    const account = await makeProjectFixture();
    await loginAs(page, account);
    await page.goto("/projects");
    await openProjectPanel(page);
    const dialog = panel(page);
    await dialog.getByLabel("클라이언트").selectOption({ index: 1 });
    const clientValue = await dialog.getByLabel("클라이언트").inputValue();
    await dialog.locator("#project-form #startDate").fill("2026-12-31");
    await dialog.locator("#project-form #endDate").fill("2026-01-01");
    await dialog.getByRole("button", { name: "프로젝트 등록" }).click();
    await expect(dialog.locator("#name-error")).toBeVisible();
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel("클라이언트")).toHaveValue(clientValue);
    await expect(dialog.locator("#project-form #startDate")).toHaveValue("2026-12-31");

    const projectName = `${PM_PREFIX}-등록-${randomUUID().slice(0, 8)}`;
    await dialog.locator("#name").fill(projectName);
    await dialog.locator("#project-form #startDate").fill("");
    await dialog.locator("#project-form #endDate").fill("");
    await page.keyboard.press("Control+Enter");
    await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}$/);
    await expect(page.getByRole("heading", { name: projectName })).toBeVisible();
  });

  test("쓰기 권한이 없는 계급의 ?new= · &copyFrom=은 dialog가 0개다(R15 · T-04.6-31)", async ({ browser }) => {
    const roleId = `role-e2e-projpanel-${randomUUID()}`;
    await insertRole(SYSTEM_VIEWER, { id: roleId, name: `E2E 프로젝트 패널 ${roleId.slice(-12)}`, sortOrder: 99 });
    const reader = await createFixtureUser({ roleId });
    try {
      await setPermissionCell(SYSTEM_VIEWER, { roleId, menu: "projects", action: "view", allowed: true });
      const context = await browser.newContext();
      const page = await context.newPage();
      await loginAs(page, reader);
      await page.goto("/projects?new=1");
      await expect(page.getByRole("heading", { name: "프로젝트", level: 1 })).toBeVisible();
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await page.goto("/projects?new=1&copyFrom=00000000-0000-0000-0000-000000000000");
      await expect(page.getByRole("heading", { name: "프로젝트", level: 1 })).toBeVisible();
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await context.close();
    } finally {
      await setRoleArchived(SYSTEM_VIEWER, roleId, true);
    }
  });
});

// 같은 웨이브 04.6-11(거래처 「수정」 = `RowAction href`)과 04.6-12(상세 `DetailScreen`의 `screen-title`)가 합쳐져야 뜻이 있다 — 합본 묶음(--grep @wave-merge)이 돈다.
test.describe("합본 뒤 — 프로젝트 패널 (04.6-10)", { tag: "@wave-merge" }, () => {
  test("여는 중 — 행 행동", async ({ page }) => {
    await loginAsSysadmin(page);
    await page.goto("/admin/vendors");
    await page.route(
      (url) => url.pathname === "/admin/vendors" && url.searchParams.has("editId"),
      async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        await route.continue();
      },
    );
    // 보관된 거래처 행은 행동 칸이 비어 「수정」 링크가 없다 — 링크가 있는 첫 행을 쓴다(앞 테스트가 만든 보관 행의 순서에 기대지 않는다).
    const link = page.locator("table tbody tr").filter({ has: page.getByRole("link", { name: "수정" }) }).first().getByRole("link", { name: "수정" });
    await link.click();
    await expect(link.locator('[aria-busy="true"]')).toBeVisible();
    await expect(panel(page)).toBeVisible();
    await expect(link.locator("[aria-busy]")).toHaveCount(0);
  });

  test("등록 뒤 상세 제목 포커스", async ({ page }) => {
    const account = await makeProjectFixture();
    await loginAs(page, account);
    await page.goto("/projects");
    await openProjectPanel(page);
    const dialog = panel(page);
    await dialog.getByLabel("클라이언트").selectOption({ index: 1 });
    const projectName = `${PM_PREFIX}-포커스-${randomUUID().slice(0, 8)}`;
    await dialog.locator("#name").fill(projectName);
    await page.keyboard.press("Control+Enter");
    await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}$/);
    // 이동 직후 첫 그리기는 `projects/loading.tsx`의 목록 뼈대(제목 「프로젝트」)이고 상세 제목은 뒤따라 같은 자리를 갈아 끼운다 —
    // 아무 `screen-title`이나 잡으면 뼈대 제목의 포커스를 보고 통과한다. 상세 본문 제목(프로젝트 이름)이 그려진 뒤에 그 제목을 본다.
    const detailTitle = page.getByRole("heading", { name: projectName, level: 1 });
    await expect(detailTitle).toBeVisible();
    await expect(detailTitle).toHaveAttribute("data-ui", "screen-title");
    await expect(detailTitle).toBeFocused();
  });
});
