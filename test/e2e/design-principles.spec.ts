import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { createFixtureUser } from "./fixtures";
import { checkPrinciples } from "./principles-check";
import { SYSADMIN_ROLE_ID } from "@/domain/permissions/roles";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { createOrgUnit, createTeam } from "@/domain/org";
import { createProject } from "@/domain/projects";
import { insertVendor } from "@/repositories/vendors";
import { findUserByEmail } from "@/repositories/users";

// 화면 사용성 원칙 자동 점검(사용자 결정 2026-09-28). 이 스펙의 라우트는 경고 모드(`strict: false`)다 — 위반은 테스트 주석(annotation)과
// 로그로 보이고 실패시키지 않는다. 판정·수집은 principles-check.ts의 `checkPrinciples`가 한다.
// 웨이브 ③~⑤ 화면 플랜은 자기 스펙에서 `strict: isStrict(process.env.DESIGN_PRINCIPLES_STRICT)`로 부른다(공통 §10).
// 04.6-29가 이 목록을 전 화면 + 패널 라우트 표로 바꾸고 막는 모드로 켠다.

test("화면 사용성 원칙 점검(경고만)", async ({ page }) => {
  test.setTimeout(180_000);
  const admin = await createFixtureUser({ roleId: SYSADMIN_ROLE_ID, withTeam: true });
  const user = await findUserByEmail(SYSTEM_VIEWER, admin.email);
  if (!user) throw new Error("픽스처 사용자가 없습니다");
  const org = await createOrgUnit(SYSTEM_VIEWER, { name: `원칙점검본부-${randomUUID().slice(0, 8)}` });
  const team = await createTeam(SYSTEM_VIEWER, { orgUnitId: org.id, name: `원칙점검팀-${randomUUID().slice(0, 6)}` });
  const vendor = await insertVendor(SYSTEM_VIEWER, { name: `원칙점검거래처-${randomUUID().slice(0, 6)}`, normalizedName: `원칙점검-${randomUUID()}` });
  const project = await createProject(SYSTEM_VIEWER, { clientId: vendor.id, teamId: team.id, pmUserId: user.id, name: `원칙점검-${randomUUID().slice(0, 6)}` });

  await page.goto("/login");
  await page.getByLabel("이메일").fill(admin.email);
  await page.getByLabel("비밀번호").fill(admin.password);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/account$/);

  const routes = ["/", "/projects", `/projects/${project.id}`, "/admin/vendors", "/admin/vendors?new=1", "/expenses", "/cards", "/approvals", "/notifications", "/account"];
  await checkPrinciples(page, routes, { strict: false });
});
