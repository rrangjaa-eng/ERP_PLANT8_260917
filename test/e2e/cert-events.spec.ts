import { randomUUID } from "node:crypto";
import { test, expect, type Browser, type Locator, type Page, type Request } from "@playwright/test";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { certEvents } from "@/db/schema/cert-events";
import { createEvent } from "@/domain/certs/events";
import { setPermissionCell } from "@/domain/permissions/matrix";
import { SYSADMIN_ROLE_ID } from "@/domain/permissions/roles";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { upsertVisibility } from "@/repositories/permissions";
import { insertRole, setRoleArchived } from "@/repositories/roles";
import { findUserByEmail } from "@/repositories/users";
import { createFixtureUser } from "./fixtures";
import { withCertFeatureOff } from "./helpers/cert";

// 04.3-04 Task 4 ⑤ — 목록 → 만들기(붙여넣기 · 구별 표시 오류 · 힌트 연결) → 상세 QR · 노출 끔 HTML 비노출 ·
// 기능 꺼짐 404 · 직접 POST 거부 · 입력 버리기 · 응답 끊김 뒤 다시 누르기 · 1024 미만 만들기 없음 · 첫 막힘.
// 전역 설정(기능 · 문의 전화)은 cert.setup.ts가 켠다 — 이 스펙은 기능 끄기를 withCertFeatureOff 범위 안에서만 한다.
// 목록이 비었다는 전역 단언은 하지 않는다(다른 스펙의 행사) — 자기 행사 행만 찾고, EMPTY는 범위상 0건인 임시 사용자로 본다.
// 오류 문구는 사용자 결정 A(2026-09-29) — 명사형 「원인 · 다음 행동」.

test.describe.configure({ mode: "serial" });

const PASTE_ROWS = [
  "김하늘\t010-4821-7730\t갤럭시 탭 S10\t1\t현장",
  "김민수\t010-1111-2222\t스타벅스 기프티콘\t2\t택배",
  "김문수\t010-3333-4444\t스타벅스 기프티콘\t2\t택배",
].join("\n");
const HINT_TEXT = "구별 표시는 수령자 목록에 그대로 보입니다 · 이름·전화번호는 쓰지 마세요";
const COL = { name: 1, phone: 2, prize: 3, quantity: 4, delivery: 5, label: 6, preview: 7 } as const;

function uniqueName(base: string): string {
  return `${base}-${randomUUID().slice(0, 8)}`;
}

function kstToday(): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(new Date());
}

function isServerAction(request: Request): boolean {
  return request.method() === "POST" && request.headers()["next-action"] !== undefined;
}

async function login(page: Page, account: { email: string; password: string }): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("이메일").fill(account.email);
  await page.getByLabel("비밀번호").fill(account.password);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/account$/);
}

async function loggedInPage(browser: Browser, account: { email: string; password: string }): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await login(page, account);
  return page;
}

async function eventCount(name: string): Promise<number> {
  const rows = await db.select({ id: certEvents.id }).from(certEvents).where(eq(certEvents.name, name));
  return rows.length;
}

const winnersGrid = (page: Page) => page.getByRole("grid");
const winnerRows = (page: Page) => winnersGrid(page).locator("tbody > tr");
const winnerCell = (page: Page, row: number, col: number) => winnerRows(page).nth(row).locator("td").nth(col);
const primary = (page: Page) => page.getByRole("button", { name: "행사 만들기" });

// 표 격자 셀에 포커스 — 로빙 tabindex가 그 셀로 옮겨질 때까지(excel-paste-final.spec.ts 선례).
async function focusGridCell(target: Locator) {
  await expect(async () => {
    await target.evaluate((element) => (element as HTMLElement).blur());
    await target.focus();
    await expect(target).toHaveAttribute("tabindex", "0", { timeout: 1_000 });
  }).toPass();
}

async function pasteIntoFocusedCell(page: Page, text: string) {
  await page.evaluate((clipboardText) => {
    const dt = new DataTransfer();
    dt.setData("text/plain", clipboardText);
    document.activeElement?.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
  }, text);
}

