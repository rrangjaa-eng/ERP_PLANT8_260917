import { randomUUID } from "node:crypto";
import { test, expect, type Browser, type Page } from "@playwright/test";
import { createAccount } from "@/domain/auth/accounts";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { assignTeam, createOrgUnit, createTeam, listTeams } from "@/domain/org";
import { seoulToday } from "@/lib/dates";
import "@/domain/leave";
import { submitLeave } from "@/domain/leave";
import { leaveWeekdayRange } from "./leave-dates";
import { documentLabel, loginPage as loginAsPerson, setupLeaveOrg, waitForHydration } from "./leave-org";
import { isStrict } from "./design-principles";
import { checkPrinciples } from "./principles-check";

// 04.1-02 Task 1 화면 트레이서(EXP-05): /leave/new 신청 → /leave/[id] → /approvals 승인 × 4 → 최종 승인.
// 다른 스펙의 픽스처와 섞이지 않게 전용 본부 · 팀을 도메인 함수로 만들고 기안자 · 팀장 · 본부 책임자를
// 발령한다. 3단(경영관리본부 · 계급 무관)은 기존 경영관리팀에 이 스펙의 한 명을, 4단(대표 · 전사)은 이
// 스펙의 대표를 후보로 둔다 — 다른 스펙의 사람이 같은 자리 후보여도 이 스펙의 사람이 처리할 수 있으면 된다.

type Person = { name: string; email: string; password: string };

// 발령일 = 그해 1월 1일(날짜는 3월 이후라 발령 뒤다 — 날짜 리터럴 없음).
async function makePerson(prefix: string, roleId: string, teamId: string, effectiveFrom: string): Promise<Person> {
  const name = `${prefix}${randomUUID().slice(0, 4)}`;
  const email = `e2e-leave-${randomUUID()}@example.test`;
  const { userId, tempPassword } = await createAccount(SYSTEM_VIEWER, { email, name, roleId });
  await assignTeam(SYSTEM_VIEWER, { userId, teamId, effectiveFrom });
  return { name, email, password: tempPassword };
}

async function loginPage(browser: Browser, baseURL: string | undefined, person: Person): Promise<Page> {
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();
  await page.goto("/login");
  await page.getByLabel("이메일").fill(person.email);
  await page.getByLabel("비밀번호").fill(person.password);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/account$/);
  return page;
}

async function approveFromInbox(page: Page, documentLabel: string, toast: string | RegExp): Promise<void> {
  await page.goto("/approvals");
  const row = page.getByRole("row").filter({ hasText: documentLabel });
  // 문서 링크는 토큰 색(--accent) — 브라우저 기본 파랑이 아니다(SYSTEM §1 · DOM 감사 04.1-02).
  await expect(row.getByRole("link", { name: documentLabel })).toHaveCSS("color", "rgb(0, 84, 70)");
  await waitForHydration(row.getByRole("button", { name: "승인" }));
  await row.getByRole("button", { name: "승인" }).click();
  await expect(page.getByRole("status").filter({ hasText: toast })).toHaveText(toast);
  // 그 행이 `처리함` 그룹 머리글 뒤로 옮겨 가고 행동 버튼이 없다.
  await expect(row.getByRole("button", { name: "승인" })).toHaveCount(0);
  const texts = await page.getByRole("row").allInnerTexts();
  const processedHeader = texts.findIndex((text) => text.trim() === "처리함");
  const documentRow = texts.findIndex((text) => text.includes(documentLabel));
  expect(processedHeader).toBeGreaterThanOrEqual(0);
  expect(documentRow).toBeGreaterThan(processedHeader);
}

