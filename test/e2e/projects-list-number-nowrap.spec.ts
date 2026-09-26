import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { test, expect } from "@playwright/test";
import { createFixtureUser } from "./fixtures";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { insertVendor } from "@/repositories/vendors";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { db } from "@/db/client";
import { teams, users } from "@/db/schema";
import { createProject } from "@/domain/projects";
import { getCurrentQuoteRevision, saveQuoteLines } from "@/domain/quotes/lines";

async function findUserIdByEmail(email: string): Promise<string> {
  const [row] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (!row) throw new Error(`fixture user ${email}를 찾지 못했습니다`);
  return row.id;
}

// S15 backstop(04-09-PLAN.md must_haves — 「13자리 원화 … 숫자 열 ch
// 고정폭 안에서 줄바꿈하지 않고」) — /projects 견적 열의 13자리 근처 원화
// 값이 375px에서 줄바꿈하지 않는지, 세 폭(1280·1024·375)에서 문서 가로
// 스크롤이 생기지 않는지를 잰다.
test.describe("숫자 열 nowrap — /projects 견적 (S15 backstop)", () => {
  test("375px에서 견적 금액 셀이 한 줄이고, 세 폭에서 가로 오버플로가 없다", async ({ page }) => {
    const marker = `E2Enowrap-${Date.now()}`;
    const vendor = await insertVendor(SYSTEM_VIEWER, {
      name: `${marker}클라이언트`,
      normalizedName: `${marker}클라이언트`.toLowerCase(),
    });
    const pm = await createFixtureUser({ roleId: DEFAULT_ROLE_ID });
    const [team] = await db.select().from(teams).limit(1);
    if (!team) throw new Error("시드된 팀이 없습니다");
    const pmUserId = await findUserIdByEmail(pm.email);
    const project = await createProject(SYSTEM_VIEWER, { clientId: vendor.id, teamId: team.id, pmUserId, name: marker });

    const revision = await getCurrentQuoteRevision(SYSTEM_VIEWER, project.id);
    if (!revision) throw new Error("1차 차수가 없습니다");
    // amount_krw 열은 integer(T-04-160, 21억 상한)라 한 줄로 4.3B를 만들 수
    // 없다 — 합계(SUM)는 bigint라 세 줄로 나눠 목표 합계에 닿는다.
    await saveQuoteLines(SYSTEM_VIEWER, revision.id, { rows: [
      {
        id: randomUUID(), isNew: true, subcategory: "sub-a",
        itemName: "nowrap 확인 줄1",
        quantity: 1,
        unitPrice: { currency: "KRW", amount: 2000000000, fxRate: 1 },
        execution: { currency: "KRW", amount: 0, fxRate: 1 },
      },
      {
        id: randomUUID(), isNew: true, subcategory: "sub-a",
        itemName: "nowrap 확인 줄2",
        quantity: 1,
        unitPrice: { currency: "KRW", amount: 2000000000, fxRate: 1 },
        execution: { currency: "KRW", amount: 0, fxRate: 1 },
      },
      {
        id: randomUUID(), isNew: true, subcategory: "sub-a",
        itemName: "nowrap 확인 줄3",
        quantity: 1,
        unitPrice: { currency: "KRW", amount: 318181799, fxRate: 1 },
        execution: { currency: "KRW", amount: 0, fxRate: 1 },
      },
    ] });

    await page.goto("/login");
    await page.getByLabel("이메일").fill(pm.email);
    await page.getByLabel("비밀번호").fill(pm.password);
    await page.getByRole("button", { name: "로그인" }).click();
    await expect(page).toHaveURL(/\/account$/);

    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto(`/projects?q=${encodeURIComponent(marker)}`);
    const amountCell = page.locator("td").filter({ hasText: "4,318,181,799" }).first();
    await expect(amountCell).toBeVisible();

    const rectCount = await amountCell.evaluate((el) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      return range.getClientRects().length;
    });
    expect(rectCount).toBe(1);

    for (const width of [375, 1024, 1280]) {
      await page.setViewportSize({ width, height: 800 });
      await page.goto(`/projects?q=${encodeURIComponent(marker)}`);
      // 웹폰트가 늦게 바뀌면 자간이 달라져 폭 측정이 흔들린다 — 폰트가
      // 자리 잡은 뒤 잰다(실측: 대기 없이 재면 간헐적으로 어긋났다).
      await page.evaluate(() => document.fonts.ready);
      const { scrollWidth, clientWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(scrollWidth).toBe(clientWidth);
    }
  });
});
