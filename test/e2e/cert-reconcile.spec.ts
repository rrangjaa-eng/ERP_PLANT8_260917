import { randomUUID } from "node:crypto";
import { test, expect, type Browser, type Locator, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { certSubmissions, users } from "@/db/schema";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { loadIntake, submitCertificate } from "@/domain/certs/intake";
import { formatSubmittedAtKst } from "@/domain/certs/format";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { insertRole, setRoleArchived } from "@/repositories/roles";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { createFixtureUser } from "./fixtures";
import { closeCertEventForTest, createCertEvent, setCertPrizeValueForTest, signaturePngFixture } from "./helpers/cert";

// 04.3-17 — I′3 제출 섹션(대조) · I4 파기 대상(1280). 경영관리 고정물은 시스템 관리자가 아닌 전용 계급이다(E11 —
// cert-events.spec 선례: 공유 계급 role-sysadmin의 cert_prize.value를 바꾸지 않는다). 이름은 박서연으로 둔다(닫힘 줄).
// 전역 설정(기능 · 문의 전화)은 cert.setup.ts가 켠다.

test.describe.configure({ mode: "serial" });

type Account = { email: string; password: string };

let manager: Account;
let managerRoleId: string;

test.beforeAll(async () => {
  managerRoleId = `role-e2e-reconcile-${randomUUID()}`;
  await insertRole(SYSTEM_VIEWER, { id: managerRoleId, name: `E2E 대조 ${managerRoleId.slice(-12)}`, sortOrder: 99 });
  for (const [menu, action] of [
    ["certs.events", "view"],
    ["certs.qr", "write"],
    ["certs.submissions", "view"],
    ["certs.submissions", "write"],
  ] as const) {
    await upsertPermission(SYSTEM_VIEWER, { roleId: managerRoleId, menu, action, allowed: true });
  }
  for (const infoItem of ["cert_event.value", "cert_prize.value", "cert_submission.value", "cert.rrn_unmasked"]) {
    await upsertVisibility(SYSTEM_VIEWER, { roleId: managerRoleId, infoItem, visible: true });
  }
  manager = await createFixtureUser({ roleId: managerRoleId });
  await db.update(users).set({ name: "박서연" }).where(eq(users.email, manager.email));
});

test.afterAll(async () => {
  await setRoleArchived(SYSTEM_VIEWER, managerRoleId, true);
});

async function login(page: Page, account: Account): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("이메일").fill(account.email);
  await page.getByLabel("비밀번호").fill(account.password);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/account$/);
}

async function loggedInPage(browser: Browser, account: Account): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await login(page, account);
  return page;
}

let ipSeq = 0;

async function submitAs(token: string, prizeId: string, name: string, phone: string): Promise<{ id: string; at: string }> {
  const intake = await loadIntake(token);
  if (intake.kind !== "open") throw new Error(`loadIntake ${intake.kind}`);
  ipSeq += 1;
  const result = await submitCertificate(
    token,
    {
      prizeId,
      idempotencyKey: randomUUID(),
      consentVersion: intake.terms.consentVersion,
      retentionYears: intake.terms.retentionYears,
      name,
      rrnFront6: "930412",
      rrnBack7: "2123458",
      phone,
      consent: true,
      signaturePngBase64: signaturePngFixture().toString("base64"),
      rrnRecheckConfirmed: true,
    },
    `192.0.2.${(ipSeq % 250) + 1}`,
  );
  if (result.kind !== "saved") throw new Error(`submitCertificate ${result.kind}`);
  const rows = await db.select().from(certSubmissions).where(eq(certSubmissions.prizeId, prizeId));
  const row = rows.sort((a, b) => b.submittedAt.getTime() - a.submittedAt.getTime())[0];
  if (!row) throw new Error("제출 행 없음");
  return { id: row.id, at: formatSubmittedAtKst(row.submittedAt.toISOString()).slice(5) };
}

