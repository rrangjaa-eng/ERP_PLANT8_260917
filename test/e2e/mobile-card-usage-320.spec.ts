import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { corpCardUsages, purchaseRequests, quoteLines } from "@/db/schema";
import { createCorpCard } from "@/domain/corp-cards";
import { createProject } from "@/domain/projects";
import { getCurrentQuoteRevision, saveQuoteLines } from "@/domain/quotes/lines";
import { insertVendor } from "@/repositories/vendors";
import { firstSelectableSubcategory } from "@/test/support/quote-subcategory";
import { createCardUsage, precheckCardUsage, type CardUsageInput } from "@/domain/corp-card-usages";
import { createOrgUnit, createTeam } from "@/domain/org";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { seoulToday } from "@/lib/dates";
import { loginPage, makePerson, waitForHydration, type Person } from "./leave-org";

// 06-05 DOM 감사 D1 · O1 — 폰 카드 사용 목록 · 등록 패널 실측(DOM).
// D1: 320에서 외화 행 2행(`USD 900.00 @1,474.89 · 공급가 1,327,401`)이 한 줄 nowrap이라 문서가 34px 넘쳤다 — 묶음 사이에서만 꺾인다.
// O1: 폰 연결 라디오의 눌림 면이 글자 줄(66×18)뿐이었다 — 라벨이 행 높이 44 이상을 채운다.

async function makeHolder(): Promise<{ person: Person; cardId: string; teamId: string }> {
  const suffix = randomUUID().slice(0, 8);
  const orgUnit = await createOrgUnit(SYSTEM_VIEWER, { name: `E2E폰카드본부-${suffix}` });
  const team = await createTeam(SYSTEM_VIEWER, { orgUnitId: orgUnit.id, name: `E2E폰카드팀-${suffix}` });
  const person = await makePerson("폰카드", DEFAULT_ROLE_ID, team.id, `${seoulToday().slice(0, 4)}-01-01`);
  const card = await createCorpCard(SYSTEM_VIEWER, { issuer: `신한-${suffix}`, numberLast4: "4321", label: `E2E폰카드-${suffix}`, kind: "personal", holderUserId: person.viewer.id });
  if (!card.id) throw new Error("카드 id 없음");
  return { person, cardId: card.id, teamId: team.id };
}

