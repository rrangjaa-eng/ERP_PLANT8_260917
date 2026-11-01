import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { corpCardUsages, purchaseRequests, quoteLines } from "@/db/schema";
import { createCorpCard } from "@/domain/corp-cards";
import { createProject } from "@/domain/projects";
import { getCurrentQuoteRevision, saveQuoteLines } from "@/domain/quotes/lines";
import { insertVendor } from "@/repositories/vendors";
import { firstSelectableSubcategory } from "@/test/support/quote-subcategory";
import { createCardUsage, precheckCardUsage, type CardUsageInput } from "@/domain/corp-card-usages";
import { createOrgUnit, createTeam } from "@/domain/org";
import { DEFAULT_ROLE_ID, SYSADMIN_ROLE_ID } from "@/domain/permissions/roles";
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

  // 07.1-19 PA3(C-43 · E-P2-53 · U-1 option-a): 폰 P1 = 연결 · 결제 합계(07.1-20: 행동 열은 폰에서 숨는다) — `등록`은 P2(접힌 줄 = 사용일 · 가맹점 · 등록).
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

      // 보이는 머리글 = 연결 · 결제 합계 둘 — `등록`은 폰에서 접히고 행동 열은 폰에서 숨는다(07.1-20).
      const shown = await table.locator("thead th").evaluateAll((cells) => cells.filter((cell) => getComputedStyle(cell).display !== "none").map((cell) => (cell.textContent ?? "").trim()));
      expect(shown, `${width} 보이는 th`).toEqual(["연결", "결제 합계"]);

      const facts = await table.evaluate((root, names) => {
        const rows: { name: string; mainCells: number; mainLinesMax: number; foldedLines: number; foldedText: string; foldedTitle: string; linkCellWidth: number; clippedFullText: boolean; foldedRegisteredRight: number; foldedContentRight: number; registeredClipped: boolean }[] = [];
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
          const foldedCell = folded.querySelector("td") as HTMLElement;
          const clamp = foldedCell.querySelector("[data-cell-text]") as HTMLElement;
          const clipRight = clamp.getBoundingClientRect().right;
          const spans = [...clamp.querySelectorAll("div > span")];
          const last = spans[spans.length - 1];
          const clipBottom = clamp.getBoundingClientRect().bottom;
          const lastRects = last ? Array.from((() => { const r = document.createRange(); r.selectNodeContents(last); return r.getClientRects(); })()) : [];
          const registeredClipped = lastRects.length > 0 && lastRects.every((rect) => rect.top >= clipBottom - 1);
          const lastRight = last ? Math.max(...Array.from((() => { const r = document.createRange(); r.selectNodeContents(last); return r.getClientRects(); })()).map((rect) => rect.right)) : 0;
          const linkCell = cells[0] as HTMLElement;
          const linkText = linkCell.querySelector<HTMLElement>("[title]");
          rows.push({
            name,
            mainCells: cells.length,
            mainLinesMax: Math.max(...cells.map(linesOf)),
            foldedLines: linesOf(foldedCell),
            foldedText: (foldedCell.textContent ?? "").replace(/\s+/g, " ").trim(),
            foldedTitle: foldedCell.title,
            linkCellWidth: Math.round(linkCell.getBoundingClientRect().width),
            clippedFullText: linkText ? (linkText.textContent ?? "") === (linkText.getAttribute("title") ?? "") : true,
            foldedRegisteredRight: Math.round(lastRight),
            foldedContentRight: Math.round(clipRight),
            registeredClipped,
          });
        }
        return rows;
      }, [longMerchant, proxyVendorName, purchaseVendorName]);
      expect(facts.length, `${width} 행 수`).toBe(3);
      for (const fact of facts) {
        expect(fact.mainCells, `${width} ${fact.name} 주 행 보이는 칸(연결 · 합계)`).toBe(2);
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
      console.log(`PA3 ${width} ${JSON.stringify(facts.map((fact) => ({ n: fact.name.slice(0, 8), reg: [fact.foldedRegisteredRight, fact.foldedContentRight], clipped: fact.registeredClipped, link: fact.linkCellWidth })))}`);
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

  // 07.1-19 게이트 P2: 폰에서 접힌 줄 `등록`이 잘리면(375 9/50 · 320 11/50) 등록자를 볼 곳이 없었다 — 수정 패널(?editId=)에 읽기 `등록` 줄을 둔다.
  // 행 시트 `등록` 줄 · 접힌 줄과 같은 글자(registeredText) · 패널 본문 안에서 말줄임 없이 다 보인다. 관리자(대리 등록 권리)로 연다.
  test("[07.1-19 PA3] 375 · 320 — 관리자: 대리 · 구매 완료 건 수정 패널에 읽기 `등록` 줄(전체 글자 · 잘리지 않음) · 본인 등록 건은 등록자 이름", async ({ browser, baseURL }) => {
    const { person, cardId, teamId } = await makeHolder();
    const suffix = randomUUID().slice(0, 8);
    const year = seoulToday().slice(0, 4);
    const proxyPerson = await makePerson("대리등록", DEFAULT_ROLE_ID, teamId, `${year}-01-01`);
    const admin = await makePerson("관리자", SYSADMIN_ROLE_ID, teamId, `${year}-01-01`);
    const client = await insertVendor(SYSTEM_VIEWER, { name: `E2E패널등록클라이언트-${suffix}`, normalizedName: `e2e패널등록클라이언트-${suffix}` });
    const project = await createProject(person.viewer, { clientId: client.id, teamId, pmUserId: person.viewer.id, name: `E2E패널등록-${suffix}`, startDate: `${year}-01-01`, endDate: `${year}-12-31` });
    const revision = await getCurrentQuoteRevision(SYSTEM_VIEWER, project.id);
    if (!revision) throw new Error("1차 차수 없음");
    await saveQuoteLines(SYSTEM_VIEWER, revision.id, {
      rows: [
        {
          id: randomUUID(),
          isNew: true as const,
          subcategory: (await firstSelectableSubcategory()).value,
          itemName: `패널 등록 줄-${suffix}`,
          vendorId: null,
          unitPrice: { currency: "KRW" as const, amount: 2_500_000, fxRate: 1 },
          execution: { currency: "KRW" as const, amount: 2_000_000, fxRate: 1 },
        },
      ],
    });
    const [line] = await db.select({ id: quoteLines.id }).from(quoteLines).where(eq(quoteLines.revisionId, revision.id));
    if (!line) throw new Error("견적 줄 없음");

    const ownVendor = await insertVendor(SYSTEM_VIEWER, { name: `패널본인-${suffix}`, normalizedName: `패널본인-${suffix}-${randomUUID()}` });
    const own: CardUsageInput = { corpCardId: cardId, usedOn: seoulToday(), merchantVendorId: ownVendor.id, total: { currency: "KRW", amount: 30_000, fxRate: 1 }, evidenceTypeCode: "invoice", linkKind: "team_cost", memo: null };
    await createCardUsage(person.viewer, own, await precheckCardUsage(person.viewer, own));

    const proxyVendor = await insertVendor(SYSTEM_VIEWER, { name: `패널대리-${suffix}`, normalizedName: `패널대리-${suffix}-${randomUUID()}` });
    await db.insert(corpCardUsages).values({
      corpCardId: cardId,
      usedOn: seoulToday(),
      merchantVendorId: proxyVendor.id,
      totalCurrency: "KRW",
      totalForeignAmount: null,
      totalFxRate: "1",
      totalAmountKrw: 55_000,
      supplyKrw: 50_000,
      vatKrw: 5_000,
      evidenceTypeCode: "invoice",
      linkKind: "team_cost",
      quoteLineId: null,
      teamId,
      usedByUserId: person.viewer.id,
      registeredBy: proxyPerson.viewer.id,
      registeredVia: "proxy",
      memo: null,
    });

    const purchaseNumber = `26001-C${randomUUID().slice(0, 8)}`;
    const [request] = await db
      .insert(purchaseRequests)
      .values({ number: purchaseNumber, linkKind: "quote_line", projectId: project.id, quoteLineId: line.id, requestedBy: proxyPerson.viewer.id, itemName: "현수막", estimateAmountKrw: 40_000 })
      .returning({ id: purchaseRequests.id });
    const purchaseVendor = await insertVendor(SYSTEM_VIEWER, { name: `패널구매-${suffix}`, normalizedName: `패널구매-${suffix}-${randomUUID()}` });
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
    const idOf = async (vendorId: string): Promise<string> => {
      const [row] = await db.select({ id: corpCardUsages.id }).from(corpCardUsages).where(eq(corpCardUsages.merchantVendorId, vendorId));
      if (!row) throw new Error("카드 사용 건 없음");
      return row.id;
    };
    const today = seoulToday().slice(5);
    const cases = [
      { id: await idOf(proxyVendor.id), expected: `경영관리 등록 · ${proxyPerson.name} ${today}` },
      { id: await idOf(purchaseVendor.id), expected: `구매 요청 ${purchaseNumber} · ${proxyPerson.name} ${today}` },
      { id: await idOf(ownVendor.id), expected: person.name },
    ];

    for (const width of [375, 320]) {
      const page = await loginPage(browser, baseURL, admin, { width, height: 800 });
      for (const { id, expected } of cases) {
        await page.goto(`/cards?editId=${id}`);
        const panel = page.getByRole("dialog", { name: "카드 사용 수정" });
        await expect(panel).toBeVisible();
        const row = panel.locator('[data-ui="field-row"]').filter({ has: page.getByText("등록", { exact: true }) });
        await expect(row, `${width} 등록 줄`).toHaveCount(1);
        const value = row.locator("span").nth(1);
        await expect(value, `${width} 등록 글자`).toHaveText(expected);
        // 말줄임으로 잘리지 않는다 — 글자 너비가 칸 안에 다 들어오고 패널 본문 오른쪽 끝을 넘지 않는다.
        const fit = await value.evaluate((element) => {
          const box = element.getBoundingClientRect();
          const body = element.closest("dialog")?.getBoundingClientRect();
          return { clipped: element.scrollWidth > element.clientWidth + 1, overRight: body ? box.right > body.right + 1 : true };
        });
        expect(fit, `${width} ${expected} 잘림`).toEqual({ clipped: false, overRight: false });
      }
      await page.context().close();
    }
  });

  // 07.1-20 G-07.1-68: 권리(수정 · 삭제)가 있는 줄의 행동 칸(81px · 69px)에서 두 버튼이 세로로 쌓여 주 행이 128px(한 건 172px)이 됐다.
  // 07.1-19 PA3 스펙은 행동 칸을 줄 수 판정에서 뺐다(마지막 칸 자르기) — 여기는 보이는 모든 칸을 센다. 폰 행동 열은 숨고(p3) 삭제는 수정 패널 `번호` 줄 끝.
  test("[07.1-20 G-07.1-68] 375 · 320 — 권리 있는 줄도 주 행 두 줄 · 행동이 쌓이지 않음 · 폰 삭제는 수정 패널 → 되돌리기", async ({ browser, baseURL }) => {
    const { person, cardId, teamId } = await makeHolder();
    const suffix = randomUUID().slice(0, 8);
    const year = seoulToday().slice(0, 4);
    const proxyPerson = await makePerson("G68대리", DEFAULT_ROLE_ID, teamId, `${year}-01-01`);
    const ownName = `G68본인-${suffix}`;
    const refName = `G68기준-${suffix}`;
    const ownVendor = await insertVendor(SYSTEM_VIEWER, { name: ownName, normalizedName: `${ownName}-${randomUUID()}` });
    const own: CardUsageInput = { corpCardId: cardId, usedOn: seoulToday(), merchantVendorId: ownVendor.id, total: { currency: "KRW", amount: 1_234_567, fxRate: 1 }, evidenceTypeCode: "invoice", linkKind: "team_cost", memo: null };
    await createCardUsage(person.viewer, own, await precheckCardUsage(person.viewer, own));
    // 기준 줄 — 남이 대리 등록한 건이라 이 주인은 권리가 없다(행동 칸이 빈다).
    const refVendor = await insertVendor(SYSTEM_VIEWER, { name: refName, normalizedName: `${refName}-${randomUUID()}` });
    await db.insert(corpCardUsages).values({
      corpCardId: cardId,
      usedOn: seoulToday(),
      merchantVendorId: refVendor.id,
      totalCurrency: "KRW",
      totalForeignAmount: null,
      totalFxRate: "1",
      totalAmountKrw: 1_234_567,
      supplyKrw: 1_234_567,
      vatKrw: 0,
      evidenceTypeCode: "invoice",
      linkKind: "team_cost",
      quoteLineId: null,
      teamId,
      usedByUserId: person.viewer.id,
      registeredBy: proxyPerson.viewer.id,
      registeredVia: "proxy",
      memo: null,
    });
    const md = seoulToday().slice(5);
    const deleteName = `${md} ${ownName} 삭제`;

    for (const width of [375, 320]) {
      const page = await loginPage(browser, baseURL, person, { width, height: 800 });
      await page.goto("/cards");
      const table = page.getByRole("table");
      await expect(table.locator("tbody tr").first()).toBeVisible();

      const shape = await table.evaluate((root, names) => {
        const linesOf = (cell: Element): number => {
          const set = new Set<number>();
          const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT);
          for (let node = walker.nextNode(); node; node = walker.nextNode()) {
            if (!(node.textContent ?? "").trim()) continue;
            const range = document.createRange();
            range.selectNodeContents(node);
            for (const rect of Array.from(range.getClientRects())) {
              if (rect.width <= 1) continue;
              set.add(Math.round(rect.top / 4));
            }
          }
          return set.size;
        };
        const measure = (name: string) => {
          const folded = [...root.querySelectorAll("tr[class*='collapsedRow']")].find((tr) => (tr.previousElementSibling?.textContent ?? "").includes(name));
          const main = folded?.previousElementSibling;
          if (!folded || !main) return null;
          const cells = [...main.querySelectorAll("td")].filter((cell) => getComputedStyle(cell).display !== "none");
          const actions = [...main.querySelectorAll("a, button")].filter((element) => element.getClientRects().length > 0).map((element) => element.getBoundingClientRect());
          return {
            mainHeight: main.getBoundingClientRect().height,
            foldedHeight: folded.getBoundingClientRect().height,
            cellLines: cells.map(linesOf),
            linkWidth: cells[0]?.getBoundingClientRect().width ?? 0,
            actions: actions.map((box) => ({ top: box.top, width: box.width, height: box.height })),
          };
        };
        const box = root.getBoundingClientRect();
        const parent = root.parentElement?.getBoundingClientRect();
        return { own: measure(names[0] ?? ""), ref: measure(names[1] ?? ""), tableOverRight: parent ? box.right - parent.right : 0 };
      }, [ownName, refName]);
      console.log(`G68 ${width} ${JSON.stringify(shape)} (G-07.1-68)`);
      expect(shape.own, `${width} 본인 줄`).not.toBeNull();
      expect(shape.ref, `${width} 기준 줄`).not.toBeNull();
      if (!shape.own || !shape.ref) return;
      expect(shape.own.mainHeight - shape.ref.mainHeight, `${width} 주 행 높이 − 기준`).toBeLessThanOrEqual(1);
      expect(shape.own.mainHeight + shape.own.foldedHeight, `${width} 한 건 높이`).toBeLessThanOrEqual(shape.ref.mainHeight + 44 + 1);
      expect(Math.max(...shape.own.cellLines), `${width} 주 행 보이는 모든 칸 줄 수(행동 칸 포함)`).toBeLessThanOrEqual(1);
      const tops = shape.own.actions.map((action) => action.top);
      if (tops.length > 0) {
        expect(Math.max(...tops) - Math.min(...tops), `${width} 주 행 행동 윗변 차`).toBeLessThanOrEqual(1);
        for (const action of shape.own.actions) {
          expect(action.width, `${width} 행동 너비`).toBeGreaterThanOrEqual(44);
          expect(action.height, `${width} 행동 높이`).toBeGreaterThanOrEqual(44);
        }
      }
      expect(shape.own.linkWidth, `${width} 연결 칸 폭`).toBeGreaterThanOrEqual(width === 320 ? 98 : 138);
      expect(shape.tableOverRight, `${width} 표 오른쪽`).toBeLessThanOrEqual(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), `${width} 문서 넘침`).toBe(0);

      // 폰 수정 = 행 탭 → 수정 패널, 삭제 = 그 패널 `번호` 줄 끝 `삭제` → 확인 없이 보관 → 표 위 결과 줄 `되돌리기`.
      const tap = page.getByRole("row").filter({ hasText: ownName }).getByRole("button", { name: /상세 보기$/ });
      await waitForHydration(tap);
      await tap.click();
      await expect(page).toHaveURL(/editId=/);
      const panel = page.getByRole("dialog", { name: "카드 사용 수정" });
      await expect(panel).toBeVisible();
      const panelDelete = panel.getByRole("button", { name: deleteName, exact: true });
      await expect(panelDelete, `${width} 패널 삭제`).toBeVisible();
      // 시트가 올라오는 애니메이션이 끝난 뒤 잰다(소수점 오차 0.1 허용).
      await page.waitForTimeout(300);
      const panelBox = await panelDelete.boundingBox();
      expect(panelBox?.width ?? 0, `${width} 패널 삭제 너비`).toBeGreaterThanOrEqual(43.9);
      expect(panelBox?.height ?? 0, `${width} 패널 삭제 높이`).toBeGreaterThanOrEqual(43.9);
      expect(await panel.evaluate((element) => element.scrollWidth - element.clientWidth), `${width} 패널 넘침`).toBeLessThanOrEqual(0);
      await waitForHydration(panelDelete);
      await panelDelete.click();
      await expect(page.getByRole("dialog", { name: "카드 사용 수정" })).toHaveCount(0);
      await expect(page).not.toHaveURL(/editId=/);
      const result = page.locator("p[role='status']").filter({ hasText: "카드 사용 삭제됨" });
      await expect(result).toBeVisible();
      const undo = result.getByRole("button", { name: "되돌리기" });
      await expect(undo, `${width} 삭제 뒤 포커스`).toBeFocused();
      await undo.click();
      // 가맹점 칸은 폰에서 접혀 있다 — 되살아난 줄은 접힌 줄 탭 칸(`… 상세 보기`)으로 알아본다.
      await expect(tap, `${width} 되돌린 줄`).toBeVisible();
      await expect(page.getByRole("dialog", { name: "카드 사용 수정" }), `${width} 되돌린 뒤 패널 재오픈`).toHaveCount(0);
      await expect(page).not.toHaveURL(/editId=/);
      await page.context().close();
    }
  });

  // 07.1-20 Task 2: 폰 패널 삭제의 가장자리 — 거부 · 저장 중 막힘 · 되돌린 줄 포커스 · 700 이상 경계.
  test("[07.1-20 G-07.1-68] 375 · 320 — 패널 삭제 거부면 패널 유지 · 이유 한 줄 · 새로 고침 · 저장 중 막힘 · 되돌린 줄 포커스(탭 칸 · 목록 밖 = 화면 제목) · 700 · 768 · 1024 경계", async ({ browser, baseURL }) => {
    const { person, cardId } = await makeHolder();
    const md = seoulToday().slice(5);
    const deleteNameOf = (name: string) => `${md} ${name} 삭제`;
    const openPanel = async (page: Page, name: string) => {
      const tap = page.getByRole("row").filter({ hasText: name }).getByRole("button", { name: /상세 보기$/ });
      await waitForHydration(tap);
      await tap.click();
      const panel = page.getByRole("dialog", { name: "카드 사용 수정" });
      await expect(panel).toBeVisible();
      return panel;
    };

    // ① 거부 — 패널을 연 뒤 그 건의 version이 바뀌면 낡은 version 삭제는 서버가 거부한다.
    for (const width of [375, 320]) {
      const own = await insertOwnUsage(person, cardId, `G68거부${width}`);
      const page = await loginPage(browser, baseURL, person, { width, height: 800 });
      await page.goto("/cards");
      const panel = await openPanel(page, own.name);
      await db.update(corpCardUsages).set({ version: sql`${corpCardUsages.version} + 1` }).where(eq(corpCardUsages.id, own.id));
      const panelDelete = panel.getByRole("button", { name: deleteNameOf(own.name), exact: true });
      await waitForHydration(panelDelete);
      await panelDelete.click();
      const alert = panel.locator("[role='alert']");
      await expect(alert, `${width} 거부 한 줄`).toHaveCount(1);
      const rejection = (await alert.textContent())?.trim() ?? "";
      expect(rejection.length, `${width} 거부 글자`).toBeGreaterThan(0);
      await expect(panel, `${width} 거부면 패널 유지`).toBeVisible();
      await expect(page).toHaveURL(/editId=/);
      const colors = await alert.evaluate((element) => {
        const probe = document.createElement("span");
        probe.style.color = "var(--status-danger)";
        document.body.append(probe);
        const danger = getComputedStyle(probe).color;
        probe.remove();
        return { actual: getComputedStyle(element).color, danger };
      });
      expect(colors.actual, `${width} 거부 글자 색`).toBe(colors.danger);
      // 표 위 결과 줄에 겹쳐 남지 않는다.
      await expect(page.locator("p[role='status']").filter({ hasText: rejection }), `${width} 결과 줄 겹침`).toHaveCount(0);
      expect(await panel.evaluate((element) => element.scrollWidth - element.clientWidth), `${width} 패널 넘침`).toBeLessThanOrEqual(0);
      // 거부 뒤 다음 행동 — `새로 고침`으로 최신 version을 받은 뒤 다시 누르면 지워진다.
      const refresh = panel.getByRole("button", { name: "새로 고침" });
      await expect(refresh, `${width} 새로 고침`).toBeVisible();
      await refresh.click();
      await expect(alert, `${width} 새로 고침 뒤 거부 줄`).toHaveCount(0);
      await panelDelete.click();
      await expect(page.getByRole("dialog", { name: "카드 사용 수정" })).toHaveCount(0);
      await expect(page.locator("p[role='status']").filter({ hasText: "카드 사용 삭제됨" })).toBeVisible();
      await page.context().close();
    }

    // ② 저장 중에는 패널 삭제가 막힌다(누름 → 요청 0).
    {
      const own = await insertOwnUsage(person, cardId, "G68저장중");
      const page = await loginPage(browser, baseURL, person, { width: 375, height: 800 });
      await page.goto("/cards");
      const panel = await openPanel(page, own.name);
      const panelDelete = panel.getByRole("button", { name: deleteNameOf(own.name), exact: true });
      await waitForHydration(panelDelete);
      await panel.getByLabel("메모").fill("저장 중 막힘");
      let posts = 0;
      let release: () => void = () => undefined;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      await page.route("**/*", async (route) => {
        const request = route.request();
        if (request.method() === "POST" && request.headers()["next-action"]) {
          posts += 1;
          if (posts === 1) await gate;
        }
        await route.continue();
      });
      await panel.getByRole("button", { name: /^카드 사용 저장/ }).click();
      await expect.poll(() => posts, { message: "저장 요청이 붙잡힘" }).toBe(1);
      await expect(panelDelete, "저장 중 패널 삭제").toHaveAttribute("aria-disabled", "true");
      await panelDelete.click({ force: true });
      await page.waitForTimeout(400);
      expect(posts, "저장 중 패널 삭제 누름 → 새 요청 0").toBe(1);
      release();
      await expect(page.getByRole("dialog", { name: "카드 사용 수정" })).toHaveCount(0);
      await expect(page.getByRole("row").filter({ hasText: own.name }), "그 줄은 표에 남음").toHaveCount(2);
      await expect(page.locator("p[role='status']").filter({ hasText: "카드 사용 삭제됨" })).toHaveCount(0);
      await page.context().close();
    }

    // ③ 되돌린 줄 포커스 — 폰은 행동 열이 숨어 그 줄의 탭 칸이 받는다(body 아님).
    {
      const own = await insertOwnUsage(person, cardId, "G68포커스");
      const page = await loginPage(browser, baseURL, person, { width: 375, height: 800 });
      await page.goto("/cards");
      const panel = await openPanel(page, own.name);
      const panelDelete = panel.getByRole("button", { name: deleteNameOf(own.name), exact: true });
      await waitForHydration(panelDelete);
      await panelDelete.click();
      const undo = page.locator("p[role='status']").getByRole("button", { name: "되돌리기" });
      await expect(undo).toBeFocused();
      await undo.click();
      await expect
        .poll(() =>
          page.evaluate((name) => {
            const active = document.activeElement;
            if (!active || active === document.body) return "body";
            const previous = active.closest("tr")?.previousElementSibling;
            return [active.getAttribute("role"), (active.getAttribute("aria-label") ?? "").endsWith("상세 보기"), (previous?.textContent ?? "").includes(name)].join("|");
          }, own.name),
        )
        .toBe("button|true|true");
      await page.context().close();
    }

    // ④ 되살린 줄이 이 목록에 없을 때(지난달 건을 `?editId=`로 직접 연 경우) — 화면 제목으로.
    {
      const own = await insertOwnUsage(person, cardId, "G68지난달");
      const [year, month] = seoulToday().split("-").map(Number);
      const previous = month === 1 ? `${(year ?? 0) - 1}-12-01` : `${year}-${String((month ?? 1) - 1).padStart(2, "0")}-01`;
      await db.update(corpCardUsages).set({ usedOn: previous }).where(eq(corpCardUsages.id, own.id));
      const page = await loginPage(browser, baseURL, person, { width: 375, height: 800 });
      await page.goto(`/cards?editId=${own.id}`);
      const panel = page.getByRole("dialog", { name: "카드 사용 수정" });
      await expect(panel).toBeVisible();
      const panelDelete = panel.getByRole("button", { name: `${previous.slice(5)} ${own.name} 삭제`, exact: true });
      await waitForHydration(panelDelete);
      await panelDelete.click();
      await expect(page.getByRole("dialog", { name: "카드 사용 수정" })).toHaveCount(0);
      await expect(page).toHaveURL(/\/cards$/);
      const undo = page.locator("p[role='status']").getByRole("button", { name: "되돌리기" });
      await expect(undo).toBeFocused();
      await undo.click();
      await expect(page.locator('[data-ui="screen-title"]')).toBeFocused();
      await page.context().close();
    }

    // ⑤ 700 · 768 · 1024 — 행동 칸 `수정` · `삭제`가 그대로 한 줄이고 수정 패널에는 보이는 `삭제`가 없다(폰 전용 자리).
    const own = await insertOwnUsage(person, cardId, "G68넓은폭");
    for (const width of [700, 768, 1024, 1280]) {
      const page = await loginPage(browser, baseURL, person, { width, height: 800 });
      await page.goto("/cards");
      const edit = page.getByRole("link", { name: `${md} ${own.name} 수정`, exact: true });
      const remove = page.getByRole("button", { name: deleteNameOf(own.name), exact: true });
      await expect(edit, `${width} 수정`).toBeVisible();
      await expect(remove, `${width} 삭제`).toBeVisible();
      const editBox = await edit.boundingBox();
      const removeBox = await remove.boundingBox();
      expect(Math.abs((editBox?.y ?? 0) - (removeBox?.y ?? 99999)), `${width} 윗변 차`).toBeLessThanOrEqual(1);
      const rowShape = await page.getByRole("row").filter({ hasText: own.name }).first().evaluate((row) => ({ rowHeight: row.getBoundingClientRect().height, actionWidth: [...row.querySelectorAll("td")].at(-1)?.getBoundingClientRect().width ?? 0 }));
      console.log(`G68 wide ${width} ${JSON.stringify(rowShape)} (G-07.1-68)`);
      await waitForHydration(edit);
      await edit.click();
      const panel = page.getByRole("dialog", { name: "카드 사용 수정" });
      await expect(panel).toBeVisible();
      await expect(panel.getByRole("button", { name: deleteNameOf(own.name), exact: true }), `${width} 패널 삭제 없음`).toHaveCount(0);
      await page.context().close();
    }
    console.log("G-07.1-68 task2 거부 · 저장 중 막힘 · 포커스 · 700/768/1024 경계 통과");
  });

  // 07.1-20: 권리 판정은 서버 그대로 — 구매 완료로 생긴 건(rights.delete 거짓)의 수정 패널에는 `삭제`가 없고 대리 등록 건에는 있다(관리자).
  test("[07.1-20 G-07.1-68] 375 · 320 — 관리자: 구매 완료 건 패널에 삭제 없음", async ({ browser, baseURL }) => {
    const { person, cardId, teamId } = await makeHolder();
    const suffix = randomUUID().slice(0, 8);
    const year = seoulToday().slice(0, 4);
    const proxyPerson = await makePerson("G68대리", DEFAULT_ROLE_ID, teamId, `${year}-01-01`);
    const admin = await makePerson("G68관리자", SYSADMIN_ROLE_ID, teamId, `${year}-01-01`);
    const client = await insertVendor(SYSTEM_VIEWER, { name: `E2EG68클라이언트-${suffix}`, normalizedName: `e2eg68클라이언트-${suffix}` });
    const project = await createProject(person.viewer, { clientId: client.id, teamId, pmUserId: person.viewer.id, name: `E2EG68-${suffix}`, startDate: `${year}-01-01`, endDate: `${year}-12-31` });
    const revision = await getCurrentQuoteRevision(SYSTEM_VIEWER, project.id);
    if (!revision) throw new Error("1차 차수 없음");
    await saveQuoteLines(SYSTEM_VIEWER, revision.id, {
      rows: [
        {
          id: randomUUID(),
          isNew: true as const,
          subcategory: (await firstSelectableSubcategory()).value,
          itemName: `G68 줄-${suffix}`,
          vendorId: null,
          unitPrice: { currency: "KRW" as const, amount: 2_500_000, fxRate: 1 },
          execution: { currency: "KRW" as const, amount: 2_000_000, fxRate: 1 },
        },
      ],
    });
    const [line] = await db.select({ id: quoteLines.id }).from(quoteLines).where(eq(quoteLines.revisionId, revision.id));
    if (!line) throw new Error("견적 줄 없음");
    const proxyVendor = await insertVendor(SYSTEM_VIEWER, { name: `G68대리-${suffix}`, normalizedName: `g68대리-${suffix}-${randomUUID()}` });
    const [proxyRow] = await db
      .insert(corpCardUsages)
      .values({ corpCardId: cardId, usedOn: seoulToday(), merchantVendorId: proxyVendor.id, totalCurrency: "KRW", totalForeignAmount: null, totalFxRate: "1", totalAmountKrw: 55_000, supplyKrw: 50_000, vatKrw: 5_000, evidenceTypeCode: "invoice", linkKind: "team_cost", quoteLineId: null, teamId, usedByUserId: person.viewer.id, registeredBy: proxyPerson.viewer.id, registeredVia: "proxy", memo: null })
      .returning({ id: corpCardUsages.id });
    const purchaseNumber = `26001-C${randomUUID().slice(0, 8)}`;
    const [request] = await db
      .insert(purchaseRequests)
      .values({ number: purchaseNumber, linkKind: "quote_line", projectId: project.id, quoteLineId: line.id, requestedBy: proxyPerson.viewer.id, itemName: "현수막", estimateAmountKrw: 40_000 })
      .returning({ id: purchaseRequests.id });
    const purchaseVendor = await insertVendor(SYSTEM_VIEWER, { name: `G68구매-${suffix}`, normalizedName: `g68구매-${suffix}-${randomUUID()}` });
    const [purchaseRow] = await db
      .insert(corpCardUsages)
      .values({ corpCardId: cardId, usedOn: seoulToday(), merchantVendorId: purchaseVendor.id, totalCurrency: "KRW", totalForeignAmount: null, totalFxRate: "1", totalAmountKrw: 40_000, supplyKrw: 40_000, vatKrw: 0, evidenceTypeCode: "invoice", linkKind: "quote_line", quoteLineId: line.id, teamId: null, usedByUserId: person.viewer.id, registeredBy: proxyPerson.viewer.id, registeredVia: "purchase", purchaseRequestId: request?.id ?? null, memo: null })
      .returning({ id: corpCardUsages.id });
    if (!proxyRow || !purchaseRow) throw new Error("카드 사용 건 없음");
    const md = seoulToday().slice(5);
    for (const width of [375, 320]) {
      const page = await loginPage(browser, baseURL, admin, { width, height: 800 });
      await page.goto(`/cards?editId=${proxyRow.id}`);
      let panel = page.getByRole("dialog", { name: "카드 사용 수정" });
      await expect(panel).toBeVisible();
      await expect(panel.getByRole("button", { name: `${md} ${proxyVendor.name} 삭제`, exact: true }), `${width} 대리 등록 건 패널 삭제`).toHaveCount(1);
      await page.goto(`/cards?editId=${purchaseRow.id}`);
      panel = page.getByRole("dialog", { name: "카드 사용 수정" });
      await expect(panel).toBeVisible();
      await expect(panel.getByRole("button", { name: `${md} ${purchaseVendor.name} 삭제`, exact: true }), `${width} 구매 완료 건 패널 삭제`).toHaveCount(0);
      await page.context().close();
    }
    console.log("G-07.1-68 admin 구매 완료 건 패널 삭제 0");
  });
});

// 본인 등록 한 건 — 가맹점 `name`, KRW 합계, 팀 비용(권리 수정 · 삭제).
async function insertOwnUsage(person: Person, cardId: string, label: string): Promise<{ id: string; name: string }> {
  const name = `${label}-${randomUUID().slice(0, 8)}`;
  const vendor = await insertVendor(SYSTEM_VIEWER, { name, normalizedName: `${name}-${randomUUID()}` });
  const input: CardUsageInput = { corpCardId: cardId, usedOn: seoulToday(), merchantVendorId: vendor.id, total: { currency: "KRW", amount: 77_000, fxRate: 1 }, evidenceTypeCode: "invoice", linkKind: "team_cost", memo: null };
  await createCardUsage(person.viewer, input, await precheckCardUsage(person.viewer, input));
  const [row] = await db.select({ id: corpCardUsages.id }).from(corpCardUsages).where(eq(corpCardUsages.merchantVendorId, vendor.id));
  if (!row) throw new Error("카드 사용 건 없음");
  return { id: row.id, name };
}
