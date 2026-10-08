import { test, expect, type Locator, type Page, type Route } from "@playwright/test";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { projects } from "@/db/schema";
import { assignTeam } from "@/domain/org";
import { addProjectMembers } from "@/domain/projects/members";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { seoulToday } from "@/lib/dates";
import { waitForCardUsageSection } from "./fixtures";
import { loginPage, type Person } from "./leave-org";
import { makeLastCandidateProject, setupMembersE2E } from "./project-members-fixture";

// 06.2-12(SC-5 · UI-SPEC S2): 프로젝트 상세 「참여자」 섹션 — 담당 PM 첫 행 · 떼기(확인 창 없음) · 되돌리기(보관 해제) · 퇴직 태그 · 권리 없음 · 완료.
// 세계는 도메인 함수로 만든다(project-members-fixture.ts).

function membersSection(page: Page): Locator {
  return page.locator("section").filter({ has: page.getByRole("heading", { name: "참여자", exact: true }) });
}

function memberRow(page: Page, person: Person): Locator {
  return membersSection(page).getByRole("row").filter({ hasText: person.name });
}

async function openDetail(
  browser: import("@playwright/test").Browser,
  baseURL: string | undefined,
  fx: { projectId: string },
  viewer: Person,
): Promise<Page> {
  const page = await loginPage(browser, baseURL, viewer);
  await page.goto(`/projects/${fx.projectId}`);
  await waitForCardUsageSection(page);
  return page;
}

