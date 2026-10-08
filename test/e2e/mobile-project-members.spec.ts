import { test, expect, type Locator, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { projects } from "@/db/schema";
import { waitForCardUsageSection } from "./fixtures";
import { loginPage, type Person } from "./leave-org";
import { makeCandidates, makeLastCandidateProject, setupMembersE2E } from "./project-members-fixture";

// 06.2-12(UI-SPEC S4 · S2 폰): 폰 「더보기」 안 `참여자 더하기` 자식 · 표 아래 3차(참여자 0) · 768 · 1280 숨김 · 거부 뒤 머리 자식 · 마지막 후보 · 50/51 상한.
// 미리 만드는 세계는 project-members-fixture.ts(도메인 함수).

function membersSection(page: Page): Locator {
  return page.locator("section").filter({ has: page.getByRole("heading", { name: "참여자", exact: true }) });
}

function memberRow(page: Page, person: Person): Locator {
  return membersSection(page).getByRole("row").filter({ hasText: person.name });
}

async function openDetail(
  browser: import("@playwright/test").Browser,
  baseURL: string | undefined,
  projectId: string,
  viewer: Person,
  viewport: { width: number; height: number },
): Promise<Page> {
  const page = await loginPage(browser, baseURL, viewer, viewport);
  await page.goto(`/projects/${projectId}`);
  await waitForCardUsageSection(page);
  return page;
}

function moreToggle(page: Page): Locator {
  return page.getByRole("button", { name: "더보기", exact: true });
}

// 펼침 묶음 안의 `참여자 더하기`(표 아래 3차와 구별) — 토글의 aria-controls가 가리키는 상자 안.
async function headerAdd(page: Page): Promise<Locator> {
  const groupId = await moreToggle(page).getAttribute("aria-controls");
  return page.locator(`[id="${groupId ?? ""}"]`).getByRole("button", { name: "참여자 더하기" });
}

async function expandMore(page: Page): Promise<void> {
  const toggle = moreToggle(page);
  if ((await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
}

async function hasNoHorizontalOverflow(page: Page): Promise<boolean> {
  return page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
}

const PHONE = { width: 375, height: 800 };

test.describe("폰 375 — 「더보기」 안 `참여자 더하기`(S4)", () => {
  test("팀장: `더보기` → 펼친 줄의 `참여자 더하기`(44 이상) → 시트로 한 명 더하면 표에 행 · 포커스는 `더보기` 토글 · Esc로 닫아도 토글", async ({ browser, baseURL }) => {
    const fx = await setupMembersE2E();
    const c1 = fx.candidates[0];
    const page = await openDetail(browser, baseURL, fx.projectId, fx.lead, PHONE);
    await expandMore(page);
    const add = await headerAdd(page);
    const box = await add.boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(44);
    expect(box?.width).toBeGreaterThanOrEqual(44);
    await add.click();
    const dialog = page.getByRole("dialog", { name: "참여자 더하기" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("textbox", { name: "사람 검색" }).fill(fx.candidatePrefix);
    await dialog.getByRole("option", { name: new RegExp(c1.name) }).click();
    await dialog.getByRole("button", { name: /^참여자 더하기 1/ }).click();
    await expect(dialog).toBeHidden();
    await expect(memberRow(page, c1)).toBeVisible();
    await expect(moreToggle(page)).toBeFocused();
    await add.click();
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(moreToggle(page)).toBeFocused();
    await page.context().close();
  });

  test("참여자 0(담당 PM 행만) · 권리 있음: 표 아래 3차가 보이고(높이 44 이상) 펼침은 접혀 같은 행동이 한 곳 → 한 명 더하면 3차가 숨고 포커스는 `더보기` 토글", async ({ browser, baseURL }) => {
    const fx = await setupMembersE2E();
    const c1 = fx.candidates[0];
    const page = await openDetail(browser, baseURL, fx.emptyProjectId, fx.lead, PHONE);
    const tertiary = membersSection(page).getByRole("button", { name: "참여자 더하기" });
    await expect(tertiary).toBeVisible();
    expect((await tertiary.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    await expect(moreToggle(page)).toHaveAttribute("aria-expanded", "false");
    await expect(page.getByRole("button", { name: "참여자 더하기" })).toHaveCount(1);
    await tertiary.click();
    const dialog = page.getByRole("dialog", { name: "참여자 더하기" });
    await dialog.getByRole("textbox", { name: "사람 검색" }).fill(fx.candidatePrefix);
    await dialog.getByRole("option", { name: new RegExp(c1.name) }).click();
    await page.keyboard.press("Enter");
    await expect(dialog).toBeHidden();
    await expect(memberRow(page, c1)).toBeVisible();
    await expect(tertiary).toBeHidden();
    await expect(moreToggle(page)).toBeFocused();
    await page.context().close();
  });

  test("권리 없음(참여자 본인) · 완료 프로젝트: 펼친 줄에 `참여자 더하기`가 없다(다른 자식도 없으면 `더보기` 자체가 없다)", async ({ browser, baseURL }) => {
    const fx = await setupMembersE2E();
    const own = await openDetail(browser, baseURL, fx.projectId, fx.z, PHONE);
    if ((await moreToggle(own).count()) > 0) {
      await expandMore(own);
      await expect(own.getByRole("button", { name: "참여자 더하기" })).toHaveCount(0);
    }
    await own.context().close();

    await db.update(projects).set({ status: "completed" }).where(eq(projects.id, fx.projectId));
    const locked = await openDetail(browser, baseURL, fx.projectId, fx.lead, PHONE);
    if ((await moreToggle(locked).count()) > 0) {
      await expandMore(locked);
      await expect(locked.getByRole("button", { name: "참여자 더하기" })).toHaveCount(0);
    }
    await locked.context().close();
  });

  test("서버 거부 뒤(R2-I4): 연 뒤 완료로 바뀌고 Z `떼기`가 거부되면 화면을 다시 열지 않고도 `더보기`에 `참여자 더하기`가 없다", async ({ browser, baseURL }) => {
    const fx = await setupMembersE2E();
    const page = await openDetail(browser, baseURL, fx.projectId, fx.lead, PHONE);
    await expandMore(page);
    await expect(await headerAdd(page)).toBeVisible();
    await db.update(projects).set({ status: "completed" }).where(eq(projects.id, fx.projectId));
    await memberRow(page, fx.z).getByRole("button", { name: /떼기/ }).click();
    await expect(membersSection(page).getByRole("status")).toContainText("완료 프로젝트 · 참여자 잠김");
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("button", { name: "참여자 더하기" })).toHaveCount(0);
    await page.context().close();
  });

  test("마지막 후보(R2-I5): `더보기` → `참여자 더하기` → L 더하면 표에 L · 포커스는 토글 · 다시 열면 `참여자 더하기` 없음(revalidatePath가 머리 자식을 다시 그림)", async ({ browser, baseURL }) => {
    const last = await makeLastCandidateProject();
    const page = await openDetail(browser, baseURL, last.projectId, last.lead, PHONE);
    await expandMore(page);
    await (await headerAdd(page)).click();
    const dialog = page.getByRole("dialog", { name: "참여자 더하기" });
    await expect(dialog.getByRole("option")).toHaveCount(1);
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Space");
    await page.keyboard.press("Enter");
    await expect(dialog).toBeHidden();
    await expect(memberRow(page, last.l)).toBeVisible();
    await expect(moreToggle(page)).toBeFocused();
    await expect(page.getByRole("button", { name: "참여자 더하기" })).toHaveCount(0);
    await page.context().close();
  });
});

test.describe("768 · 1280 — PC 셸", () => {
  test("768: 머리 줄 `참여자 더하기` 숨김 · 표 아래 3차 보임 · 가로 넘침 0", async ({ browser, baseURL }) => {
    const fx = await setupMembersE2E();
    const page = await openDetail(browser, baseURL, fx.projectId, fx.lead, { width: 768, height: 1024 });
    await expect(moreToggle(page)).toBeHidden();
    await expect(membersSection(page).getByRole("button", { name: "참여자 더하기" })).toBeVisible();
    await expect(page.getByRole("button", { name: "참여자 더하기" })).toHaveCount(1);
    expect(await hasNoHorizontalOverflow(page)).toBe(true);
    await page.context().close();
  });

  test("1280: 머리 줄에 `참여자 더하기`가 보이지 않고 머리 버튼 사이 간격이 모두 같다(빈 상자 · 간격 없음)", async ({ browser, baseURL }) => {
    const fx = await setupMembersE2E();
    const page = await openDetail(browser, baseURL, fx.projectId, fx.lead, { width: 1280, height: 900 });
    const copyLink = page.getByRole("link", { name: "프로젝트 복사" });
    await expect(copyLink).toBeVisible();
    const actions = copyLink.locator("xpath=../..");
    const slot = actions.locator("button, a").filter({ hasText: "참여자 더하기" });
    await expect(slot).toBeHidden();
    const boxes = (await actions.locator("button:visible, a:visible").evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect().toJSON() as { x: number; width: number; y: number })))
      .filter((box) => box.width > 0)
      .sort((a, b) => a.x - b.x);
    const gaps = boxes.slice(1).map((box, index) => Math.round(box.x - (boxes[index]!.x + boxes[index]!.width)));
    for (const gap of gaps) expect(Math.abs(gap - (gaps[0] ?? 0))).toBeLessThanOrEqual(1);
    await page.context().close();
  });
});

test.describe("후보 상한(backstop) — 같은 접두 후보 50명 · 51명", () => {
  test("50명이면 50행 · 상한 줄 없음", async ({ browser, baseURL }) => {
    test.setTimeout(120_000);
    const fx = await setupMembersE2E();
    const prefix = `상한50${fx.candidatePrefix}`;
    await makeCandidates(fx, prefix, 50);
    const page = await openDetail(browser, baseURL, fx.emptyProjectId, fx.lead, { width: 1280, height: 900 });
    await membersSection(page).getByRole("button", { name: "참여자 더하기" }).click();
    const dialog = page.getByRole("dialog", { name: "참여자 더하기" });
    await dialog.getByRole("textbox", { name: "사람 검색" }).fill(prefix);
    await expect(dialog.getByRole("option")).toHaveCount(50);
    await expect(dialog.getByText("50건 넘음 · 검색으로 좁히기")).toHaveCount(0);
    await page.context().close();
  });

  test("51명이면 50행 + `50건 넘음 · 검색으로 좁히기`", async ({ browser, baseURL }) => {
    test.setTimeout(120_000);
    const fx = await setupMembersE2E();
    const prefix = `상한51${fx.candidatePrefix}`;
    await makeCandidates(fx, prefix, 51);
    const page = await openDetail(browser, baseURL, fx.emptyProjectId, fx.lead, { width: 1280, height: 900 });
    await membersSection(page).getByRole("button", { name: "참여자 더하기" }).click();
    const dialog = page.getByRole("dialog", { name: "참여자 더하기" });
    await dialog.getByRole("textbox", { name: "사람 검색" }).fill(prefix);
    await expect(dialog.getByRole("option")).toHaveCount(50);
    await expect(dialog.getByText("50건 넘음 · 검색으로 좁히기")).toBeVisible();
    await page.context().close();
  });
});
