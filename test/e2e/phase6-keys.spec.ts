import { test, expect, type Page } from "@playwright/test";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { codeItems, settingsSimple } from "@/db/schema";
import { SYSADMIN_ROLE_ID } from "@/domain/permissions/roles";
import {
  EVIDENCE_PREPAID_DUE_DAYS,
  EVIDENCE_REQUIRED,
  PAYMENT_METHOD_EVIDENCE_PAIRS,
  PURCHASE_ONLINE_VENDOR_NAME,
} from "@/domain/settings/keys";
import { createFixtureUser } from "./fixtures";

// 06-02 Task 1 — S20 설정 키 넷 + 짝 격자(SP-9 · §7-13 PermissionGrid 재사용). 공용 설정이라 매 테스트 전 · 후에 기본값으로 돌린다.
const KEYS = [EVIDENCE_REQUIRED.key, EVIDENCE_PREPAID_DUE_DAYS.key, PURCHASE_ONLINE_VENDOR_NAME.key, PAYMENT_METHOD_EVIDENCE_PAIRS.key];
const GRID_NAME = "지급 방식 · 증빙 종류 짝";

async function resetKeys() {
  await db.delete(settingsSimple).where(inArray(settingsSimple.key, KEYS));
}

async function loginAndOpenSettings(page: Page) {
  const admin = await createFixtureUser({ roleId: SYSADMIN_ROLE_ID });
  await page.goto("/login");
  await page.getByLabel("이메일").fill(admin.email);
  await page.getByLabel("비밀번호").fill(admin.password);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/account$/);
  await page.goto("/admin/settings");
}

function cell(page: Page, method: string, evidence: string) {
  return page.getByRole("checkbox", { name: `${method} · ${evidence}`, exact: true });
}

test.describe.configure({ mode: "serial" });

