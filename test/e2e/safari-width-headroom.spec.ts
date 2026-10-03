import { test, expect, type Page } from "@playwright/test";
import { loginAsAdmin } from "./people-list-helpers";

// 04.6 사파리 비교(#158) — WebKit은 같은 글꼴을 크롬보다 조금 넓게 그려, 크롬에서 96px에 딱 맞던 TextField 라벨
// (「알림 발송 건수 상한」「차수당 견적 줄 상한」)이 사파리에서만 2줄(높이 25→46)이 됐다. 이 컨테이너엔 WebKit이 없어
// 「라벨 칸이 글자 폭보다 --s-1만큼 넉넉한가 + 입력 칸 x는 그대로인가」를 크롬에서 재 지킨다.
const BORDERLINE_LABELS = ["알림 발송 건수 상한", "차수당 견적 줄 상한"];

async function tokenPx(page: Page, name: string): Promise<number> {
  return page.evaluate((token) => {
    const probe = document.createElement("span");
    probe.style.width = `var(${token})`;
    probe.style.position = "absolute";
    document.body.append(probe);
    const width = probe.getBoundingClientRect().width;
    probe.remove();
    return width;
  }, name);
}

for (const width of [768, 1280]) {
  test(`설정 화면 TextField 라벨 칸은 --label-w보다 --s-1 넉넉하고 입력 칸 x는 그대로다 @${width}`, async ({ page }) => {
    await loginAsAdmin(page);
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/admin/settings");
    const labelW = await tokenPx(page, "--label-w");
    const gap = await tokenPx(page, "--s-2");
    const headroom = await tokenPx(page, "--s-1");

    const rows = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('[data-ui="field-row"]')].flatMap((row) => {
        const label = row.querySelector<HTMLLabelElement>(":scope > label");
        const input = label?.htmlFor ? document.getElementById(label.htmlFor) : null;
        if (!label || !input) return [];
        const labelRect = label.getBoundingClientRect();
        return [
          {
            text: label.textContent ?? "",
            labelWidth: labelRect.width,
            labelHeight: labelRect.height,
            lineHeight: parseFloat(getComputedStyle(label).lineHeight),
            inputOffset: input.getBoundingClientRect().left - row.getBoundingClientRect().left,
          },
        ];
      }),
    );
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.labelWidth, `${row.text} 라벨 칸 폭 = --label-w + --s-1`).toBeGreaterThanOrEqual(labelW + headroom - 1);
      expect(Math.abs(row.inputOffset - (labelW + gap)), `${row.text} 입력 칸은 라벨 열(--label-w) + --s-2 뒤에서 시작`).toBeLessThanOrEqual(1);
    }
    for (const text of BORDERLINE_LABELS) {
      const row = rows.find((candidate) => candidate.text === text);
      expect(row, `${text} 라벨이 설정 화면에 있다`).toBeDefined();
      expect(row!.labelHeight, `${text} 라벨 1줄`).toBeLessThan(row!.lineHeight * 1.5);
    }
  });
}
