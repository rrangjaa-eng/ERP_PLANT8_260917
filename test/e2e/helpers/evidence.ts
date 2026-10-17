import { randomInt, randomUUID } from "node:crypto";
import { expect, type Locator, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { evidenceImportBatches, evidenceRecordLinks, evidenceRecords, teams } from "@/db/schema";
import { createCorpCard, type CardOwnerKind } from "@/domain/corp-cards";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { insertRole } from "@/repositories/roles";
import type { FixtureRow } from "@/test/fixtures/evidence-import/build";
import { createFixtureUser } from "../fixtures";

// 06.1-05 — 증빙 목록 E2E 도우미. 계급은 스펙이 만든 임시 계급이다(시드 계급의 권한을 바꾸지 않는다 — 리저브 대장 스펙 꼴).
// 바이트는 06.1-02 생성기(test/fixtures/evidence-import/build.ts)가 만든다 — 실제 카드사 파일은 쓰지 않는다.

/** `evidence.intake` 쓰기 · `evidence` 보기 · 정보 항목 둘(증빙 내용 · 금액)을 가진 임시 계급. page를 주면 그 계급의 사람으로 로그인한다. */
export async function createIntakeRole(page?: Page): Promise<string> {
  const roleId = `role-e2e-evidence-${randomUUID()}`;
  await insertRole(SYSTEM_VIEWER, { id: roleId, name: `E2E 증빙 등록 ${roleId.slice(-8)}`, sortOrder: 99, viewScope: "company" });
  await upsertPermission(SYSTEM_VIEWER, { roleId, menu: "evidence.intake", action: "write", allowed: true });
  await upsertPermission(SYSTEM_VIEWER, { roleId, menu: "evidence", action: "view", allowed: true });
  for (const infoItem of ["evidence.value", "evidence.amount"]) await upsertVisibility(SYSTEM_VIEWER, { roleId, infoItem, visible: true });
  if (page) await loginAs(page, roleId);
  return roleId;
}

export async function loginAs(page: Page, roleId: string): Promise<void> {
  const user = await createFixtureUser({ roleId });
  await page.goto("/login");
  await page.getByLabel("이메일").fill(user.email);
  await page.getByLabel("비밀번호").fill(user.password);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/account$/);
}

/** 증빙 기록 표를 비운다 — 등록 권한자는 회사 전체 증빙을 보므로 케이스마다 빈 표에서 시작한다(리저브 대장 스펙 꼴). */
export async function clearEvidence(): Promise<void> {
  await db.delete(evidenceRecordLinks);
  await db.delete(evidenceRecords);
  await db.delete(evidenceImportBatches);
}

export async function teamIdByName(name: string): Promise<string> {
  const [row] = await db.select({ id: teams.id }).from(teams).where(eq(teams.name, name));
  if (!row) throw new Error(`팀 없음: ${name}`);
  return row.id;
}

/** 롯데카드 한 장을 등록하고 끝 4자리를 돌려준다(케이스마다 다른 번호 — 앞 케이스의 카드와 겹치지 않게). */
export async function addLotteCard(owner: { kind: CardOwnerKind; teamId?: string; holderUserId?: string }): Promise<string> {
  const last4 = String(randomInt(1000, 10_000));
  await createCorpCard(SYSTEM_VIEWER, { issuer: "롯데카드", numberLast4: last4, label: `롯데 ${last4}`, ...owner });
  return last4;
}

/** 롯데 서식 줄 — 06.1-02 생성기 꼴 카드 번호 `999900001111{끝 4자리}` · 승인번호는 줄마다 다르게. */
export function lotteLines(last4: string, count: number): FixtureRow[] {
  return Array.from({ length: count }, (_, index) => ({ 카드번호: `999900001111${last4}`, 승인번호: `${last4}${String(index + 1).padStart(4, "0")}` }));
}

/** 생성기 바이트를 끌어 놓기 영역의 파일 입력에 넣는다(`파일 고르기`와 같은 입력). */
export async function uploadFixture(page: Page, name: string, bytes: Uint8Array): Promise<void> {
  await page.getByTestId("attachments-input").setInputFiles({ name, mimeType: "application/vnd.ms-excel", buffer: Buffer.from(bytes) });
}

export function isServerAction(request: { method: () => string; headers: () => Record<string, string> }): boolean {
  return request.method() === "POST" && request.headers()["next-action"] !== undefined;
}

export function waitForServerAction(page: Page) {
  return page.waitForResponse((response) => isServerAction(response.request()));
}

export function evidenceGrid(page: Page): Locator {
  return page.getByRole("grid", { name: "증빙 목록" });
}

/** 격자의 데이터 행(그룹 머리글 행 · 폰 접힌 줄 제외). */
export function evidenceRows(page: Page): Locator {
  return evidenceGrid(page).locator('tbody tr:has(> td[role="gridcell"])');
}

// 열 순서: 날짜 · 거래처·가맹점 · 공급가 · 세액 · 합계 · 공개 · 상태.
export const EVIDENCE_COL = { date: 0, counterparty: 1, supply: 2, vat: 3, total: 4, visibility: 5, status: 6 } as const;

export function evidenceCell(page: Page, rowIndex: number, colIndex: number): Locator {
  return evidenceRows(page).nth(rowIndex).getByRole("gridcell").nth(colIndex);
}

// 수화 전에 준 포커스는 격자가 받지 못한다 — 그 셀이 탭 정지가 될 때까지 다시 준다(리저브 대장 · quote-edit-scope 선례).
export async function focusGridCell(target: Locator): Promise<void> {
  await expect(async () => {
    await target.evaluate((element) => (element as HTMLElement).blur());
    await target.focus();
    await expect(target).toHaveAttribute("tabindex", "0", { timeout: 1_000 });
  }).toPass();
}
