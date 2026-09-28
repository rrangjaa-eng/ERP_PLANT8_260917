import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { createFixtureUser } from "./fixtures";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { createOrgUnit, createTeam } from "@/domain/org";
import { createProject } from "@/domain/projects";
import { getCurrentQuoteRevision, saveQuoteLines } from "@/domain/quotes/lines";
import { insertVendor } from "@/repositories/vendors";
import { findUserByEmail } from "@/repositories/users";

// 버그 재현(2026-09-28 스킨 촬영 중 발견): 견적 원장을 보기만 하는 계급(쓰기·조정 권한 없음 — 대표)에게
// 소분류가 이름(무대·시공) 대신 코드값(stage_construction)으로, 거래처가 이름 대신 id로 보였다.
// page.tsx가 이름 목록을 쓰기·조정 권한이 있을 때만 읽었기 때문이다.
test("보기만 하는 계급도 견적 원장에서 소분류·거래처를 이름으로 본다", async ({ page }) => {
  const ceo = await createFixtureUser({ roleId: "role-ceo", withTeam: true });
  const pm = await createFixtureUser({ roleId: "role-pm", withTeam: true });
  const pmUser = await findUserByEmail(SYSTEM_VIEWER, pm.email);
  if (!pmUser) throw new Error("PM 픽스처가 없습니다");
  const org = await createOrgUnit(SYSTEM_VIEWER, { name: `읽기본부-${randomUUID().slice(0, 8)}` });
  const team = await createTeam(SYSTEM_VIEWER, { orgUnitId: org.id, name: `읽기팀-${randomUUID().slice(0, 6)}` });
  const vendorName = `읽기거래처-${randomUUID().slice(0, 6)}`;
  const vendor = await insertVendor(SYSTEM_VIEWER, { name: vendorName, normalizedName: vendorName });
  const project = await createProject(SYSTEM_VIEWER, { clientId: vendor.id, teamId: team.id, pmUserId: pmUser.id, name: `읽기-${randomUUID().slice(0, 6)}` });
  const revision = await getCurrentQuoteRevision(SYSTEM_VIEWER, project.id);
  if (!revision) throw new Error("차수가 없습니다");
  await saveQuoteLines(SYSTEM_VIEWER, revision.id, { rows: [
    { id: randomUUID(), isNew: true, subcategory: "stage_construction", itemName: "메인 스테이지", quantity: 1, vendorId: vendor.id,
      unitPrice: { currency: "KRW", amount: 1_000_000, fxRate: 1 }, execution: { currency: "KRW", amount: 500_000, fxRate: 1 } },
  ] });

  await page.goto("/login");
  await page.getByLabel("이메일").fill(ceo.email);
  await page.getByLabel("비밀번호").fill(ceo.password);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/account$/);
  await page.goto(`/projects/${project.id}`);

  const table = page.getByRole("table", { name: "견적 줄" });
  await expect(table.getByText("메인 스테이지")).toBeVisible();
  // 폰용 접힌 줄에도 같은 글자가 숨어 있어 셀 역할(숨은 요소 제외)로 찾는다
  await expect(table.getByRole("cell", { name: "무대·시공", exact: true }).first()).toBeVisible();   // 그룹 머리글 + 소분류 칸
  await expect(table.getByText("stage_construction")).toHaveCount(0);
  await expect(table.getByRole("cell", { name: vendorName, exact: true })).toBeVisible();
  await expect(table.getByText(vendor.id)).toHaveCount(0);
});