test.describe("06-02 설정 키 · 짝 격자", () => {
  test.beforeEach(resetKeys);
  test.afterEach(resetKeys);

  test("S20 empty — 증빙 필수 켬 · 선결제 증빙 기한 14 일 · 온라인구매 협력사 빈 값 · 증빙 크기 한도 10 · 짝 격자 모든 칸 해제", async ({ page }) => {
    await loginAndOpenSettings(page);

    await expect(page.getByRole("heading", { name: "증빙", exact: true })).toBeVisible();
    await expect(page.getByRole("checkbox", { name: "증빙 필수", exact: true })).toBeChecked();
    await expect(page.getByText("끄면 증빙 없이 지급 완료")).toBeVisible();

    await expect(page.getByLabel("증빙 크기 한도")).toHaveValue("10");
    await expect(page.getByLabel("선결제 증빙 기한")).toHaveValue("14");
    await expect(page.getByText("일", { exact: true })).toBeVisible();

    await expect(page.getByLabel("온라인구매 협력사")).toHaveValue("");

    const grid = page.getByRole("table", { name: GRID_NAME });
    await expect(grid).toBeVisible();
    for (const method of ["계좌이체", "법인카드", "현금"]) {
      await expect(grid.getByRole("rowheader", { name: new RegExp(method) })).toBeVisible();
    }
    await expect(grid.getByRole("checkbox", { checked: true })).toHaveCount(0);
    await expect(page.getByText("비면 짝 검사 없음")).toBeVisible();
  });

  test("선결제 증빙 기한을 21로 저장하면 다시 열어도 21이다", async ({ page }) => {
    await loginAndOpenSettings(page);
    const input = page.getByLabel("선결제 증빙 기한");
    await input.fill("21");
    await input.blur();
    await expect(async () => {
      await page.reload();
      await expect(page.getByLabel("선결제 증빙 기한")).toHaveValue("21");
    }).toPass();
  });

  test("짝 격자 — 칸 하나가 그 짝만 더하고 뺀다(저장 버튼 없음 · 다시 열어도 그대로)", async ({ page }) => {
    await loginAndOpenSettings(page);
    const first = cell(page, "계좌이체", "세금계산서");

    await first.check();
    await expect(first).toBeChecked();
    await expect(async () => {
      await page.reload();
      await expect(cell(page, "계좌이체", "세금계산서")).toBeChecked();
    }).toPass();

    await cell(page, "법인카드", "세금계산서").check();
    await expect(async () => {
      await page.reload();
      await expect(cell(page, "계좌이체", "세금계산서")).toBeChecked();
      await expect(cell(page, "법인카드", "세금계산서")).toBeChecked();
    }).toPass();

    await cell(page, "계좌이체", "세금계산서").uncheck();
    await expect(async () => {
      await page.reload();
      await expect(cell(page, "계좌이체", "세금계산서")).not.toBeChecked();
      await expect(cell(page, "법인카드", "세금계산서")).toBeChecked();
    }).toPass();
  });

  // E-45 — 같은 탭에서 칸을 연달아 누르면 저장이 차례로 간다. 첫 저장 요청을 붙잡아 둔 동안 둘째 요청이 뜨지 않는다.
  test("짝 격자 연속 저장 — 앞 저장이 끝난 뒤 다음 칸 저장이 간다", async ({ page }) => {
    await loginAndOpenSettings(page);

    let posts = 0;
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route(
      (url) => url.pathname === "/admin/settings",
      async (route) => {
        const request = route.request();
        if (request.method() !== "POST" || !request.headers()["next-action"]) {
          await route.continue();
          return;
        }
        posts += 1;
        if (posts === 1) await held;
        await route.continue();
      },
    );

    await cell(page, "계좌이체", "세금계산서").check();
    await expect.poll(() => posts).toBe(1);
    await cell(page, "법인카드", "세금계산서").check();

    await page.waitForTimeout(800);
    expect(posts).toBe(1);

    release();
    await expect.poll(() => posts).toBe(2);

    await page.unroute((url) => url.pathname === "/admin/settings");
    await expect(async () => {
      await page.reload();
      await expect(cell(page, "계좌이체", "세금계산서")).toBeChecked();
      await expect(cell(page, "법인카드", "세금계산서")).toBeChecked();
    }).toPass();
  });

  // E-45 실패 경로(06-02 검토 P2-1 · P2-3) — 첫 저장을 붙잡은 채 둘째 칸을 누르고, 첫 저장을 실패로 끝낸다.
  // 다음 저장은 실패한 짝을 싣지 않아야 한다: 다시 열면 둘째 칸만 체크다. 끊김(reject)과 HTTP 500 둘 다.
  for (const failure of ["abort", "500"] as const) {
    test(`짝 격자 연속 저장 — 앞 저장이 실패(${failure})하면 다음 저장은 실패한 짝을 싣지 않는다`, async ({ page }) => {
      await loginAndOpenSettings(page);

      let posts = 0;
      let release: () => void = () => {};
      const held = new Promise<void>((resolve) => {
        release = resolve;
      });
      const matcher = (url: URL) => url.pathname === "/admin/settings";
      await page.route(matcher, async (route) => {
        const request = route.request();
        if (request.method() !== "POST" || !request.headers()["next-action"]) {
          await route.continue();
          return;
        }
        posts += 1;
        if (posts !== 1) {
          await route.continue();
          return;
        }
        await held;
        if (failure === "abort") await route.abort();
        else await route.fulfill({ status: 500, contentType: "text/plain", body: "boom" });
      });

      await cell(page, "계좌이체", "세금계산서").check();
      await expect.poll(() => posts).toBe(1);
      await cell(page, "법인카드", "세금계산서").check();
      release();
      await expect.poll(() => posts).toBe(2);
      await expect(cell(page, "계좌이체", "세금계산서")).not.toBeChecked();

      await page.unroute(matcher);
      await expect(async () => {
        await page.reload();
        await expect(cell(page, "법인카드", "세금계산서")).toBeChecked();
        await expect(cell(page, "계좌이체", "세금계산서")).not.toBeChecked();
      }).toPass();
    });
  }

  // 06-02 검토 P2-2 — 보관된 증빙 종류의 짝은 판정에서 빈 행이 아니다. 격자도 그 짝을 「(보관됨)」 열로 보여 해제할 수 있다.
  test("짝 격자 — 저장된 짝의 보관된 증빙 종류는 「(보관됨)」 열로 보이고 해제하면 사라진다", async ({ page }) => {
    const taxInvoice = and(eq(codeItems.tableKey, "evidence_type"), eq(codeItems.value, "tax_invoice"));
    await db.insert(settingsSimple).values({ key: PAYMENT_METHOD_EVIDENCE_PAIRS.key, value: [{ method: "bank_transfer", evidence: "tax_invoice" }] });
    await db.update(codeItems).set({ active: false }).where(taxInvoice);
    try {
      await loginAndOpenSettings(page);
      const grid = page.getByRole("table", { name: GRID_NAME });
      await expect(grid.getByRole("columnheader", { name: "세금계산서 (보관됨)", exact: true })).toBeVisible();
      const archived = cell(page, "계좌이체", "세금계산서 (보관됨)");
      await expect(archived).toBeChecked();

      await archived.uncheck();
      await expect(async () => {
        await page.reload();
        await expect(page.getByRole("table", { name: GRID_NAME }).getByRole("columnheader", { name: /세금계산서/ })).toHaveCount(0);
        await expect(page.getByRole("table", { name: GRID_NAME }).getByRole("checkbox", { checked: true })).toHaveCount(0);
      }).toPass();
    } finally {
      await db.update(codeItems).set({ active: true }).where(taxInvoice);
    }
  });

});
