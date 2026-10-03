import { randomUUID } from "node:crypto";
import { expect, type Browser, type Locator, type Page } from "@playwright/test";
import { createAccount } from "@/domain/auth/accounts";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { assignTeam, createOrgUnit, createTeam, listTeams } from "@/domain/org";

// 04.1-05: 결재 화면 E2E 공용 픽스처 — 04.1-02 leave-approval.spec.ts와 같은 모양(스펙마다 전용 본부 · 팀,
// 사람은 도메인 함수로 만든다). 3단(경영관리본부 · 계급 무관)은 기존 경영관리팀의 이 스펙 사람, 4단 대표는
// 이 스펙의 대표가 후보다. 다른 스펙의 사람이 같은 자리 후보여도 이 스펙의 사람이 처리할 수 있으면 된다.

export type Person = { name: string; email: string; password: string; viewer: Viewer };

export async function makePerson(prefix: string, roleId: string, teamId: string, effectiveFrom: string): Promise<Person> {
  const name = `${prefix}${randomUUID().slice(0, 4)}`;
  const email = `e2e-leave-${randomUUID()}@example.test`;
  const { userId, tempPassword } = await createAccount(SYSTEM_VIEWER, { email, name, roleId });
  await assignTeam(SYSTEM_VIEWER, { userId, teamId, effectiveFrom });
  return { name, email, password: tempPassword, viewer: { id: userId, roleId } };
}

export type LeaveOrg = {
  teamId: string;
  drafter: Person;
  teamLead: Person;
  divisionHead: Person;
  mgmt: Person;
  ceo: Person;
};

// 발령일 = 그해 1월 1일(신청 날짜는 3월 이후라 발령 뒤다 — 날짜 리터럴 없음).
export async function setupLeaveOrg(today: string): Promise<LeaveOrg> {
  const yearStart = `${today.slice(0, 4)}-01-01`;
  const orgUnit = await createOrgUnit(SYSTEM_VIEWER, { name: `E2E결재본부-${randomUUID().slice(0, 8)}` });
  const team = await createTeam(SYSTEM_VIEWER, { orgUnitId: orgUnit.id, name: `E2E결재팀-${randomUUID().slice(0, 8)}` });
  const mgmtTeam = (await listTeams(SYSTEM_VIEWER)).find((candidate) => candidate.name === "경영관리팀");
  if (!mgmtTeam) throw new Error("시드된 경영관리팀 없음");
  return {
    teamId: team.id,
    drafter: await makePerson("기안", "role-pm", team.id, yearStart),
    teamLead: await makePerson("팀장", "role-team-lead", team.id, yearStart),
    divisionHead: await makePerson("본부장", "role-division-head", team.id, yearStart),
    mgmt: await makePerson("경영", "role-pm", mgmtTeam.id, yearStart),
    ceo: await makePerson("대표", "role-ceo", team.id, yearStart),
  };
}

export async function loginPage(
  browser: Browser,
  baseURL: string | undefined,
  person: Person,
  viewport?: { width: number; height: number },
): Promise<Page> {
  const context = await browser.newContext({ baseURL, ...(viewport ? { viewport } : {}) });
  const page = await context.newPage();
  await page.goto("/login");
  await page.getByLabel("이메일").fill(person.email);
  await page.getByLabel("비밀번호").fill(person.password);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/account$/);
  return page;
}

// 결재함 문서 칸 글자(표 셀 구분자 `·`)와 제목 글자(구분자 `—`).
export function documentLabel(range: { startDate: string; endDate: string }): string {
  const end = range.endDate !== range.startDate ? ` ~ ${range.endDate.slice(5)}` : "";
  return `연차 · 종일 ${range.startDate.slice(5)}${end}`;
}

export function documentTitle(range: { startDate: string; endDate: string }): string {
  const end = range.endDate !== range.startDate ? ` ~ ${range.endDate.slice(5)}` : "";
  return `연차 — 종일 ${range.startDate.slice(5)}${end}`;
}

// 서버 액션 요청(POST)을 늦춰 제출 중 모양을 관찰한다 — 결과는 그대로다.
export async function delayServerActions(page: Page, ms: number): Promise<void> {
  await page.route("**/*", async (route) => {
    if (route.request().method() === "POST" && route.request().headers()["next-action"]) {
      await new Promise((resolve) => setTimeout(resolve, ms));
    }
    await route.continue();
  });
}

// 하이드레이션 전에 누른 클릭 · 넣은 입력은 버려진다(.continue-here 제약 — 계측으로 확인). React는 하이드레이션한
// 호스트 요소에 `__reactProps$…` 키를 붙인다 — 그 요소의 이벤트 처리기가 붙은 뒤에 누르거나 넣는다(/review testing).
export async function waitForHydration(target: Locator): Promise<void> {
  await expect
    .poll(() => target.evaluate((element) => Object.keys(element).some((key) => key.startsWith("__reactProps$"))))
    .toBe(true);
}

// 04.6-17 사용자 카드 답 2026-10-03 23:12 KST 「링크 넣음」 — 결재 시트(PC 480 · 폰 아래 시트 공통)의 결재 내용 아래 한 줄 3차 링크 「문서 화면 열기」.
// 이름 · href를 재고, 결재선(마지막 본문 칸) 아래 · 행동 줄 위에 있으며, 시트를 열 때 첫 포커스는 그대로 승인 버튼임을 단언한다.
export async function expectSheetDocumentLink(panel: Locator, leaveId: string): Promise<void> {
  const link = panel.getByRole("link", { name: "문서 화면 열기" });
  await expect(link).toHaveCount(1);
  await expect(link).toHaveAttribute("href", `/leave/${leaveId}`);
  const [linkBox, routeBox, approveBox] = [
    await link.boundingBox(),
    await panel.locator("dl dd").last().boundingBox(),
    await panel.getByRole("button", { name: /^승인/ }).boundingBox(),
  ];
  expect(linkBox && routeBox && approveBox, "링크 · 결재선 · 승인 버튼 상자").toBeTruthy();
  expect(linkBox!.y, "결재 내용 아래").toBeGreaterThanOrEqual(routeBox!.y + routeBox!.height - 1);
  // 본문은 스크롤 칸이라 폰에서는 링크가 접힌 아래에 있을 수 있다 — 위치 대신 칸을 잰다: 링크는 본문(결재선과 같은 칸) 안, 승인은 행동 줄(그 칸 밖), DOM 순서는 링크 -> 승인.
  const placement = await link.evaluate((node, approveText) => {
    const body = node.closest("dialog")?.querySelector("dl")?.parentElement ?? null;
    const approve = [...(node.closest("dialog")?.querySelectorAll("button") ?? [])].find((button) => (button.textContent ?? "").trim().startsWith(approveText));
    return { inBody: !!body && body.contains(node), approveOutside: !!body && !!approve && !body.contains(approve), before: !!approve && !!(node.compareDocumentPosition(approve) & Node.DOCUMENT_POSITION_FOLLOWING) };
  }, "승인");
  expect(placement, "링크 칸").toEqual({ inBody: true, approveOutside: true, before: true });
  await expect(panel.getByRole("button", { name: /^승인/ })).toBeFocused();
}
