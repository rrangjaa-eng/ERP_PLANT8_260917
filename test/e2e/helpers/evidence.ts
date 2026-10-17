import { randomInt, randomUUID } from "node:crypto";
import { expect, type Locator, type Page } from "@playwright/test";
import { asc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { evidenceImportBatches, evidenceRecordLinks, evidenceRecords, teams } from "@/db/schema";
import { createAccount } from "@/domain/auth/accounts";
import { createCorpCard, type CardOwnerKind } from "@/domain/corp-cards";
import { registerEvidenceFile } from "@/domain/evidence-import";
import { assignTeam } from "@/domain/org";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { insertRole } from "@/repositories/roles";
import type { FixtureRow } from "@/test/fixtures/evidence-import/build";

// 06.1-05 — 증빙 목록 E2E 도우미. 계급은 스펙이 만든 임시 계급이다(시드 계급의 권한을 바꾸지 않는다 — 리저브 대장 스펙 꼴).
// 바이트는 06.1-02 생성기(test/fixtures/evidence-import/build.ts)가 만든다 — 실제 카드사 파일은 쓰지 않는다.

export type IntakeRoleOptions = {
  /** 보는 범위(지출결의 목록 행 범위) — 기본 회사. */
  viewScope?: "company" | "own";
  /** 지출결의 메뉴 — 진입 링크(`/expenses`) 케이스만 켠다. */
  expenses?: "view" | "write";
};

/** `evidence.intake` 쓰기 · `evidence` 보기 · 정보 항목 둘(증빙 내용 · 금액)을 가진 임시 계급. */
export async function createIntakeRole(options: IntakeRoleOptions = {}): Promise<string> {
  const roleId = `role-e2e-evidence-${randomUUID()}`;
  await insertRole(SYSTEM_VIEWER, { id: roleId, name: `E2E 증빙 등록 ${roleId.slice(-8)}`, sortOrder: 99, viewScope: options.viewScope ?? "company" });
  await upsertPermission(SYSTEM_VIEWER, { roleId, menu: "evidence.intake", action: "write", allowed: true });
  await upsertPermission(SYSTEM_VIEWER, { roleId, menu: "evidence", action: "view", allowed: true });
  if (options.expenses) await upsertPermission(SYSTEM_VIEWER, { roleId, menu: "expenses", action: "view", allowed: true });
  if (options.expenses === "write") await upsertPermission(SYSTEM_VIEWER, { roleId, menu: "expenses", action: "write", allowed: true });
  // 기안은 사용일 소속 팀을 노출표(team.value)로 읽는다 — 쓰기 계급만 켠다.
  const infoItems = ["evidence.value", "evidence.amount", ...(options.expenses === "write" ? ["team.value"] : [])];
  for (const infoItem of infoItems) await upsertVisibility(SYSTEM_VIEWER, { roleId, infoItem, visible: true });
  return roleId;
}

/** 새 임시 등록 계급의 사람으로 로그인한다. */
export async function loginIntake(page: Page, options: IntakeRoleOptions = {}, teamId?: string): Promise<Viewer> {
  return loginAs(page, await createIntakeRole(options), teamId);
}

/** 그 계급의 새 사람으로 로그인한다. 팀을 주면 과거 날짜로 발령한다(지출결의 기안은 사용일 소속 팀이 있어야 한다). */
export async function loginAs(page: Page, roleId: string, teamId?: string): Promise<Viewer> {
  const email = `e2e-${randomUUID()}@example.test`;
  const { userId, tempPassword } = await createAccount(SYSTEM_VIEWER, { email, name: "E2E Employee", roleId });
  if (teamId) await assignTeam(SYSTEM_VIEWER, { userId, teamId, effectiveFrom: "2020-01-01" });
  await page.goto("/login");
  await page.getByLabel("이메일").fill(email);
  await page.getByLabel("비밀번호").fill(tempPassword);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/account$/);
  return { id: userId, roleId };
}

