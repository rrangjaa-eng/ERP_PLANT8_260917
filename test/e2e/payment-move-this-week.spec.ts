import { test, expect, type Page } from "@playwright/test";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { expenses } from "@/db/schema";
import { ForbiddenError } from "@/domain/permissions/can";
import { moveToThisWeek } from "@/domain/payments";
import { payWeekGroupLabel, resolvePaySchedule } from "@/domain/payments/pay-schedule";
import { loginPage } from "./leave-org";
import { setupExpenseE2E, archiveTempRoles } from "./expense-fixture";
import {
  addDays,
  approvedDoc,
  expectTokenColor,
  groupOf,
  makeTeamPayer,
  payCalendar,
  pushedDoc,
  setVendorTerm,
  targetRow,
  targetsGrid,
} from "./pay-schedule-e2e";

// 07-16 Task 1 트레이서(D-742 · K5 · K6 · N4 · U6 · U8 · D-741): 마감을 넘겨 다음 주로 밀린 승인 건이 지급 대상 표에서 `마감 지나 밀림`(제목 아래 2행,
// warning 글자)으로 보이고, `이번 주로` 한 번으로 이번 주 그룹(`수동 지정`)에 들어가며, 표 위 결과 줄(role=status)의 `되돌리기`로 돌아온다.
// 오늘이 이번 주 지급일을 지났으면(K6) `이번 주로`는 없다 — 갈래는 시험 안에서 07-01 thisWeekPayDate로 가른다(플랜 「E2E 날짜」).
// 배지(`마감 지나 밀림` · `수동 지정`) 화면 단언은 이 스펙이 처음이다(R7 — 07-01 payment-schedule.spec은 값 · 순서만).

test.afterAll(archiveTempRoles);

async function openTargets(page: Page): Promise<void> {
  await page.goto("/expenses");
  await expect(page.getByLabel("상태")).toHaveValue("지급 대상");
  await expect(targetsGrid(page)).toBeVisible();
}

function moveStatus(page: Page) {
  return page.locator('p[role="status"]').filter({ hasText: "이번 주로" });
}

