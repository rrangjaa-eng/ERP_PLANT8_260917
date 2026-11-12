import { test, expect, type Browser, type Page } from "@playwright/test";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { seoulToday } from "@/lib/dates";
import { findProjectById } from "@/repositories/projects";
import { loginPage, makePerson, waitForHydration, type Person } from "./leave-org";
import { approveSettlementE2E, setupSettlementE2E, submitSettlementE2E, type SettlementE2E } from "./settlement-fixture";

// 07.2-19(PU2 · UI-SPEC S2 · 디자인 D-F2 · 07.2 D-7302 카드 11): 완료 프로젝트 상세 머리 「상태 바꾸기」 자리의 트리거 `정산으로 되돌리기`
// (projects.reopen 보유자만) → 목록 창 없이 바로 사유형 확인 창 → 정산 · 결재선 끝 되돌림 줄 → 담당 PM이 같은 문서를 다시 올린다.

const SHOTS = "test-results/07.2-19";
const TRIGGER = "정산으로 되돌리기";
const REASON = "정산 실행가 실수 · 다시 결재";
const CONFLICT = "다른 사람이 먼저 바꿈";

async function completedProject(): Promise<SettlementE2E> {
  const fx = await setupSettlementE2E();
  await submitSettlementE2E(fx);
  await approveSettlementE2E(fx);
  return fx;
}

async function sysadminFor(fx: SettlementE2E): Promise<Person> {
  const project = await findProjectById(SYSTEM_VIEWER, fx.projectId);
  if (!project) throw new Error("프로젝트 없음");
  return makePerson("관리자", "role-sysadmin", project.teamId, `${seoulToday().slice(0, 4)}-01-01`);
}

async function openProject(browser: Browser, baseURL: string | undefined, person: Person, fx: SettlementE2E, viewport?: { width: number; height: number }): Promise<Page> {
  const page = await loginPage(browser, baseURL, person, viewport);
  await page.goto(`/projects/${fx.projectId}`);
  await expect(page.getByRole("heading", { level: 1, name: fx.projectName })).toBeVisible();
  return page;
}

async function openConfirm(page: Page) {
  const trigger = page.getByRole("button", { name: TRIGGER, exact: true });
  await waitForHydration(trigger);
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: TRIGGER });
  await expect(dialog).toBeVisible();
  return dialog;
}