async function editCell(page: Page, row: number, col: number, value: string) {
  await winnerCell(page, row, col).click();
  const input = winnerCell(page, row, col).locator("input");
  await input.fill(value);
  await input.press("Enter");
  await expect(winnerCell(page, row, col).locator("input")).toHaveCount(0);
}

// 폼을 열고 이름 · 붙여넣기 3줄. 구별 표시는 비어 있다(모양 중복 두 줄).
// via "editor" — 「첫 줄 만들기」가 연 이름 칸 편집 입력에 그대로 Ctrl+V(여러 칸 글이면 표 붙여넣기로 넘긴다).
// via "grid" — 편집을 닫고 격자 셀에서 Ctrl+V(ui/table onPasteAtCell).
async function openFormAndPaste(page: Page, name: string, via: "editor" | "grid" = "grid") {
  await page.goto("/certs/events?new=1");
  await page.getByLabel("행사 이름").fill(name);
  await page.getByRole("button", { name: /첫 줄 만들기/ }).click();
  await expect(winnerRows(page)).toHaveCount(1);
  const nameInput = winnerCell(page, 0, COL.name).locator("input");
  if (via === "editor") {
    await expect(nameInput).toBeFocused();
  } else {
    await nameInput.press("Escape");
    await focusGridCell(winnerCell(page, 0, COL.name));
  }
  await pasteIntoFocusedCell(page, PASTE_ROWS);
  await expect(winnerRows(page)).toHaveCount(3);
  await expect(winnerCell(page, 0, COL.name)).toHaveText("김하늘");
}

async function fillDistinct(page: Page) {
  await editCell(page, 1, COL.label, "오전 조");
  await editCell(page, 2, COL.label, "오후 조");
}

