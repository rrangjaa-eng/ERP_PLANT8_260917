import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, expect, type Locator, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { orgUnits, users } from "@/db/schema";
import { createAccount } from "@/domain/auth/accounts";
import { createCodeItem, setCodeItemActive } from "@/domain/code-tables";
import { createTeamExpenseDraft } from "@/domain/expenses";
import { createOrgUnit, createTeam } from "@/domain/org";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { seoulToday } from "@/lib/dates";
import { countLines, VIEWPORTS } from "../../scripts/codex-design-review/lib";
import { loginAsAdmin } from "./people-list-helpers";
import { loginPage, makePerson, waitForHydration } from "./leave-org";

// 07.1-14 디자인 검토 증거(최종 검토 F4): Codex 경로 캡처는 화면을 열자마자 찍어 팀을 비운 등록 패널 · 팀 없는 사람 상세 · 보관 본부 사람 상세 ·
// 꺼진 코드가 저장된 지출결의 상세에 닿지 못한다. 이 스펙이 그 상태에 닿은 뒤 폭마다(375 · 320 · 768 · 1280) 전체 화면 PNG `state-<이름>-<폭>.png`와
// DOM 표 `measurements-state-<이름>.json`(그 표면이 없으면 `absent: true`)을 DESIGN_CAPTURE_DIR에 남긴다. 단언은 상태에 닿았는지 보는 expect뿐이다.
// origin/main에도 있는 도우미 · 선택자만 쓴다(main 작업 나무에 그대로 복사해 돌린다 — main에는 본부 쓰기 길이 없어 본부 값은 db로 직접 넣는다).

const OUT_DIR = process.env.DESIGN_CAPTURE_DIR;
test.skip(!OUT_DIR, "DESIGN_CAPTURE_DIR이 없으면 캡처하지 않는다 — 디자인 검토 증거용(07.1-14)");

type Surface = { absent: true } | { absent: false; box: { x: number; y: number; width: number; height: number }; labelLines: number | null };

async function measureState(page: Page, width: number, surface: Locator) {
  const page_ = await page.evaluate(() => ({ innerWidth: window.innerWidth, innerHeight: window.innerHeight, scrollWidth: document.documentElement.scrollWidth }));
  let found: Surface = { absent: true };
  if ((await surface.count()) > 0 && (await surface.first().isVisible())) {
    const box = await surface.first().boundingBox();
    const rects = await surface.first().evaluate((node) => {
      const label = node.id ? document.querySelector(`label[for="${node.id}"]`) : null;
      if (!label) return [];
      const range = document.createRange();
      range.selectNodeContents(label);
      return [...range.getClientRects()].filter((rect) => rect.width > 0).map((rect): [number, number] => [rect.top, rect.bottom]);
    });
    found = box ? { absent: false, box, labelLines: countLines(rects) } : { absent: true };
  }
  return { width, ...page_, surface: found, fieldGaps: await fieldGaps(page.locator("dialog form")) };
}

// Codex 지적(등록 패널 팀 → 본부 간격) 판정용: 패널 폼의 보이는 라벨 차례대로 「앞 칸 입력 아래 → 다음 칸 라벨 상자 위」 세로 간격(px).
// main · 이 브랜치를 같은 잣대로 견주려고 라벨 상자(getBoundingClientRect)를 쓴다 — 글자 윤곽이 아니다.
async function fieldGaps(form: Locator) {
  if ((await form.count()) === 0) return [];
  return form.first().evaluate((node) => {
    const rows = [...node.querySelectorAll("label[for]")]
      .filter((label) => label.getBoundingClientRect().height > 0)
      .map((label) => {
        const id = label.getAttribute("for") ?? "";
        const control = document.getElementById(id);
        return { id, labelTop: label.getBoundingClientRect().top, controlBottom: control ? control.getBoundingClientRect().bottom : null };
      });
    return rows.slice(1).flatMap((row, index) => {
      const prev = rows[index];
      if (!prev) return [];
      return [{ from: prev.id, to: row.id, gap: prev.controlBottom === null ? null : Math.round(row.labelTop - prev.controlBottom) }];
    });
  });
}

