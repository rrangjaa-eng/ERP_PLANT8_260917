import { test, expect, type Page } from "@playwright/test";
import "@/domain/leave";
import { approveDocument, rejectDocument, withdrawDocument } from "@/domain/approvals";
import { submitLeave } from "@/domain/leave";
import { seoulToday } from "@/lib/dates";
import { leaveWeekdayRange } from "./leave-dates";
import { documentLabel, documentTitle, loginPage, makePerson, setupLeaveOrg, waitForHydration, type LeaveOrg } from "./leave-org";

// 04.1-05 Task 2(EXP-03 · EXP-04 · S3 · S4 · S6): 문서 화면 행동 줄은 서버 가능 행동 그대로 — 결재자 = 승인 + 반려,
// 기안자 · 결재 중 = 회수, 기안자 · 반려 = 고쳐 쓰는 폼 + 연차 다시 신청. 반려 · 회수는 ui/confirm-dialog.
// 날짜는 테스트마다 맨 앞 서울 오늘 한 번(CXF2-B-RF03) · week 4~8(다른 스펙과 겹치지 않게, Codex HIGH 06).

async function submit(org: LeaveOrg, range: { startDate: string; endDate: string }) {
  return submitLeave(org.drafter.viewer, { kind: "full_day", startDate: range.startDate, endDate: range.endDate, half: "" });
}

function kv(page: Page, label: string) {
  return page.locator("dt", { hasText: new RegExp(`^${label}$`) });
}

async function countText(page: Page, text: string): Promise<number> {
  return ((await page.locator("main").innerText()).match(new RegExp(text, "g")) ?? []).length;
}