test.describe("확인증 행사 — 시스템 관리자", () => {
  let admin: { email: string; password: string };

  test.beforeAll(async () => {
    admin = await createFixtureUser({ roleId: SYSADMIN_ROLE_ID });
  });

  test("(a)~(e) 붙여넣기 → 구별 표시 오류 · DR-5 · 힌트 연결 → 고침 → 상세 QR → 목록 0/3", async ({ page }) => {
    await login(page, admin);
    const name = uniqueName("E2E 쇼케이스");

    // (a) 목록 → 「행사 만들기」 → 폼 · 붙여넣기
    await page.goto("/certs/events");
    await page.getByRole("link", { name: "행사 만들기" }).first().click();
    await expect(page).toHaveURL(/\/certs\/events\?new=1$/);
    await openFormAndPaste(page, name, "editor");
    await expect(winnerCell(page, 2, COL.name)).toHaveText("김문수");
    await expect(winnerCell(page, 1, COL.delivery)).toHaveText("택배");
    await expect(page.locator("tfoot")).toContainText("합계 · 3명");

    // (b) 서버 거부 — 두 줄 구별 표시 셀 오류 + 합계 행 요약
    const shapeError = "수령자 목록에 김*수 · 스타벅스 기프티콘 2개 2줄 · 구별 표시를 서로 다르게 입력(예: 오전 조)";
    await primary(page).click();
    await expect(winnerCell(page, 1, COL.label)).toHaveAttribute("aria-invalid", "true");
    await expect(winnerCell(page, 2, COL.label)).toHaveAttribute("aria-invalid", "true");
    await expect(winnerCell(page, 1, COL.label)).toContainText(shapeError);
    await expect(page.locator("tfoot")).toContainText("오류 2칸 · 전부 거부");

    // DR-5 — 오류가 남은 채 1차는 켜져 있고 이유 줄이 없다 · 누르면 요청 0개 · 첫 오류 셀로 포커스
    await expect(primary(page)).not.toBeDisabled();
    await expect(primary(page)).not.toHaveAttribute("aria-describedby", /.+/);
    const actions: Request[] = [];
    const count = (request: Request) => {
      if (isServerAction(request)) actions.push(request);
    };
    page.on("request", count);
    await page.getByLabel("행사 이름").focus();
    await primary(page).click();
    await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute("aria-invalid"))).toBe("true");
    await expect(winnerCell(page, 1, COL.label)).toBeFocused();
    page.off("request", count);
    expect(actions).toHaveLength(0);

    // (c) 힌트 연결 — 머리글과 편집 입력이 같은 힌트 id를 가리킨다
    const hint = page.getByText(HINT_TEXT, { exact: true });
    const hintId = await hint.getAttribute("id");
    expect(hintId).toBeTruthy();
    await expect(winnersGrid(page).getByRole("columnheader", { name: "구별 표시" })).toHaveAttribute("aria-describedby", hintId!);
    await winnerCell(page, 1, COL.label).click();
    const labelInput = winnerCell(page, 1, COL.label).locator("input");
    await expect(labelInput).toHaveAttribute("aria-describedby", new RegExp(`(^| )${hintId!.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}( |$)`));
    await labelInput.press("Escape");

    // (d) 우회 숫자 · 이름 → 셀 오류 → 오전 조 · 오후 조
    await editCell(page, 2, COL.label, "오후 조");
    await editCell(page, 1, COL.label, "7-7-3");
    await primary(page).click();
    await expect(winnerCell(page, 1, COL.label)).toContainText("숫자 3개 이상 이어짐 · 전화번호 말고 오전 조처럼 입력");
    await editCell(page, 1, COL.label, "김 하늘");
    await primary(page).click();
    await expect(winnerCell(page, 1, COL.label)).toContainText("당첨자 이름 들어 있음 · 이름 말고 오전 조처럼 입력");
    await editCell(page, 1, COL.label, "오전 조");
    await expect(winnerCell(page, 1, COL.preview)).toContainText("스타벅스 기프티콘 2개 · 오전 조");
    await expect(winnerCell(page, 2, COL.preview)).toContainText("스타벅스 기프티콘 2개 · 오후 조");

    // (e) 만들기 → 상세 · 토스트 · QR · 링크 · 미제출 셋 · 합계 → 목록 자기 행 0/3
    await primary(page).click();
    await expect(page).toHaveURL(/\/certs\/events\/[0-9a-f-]{36}/);
    await expect(page.getByRole("status")).toContainText(`행사 만들기 · ${name} · 당첨자 3명`);
    await expect(page.getByRole("heading", { name })).toBeVisible();
    await expect(page.getByRole("img", { name: `${name} 확인증 QR` })).toBeVisible();
    await expect(page.getByText(/\/c\/[A-Za-z0-9_-]+$/)).toBeVisible();
    await expect(page.getByRole("button", { name: "링크 복사" })).toBeVisible();
    await expect(page.getByText("미제출", { exact: true })).toHaveCount(3);
    await expect(page.locator("tfoot")).toContainText("합계 · 3명 · 제출 0명");

    await page.goto("/certs/events");
    const ownRow = page.locator("tbody tr", { has: page.getByRole("link", { name }) });
    await expect(ownRow).toContainText("0/3");
    await expect(ownRow.getByText("제출 0명 / 전체 3명")).toHaveCount(1);
    await expect(ownRow).toContainText("접수 중");
  });

  // 셸 안 §6-9 404 화면. 두 라우트는 loading.tsx(§7-7 뼈대)가 있어 응답이 먼저 200으로 스트리밍되므로
  // notFound()는 HTTP 상태가 아니라 404 화면 + noindex로 온다(Next loading.md 「Status Codes」) — 화면으로 단언한다.
  test("(g) 기능 꺼짐 → /certs/events · ?new=1 · 상세가 404 화면 · 범위를 나오면 다시 보인다", async ({ page }) => {
    await login(page, admin);
    await page.goto("/certs/events");
    const ownEvent = page.locator('a[data-row-link][href^="/certs/events/"]').first();
    const detailHref = (await ownEvent.count()) > 0 ? await ownEvent.getAttribute("href") : null;
    await withCertFeatureOff(async () => {
      for (const path of ["/certs/events", "/certs/events?new=1", ...(detailHref ? [detailHref] : [])]) {
        await page.goto(path);
        await expect(page.getByRole("heading", { name: "페이지 찾을 수 없음" })).toBeVisible();
        await expect(page.getByRole("heading", { name: "확인증 행사" })).toHaveCount(0);
        await expect(page.locator("#cert-event-new")).toHaveCount(0);
      }
    });
    const on = await page.goto("/certs/events");
    expect(on?.status()).toBe(200);
    await expect(page.getByRole("heading", { name: "확인증 행사" })).toBeVisible();
  });

  test("(h) 직접 POST — 기능 꺼짐이면 행사가 생기지 않고, 켜진 뒤 같은 본문 두 번은 행사 하나", async ({ page }) => {
    await login(page, admin);
    const name = uniqueName("E2E 캡처");
    await openFormAndPaste(page, name);
    await fillDistinct(page);
    const captured = page.waitForRequest(isServerAction);
    await primary(page).click();
    const request = await captured;
    await expect(page).toHaveURL(/\/certs\/events\/[0-9a-f-]{36}/);

    const headers = { "next-action": request.headers()["next-action"]!, "content-type": request.headers()["content-type"] ?? "text/plain;charset=UTF-8" };
    const args = JSON.parse(request.postData() ?? "[]") as [{ name: string; requestId: string }];
    const replayName = uniqueName("E2E 직접");
    args[0].name = replayName;
    args[0].requestId = randomUUID();
    const body = JSON.stringify(args);

    await withCertFeatureOff(async () => {
      await page.request.post("/certs/events", { headers, data: body });
    });
    expect(await eventCount(replayName)).toBe(0);

    await page.request.post("/certs/events", { headers, data: body });
    await page.request.post("/certs/events", { headers, data: body });
    expect(await eventCount(replayName)).toBe(1);
  });

  test("(i) 입력 버리기 — 한 칸 적고 「취소 Esc」 → 확인(행사 만들기 · 1칸) → 목록", async ({ page }) => {
    await login(page, admin);
    await page.goto("/certs/events?new=1");
    await page.getByLabel("행사 이름").fill("버릴 이름");
    await page.getByRole("button", { name: /^취소/ }).click();
    const dialog = page.getByRole("dialog", { name: "입력 버리기" });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("행사 만들기 · 1칸");
    const confirm = dialog.getByRole("button", { name: "입력 버리기" });
    await expect(confirm).toBeFocused();
    await confirm.click();
    await expect(page).toHaveURL(/\/certs\/events$/);
  });

  test("(j) 응답 끊김 → 결과 모름 줄 · 값 그대로 → 다시 누르면 같은 행사 하나", async ({ page }) => {
    await login(page, admin);
    const name = uniqueName("E2E 끊김");
    await openFormAndPaste(page, name);
    await fillDistinct(page);

    let dropped = false;
    await page.route("**/certs/events**", async (route) => {
      if (!dropped && isServerAction(route.request())) {
        dropped = true;
        await route.fetch();
        await route.abort();
        return;
      }
      await route.continue();
    });
    await primary(page).click();
    await expect(page.locator("tfoot")).toContainText("만들기 결과 모름 · 다시 누르기");
    await expect(page.getByLabel("행사 이름")).toHaveValue(name);
    await expect(winnerRows(page)).toHaveCount(3);
    await expect(primary(page)).not.toBeDisabled();
    await page.unroute("**/certs/events**");

    await primary(page).click();
    await expect(page).toHaveURL(/\/certs\/events\/[0-9a-f-]{36}/);
    expect(await eventCount(name)).toBe(1);
  });

  test("(k) 1024 미만 — 폼 · 1차 없음, 목록만 · 1280으로 돌아오면 1차", async ({ page }) => {
    await login(page, admin);
    await page.setViewportSize({ width: 1000, height: 800 });
    await page.goto("/certs/events?new=1");
    await expect(page.getByRole("heading", { name: "확인증 행사" })).toBeVisible();
    await expect(page.locator("#cert-event-new")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "행사 만들기" })).toHaveCount(0);
    await page.goto("/certs/events");
    await expect(page.getByRole("link", { name: "행사 만들기" })).toHaveCount(0);
    await page.setViewportSize({ width: 1280, height: 800 });
    await expect(page.getByRole("link", { name: "행사 만들기" })).toBeVisible();
  });

  test("(l) 당첨일 초기값 오늘(KST) · 첫 막힘 문장과 색 · 건드리지 않은 Esc는 곧바로 목록", async ({ page }) => {
    await login(page, admin);
    await page.goto("/certs/events?new=1");
    await expect(page.getByLabel("당첨일")).toHaveValue(kstToday());
    await expect(primary(page)).toBeDisabled();
    const reason = page.getByText("행사 이름 비어 있음 · 행사 이름 적기", { exact: true });
    await expect(reason).toBeVisible();
    await expect(reason).toHaveCSS("color", "rgb(155, 28, 28)");
    await page.getByLabel("행사 이름").press("Escape");
    await expect(page.getByRole("dialog", { name: "입력 버리기" })).toHaveCount(0);
    await expect(page).toHaveURL(/\/certs\/events$/);
  });
});

