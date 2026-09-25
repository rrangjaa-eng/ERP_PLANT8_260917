import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { actionLog, codeItems, projects, quoteRevisions } from "@/db/schema";
import { createProject } from "@/domain/projects";
import { getCurrentQuoteRevision, saveQuoteLines } from "@/domain/quotes/lines";
import { DEFAULT_ROLE_ID, SYSADMIN_ROLE_ID } from "@/domain/permissions/roles";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { createAccount } from "@/domain/auth/accounts";
import { assignTeam, createOrgUnit, createTeam } from "@/domain/org";
import { insertVendor } from "@/repositories/vendors";
import { addDays, kstToday } from "@/lib/kst-date";

// 04-21(PROJ-04 화면) — 상태 바꾸기 생애 E2E. 계급 권한·정보 노출을 켜는 호출을
// 두지 않는다(ENG-D2) — 준비 단계가 만드는 것은 사람·발령 이력·프로젝트 행뿐이고,
// 팀장·대표 흐름은 04-20 시드만으로 선다. 날짜는 전부 오늘(KST)에서 더해 만든다(A-18).
const TODAY = kstToday(new Date());

type Account = { userId: string; email: string; password: string };

async function makeAccount(roleId: string, teamId?: string): Promise<Account> {
  const email = `e2e-${randomUUID()}@example.test`;
  const { userId, tempPassword } = await createAccount(SYSTEM_VIEWER, { email, name: "E2E Employee", roleId });
  if (teamId) await assignTeam(SYSTEM_VIEWER, { userId, teamId, effectiveFrom: TODAY });
  return { userId, email, password: tempPassword };
}

async function makeTeam(): Promise<{ id: string; name: string }> {
  const orgUnit = await createOrgUnit(SYSTEM_VIEWER, { name: `E2E본부-${randomUUID()}` });
  const name = `E2E팀-${randomUUID().slice(0, 8)}`;
  const team = await createTeam(SYSTEM_VIEWER, { orgUnitId: orgUnit.id, name });
  return { id: team.id, name };
}

async function login(page: Page, account: Account) {
  await page.goto("/login");
  await page.getByLabel("이메일").fill(account.email);
  await page.getByLabel("비밀번호").fill(account.password);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/account$/);
}

async function logout(page: Page) {
  await page.goto("/account");
  await page.getByRole("button", { name: "로그아웃" }).click();
  await expect(page).toHaveURL(/\/login$/);
}

// 준비 단계의 프로젝트 행 — 정산은 사람이 켜는 상태가 아니고(자동 전환은 04-11), 고객 승인
// 화면은 04-14·04-24라 상태·승인일을 DB에 직접 둔다.
async function makeProject(input: {
  teamId: string;
  pmUserId: string;
  status: string;
  startDate: string | null;
  endDate: string | null;
  approved: boolean;
}): Promise<{ id: string; number: string; name: string }> {
  const vendor = await insertVendor(SYSTEM_VIEWER, {
    name: `E2E생애클라이언트-${randomUUID()}`,
    normalizedName: `e2e생애클라이언트-${randomUUID()}`,
  });
  const name = `E2E생애-${randomUUID().slice(0, 8)}`;
  const created = await createProject(SYSTEM_VIEWER, {
    clientId: vendor.id,
    teamId: input.teamId,
    pmUserId: input.pmUserId,
    name,
    startDate: input.startDate,
    endDate: input.endDate,
  });
  await db.update(projects).set({ status: input.status }).where(eq(projects.id, created.id));
  if (input.approved) {
    await db
      .update(quoteRevisions)
      .set({ customerApprovedAt: new Date(), customerApprovedBy: input.pmUserId })
      .where(eq(quoteRevisions.projectId, created.id));
  }
  return { id: created.id, number: created.number, name };
}