async function captureAll(page: Page, name: string, open: () => Promise<void>, surfaceOf: (page: Page) => Locator): Promise<void> {
  if (!OUT_DIR) return;
  mkdirSync(OUT_DIR, { recursive: true });
  const rows: unknown[] = [];
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    await open();
    await page.screenshot({ path: join(OUT_DIR, `state-${name}-${viewport.width}.png`), fullPage: true });
    rows.push(await measureState(page, viewport.width, surfaceOf(page)));
  }
  writeFileSync(join(OUT_DIR, `measurements-state-${name}.json`), JSON.stringify(rows, null, 2));
}

test.describe("07.1-14 디자인 검토 증거 캡처", () => {
  test("사람 등록 패널(팀 비움) · 팀 없는 사람 상세 · 보관 본부 사람 상세를 4폭에서 찍는다", async ({ page }) => {
    test.setTimeout(300_000);
    await loginAsAdmin(page);
    const suffix = randomUUID().slice(0, 6);
    await createOrgUnit(SYSTEM_VIEWER, { name: `캡처본부-${suffix}` });
    const archived = await createOrgUnit(SYSTEM_VIEWER, { name: `캡처옛본부-${suffix}` });
    const teamless = await createAccount(SYSTEM_VIEWER, { email: `e2e-capture-teamless-${suffix}@example.test`, name: "캡처팀없음", roleId: DEFAULT_ROLE_ID });
    const withArchived = await createAccount(SYSTEM_VIEWER, { email: `e2e-capture-archived-${suffix}@example.test`, name: "캡처보관본부", roleId: DEFAULT_ROLE_ID });
    await db.update(users).set({ divisionId: archived.id }).where(eq(users.id, withArchived.userId));
    await db.update(orgUnits).set({ archivedAt: new Date() }).where(eq(orgUnits.id, archived.id));

    await captureAll(
      page,
      "register-teamless",
      async () => {
        await page.goto("/admin/people?new=1");
        await expect(page.locator("#teamId")).toHaveValue("");
      },
      (p) => p.locator("#divisionId"),
    );
    for (const [name, userId] of [["detail-teamless", teamless.userId], ["detail-archived-division", withArchived.userId]] as const) {
      await captureAll(
        page,
        name,
        async () => {
          await page.goto(`/admin/people/${userId}`);
          await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        },
        (p) => p.locator("#person-division"),
      );
    }
  });

  test("꺼진 증빙 종류 · 지급 방식이 저장된 작성 중 지출결의 상세를 4폭에서 찍는다", async ({ browser, baseURL }) => {
    test.setTimeout(300_000);
    const suffix = randomUUID().slice(0, 6);
    const orgUnit = await createOrgUnit(SYSTEM_VIEWER, { name: `캡처지출본부-${suffix}` });
    const team = await createTeam(SYSTEM_VIEWER, { orgUnitId: orgUnit.id, name: `캡처지출팀-${suffix}` });
    const pm = await makePerson("캡처지출", DEFAULT_ROLE_ID, team.id, `${seoulToday().slice(0, 4)}-01-01`);
    const evidence = await createCodeItem(SYSTEM_VIEWER, { tableKey: "evidence_type", value: `e2e_cap_ev_${suffix}`, label: `캡처 끈 증빙-${suffix}` });
    const payment = await createCodeItem(SYSTEM_VIEWER, { tableKey: "payment_method", value: `e2e_cap_pm_${suffix}`, label: `캡처 끈 지급-${suffix}` });
    let expenseId: string;
    try {
      ({ expenseId } = await createTeamExpenseDraft(pm.viewer, {
        idempotencyKey: randomUUID(),
        fields: {
          teamExpenseKind: "team_overhead",
          content: "캡처",
          note: "캡처",
          evidenceType: evidence.value,
          paymentMethod: payment.value,
          supply: { currency: "KRW", amount: 10_000, fxRate: 1 },
        },
      }));
    } finally {
      await setCodeItemActive(SYSTEM_VIEWER, evidence.id, false);
      await setCodeItemActive(SYSTEM_VIEWER, payment.id, false);
    }
    const page = await loginPage(browser, baseURL, pm);
    await captureAll(
      page,
      "expense-inactive-codes",
      async () => {
        await page.goto(`/expenses/${expenseId}`);
        await waitForHydration(page.getByRole("button", { name: /^임시 저장/ }));
        await expect(page.locator("#evidenceType")).toHaveValue(evidence.value);
      },
      (p) => p.locator("#evidenceType"),
    );
    await page.context().close();
  });
});
