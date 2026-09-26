import { test, expect, type Page, type Route } from "@playwright/test";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { certEvents } from "@/db/schema";
import { SYSADMIN_ROLE_ID } from "@/domain/permissions/roles";
import { createCertEvent } from "./helpers/cert";
import { createFixtureUser } from "./fixtures";

test.use({ viewport: { width: 375, height: 800 } });

// 04.3-03 Review fixes — 독립 DOM 감사(F1~F6) · Opus 독립 검토(M1) 회귀.
// 크기 · 색은 계산 스타일로만 판정한다. 내부 ERP 화면 값이 바뀌지 않았음도 같이 잰다.

const DANGER = "rgb(155, 28, 28)";
const FOCUS = "rgb(0, 84, 70)";

function last4Field(page: Page) {
  return page.getByLabel("전화번호 뒤 4자리");
}

function confirmButton(page: Page) {
  return page.getByRole("button", { name: /^전화번호 확인/ });
}

async function css(page: Page, selector: string, prop: string): Promise<string> {
  return page.locator(selector).first().evaluate((el, p) => getComputedStyle(el).getPropertyValue(p), prop);
}

// 서버 액션 POST 하나를 붙잡는다 — release()를 부를 때까지 서버로 보내지 않는다.
async function holdPost(page: Page, url: string, match: (body: string) => boolean) {
  let release: () => void = () => undefined;
  const gate = new Promise<void>((r) => {
    release = r;
  });
  let held = false;
  await page.route(url, async (route: Route) => {
    const body = route.request().postData() ?? "";
    if (!held && route.request().method() === "POST" && match(body)) {
      held = true;
      await gate;
    }
    await route.continue();
  });
  return { release: () => release() };
}

async function oneWinner(name: string) {
  return createCertEvent({ name, winners: [{ name: "김하늘", phone: "010-4821-7730" }] });
}

test("F1 — 외부 1차 「전화번호 확인」은 폰 · PC 모두 높이 48 · 글자 15px, 내부 1차(로그인)는 그대로", async ({ page }) => {
  const ev = await oneWinner("E2E리뷰F1");
  await page.goto(ev.link);
  await page.getByRole("button", { name: "김*늘" }).click();
  await expect(last4Field(page)).toBeVisible();
  const primary = "#cert-verify-primary";
  expect(await css(page, primary, "height")).toBe("48px");
  expect(await css(page, primary, "font-size")).toBe("15px");
  await page.setViewportSize({ width: 1280, height: 800 });
  expect(await css(page, primary, "height")).toBe("48px");
  expect(await css(page, primary, "font-size")).toBe("15px");

  await page.goto("/login");
  const login = 'button[type="submit"]';
  expect(await css(page, login, "height")).toBe("32px");
  expect(await css(page, login, "font-size")).toBe("12px");
  await page.setViewportSize({ width: 375, height: 800 });
  expect(await css(page, login, "height")).toBe("40px");
  expect(await css(page, login, "font-size")).toBe("12px");
});

test("F2 · F3 — 틀림 직후(포커스가 칸에 있음) 칸 테두리 --danger · 포커스 링 유지 · 칸 오류 15px", async ({ page }) => {
  const ev = await oneWinner("E2E리뷰F2");
  await page.goto(ev.link);
  await page.getByRole("button", { name: "김*늘" }).click();
  await last4Field(page).fill("0000");
  await confirmButton(page).click();
  const wrongLine = page.getByText("전화번호 뒤 4자리가 맞지 않습니다 · 다시 적어 주세요 · 남은 횟수 4번");
  await expect(wrongLine).toBeVisible();
  await expect(last4Field(page)).toBeFocused();
  await expect(last4Field(page)).toHaveCSS("border-top-color", DANGER);
  await expect(last4Field(page)).toHaveCSS("outline-color", FOCUS);
  await expect(last4Field(page)).toHaveCSS("outline-style", "solid");
  await expect(wrongLine).toHaveCSS("font-size", "15px");
});

