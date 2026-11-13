import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { createFixtureUser, uniqueBusinessNo } from "./fixtures";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { createAccount } from "@/domain/auth/accounts";
import { archive } from "@/domain/archive";
import { assignTeam, createOrgUnit, createTeam } from "@/domain/org";
import { TEAM_LEAD_ROLE_ID } from "@/domain/permissions/roles";
import { findUserById } from "@/repositories/users";
import { findTeamById } from "@/repositories/teams";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { db } from "@/db/client";
import { reserveEntries } from "@/db/schema";
import { eq } from "drizzle-orm";
import { insertTempRole } from "./temp-roles";
import { waitForHydration } from "./leave-org";
import { findVendorById, insertVendor, setVendorArchived, setVendorHidden } from "@/repositories/vendors";
import { loginAsSysadmin } from "./row-actions-helpers";

// ADMN-12: 삭제 → 보관함 → 복원 end-to-end와 권한 없는 계급의 404.
test.describe("보관함 화면 (ADMN-12)", () => {
  test("코드표 삭제(두 단계) → 보관함에 보임 → 복원 → 빈 보관함 → 권한 없는 계급 404", async ({ page }) => {
    const admin = await createFixtureUser({ roleId: "role-sysadmin" });

    await page.goto("/login");
    await page.getByLabel("이메일").fill(admin.email);
    await page.getByLabel("비밀번호").fill(admin.password);
    await page.getByRole("button", { name: "로그인" }).click();
    await expect(page).toHaveURL(/\/account$/);

    // 코드표 항목 하나를 등록한다. 이름도 값과 함께 매 실행 유일하게 만든다
    // — 로컬 DB가 이전 실행의 데이터를 남길 수 있어 이름 중복으로 인한
    // strict mode 충돌을 피한다.
    const unique = Date.now();
    const codeValue = `e2e-archive-${unique}`;
    const codeLabel = `보관함 E2E ${unique}`;
    // 2026-09-21 스테이징 QA 수정: 등록 폼이 기본 진입에는 없다(§6-1) —
    // 목록 머리글의 「코드 추가」가 그 폼을 연다.
    await page.goto("/admin/code-tables");
    await page.getByRole("link", { name: "코드 추가" }).click();
    // 04.6-15: 「코드 추가」는 옆 패널이고 성공 뒤에도 패널이 열린 채 칸이 빈다(UQ-8 B) — Esc로 닫고(칸이 비어 확인 없음) 목록에서 이어 간다.
    const panel = page.locator('dialog[data-ui="side-panel"]');
    await panel.getByLabel("값").fill(codeValue);
    await panel.locator("#code-item-form").getByLabel("이름").fill(codeLabel);
    await panel.getByRole("button", { name: "코드 추가" }).click();
    await expect(panel.getByRole("status")).toHaveText("코드 추가됨");
    await page.keyboard.press("Escape");
    await expect(panel).toHaveCount(0);
    await expect(page.getByText(codeValue)).toBeVisible();

    // 삭제 — 두 단계 제출. 확인 문구에 보관함·복원 문구가 보인다.
    const row = page.locator("tr", { hasText: codeValue });
    await row.getByRole("button", { name: "삭제" }).click();
    await expect(page.getByText(/보관함으로 이동합니다 · 관리자가 복원할 수 있습니다/)).toBeVisible();
    await row.getByRole("button", { name: "삭제" }).click();

    // 보관 직후 그 행에 「보관됨」 표시가 남는다 — 이 계급(시스템 관리자)은
    // admin.archive 보기 권한도 있어 스코프가 보관된 행도 함께 돌려준다
    // (03-01의 scopeFor 계약: includeArchived는 보관함 보기 권한 판정
    // 결과다). 완전히 사라지는 것은 아니고, 동작 버튼(삭제·활성화)이
    // 없어진다.
    await expect(row.getByText("보관됨")).toBeVisible();
    await expect(row.getByRole("button", { name: "삭제" })).toHaveCount(0);

    // 보관함 화면에 그 항목이 보인다.
    const archiveResponse = await page.goto("/admin/archive");
    expect(archiveResponse?.status()).toBe(200);
    const archiveRow = page.locator("tr", { hasText: codeLabel });
    await expect(archiveRow).toBeVisible();

    // 06.5-08(D-6515 · UI-SPEC V11): 보관 시각은 KST `YYYY-MM-DD HH:mm`(UTC가 아니다) — 지금(KST) ±2분(분 단위 버림 · 왕복 지연)이고 한 줄이다.
    const archivedText = (await archiveRow.locator("td", { hasText: /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/ }).first().innerText()).trim();
    expect(archivedText).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
    const archivedMs = Date.parse(`${archivedText.replace(" ", "T")}:00+09:00`);
    expect(Math.abs(Date.now() - archivedMs)).toBeLessThanOrEqual(2 * 60_000);
    const timeCell = archiveRow.locator("td", { hasText: archivedText }).first();
    const lineTops = await timeCell.evaluate((element) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      return new Set(Array.from(range.getClientRects()).map((rect) => Math.round(rect.top))).size;
    });
    expect(lineTops).toBe(1);

    // 복원 — 확인 없이 즉시 실행하고 토스트가 나온다. 다른 세션이 남긴
    // 보관 항목과 섞이지 않게 이 행으로 범위를 좁힌다. 토스트는 4초 뒤
    // 자동으로 사라지므로(§7-6) 2-워커 병렬 실행의 CPU 경합으로 서버
    // 왕복이 늦어지면 기본 5초 타임아웃 안에서도 나타났다 사라질 수 있다
    // — 넉넉한 타임아웃으로 그 경합을 흡수한다.
    // quick 261002-4jn — 다른 탭이 먼저 복원하면, 아직 그 행이 보이는 이 화면의 복원은 「이미 복원됨」이다.
    const otherTab = await page.context().newPage();
    await otherTab.goto("/admin/archive");
    await otherTab.locator("tr", { hasText: codeLabel }).getByRole("button", { name: "복원" }).click();
    await expect(otherTab.getByText(`복원 · ${codeLabel} 복원됨`)).toBeVisible({ timeout: 15000 });
    await otherTab.close();

    await archiveRow.getByRole("button", { name: "복원" }).click();
    await expect(page.getByText(`복원 · ${codeLabel} 이미 복원됨`)).toBeVisible({ timeout: 15000 });
    await expect(archiveRow).toHaveCount(0);

    // 코드표 목록에서 「보관됨」 표시가 사라지고 동작 버튼이 되돌아온다.
    await page.goto("/admin/code-tables");
    await expect(page.getByText(codeValue)).toBeVisible();
    const restoredRow = page.locator("tr", { hasText: codeValue });
    await expect(restoredRow.getByText("보관됨")).toHaveCount(0);
    await expect(restoredRow.getByRole("button", { name: "삭제" })).toBeVisible();

    // 복원한 내 항목은 보관함 표에서 완전히 사라진다 — 이 행 하나로
    // 범위를 좁혀 확인한다. 「전체 보관함이 빈지」는 이 로컬 DB에서
    // 신뢰할 수 있는 단언이 아니다: permissions-grid.spec.ts(세로 스크롤
    // 회귀, 03-04)가 자신의 정리 단계에서 임시 계급 26종을 하드 DELETE가
    // 아니라 의도적으로 「보관」 처리해 남긴다(그 스펙의 주석: 다음 로컬
    // 실행의 이름 UNIQUE 충돌을 피하려고 보관을 쓰고, listRoles()가
    // 기본으로 보관 계급을 제외하니 다른 스펙엔 안 보인다는 전제) — 그
    // 스펙이 이 세션 안에서 이미 한 번이라도 실행됐다면 이 보관함
    // 화면에는 항상 그 계급들이 남아 있고, 전체가 빌 일이 없다. 이건
    // 내 코드의 결함이 아니라 공유·비초기화 로컬 DB에서 다른 기존
    // 스펙의 정리 방식이 만드는 환경 사실이다(보관은 하드 삭제가 아니라
    // 원래 되돌릴 수 있는 상태 전이이므로 그 스펙 입장에서는 정상 종료
    // 상태다). 「EMPTY면 다음 한 수 버튼이 없다」는 요구는 03-07-PLAN.md
    // 검증부의 정적 소스 검사(`page.tsx`에 EMPTY 분기가 next-action 없이
    // 렌더되는지)가 이미 담당한다.
    await page.goto("/admin/archive");
    const archiveRowAfterRestore = page.locator("tr", { hasText: codeLabel });
    await expect(archiveRowAfterRestore).toHaveCount(0);

    // 권한 없는 계급(기본 계급)에는 보관함 화면이 404다.
    const pm = await createFixtureUser({ roleId: "role-pm" });
    const pmContext = await page.context().browser()?.newContext();
    const pmPage = pmContext ? await pmContext.newPage() : page;
    if (pmContext) {
      await pmPage.goto("/login");
      await pmPage.getByLabel("이메일").fill(pm.email);
      await pmPage.getByLabel("비밀번호").fill(pm.password);
      await pmPage.getByRole("button", { name: "로그인" }).click();
      await expect(pmPage).toHaveURL(/\/account$/);
    }
    const pmResponse = await pmPage.goto("/admin/archive");
    expect(pmResponse?.status()).toBe(404);
    if (pmContext) await pmContext.close();
  });

  // Regression: /qa ISSUE-002 — 보관함을 연 뒤 같은 사업자번호의 살아 있는 거래처가 생기면 「복원」이 원인 없이
  // 「복원 · 실패 · 다시 시도」만 보이고 단추가 남았다(서버 거부 문구가 토스트에 실리지 않음).
  // Found by /qa on 2026-10-06 · Report: /mnt/project-files/notes/vendor-kind/178-qa.md
  test("같은 사업자번호 거래처가 그새 생기면 거래처 복원은 원인을 토스트에 싣고 「복원」을 치운다", async ({ page }) => {
    await loginAsSysadmin(page);
    const businessNo = uniqueBusinessNo();
    const name = `E2E복원경합-${randomUUID()}`;
    const archived = await insertVendor(SYSTEM_VIEWER, { name, normalizedName: name.toLowerCase(), businessNo, kind: "client" });
    await setVendorArchived(SYSTEM_VIEWER, archived.id, true);
    await page.goto("/admin/archive");
    const row = page.locator("tr", { hasText: name }).first();
    await expect(row.getByRole("button", { name: "복원" })).toBeVisible();

    const takerName = `E2E복원경합차지-${randomUUID()}`;
    const taker = await insertVendor(SYSTEM_VIEWER, { name: takerName, normalizedName: takerName.toLowerCase(), businessNo, kind: "client" });
    try {
      await row.getByRole("button", { name: "복원" }).click();
      await expect(page.getByText(`복원 · 실패 · 같은 사업자번호 거래처 있음 · ${takerName}`)).toBeVisible();
      await expect(row.getByRole("button", { name: "복원" })).toHaveCount(0);
      expect((await findVendorById(SYSTEM_VIEWER, archived.id))?.archivedAt).not.toBeNull();
    } finally {
      await setVendorHidden(SYSTEM_VIEWER, taker.id, true);
    }
  });

  // 06.4(D-6404 · D-6406 · N1): 사람 복원 거부 문구는 ` · 복원 불가`로 끝나 토스트의 「마지막 · 앞까지」 자르기가 이름을 남긴다.
  test("팀장 자리가 그새 찬 사람 복원은 원인을 토스트에 싣고 「복원」을 치운다 (06.4 D-6404 · D-6406)", async ({ page }) => {
    await loginAsSysadmin(page);
    const unique = randomUUID().slice(0, 8);
    const orgUnit = await createOrgUnit(SYSTEM_VIEWER, { name: `E2E복원본부-${unique}` });
    const team = await createTeam(SYSTEM_VIEWER, { orgUnitId: orgUnit.id, name: `E2E복원팀-${unique}` });
    const lead = async (name: string) => {
      const { userId } = await createAccount(SYSTEM_VIEWER, { email: `e2e-restore-${randomUUID()}@example.test`, name, roleId: TEAM_LEAD_ROLE_ID });
      await assignTeam(SYSTEM_VIEWER, { userId, teamId: team.id, effectiveFrom: "2020-01-01" });
      return userId;
    };
    const leadName = `E2E복원팀장-${unique}`;
    const l = await lead(leadName);
    await archive(SYSTEM_VIEWER, "user", l);
    const takerName = `E2E자리팀장-${randomUUID().slice(0, 8)}`;
    await lead(takerName);

    await page.goto("/admin/archive");
    const row = page.locator("tr", { hasText: leadName }).first();
    await row.getByRole("button", { name: "복원" }).click();

    await expect(page.getByText(`복원 · 실패 · 팀장 있음 · ${takerName}`, { exact: true })).toBeVisible();
    await expect(row.getByRole("button", { name: "복원" })).toHaveCount(0);
    expect((await findUserById(SYSTEM_VIEWER, l))?.archivedAt).not.toBeNull();
  });

  // 07.2-11 PU22 ③(D-7279 · UI-SPEC S22): 위 본부가 사용중지면 팀 복원 거부 — 행 아래 이유 줄(서버 원인 전문) · 「복원」 → 「—」.
  test("사용중지 본부 아래 팀 복원은 행 아래 `사용중지 본부 아래 팀 · 본부 먼저 복원` · 동작 칸 「—」 · 팀은 보관 그대로", async ({ page }) => {
    await loginAsSysadmin(page);
    const unique = randomUUID().slice(0, 8);
    const orgUnit = await createOrgUnit(SYSTEM_VIEWER, { name: `E2E중지본부-${unique}` });
    const teamName = `E2E중지본부팀-${unique}`;
    const team = await createTeam(SYSTEM_VIEWER, { orgUnitId: orgUnit.id, name: teamName });
    await archive(SYSTEM_VIEWER, "team", team.id);
    await archive(SYSTEM_VIEWER, "org_unit", orgUnit.id);

    // G-07.2-28: 누르기 전에 서버가 목록에 실어 준 이유로 이미 막혀 있다 — 「복원」 단추 없음 · 행 아래 이유 줄 · 동작 칸 「—」.
    await page.goto("/admin/archive");
    const row = page.locator("tr", { hasText: teamName }).first();

    // 행 바로 뒤는 폰 접힌 줄(PC에서는 숨김)이고 그다음이 이유 줄이다 — 다음 두 행 안의 detail 줄만 본다.
    const reason = row.locator("xpath=following-sibling::tr[position() <= 2][@data-ui='static-table-detail']");
    await expect(reason).toHaveText("사용중지 본부 아래 팀 · 본부 먼저 복원");
    await expect(row.getByRole("button", { name: "복원" })).toHaveCount(0);
    await expect(row.getByRole("cell").last()).toHaveText("—");
    expect((await findTeamById(SYSTEM_VIEWER, team.id))?.archivedAt).not.toBeNull();
  });

  // 07.2-11 /review(Codex): 본부 복원이 팀의 의존 거부를 풀 수 있다 — 같은 표에서 본부를 복원하면 팀 행은 새로고침 없이 「복원」이 돌아와야 한다.
  test("거부된 팀 행은 같은 표에서 본부를 복원하면 새로고침 없이 「복원」이 돌아오고 복원된다", async ({ page }) => {
    await loginAsSysadmin(page);
    const unique = randomUUID().slice(0, 8);
    const unitName = `E2E재시도본부-${unique}`;
    const orgUnit = await createOrgUnit(SYSTEM_VIEWER, { name: unitName });
    const teamName = `E2E재시도팀-${unique}`;
    const team = await createTeam(SYSTEM_VIEWER, { orgUnitId: orgUnit.id, name: teamName });
    await archive(SYSTEM_VIEWER, "team", team.id);
    await archive(SYSTEM_VIEWER, "org_unit", orgUnit.id);

    await page.goto("/admin/archive");
    const teamRow = page.locator("tr", { hasText: teamName }).first();
    await expect(teamRow.locator("xpath=following-sibling::tr[position() <= 2][@data-ui='static-table-detail']")).toHaveText("사용중지 본부 아래 팀 · 본부 먼저 복원");
    await expect(teamRow.getByRole("button", { name: "복원" })).toHaveCount(0);

    // 같은 표에서 본부를 복원한다 — 전체 새로고침 없음. 복원이 목록을 다시 읽어 팀 행의 「복원」이 돌아온다.
    const unitRow = page.locator("tr", { hasText: unitName }).first();
    await waitForHydration(unitRow.getByRole("button", { name: "복원" }));
    await unitRow.getByRole("button", { name: "복원" }).click();
    await expect(page.locator("tr", { hasText: unitName })).toHaveCount(0);

    await expect(teamRow.getByRole("button", { name: "복원" })).toBeVisible();
    await teamRow.getByRole("button", { name: "복원" }).click();
    await expect(page.locator("tr", { hasText: teamName })).toHaveCount(0);
    expect((await findTeamById(SYSTEM_VIEWER, team.id))?.archivedAt).toBeNull();
  });

  // 07.2-11 PU22 ②(07.2 D-7309 · UI-SPEC S22): 사용중지(보관) 거래처의 지운 리저브 줄 복원은 거부 — 같은 행 아래 이유 줄 · 「—」.
  // 리저브 줄은 pnl 보기 · 쓰기 + reserve.amount가 있는 보관함 권한자에게만 보이고 복원된다 — 이 테스트가 만든 임시 계급으로 연다(공용 계급 불변).
  test("사용중지 거래처의 리저브 줄 복원은 행 아래 `거래처 사용중지 · 다른 거래처 고르기` · 동작 칸 「—」 · 줄은 보관 그대로", async ({ page }) => {
    const roleId = `role-e2e-arch-rsv-${randomUUID()}`;
    await insertTempRole(SYSTEM_VIEWER, { id: roleId, name: `E2E 보관 리저브 ${roleId.slice(-8)}`, sortOrder: 99, viewScope: "company" });
    for (const [menu, action] of [["admin.archive", "view"], ["admin.archive", "write"], ["pnl", "view"], ["pnl", "write"]] as const) {
      await upsertPermission(SYSTEM_VIEWER, { roleId, menu, action, allowed: true });
    }
    for (const infoItem of ["reserve.amount", "archive.value"]) await upsertVisibility(SYSTEM_VIEWER, { roleId, infoItem, visible: true });
    const clientName = `E2E중지거래처-${randomUUID().slice(0, 8)}`;
    const client = await insertVendor(SYSTEM_VIEWER, { name: clientName, normalizedName: clientName.toLowerCase(), kind: "client" });
    const [entry] = await db
      .insert(reserveEntries)
      .values({ clientId: client.id, entryDate: "2026-05-01", direction: "deposit", amountCurrency: "KRW", amountForeignAmount: null, amountFxRate: "1", amountAmountKrw: 10_000, archivedAt: new Date() })
      .returning({ id: reserveEntries.id });
    await setVendorArchived(SYSTEM_VIEWER, client.id, true);

    const user = await createFixtureUser({ roleId });
    await page.goto("/login");
    await page.getByLabel("이메일").fill(user.email);
    await page.getByLabel("비밀번호").fill(user.password);
    await page.getByRole("button", { name: "로그인" }).click();
    await expect(page).toHaveURL(/\/account$/);
    await page.goto("/admin/archive");
    // 보관된 거래처 행도 같은 이름을 싣는다 — 종류 칸이 「리저브」인 행만 고른다.
    const row = page.locator("tr", { hasText: clientName }).filter({ has: page.getByRole("cell", { name: "리저브", exact: true }) });
    // 수화 전 클릭은 사라진다 — 단추가 수화된 뒤 누른다.
    await waitForHydration(row.getByRole("button", { name: "복원" }));
    await row.getByRole("button", { name: "복원" }).click();

    await expect(row.locator("xpath=following-sibling::tr[position() <= 2][@data-ui='static-table-detail']")).toHaveText("거래처 사용중지 · 다른 거래처 고르기");
    await expect(row.getByRole("button", { name: "복원" })).toHaveCount(0);
    await expect(row.getByRole("cell").last()).toHaveText("—");
    const [stored] = await db.select({ archivedAt: reserveEntries.archivedAt }).from(reserveEntries).where(eq(reserveEntries.id, entry?.id ?? ""));
    expect(stored?.archivedAt).not.toBeNull();
  });
});
