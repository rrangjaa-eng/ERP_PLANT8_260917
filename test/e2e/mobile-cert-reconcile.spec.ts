import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { certSubmissions, users } from "@/db/schema";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { loadIntake, submitCertificate } from "@/domain/certs/intake";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { insertRole, setRoleArchived } from "@/repositories/roles";
import { createFixtureUser } from "./fixtures";
import { createCertEvent, signaturePngFixture } from "./helpers/cert";

// 04.3-17 — I′3 제출 섹션 폰(375): 칸 접기(P1 이름 · 제출, P2 `010-****-7730 · 1개`) → 행 시트 → `RowSheet` `action`
// 「제출 내용」 → I4. 경영관리 고정물은 전용 계급(cert-reconcile.spec과 같은 권한).

test.describe.configure({ mode: "serial" });
test.use({ viewport: { width: 375, height: 800 } });

type Account = { email: string; password: string };

let manager: Account;
let managerRoleId: string;

test.beforeAll(async () => {
  managerRoleId = `role-e2e-reconcile-m-${randomUUID()}`;
  await insertRole(SYSTEM_VIEWER, { id: managerRoleId, name: `E2E 대조 폰 ${managerRoleId.slice(-12)}`, sortOrder: 99 });
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

test("폰 375 — 칸 접기 → 행 시트 → 「제출 내용」 → I4", async ({ page }) => {
  const event = await createCertEvent({ name: "E2E 대조 폰", prizes: [{ name: "갤럭시 탭 S10", unitValueKrw: 1_290_000, winnerCount: 1 }] });
  const prizeId = event.prizeIds[0];
  if (!event.token || !prizeId) throw new Error("fixture");
  const intake = await loadIntake(event.token);
  if (intake.kind !== "open") throw new Error(intake.kind);
  const saved = await submitCertificate(
    event.token,
    {
      prizeId,
      idempotencyKey: randomUUID(),
      consentVersion: intake.terms.consentVersion,
      retentionYears: intake.terms.retentionYears,
      name: "김하늘",
      rrnFront6: "930412",
      rrnBack7: "2123458",
      phone: "010-4821-7730",
      consent: true,
      signaturePngBase64: signaturePngFixture().toString("base64"),
      rrnRecheckConfirmed: true,
    },
    "192.0.2.201",
  );
  if (saved.kind !== "saved") throw new Error(saved.kind);
  const [row] = await db.select().from(certSubmissions).where(eq(certSubmissions.eventId, event.eventId));
  if (!row) throw new Error("제출 행 없음");

  await login(page, manager);
  await page.goto(`/certs/events/${event.eventId}`);
  const table = page.locator("table").filter({ has: page.locator("caption", { hasText: /^제출$/ }) });
  await expect(table).toHaveCount(1);

  // P1 이름 · 제출만 열 · P2 접힌 줄 `010-****-7730 · 1개` · 행동 열은 숨음(P3).
  const visibleHeaders = await table.locator("thead th:visible").allTextContents();
  expect(visibleHeaders.map((text) => text.trim())).toEqual(["이름", "제출"]);
  const collapsed = table.getByRole("button", { name: /김하늘 .*상세 보기/ });
  await expect(collapsed).toBeVisible();
  await expect(collapsed).toHaveText("010-****-7730 · 1개");
  await expect(table.getByRole("link", { name: /제출 내용/ })).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  await collapsed.click();
  const sheet = page.getByRole("dialog", { name: "김하늘" });
  await expect(sheet).toBeVisible();
  const action = sheet.getByRole("link", { name: /^제출 내용/ });
  await expect(action).toBeVisible();
  await action.click();
  await expect(page).toHaveURL(new RegExp(`/certs/submissions/${row.id}$`));
});