test.describe("참여자 섹션(S2)", () => {
  test("팀장 — 섹션은 법인카드 사용 뒤 · 차수 앞, 첫 행은 담당 PM(떼기 없음), 그 아래 참여자 행(이름 · 팀 · 떼기)", async ({ browser, baseURL }) => {
    const fx = await setupMembersE2E();
    const page = await openDetail(browser, baseURL, fx, fx.lead);
    const titles = await page.getByRole("heading", { level: 2 }).allTextContents();
    expect(titles.indexOf("법인카드 사용")).toBeGreaterThanOrEqual(0);
    expect(titles.indexOf("참여자")).toBe(titles.indexOf("법인카드 사용") + 1);
    expect(titles.indexOf("차수")).toBe(titles.indexOf("참여자") + 1);

    const section = membersSection(page);
    const table = section.getByRole("table", { name: "참여자" });
    const bodyRows = table.locator("tbody > tr");
    const first = bodyRows.first();
    await expect(first).toContainText(fx.pm.name);
    await expect(first).toContainText("담당 PM");
    await expect(first.getByRole("button", { name: /떼기/ })).toHaveCount(0);
    const zRow = memberRow(page, fx.z);
    await expect(zRow).toContainText(fx.otherTeamName);
    await expect(zRow.getByRole("button", { name: /떼기/ })).toBeVisible();
    await page.context().close();
  });

  test("떼기 — 확인 창 없이 행이 사라지고 제목 아래 · 표 위 결과 줄 `{이름} 뗌` + `되돌리기` 포커스 · 새로 고침해도 없다", async ({ browser, baseURL }) => {
    const fx = await setupMembersE2E();
    const page = await openDetail(browser, baseURL, fx, fx.lead);
    const section = membersSection(page);
    await memberRow(page, fx.z).getByRole("button", { name: /떼기/ }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(memberRow(page, fx.z)).toHaveCount(0);
    const status = section.getByRole("status");
    await expect(status).toContainText(`${fx.z.name} 뗌`);
    const undo = status.getByRole("button", { name: "되돌리기" });
    await expect(undo).toBeFocused();
    const heading = await section.getByRole("heading", { name: "참여자", exact: true }).boundingBox();
    const line = await status.boundingBox();
    const table = await section.getByRole("table", { name: "참여자" }).boundingBox();
    expect(heading && line && table).toBeTruthy();
    expect(heading!.y).toBeLessThan(line!.y);
    expect(line!.y).toBeLessThan(table!.y);
    await page.reload();
    await waitForCardUsageSection(page);
    await expect(memberRow(page, fx.z)).toHaveCount(0);
    await page.context().close();
  });

  test("되돌리기 — 같은 자리에 돌아오고 그 행 `떼기`가 포커스 · 결과 줄 사라짐", async ({ browser, baseURL }) => {
    const fx = await setupMembersE2E();
    const page = await openDetail(browser, baseURL, fx, fx.lead);
    const section = membersSection(page);
    await memberRow(page, fx.z).getByRole("button", { name: /떼기/ }).click();
    await section.getByRole("status").getByRole("button", { name: "되돌리기" }).click();
    const zRow = memberRow(page, fx.z);
    await expect(zRow).toBeVisible();
    await expect(zRow.getByRole("button", { name: /떼기/ })).toBeFocused();
    await expect(section.getByRole("status")).toHaveCount(0);
    // 붙인 순(담당 PM → Z → R → A)에서 Z는 담당 PM 바로 아래.
    await expect(section.getByRole("table", { name: "참여자" }).locator("tbody > tr").nth(1)).toContainText(fx.z.name);
    await page.context().close();
  });

  test("퇴직 참여자 — 이름 뒤 `퇴직` 글자 태그 · `떼기` 있음 → 떼기 → 되돌리기 → `퇴직` 태그 그대로 같은 자리에 돌아온다", async ({ browser, baseURL }) => {
    const fx = await setupMembersE2E();
    const page = await openDetail(browser, baseURL, fx, fx.lead);
    const section = membersSection(page);
    const rRow = memberRow(page, fx.r);
    await expect(rRow).toContainText("퇴직");
    await expect(rRow.getByRole("button", { name: /떼기/ })).toBeVisible();
    await rRow.getByRole("button", { name: /떼기/ }).click();
    await expect(memberRow(page, fx.r)).toHaveCount(0);
    await section.getByRole("status").getByRole("button", { name: "되돌리기" }).click();
    await expect(memberRow(page, fx.r)).toContainText("퇴직");
    await expect(memberRow(page, fx.r).getByRole("button", { name: /떼기/ })).toBeFocused();
    await page.context().close();
  });

  test("참여자 본인 — 섹션 · 표(담당 PM 행 포함)는 보이고 `떼기` · 표 아래 3차가 없다(D-6213)", async ({ browser, baseURL }) => {
    const fx = await setupMembersE2E();
    const page = await openDetail(browser, baseURL, fx, fx.z);
    const section = membersSection(page);
    await expect(section.getByRole("table", { name: "참여자" })).toBeVisible();
    await expect(section.getByRole("row").filter({ hasText: fx.pm.name })).toContainText("담당 PM");
    await expect(section.getByRole("button", { name: /떼기/ })).toHaveCount(0);
    await expect(section.getByRole("button", { name: "참여자 더하기" })).toHaveCount(0);
    await expect(section.getByRole("columnheader")).toHaveText(["이름", "팀"]);
    await page.context().close();
  });

  test("완료 프로젝트 — 팀장 화면에 `떼기`가 없고 섹션 안에 `완료 · 참여자 잠김` 글자가 없다(D-6212 — 잠김 줄 없음)", async ({ browser, baseURL }) => {
    const fx = await setupMembersE2E();
    await db.update(projects).set({ status: "completed" }).where(eq(projects.id, fx.projectId));
    const page = await openDetail(browser, baseURL, fx, fx.lead);
    const section = membersSection(page);
    await expect(section.getByRole("table", { name: "참여자" })).toBeVisible();
    await expect(section.getByRole("button", { name: /떼기/ })).toHaveCount(0);
    await expect(section.getByText("완료 · 참여자 잠김")).toHaveCount(0);
    await expect(section.getByText("참여자 잠김")).toHaveCount(0);
    await page.context().close();
  });
});

// 서버 액션 요청(`next-action` 머리가 있는 POST)만 끊는다 — card-usage.spec.ts 섹션 ERROR 가로채기 꼴.
function failActions(route: Route): Promise<void> {
  return route.request().method() === "POST" && route.request().headers()["next-action"] ? route.abort() : route.fallback();
}

test.describe("참여자 더하기(S3)", () => {
  async function openPicker(page: Page): Promise<Locator> {
    await membersSection(page).getByRole("button", { name: "참여자 더하기" }).click();
    const dialog = page.getByRole("dialog", { name: "참여자 더하기" });
    await expect(dialog).toBeVisible();
    return dialog;
  }

  test("참여자 0 프로젝트 — 담당 PM 행 하나인 표 · 빈 문장 없음 · 표 아래 3차 하나 → 제목 · 부제 · 검색 칸 포커스 · 담당 팀 사람은 목록에 없고 후보만 있다(D-6211 · D-6221)", async ({ browser, baseURL }) => {
    const fx = await setupMembersE2E();
    const page = await openDetail(browser, baseURL, { projectId: fx.emptyProjectId }, fx.lead);
    const section = membersSection(page);
    await expect(section.getByRole("table", { name: "참여자" }).locator("tbody > tr")).toHaveCount(1);
    await expect(section.getByText("참여자가 없습니다")).toHaveCount(0);
    await expect(section.getByRole("button", { name: "참여자 더하기" })).toHaveCount(1);
    const dialog = await openPicker(page);
    await expect(dialog.getByText(fx.emptyProjectName)).toBeVisible();
    const search = dialog.getByRole("textbox", { name: "사람 검색" });
    await expect(search).toBeFocused();
    await search.fill(fx.candidatePrefix);
    await expect(dialog.getByRole("option")).toHaveCount(3);
    await expect(dialog.getByRole("option", { name: new RegExp(fx.candidates[0].name) })).toBeVisible();
    await expect(dialog.getByRole("option", { name: new RegExp(fx.candidates[1].name) })).toBeVisible();
    for (const inTeam of [fx.pm, fx.lead]) {
      await search.fill(inTeam.name);
      await expect(dialog.getByText("조건에 맞는 사람이 없습니다")).toBeVisible();
    }
    await page.context().close();
  });

  test("키보드만 — ↓ Space ↓ Space → 결과 줄 `{C1} 외 1명 선택` · 1차 `참여자 더하기 2` → Enter → 닫히고 표에 둘 · 포커스는 표 아래 3차 · 시각 숨김 `참여자 2명 더함`", async ({ browser, baseURL }) => {
    const fx = await setupMembersE2E();
    const [c1, c2] = fx.candidates;
    const page = await openDetail(browser, baseURL, fx, fx.lead);
    const section = membersSection(page);
    const dialog = await openPicker(page);
    await dialog.getByRole("textbox", { name: "사람 검색" }).fill(fx.candidatePrefix);
    await expect(dialog.getByRole("option")).toHaveCount(3);
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Space");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Space");
    await expect(dialog.getByText(`${c1.name} 외 1명 선택`)).toBeVisible();
    await expect(dialog.getByRole("button", { name: /^참여자 더하기 2/ })).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(dialog).toBeHidden();
    await expect(memberRow(page, c1)).toBeVisible();
    await expect(memberRow(page, c2)).toBeVisible();
    await expect(section.getByRole("button", { name: "참여자 더하기" })).toBeFocused();
    await expect(page.getByRole("status").filter({ hasText: "참여자 2명 더함" })).toHaveCount(1);
    await page.context().close();
  });

  test("검색과 고름 — 검색으로 가려져도 고름은 남고(결과 줄 · 1차 N 그대로) 없는 낱말은 `검색 지우기`, 지우면 체크 그대로", async ({ browser, baseURL }) => {
    const fx = await setupMembersE2E();
    const [c1, c2] = fx.candidates;
    const page = await openDetail(browser, baseURL, fx, fx.lead);
    const dialog = await openPicker(page);
    const search = dialog.getByRole("textbox", { name: "사람 검색" });
    await search.fill(fx.candidatePrefix);
    await expect(dialog.getByRole("option")).toHaveCount(3);
    await dialog.getByRole("option", { name: new RegExp(c1.name) }).click();
    await dialog.getByRole("option", { name: new RegExp(c2.name) }).click();
    await search.fill(c1.name);
    await expect(dialog.getByRole("option")).toHaveCount(1);
    await expect(dialog.getByText(`${c1.name} 외 1명 선택`)).toBeVisible();
    await expect(dialog.getByRole("button", { name: /^참여자 더하기 2/ })).toBeVisible();
    await search.fill(`${fx.candidatePrefix}없는낱말`);
    await expect(dialog.getByText("조건에 맞는 사람이 없습니다")).toBeVisible();
    await dialog.getByRole("button", { name: "검색 지우기" }).click();
    await expect(search).toHaveValue("");
    await search.fill(fx.candidatePrefix);
    await expect(dialog.getByRole("option", { name: new RegExp(c2.name) })).toHaveAttribute("aria-selected", "true");
    await expect(dialog.getByRole("button", { name: /^참여자 더하기 2/ })).toBeVisible();
    await page.context().close();
  });

  test("`projects` 보기 권한이 없는 계급의 같은 본부 사람은 후보가 아니다(검색해도 없다)", async ({ browser, baseURL }) => {
    const fx = await setupMembersE2E();
    const page = await openDetail(browser, baseURL, fx, fx.lead);
    const dialog = await openPicker(page);
    await dialog.getByRole("textbox", { name: "사람 검색" }).fill(fx.c4.name);
    await expect(dialog.getByText("조건에 맞는 사람이 없습니다")).toBeVisible();
    await expect(dialog.getByRole("button", { name: "검색 지우기" })).toBeVisible();
    await page.context().close();
  });

  test("전체 취소 거부 — 고른 뒤 C3이 담당 팀으로 옮겨지면 Enter가 닫히지 않고 `{C3} 더할 수 없음` + `새로 고침` · 표에 없다 → 새로 고침 → 체크가 풀려 1차 `고른 사람 없음`", async ({ browser, baseURL }) => {
    const fx = await setupMembersE2E();
    const c3 = fx.candidates[2];
    const page = await openDetail(browser, baseURL, fx, fx.lead);
    const dialog = await openPicker(page);
    await dialog.getByRole("textbox", { name: "사람 검색" }).fill(fx.candidatePrefix);
    await dialog.getByRole("option", { name: new RegExp(c3.name) }).click();
    await assignTeam(SYSTEM_VIEWER, { userId: c3.viewer.id, teamId: fx.teamId, effectiveFrom: seoulToday() });
    await page.keyboard.press("Enter");
    await expect(dialog.getByText(`${c3.name} 더할 수 없음`)).toBeVisible();
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("button", { name: /^참여자 더하기/ })).toHaveAttribute("aria-disabled", "true");
    await expect(memberRow(page, c3)).toHaveCount(0);
    await dialog.getByRole("button", { name: "새로 고침" }).click();
    await expect(dialog.getByRole("button", { name: /^참여자 더하기/ })).toHaveAttribute("aria-disabled", "true");
    await expect(dialog.getByText("고른 사람 없음")).toBeVisible();
    await page.context().close();
  });

  test("Esc — 아무 일 없이 닫히고 포커스는 연 버튼(표 아래 3차)으로", async ({ browser, baseURL }) => {
    const fx = await setupMembersE2E();
    const page = await openDetail(browser, baseURL, fx, fx.lead);
    const section = membersSection(page);
    const dialog = await openPicker(page);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(section.getByRole("button", { name: "참여자 더하기" })).toBeFocused();
    await page.context().close();
  });

  test("마지막 후보를 더하면(1280) 표 아래 3차가 사라지고 포커스는 섹션 제목 h2 `참여자` · 머리 줄에 보이는 `참여자 더하기`가 없다(R2-I5)", async ({ browser, baseURL }) => {
    const last = await makeLastCandidateProject();
    const page = await openDetail(browser, baseURL, last, last.lead);
    const section = membersSection(page);
    const dialog = await openPicker(page);
    await expect(dialog.getByRole("option")).toHaveCount(1);
    await expect(dialog.getByRole("option", { name: new RegExp(last.l.name) })).toBeVisible();
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Space");
    await page.keyboard.press("Enter");
    await expect(dialog).toBeHidden();
    await expect(memberRow(page, last.l)).toBeVisible();
    await expect(section.getByRole("button", { name: "참여자 더하기" })).toHaveCount(0);
    await expect
      .poll(() => page.evaluate(() => ({ tag: document.activeElement?.tagName ?? null, text: document.activeElement?.textContent ?? null })))
      .toEqual({ tag: "H2", text: "참여자" });
    await expect(page.getByRole("button", { name: "참여자 더하기" })).toHaveCount(0);
    await page.context().close();
  });
});