test.describe("연차 문서 화면 행동 줄 (04.1-05)", () => {
  test("결재자는 승인 + 반려(Ctrl+Enter 승인), 기안자는 회수만, 관계없는 사람은 404 · 결재 중 문서는 잔고 행이 있고 일수 행이 없다", async ({ browser, baseURL }) => {
    const today = seoulToday();
    const range = leaveWeekdayRange(today, { week: 4, weekdays: 3 });
    const org = await setupLeaveOrg(today);
    const doc = await submit(org, range);
    const url = `/leave/${doc.leaveId}`;

    const lead = await loginPage(browser, baseURL, org.teamLead);
    await lead.goto(url);
    await expect(lead.getByRole("heading", { level: 1 })).toHaveText(documentTitle(range));
    await expect(lead.getByRole("button", { name: /^승인/ })).toBeVisible();
    await expect(lead.getByRole("button", { name: "반려" })).toBeVisible();
    await expect(lead.getByRole("button", { name: "회수" })).toHaveCount(0);
    await expect(kv(lead, "잔고")).toHaveCount(1);
    await expect(kv(lead, "일수")).toHaveCount(0);
    expect(await countText(lead, "이번 신청")).toBe(1);

    const drafter = await loginPage(browser, baseURL, org.drafter);
    await drafter.goto(url);
    await expect(drafter.getByRole("button", { name: /^회수/ })).toBeVisible();
    await expect(drafter.getByRole("button", { name: /^승인/ })).toHaveCount(0);
    await expect(drafter.getByRole("button", { name: "반려" })).toHaveCount(0);

    const outsider = await makePerson("무관", "role-pm", org.teamId, `${today.slice(0, 4)}-01-01`);
    const outsiderPage = await loginPage(browser, baseURL, outsider);
    expect((await outsiderPage.goto(url))?.status()).toBe(404);

    await lead.keyboard.press("Control+Enter");
    await expect(lead.getByRole("status").filter({ hasText: "승인 · " })).toHaveText(`승인 · 결재 요청됨 → ${org.divisionHead.name}`);
    await expect(lead.getByRole("button", { name: /^승인/ })).toHaveCount(0);
  });

  test("반려 모달 — 사유 칸 첫 포커스 · 빈 사유 막힘 · Ctrl+Enter 반려 → 기안자 고쳐 쓰는 폼으로 다시 신청(번호 유지 · 새 차수)", async ({ browser, baseURL }) => {
    const today = seoulToday();
    const range = leaveWeekdayRange(today, { week: 5, weekdays: 3 });
    const again = leaveWeekdayRange(today, { week: 6, weekdays: 2 });
    const org = await setupLeaveOrg(today);
    const doc = await submit(org, range);
    const url = `/leave/${doc.leaveId}`;

    const lead = await loginPage(browser, baseURL, org.teamLead);
    await lead.goto(url);
    const number = (await lead.getByText(/^LV/).first().innerText()).trim();
    await waitForHydration(lead.getByRole("button", { name: "반려" }));
    // PC 행동 줄은 DOM · Tab · 보이는 순서 모두 승인 → 반려 그대로(사용자 결정 2026-09-29 — 폰만 반려 → 승인).
    expect(
      await lead.locator("main").evaluate((main) =>
        [...main.querySelectorAll("button")].map((button) => button.textContent?.trim() ?? "").filter((text) => text === "반려" || text.startsWith("승인")),
      ),
    ).toEqual([expect.stringMatching(/^승인/), "반려"]);
    await lead.getByRole("button", { name: "반려" }).click();
    const dialog = lead.getByRole("dialog");
    await expect(dialog.getByRole("heading", { level: 2 })).toHaveText("연차 반려");
    await expect(dialog.getByText(`${number} · ${org.drafter.name} · 종일 ${range.startDate.slice(5)} ~ ${range.endDate.slice(5)} · 3일`)).toBeVisible();
    const reason = dialog.getByLabel("사유");
    await expect(reason).toBeFocused();
    const [inputBox, dialogBox] = [await reason.boundingBox(), await dialog.boundingBox()];
    expect((inputBox?.x ?? 0) + (inputBox?.width ?? 0)).toBeLessThanOrEqual((dialogBox?.x ?? 0) + (dialogBox?.width ?? 0));
    expect(dialogBox?.width).toBe(480);
    await expect(dialog.getByRole("button", { name: /^반려/ })).toHaveAttribute("aria-disabled", "true");
    // 막힘 이유는 1차 왼쪽 한 자리에 보인다(ui/button 안의 같은 글자는 숨긴 aria-describedby 대상 — 04-21).
    await expect(dialog.getByText("사유 없음 · 사유 적기").filter({ visible: true })).toHaveCount(1);
    // 사용자 결정 2026-09-29(04.1-07 DOM 감사 ②): 사유 칸은 여러 줄 — 긴 사유는 칸 안에서 가로로 밀리지 않고 줄이 늘어난다.
    await expect(reason).toHaveJSProperty("tagName", "TEXTAREA");
    const shortHeight = (await reason.boundingBox())?.height ?? 0;
    await reason.fill("일정이 겹쳐 이번 주 안에는 자리를 비우기 어렵습니다. ".repeat(4));
    expect((await reason.boundingBox())?.height ?? 0).toBeGreaterThan(shortHeight);
    await reason.fill("일정 겹침");
    await lead.keyboard.press("Control+Enter");
    await expect(lead.getByRole("status").filter({ hasText: "반려 · " })).toHaveText(`반려 · ${org.drafter.name}에게 돌아감`);

    const drafter = await loginPage(browser, baseURL, org.drafter);
    await drafter.goto(url);
    await expect(drafter.getByLabel("시작일")).toHaveValue(range.startDate);
    await waitForHydration(drafter.getByLabel("시작일"));
    await drafter.getByLabel("시작일").fill(again.startDate);
    await drafter.getByLabel("종료일").fill(again.endDate);
    await drafter.getByRole("button", { name: /^연차 다시 신청/ }).click();
    await expect(drafter.getByRole("status").filter({ hasText: "연차 다시 신청 · " })).toHaveText(
      `연차 다시 신청 · 결재 요청됨 → ${org.teamLead.name}`,
    );
    await expect(drafter.getByText(number, { exact: true })).toBeVisible();
    await expect(drafter.getByRole("listitem").filter({ hasText: `${org.teamLead.name} 팀장 · 결재 중` })).toHaveCount(1);
  });

  test("회수 — 결과 줄 · 토스트 · 머리 태그 회수 · 행동 줄 없음 · 잔고 행 대신 일수 행", async ({ browser, baseURL }) => {
    const today = seoulToday();
    const range = leaveWeekdayRange(today, { week: 7, weekdays: 2 });
    const org = await setupLeaveOrg(today);
    const doc = await submit(org, range);

    const drafter = await loginPage(browser, baseURL, org.drafter);
    await drafter.goto(`/leave/${doc.leaveId}`);
    await expect(kv(drafter, "잔고")).toHaveCount(1);
    await expect(kv(drafter, "일수")).toHaveCount(0);
    await drafter.getByRole("button", { name: /^회수/ }).click();
    const dialog = drafter.getByRole("dialog");
    await expect(dialog.getByRole("heading", { level: 2 })).toHaveText("연차 회수");
    await expect(dialog.getByText(`결재 멈춤 · ${org.teamLead.name}의 결재함에서 빠짐`)).toBeVisible();
    await expect(dialog.getByRole("button", { name: /^회수/ })).toBeFocused();
    await dialog.getByRole("button", { name: /^회수/ }).click();
    await expect(drafter.getByRole("status").filter({ hasText: "회수 · " })).toHaveText("회수 · 결재 멈춤");
    await expect(drafter.getByText("회수", { exact: true }).first()).toBeVisible();
    await expect(drafter.getByRole("button", { name: /^회수/ })).toHaveCount(0);
    await expect(kv(drafter, "잔고")).toHaveCount(0);
    await expect(kv(drafter, "일수")).toHaveCount(1);
  });

  test("최종 승인 문서 — 기안자 · 마지막 결재자 모두 잔고 행 없이 일수 행, 결재선은 저장된 처리자 · 승인만(담당 없음 없음)", async ({ browser, baseURL }) => {
    const today = seoulToday();
    const range = leaveWeekdayRange(today, { week: 8, weekdays: 1 });
    const org = await setupLeaveOrg(today);
    const doc = await submit(org, range);
    let version = doc.version;
    for (const approver of [org.teamLead, org.divisionHead, org.mgmt, org.ceo]) {
      version = (await approveDocument(approver.viewer, { instanceId: doc.instanceId, expectedVersion: version })).version;
    }

    for (const person of [org.drafter, org.ceo]) {
      const page = await loginPage(browser, baseURL, person);
      await page.goto(`/leave/${doc.leaveId}`);
      await expect(page.getByText("승인", { exact: true }).first()).toBeVisible();
      await expect(kv(page, "잔고")).toHaveCount(0);
      await expect(kv(page, "일수")).toHaveCount(1);
      const route = page.locator("dd ol").last();
      await expect(route).not.toContainText("담당 없음");
      await expect(route.getByRole("listitem")).toHaveCount(4);
      for (const item of await route.getByRole("listitem").all()) await expect(item).toContainText("· 승인");
    }
  });

  test("동시 처리 — 결재자가 연 사이 기안자가 회수하면 승인 자리 옆에 `{기안자}이/가 HH:MM에 회수함 · 새로 고침`", async ({ browser, baseURL }) => {
    const today = seoulToday();
    const range = leaveWeekdayRange(today, { week: 4, weekdays: 1 });
    const org = await setupLeaveOrg(today);
    const doc = await submit(org, range);

    const lead = await loginPage(browser, baseURL, org.teamLead);
    await lead.goto(`/leave/${doc.leaveId}`);
    await withdrawDocument(org.drafter.viewer, { instanceId: doc.instanceId, expectedVersion: doc.version });
    await waitForHydration(lead.getByRole("button", { name: /^승인/ }));
    await lead.getByRole("button", { name: /^승인/ }).click();
    const line = lead.getByRole("alert").filter({ hasText: /에 회수함/ });
    await expect(line).toContainText(new RegExp(`^${org.drafter.name}[이가] \\d{2}:\\d{2}에 회수함 ·`));
    await expect(line.getByRole("button", { name: "새로 고침" })).toBeVisible();
  });

  test("동시 처리 — 결재함 PC 행 승인이 거부되면 그 행에 서버 문구 한 줄 + 새로 고침(토스트가 아니다)", async ({ browser, baseURL }) => {
    const today = seoulToday();
    const range = leaveWeekdayRange(today, { week: 7, weekdays: 1 });
    const org = await setupLeaveOrg(today);
    const doc = await submit(org, range);

    const lead = await loginPage(browser, baseURL, org.teamLead);
    await lead.goto("/approvals");
    const row = lead.getByRole("row").filter({ hasText: documentLabel(range) });
    await withdrawDocument(org.drafter.viewer, { instanceId: doc.instanceId, expectedVersion: doc.version });
    await row.getByRole("button", { name: /^승인/ }).click();
    await expect(row).toContainText(new RegExp(`${org.drafter.name}[이가] \\d{2}:\\d{2}에 회수함`));
    await expect(row.getByRole("button", { name: "새로 고침" })).toBeVisible();
    await expect(lead.getByRole("status").filter({ hasText: "회수함" })).toHaveCount(0);
  });

  test("결재함 PC — 내 결재 글자는 그룹 머리글 한 번, 처리함 행 상태는 글자, 행 3차 반려가 같은 반려 모달을 연다", async ({ browser, baseURL }) => {
    const today = seoulToday();
    const first = leaveWeekdayRange(today, { week: 5, weekdays: 1 });
    const second = leaveWeekdayRange(today, { week: 6, weekdays: 1 });
    const org = await setupLeaveOrg(today);
    const done = await submit(org, first);
    await submit(org, second);
    await approveDocument(org.teamLead.viewer, { instanceId: done.instanceId, expectedVersion: done.version });

    const lead = await loginPage(browser, baseURL, org.teamLead);
    await lead.goto("/approvals");
    const table = lead.getByRole("table", { name: "결재함" });
    expect(((await table.innerText()).match(/내 결재/g) ?? []).length).toBe(1);
    const processedRow = table.getByRole("row").filter({ hasText: documentLabel(first) });
    await expect(processedRow).toContainText("결재 중");

    const row = table.getByRole("row").filter({ hasText: documentLabel(second) });
    await row.getByRole("button", { name: "반려" }).click();
    const dialog = lead.getByRole("dialog");
    await expect(dialog.getByRole("heading", { level: 2 })).toHaveText("연차 반려");
    await expect(dialog.getByLabel("사유")).toBeFocused();
    await lead.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(row.getByRole("button", { name: "반려" })).toBeFocused();
  });

  test("결재함 PC 행 2행과 문서 화면 잔고 행에 `잔여 초과 N일` — --warning 600(UI-SPEC S4 · 표시 규칙)", async ({ browser, baseURL }) => {
    const today = seoulToday();
    const range = leaveWeekdayRange(today, { week: 9, weekdays: 16 });
    const org = await setupLeaveOrg(today);
    const doc = await submit(org, range);

    const lead = await loginPage(browser, baseURL, org.teamLead);
    await lead.goto("/approvals");
    const row = lead.getByRole("row").filter({ hasText: documentLabel(range) });
    const over = row.getByText(/^잔여 초과 \d/);
    await expect(over).toBeVisible();
    await expect(over).toHaveCSS("color", "rgb(138, 90, 0)");
    await expect(over).toHaveCSS("font-weight", "600");

    await lead.goto(`/leave/${doc.leaveId}`);
    const docOver = lead.locator("main").getByText(/^잔여 초과 \d/);
    await expect(docOver).toBeVisible();
    await expect(docOver).toHaveCSS("font-weight", "600");
  });

  test("여러 줄 반려 사유는 문서 화면(반려 행 · 결재선)에서 줄을 지켜 보인다(사용자 결정 2026-09-29 ② · §6-3)", async ({ browser, baseURL }) => {
    const today = seoulToday();
    const range = leaveWeekdayRange(today, { week: 11, weekdays: 1 });
    const org = await setupLeaveOrg(today);
    const doc = await submit(org, range);
    await rejectDocument(org.teamLead.viewer, { instanceId: doc.instanceId, expectedVersion: doc.version, reason: "일정 겹침\n다음 주로 옮겨 신청" });

    const drafter = await loginPage(browser, baseURL, org.drafter);
    await drafter.goto(`/leave/${doc.leaveId}`);
    const lines = drafter.locator("main").getByText(/^사유 · 일정 겹침/);
    await expect(lines.first()).toBeVisible();
    for (const line of await lines.all()) {
      expect(await line.innerText()).toBe("사유 · 일정 겹침\n다음 주로 옮겨 신청");
    }
  });
});