// 경품 둘(A 당첨 2 · B — 제출 뒤 30,000으로 내려 파기 대상) · A 셋(둘은 같은 연락처 · 같은 이름 정규형) · B 하나.
async function reconcileEvent(name = "E2E 대조") {
  const event = await createCertEvent({
    name,
    prizes: [
      { name: "갤럭시 탭 S10", unitValueKrw: 1_290_000, winnerCount: 2 },
      { name: "스타벅스 카드", unitValueKrw: 73_519, winnerCount: 1 },
    ],
  });
  const [prizeA, prizeB] = event.prizeIds;
  if (!event.token || !prizeA || !prizeB) throw new Error("fixture");
  const a1 = await submitAs(event.token, prizeA, "김하늘", "010-4821-7730");
  const a2 = await submitAs(event.token, prizeA, "김 하늘", "010-4821-7730");
  const a3 = await submitAs(event.token, prizeA, "이도윤", "010-2222-0045");
  const b1 = await submitAs(event.token, prizeB, "박민수", "010-3333-4444");
  await setCertPrizeValueForTest(prizeB, 30_000);
  return { ...event, prizeA, prizeB, a1, a2, a3, b1 };
}

function submissionsTable(page: Page): Locator {
  return page.locator("table").filter({ has: page.locator("caption", { hasText: /^제출$/ }) });
}

// 토큰 색 — 같은 문서에 var(--x) 색을 가진 임시 요소를 만들어 계산값을 읽는다.
async function tokenColor(page: Page, token: string): Promise<string> {
  return page.evaluate((name) => {
    const probe = document.createElement("span");
    probe.style.color = `var(${name})`;
    document.body.append(probe);
    const color = getComputedStyle(probe).color;
    probe.remove();
    return color;
  }, token);
}

async function colorOf(locator: Locator): Promise<string> {
  return locator.evaluate((element) => getComputedStyle(element).color);
}

test("tracer — 제출 섹션(읽기 표 · 경품별 그룹 · 가린 연락처 · 색 글자) → Tab 링크 → I4 파기 대상 · 미리 가져오기 0건", async ({ browser }) => {
  const ev = await reconcileEvent();
  const page = await loggedInPage(browser, manager);
  const submissionRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/certs/submissions/")) submissionRequests.push(request.url());
  });
  await page.goto(`/certs/events/${ev.eventId}`);

  const table = submissionsTable(page);
  // 스트리밍 응답은 숨긴 자리에 먼저 꽂힌 뒤 옮겨진다 — 보이는 표를 기다린다.
  await expect(table).toBeVisible();
  await expect(table).toHaveCount(1);
  await expect(page.locator('[role="grid"]').filter({ has: page.locator("caption", { hasText: /^제출$/ }) })).toHaveCount(0);
  await expect(table.locator("caption")).toHaveClass(/sr-only/);

  // 그룹 머리글 — 단위 붙은 건수(DR-15) · 당첨 수 · 초과(E6 a · DR-2). `초과 1건`만 --warning.
  const headerA = table.getByText("갤럭시 탭 S10 · 제출 3건 / 당첨 2명", { exact: false });
  await expect(headerA).toBeVisible();
  await expect(headerA).toContainText("· 초과 1건");
  const over = table.getByText("초과 1건", { exact: true });
  expect(await colorOf(over)).toBe(await tokenColor(page, "--warning"));
  expect(await colorOf(headerA)).toBe(await tokenColor(page, "--muted"));
  await expect(table.getByText("스타벅스 카드 · 제출 1건 / 당첨 1명", { exact: true })).toBeVisible();

  // 줄 — 가린 연락처 · 색 글자 순서(파기 대상 → 같은 연락처 → 같은 이름).
  const rowA1 = table.locator("tr").filter({ hasText: "김하늘" }).first();
  await expect(rowA1).toContainText("010-****-7730");
  await expect(rowA1).toContainText("같은 연락처 2건 · 같은 이름 2건");
  const rowA2 = table.locator("tr").filter({ hasText: "김 하늘" }).first();
  await expect(rowA2).toContainText("같은 연락처 2건 · 같은 이름 2건");
  const rowA3 = table.locator("tr").filter({ hasText: "이도윤" }).first();
  await expect(rowA3).not.toContainText("같은");
  const rowB1 = table.locator("tr").filter({ hasText: "박민수" }).first();
  await expect(rowB1).toContainText("파기 대상");
  expect(await colorOf(rowB1.getByText("파기 대상", { exact: true }))).toBe(await tokenColor(page, "--warning"));
  await expect(table).not.toContainText("4821-7730");

  // 「제출 내용」 — 줄마다 보통 Tab 정지 · 접근 이름이 줄마다 다름(DR-8).
  const linkA1 = page.getByRole("link", { name: `제출 내용 · 김하늘 · ${ev.a1.at}`, exact: true });
  const linkA2 = page.getByRole("link", { name: `제출 내용 · 김 하늘 · ${ev.a2.at}`, exact: true });
  const linkB1 = page.getByRole("link", { name: `제출 내용 · 박민수 · ${ev.b1.at}`, exact: true });
  await expect(linkA1).toHaveCount(1);
  await linkA1.focus();
  await page.keyboard.press("Tab");
  await expect(linkA2).toBeFocused();

  // 미리 가져오기 0건 — 표 끝까지 스크롤하고 링크에 1초 머문다.
  await page.mouse.wheel(0, 10_000);
  await linkB1.hover();
  await page.waitForTimeout(1_000);
  expect(submissionRequests).toEqual([]);

  await linkB1.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(new RegExp(`/certs/submissions/${ev.b1.id}$`));
  const rrnGroup = page.getByRole("group", { name: "주민등록번호" });
  await expect(rrnGroup).toContainText("930412-2****** · 파기 대상");
  expect(await colorOf(rrnGroup.getByText("파기 대상", { exact: false }).last())).toBe(await tokenColor(page, "--warning"));
  await expect(rrnGroup.getByRole("button", { name: "전체 보기" })).toHaveCount(1);
  await page.context().close();
});