test.describe("완료 되돌리기(S2) — 대표 1280", () => {
  test("트리거 1 · 목록 창 없이 확인 창 · 사유 비면 막힘 → 입력 → 토스트 · 정산 · 결재선 끝 되돌림 줄", async ({ browser, baseURL }) => {
    const fx = await completedProject();
    const page = await openProject(browser, baseURL, fx.ceo, fx);
    await expect(page.getByRole("button", { name: TRIGGER, exact: true })).toHaveCount(1);
    await expect(page.getByRole("button", { name: "상태 바꾸기" })).toHaveCount(0);
    // 트리거가 승인 문서로 가는 머리 줄 링크를 밀어내지 않는다(settlement-approval.spec.ts :83과 같은 링크).
    await expect(page.getByRole("link", { name: "정산 결재 승인" })).toHaveAttribute("href", `/projects/${fx.projectId}/settlement`);
    await page.screenshot({ path: `${SHOTS}/trigger-1280.png` });

    const dialog = await openConfirm(page);
    // 목록 단계 0 — 열린 창은 확인 창 하나다.
    await expect(page.getByRole("dialog", { name: "상태 바꾸기" })).toHaveCount(0);
    await expect(page.locator("dialog[open]")).toHaveCount(1);
    await expect(dialog.getByText(`${fx.projectNumber} ${fx.projectName}`, { exact: true })).toBeVisible();
    await expect(dialog.getByText("완료 해제 · 정산 결재 다시 받음", { exact: true })).toBeVisible();
    const primary = dialog.getByRole("button", { name: new RegExp(`^${TRIGGER}`) });
    await expect(primary).toHaveAttribute("aria-disabled", "true");
    // 막힘 이유는 보이는 줄과 버튼 aria-describedby 줄 두 벌이다 — 보이는 쪽만(project-lifecycle.spec.ts 꼴).
    await expect(dialog.getByText("사유 없음 · 사유 적기", { exact: true }).filter({ visible: true })).toBeVisible();
    await expect(dialog.getByRole("button", { name: /^취소/ })).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/confirm-empty-1280.png` });

    await dialog.getByLabel("사유").fill(REASON);
    await expect(primary).not.toHaveAttribute("aria-disabled", "true");
    await primary.click();

    await expect(page.getByText(`${TRIGGER} · ${fx.projectNumber}`, { exact: true })).toBeVisible();
    await expect(page.locator("dialog[open]")).toHaveCount(0);
    await expect(page.getByText("정산", { exact: true }).filter({ visible: true }).first()).toBeVisible();
    await expect(page.getByText("완료", { exact: true }).filter({ visible: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: TRIGGER, exact: true })).toHaveCount(0);

    await page.goto(`/projects/${fx.projectId}/settlement`);
    const endLine = page.getByText(new RegExp(`^되돌림 · ${fx.ceo.name} · \\d{2}-\\d{2} \\d{2}:\\d{2} · 사유 ${REASON}$`));
    await expect(endLine).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/settlement-endline-1280.png`, fullPage: true });

    // P2-1 — 되돌린 정산서(인스턴스 draft) 인쇄 결재란에 지난 차수 승인 도장 · 일시가 찍히지 않는다(기안 칸 하나 · 작성 중).
    await page.goto(`/print/settlements/${fx.projectId}`);
    await expect(page.locator('[data-state="draft"]')).toHaveCount(1);
    await expect(page.locator('[data-state="draft"]')).toContainText("작성 중");
    await expect(page.locator('[data-state="approved"], [data-state="self"], [data-state="submitted"]')).toHaveCount(0);
    await page.context().close();
  });

  test("계급별 입구 — 대표 · 시스템 관리자 1 / 팀장 · 담당 PM 0", async ({ browser, baseURL }) => {
    const fx = await completedProject();
    const sysadmin = await sysadminFor(fx);
    for (const [person, count] of [
      [fx.ceo, 1],
      [sysadmin, 1],
      [fx.lead, 0],
      [fx.pm, 0],
    ] as const) {
      const page = await openProject(browser, baseURL, person, fx);
      await expect(page.getByRole("button", { name: TRIGGER, exact: true }), person.name).toHaveCount(count);
      await page.context().close();
    }
  });

  test("동시 되돌리기 — 두 번째 창에 `다른 사람이 먼저 바꿈` + 3차 `새로 고침`, 창 유지", async ({ browser, baseURL }) => {
    const fx = await completedProject();
    const sysadmin = await sysadminFor(fx);
    const first = await openProject(browser, baseURL, fx.ceo, fx);
    const second = await openProject(browser, baseURL, sysadmin, fx);
    const firstDialog = await openConfirm(first);
    const secondDialog = await openConfirm(second);
    await firstDialog.getByLabel("사유").fill(REASON);
    await secondDialog.getByLabel("사유").fill("두 번째");

    await firstDialog.getByRole("button", { name: new RegExp(`^${TRIGGER}`) }).click();
    await expect(first.getByText(`${TRIGGER} · ${fx.projectNumber}`, { exact: true })).toBeVisible();

    await secondDialog.getByRole("button", { name: new RegExp(`^${TRIGGER}`) }).click();
    await expect(secondDialog.getByText(CONFLICT, { exact: true }).filter({ visible: true })).toBeVisible();
    await expect(secondDialog.getByRole("button", { name: "새로 고침" })).toBeVisible();
    await expect(secondDialog).toBeVisible();
    await second.screenshot({ path: `${SHOTS}/conflict-1280.png` });
    await first.context().close();
    await second.context().close();
  });
});

