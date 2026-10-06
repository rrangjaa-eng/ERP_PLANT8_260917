import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { createCorpCard } from "@/domain/corp-cards";
import { createOrgUnit, createTeam } from "@/domain/org";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { seoulToday } from "@/lib/dates";
import { loginPage, makePerson } from "./leave-org";

// Regression: /design-review(PR #180, 2026-10-06) — PC(≥700) 카드 사용 등록 패널에서 Form.Field 칸이 내용 폭으로 줄었다
// (증빙 종류 select 113px · 통화 · 결제 합계 362px, 패널 본문 432px). 옆 패널 배치는 칸 전폭(SYSTEM §6-3)이다.
test("PC 1280 · 768 카드 사용 등록 패널 — Form.Field 칸(통화 · 결제 합계 · 증빙 종류)이 사용일 칸과 같은 전폭이다", async ({ browser, baseURL }) => {
  const suffix = randomUUID().slice(0, 8);
  const orgUnit = await createOrgUnit(SYSTEM_VIEWER, { name: `E2E폭본부-${suffix}` });
  const team = await createTeam(SYSTEM_VIEWER, { orgUnitId: orgUnit.id, name: `E2E폭팀-${suffix}` });
  const person = await makePerson("폭", DEFAULT_ROLE_ID, team.id, `${seoulToday().slice(0, 4)}-01-01`);
  await createCorpCard(SYSTEM_VIEWER, { issuer: `국민-${suffix}`, numberLast4: "7788", label: `E2E폭카드-${suffix}`, kind: "personal", holderUserId: person.viewer.id });

  for (const width of [1280, 768]) {
    const page = await loginPage(browser, baseURL, person, { width, height: 900 });
    await page.goto("/cards?new=1");
    const sheet = page.getByRole("dialog", { name: "카드 사용 등록" });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByLabel("증빙 종류")).toBeVisible();
    // 패널이 열리며 미끄러져 들어오는 동안 칸마다 따로 재면 x가 어긋난다 — 한 번에 잰다.
    const boxes = await sheet.evaluate((root) =>
      ["#card-usage-used-on", 'select[name="currency"]', "#card-amount", "#card-usage-evidence"].map((selector) => {
        const rect = root.querySelector(selector)?.getBoundingClientRect();
        return { selector, x: rect?.x ?? NaN, width: rect?.width ?? NaN };
      }),
    );
    const [usedOn, ...fields] = boxes;
    if (!usedOn) throw new Error("사용일 칸 상자를 잴 수 없다");
    for (const box of fields) {
      expect(Math.abs(box.width - usedOn.width), `${width}px ${box.selector} 폭 ${box.width} · 사용일 ${usedOn.width}`).toBeLessThanOrEqual(1);
      expect(Math.abs(box.x - usedOn.x), `${width}px ${box.selector} x`).toBeLessThanOrEqual(1);
    }
    await page.context().close();
  }
});