// ── Task 2 — 「링크 닫기」 · 「신청 취소」 · 「대조 제외」 · 경품 표 미제출 ───────────────────────────────

function isServerAction(request: { method(): string; headers(): Record<string, string> }): boolean {
  return request.method() === "POST" && request.headers()["next-action"] !== undefined;
}

test("「링크 닫기」 — 모달 문장 넷 · Esc 취소 · 응답 끊김 → 모달 안 실패 줄 · 1차 다시 → 토스트 · 닫힘 줄 · 가액 편집은 남음", async ({ browser }) => {
  const ev = await reconcileEvent("E2E 링크 닫기");
  const page = await loggedInPage(browser, manager);
  await page.goto(`/certs/events/${ev.eventId}`);

  const trigger = page.getByRole("button", { name: "링크 닫기" });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "링크 닫기" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(`${ev.eventName} · 제출 4건`);
  await expect(dialog).toContainText("더 제출할 수 없습니다 · 다시 열 수 없습니다");
  await expect(dialog.getByRole("button", { name: /취소/ })).toBeVisible();
  await expect(dialog.getByRole("button", { name: /^링크 닫기/ })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();

  // 응답 끊김 — 서버 액션 POST 한 번을 끊는다.
  let cut = 0;
  await page.route(`**/certs/events/${ev.eventId}`, (route) => {
    if (isServerAction(route.request()) && cut === 0) {
      cut += 1;
      return route.abort();
    }
    return route.fallback();
  });
  await trigger.click();
  await dialog.getByRole("button", { name: /^링크 닫기/ }).click();
  const failure = dialog.getByRole("alert");
  await expect(failure).toHaveText("닫지 못했습니다 · 다시 시도");
  await expect(dialog.getByRole("button", { name: /^링크 닫기/ })).not.toHaveAttribute("aria-disabled", "true");
  await dialog.getByRole("button", { name: /^링크 닫기/ }).click();
  await expect(page.getByRole("status").filter({ hasText: "링크 닫기 · 제출 4건" })).toBeVisible();
  await expect(dialog).toBeHidden();
  await expect(page.getByText(/^닫힘 · .* · 박서연이 닫음$/)).toBeVisible();
  await expect(page.getByRole("button", { name: "링크 닫기" })).toHaveCount(0);
  // 닫은 뒤에도 가액 편집은 남는다 — 편집 표(grid)와 1차 「일괄 저장」.
  await expect(page.locator('[role="grid"]')).toHaveCount(1);
  await expect(page.getByRole("button", { name: /^일괄 저장/ })).toBeVisible();
  await page.context().close();
});

test("「신청 취소」 — 경품 0 → 확인 없이 목록 + 토스트 · 경품 1줄 → 비활성 + 이유(경영관리 · 신청자 각각)", async ({ browser }) => {
  const pm = await createFixtureUser({ roleId: DEFAULT_ROLE_ID });
  const [pmRow] = await db.select({ id: users.id }).from(users).where(eq(users.email, pm.email));
  const empty = await createCertEvent({ name: "E2E 취소", status: "requested", createdBy: pmRow?.id ?? null });
  const withPrize = await createCertEvent({ name: "E2E 취소 막힘", status: "requested", createdBy: pmRow?.id ?? null, prizes: [{}] });

  const page = await loggedInPage(browser, manager);
  await page.goto(`/certs/events/${empty.eventId}`);
  await page.getByRole("button", { name: "신청 취소" }).click();
  await expect(page).toHaveURL(/\/certs\/events(\?.*)?$/);
  await expect(page.getByRole("status").filter({ hasText: `신청 취소 · ${empty.eventName}` })).toBeVisible();

  await page.goto(`/certs/events/${withPrize.eventId}`);
  const blocked = page.getByRole("button", { name: "신청 취소" });
  await expect(blocked).toHaveAttribute("aria-disabled", "true");
  await expect(page.getByText("경품 1줄 있음 · 경품 줄 지운 뒤 취소", { exact: true })).toBeVisible();
  await page.context().close();

  const pmPage = await loggedInPage(browser, pm);
  await pmPage.goto(`/certs/events/${withPrize.eventId}`);
  await expect(pmPage.getByRole("button", { name: "신청 취소" })).toHaveAttribute("aria-disabled", "true");
  await expect(pmPage.getByText("경품 1줄 있음 · 취소는 경영관리", { exact: true })).toBeVisible();
  await pmPage.context().close();
});

test("「대조 제외」 — I4 머리 2차 → 확인 → I′3 그 줄 포커스 · 토스트 · --muted 줄 · 그룹 셈 −1 · 제외된 I4 · 인쇄 404", async ({ browser }) => {
  const ev = await reconcileEvent("E2E 대조 제외");
  const page = await loggedInPage(browser, manager);
  await page.goto(`/certs/submissions/${ev.a1.id}`);

  const trigger = page.getByRole("button", { name: "대조 제외" });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "대조 제외" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(`김하늘 · 갤럭시 탭 S10 · ${ev.a1.at} 제출`);
  await expect(dialog).toContainText("주민등록번호 · 주소 · 연락처 · 서명을 지웁니다 · 되돌릴 수 없습니다");
  await expect(dialog).toContainText("지급 대상에서 빠집니다");
  const primary = dialog.getByRole("button", { name: /^대조 제외/ });
  await expect(primary).toBeFocused();
  await primary.click();

  await expect(page).toHaveURL(new RegExp(`/certs/events/${ev.eventId}`));
  await expect(page.getByRole("status").filter({ hasText: "대조 제외 · 김하늘" })).toBeVisible();
  const link = page.getByRole("link", { name: `제출 내용 · 김하늘 · ${ev.a1.at}`, exact: true });
  await expect(link).toBeFocused();
  const table = submissionsTable(page);
  const row = table.locator("tr").filter({ has: link });
  await expect(row).toContainText("대조 제외");
  await expect(row).toContainText("—");
  expect(await colorOf(row.locator("td").first())).toBe(await tokenColor(page, "--muted"));
  await expect(table.getByText("갤럭시 탭 S10 · 제출 2건 / 당첨 2명", { exact: true })).toBeVisible();

  await page.goto(`/certs/submissions/${ev.a1.id}`);
  await expect(page.getByText("대조 제외", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "고친 내용 저장" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "전체 보기" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /인쇄/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "대조 제외" })).toHaveCount(0);
  expect((await page.request.get(`/print/certs/${ev.a1.id}`)).status()).toBe(404);
  await page.context().close();
});

