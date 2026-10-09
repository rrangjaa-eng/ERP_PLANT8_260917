import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { createOrgUnit, createTeam } from "@/domain/org";
import { reviveOrInsertMembers } from "@/repositories/project-members";
import { seoulToday } from "@/lib/dates";
import { loginPage, makePerson, waitForHydration } from "./leave-org";
import { setupExpenseE2E } from "./expense-fixture";

// 06.2-10(D-6214 — 사용자 답 대기, 추천 「올리기 허용」으로 진행): 다른 본부 · 다른 팀 참여자가 프로젝트 상세 견적 표의 지출결의 열에서
// `지출결의 올리기`를 눌러 작성 중 문서로 간다. 판정은 DOM(버튼 · 주소)이다.

const DESKTOP = { width: 1280, height: 800 };

function quoteRowOf(page: Page, itemName: string) {
  return page.getByRole("row").filter({ hasText: itemName });
}

test.describe("참여자 지출결의 올리기 (06.2-10 D-6214)", () => {
  test("다른 팀 참여자가 프로젝트 상세 견적 줄의 `지출결의 올리기`를 누르면 /expenses/[id] 작성 중 문서로 간다", async ({ browser, baseURL }) => {
    const fx = await setupExpenseE2E();
    const tag = randomUUID().slice(0, 6);
    const unit = await createOrgUnit(SYSTEM_VIEWER, { name: `E2E참여쓰기본부-${tag}` });
    const team = await createTeam(SYSTEM_VIEWER, { orgUnitId: unit.id, name: `E2E참여쓰기팀-${tag}` });
    const member = await makePerson("참여", "role-pm", team.id, `${seoulToday().slice(0, 4)}-01-01`);
    // 픽스처라 참여자 후보 규칙(addProjectMembers — 담당 팀 본부 + 대표)을 거치지 않고 리포지토리로 붙인다 — 이 스펙이 재는 것은 지출결의 게이트다.
    await reviveOrInsertMembers(SYSTEM_VIEWER, { projectId: fx.projectId, userIds: [member.viewer.id], addedBy: fx.lead.viewer.id });

    const page = await loginPage(browser, baseURL, member, DESKTOP);
    await page.goto(`/projects/${fx.projectId}`);
    const door = quoteRowOf(page, fx.lines.tracer.itemName).getByRole("gridcell").last().getByRole("button", { name: "지출결의 올리기" });
    await waitForHydration(door);
    await door.click();
    await expect(page).toHaveURL(/\/expenses\/[0-9a-f-]{36}$/);
    await page.context().close();
  });
});