test.describe("되돌린 뒤 담당 PM — 같은 문서 다시 올리기(D-7215)", () => {
  test("머리 줄 `정산 결재 작성 중`(원문 draft 0) → 문서 화면 `정산 결재 다시 올리기` 활성 → 올림 → 결재선 1단계 차례 · 끝 줄 남음", async ({ browser, baseURL }) => {
    const fx = await completedProject();
    const ceo = await openProject(browser, baseURL, fx.ceo, fx);
    const dialog = await openConfirm(ceo);
    await dialog.getByLabel("사유").fill(REASON);
    await dialog.getByRole("button", { name: new RegExp(`^${TRIGGER}`) }).click();
    await expect(ceo.getByText(`${TRIGGER} · ${fx.projectNumber}`, { exact: true })).toBeVisible();
    await ceo.context().close();

    const pm = await openProject(browser, baseURL, fx.pm, fx);
    const link = pm.getByRole("link", { name: "정산 결재 작성 중" });
    await expect(link).toBeVisible();
    await expect(pm.getByText("draft")).toHaveCount(0);
    await pm.screenshot({ path: `${SHOTS}/pm-header-1280.png` });
    await link.click();
    await expect(pm).toHaveURL(new RegExp(`/projects/${fx.projectId}/settlement$`));
    const resubmit = pm.getByRole("button", { name: /^정산 결재 다시 올리기/ });
    await waitForHydration(resubmit);
    await expect(resubmit).not.toHaveAttribute("aria-disabled", "true");
    await resubmit.click();
    await expect(pm.getByText(new RegExp(`^되돌림 · ${fx.ceo.name} · .* · 사유 ${REASON}$`))).toBeVisible();
    await expect(pm.getByRole("button", { name: /^정산 결재 다시 올리기/ })).toHaveCount(0);
    await pm.screenshot({ path: `${SHOTS}/pm-resubmitted-1280.png`, fullPage: true });
    await pm.context().close();
  });
});

// 375 · 320 — 확인 창은 아래 시트, 행동 줄 2차 왼쪽 · 1차 오른쪽(1차 ≈ 2배 폭), 막힘 이유는 버튼 윗줄 전폭, 가로 넘침 0.
for (const width of [375, 320] as const) {
  test(`폰 ${width} — 아래 시트 · 행동 줄 · 막힘 이유 윗줄 · 500자 사유 줄바꿈 · 가로 넘침 0`, async ({ browser, baseURL }) => {
    const fx = await completedProject();
    const page = await openProject(browser, baseURL, fx.ceo, fx, { width, height: 740 });
    const dialog = await openConfirm(page);
    const primary = dialog.getByRole("button", { name: new RegExp(`^${TRIGGER}`) });
    const secondary = dialog.getByRole("button", { name: /^취소/ });
    const reason = dialog.getByText("사유 없음 · 사유 적기", { exact: true }).filter({ visible: true });
    const [box, p, s, r] = await Promise.all([dialog.boundingBox(), primary.boundingBox(), secondary.boundingBox(), reason.boundingBox()]);
    if (!box || !p || !s || !r) throw new Error("상자 없음");
    expect(Math.round(box.y + box.height)).toBeGreaterThanOrEqual(740 - 2);
    expect(s.x).toBeLessThan(p.x);
    expect(p.width / s.width).toBeGreaterThan(1.6);
    expect(p.width / s.width).toBeLessThan(2.4);
    expect(r.y + r.height).toBeLessThanOrEqual(Math.min(p.y, s.y) + 1);
    expect(p.height).toBeGreaterThanOrEqual(44);
    await page.screenshot({ path: `${SHOTS}/confirm-${width}.png` });

    await dialog.getByLabel("사유").fill("가".repeat(500));
    await expect(primary).not.toHaveAttribute("aria-disabled", "true");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await page.screenshot({ path: `${SHOTS}/confirm-long-${width}.png` });
    await page.context().close();
  });
}