test.describe("확인증 행사 — 임시 계급(자기 행사만 · 노출 대조)", () => {
  let roleId: string;
  let account: { email: string; password: string };

  // (f-0) 공유 role-pm을 바꾸지 않는다 — 임시 계급에 certs.events 보기 · 쓰기와 cert_event.value 노출만 준다.
  test.beforeAll(async () => {
    roleId = `role-e2e-cert-${randomUUID()}`;
    await insertRole(SYSTEM_VIEWER, { id: roleId, name: `E2E 임시 계급 ${roleId.slice(-12)}`, sortOrder: 99 });
    for (const action of ["view", "write"] as const) {
      await setPermissionCell(SYSTEM_VIEWER, { roleId, menu: "certs.events", action, allowed: true });
    }
    await upsertVisibility(SYSTEM_VIEWER, { roleId, infoItem: "cert_event.value", visible: true });
    account = await createFixtureUser({ roleId });
  });

  test.afterAll(async () => {
    await setRoleArchived(SYSTEM_VIEWER, roleId, true);
  });

  test("(f-0-b) · (k) EMPTY — 자기 행사 0건 · 1024 이상만 3차 「행사 만들기」", async ({ browser }) => {
    const page = await loggedInPage(browser, account);
    await page.goto("/certs/events");
    await expect(page.getByText("확인증 행사가 없습니다")).toBeVisible();
    await expect(page.getByRole("link", { name: "행사 만들기" })).toHaveCount(2);
    await page.setViewportSize({ width: 1000, height: 800 });
    await expect(page.getByText("확인증 행사가 없습니다")).toBeVisible();
    await expect(page.getByRole("link", { name: "행사 만들기" })).toHaveCount(0);
    await page.context().close();
  });

  test("(f) 당첨자 노출을 끈 계급의 상세 HTML에 이름 · 전화가 없다(켠 계급과 대조)", async ({ browser }) => {
    const user = await findUserByEmail(SYSTEM_VIEWER, account.email);
    if (!user) throw new Error("임시 사용자를 찾지 못했다");
    const name = uniqueName("E2E 노출");
    const created = await createEvent(
      { id: user.id, roleId },
      { name, wonOn: "2026-09-13", winners: [{ name: "김하늘", phone: "010-4821-7730", prizeName: "갤럭시 탭 S10", quantity: "1", delivery: "현장" }] },
    );
    if (created.kind !== "ok") throw new Error(`createEvent 실패: ${created.kind}`);

    const page = await loggedInPage(browser, account);
    try {
      await upsertVisibility(SYSTEM_VIEWER, { roleId, infoItem: "cert_winner.value", visible: false });
      const hidden = await page.request.get(`/certs/events/${created.eventId}`);
      expect(hidden.status()).toBe(200);
      const hiddenBody = await hidden.text();
      expect(hiddenBody).toContain(name);
      expect(hiddenBody).not.toContain("김하늘");
      expect(hiddenBody).not.toContain("01048217730");
      expect(hiddenBody).not.toContain("010-4821-7730");

      await upsertVisibility(SYSTEM_VIEWER, { roleId, infoItem: "cert_winner.value", visible: true });
      const shown = await page.request.get(`/certs/events/${created.eventId}`);
      expect(shown.status()).toBe(200);
      const shownBody = await shown.text();
      expect(shownBody).toContain(name);
      expect(shownBody).toContain("김하늘");
    } finally {
      await page.context().close();
    }
  });
});
