import { expect, type Locator, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { orgUnits, projects, teams, vendors } from "@/db/schema";
import { createOrgUnit, createTeam } from "@/domain/org";
import { SYSADMIN_ROLE_ID } from "@/domain/permissions/roles";
import { createProject } from "@/domain/projects";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { findUserByEmail } from "@/repositories/users";
import { insertVendor } from "@/repositories/vendors";
import { createFixtureUser } from "./fixtures";

// 04.6-13 — 시각 회귀 스펙(visual.spec.ts · visual-390.spec.ts)이 같이 쓰는 고정 픽스처 · 촬영 도우미.
// 픽스처는 고정 이름이고 이미 있으면 다시 만들지 않는다(멱등) — visual-baseline.yml이 같은 DB에서 두 번 돌려도 같은 행이 나온다.

export const VISUAL_PREFIX = "시각회귀";
export const VISUAL_PROJECT_NAME = `${VISUAL_PREFIX} 프로젝트`;
// /projects는 고정 연도 + 접두 검색어로 좁힌다(지금 있는 필터 `year` · `q`뿐 — 새 필터를 만들지 않는다).
export const VISUAL_PROJECT_YEAR = "2026";
export const VISUAL_PROJECTS_URL = `/projects?year=${VISUAL_PROJECT_YEAR}&q=${encodeURIComponent(VISUAL_PREFIX)}`;

export const VISUAL_SCREENSHOT_OPTIONS = {
  fullPage: false,
  animations: "disabled",
  caret: "hide",
  maxDiffPixelRatio: 0.002,
} as const;

async function ensureOrgTeam(): Promise<string> {
  const orgName = `${VISUAL_PREFIX}본부`;
  const teamName = `${VISUAL_PREFIX}팀`;
  const [org] = await db.select().from(orgUnits).where(eq(orgUnits.name, orgName));
  const orgId = org ? org.id : (await createOrgUnit(SYSTEM_VIEWER, { name: orgName })).id;
  const existing = (await db.select().from(teams).where(eq(teams.orgUnitId, orgId))).find((team) => team.name === teamName);
  if (existing) return existing.id;
  return (await createTeam(SYSTEM_VIEWER, { orgUnitId: orgId, name: teamName })).id;
}

async function ensureVendor(): Promise<string> {
  const name = `${VISUAL_PREFIX} 거래처`;
  const [existing] = await db.select().from(vendors).where(eq(vendors.name, name));
  if (existing) return existing.id;
  return (await insertVendor(SYSTEM_VIEWER, { name, normalizedName: name.toLowerCase() })).id;
}

export type VisualFixtures = { projectId: string };

/** 고정 이름 거래처 · 본부 · 팀 · 프로젝트(고정 기간)를 보장하고 프로젝트 id를 돌려준다. */
export async function ensureVisualFixtures(pmEmail: string): Promise<VisualFixtures> {
  const [found] = await db.select().from(projects).where(eq(projects.name, VISUAL_PROJECT_NAME));
  if (found) return { projectId: found.id };
  const pm = await findUserByEmail(SYSTEM_VIEWER, pmEmail);
  if (!pm) throw new Error("픽스처 사용자가 없습니다");
  const created = await createProject(SYSTEM_VIEWER, {
    clientId: await ensureVendor(),
    teamId: await ensureOrgTeam(),
    pmUserId: pm.id,
    name: VISUAL_PROJECT_NAME,
    startDate: `${VISUAL_PROJECT_YEAR}-03-02`,
    endDate: `${VISUAL_PROJECT_YEAR}-03-27`,
  });
  return { projectId: created.id };
}

/** 시스템 관리자 픽스처 사용자로 로그인한다(이름은 늘 「E2E Admin」 — 사진에 나오는 글자가 같다). */
export async function loginForVisual(page: Page): Promise<VisualFixtures> {
  const admin = await createFixtureUser({ roleId: SYSADMIN_ROLE_ID });
  const fixtures = await ensureVisualFixtures(admin.email);
  await page.goto("/login");
  await page.getByLabel("이메일").fill(admin.email);
  await page.getByLabel("비밀번호").fill(admin.password);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/account$/);
  return fixtures;
}

/** 화면을 열고 글꼴 · 본문이 자리잡은 뒤에야 찍는다. */
export async function openForVisual(page: Page, url: string, ready: (page: Page) => Locator): Promise<void> {
  await page.goto(url);
  await expect(ready(page)).toBeVisible();
  // 라우트 loading.tsx의 뼈대(`data-ui="table-skeleton"` div — 300ms 지연 표시)가 걷힌 뒤에 찍는다 — 뼈대가 사진에 남으면 안 된다.
  await expect(page.locator('[data-ui="table-skeleton"]')).toHaveCount(0);
  await page.evaluate(() => document.fonts.ready);
}

export type VisualScreen = {
  /** 파일 이름 앞부분 — `<name>-<폭>.png`. */
  name: string;
  url: (fixtures: VisualFixtures) => string;
  /** 본문이 그려졌다는 신호 — 이 요소가 보이면 찍는다. */
  ready: (page: Page) => Locator;
  /** 실행마다 바뀌는 값(날짜 · 일련 번호)만 — 표 행 통째로 가리지 않는다. */
  mask?: (page: Page) => Locator[];
};

const TITLE = (page: Page) => page.locator('[data-ui="screen-title"], main h1').first();

// UI-SPEC 「기계 검사 계약」 화면 사진 행의 아홉 곳(여덟 화면 + `/dev/components?panel=1`).
export const VISUAL_SCREENS: readonly VisualScreen[] = [
  {
    name: "projects",
    url: () => VISUAL_PROJECTS_URL,
    ready: (page) => page.getByRole("link", { name: VISUAL_PROJECT_NAME }).first(),
    // 프로젝트 번호(연도 + 일련 번호)는 해가 바뀌면 달라진다 — 그 칸만 가린다.
    mask: (page) => [page.getByText(/^\d{5}$/)],
  },
  {
    name: "project-detail",
    url: ({ projectId }) => `/projects/${projectId}`,
    ready: (page) => page.getByText(VISUAL_PROJECT_NAME).first(),
    // 프로젝트 번호 · 현재 상태가 된 날(`수주중 2026-10-03`) · 차수 생성일은 픽스처를 만든 날과 해에 따라 달라진다 — 그 글자 셋만 가린다.
    mask: (page) => [
      page.getByText(/\d{5} · 상세 견적/),
      page.getByText(/^수주중 \d{4}-\d{2}-\d{2}$/),
      page.getByRole("cell", { name: /^\d{4}-\d{2}-\d{2}$/ }),
    ],
  },
  { name: "vendors", url: () => "/admin/vendors", ready: TITLE },
  { name: "vendors-new", url: () => "/admin/vendors?new=1", ready: (page) => page.locator("dialog:modal") },
  { name: "approvals", url: () => "/approvals", ready: TITLE },
  { name: "leave-new", url: () => "/leave/new", ready: TITLE },
  { name: "home", url: () => "/", ready: TITLE },
  { name: "dev-components", url: () => "/dev/components", ready: TITLE },
  { name: "dev-components-panel", url: () => "/dev/components?panel=1", ready: (page) => page.locator("dialog:modal") },
];