/** 화면 업로드를 재지 않는 케이스의 준비 — 서버에서 바로 등록하고 묶음 id를 돌려준다. 거절이면 던진다. */
export async function registerFile(viewer: Viewer, bytes: Uint8Array, fileName: string): Promise<string> {
  const result = await registerEvidenceFile(viewer, { bytes, fileName });
  if (result.refused) throw new Error(`등록 거절 — ${result.refused.headline}`);
  return result.batchId;
}

/** 증빙 기록 표를 비운다 — 등록 권한자는 회사 전체 증빙을 보므로 케이스마다 빈 표에서 시작한다(리저브 대장 스펙 꼴). */
export async function clearEvidence(): Promise<void> {
  await db.delete(evidenceRecordLinks);
  await db.delete(evidenceRecords);
  await db.delete(evidenceImportBatches);
}

/** 묶음의 증빙 기록 id(승인번호 순). */
export async function recordIdsOf(batchId: string): Promise<string[]> {
  const rows = await db.select({ id: evidenceRecords.id }).from(evidenceRecords).where(eq(evidenceRecords.batchId, batchId)).orderBy(asc(evidenceRecords.approvalNo));
  return rows.map((row) => row.id);
}

/** 화면을 연 뒤 다른 사람이 그 줄을 바꾼 것처럼 version만 올린다(DA-18). */
export async function bumpRecordVersion(id: string): Promise<void> {
  await db.update(evidenceRecords).set({ version: sql`${evidenceRecords.version} + 1` }).where(eq(evidenceRecords.id, id));
}

/** 살아 있는 붙임 한 줄 — 붙이기(06.1-06) 전이라 붙은 줄 상태는 픽스처로 만든다. */
export async function attachRecordFixture(id: string, attachedBy: string): Promise<void> {
  await db.insert(evidenceRecordLinks).values({ evidenceRecordId: id, ownerKind: "expense", ownerId: randomUUID(), attachMode: "registrar", attachedBy });
}

/** 보관 아닌 팀 이름(조직 순 — 공개 칸 묶음 「다른 팀」의 순서). */
export async function liveTeamNames(): Promise<string[]> {
  const rows = await db.select({ name: teams.name }).from(teams).where(isNull(teams.archivedAt)).orderBy(asc(teams.sortOrder), asc(teams.name));
  return rows.map((row) => row.name);
}

export async function teamIdByName(name: string): Promise<string> {
  const [row] = await db.select({ id: teams.id }).from(teams).where(eq(teams.name, name));
  if (!row) throw new Error(`팀 없음: ${name}`);
  return row.id;
}

type CardOwner = { kind: CardOwnerKind; teamId?: string; holderUserId?: string };

// 카드 한 장을 등록하고 끝 4자리를 돌려준다(케이스마다 다른 번호 — 앞 케이스의 카드와 겹치지 않게).
async function addCard(issuer: string, owner: CardOwner): Promise<string> {
  const last4 = String(randomInt(1000, 10_000));
  await createCorpCard(SYSTEM_VIEWER, { issuer, numberLast4: last4, label: `${issuer.slice(0, 2)} ${last4}`, ...owner });
  return last4;
}

export function addLotteCard(owner: CardOwner): Promise<string> {
  return addCard("롯데카드", owner);
}

export function addBcCard(owner: CardOwner): Promise<string> {
  return addCard("비씨카드", owner);
}

/** 롯데 서식 줄 — 06.1-02 생성기 꼴 카드 번호 `999900001111{끝 4자리}` · 승인번호는 줄마다 다르게(`start`부터). */
export function lotteLines(last4: string, count: number, overrides: Record<string, string> = {}, start = 1): FixtureRow[] {
  return Array.from({ length: count }, (_, index) => ({ 카드번호: `999900001111${last4}`, 승인번호: `${last4}${String(start + index).padStart(4, "0")}`, ...overrides }));
}