test.describe("참여자 섹션 상태(검토 반영 R1: design I10 · I11)", () => {
  test("ERROR — 서버 액션 요청이 끊기면 `참여자 불러오지 못함` + `다시 시도` · 차수 섹션과 매출 섹션은 서고 → 풀고 다시 시도하면 표", async ({ browser, baseURL }) => {
    const fx = await setupMembersE2E();
    const page = await loginPage(browser, baseURL, fx.lead);
    await page.route("**/*", failActions);
    await page.goto(`/projects/${fx.projectId}`);
    const section = membersSection(page);
    await expect(section.getByText("참여자 불러오지 못함")).toBeVisible();
    await expect(page.getByRole("heading", { name: "차수", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "매출", exact: true })).toBeVisible();
    await page.unroute("**/*", failActions);
    await section.getByRole("button", { name: "다시 시도" }).click();
    await expect(section.getByRole("table", { name: "참여자" })).toBeVisible();
    await page.context().close();
  });

  test("LOADING — 응답을 붙잡아 두면 섹션 aria-busy · 머리글 `이름` `팀` `동작` 뼈대 → 풀면 표", async ({ browser, baseURL }) => {
    const fx = await setupMembersE2E();
    const page = await loginPage(browser, baseURL, fx.lead);
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const hold = async (route: Route) => {
      if (route.request().method() === "POST" && route.request().headers()["next-action"]) await gate;
      await route.fallback();
    };
    await page.route("**/*", hold);
    await page.goto(`/projects/${fx.projectId}`);
    const section = membersSection(page);
    await expect(section.locator('[aria-busy="true"]')).toHaveCount(1);
    await expect(section.locator('[data-ui="table-skeleton"] th')).toHaveText(["이름", "팀", "동작"]);
    release();
    await expect(section.getByRole("table", { name: "참여자" })).toBeVisible();
    await expect(section.locator('[aria-busy="true"]')).toHaveCount(0);
    await page.unroute("**/*", hold);
    await page.context().close();
  });

  test("정렬 · `보관됨` — 담당 PM → Z → R → A(붙인 순) · A 이름 뒤 `보관됨` · 새로 더한 C1이 맨 아래", async ({ browser, baseURL }) => {
    const fx = await setupMembersE2E();
    await addProjectMembers(fx.lead.viewer, fx.projectId, [fx.candidates[0].viewer.id]);
    const page = await openDetail(browser, baseURL, fx, fx.lead);
    const rows = membersSection(page).getByRole("table", { name: "참여자" }).locator("tbody > tr");
    await expect(rows).toHaveCount(5);
    for (const [index, person] of [fx.pm, fx.z, fx.r, fx.a, fx.candidates[0]].entries()) {
      await expect(rows.nth(index)).toContainText(person.name);
    }
    await expect(rows.nth(3)).toContainText("보관됨");
    await page.context().close();
  });

  test("되돌리기 실패 — 연결이 끊기면 `되돌리기 실패 · 다시 시도` · `되돌리기` 남음 → 풀고 다시 누르면 Z 복귀", async ({ browser, baseURL }) => {
    const fx = await setupMembersE2E();
    const page = await openDetail(browser, baseURL, fx, fx.lead);
    const section = membersSection(page);
    await memberRow(page, fx.z).getByRole("button", { name: /떼기/ }).click();
    await expect(memberRow(page, fx.z)).toHaveCount(0);
    await page.route("**/*", failActions);
    const undo = section.getByRole("status").getByRole("button", { name: "되돌리기" });
    await undo.click();
    await expect(section.getByRole("status")).toContainText("되돌리기 실패 · 다시 시도");
    await expect(undo).toBeVisible();
    await page.unroute("**/*", failActions);
    await undo.click();
    await expect(memberRow(page, fx.z)).toBeVisible();
    await page.context().close();
  });

  test("떼기 실패 — 연결이 끊기면 Z 행 팀 칸 글자가 `떼기 실패 · 다시 시도`(alert) · Z 행 남음 · `떼기` 살아 있음", async ({ browser, baseURL }) => {
    const fx = await setupMembersE2E();
    const page = await openDetail(browser, baseURL, fx, fx.lead);
    await page.route("**/*", failActions);
    const zRow = memberRow(page, fx.z);
    const remove = zRow.getByRole("button", { name: /떼기/ });
    await remove.click();
    await expect(zRow.getByRole("alert")).toHaveText("떼기 실패 · 다시 시도");
    await expect(zRow).toBeVisible();
    await expect(remove).toBeVisible();
    await expect(remove).not.toHaveAttribute("aria-disabled", "true");
    await page.unroute("**/*", failActions);
    await page.context().close();
  });

  test("서버 거부 — 연 뒤 완료로 바뀌면 Z `떼기`가 결과 줄에 `완료 프로젝트 · 참여자 잠김`을 보이고 섹션을 다시 읽어 `떼기` · 3차가 사라진다 · 줄은 다시 읽기 · refresh 뒤에도 남고 다시 열면 없다", async ({ browser, baseURL }) => {
    const fx = await setupMembersE2E();
    const page = await openDetail(browser, baseURL, fx, fx.lead);
    const section = membersSection(page);
    await expect(section.getByRole("button", { name: "참여자 더하기" })).toBeVisible();
    await db.update(projects).set({ status: "completed" }).where(eq(projects.id, fx.projectId));
    await memberRow(page, fx.z).getByRole("button", { name: /떼기/ }).click();
    await expect(section.getByRole("status")).toContainText("완료 프로젝트 · 참여자 잠김");
    await expect(section.getByRole("button", { name: /떼기/ })).toHaveCount(0);
    await expect(section.getByRole("button", { name: "참여자 더하기" })).toHaveCount(0);
    await expect(section.locator('[aria-busy="true"]')).toHaveCount(0);
    await page.waitForLoadState("networkidle");
    await expect(section.getByRole("status")).toContainText("완료 프로젝트 · 참여자 잠김");
    await page.goto(`/projects/${fx.projectId}`);
    await waitForCardUsageSection(page);
    await expect(membersSection(page).getByText("참여자 잠김")).toHaveCount(0);
    await page.context().close();
  });
});