async function addQuoteLine(projectId: string): Promise<{ revisionId: string; subcategory: string }> {
  const revision = await getCurrentQuoteRevision(SYSTEM_VIEWER, projectId);
  const [subcategory] = await db.select().from(codeItems).where(eq(codeItems.tableKey, "quote_subcategory")).limit(1);
  if (!revision || !subcategory) throw new Error("차수·소분류 준비 실패");
  await saveQuoteLines(SYSTEM_VIEWER, revision.id, [
    {
      subcategory: subcategory.value,
      itemName: "생애 E2E 줄",
      unitPrice: { currency: "KRW", amount: 100_000, fxRate: 1 },
      execution: { currency: "KRW", amount: 50_000, fxRate: 1 },
    },
  ]);
  return { revisionId: revision.id, subcategory: subcategory.value };
}

function headerTag(page: Page, label: string) {
  return page.getByText(label, { exact: true }).filter({ visible: true });
}

test.describe("프로젝트 상태 생애 (04-21, PROJ-04)", () => {
  test("팀장이 수주중 → 진행(목록형 → 확인 모달 → 태그 · 토스트), PM에게는 「상태 바꾸기」가 없다", async ({ page }) => {
    const team = await makeTeam();
    const pm = await makeAccount(DEFAULT_ROLE_ID, team.id);
    const lead = await makeAccount("role-team-lead", team.id);
    const vendor = await insertVendor(SYSTEM_VIEWER, {
      name: `E2E생애클라이언트-${randomUUID()}`,
      normalizedName: `e2e생애클라이언트-${randomUUID()}`,
    });

    // 기획 PM이 시작일만 적어 등록한다.
    await login(page, pm);
    await page.goto("/projects?new=1");
    await page.getByLabel("클라이언트").selectOption({ label: vendor.name });
    await page.getByLabel("팀").selectOption({ label: team.name });
    await page.getByLabel("담당 PM").selectOption({ index: 1 });
    const projectName = `E2E생애-${randomUUID().slice(0, 8)}`;
    await page.getByLabel("프로젝트명").fill(projectName);
    await page.getByLabel("시작일").fill(addDays(TODAY, 7));
    await page.getByRole("button", { name: "프로젝트 등록" }).click();
    await expect(page).toHaveURL(/\/projects\/.+/);
    const projectUrl = page.url();
    const subtitle = page.getByText(/\d{5} · 상세 견적 1차/);
    await expect(subtitle).toBeVisible();
    const projectNumber = /(\d{5})/.exec((await subtitle.textContent()) ?? "")?.[1] ?? "";
    expect(projectNumber).toMatch(/^\d{5}$/);
    await expect(page.getByRole("button", { name: "상태 바꾸기" })).toHaveCount(0);
    await logout(page);

    // 같은 팀 팀장 — 시드만으로 머리 줄의 번호·이름과 「상태 바꾸기」를 본다.
    await login(page, lead);
    await page.goto(projectUrl);
    await expect(page.getByRole("heading", { name: projectName })).toBeVisible();
    await expect(page.getByText(new RegExp(`${projectNumber} · 상세 견적 1차`))).toBeVisible();
    await expect(headerTag(page, "수주중")).toBeVisible();
    // D-50 — 부제의 상태 항목은 현재 상태 + 마지막 변경일(변경 기록이 없으면 등록일).
    await expect(page.getByText(`${projectNumber} · 상세 견적 1차`, { exact: true })).toBeVisible();
    await expect(page.getByText(`수주중 ${TODAY}`, { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "상태 바꾸기" }).click();
    const picker = page.getByRole("dialog", { name: "상태 바꾸기" });
    await expect(picker).toBeVisible();
    await expect(picker.getByRole("button", { name: /^진행/ })).toBeVisible();
    await expect(picker.getByRole("button", { name: /^미수주/ })).toBeVisible();
    await expect(picker.getByRole("button", { name: /^정산/ })).toHaveCount(0);
    await expect(picker.getByText("수주 확정 · 종료일 다음 날 자동으로 정산")).toBeVisible();
    await expect(picker.getByText("수주 실패 · 쌓인 비용은 팀 미수주 비용")).toBeVisible();

    await picker.getByRole("button", { name: /^진행/ }).click();
    const confirm = page.getByRole("dialog", { name: "진행으로 바꾸기" });
    await expect(confirm).toBeVisible();
    await expect(confirm.getByText(projectName)).toBeVisible();
    await expect(confirm.getByText("종료일 없음 · 시작일로 저장", { exact: true })).toBeVisible();
    await expect(confirm.getByText("1차 고객 승인 전 · 진행부터 지출결의 멈춤", { exact: true })).toBeVisible();

    await confirm.getByRole("button", { name: /^진행으로 바꾸기/ }).click();
    await expect(page.getByText(`진행으로 바꾸기 · ${projectNumber}`, { exact: true })).toBeVisible();
    await expect(headerTag(page, "진행")).toBeVisible();
    await expect(page.getByText(`${projectNumber} · 상세 견적 1차`, { exact: true })).toBeVisible();
    await expect(page.getByText(`진행 ${TODAY}`, { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "상태 바꾸기" })).toHaveCount(0);
    // S16 — 전환 성공으로 트리거가 사라졌으면 포커스는 머리 줄 제목으로 돌아온다.
    await expect(page.getByRole("heading", { name: projectName })).toBeFocused();
  });

  test("(b) 팀장이 미수주로 닫고, 승인 전이라 「진행으로 되돌리기」가 확인 모달을 거쳐 진행으로 (DR-7 · DR-21)", async ({ page }) => {
    const team = await makeTeam();
    const pm = await makeAccount(DEFAULT_ROLE_ID, team.id);
    const lead = await makeAccount("role-team-lead", team.id);
    const project = await makeProject({
      teamId: team.id,
      pmUserId: pm.userId,
      status: "bidding",
      startDate: addDays(TODAY, 7),
      endDate: addDays(TODAY, 9),
      approved: false,
    });

    await login(page, lead);
    await page.goto(`/projects/${project.id}`);
    await page.getByRole("button", { name: "상태 바꾸기" }).click();
    await page.getByRole("dialog", { name: "상태 바꾸기" }).getByRole("button", { name: /^미수주/ }).click();
    const close = page.getByRole("dialog", { name: "미수주로 닫기" });
    await expect(close.getByText(`${project.number} ${project.name}`, { exact: true })).toBeVisible();
    await expect(
      close.getByText("쌓인 비용이 팀 미수주 비용이 됨 · 진행으로 되돌리기 있음", { exact: true }),
    ).toBeVisible();
    await close.getByRole("button", { name: /^미수주로 닫기/ }).click();
    await expect(page.getByText(`미수주로 닫기 · ${project.number}`, { exact: true })).toBeVisible();
    await expect(headerTag(page, "미수주")).toBeVisible();

    await expect(page.getByRole("button", { name: "상태 바꾸기" })).toHaveCount(0);
    // S16 — 트리거가 남아 있으면(라벨만 「진행으로 되돌리기」로 바뀜) 포커스는 트리거로.
    await expect(page.getByRole("button", { name: "진행으로 되돌리기" })).toBeFocused();
    await page.getByRole("button", { name: "진행으로 되돌리기" }).click();
    const revert = page.getByRole("dialog", { name: "진행으로 되돌리기" });
    await expect(revert.getByText("1차 고객 승인 전 · 진행부터 지출결의 멈춤", { exact: true })).toBeVisible();
    await revert.getByRole("button", { name: /^진행으로 되돌리기/ }).click();
    await expect(page.getByText(`진행으로 되돌리기 · ${project.number}`, { exact: true })).toBeVisible();
    await expect(headerTag(page, "진행")).toBeVisible();
  });

  test("(b2) 승인됐고 종료일이 남은 미수주는 「진행으로 되돌리기」가 모달 없이 곧바로 진행 (DR-7)", async ({ page }) => {
    const team = await makeTeam();
    const pm = await makeAccount(DEFAULT_ROLE_ID, team.id);
    const lead = await makeAccount("role-team-lead", team.id);
    const project = await makeProject({
      teamId: team.id,
      pmUserId: pm.userId,
      status: "lost",
      startDate: addDays(TODAY, 1),
      endDate: addDays(TODAY, 7),
      approved: true,
    });

    await login(page, lead);
    await page.goto(`/projects/${project.id}`);
    await page.getByRole("button", { name: "진행으로 되돌리기" }).click();
    await expect(page.getByText(`진행으로 되돌리기 · ${project.number}`, { exact: true })).toBeVisible();
    await expect(headerTag(page, "진행")).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    // S16 — 즉시 경로도 트리거가 사라지면 포커스는 머리 줄 제목으로.
    await expect(page.getByRole("heading", { name: project.name })).toBeFocused();
  });

  test("(b3) 승인됐지만 종료일이 지난 미수주는 확인 모달 결과 줄 「종료일 지남 · 바로 정산」 (DR-7)", async ({ page }) => {
    const team = await makeTeam();
    const pm = await makeAccount(DEFAULT_ROLE_ID, team.id);
    const lead = await makeAccount("role-team-lead", team.id);
    const project = await makeProject({
      teamId: team.id,
      pmUserId: pm.userId,
      status: "lost",
      startDate: addDays(TODAY, -10),
      endDate: addDays(TODAY, -3),
      approved: true,
    });

    await login(page, lead);
    await page.goto(`/projects/${project.id}`);
    await page.getByRole("button", { name: "진행으로 되돌리기" }).click();
    const revert = page.getByRole("dialog", { name: "진행으로 되돌리기" });
    await expect(revert.getByText("종료일 지남 · 바로 정산", { exact: true })).toBeVisible();
    await expect(revert.getByText(/고객 승인 전/)).toHaveCount(0);
  });

  test("(c) 정산 프로젝트는 대표만 「상태 바꾸기」 → 바로 「완료로 바꾸기」, 팀장·담당 PM에게는 없다 (D-79)", async ({ page }) => {
    const team = await makeTeam();
    const pm = await makeAccount(DEFAULT_ROLE_ID, team.id);
    const lead = await makeAccount("role-team-lead", team.id);
    const ceo = await makeAccount("role-ceo");
    const project = await makeProject({
      teamId: team.id,
      pmUserId: pm.userId,
      status: "settling",
      startDate: addDays(TODAY, -10),
      endDate: addDays(TODAY, -3),
      approved: true,
    });

    for (const account of [lead, pm]) {
      await login(page, account);
      await page.goto(`/projects/${project.id}`);
      await expect(page.getByRole("heading", { name: project.name })).toBeVisible();
      await expect(headerTag(page, "정산")).toBeVisible();
      await expect(page.getByRole("button", { name: "상태 바꾸기" })).toHaveCount(0);
      await logout(page);
    }

    await login(page, ceo);
    await page.goto(`/projects/${project.id}`);
    await page.getByRole("button", { name: "상태 바꾸기" }).click();
    await expect(page.getByRole("dialog", { name: "상태 바꾸기" })).toHaveCount(0);
    const complete = page.getByRole("dialog", { name: "완료로 바꾸기" });
    await expect(complete.getByText(`${project.number} ${project.name}`, { exact: true })).toBeVisible();
    await expect(complete.getByText("견적 줄 잠김 · 새 지출결의 받지 않음 · 되돌리기 없음", { exact: true })).toBeVisible();
    await complete.getByRole("button", { name: /^완료로 바꾸기/ }).click();
    await expect(page.getByText(`완료로 바꾸기 · ${project.number}`, { exact: true })).toBeVisible();
    await expect(headerTag(page, "완료")).toBeVisible();
    await expect(page.getByRole("button", { name: "상태 바꾸기" })).toHaveCount(0);

    // (d) 완료 뒤 담당 PM의 견적 줄 저장은 04-06 규칙으로 거부된다(셀 단위 잠금 렌더는 04-30 —
    // 지금 화면은 편집 칸을 내주지 않으므로 서버 쪽 저장을 직접 부른다).
    const revision = await getCurrentQuoteRevision(SYSTEM_VIEWER, project.id);
    const [subcategory] = await db.select().from(codeItems).where(eq(codeItems.tableKey, "quote_subcategory")).limit(1);
    if (!revision || !subcategory) throw new Error("차수·소분류 준비 실패");
    await expect(
      saveQuoteLines({ id: pm.userId, roleId: DEFAULT_ROLE_ID }, revision.id, [
        {
          subcategory: subcategory.value,
          itemName: "완료 뒤 줄",
          unitPrice: { currency: "KRW", amount: 1_000, fxRate: 1 },
          execution: { currency: "KRW", amount: 1_000, fxRate: 1 },
        },
      ]),
    ).rejects.toThrow("완료 · 견적 줄 잠김");
  });

  test("(a) 시작일 없는 수주중에서 진행을 고르면 1차가 제출 전부터 막히고 게이트 문자열이 그대로, 모달 유지·토스트 없음", async ({
    page,
  }) => {
    const team = await makeTeam();
    const pm = await makeAccount(DEFAULT_ROLE_ID, team.id);
    const lead = await makeAccount("role-team-lead", team.id);
    const project = await makeProject({
      teamId: team.id,
      pmUserId: pm.userId,
      status: "bidding",
      startDate: null,
      endDate: null,
      approved: false,
    });

    await login(page, lead);
    await page.goto(`/projects/${project.id}`);
    await page.getByRole("button", { name: "상태 바꾸기" }).click();
    await page.getByRole("dialog", { name: "상태 바꾸기" }).getByRole("button", { name: /^진행/ }).click();
    const confirm = page.getByRole("dialog", { name: "진행으로 바꾸기" });
    const primary = confirm.getByRole("button", { name: /^진행으로 바꾸기/ });
    await expect(primary).toHaveAttribute("aria-disabled", "true");
    // 막힘 이유는 1차 왼쪽에 한 번만 보이고(§7-17), 1차의 aria-describedby로 읽힌다.
    const reason = confirm.getByText("시작일 없음 · 기간 적기", { exact: true }).filter({ visible: true });
    await expect(reason).toHaveCount(1);
    const reasonBox = await reason.boundingBox();
    const primaryBox = await primary.boundingBox();
    expect(reasonBox && primaryBox && reasonBox.x + reasonBox.width <= primaryBox.x).toBe(true);
    await expect(primary).toHaveAccessibleDescription("시작일 없음 · 기간 적기");

    // aria-disabled 버튼은 Playwright 실행 가능성 검사에서 막히므로 force로 실제 클릭만 보낸다.
    await primary.click({ force: true });
    await expect(confirm).toBeVisible();
    await expect(page.getByText(/진행으로 바꾸기 · /)).toHaveCount(0);
    await expect(headerTag(page, "수주중")).toBeVisible();
  });

  test("(a2) 모달이 열린 사이 상태가 바뀌면 거부 — 서버 문자열이 1차 왼쪽에, 모달 유지·토스트 없음 (A-34)", async ({
    page,
  }) => {
    const team = await makeTeam();
    const pm = await makeAccount(DEFAULT_ROLE_ID, team.id);
    const lead = await makeAccount("role-team-lead", team.id);
    const project = await makeProject({
      teamId: team.id,
      pmUserId: pm.userId,
      status: "bidding",
      startDate: addDays(TODAY, 7),
      endDate: null,
      approved: false,
    });

    await login(page, lead);
    await page.goto(`/projects/${project.id}`);
    await page.getByRole("button", { name: "상태 바꾸기" }).click();
    await page.getByRole("dialog", { name: "상태 바꾸기" }).getByRole("button", { name: /^진행/ }).click();
    const confirm = page.getByRole("dialog", { name: "진행으로 바꾸기" });
    const primary = confirm.getByRole("button", { name: /^진행으로 바꾸기/ });
    await expect(primary).not.toHaveAttribute("aria-disabled", "true");

    // 화면이 본 상태(from = 수주중)와 달라지게 다른 곳에서 미수주로 바꿔 둔다.
    await db.update(projects).set({ status: "lost" }).where(eq(projects.id, project.id));
    await primary.click();

    await expect(confirm).toBeVisible();
    const reason = confirm.getByText("상태가 미수주로 바뀜 · 새로 고침", { exact: true }).filter({ visible: true });
    await expect(reason).toHaveCount(1);
    await expect(primary).toHaveAttribute("aria-disabled", "true");
    const reasonBox = await reason.boundingBox();
    const primaryBox = await primary.boundingBox();
    expect(reasonBox && primaryBox && reasonBox.x + reasonBox.width <= primaryBox.x).toBe(true);
    await expect(page.getByText(/진행으로 바꾸기 · /)).toHaveCount(0);
  });

  test("(e) 진행 프로젝트는 누구에게도 「상태 바꾸기」·「진행으로 되돌리기」가 없다 (CEO-D13)", async ({ page }) => {
    const team = await makeTeam();
    const pm = await makeAccount(DEFAULT_ROLE_ID, team.id);
    const lead = await makeAccount("role-team-lead", team.id);
    const ceo = await makeAccount("role-ceo");
    const project = await makeProject({
      teamId: team.id,
      pmUserId: pm.userId,
      status: "in_progress",
      startDate: TODAY,
      endDate: addDays(TODAY, 7),
      approved: true,
    });

    for (const account of [lead, ceo, pm]) {
      await login(page, account);
      await page.goto(`/projects/${project.id}`);
      await expect(page.getByRole("heading", { name: project.name })).toBeVisible();
      await expect(headerTag(page, "진행")).toBeVisible();
      await expect(page.getByRole("button", { name: "상태 바꾸기" })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "진행으로 되돌리기" })).toHaveCount(0);
      await logout(page);
    }
  });

  test("(g) 다른 팀 팀장에게는 「상태 바꾸기」가 없고 본부 책임자(전사)에게는 있다 (D11 · OV-4)", async ({ page }) => {
    const team = await makeTeam();
    const otherTeam = await makeTeam();
    const pm = await makeAccount(DEFAULT_ROLE_ID, team.id);
    const otherLead = await makeAccount("role-team-lead", otherTeam.id);
    const divisionHead = await makeAccount("role-division-head");
    const project = await makeProject({
      teamId: team.id,
      pmUserId: pm.userId,
      status: "bidding",
      startDate: addDays(TODAY, 7),
      endDate: null,
      approved: false,
    });

    await login(page, otherLead);
    await page.goto(`/projects/${project.id}`);
    await expect(page.getByRole("heading", { name: project.name })).toBeVisible();
    await expect(page.getByRole("button", { name: "상태 바꾸기" })).toHaveCount(0);
    await logout(page);

    await login(page, divisionHead);
    await page.goto(`/projects/${project.id}`);
    await expect(page.getByRole("button", { name: "상태 바꾸기" })).toBeVisible();
  });

  test("(h) 미수주로 닫기 1차를 dblclick해도 전환은 한 번 — 두 번째 요청·「상태가 … 바뀜」이 없다 (A-34)", async ({
    page,
  }) => {
    const team = await makeTeam();
    const pm = await makeAccount(DEFAULT_ROLE_ID, team.id);
    const lead = await makeAccount("role-team-lead", team.id);
    const project = await makeProject({
      teamId: team.id,
      pmUserId: pm.userId,
      status: "bidding",
      startDate: addDays(TODAY, 7),
      endDate: null,
      approved: false,
    });

    await login(page, lead);
    await page.goto(`/projects/${project.id}`);
    const actionRequests: Promise<unknown>[] = [];
    page.on("request", (request) => {
      if (request.method() === "POST" && request.headers()["next-action"]) actionRequests.push(request.response());
    });
    await page.getByRole("button", { name: "상태 바꾸기" }).click();
    await page.getByRole("dialog", { name: "상태 바꾸기" }).getByRole("button", { name: /^미수주/ }).click();
    await page.getByRole("dialog", { name: "미수주로 닫기" }).getByRole("button", { name: /^미수주로 닫기/ }).dblclick();

    await expect(page.getByText(`미수주로 닫기 · ${project.number}`, { exact: true })).toHaveCount(1);
    await expect(headerTag(page, "미수주")).toBeVisible();
    await Promise.all(actionRequests);
    expect(actionRequests).toHaveLength(1);
    await expect(page.getByText("상태가 미수주로 바뀜 · 새로 고침")).toHaveCount(0);
    const logs = await db.select().from(actionLog).where(eq(actionLog.entityId, project.id));
    expect(logs.filter((log) => log.actionType === "status_change")).toHaveLength(1);
  });

  test("(i) 미저장 편집이 있으면 「상태 바꾸기」 자체가 막히고, 저장하면 다시 켜진다 (DR-6)", async ({ page }) => {
    // 견적 줄을 고치면서 상태도 바꿀 수 있는 시드 계급은 시스템 관리자뿐이다 — 팀장 시드에는
    // projects 쓰기가 없다(04-20). 권한을 손으로 켜지 않는다(ENG-D2).
    const team = await makeTeam();
    const pm = await makeAccount(DEFAULT_ROLE_ID, team.id);
    const admin = await makeAccount(SYSADMIN_ROLE_ID);
    const project = await makeProject({
      teamId: team.id,
      pmUserId: pm.userId,
      status: "bidding",
      startDate: addDays(TODAY, 7),
      endDate: null,
      approved: false,
    });
    await addQuoteLine(project.id);

    await login(page, admin);
    await page.goto(`/projects/${project.id}`);
    const trigger = page.getByRole("button", { name: "상태 바꾸기" });
    await expect(trigger).not.toHaveAttribute("aria-disabled", "true");

    const dataRow = page.locator("tbody tr").nth(1);
    const executionCell = dataRow.getByRole("gridcell").nth(7);
    await executionCell.click();
    await executionCell.getByLabel("실행가").fill("70000");
    await executionCell.getByLabel("실행가").press("Enter");

    await expect(trigger).toHaveAttribute("aria-disabled", "true");
    const reason = page.getByText("저장 안 한 편집 1칸 · 먼저 일괄 저장", { exact: true });
    await expect(reason).toBeVisible();
    const describedBy = (await trigger.getAttribute("aria-describedby")) ?? "";
    expect(describedBy.split(" ")).toContain(await reason.getAttribute("id"));
    await trigger.click({ force: true });
    await expect(page.getByRole("dialog")).toHaveCount(0);

    // Ctrl+S는 그리드에 포커스가 있을 때 저장한다(quote-table.spec.ts와 같은 형태).
    await executionCell.focus();
    await page.keyboard.press("Control+s");
    await expect(page.getByText(/저장됨/)).toBeVisible();
    await expect(trigger).not.toHaveAttribute("aria-disabled", "true");
    await trigger.click();
    await expect(page.getByRole("dialog", { name: "상태 바꾸기" })).toBeVisible();
  });

  test("(f) 375px 머리 줄은 제목 → 상태 태그 → 부제 → 「상태 바꾸기」, 가로 스크롤 0, 「더보기」 없음 (DR-26)", async ({
    page,
  }) => {
    const team = await makeTeam();
    const pm = await makeAccount(DEFAULT_ROLE_ID, team.id);
    const lead = await makeAccount("role-team-lead", team.id);
    const project = await makeProject({
      teamId: team.id,
      pmUserId: pm.userId,
      status: "bidding",
      startDate: addDays(TODAY, 7),
      endDate: null,
      approved: false,
    });

    await page.setViewportSize({ width: 375, height: 800 });
    await login(page, lead);
    await page.goto(`/projects/${project.id}`);
    const title = page.getByRole("heading", { name: project.name });
    const tag = headerTag(page, "수주중");
    const subtitle = page.getByText(`${project.number} · 상세 견적 1차`, { exact: true });
    const trigger = page.getByRole("button", { name: "상태 바꾸기" });
    await expect(trigger).toBeVisible();

    const tops: number[] = [];
    for (const locator of [title, tag, subtitle, trigger]) {
      const box = await locator.boundingBox();
      if (!box) throw new Error("머리 줄 요소가 보이지 않습니다");
      tops.push(box.y);
    }
    for (let index = 1; index < tops.length; index++) {
      expect(tops[index]).toBeGreaterThan(tops[index - 1] ?? 0);
    }
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBe(0);
    // 하단 탭의 「더보기」(셸)는 <main> 밖이다 — 머리 줄의 「더보기」만 본다.
    await expect(page.getByRole("main").getByRole("button", { name: "더보기" })).toHaveCount(0);
  });
});