test.describe("이번 주로 · 마감 지나 밀림 (07-16 Task 1)", () => {
  test("밀린 건 → 제목 아래 `마감 지나 밀림`(warning) · `이번 주로` → 확인 창 없이 이번 주 그룹 `수동 지정` · 결과 줄 · `되돌리기`로 복귀", async ({ browser, baseURL }) => {
    const cal = await payCalendar();
    test.skip(cal.today > cal.thisPay, "이번 주 지급일이 지남 — 숨김 갈래가 덮는다");
    const fx = await setupExpenseE2E();
    const payer = await makeTeamPayer(fx);
    const { schedule } = await pushedDoc(fx, "tracer", payer, cal);
    const itemName = fx.lines.tracer.itemName;

    const page = await loginPage(browser, baseURL, payer, { width: 1280, height: 900 });
    await openTargets(page);
    const row = targetRow(page, itemName);
    expect(await groupOf(page, itemName)).toBe(payWeekGroupLabel(schedule, cal.today).label);
    const pushedTag = row.getByText("마감 지나 밀림", { exact: true });
    await expect(pushedTag).toBeVisible();
    await expectTokenColor(pushedTag, "--status-warning");
    await expect(row.getByText("수동 지정", { exact: true })).toHaveCount(0);

    let dialogs = 0;
    page.on("dialog", () => (dialogs += 1));
    await row.getByRole("button", { name: `${itemName} 이번 주로` }).click();
    await expect(moveStatus(page)).toHaveText(/^이번 주로 · 1건 옮김\s*되돌리기$/);
    // 감사 #5(P2): 옮긴 행의 버튼이 사라져도 포커스가 body로 빠지지 않는다 — 결과 줄 `되돌리기`로(상세 `자동으로 되돌리기`와 같은 꼴, SYSTEM §10).
    await expect(moveStatus(page).getByRole("button", { name: "되돌리기" })).toBeFocused();
    expect(dialogs).toBe(0);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    // 토스트 없음(N4) — 이 동작의 role=status는 표 위 결과 줄 하나뿐이다.
    await expect(page.getByRole("status").filter({ hasText: "이번 주로" })).toHaveCount(1);

    const thisWeekLabel = payWeekGroupLabel(
      resolvePaySchedule({ baseDate: cal.today, termDays: cal.cfg.termDays, manualDate: cal.thisPay, approvedAt: null, now: new Date(), lookup: cal.lookup, cfg: cal.cfg }),
      cal.today,
    ).label;
    await expect.poll(() => groupOf(page, itemName)).toBe(thisWeekLabel);
    await expect(targetRow(page, itemName).getByText("수동 지정", { exact: true })).toBeVisible();
    await expect(targetRow(page, itemName).getByText("마감 지나 밀림", { exact: true })).toHaveCount(0);

    await moveStatus(page).getByRole("button", { name: "되돌리기" }).click();
    await expect.poll(() => groupOf(page, itemName)).toBe(payWeekGroupLabel(schedule, cal.today).label);
    await expect(targetRow(page, itemName).getByText("수동 지정", { exact: true })).toHaveCount(0);
    await expect(targetRow(page, itemName).getByText("마감 지나 밀림", { exact: true })).toBeVisible();
    // 재감사 R1: 되돌린 뒤 결과 줄이 사라져도 포커스가 body로 빠지지 않는다 — 되돌린 행의 `이번 주로`로(SYSTEM §10).
    await expect(targetRow(page, itemName).getByRole("button", { name: `${itemName} 이번 주로` })).toBeFocused();
    await page.context().close();
  });

  test("일괄 `이번 주로` 부분 거부 → `이번 주로 · 1건 옮김 · 막힘 1건` + `되돌리기` · 옮긴 행 선택 해제 · 막힌 행 선택 유지 + 제목 아래 오류 줄", async ({ browser, baseURL }) => {
    const cal = await payCalendar();
    test.skip(cal.today > cal.thisPay, "이번 주 지급일이 지남 — 숨김 갈래가 덮는다");
    const fx = await setupExpenseE2E();
    const payer = await makeTeamPayer(fx);
    await pushedDoc(fx, "hold", payer, cal);
    const blocked = await pushedDoc(fx, "retry", payer, cal);
    const moved = fx.lines.hold.itemName;
    const stale = fx.lines.retry.itemName;

    const page = await loginPage(browser, baseURL, payer, { width: 1280, height: 900 });
    await openTargets(page);
    await targetsGrid(page).getByRole("checkbox", { name: `${moved} 고르기` }).check();
    await targetsGrid(page).getByRole("checkbox", { name: `${stale} 고르기` }).check();
    // 화면이 읽은 뒤 다른 사람이 그 문서를 바꿈 — version 충돌로 그 건만 거부(T-07-16-04).
    await db.update(expenses).set({ version: sql`${expenses.version} + 1` }).where(eq(expenses.id, blocked.id));

    await page.getByRole("button", { name: "이번 주로", exact: true }).click();
    await expect(moveStatus(page)).toHaveText(/^이번 주로 · 1건 옮김 · 막힘 1건\s*되돌리기$/);
    await expect(moveStatus(page).getByRole("button", { name: "되돌리기" })).toBeVisible();
    await expect(targetsGrid(page).getByRole("checkbox", { name: `${moved} 고르기` })).not.toBeChecked();
    await expect(targetsGrid(page).getByRole("checkbox", { name: `${stale} 고르기` })).toBeChecked();
    const staleError = targetRow(page, stale).getByText(/바꿈 · 새로 고침$/);
    await expect(staleError).toBeVisible();
    await expectTokenColor(staleError, "--status-danger");
    await expect(targetRow(page, stale).getByText("마감 지나 밀림", { exact: true })).toBeVisible();
    await expect(targetRow(page, moved).getByText("수동 지정", { exact: true })).toBeVisible();
    await page.context().close();
  });

  test("M-1 — 되돌리기 일부 거부 → `되돌림 1건 · 막힘 1건`(다시 시도 없음) · 막힌 행 오류 줄 · 되돌린 행은 밀림 복귀 + 포커스", async ({ browser, baseURL }) => {
    const cal = await payCalendar();
    test.skip(cal.today > cal.thisPay, "이번 주 지급일이 지남 — 숨김 갈래가 덮는다");
    const fx = await setupExpenseE2E();
    const payer = await makeTeamPayer(fx);
    await pushedDoc(fx, "hold", payer, cal);
    const changed = await pushedDoc(fx, "retry", payer, cal);
    const back = fx.lines.hold.itemName;
    const stale = fx.lines.retry.itemName;

    const page = await loginPage(browser, baseURL, payer, { width: 1280, height: 900 });
    await openTargets(page);
    await targetsGrid(page).getByRole("checkbox", { name: `${back} 고르기` }).check();
    await targetsGrid(page).getByRole("checkbox", { name: `${stale} 고르기` }).check();
    await page.getByRole("button", { name: "이번 주로", exact: true }).click();
    await expect(moveStatus(page)).toHaveText(/^이번 주로 · 2건 옮김\s*되돌리기$/);
    // 옮긴 뒤 다른 쪽에서 한 건을 바꿈 — 되돌리기는 그 건만 거부하고 나머지는 되돌린다.
    await db.update(expenses).set({ version: sql`${expenses.version} + 1` }).where(eq(expenses.id, changed.id));

    await moveStatus(page).getByRole("button", { name: "되돌리기" }).click();
    const line = page.locator('p[role="status"]').filter({ hasText: "되돌림" });
    await expect(line).toHaveText("되돌림 1건 · 막힘 1건");
    await expect(line.getByRole("button")).toHaveCount(0);
    await expect(targetRow(page, stale).getByText(/바꿈 · 새로 고침$/)).toBeVisible();
    await expect(targetRow(page, back).getByText("마감 지나 밀림", { exact: true })).toBeVisible();
    await expect(targetRow(page, back).getByRole("button", { name: `${back} 이번 주로` })).toBeFocused();
    await page.context().close();
  });

  test("L-2 — 전부 거부(같은 이유로 또 실패할 거부)면 `다시 시도` 없이 실패 줄만", async ({ browser, baseURL }) => {
    const cal = await payCalendar();
    test.skip(cal.today > cal.thisPay, "이번 주 지급일이 지남 — 숨김 갈래가 덮는다");
    const fx = await setupExpenseE2E();
    const payer = await makeTeamPayer(fx);
    const doc = await pushedDoc(fx, "tracer", payer, cal);
    const itemName = fx.lines.tracer.itemName;

    const page = await loginPage(browser, baseURL, payer, { width: 1280, height: 900 });
    await openTargets(page);
    await db.update(expenses).set({ version: sql`${expenses.version} + 1` }).where(eq(expenses.id, doc.id));
    await targetRow(page, itemName).getByRole("button", { name: `${itemName} 이번 주로` }).click();
    await expect(moveStatus(page)).toHaveText(/^이번 주로 실패 · .*바꿈 · 새로 고침$/);
    await expect(moveStatus(page).getByRole("button")).toHaveCount(0);
    await page.context().close();
  });

  test("L-1 — 저장 뒤 응답이 끊기면 `다시 시도` 없이 실패 줄 + 목록을 다시 받아 옮겨진 상태를 보인다", async ({ browser, baseURL }) => {
    const cal = await payCalendar();
    test.skip(cal.today > cal.thisPay, "이번 주 지급일이 지남 — 숨김 갈래가 덮는다");
    const fx = await setupExpenseE2E();
    const payer = await makeTeamPayer(fx);
    await pushedDoc(fx, "phone", payer, cal);
    const itemName = fx.lines.phone.itemName;

    const page = await loginPage(browser, baseURL, payer, { width: 1280, height: 900 });
    await openTargets(page);
    let dropped = false;
    await page.route("**/expenses**", async (route) => {
      const request = route.request();
      if (!dropped && request.method() === "POST" && request.headers()["next-action"]) {
        dropped = true;
        await route.fetch(); // 서버는 저장(커밋)하고 응답만 브라우저에 닿지 않는다.
        await route.abort();
        return;
      }
      await route.continue();
    });
    await targetRow(page, itemName).getByRole("button", { name: `${itemName} 이번 주로` }).click();
    await expect(moveStatus(page)).toHaveText("이번 주로 실패 · 결과를 받지 못함 · 새로 고침");
    await expect(moveStatus(page).getByRole("button")).toHaveCount(0);
    await expect(targetRow(page, itemName).getByText("수동 지정", { exact: true })).toBeVisible();
    await page.context().close();
  });

  test("U6 — `이번 주로` 두 번 빠르게 눌러도 서버 요청 한 번 · 요청 중 aria-busy", async ({ browser, baseURL }) => {
    const cal = await payCalendar();
    test.skip(cal.today > cal.thisPay, "이번 주 지급일이 지남 — 숨김 갈래가 덮는다");
    const fx = await setupExpenseE2E();
    const payer = await makeTeamPayer(fx);
    await pushedDoc(fx, "phone", payer, cal);
    const itemName = fx.lines.phone.itemName;

    const page = await loginPage(browser, baseURL, payer, { width: 1280, height: 900 });
    await openTargets(page);
    let actionPosts = 0;
    await page.route("**/expenses**", async (route) => {
      const request = route.request();
      if (request.method() === "POST" && request.headers()["next-action"]) {
        actionPosts += 1;
        await new Promise((resolve) => setTimeout(resolve, 800));
      }
      await route.continue();
    });
    const button = targetRow(page, itemName).getByRole("button", { name: `${itemName} 이번 주로` });
    await button.dblclick();
    await expect(button).toHaveAttribute("aria-busy", "true");
    await expect(button).toHaveAttribute("aria-disabled", "true");
    await expect(moveStatus(page)).toContainText("이번 주로 · 1건 옮김");
    expect(actionPosts).toBe(1);
    await page.context().close();
  });

  test("K6 — 이번 주 지급일이 지났으면 행 · 일괄 행동 어디에도 `이번 주로` 없음", async ({ browser, baseURL }) => {
    const cal = await payCalendar();
    test.skip(cal.today <= cal.thisPay, "이번 주 지급일 전 — 옮기기 갈래가 덮는다");
    const fx = await setupExpenseE2E();
    const payer = await makeTeamPayer(fx);
    await pushedDoc(fx, "tracer", payer, cal);
    const itemName = fx.lines.tracer.itemName;

    const page = await loginPage(browser, baseURL, payer, { width: 1280, height: 900 });
    await openTargets(page);
    await expect(targetRow(page, itemName).getByText("마감 지나 밀림", { exact: true })).toBeVisible();
    await targetsGrid(page).getByRole("checkbox", { name: `${itemName} 고르기` }).check();
    await expect(page.getByRole("button", { name: /이번 주로/ })).toHaveCount(0);
    await page.context().close();
  });

  test("D-741 — 기한 안 금요일이 없는 건(기한 6일 · 금요일 기준)은 실제 요일 머리글 아래 · `마감 지나 밀림` · `이번 주로` 없음", async ({ browser, baseURL }) => {
    const cal = await payCalendar();
    const fx = await setupExpenseE2E();
    const payer = await makeTeamPayer(fx);
    await setVendorTerm(fx, 6);
    // 기준일 = 지급 요일(기한 창 (기준, 기준+6]에 지급 요일 없음) — 마감이 지금보다 한 시간 넘게 남은 첫 주.
    const now = Date.now();
    let base = cal.today;
    for (let step = 0; step < 21; step += 1) {
      const probe = resolvePaySchedule({ baseDate: base, termDays: 6, manualDate: null, approvedAt: null, now: new Date(), lookup: cal.lookup, cfg: cal.cfg });
      if (probe.pushReason === "no-slot" && probe.cutoffAt.getTime() > now + 3_600_000) break;
      base = addDays(base, 1);
    }
    const { approvedAt } = await approvedDoc(fx, "worst", payer, { issuedOn: base });
    const schedule = resolvePaySchedule({ baseDate: base, termDays: 6, manualDate: null, approvedAt, now: new Date(), lookup: cal.lookup, cfg: cal.cfg });
    expect(schedule.pushReason).toBe("no-slot");
    const itemName = fx.lines.worst.itemName;

    const page = await loginPage(browser, baseURL, payer, { width: 1280, height: 900 });
    await openTargets(page);
    expect(await groupOf(page, itemName)).toBe(payWeekGroupLabel(schedule, cal.today).label);
    await expect(targetRow(page, itemName).getByText("마감 지나 밀림", { exact: true })).toHaveCount(0);
    await expect(targetRow(page, itemName).getByRole("button", { name: /이번 주로/ })).toHaveCount(0);
    await page.context().close();
  });

  test("지급 권한 없는 계정 → 지급 대상 보기 없음 · 이번 주로 서버 거부", async ({ browser, baseURL }) => {
    const cal = await payCalendar();
    const fx = await setupExpenseE2E();
    const payer = await makeTeamPayer(fx);
    const { id } = await pushedDoc(fx, "closed", payer, cal);

    const page = await loginPage(browser, baseURL, fx.pm, { width: 1280, height: 900 });
    await page.goto(`/expenses?${new URLSearchParams({ status: "지급 대상" })}`);
    await expect(page.getByRole("heading", { name: "지출결의" })).toBeVisible();
    await expect(targetsGrid(page)).toHaveCount(0);
    await page.context().close();
    const [doc] = await db.select({ version: expenses.version }).from(expenses).where(eq(expenses.id, id));
    await expect(moveToThisWeek(fx.pm.viewer, { items: [{ expenseId: id, version: doc?.version ?? 0 }] })).rejects.toBeInstanceOf(ForbiddenError);
  });
});
