import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test, expect, type Locator, type Page } from "@playwright/test";
import { createCorpCard } from "@/domain/corp-cards";
import { createCardUsage, precheckCardUsage } from "@/domain/corp-card-usages";
import { createOrgUnit, createTeam } from "@/domain/org";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { seoulToday } from "@/lib/dates";
import { setCorpCardArchived } from "@/repositories/corp-cards";
import { countLines, VIEWPORTS } from "../../scripts/codex-design-review/lib";
import { loginPage, makePerson, waitForHydration, type Person } from "./leave-org";

// 07.1-11 디자인 검토 증거(Codex final F-2 · UI-SPEC :632 4번): Codex 경로 캡처는 erp_test를 비운 뒤 기본 `/cards`만 찍어 보관 카드 · 열린 카드 폼이 없다.
// 이 스펙이 카드 둘(하나는 사용 한 건 뒤 보관)과 사용을 만들고 그 카드 주인으로 세 상태 — ⓐ `/cards`(보관 카드 묶음 머리 · 카드 거르개 옵션)
// ⓑ `/cards?editId=`(보관 카드 사용 수정 패널 `카드` 줄) ⓒ `/cards?new=1`(열린 새 건 폼 줄) — 에 닿은 뒤 폭마다 전체 화면 PNG `state-<이름>-<폭>.png`와
// DOM 표 `measurements-state-<이름>.json`을 DESIGN_CAPTURE_DIR에 남긴다. 단언은 상태에 닿았는지 보는 expect뿐 — 판정은 E2E와 독립 DOM 감사 몫.

const OUT_DIR = process.env.DESIGN_CAPTURE_DIR;
test.skip(!OUT_DIR, "DESIGN_CAPTURE_DIR이 없으면 캡처하지 않는다 — 디자인 검토 증거용(07.1-11)");

type Holder = { person: Person; cardIds: string[] };

// card-usage.spec.ts `makeCardHolder` 꼴 — 카드 주인 · 개인 카드 둘(발급사는 전역 UNIQUE라 접미사).
async function makeHolder(): Promise<Holder> {
  const suffix = randomUUID().slice(0, 8);
  const orgUnit = await createOrgUnit(SYSTEM_VIEWER, { name: `E2E캡처카드본부-${suffix}` });
  const team = await createTeam(SYSTEM_VIEWER, { orgUnitId: orgUnit.id, name: `E2E캡처카드팀-${suffix}` });
  const person = await makePerson("캡처카드", DEFAULT_ROLE_ID, team.id, `${seoulToday().slice(0, 4)}-01-01`);
  const cardIds: string[] = [];
  for (const [index, label] of ["캡처 법인카드", "캡처 옛 법인카드"].entries()) {
    const card = await createCorpCard(SYSTEM_VIEWER, { issuer: `신한-${suffix}`, numberLast4: String(4321 + index), label, kind: "personal", holderUserId: person.viewer.id });
    if (!card.id) throw new Error("카드 id 없음");
    cardIds.push(card.id);
  }
  return { person, cardIds };
}

// card-usage.spec.ts `seedUsage` 꼴 — 본인 등록 · 팀 비용.
async function seedUsage(holder: Holder, cardId: string, amount: number): Promise<string> {
  const input = {
    corpCardId: cardId,
    usedOn: seoulToday(),
    merchantVendorId: null,
    total: { currency: "KRW" as const, amount, fxRate: 1 },
    evidenceTypeCode: "card_receipt",
    linkKind: "team_cost" as const,
    memo: null,
  };
  return (await createCardUsage(holder.person.viewer, input, await precheckCardUsage(holder.person.viewer, input))).id;
}

async function textLines(target: Locator): Promise<number | null> {
  const rects = await target.evaluate((node) => {
    const range = document.createRange();
    range.selectNodeContents(node);
    return [...range.getClientRects()].filter((rect) => rect.width > 0).map((rect): [number, number] => [rect.top, rect.bottom]);
  });
  return countLines(rects);
}

async function measure(page: Page, width: number, surface: Locator, extra: Record<string, unknown>) {
  const doc = await page.evaluate(() => ({ innerWidth: window.innerWidth, scrollWidth: document.documentElement.scrollWidth }));
  const box = await surface.boundingBox();
  const rows = await surface.evaluate((root) =>
    [...root.querySelectorAll("[data-ui='field-row']")].map((row) => ({ label: (row.querySelector("span, label")?.textContent ?? "").trim(), scrollWidth: row.scrollWidth, clientWidth: row.clientWidth })),
  );
  return { width, ...doc, surface: box, fieldRows: rows, ...extra };
}

async function capture(page: Page, name: string, width: number): Promise<void> {
  if (!OUT_DIR) return;
  mkdirSync(OUT_DIR, { recursive: true });
  await page.screenshot({ path: join(OUT_DIR, `state-${name}-${width}.png`), fullPage: true });
}

function save(name: string, rows: unknown[]): void {
  if (!OUT_DIR) return;
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(join(OUT_DIR, `measurements-state-${name}.json`), JSON.stringify(rows, null, 2));
}

test.describe("07.1-11 디자인 검토 증거 캡처", () => {
  test("보관 카드 목록 · 보관 카드 사용 수정 패널 · 열린 새 건 폼을 4폭에서 찍는다", async ({ browser, baseURL }) => {
    const holder = await makeHolder();
    const [activeId = "", archivedId = ""] = holder.cardIds;
    await seedUsage(holder, activeId, 11_000);
    const archivedUsage = await seedUsage(holder, archivedId, 22_000);
    await setCorpCardArchived(SYSTEM_VIEWER, archivedId, true);
    const page = await loginPage(browser, baseURL, holder.person);

    const list: unknown[] = [];
    const edit: unknown[] = [];
    const created: unknown[] = [];
    for (const viewport of VIEWPORTS) {
      await page.setViewportSize(viewport);

      await page.goto("/cards");
      const table = page.getByRole("table");
      await expect(table).toBeVisible();
      const groups = table.locator("tbody tr[class*='groupRow']");
      await expect(groups).toHaveCount(2);
      const options = await page.getByLabel("카드", { exact: true }).locator("option").allTextContents();
      const groupFacts = [];
      for (let index = 0; index < (await groups.count()); index += 1) {
        const cell = groups.nth(index).locator("th, td").first();
        groupFacts.push({ text: (await cell.textContent())?.trim() ?? "", lines: await textLines(cell), scroll: await cell.evaluate((node) => [node.scrollWidth, node.clientWidth]) });
      }
      await capture(page, "archived-list", viewport.width);
      list.push(await measure(page, viewport.width, table, { groups: groupFacts, cardFilterOptions: options }));

      await page.goto(`/cards?editId=${archivedUsage}`);
      const panel = page.getByRole("dialog", { name: "카드 사용 수정" });
      await waitForHydration(panel.getByLabel("결제 합계"));
      const cardRow = panel.locator("[data-ui='field-row']").filter({ hasText: "카드" }).first();
      await capture(page, "archived-edit", viewport.width);
      edit.push(await measure(page, viewport.width, panel, { cardRow: { text: (await cardRow.textContent())?.trim() ?? "", lines: await textLines(cardRow) } }));

      await page.goto("/cards?new=1");
      const sheet = page.getByRole("dialog", { name: "카드 사용 등록" });
      await waitForHydration(sheet.getByLabel("결제 합계"));
      await capture(page, "new-form", viewport.width);
      created.push(await measure(page, viewport.width, sheet, {}));
    }
    save("archived-list", list);
    save("archived-edit", edit);
    save("new-form", created);
    await page.context().close();
  });
});