test("경품 표 — 닫힌 행사 당첨 3 · 제출 1 목록 경품 → `1 · 미제출 2`(미제출만 --warning) · 접수 중 같은 줄은 `1`", async ({ browser }) => {
  const make = async (name: string) => {
    const event = await createCertEvent({ name, prizes: [{ name: "다이슨 에어랩", unitValueKrw: 599_000, winnerCount: 3 }] });
    await submitAs(event.token ?? "", event.prizeIds[0] ?? "", "김하늘", "010-4821-7730");
    return event;
  };
  const closed = await make("E2E 미제출 닫힘");
  await closeCertEventForTest(closed.eventId);
  const open = await make("E2E 미제출 접수 중");

  const page = await loggedInPage(browser, manager);
  const prizeRow = (p: Page) =>
    p.locator("table").filter({ has: p.locator("caption", { hasText: /^경품$/ }) }).locator("tbody tr").filter({ hasText: "다이슨 에어랩" });
  await page.goto(`/certs/events/${closed.eventId}`);
  await expect(prizeRow(page)).toContainText("1 · 미제출 2");
  expect(await colorOf(prizeRow(page).getByText("미제출 2", { exact: true }))).toBe(await tokenColor(page, "--warning"));
  await page.goto(`/certs/events/${open.eventId}`);
  await expect(prizeRow(page)).not.toContainText("미제출");
  await page.context().close();
});