test("F2 · F3 — 내부 칸(설정 · 쉼표 칸) 오류는 포커스 중에도 --danger 테두리 · 글자 12px · 높이 그대로", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const admin = await createFixtureUser({ roleId: SYSADMIN_ROLE_ID });
  await page.goto("/login");
  await page.getByLabel("이메일").fill(admin.email);
  await page.getByLabel("비밀번호").fill(admin.password);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/account$/);
  await page.goto("/admin/settings");
  const field = page.getByLabel("USD 최근 환율");
  // 통째 입력(붙여넣기 · 자동완성 꼴)이 자리 수를 넘으면 칸 오류가 나고 값은 그대로다.
  await field.fill("1.12345");
  const error = page.getByText("환율은 소수 4자리까지", { exact: true });
  await expect(error).toBeVisible();
  await expect(field).toBeFocused();
  await expect(field).toHaveCSS("border-top-color", DANGER);
  await expect(field).toHaveCSS("outline-color", FOCUS);
  await expect(error).toHaveCSS("font-size", "12px");
  await expect(field).toHaveCSS("height", "32px");
  // 오류를 지우면 내부 칸의 포커스 테두리는 원래 값(--line-ui)으로 돌아온다.
  await page.keyboard.press("End");
  await page.keyboard.press("Backspace");
  await expect(error).toHaveCount(0);
  await expect(field).not.toHaveCSS("border-top-color", DANGER);
  await page.keyboard.type("0");
});

test("F4 — 이름 행 누름 대기 중 … 뒤에 .sr-only 「처리 중」", async ({ page }) => {
  const ev = await oneWinner("E2E리뷰F4");
  await page.goto(ev.link);
  const hold = await holdPost(page, ev.link, (body) => !body.includes('"last4"'));
  const row = page.getByRole("button", { name: /^김\*늘/ });
  await row.click();
  await expect(row.locator(".sr-only")).toHaveText("처리 중");
  await expect(row.locator('[aria-hidden="true"]')).toHaveText("…");
  hold.release();
  await expect(last4Field(page)).toBeVisible();
});

test("F5 — 확인 대기 중 3차 「다른 이름 고르기」는 aria-disabled", async ({ page }) => {
  const ev = await oneWinner("E2E리뷰F5");
  await page.goto(ev.link);
  await page.getByRole("button", { name: "김*늘" }).click();
  await last4Field(page).fill("0000");
  const hold = await holdPost(page, ev.link, (body) => body.includes('"last4"'));
  await confirmButton(page).click();
  const other = page.getByRole("button", { name: "다른 이름 고르기" });
  await expect(other).toHaveAttribute("aria-disabled", "true");
  hold.release();
  await expect(page.getByText(/남은 횟수 4번/)).toBeVisible();
  await expect(other).not.toHaveAttribute("aria-disabled", "true");
});

test("M1 — 확인 응답을 붙잡은 채 브라우저 뒤로 → 응답이 와도 E2 유지 · 기록 항목 그대로 · 앱 안", async ({ page }) => {
  const ev = await oneWinner("E2E리뷰M1");
  await page.goto(ev.link);
  await page.getByRole("button", { name: "김*늘" }).click();
  // 맞는 4자리 — 응답이 그려지면 E4로 넘어가며 기록 항목을 form으로 덮는다(고치기 전 결함).
  await last4Field(page).fill("7730");
  const hold = await holdPost(page, ev.link, (body) => body.includes('"last4"'));
  const response = page.waitForResponse((r) => r.request().method() === "POST" && (r.request().postData() ?? "").includes('"last4"'));
  await confirmButton(page).click();
  await page.goBack();
  await expect(page.getByText(/^이름을 골라 주세요/)).toBeVisible();
  const stateBefore = await page.evaluate(() => JSON.stringify(history.state));
  const lengthBefore = await page.evaluate(() => history.length);

  hold.release();
  await response;
  // 응답 처리(렌더 · 기록 교체)가 끝날 틈을 준다.
  await page.waitForTimeout(500);

  await expect(page.getByText(/^이름을 골라 주세요/)).toBeVisible();
  await expect(last4Field(page)).toHaveCount(0);
  await expect(page.locator("#cert-prize")).toHaveCount(0);
  await expect(page).toHaveTitle("이름 고르기 · 기타소득 지급 확인");
  expect(await page.evaluate(() => JSON.stringify(history.state))).toBe(stateBefore);
  expect(await page.evaluate(() => history.length)).toBe(lengthBefore);
  expect(page.url()).toBe(ev.link);
});

test("F6 — 닫힌 링크 첫 진입 제목은 「링크 닫힘 · 기타소득 지급 확인」", async ({ page }) => {
  const ev = await oneWinner("E2E리뷰F6");
  await db.update(certEvents).set({ closedAt: new Date(), closedReason: "manual" }).where(eq(certEvents.id, ev.eventId));
  await page.goto(ev.link);
  await expect(page.getByText("이 링크는 닫혔습니다")).toBeVisible();
  await expect(page).toHaveTitle("링크 닫힘 · 기타소득 지급 확인");
});
