import { test, expect, type Page, type Response } from "@playwright/test";
import { createFixtureUser } from "./fixtures";
import { SYSADMIN_ROLE_ID } from "@/domain/permissions/roles";

// 02-VERIFICATION 사람 판정 1(D-32) 해소. "Windows Chrome에서 Pretendard가 렌더되는가"는
// OS 문제가 아니다 — Pretendard는 /fonts/pretendard/의 자체 호스팅 웹폰트라 로드만
// 되면 어느 OS에서든 같은 글꼴로 그린다(맑은 고딕 폴백은 로드 실패 때만 일어난다).
// 그래서 (1) 웹폰트가 실제로 로드됐는지, (2) 첫 로드 woff2 전송량이 D-32 상한(300KB)
// 안인지, (3) tabular-nums가 로드된 글꼴에서 실제로 동작하는지를 브라우저에서 잰다.
// Windows에만 남는 차이는 ClearType 힌팅뿐이고 그것은 설계 계약이 아니다.

const KB = 1024;

async function loginAsAdmin(page: Page): Promise<void> {
  const user = await createFixtureUser({ roleId: SYSADMIN_ROLE_ID });
  await page.goto("/login");
  await page.getByLabel("이메일").fill(user.email);
  await page.getByLabel("비밀번호").fill(user.password);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/account$/);
}

async function fontStatus(page: Page): Promise<{ loaded: boolean; families: string[] }> {
  return page.evaluate(async () => {
    await document.fonts.ready;
    const loaded = [...document.fonts].filter((f) => f.status === "loaded");
    return {
      loaded: document.fonts.check("400 16px 'Pretendard Variable'"),
      families: [...new Set(loaded.map((f) => f.family))],
    };
  });
}

test.describe("Pretendard 웹폰트 (D-32)", () => {
  test("/login → /account → /admin/system-status 첫 로드에서 Pretendard Variable이 로드되고 woff2 합이 300KB 이하다", async ({ page }) => {
    // woff2는 이미 압축 포맷이라 본문 길이가 곧 전송량이다.
    let woff2Bytes = 0;
    const seen = new Set<string>();
    page.on("response", async (response: Response) => {
      const url = response.url();
      if (!url.endsWith(".woff2") || seen.has(url)) return;
      seen.add(url);
      woff2Bytes += (await response.body()).length;
    });

    await loginAsAdmin(page);
    expect((await fontStatus(page)).loaded).toBe(true);

    await page.goto("/admin/system-status");
    const status = await fontStatus(page);
    expect(status.loaded).toBe(true);
    expect(status.families.map((f) => f.replace(/["']/g, ""))).toContain("Pretendard Variable");

    const bodyFamily = await page.locator("body").evaluate((el) => getComputedStyle(el).fontFamily);
    expect(bodyFamily.replace(/["']/g, "")).toMatch(/^Pretendard Variable/);

    expect(woff2Bytes).toBeGreaterThan(0);
    expect(woff2Bytes).toBeLessThanOrEqual(300 * KB);
  });

  test("tabular-nums가 로드된 글꼴에서 실제로 동작한다 — 1과 0의 자릿수 폭이 같다", async ({ page }) => {
    await page.goto("/login");

    const widths = await page.evaluate(async () => {
      await document.fonts.ready;
      const measure = (text: string, numeric: string) => {
        const span = document.createElement("span");
        span.style.fontFamily = "'Pretendard Variable'";
        span.style.fontSize = "16px";
        span.style.fontVariantNumeric = numeric;
        span.style.whiteSpace = "pre";
        span.textContent = text;
        document.body.append(span);
        const width = span.getBoundingClientRect().width;
        span.remove();
        return width;
      };
      return {
        onesTabular: measure("1111111111", "tabular-nums"),
        zerosTabular: measure("0000000000", "tabular-nums"),
        onesProportional: measure("1111111111", "normal"),
        zerosProportional: measure("0000000000", "normal"),
      };
    });

    expect(Math.abs(widths.onesTabular - widths.zerosTabular)).toBeLessThan(0.5);
    // 비교군: 같은 글꼴의 비례 숫자는 1이 0보다 좁다 — 위 등폭이 글꼴 특성이 아니라
    // tnum 기능이 켜져서 나온 결과임을 보인다.
    expect(widths.onesProportional).toBeLessThan(widths.zerosProportional - 0.5);
  });
});