/** 비씨 서식 줄 — 카드 번호 `9430-0000-0000-{끝 4자리}` · 승인번호는 줄마다 다르게. */
export function bcLines(last4: string, count: number, overrides: Record<string, string> = {}): FixtureRow[] {
  return Array.from({ length: count }, (_, index) => ({ 카드번호: `9430-0000-0000-${last4}`, 승인번호: `${last4}${String(index + 1).padStart(4, "0")}`, ...overrides }));
}

/** 생성기 바이트를 끌어 놓기 영역의 파일 입력에 넣는다(`파일 고르기`와 같은 입력). */
export async function uploadFixture(page: Page, name: string, bytes: Uint8Array): Promise<void> {
  await uploadFixtures(page, [{ name, bytes }]);
}

/** 여러 파일을 한 번에 놓는다(E32 · P3-8). */
export async function uploadFixtures(page: Page, files: readonly { name: string; bytes: Uint8Array }[]): Promise<void> {
  await page.getByTestId("attachments-input").setInputFiles(files.map(({ name, bytes }) => ({ name, mimeType: "application/vnd.ms-excel", buffer: Buffer.from(bytes) })));
}

export function isServerAction(request: { method: () => string; headers: () => Record<string, string> }): boolean {
  return request.method() === "POST" && request.headers()["next-action"] !== undefined;
}

export function waitForServerAction(page: Page) {
  return page.waitForResponse((response) => isServerAction(response.request()));
}

/** 증빙 목록 표 — 편집 칸이 하나라도 있으면 격자(role grid), 없으면(잠긴 줄 · 보기 전용 폭) 표라서 caption으로 잡는다. */
export function evidenceTable(page: Page): Locator {
  return page.locator("table").filter({ has: page.locator("caption", { hasText: /^증빙 목록$/ }) });
}

export function evidenceGrid(page: Page): Locator {
  return page.getByRole("grid", { name: "증빙 목록" });
}

/** 데이터 행(그룹 머리글 행 · 폰 접힌 줄은 칸이 하나라 빠진다). */
export function evidenceRows(page: Page): Locator {
  return evidenceTable(page).locator("tbody tr:has(> td:nth-child(2))");
}

// 열 순서: 날짜 · 거래처·가맹점 · 공급가 · 세액 · 합계 · 공개 · 상태 · 행 행동(편집 폭에서만 — 머리글 숨김).
export const EVIDENCE_COL = { date: 0, counterparty: 1, supply: 2, vat: 3, total: 4, visibility: 5, status: 6, actions: 7 } as const;

export function evidenceCell(page: Page, rowIndex: number, colIndex: number): Locator {
  return evidenceRows(page).nth(rowIndex).locator(":scope > td").nth(colIndex);
}

// 수화 전에 준 포커스는 격자가 받지 못한다 — 그 셀이 탭 정지가 될 때까지 다시 준다(리저브 대장 · quote-edit-scope 선례).
// tabindex=0은 서버 HTML에도 이미 있어(로빙 첫 칸) 수화 신호가 아니다 — React 속성이 붙을 때까지 먼저 기다린다(수화 전 Ctrl+S는 격자가 못 받는다).
export async function focusGridCell(target: Locator): Promise<void> {
  await expect
    .poll(() => target.evaluate((element) => Object.keys(element).some((key) => key.startsWith("__reactProps$"))))
    .toBe(true);
  await expect(async () => {
    await target.evaluate((element) => (element as HTMLElement).blur());
    await target.focus();
    await expect(target).toHaveAttribute("tabindex", "0", { timeout: 1_000 });
  }).toPass();
}

/** a가 문서 순서상 b보다 앞인가(`compareDocumentPosition` — DA-14 · DA-15). */
export async function precedes(a: Locator, b: Locator): Promise<boolean> {
  const handle = await b.elementHandle();
  return a.evaluate((first, second) => Boolean(second && first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING), handle);
}
