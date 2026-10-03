import { test, expect, type Page } from "@playwright/test";
import { AxeBuilder } from "@axe-core/playwright";
import "@/domain/leave";
import { approveDocument } from "@/domain/approvals";
import { submitLeave } from "@/domain/leave";
import { seoulToday } from "@/lib/dates";
import { leaveWeekdayRange } from "./leave-dates";
import { documentLabel, loginPage, setupLeaveOrg, type LeaveOrg } from "./leave-org";

// 04.1-05 Task 3(UI-SPEC a11y backstop S1 · S4 · S5 · S6): 결재함 · 반려 확인 · 결재 시트 · 문서 화면에서 axe 위반 0,
// 결재함 caption `결재함`, 시트 · 확인의 첫 포커스 · Esc 닫힘 · 트리거 복귀, 행 행동의 aria-describedby(T15),
// 폰 행 탭 대상의 역할(T4). test/e2e/a11y.spec.ts는 고치지 않는다(그 파일의 화면 배열은 여섯 개 고정).

type Range = { startDate: string; endDate: string };

// 확인 창 · 시트는 열림 모션(opacity 0 -> 1, --dur-sheet)이 도는 동안 axe가 글자 · 면 색을 혼합값으로 재서 정상 대비(--text-faint on --surface-base 5.35)도 4.0으로 나온다.
// 유한 모션이 끝난 정지 상태를 잰다(규칙은 그대로 전부 건다). 무한 모션(스피너)은 기다리지 않는다.
async function expectNoAxeViolations(page: Page): Promise<void> {
  await expect
    .poll(() =>
      page.evaluate(
        () => document.getAnimations().filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity && animation.playState === "running").length,
      ),
    )
    .toBe(0);
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations.map((violation) => `${violation.id}: ${violation.nodes.map((node) => node.target.join(" ")).join(", ")}`)).toEqual([]);
}

async function twoPendingOneProcessed(org: LeaveOrg, ranges: [Range, Range, Range]) {
  const docs = [];
  for (const range of ranges) {
    docs.push(await submitLeave(org.drafter.viewer, { kind: "full_day", startDate: range.startDate, endDate: range.endDate, half: "" }));
  }
  const processed = docs[2];
  if (!processed) throw new Error("문서 없음");
  await approveDocument(org.teamLead.viewer, { instanceId: processed.instanceId, expectedVersion: processed.version });
  return docs;
}

test.describe("결재 화면 접근성 (04.1-05)", () => {
  test("PC 결재함 · 반려 확인 · 문서 화면 — axe 0, caption, 행 행동 aria-describedby, 확인 첫 포커스 · Esc · 트리거 복귀", async ({ browser, baseURL }) => {
    const today = seoulToday();
    const ranges: [Range, Range, Range] = [
      leaveWeekdayRange(today, { week: 10, weekdays: 1 }),
      leaveWeekdayRange(today, { week: 11, weekdays: 1 }),
      leaveWeekdayRange(today, { week: 12, weekdays: 1 }),
    ];
    const org = await setupLeaveOrg(today);
    const docs = await twoPendingOneProcessed(org, ranges);

    const lead = await loginPage(browser, baseURL, org.teamLead);
    await lead.goto("/approvals");
    await expect(lead.getByRole("table", { name: "결재함" })).toBeVisible();
    await expectNoAxeViolations(lead);

    // 행마다 승인 · 반려의 aria-describedby가 같은 행 문서 칸을 가리키고 id는 행마다 다르다(T15).
    const ids = new Set<string>();
    for (const range of ranges.slice(0, 2)) {
      const row = lead.getByRole("row").filter({ hasText: documentLabel(range) });
      for (const name of [/^승인/, /^반려/]) {
        const describedBy = await row.getByRole("button", { name }).getAttribute("aria-describedby");
        expect(describedBy).toBeTruthy();
        const target = lead.locator(`[id="${describedBy}"]`);
        await expect(target).toHaveText(documentLabel(range), { useInnerText: true });
        await expect(row.locator(`[id="${describedBy}"]`)).toHaveCount(1);
        ids.add(describedBy ?? "");
      }
    }
    expect(ids.size).toBe(2);

    const row = lead.getByRole("row").filter({ hasText: documentLabel(ranges[0]) });
    const trigger = row.getByRole("button", { name: /^반려/ });
    await trigger.click();
    const dialog = lead.getByRole("dialog");
    await expect(dialog.getByLabel("사유")).toBeFocused();
    await expectNoAxeViolations(lead);
    await lead.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();

    await lead.goto(`/leave/${docs[0]?.leaveId}`);
    await expect(lead.getByRole("button", { name: /^승인/ })).toBeVisible();
    await expectNoAxeViolations(lead);
  });

  test("폰 375 — 내 결재 행은 button + aria-haspopup, 처리함 행은 link, 결재 시트 axe 0 · 첫 포커스 승인 · Esc · 트리거 복귀", async ({ browser, baseURL }) => {
    const today = seoulToday();
    const ranges: [Range, Range, Range] = [
      leaveWeekdayRange(today, { week: 13, weekdays: 1 }),
      leaveWeekdayRange(today, { week: 14, weekdays: 1 }),
      leaveWeekdayRange(today, { week: 15, weekdays: 1 }),
    ];
    const org = await setupLeaveOrg(today);
    await twoPendingOneProcessed(org, ranges);

    const lead = await loginPage(browser, baseURL, org.teamLead, { width: 375, height: 800 });
    await lead.goto("/approvals");
    const trigger = lead.getByRole("button", { name: documentLabel(ranges[0]) });
    await expect(trigger).toHaveAttribute("aria-haspopup", "dialog");
    await expect(lead.getByRole("link", { name: documentLabel(ranges[2]) })).toBeVisible();
    await expect(lead.getByRole("button", { name: documentLabel(ranges[2]) })).toHaveCount(0);
    await expectNoAxeViolations(lead);

    await trigger.click();
    const sheet = lead.getByRole("dialog");
    await expect(sheet.getByRole("button", { name: /^승인/ })).toBeFocused();
    await expectNoAxeViolations(lead);
    await lead.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
    await expect(trigger).toBeFocused();
  });
});
