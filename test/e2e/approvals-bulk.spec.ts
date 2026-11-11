import { test, expect, type Locator, type Page } from "@playwright/test";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { approvalInstances, approvalRoutes, approvalSteps } from "@/db/schema";
import { approveDocument, withdrawDocument, NotCurrentHolderError } from "@/domain/approvals";
import "@/domain/leave";
import { submitLeave } from "@/domain/leave";
import { requestLeaveCancel } from "@/domain/leave/cancel";
import { resubmitLeave } from "@/domain/leave/resubmit";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { getSettingValue, setSettingValue } from "@/domain/settings/registry";
import { APPROVAL_ROUTE_LEAVE_SELF_APPROVAL } from "@/domain/settings/keys";
import { seoulToday } from "@/lib/dates";
import { leaveWeekdayRange } from "./leave-dates";
import { documentLabel, loginPage, makePerson, setupLeaveOrg, waitForHydration, type Person } from "./leave-org";
import { setupExpenseE2E, submitLineExpense } from "./expense-fixture";

// 07.2-16(S13 · PU15 · 16 · 17 · D-7266~7273 · DC-8): 결재함 일괄 승인 · 반려. 1차는 필터 줄 오른쪽 끝 `승인 N`(늘 렌더 · 0건이면 aria-disabled),
// 선택 막대는 요약 + 2차 `반려 N`만, 확인 1회, 결과 글자는 필터 줄 필터 자리(aria-live). 막힌 행은 자리를 지키고 이유를 단다.
// 연차는 도메인 함수로 바로 올린다(브라우저 제출은 지출결의만 — 막대 금액 조각).

const DESKTOP = { width: 1280, height: 800 };
const RESULT = (verb: string, processed: number, blocked = 0) =>
  new RegExp(`^\\d{2}:\\d{2} ${verb} ${processed}건${blocked > 0 ? ` · 막힘 ${blocked}건` : ""}$`);

type Submitted = { leaveId: string; instanceId: string; version: number; label: string };

async function leave(drafter: Person, week: number, weekdays = 1): Promise<Submitted> {
  const range = leaveWeekdayRange(seoulToday(), { week, weekdays });
  const submitted = await submitLeave(drafter.viewer, { kind: "full_day", startDate: range.startDate, endDate: range.endDate, half: "" });
  return { ...submitted, label: documentLabel(range) };
}

// 지금 담당이 누구든 people 중 승인할 수 있는 사람이 최종까지 승인한다.
async function approveThrough(people: Viewer[], instanceId: string, version: number): Promise<void> {
  let current = version;
  for (let guard = 0; guard < 8; guard++) {
    let moved = false;
    for (const person of people) {
      try {
        const result = await approveDocument(person, { instanceId, expectedVersion: current });
        current = result.version;
        moved = true;
        if (result.final) return;
        break;
      } catch (error) {
        if (!(error instanceof NotCurrentHolderError)) throw error;
      }
    }
    if (!moved) throw new Error("승인할 사람 없음");
  }
  throw new Error("최종 승인에 닿지 않음");
}

function primary(page: Page): Locator {
  // 닫힌 확인 창(dialog) 안의 1차는 빼고 필터 줄 1차만 — filter({ hasNot })는 조상이 아니라 자손을 보므로 CSS :not()로 거른다.
  return page.locator('[data-ui="primary-button"]:not(dialog [data-ui="primary-button"])');
}

function bar(page: Page): Locator {
  return page.locator("p").filter({ hasText: /^선택 \d+건/ }).locator("..");
}

async function describedText(page: Page, target: Locator): Promise<string> {
  const ids = (await target.getAttribute("aria-describedby")) ?? "";
  const texts = await Promise.all(ids.split(/\s+/).filter(Boolean).map((id) => page.locator(`[id="${id}"]`).innerText()));
  return texts.join(" ");
}

function rowOf(page: Page, label: string): Locator {
  return page.getByRole("row").filter({ has: page.getByRole("checkbox", { name: `${label} 고르기` }) });
}