test.describe("폰 카드 사용 (06-05 DOM 감사)", () => {
  test("[D1] 320 — 외화 행 2행은 묶음 사이에서만 꺾이고 문서 가로 넘침 0", async ({ browser, baseURL }) => {
    const { person, cardId } = await makeHolder();
    const input: CardUsageInput = {
      corpCardId: cardId,
      usedOn: seoulToday(),
      merchantVendorId: null,
      total: { currency: "USD", amount: 900, fxRate: 1474.89 },
      // 계산서(규칙 없음) — 공급가 = 결제 합계. `카드 전표`는 #177부터 부가세 10%.
      evidenceTypeCode: "invoice",
      linkKind: "team_cost",
      memo: null,
    };
    await createCardUsage(person.viewer, input, await precheckCardUsage(person.viewer, input));

    const page = await loginPage(browser, baseURL, person, { width: 320, height: 640 });
    await page.goto("/cards");
    const table = page.getByRole("table");
    await expect(table.getByText("1,327,401", { exact: true })).toHaveCount(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
    // 07.1-18 — 주 행 셀 아래 줄(.cellSecondary)은 폰에서 숨고, 같은 글자(`secondaryText`)가 접힌 줄 앞에 한 줄로 선다.
    for (const secondary of await table.locator("[class*='cellSecondary']").all()) await expect(secondary).toBeHidden();
    const folded = table.locator("tr[class*='collapsedRow'] td").first();
    for (const segment of ["USD 900.00", "@1,474.89", "공급가 1,327,401"]) await expect(folded).toContainText(segment);
    // 한 줄 말줄임 감싸개(`-webkit-line-clamp: 1`) 밖으로 잘려 나간 줄의 글자는 보이지 않는다 — 보이는 줄 수와 잘려 나간 글자를 따로 잰다.
    const { tops, hidden } = await folded.evaluate((cell) => {
      const set = new Set<number>();
      const hiddenParts: string[] = [];
      const clip = cell.querySelector("[data-cell-text]")?.getBoundingClientRect();
      const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (!(node.textContent ?? "").trim()) continue;
        const range = document.createRange();
        range.selectNodeContents(node);
        for (const rect of Array.from(range.getClientRects())) {
          if (rect.width <= 1) continue;
          if (clip && rect.top >= clip.bottom - 1) hiddenParts.push(node.textContent ?? "");
          else set.add(Math.round(rect.top / 4));
        }
      }
      return { tops: set.size, hidden: hiddenParts.join("|") };
    });
    for (const segment of ["USD 900.00", "@1,474.89", "공급가 1,327,401"]) expect(hidden, `잘려 나간 글자에 ${segment} 없음`).not.toContain(segment);
    expect(tops, "접힌 줄 글자는 한 줄").toBe(1);
    await page.context().close();
  });

  test("[06-07 DOM 감사 D-1] 320 — 긴 프로젝트 · 항목 이름의 견적 줄 연결 칸은 한 줄 말줄임 + title · 문서 가로 넘침 0", async ({ browser, baseURL }) => {
    const { person, cardId, teamId } = await makeHolder();
    const suffix = randomUUID().slice(0, 8);
    const year = seoulToday().slice(0, 4);
    const client = await insertVendor(SYSTEM_VIEWER, { name: `E2E폰클라이언트-${suffix}`, normalizedName: `e2e폰클라이언트-${suffix}` });
    const projectName = `E2E폰카드연결 아주 긴 프로젝트 이름 가을 브랜드 팝업스토어 운영-${suffix}`;
    const project = await createProject(person.viewer, { clientId: client.id, teamId, pmUserId: person.viewer.id, name: projectName, startDate: `${year}-01-01`, endDate: `${year}-12-31` });
    const revision = await getCurrentQuoteRevision(SYSTEM_VIEWER, project.id);
    if (!revision) throw new Error("1차 차수 없음");
    const itemName = `현장 소모품 및 운영 인력 식대 · 다과 · 음료 일체-${suffix}`;
    await saveQuoteLines(SYSTEM_VIEWER, revision.id, {
      rows: [
        {
          id: randomUUID(),
          isNew: true as const,
          subcategory: (await firstSelectableSubcategory()).value,
          itemName,
          vendorId: null,
          unitPrice: { currency: "KRW" as const, amount: 2_500_000, fxRate: 1 },
          execution: { currency: "KRW" as const, amount: 2_000_000, fxRate: 1 },
        },
      ],
    });
    const [line] = await db.select({ id: quoteLines.id }).from(quoteLines).where(eq(quoteLines.revisionId, revision.id));
    if (!line) throw new Error("견적 줄 없음");
    const input: CardUsageInput = {
      corpCardId: cardId,
      usedOn: seoulToday(),
      merchantVendorId: null,
      total: { currency: "KRW", amount: 30_000, fxRate: 1 },
      evidenceTypeCode: "invoice",
      linkKind: "quote_line",
      lineId: line.id,
      memo: null,
    };
    await createCardUsage(person.viewer, input, await precheckCardUsage(person.viewer, input));

    const page = await loginPage(browser, baseURL, person, { width: 320, height: 640 });
    await page.goto("/cards");
    const label = `${projectName} · 1 ${itemName}`;
    const cell = page.getByRole("table").locator(`[title="${label}"]`);
    await expect(cell).toHaveCount(1);
    await expect(cell).toHaveText(label);
    // 한 줄 — 칸 안에서 말줄임(scrollWidth > clientWidth), 문서는 넘치지 않는다.
    expect(await cell.evaluate((element) => element.getClientRects().length)).toBe(1);
    expect(await cell.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
    await page.context().close();
  });

  test("[O1] 375 — 연결 라디오는 라벨 전체(높이 44 이상)가 눌림 면", async ({ browser, baseURL }) => {
    const { person } = await makeHolder();
    const page = await loginPage(browser, baseURL, person, { width: 375, height: 812 });
    await page.goto("/cards?new=1");
    const radio = page.getByRole("radio", { name: "팀 비용" });
    await waitForHydration(radio);
    const label = page.getByRole("dialog", { name: "카드 사용 등록" }).locator("label", { has: radio });
    // 06-07부터 `팀 비용`은 셋째 라디오라 패널 본문 접힘 아래에 있다 — 화면 안으로 굴린 뒤 잰다(mouse.click은 굴리지 않는다).
    await label.scrollIntoViewIfNeeded();
    const box = await label.boundingBox();
    expect(box).not.toBeNull();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    // 라벨 아래쪽 가장자리 근처를 눌러도 라디오가 켜진다(글자 줄 밖).
    await page.mouse.click((box?.x ?? 0) + 4, (box?.y ?? 0) + (box?.height ?? 0) - 4);
    await expect(radio).toBeChecked();
    await page.context().close();
  });

  // 07.1-11 PE7(W20 정정): 폰 카드 사용 등록 폼 — 줄(`field-row`)마다 자기 상자를 넘지 않고, 키보드 포커스 링이 잘라내는 조상(overflow) 안에 그려진다.
  test("[07.1-11 PE7] 375 · 320 — 등록 폼 줄 넘침 0 · 문서 가로 넘침 0 · 포커스 링이 잘리지 않음", async ({ browser, baseURL }) => {
    const { person } = await makeHolder();
    for (const width of [375, 320]) {
      const page = await loginPage(browser, baseURL, person, { width, height: 800 });
      await page.goto("/cards?new=1");
      const sheet = page.getByRole("dialog", { name: "카드 사용 등록" });
      const usedOn = sheet.getByLabel("사용일");
      await waitForHydration(usedOn);

      const rows = await sheet.evaluate((root) => [...root.querySelectorAll("[data-ui='field-row']")].map((row) => ({ label: (row.querySelector("span, label")?.textContent ?? "").trim(), scroll: [row.scrollWidth, row.clientWidth] })));
      expect(rows.length, `${width}`).toBeGreaterThan(0);
      expect(rows.filter((row) => (row.scroll[0] ?? 0) > (row.scroll[1] ?? 0)), `${width} 줄 넘침`).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), `${width} 문서`).toBe(0);

      // 사용일에서 Tab으로 폼 끝까지 — 포커스된 요소의 외곽선(굵기 + offset)이 가로로 잘라내는 조상 안인가.
      await usedOn.focus();
      const clipped: string[] = [];
      const seen = new Set<string>();
      for (let step = 0; step < 40; step += 1) {
        const fact = await page.evaluate(() => {
          const element = document.activeElement;
          if (!(element instanceof HTMLElement) || !element.closest("dialog, [role='dialog']")) return null;
          const name = `${element.tagName.toLowerCase()}:${element.getAttribute("aria-label") ?? element.id ?? ""}:${(element.textContent ?? "").trim().slice(0, 12)}`;
          const style = getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          if (style.outlineStyle === "none" || rect.width < 2 || rect.height < 2) return { name, cut: null };
          const grow = parseFloat(style.outlineWidth) + parseFloat(style.outlineOffset);
          const ring = { left: rect.left - grow, right: rect.right + grow };
          for (let parent = element.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
            const overflowX = getComputedStyle(parent).overflowX;
            if (overflowX === "visible") continue;
            const box = parent.getBoundingClientRect();
            const left = box.left + parent.clientLeft;
            const right = left + parent.clientWidth;
            if (ring.left < left - 0.5 || ring.right > right + 0.5) return { name, cut: `${parent.className || parent.tagName} ${Math.round(ring.left)}~${Math.round(ring.right)} / ${Math.round(left)}~${Math.round(right)}` };
          }
          return { name, cut: null };
        });
        // 날짜 칸은 Tab이 연 · 월 · 일 사이를 먼저 돈다 — 같은 요소는 한 번만 적고 계속 간다(패널 밖으로 나가면 끝).
        if (fact === null) break;
        if (!seen.has(fact.name) && fact.cut) clipped.push(`${fact.name} ${fact.cut}`);
        seen.add(fact.name);
        await page.keyboard.press("Tab");
      }
      expect(seen.size, `${width} 포커스 이동`).toBeGreaterThan(3);
      expect(clipped, `${width} 포커스 링`).toEqual([]);
      await page.context().close();
    }
  });

  // 07.1-19 PA3(C-43 · E-P2-53 · U-1 option-a): 폰 P1 = 연결 · 결제 합계 · 행동 — `등록`은 P2(접힌 줄 = 사용일 · 가맹점 · 등록).
  // 행 줄 수는 상한으로 잰다(주 행 셀 각 ≤ 1줄 + 접힌 줄 1줄 = ≤ 2). 대리 등록 · 구매 완료 건은 접힌 줄에 행 시트 `등록` 줄과 같은 글자가 있다.
  test("[07.1-19 PA3] 375 · 320 — P1 셋 · 접힌 줄에 등록 값 · 행 ≤ 2줄 · 말줄임 셀 전체 글자 · 대리 · 구매 완료 등록 글자 · 권리 없는 계급 시트에 같은 글자", async ({ browser, baseURL }) => {
    const { person, cardId, teamId } = await makeHolder();
    const suffix = randomUUID().slice(0, 8);
    const year = seoulToday().slice(0, 4);
    const proxyPerson = await makePerson("대리등록", DEFAULT_ROLE_ID, teamId, `${year}-01-01`);
    const client = await insertVendor(SYSTEM_VIEWER, { name: `E2E폰등록클라이언트-${suffix}`, normalizedName: `e2e폰등록클라이언트-${suffix}` });
    const project = await createProject(person.viewer, { clientId: client.id, teamId, pmUserId: person.viewer.id, name: `E2E폰등록 긴 프로젝트 이름 가을 브랜드 팝업스토어 운영-${suffix}`, startDate: `${year}-01-01`, endDate: `${year}-12-31` });
    const revision = await getCurrentQuoteRevision(SYSTEM_VIEWER, project.id);
    if (!revision) throw new Error("1차 차수 없음");
    const itemName = `현장 소모품 및 운영 인력 식대 · 다과 · 음료 일체-${suffix}`;
    await saveQuoteLines(SYSTEM_VIEWER, revision.id, {
      rows: [
        {
          id: randomUUID(),
          isNew: true as const,
          subcategory: (await firstSelectableSubcategory()).value,
          itemName,
          vendorId: null,
          unitPrice: { currency: "KRW" as const, amount: 2_500_000, fxRate: 1 },
          execution: { currency: "KRW" as const, amount: 2_000_000, fxRate: 1 },
        },
      ],
    });
    const [line] = await db.select({ id: quoteLines.id }).from(quoteLines).where(eq(quoteLines.revisionId, revision.id));
    if (!line) throw new Error("견적 줄 없음");
    const longMerchant = `가맹점이름이아주길게이어지는곳-${suffix}-` + "가".repeat(20);

    // ① 본인 등록 — 긴 가맹점(외화 아님).
    const longVendor = await insertVendor(SYSTEM_VIEWER, { name: longMerchant, normalizedName: `${longMerchant}-${randomUUID()}` });
    const own: CardUsageInput = {
      corpCardId: cardId,
      usedOn: seoulToday(),
      merchantVendorId: longVendor.id,
      total: { currency: "KRW", amount: 30_000, fxRate: 1 },
      evidenceTypeCode: "invoice",
      linkKind: "team_cost",
      memo: null,
    };
    await createCardUsage(person.viewer, own, await precheckCardUsage(person.viewer, own));

    // ② 대리 등록(남이 등록 → 이 카드 주인은 권리 없음) — 외화 · 부가세가 있어 접힌 줄 앞이 길다.
    const proxyVendorName = `가맹대리-${suffix}`;
    const proxyVendor = await insertVendor(SYSTEM_VIEWER, { name: proxyVendorName, normalizedName: `${proxyVendorName}-${randomUUID()}` });
    await db.insert(corpCardUsages).values({
      corpCardId: cardId,
      usedOn: seoulToday(),
      merchantVendorId: proxyVendor.id,
      totalCurrency: "USD",
      totalForeignAmount: "900",
      totalFxRate: "1474.89",
      totalAmountKrw: 1_327_401,
      supplyKrw: 1_206_728,
      vatKrw: 120_673,
      evidenceTypeCode: "invoice",
      linkKind: "team_cost",
      quoteLineId: null,
      teamId,
      usedByUserId: person.viewer.id,
      registeredBy: proxyPerson.viewer.id,
      registeredVia: "proxy",
      memo: null,
    });

    // ③ 구매 완료로 생긴 건(남이 등록) — 긴 견적 줄 연결.
    const purchaseNumber = `26001-C${randomUUID().slice(0, 8)}`;
    const [request] = await db
      .insert(purchaseRequests)
      .values({ number: purchaseNumber, linkKind: "quote_line", projectId: project.id, quoteLineId: line.id, requestedBy: proxyPerson.viewer.id, itemName: "현수막", estimateAmountKrw: 40_000 })
      .returning({ id: purchaseRequests.id });
    const purchaseVendorName = `가맹구매-${suffix}`;
    const purchaseVendor = await insertVendor(SYSTEM_VIEWER, { name: purchaseVendorName, normalizedName: `${purchaseVendorName}-${randomUUID()}` });
    await db.insert(corpCardUsages).values({
      corpCardId: cardId,
      usedOn: seoulToday(),
      merchantVendorId: purchaseVendor.id,
      totalCurrency: "KRW",
      totalForeignAmount: null,
      totalFxRate: "1",
      totalAmountKrw: 40_000,
      supplyKrw: 40_000,
      vatKrw: 0,
      evidenceTypeCode: "invoice",
      linkKind: "quote_line",
      quoteLineId: line.id,
      teamId: null,
      usedByUserId: person.viewer.id,
      registeredBy: proxyPerson.viewer.id,
      registeredVia: "purchase",
      purchaseRequestId: request?.id ?? null,
      memo: null,
    });

    for (const width of [375, 320]) {
      const page = await loginPage(browser, baseURL, person, { width, height: 800 });
      await page.goto("/cards");
      const table = page.getByRole("table");
      await expect(table.locator("tbody tr").first()).toBeVisible();

      // 보이는 머리글 = 연결 · 결제 합계 · 행동(머리글 숨김) 셋 — `등록`은 폰에서 접힌다.
      const shown = await table.locator("thead th").evaluateAll((cells) => cells.filter((cell) => getComputedStyle(cell).display !== "none").map((cell) => (cell.textContent ?? "").trim()));
      expect(shown, `${width} 보이는 th`).toEqual(["연결", "결제 합계", "행동"]);

      const facts = await table.evaluate((root, names) => {
        const rows: { name: string; mainCells: number; mainLinesMax: number; foldedLines: number; foldedText: string; foldedTitle: string; linkCellWidth: number; clippedFullText: boolean; foldedRegisteredRight: number; foldedContentRight: number; registeredClipped: boolean; actionWidth: number }[] = [];
        const linesOf = (cell: Element): number => {
          const set = new Set<number>();
          const clipBox = (cell.querySelector("[data-cell-text]") ?? cell).getBoundingClientRect();
          const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT);
          for (let node = walker.nextNode(); node; node = walker.nextNode()) {
            if (!(node.textContent ?? "").trim()) continue;
            const range = document.createRange();
            range.selectNodeContents(node);
            for (const rect of Array.from(range.getClientRects())) {
              if (rect.width <= 1) continue;
              if (rect.top >= clipBox.bottom - 1) continue;
              set.add(Math.round(rect.top / 4));
            }
          }
          return set.size;
        };
        for (const name of names) {
          const folded = [...root.querySelectorAll("tr[class*='collapsedRow']")].find((tr) => (tr.textContent ?? "").includes(name) || (tr.previousElementSibling?.textContent ?? "").includes(name));
          const main = folded?.previousElementSibling;
          if (!folded || !main) continue;
          const cells = [...main.querySelectorAll("td")].filter((cell) => getComputedStyle(cell).display !== "none");
          const dataCells = cells.slice(0, -1);
          const foldedCell = folded.querySelector("td") as HTMLElement;
          const clamp = foldedCell.querySelector("[data-cell-text]") as HTMLElement;
          const clipRight = clamp.getBoundingClientRect().right;
          const spans = [...clamp.querySelectorAll("div > span")];
          const last = spans[spans.length - 1];
          const clipBottom = clamp.getBoundingClientRect().bottom;
          const lastRects = last ? Array.from((() => { const r = document.createRange(); r.selectNodeContents(last); return r.getClientRects(); })()) : [];
          const registeredClipped = lastRects.length > 0 && lastRects.every((rect) => rect.top >= clipBottom - 1);
          const lastRight = last ? Math.max(...Array.from((() => { const r = document.createRange(); r.selectNodeContents(last); return r.getClientRects(); })()).map((rect) => rect.right)) : 0;
          const linkCell = dataCells[0] as HTMLElement;
          const linkText = linkCell.querySelector<HTMLElement>("[title]");
          rows.push({
            name,
            mainCells: cells.length,
            mainLinesMax: Math.max(...dataCells.map(linesOf)),
            foldedLines: linesOf(foldedCell),
            foldedText: (foldedCell.textContent ?? "").replace(/\s+/g, " ").trim(),
            foldedTitle: foldedCell.title,
            linkCellWidth: Math.round(linkCell.getBoundingClientRect().width),
            clippedFullText: linkText ? (linkText.textContent ?? "") === (linkText.getAttribute("title") ?? "") : true,
            foldedRegisteredRight: Math.round(lastRight),
            foldedContentRight: Math.round(clipRight),
            registeredClipped,
            actionWidth: Math.round(cells[cells.length - 1]?.getBoundingClientRect().width ?? 0),
          });
        }
        return rows;
      }, [longMerchant, proxyVendorName, purchaseVendorName]);
      expect(facts.length, `${width} 행 수`).toBe(3);
      for (const fact of facts) {
        expect(fact.mainCells, `${width} ${fact.name} 주 행 보이는 칸(연결 · 합계 · 행동)`).toBe(3);
        expect(fact.mainLinesMax, `${width} ${fact.name} 주 행 셀 줄 수`).toBeLessThanOrEqual(1);
        expect(fact.foldedLines, `${width} ${fact.name} 접힌 줄 줄 수`).toBeLessThanOrEqual(1);
        expect(fact.mainLinesMax + fact.foldedLines, `${width} ${fact.name} 행 줄 수(U-1 option-a ≤ 2)`).toBeLessThanOrEqual(2);
        expect(fact.foldedTitle, `${width} ${fact.name} 접힌 줄 title = 칸 글자`).toBe(fact.foldedText);
        expect(fact.clippedFullText, `${width} ${fact.name} 연결 칸 title = 전체 글자`).toBe(true);
      }
      const byName = (name: string) => facts.find((fact) => fact.name === name);
      // 접힌 줄 글자(textContent — CSS 말줄임은 자르지 않는다): 본인 등록은 이름 · 대리 = 경영관리 등록 · {등록자} {MM-DD} · 구매 완료 = 구매 요청 {번호} · {등록자} {MM-DD}.
      expect(byName(longMerchant)?.foldedText).toContain(person.name);
      expect(byName(proxyVendorName)?.foldedText).toMatch(new RegExp(`경영관리 등록 · ${proxyPerson.name} \\d{2}-\\d{2}`));
      expect(byName(purchaseVendorName)?.foldedText).toMatch(new RegExp(`구매 요청 ${purchaseNumber} · ${proxyPerson.name} \\d{2}-\\d{2}`));
      // 점검표용 실측(잘림 여부 · 두 값 — `등록` 글자 Range 오른쪽 / 칸 내용 오른쪽 · 연결 칸 폭 F-21).
      console.log(`PA3 ${width} ${JSON.stringify(facts.map((fact) => ({ n: fact.name.slice(0, 8), reg: [fact.foldedRegisteredRight, fact.foldedContentRight], clipped: fact.registeredClipped, link: fact.linkCellWidth, action: fact.actionWidth })))}`);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), `${width} 문서 넘침`).toBe(0);

      // 권리 없는 계급(주인 — 남이 등록한 줄): 행을 탭하면 행 시트 `등록` 줄에 같은 글자가 있다(정보가 남는 길).
      for (const [vendorName, expected] of [
        [proxyVendorName, new RegExp(`^경영관리 등록 · ${proxyPerson.name} \\d{2}-\\d{2}$`)],
        [purchaseVendorName, new RegExp(`^구매 요청 ${purchaseNumber} · ${proxyPerson.name} \\d{2}-\\d{2}$`)],
      ] as const) {
        const tap = page.getByRole("row").filter({ hasText: vendorName }).getByRole("button", { name: /상세 보기$/ });
        await waitForHydration(tap);
        await tap.click();
        const sheet = page.getByRole("dialog").filter({ hasText: vendorName });
        await expect(sheet).toBeVisible();
        const registered = sheet.locator("dt", { hasText: /^등록$/ }).locator("xpath=following-sibling::dd[1]");
        await expect(registered).toHaveText(expected);
        await sheet.getByRole("button", { name: "닫기" }).click();
        await expect(sheet).toBeHidden();
      }
      await page.context().close();
    }

    // 700 이상은 `등록` 열이 머리글 · 칸으로 있다(699 이하는 접힌 줄).
    const wide = await loginPage(browser, baseURL, person, { width: 700, height: 800 });
    await wide.goto("/cards");
    await expect(wide.getByRole("table").locator("thead th", { hasText: /^등록$/ })).toBeVisible();
    await wide.context().close();
  });
});