test.describe("연차 신청 → 결재함 승인 → 최종 승인 (04.1-02 트레이서)", () => {
  test("직원이 신청하고 결재자 넷이 결재함에서 차례로 승인하면 최종 승인이다", async ({ browser, baseURL }) => {
    const today = seoulToday();
    const { startDate, endDate } = leaveWeekdayRange(today, { week: 0, weekdays: 2 });
    const yearStart = `${today.slice(0, 4)}-01-01`;
    const documentLabel = `연차 · 종일 ${startDate.slice(5)} ~ ${endDate.slice(5)}`;

    const orgUnit = await createOrgUnit(SYSTEM_VIEWER, { name: `E2E연차본부-${randomUUID().slice(0, 8)}` });
    const team = await createTeam(SYSTEM_VIEWER, { orgUnitId: orgUnit.id, name: `E2E연차팀-${randomUUID().slice(0, 8)}` });
    const mgmtTeam = (await listTeams(SYSTEM_VIEWER)).find((candidate) => candidate.name === "경영관리팀");
    if (!mgmtTeam) throw new Error("시드된 경영관리팀 없음");

    const drafter = await makePerson("기안", "role-pm", team.id, yearStart);
    const teamLead = await makePerson("팀장", "role-team-lead", team.id, yearStart);
    const divisionHead = await makePerson("본부장", "role-division-head", team.id, yearStart);
    const mgmt = await makePerson("경영", "role-pm", mgmtTeam.id, yearStart);
    const ceo = await makePerson("대표", "role-ceo", team.id, yearStart);
    const outsider = await makePerson("무관", "role-pm", team.id, yearStart);

    // 기안자가 /leave/new에서 종일 두 평일을 신청한다.
    const drafterPage = await loginPage(browser, baseURL, drafter);
    await drafterPage.goto("/leave/new");
    // 하이드레이션 전에 채운 입력은 버려진다 — 마운트 미리보기의 결재선 한 줄이 뜬 뒤(= 하이드레이션 끝) 입력한다.
    await expect(drafterPage.getByTestId("approval-route-line")).toBeVisible();
    await drafterPage.getByLabel("시작일").fill(startDate);
    await drafterPage.getByLabel("종료일").fill(endDate);
    await drafterPage.getByRole("button", { name: "연차 신청" }).click();
    await expect(drafterPage).toHaveURL(/\/leave\/[0-9a-f-]{36}\?submitted=1$/);
    const documentUrl = new URL(drafterPage.url()).pathname;
    await expect(drafterPage.getByText(/^LV/)).toBeVisible();
    // 머리 줄(문서 번호 · 상태 태그) 안에서만 본다 — 04.1-05부터 결재선 목록의 지금 단계도 `결재 중`이다(검토 LOW-3).
    const headerLine = drafterPage.locator("p").filter({ hasText: /^LV/ });
    await expect(headerLine.getByText("결재 중", { exact: true })).toBeVisible();

    // 결재 차례가 아닌 사람은 404다.
    const outsiderPage = await loginPage(browser, baseURL, outsider);
    const response = await outsiderPage.goto(documentUrl);
    expect(response?.status()).toBe(404);

    // 팀장 → 본부 책임자 → 경영관리 → 대표 차례로 승인.
    await approveFromInbox(await loginPage(browser, baseURL, teamLead), documentLabel, `승인 · 결재 요청됨 → ${divisionHead.name}`);
    // 3단 · 4단 후보는 다른 스펙의 사람과 함께일 수 있어(`… 외 N명`) 앞부분만 본다.
    await approveFromInbox(await loginPage(browser, baseURL, divisionHead), documentLabel, /^승인 · 결재 요청됨 → .+/);
    await approveFromInbox(await loginPage(browser, baseURL, mgmt), documentLabel, /^승인 · 결재 요청됨 → .+/);
    await approveFromInbox(await loginPage(browser, baseURL, ceo), documentLabel, "승인 · 최종 승인 · 2일 차감");

    await drafterPage.goto(documentUrl);
    await expect(headerLine.getByText("승인", { exact: true })).toBeVisible();
  });
});

// 04.6-17 — 결재함 화면 틀 · 결재 시트(DR4 A) · 불러오는 중 뼈대. 기대 값은 계산된 역할 토큰과 비교한다(리터럴 px · rgb 금지).
async function resolveToken(page: Page, token: string, property: "width" | "borderTopLeftRadius" | "backgroundColor"): Promise<string> {
  return page.evaluate(
    ([name, prop]) => {
      const probe = document.createElement("div");
      probe.style.setProperty(prop === "borderTopLeftRadius" ? "border-top-left-radius" : prop === "backgroundColor" ? "background-color" : prop, `var(${name})`);
      document.body.appendChild(probe);
      const value = getComputedStyle(probe)[prop as "width"];
      probe.remove();
      return value;
    },
    [token, property] as const,
  );
}