// 요소 글자 색이 토큰 색과 같은가 — 같은 자리에 토큰 색 글자를 잠깐 넣어 계산값끼리 맞댄다.
async function hasTokenColor(target: Locator, token: string): Promise<boolean> {
  return target.evaluate((element, name) => {
    const probe = document.createElement("span");
    probe.style.color = `var(${name})`;
    element.appendChild(probe);
    const expected = getComputedStyle(probe).color;
    probe.remove();
    return getComputedStyle(element).color === expected;
  }, token);
}

async function reasonsOf(instanceId: string): Promise<(string | null)[]> {
  const rows = await db
    .select({ reason: approvalSteps.reason })
    .from(approvalSteps)
    .innerJoin(approvalRoutes, eq(approvalRoutes.id, approvalSteps.routeId))
    .where(and(eq(approvalRoutes.instanceId, instanceId), eq(approvalSteps.action, "rejected")));
  return rows.map((row) => row.reason);
}

test.describe("결재함 일괄 승인 · 반려 (07.2-16 S13)", () => {
  test("트레이서 — 두 건 고르기 → 필터 줄 1차 `승인 2` → 확인 1회 → 결과 `HH:mm 승인 2건` · 포커스는 1차(`결재할 건 없음`)", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    await submitLineExpense(browser, baseURL, fx, "tracer");
    await submitLineExpense(browser, baseURL, fx, "hold");
    const done = await leave(fx.pm, 4);
    await approveDocument(fx.lead.viewer, { instanceId: done.instanceId, expectedVersion: done.version });

    const page = await loginPage(browser, baseURL, fx.lead, DESKTOP);
    await page.goto("/approvals");
    const first = page.getByRole("checkbox", { name: `지출결의 · ${fx.projectName} · ${fx.lines.tracer.itemName} 고르기` });
    const second = page.getByRole("checkbox", { name: `지출결의 · ${fx.projectName} · ${fx.lines.hold.itemName} 고르기` });
    await waitForHydration(first);

    // 고른 건 0 — 1차는 늘 있고 aria-disabled + `고른 건 없음` · 막대 DOM 0.
    await expect(primary(page)).toHaveCount(1);
    await expect(primary(page)).toHaveText(/^승인/);
    await expect(primary(page)).toHaveAttribute("aria-disabled", "true");
    expect(await describedText(page, primary(page))).toContain("고른 건 없음");
    await expect(bar(page)).toHaveCount(0);

    await first.check();
    await second.check();
    await expect(primary(page)).toContainText("승인 2");
    await expect(primary(page)).toContainText("Ctrl+Enter");
    await expect(primary(page)).not.toHaveAttribute("aria-disabled", "true");
    await expect(page.locator("p").filter({ hasText: /^선택 2건/ })).toHaveText("선택 2건 · 지출결의 24,800,000");
    await expect(bar(page).getByRole("button", { name: "반려 2" })).toHaveCount(1);
    await expect(bar(page).locator('[data-ui="primary-button"]')).toHaveCount(0);
    // 막대는 DOM에서 필터 줄 뒤 · 표 앞.
    const order = await page.evaluate(() => {
      const table = document.querySelector("table");
      const summary = [...document.querySelectorAll("p")].find((element) => /^선택 \d+건/.test(element.textContent ?? ""));
      return summary && table ? summary.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING : 0;
    });
    expect(order).toBeTruthy();

    await primary(page).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("일괄 승인");
    await expect(dialog).toContainText("2건 · 지출결의 24,800,000");
    await dialog.getByRole("button", { name: /^승인 2건/ }).click();

    await expect(page.getByRole("status").filter({ hasText: /승인 \d+건/ })).toHaveText(RESULT("승인", 2));
    await expect(page.getByRole("checkbox", { name: /고르기$/ })).toHaveCount(0);
    await expect(bar(page)).toHaveCount(0);
    await expect(primary(page)).toBeFocused();
    await expect(primary(page)).toHaveAttribute("aria-disabled", "true");
    expect(await describedText(page, primary(page))).toContain("결재할 건 없음");
    await expect(page.getByRole("status").filter({ hasText: "승인 · " })).toHaveCount(0);
  });

  test("처리함 행만 있는 계정 — 체크박스 0 · 막대 0 · 1차 `승인` aria-disabled + `결재할 건 없음`", async ({ browser, baseURL }) => {
    const org = await setupLeaveOrg(seoulToday());
    const done = await leave(org.drafter, 4);
    await approveDocument(org.teamLead.viewer, { instanceId: done.instanceId, expectedVersion: done.version });

    const page = await loginPage(browser, baseURL, org.teamLead, DESKTOP);
    await page.goto("/approvals");
    await expect(page.getByRole("row").filter({ hasText: done.label })).toHaveCount(1);
    await expect(page.locator('input[type="checkbox"]')).toHaveCount(0);
    await expect(bar(page)).toHaveCount(0);
    await expect(primary(page)).toHaveAttribute("aria-disabled", "true");
    const described = await describedText(page, primary(page));
    expect(described).toContain("결재할 건 없음");
    expect(described).not.toContain("고른 건 없음");
  });

  test("일괄 반려 — 빈 사유면 1차 막힘 · 한 사유로 `반려 3건` → 세 문서 모두 같은 사유", async ({ browser, baseURL }) => {
    const org = await setupLeaveOrg(seoulToday());
    const docs = [await leave(org.drafter, 4), await leave(org.drafter, 5), await leave(org.drafter, 6)];

    const page = await loginPage(browser, baseURL, org.teamLead, DESKTOP);
    await page.goto("/approvals");
    const boxes = docs.map((doc) => page.getByRole("checkbox", { name: `${doc.label} 고르기` }));
    await waitForHydration(boxes[0]!);
    for (const box of boxes) await box.check();
    await bar(page).getByRole("button", { name: "반려 3" }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("일괄 반려");
    const confirm = dialog.getByRole("button", { name: /^반려 3건/ });
    await expect(confirm).toHaveAttribute("aria-disabled", "true");
    await expect(dialog).toContainText("사유 없음 · 사유 적기");
    await dialog.getByLabel("사유").fill("일정 다시 맞춤");
    await confirm.click();

    await expect(page.getByRole("status").filter({ hasText: /반려 \d+건/ })).toHaveText(RESULT("반려", 3));
    for (const doc of docs) expect(await reasonsOf(doc.instanceId)).toEqual(["일정 다시 맞춤"]);
  });

  // #377 리뷰 L1: 본인 기안(본인 승인 차례)은 승인만 되고 반려는 단건과 같이 막힌다 — 일괄 반려 수 · 창 · 보내는 행에서 빠진다.
  test("본인 기안 + 다른 사람 문서 고르기 → 막대 `반려 1` · 반려는 다른 문서만 · 본인 기안은 고른 채 `승인 1`", async ({ browser, baseURL }) => {
    const original = await getSettingValue(APPROVAL_ROUTE_LEAVE_SELF_APPROVAL);
    try {
      await setSettingValue(SYSTEM_VIEWER, APPROVAL_ROUTE_LEAVE_SELF_APPROVAL, "self_approve");
      const org = await setupLeaveOrg(seoulToday());
      const own = await leave(org.teamLead, 7);
      const other = await leave(org.drafter, 8);

      const page = await loginPage(browser, baseURL, org.teamLead, DESKTOP);
      await page.goto("/approvals");
      const ownBox = page.getByRole("checkbox", { name: `${own.label} 고르기` });
      const otherBox = page.getByRole("checkbox", { name: `${other.label} 고르기` });
      await waitForHydration(ownBox);
      await ownBox.check();
      await expect(primary(page)).toContainText("승인 1");
      await expect(bar(page).getByRole("button", { name: /^반려/ })).toHaveCount(0);

      await otherBox.check();
      await expect(primary(page)).toContainText("승인 2");
      await bar(page).getByRole("button", { name: "반려 1" }).click();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toContainText("일괄 반려");
      await dialog.getByLabel("사유").fill("일정 다시 맞춤");
      await dialog.getByRole("button", { name: /^반려 1건/ }).click();

      await expect(page.getByRole("status").filter({ hasText: /반려 \d+건/ })).toHaveText(RESULT("반려", 1));
      expect(await reasonsOf(other.instanceId)).toEqual(["일정 다시 맞춤"]);
      expect(await reasonsOf(own.instanceId)).toEqual([]);
      await expect(ownBox).toBeChecked();
      await expect(primary(page)).toContainText("승인 1");
    } finally {
      await setSettingValue(SYSTEM_VIEWER, APPROVAL_ROUTE_LEAVE_SELF_APPROVAL, original);
    }
  });

  // 독립 DOM 감사 결함 ①: 터치(coarse) 태블릿에서 머리글 `이 쪽 전체 고르기` 눌림 면이 44×13이었다 — 행 체크박스 label과 같이 44×44.
  test("터치 태블릿(768 · 700) — 머리글 · 행 체크박스 label 모두 44×44 이상", async ({ browser, baseURL }) => {
    const org = await setupLeaveOrg(seoulToday());
    const doc = await leave(org.drafter, 4);

    const context = await browser.newContext({ baseURL, viewport: { width: 768, height: 900 }, hasTouch: true });
    const page = await context.newPage();
    await page.goto("/login");
    await page.getByLabel("이메일").fill(org.teamLead.email);
    await page.getByLabel("비밀번호").fill(org.teamLead.password);
    await page.getByRole("button", { name: "로그인" }).click();
    await expect(page).toHaveURL(/\/account$/);
    await page.goto("/approvals");
    const head = page.getByRole("checkbox", { name: "이 쪽 전체 고르기" });
    const row = page.getByRole("checkbox", { name: `${doc.label} 고르기` });
    await waitForHydration(row);
    expect(await page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true);

    for (const width of [768, 700]) {
      await page.setViewportSize({ width, height: 900 });
      for (const box of [head, row]) {
        const size = await box.locator("xpath=..").evaluate((label) => {
          const rect = label.getBoundingClientRect();
          return { tag: label.tagName, width: rect.width, height: rect.height };
        });
        expect(size.tag).toBe("LABEL");
        expect(size.width).toBeGreaterThanOrEqual(44);
        expect(size.height).toBeGreaterThanOrEqual(44);
      }
    }
    await context.close();
  });

  // /qa D-1: 폰에서 선택 열을 숨기면 첫 보이는 칸(문서)이 ui/table의 `첫 칸 --s-4`를 못 받아 8px로 남았다 — 다른 폰 목록과 같은 --s-4.
  test("폰 375 · 320 — 선택 열 숨김 뒤 첫 보이는 칸 padding-left = --s-4(다른 폰 목록과 같음)", async ({ browser, baseURL }) => {
    const org = await setupLeaveOrg(seoulToday());
    const doc = await leave(org.drafter, 4);

    const page = await loginPage(browser, baseURL, org.teamLead, { width: 375, height: 800 });
    await page.goto("/approvals");
    const row = page.getByRole("row").filter({ hasText: doc.label });
    await expect(row).toHaveCount(1);
    for (const width of [375, 320]) {
      await page.setViewportSize({ width, height: 800 });
      const measured = await row.evaluate((tr) => {
        const probe = document.createElement("div");
        probe.style.paddingLeft = "var(--s-4)";
        tr.closest("table")?.parentElement?.appendChild(probe);
        const expected = getComputedStyle(probe).paddingLeft;
        probe.remove();
        const visible = [...tr.children].filter((cell) => getComputedStyle(cell).display !== "none");
        return { expected, first: visible[0] ? getComputedStyle(visible[0]).paddingLeft : null };
      });
      expect(measured.expected).toBe("16px");
      expect(measured.first).toBe(measured.expected);
    }
  });

  // Codex P2(2): 일괄 반려한 문서를 기안자가 다시 올리면(같은 인스턴스 id · 새 version) 같은 화면의 다음 새로 고침에서 `내 결재`로 돌아온다 —
  // 처리한 행 숨김은 처리한 그 version에만 건다.
  test("일괄 반려 뒤 기안자가 다시 올림 → 같은 화면에서 다음 새로 고침 때 그 문서가 `내 결재`에 다시 보인다", async ({ browser, baseURL }) => {
    const org = await setupLeaveOrg(seoulToday());
    const rejected = await leave(org.drafter, 4);
    const other = await leave(org.drafter, 5);

    const page = await loginPage(browser, baseURL, org.teamLead, DESKTOP);
    await page.goto("/approvals");
    const box = page.getByRole("checkbox", { name: `${rejected.label} 고르기` });
    await waitForHydration(box);
    await box.check();
    await bar(page).getByRole("button", { name: "반려 1" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("사유").fill("일정 다시 맞춤");
    await dialog.getByRole("button", { name: /^반려 1건/ }).click();
    await expect(page.getByRole("status").filter({ hasText: /반려 \d+건/ })).toHaveText(RESULT("반려", 1));
    await expect(box).toHaveCount(0);

    const [instance] = await db.select().from(approvalInstances).where(eq(approvalInstances.id, rejected.instanceId));
    const range = leaveWeekdayRange(seoulToday(), { week: 4, weekdays: 1 });
    await resubmitLeave(org.drafter.viewer, {
      leaveId: rejected.leaveId,
      expectedVersion: instance!.version,
      input: { kind: "full_day", startDate: range.startDate, endDate: range.endDate, half: "" },
    });

    // 같은 화면에서 다른 행 단건 승인 → 새로 고침(화면 상태는 그대로).
    await rowOf(page, other.label).getByRole("button", { name: /^승인/ }).click();
    await expect(rowOf(page, other.label)).toHaveCount(0);
    await expect(page.getByRole("checkbox", { name: `${rejected.label} 고르기` })).toHaveCount(1);
  });

  test("잔여 초과 연차 포함 — 막대 `잔여 초과 1건`(warning) · 승인 창 결과 줄 `잔여 초과 연차 1건 포함` · 승인됨", async ({ browser, baseURL }) => {
    const org = await setupLeaveOrg(seoulToday());
    const over = await leave(org.drafter, 4, 20);
    // 같은 기안자의 다른 연차는 진행 중 20일을 뺀 잔고로 재어 함께 잔여 초과가 된다 — 작은 건은 다른 기안자.
    const other = await makePerson("기안", "role-pm", org.teamId, `${seoulToday().slice(0, 4)}-01-01`);
    const small = await leave(other, 10);

    const page = await loginPage(browser, baseURL, org.teamLead, DESKTOP);
    await page.goto("/approvals");
    await expect(page.getByRole("row").filter({ hasText: over.label })).toContainText("잔여 초과");
    const boxes = [over, small].map((doc) => page.getByRole("checkbox", { name: `${doc.label} 고르기` }));
    await waitForHydration(boxes[0]!);
    for (const box of boxes) await box.check();
    const warning = bar(page).getByText("잔여 초과 1건", { exact: true });
    await expect(warning).toBeVisible();
    expect(await hasTokenColor(warning, "--status-warning")).toBe(true);

    await primary(page).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("잔여 초과 연차 1건 포함");
    await dialog.getByRole("button", { name: /^승인 2건/ }).click();
    await expect(page.getByRole("status").filter({ hasText: /승인 \d+건/ })).toHaveText(RESULT("승인", 2));
  });

  test("부분 성공 — 한 건을 기안자가 먼저 회수 → `HH:mm 승인 2건 · 막힘 1건` · 막힌 행 유지 + 엔진 글자(danger) · 3차 `새로 고침` · 포커스 = 그 체크박스", async ({ browser, baseURL }) => {
    const org = await setupLeaveOrg(seoulToday());
    const docs = [await leave(org.drafter, 4), await leave(org.drafter, 5), await leave(org.drafter, 6)];

    const page = await loginPage(browser, baseURL, org.teamLead, DESKTOP);
    await page.goto("/approvals");
    const boxes = docs.map((doc) => page.getByRole("checkbox", { name: `${doc.label} 고르기` }));
    await waitForHydration(boxes[0]!);
    for (const box of boxes) await box.check();
    // 화면이 받은 version이 낡는다 — 기안자가 가운데 한 건을 회수.
    await withdrawDocument(org.drafter.viewer, { instanceId: docs[1]!.instanceId, expectedVersion: docs[1]!.version });

    await primary(page).click();
    await page.getByRole("dialog").getByRole("button", { name: /^승인 3건/ }).click();

    await expect(page.getByRole("status").filter({ hasText: /승인 \d+건/ })).toHaveText(RESULT("승인", 2, 1));
    const blockedRow = rowOf(page, docs[1]!.label);
    await expect(blockedRow).toHaveCount(1);
    const reason = page.getByText(new RegExp(`^${org.drafter.name}[이가] \\d{2}:\\d{2}에 회수함 · 새로 고침$`));
    await expect(reason).toBeVisible();
    await expect(reason.getByRole("link", { name: "새로 고침" })).toHaveCount(1);
    expect(await hasTokenColor(reason, "--status-danger")).toBe(true);
    await expect(page.getByRole("checkbox", { name: `${docs[1]!.label} 고르기` })).toBeFocused();
    // 막힌 행 배경 칠 0(고른 행 면도 아니다 — 선택은 풀렸다).
    await expect(page.getByRole("checkbox", { name: `${docs[1]!.label} 고르기` })).not.toBeChecked();
    await expect(rowOf(page, docs[0]!.label)).toHaveCount(0);
  });

  test("전체 실패 — 서버 액션 POST가 끊기면 창이 열린 채 `일괄 승인 실패 · 다시 시도` · 선택 · 막대 그대로 · 처리 0", async ({ browser, baseURL }) => {
    const org = await setupLeaveOrg(seoulToday());
    const docs = [await leave(org.drafter, 4), await leave(org.drafter, 5)];

    const page = await loginPage(browser, baseURL, org.teamLead, DESKTOP);
    await page.goto("/approvals");
    const boxes = docs.map((doc) => page.getByRole("checkbox", { name: `${doc.label} 고르기` }));
    await waitForHydration(boxes[0]!);
    for (const box of boxes) await box.check();
    await page.route("**/*", async (route) => {
      if (route.request().method() === "POST" && route.request().headers()["next-action"]) return route.abort();
      return route.continue();
    });

    await primary(page).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: /^승인 2건/ }).click();
    await expect(dialog).toContainText("일괄 승인 실패 · 다시 시도");
    await expect(dialog).toBeVisible();
    await expect(bar(page)).toContainText("선택 2건");
    for (const box of boxes) await expect(box).toBeChecked();
    for (const doc of docs) await expect(rowOf(page, doc.label)).toHaveCount(1);
  });

  test("연차 취소 요청 + 연차 2일 — 막대 연차 조각은 `연차 2일`(취소 요청 일수 미포함) · `선택 2건`", async ({ browser, baseURL }) => {
    const org = await setupLeaveOrg(seoulToday());
    const approved = await leave(org.drafter, 4);
    await approveThrough([org.teamLead.viewer, org.divisionHead.viewer, org.mgmt.viewer, org.ceo.viewer], approved.instanceId, approved.version);
    await requestLeaveCancel(org.drafter.viewer, { leaveId: approved.leaveId, reason: "일정 바뀜" });
    const two = await leave(org.drafter, 8, 2);

    const page = await loginPage(browser, baseURL, org.teamLead, DESKTOP);
    await page.goto("/approvals");
    const rowBoxes = page.locator("tbody").getByRole("checkbox");
    await expect(rowBoxes).toHaveCount(2);
    await waitForHydration(rowBoxes.first());
    for (let index = 0; index < 2; index++) await rowBoxes.nth(index).check();
    await expect(page.locator("p").filter({ hasText: /^선택 2건/ })).toHaveText("선택 2건 · 연차 2일");
    await expect(page.getByRole("row").filter({ hasText: two.label })).toHaveCount(1);
  });

  test("105건 — 머리글 전체 고르기는 100건까지 · 나머지 aria-disabled + `100건까지` · 키보드만 승인 · 폭별 노출", async ({ browser, baseURL }) => {
    test.setTimeout(240_000);
    const org = await setupLeaveOrg(seoulToday());
    const yearStart = `${seoulToday().slice(0, 4)}-01-01`;
    const drafters: Person[] = [org.drafter];
    for (let index = 0; index < 3; index++) drafters.push(await makePerson("기안", "role-pm", org.teamId, yearStart));
    for (let index = 0; index < 105; index++) await leave(drafters[index % 4]!, Math.floor(index / 4));

    const page = await loginPage(browser, baseURL, org.teamLead, DESKTOP);
    await page.goto("/approvals");
    const rowBoxes = page.locator("tbody").getByRole("checkbox");
    await expect(rowBoxes).toHaveCount(105);
    const head = page.getByRole("checkbox", { name: "이 쪽 전체 고르기" });
    await waitForHydration(head);
    await head.check();
    await expect(primary(page)).toContainText("승인 100");
    const disabled = page.locator('tbody input[type="checkbox"][aria-disabled="true"]');
    await expect(disabled).toHaveCount(5);
    expect(await describedText(page, disabled.first())).toContain("100건까지");

    // 폭별 — 700 · 768은 1차가 보이고, 699 · 375는 체크박스 · 막대 · 1차가 안 보인다.
    for (const width of [768, 700]) {
      await page.setViewportSize({ width, height: 800 });
      await expect(primary(page)).toBeVisible();
      await expect(rowBoxes.first()).toBeVisible();
      await expect(bar(page).getByRole("button", { name: "반려 100" })).toBeVisible();
    }
    for (const width of [699, 375]) {
      await page.setViewportSize({ width, height: 800 });
      await expect(primary(page)).toBeHidden();
      await expect(bar(page)).toBeHidden();
      expect(await page.locator('input[type="checkbox"]').evaluateAll((elements) => elements.filter((element) => (element as HTMLElement).offsetParent !== null).length)).toBe(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    }
    await page.setViewportSize(DESKTOP);

    // 키보드만 — 머리글 풀고 Tab으로 첫 행 체크박스 → Space → Ctrl+Enter(표 안 = 1차) → Ctrl+Enter(확인).
    await head.uncheck();
    await head.focus();
    await page.keyboard.press("Tab");
    await expect(rowBoxes.first()).toBeFocused();
    await page.keyboard.press("Space");
    await expect(primary(page)).toContainText("승인 1");
    await page.keyboard.press("Control+Enter");
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("일괄 승인");
    await page.keyboard.press("Control+Enter");
    await expect(page.getByRole("status").filter({ hasText: /승인 \d+건/ })).toHaveText(RESULT("승인", 1));
    await expect(rowBoxes).toHaveCount(104);

    // 100건 한 번 — 확인부터 결과 글자까지 30초 안(PLAN 07.2-16 「100건 일괄 실측 시간」).
    await head.check();
    await expect(primary(page)).toContainText("승인 100");
    await primary(page).click();
    const started = Date.now();
    await page.getByRole("dialog").getByRole("button", { name: /^승인 100건/ }).click();
    await expect(page.getByRole("status").filter({ hasText: /승인 \d+건/ })).toHaveText(RESULT("승인", 100), { timeout: 30_000 });
    const elapsed = Date.now() - started;
    console.log(`[07.2-16] 100건 일괄 승인 ${elapsed}ms`);
    expect(elapsed).toBeLessThanOrEqual(30_000);
    await expect(rowBoxes).toHaveCount(4);
  });
});