test.describe("결재함 — 결재 시트 PC 모양 · 뼈대 · 원칙 (04.6-17)", () => {
  // 결재 시트를 여는 대상(`rowTap`)은 폰 폭에서만 보인다 — 폰 폭에서 열고 창만 PC 폭으로 넓혀(다시 불러오지 않는다) PC 기하를 잰다.
  test("PC 폭의 결재 시트는 오른쪽 480 패널이고 뒤 막이 있으며 행동 줄은 반려 → 승인이다(DR4 A · Q1 A · D17)", async ({ browser, baseURL }) => {
    const today = seoulToday();
    const range = leaveWeekdayRange(today, { week: 4, weekdays: 1 });
    const org = await setupLeaveOrg(today);
    await submitLeave(org.drafter.viewer, { kind: "full_day", startDate: range.startDate, endDate: range.endDate, half: "" });

    const lead = await loginAsPerson(browser, baseURL, org.teamLead, { width: 375, height: 800 });
    await lead.goto("/approvals");
    const trigger = lead.getByRole("button", { name: documentLabel(range) });
    await waitForHydration(trigger);
    await trigger.click();
    const panel = lead.locator('dialog[data-ui="side-panel"]');
    await expect(panel).toBeVisible();
    await lead.setViewportSize({ width: 1280, height: 800 });

    expect(await panel.evaluate((element) => element.matches(":modal"))).toBe(true);
    // 창 폭 변경 뒤 배치가 자리 잡을 때까지 기다린다.
    await expect
      .poll(async () => {
        const box = await panel.boundingBox();
        return box ? [Math.round(box.x + box.width), `${box.width}px`] : null;
      })
      .toEqual([1280, await resolveToken(lead, "--panel-w", "width")]);
    const style = await panel.evaluate((element) => ({
      topLeft: getComputedStyle(element).borderTopLeftRadius,
      backdrop: getComputedStyle(element, "::backdrop").backgroundColor,
    }));
    expect(style.topLeft).toBe(await resolveToken(lead, "--radius-panel", "borderTopLeftRadius"));
    expect(style.backdrop).toBe(await resolveToken(lead, "--scrim-panel", "backgroundColor"));

    expect(
      await panel.evaluate((node) =>
        [...node.querySelectorAll("button")].map((button) => button.textContent?.trim() ?? "").filter((text) => /^(취소|반려|승인)/.test(text)),
      ),
    ).toEqual(["반려", expect.stringMatching(/^승인/)]);
    const [rejectBox, approveBox] = [await panel.getByRole("button", { name: "반려" }).boundingBox(), await panel.getByRole("button", { name: /^승인/ }).boundingBox()];
    expect((rejectBox?.x ?? 0) + (rejectBox?.width ?? 0)).toBeLessThan(approveBox?.x ?? 0);
    expect(Math.abs((approveBox?.width ?? 0) - 2 * (rejectBox?.width ?? 0))).toBeLessThanOrEqual(1);
    await expect(panel.getByRole("button", { name: /^취소/ })).toHaveCount(0);

    // 닫으면(Esc) 시트가 사라진다. 연 행으로의 포커스 복귀는 여는 대상이 보이는 폰 폭에서 `mobile-leave-approval.spec.ts`가 잰다.
    await lead.keyboard.press("Escape");
    await expect(panel).toHaveCount(0);
    await lead.context().close();
  });

  test("결재함을 느리게 불러오면 300ms 뒤 진짜 열 이름의 뼈대만 보이고 1차 버튼은 없다(D10)", async ({ browser, baseURL }) => {
    const today = seoulToday();
    const range = leaveWeekdayRange(today, { week: 4, weekdays: 1 });
    const org = await setupLeaveOrg(today);
    await submitLeave(org.drafter.viewer, { kind: "full_day", startDate: range.startDate, endDate: range.endDate, half: "" });

    const lead = await loginAsPerson(browser, baseURL, org.teamLead);
    await lead.goto("/approvals");
    const headers = await lead.locator("main table thead th").allInnerTexts();
    await lead.goto("/account");
    // 뼈대(loading 틀)는 라우터가 미리 가져온 경우에만 응답이 늦는 동안 보인다 — 먼저 미리 가져오고, 그다음에 응답을 늦춘다.
    const prefetched = lead.waitForResponse((response) => response.url().includes("/approvals") && response.request().headers()["next-router-prefetch"] === "1");
    await lead.evaluate(() => (window as unknown as { next: { router: { prefetch(url: string): void } } }).next.router.prefetch("/approvals"));
    await prefetched;
    await lead.waitForLoadState("networkidle");
    await lead.route(
      (url) => url.pathname === "/approvals",
      async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 2500));
        await route.continue();
      },
    );
    await lead.evaluate(() => (window as unknown as { next: { router: { push(url: string): void } } }).next.router.push("/approvals"));
    const skeleton = lead.locator('[data-ui="table-skeleton"]');
    await expect.poll(async () => (await skeleton.count()) > 0 && parseFloat(await skeleton.first().evaluate((element) => getComputedStyle(element).opacity)) > 0).toBe(true);
    expect(await skeleton.locator("th").allInnerTexts()).toEqual(headers.slice(0, await skeleton.locator("th").count()));
    await expect(lead.locator('[data-ui="screen-title"]:visible')).toHaveText("결재");
    await expect(lead.locator('[data-ui="screen-meta"]')).toHaveCount(0);
    await expect(lead.locator('[data-ui="primary-button"]')).toHaveCount(0);
    await lead.context().close();
  });

  test("화면 사용성 원칙(막는 모드) — 결재함", async ({ browser, baseURL }) => {
    const today = seoulToday();
    const range = leaveWeekdayRange(today, { week: 4, weekdays: 1 });
    const org = await setupLeaveOrg(today);
    await submitLeave(org.drafter.viewer, { kind: "full_day", startDate: range.startDate, endDate: range.endDate, half: "" });

    const lead = await loginAsPerson(browser, baseURL, org.teamLead);
    await checkPrinciples(lead, ["/approvals"], { strict: isStrict(process.env.DESIGN_PRINCIPLES_STRICT) });
    await lead.context().close();
  });
});
