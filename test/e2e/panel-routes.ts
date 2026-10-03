import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import "@/domain/leave";
import { createAccount } from "@/domain/auth/accounts";
import { assignTeam, createOrgUnit, createTeam } from "@/domain/org";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { createProject } from "@/domain/projects";
import { submitLeave } from "@/domain/leave";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { insertCorpCard, setCorpCardArchived } from "@/repositories/corp-cards";
import { insertRole } from "@/repositories/roles";
import { insertVendor, setVendorHidden } from "@/repositories/vendors";
import { seoulToday } from "@/lib/dates";
import { kstToday } from "@/lib/kst-date";
import { archiveE2EFieldDefinitions, createE2EFieldDefinition } from "./fixtures";
import { leaveWeekdayRange } from "./leave-dates";
import { documentLabel, setupLeaveOrg } from "./leave-org";

// 패널 라우트 표(D20 · 공통 §10) — 옆 패널(또는 결재 시트)이 열리는 라우트의 한 곳. 소유 04.6-16 — 다른 플랜은 이 파일을 고치지 않는다
// (행이 빠졌으면 SUMMARY 「넘김 → 웨이브 합본(표 소유 04.6-16, 오케스트레이터가 공통 §1 ⑤에서 고침)」).
// 쓰는 곳: 04.6-16 mobile-320-no-overflow.spec.ts(320 · 768) · 04.6-29 design-principles · a11y · type-hierarchy.
// 머지 판정은 404가 아니라 라우트 파일 존재다(Q5 — `routeAvailability`).

export type PanelRouteCondition = "04.5" | "04.3" | "approval-fixture";

export type PanelRoute = {
  id: string;
  /** 자리표시 문자열 — `{projectId}` `{vendorId}` `{cardId}` `{tableKey}` `{year}` `{fieldDefId}`. */
  path: string;
  condition?: PanelRouteCondition;
  /** 기능 스위치 행 — `certs` 프로젝트에서만 켜져 있다(`cert.setup.ts`). */
  featureSwitch?: "cert.enabled";
  /** `approval-sheet` — 이동 뒤 결재함 행을 눌러 시트를 연다. */
  open?: "approval-sheet";
  /** `approval-sheet` 행을 재는 창 폭 — 없으면 폰 390(아래 시트). PC 행은 1280(오른쪽 480 시트 — DR4 A). */
  width?: number;
};

export const PANEL_ROUTES: readonly PanelRoute[] = [
  { id: "projects-new", path: "/projects?new=1" },
  { id: "projects-copy", path: "/projects?new=1&copyFrom={projectId}" },
  { id: "vendors-new", path: "/admin/vendors?new=1" },
  { id: "vendors-edit", path: "/admin/vendors?editId={vendorId}" },
  { id: "people-new", path: "/admin/people?new=1" },
  { id: "org-new-org", path: "/admin/people/org?new=org" },
  { id: "org-new-team", path: "/admin/people/org?new=team" },
  { id: "roles-new", path: "/admin/people/roles?new=1" },
  { id: "cards-new", path: "/admin/corp-cards?new=1" },
  { id: "cards-edit", path: "/admin/corp-cards?editId={cardId}" },
  { id: "codes-new", path: "/admin/code-tables?tableKey={tableKey}&new=1" },
  { id: "holidays-new", path: "/admin/holidays?year={year}&new=1" },
  { id: "approvals-sheet", path: "/approvals", condition: "approval-fixture", open: "approval-sheet" },
  { id: "approvals-sheet-pc", path: "/approvals", condition: "approval-fixture", open: "approval-sheet", width: 1280 },
  { id: "fielddefs-new", path: "/admin/field-definitions?new=1", condition: "04.5" },
  { id: "fielddefs-edit", path: "/admin/field-definitions?editId={fieldDefId}", condition: "04.5" },
  { id: "events-new", path: "/certs/events?new=1", condition: "04.3", featureSwitch: "cert.enabled" },
];

// 조건부 행의 머지 판정 파일(저장소 루트 기준).
const ROUTE_FILES: Record<"04.5" | "04.3", string> = {
  "04.5": "app/(app)/admin/field-definitions/page.tsx",
  "04.3": "app/(app)/certs/events/page.tsx",
};

export type RouteAvailability = { measure: true } | { measure: false; note: string };

/**
 * Q5 — 머지 판정은 404가 아니라 파일 존재다. 조건 `04.5`·`04.3` 행은 그 라우트 파일이 없으면 「머지 전」으로 건너뛴다.
 * 파일이 있어도 기능 스위치 행(`events-new`)이 `certs` 프로젝트 밖이면 「certs 프로젝트에서 잰다」로 건너뛴다(그 프로젝트에서만 `/certs/*`가 404가 아니다).
 * 그 밖은 잰다 — 잴 행의 404는 실패다(건너뛴 것으로 읽지 않는다). `fileExists`는 테스트가 바꿔 끼운다.
 */
export function routeAvailability(
  route: PanelRoute,
  projectName: string,
  fileExists: (file: string) => boolean = (file) => existsSync(resolve(process.cwd(), file)),
): RouteAvailability {
  if (route.condition === "04.5" || route.condition === "04.3") {
    if (!fileExists(ROUTE_FILES[route.condition])) return { measure: false, note: `머지 전 — ${route.condition}` };
    if (route.featureSwitch !== undefined && projectName !== "certs") return { measure: false, note: "certs 프로젝트에서 잰다" };
  }
  return { measure: true };
}

export type PanelRouteFixtures = {
  projectId: string;
  vendorId: string;
  cardId: string;
  tableKey: string;
  year: string;
  /** 04.5 라우트 파일이 있을 때만 값이 있다. */
  fieldDefId: string | null;
  /** 결재 대기 건을 처리할 결재자(팀장) 계정 — `approval-sheet` 행이 이 계정으로 로그인한다. */
  approver: { email: string; password: string };
  /** 결재 대기 건의 결재함 행 이름(`연차 · 종일 MM-DD ~ MM-DD`). */
  approvalLabel: string;
  /** 정리용 — 이 워커가 만든 것(다른 워커의 픽스처를 건드리지 않는다). */
  cleanup: { vendorIds: string[]; cardIds: string[]; fieldDefLabel: string | null };
};

const PREFIX = "패널라우트표";
const FIELD_DEF_ROLE_ID = "role-e2e-panel-routes";
let cached: Promise<PanelRouteFixtures> | null = null;

async function createFixtures(): Promise<PanelRouteFixtures> {
  const stamp = randomUUID().slice(0, 8);
  const today = kstToday(new Date());

  // 프로젝트 하나(복사 등록 출처) — 팀에 발령된 PM과 그 팀의 거래처 고객.
  const orgUnit = await createOrgUnit(SYSTEM_VIEWER, { name: `${PREFIX}본부-${stamp}` });
  const team = await createTeam(SYSTEM_VIEWER, { orgUnitId: orgUnit.id, name: `${PREFIX}팀-${stamp}` });
  const pm = await createAccount(SYSTEM_VIEWER, { email: `e2e-panelroutes-${randomUUID()}@example.test`, name: "패널라우트 PM", roleId: DEFAULT_ROLE_ID });
  await assignTeam(SYSTEM_VIEWER, { userId: pm.userId, teamId: team.id, effectiveFrom: today });
  const client = await insertVendor(SYSTEM_VIEWER, { name: `${PREFIX}-고객-${stamp}`, normalizedName: `${PREFIX}-고객-${stamp}`.toLowerCase() });
  const project = await createProject(SYSTEM_VIEWER, { clientId: client.id, teamId: team.id, pmUserId: pm.userId, name: `${PREFIX}-${stamp}` });

  // 거래처 수정 · 법인카드 수정이 가리킬 대상. 카드 끝 4자리는 (발급사, 끝 4자리) 유일 제약 때문에 워커마다 다르게 둔다(워커가 다시 뜨면 이 픽스처를 다시 만든다).
  const vendor = await insertVendor(SYSTEM_VIEWER, { name: `${PREFIX}-거래처-${stamp}`, normalizedName: `${PREFIX}-거래처-${stamp}`.toLowerCase() });
  const card = await insertCorpCard(SYSTEM_VIEWER, { issuer: "신한카드", numberLast4: String(1000 + Math.floor(Math.random() * 9000)), label: `${PREFIX}-카드-${stamp}`, kind: "personal", holderUserId: pm.userId });

  // 결재 대기 건 — 기안자가 신청하고 팀장이 결재자다. 다른 연차 스펙과 겹치지 않는 주(week 12) 하루.
  const todaySeoul = seoulToday();
  const range = leaveWeekdayRange(todaySeoul, { week: 12, weekdays: 1 });
  const org = await setupLeaveOrg(todaySeoul);
  await submitLeave(org.drafter.viewer, { kind: "full_day", startDate: range.startDate, endDate: range.endDate, half: "" });

  // 04.5 화면 항목 — 라우트 파일이 있을 때만(Q5). 칸은 전용 계급에만 보여 다른 스펙의 거래처 폼에 끼지 않는다.
  let fieldDefId: string | null = null;
  let fieldDefLabel: string | null = null;
  if (existsSync(resolve(process.cwd(), ROUTE_FILES["04.5"]))) {
    await insertRole(SYSTEM_VIEWER, { id: FIELD_DEF_ROLE_ID, name: `${PREFIX} 전용`, sortOrder: 99 }).catch(() => undefined);
    fieldDefLabel = `${PREFIX}칸-${stamp}`;
    fieldDefId = (await createE2EFieldDefinition({ label: fieldDefLabel, type: "text", required: false, onlyRoleId: FIELD_DEF_ROLE_ID })).id;
  }

  return {
    projectId: project.id,
    vendorId: vendor.id,
    cardId: card.id,
    tableKey: "project_status",
    year: today.slice(0, 4),
    fieldDefId,
    approver: { email: org.teamLead.email, password: org.teamLead.password },
    approvalLabel: documentLabel(range),
    cleanup: { vendorIds: [client.id, vendor.id], cardIds: [card.id], fieldDefLabel },
  };
}

/** 고정 접두 이름(`패널라우트표`)의 픽스처 — 한 워커 프로세스에서 한 번만 만든다. */
export function createPanelRouteFixtures(): Promise<PanelRouteFixtures> {
  cached ??= createFixtures();
  return cached;
}

/** 스펙의 afterAll — 이 워커가 만든 거래처 · 카드 · 화면 항목을 치워 다른 스펙의 목록 · 폭 단언에 남지 않게 한다. */
export async function cleanupPanelRouteFixtures(): Promise<void> {
  const pending = cached;
  cached = null;
  const fixtures = pending ? await pending.catch(() => null) : null;
  if (!fixtures) return;
  for (const id of fixtures.cleanup.vendorIds) await setVendorHidden(SYSTEM_VIEWER, id, true);
  for (const id of fixtures.cleanup.cardIds) await setCorpCardArchived(SYSTEM_VIEWER, id, true);
  if (fixtures.cleanup.fieldDefLabel) await archiveE2EFieldDefinitions(fixtures.cleanup.fieldDefLabel);
}

/** 자리표시 치환 — 모르는 자리표시나 값 없는 픽스처는 throw. */
export function resolvePanelRoute(route: PanelRoute, fixtures: PanelRouteFixtures): string {
  const values: Record<string, string | null> = {
    projectId: fixtures.projectId,
    vendorId: fixtures.vendorId,
    cardId: fixtures.cardId,
    tableKey: fixtures.tableKey,
    year: fixtures.year,
    fieldDefId: fixtures.fieldDefId,
  };
  return route.path.replace(/\{(\w+)\}/g, (_match, name: string) => {
    const value = Object.hasOwn(values, name) ? values[name] : undefined;
    if (value === undefined) throw new Error(`패널 라우트 ${route.id}: 모르는 자리표시 {${name}}`);
    if (value === null) throw new Error(`패널 라우트 ${route.id}: 자리표시 {${name}}의 픽스처 값이 없다`);
    return value;
  });
}

/**
 * 이동 + `open` 단계 + 패널 열림 대기. 먼저 `routeAvailability`로 건너뛸 행을 가려 그 행만 `test.skip`한다(주석을 남긴다).
 * 잴 행의 404는 실패다. `approval-sheet` 행은 이 page의 로그인을 결재자 계정으로 바꾼다 — 그 행 뒤에는 다시 로그인해야 한다.
 * 패널이 열린 뒤 `dialog:modal` 하나를 기다린다 — 셀렉터가 `dialog:modal`이라 결재 시트를 `SidePanel`로 옮기기 전후 모두 맞다.
 */
export async function openPanelRoute(page: Page, route: PanelRoute, fixtures: PanelRouteFixtures): Promise<void> {
  const availability = routeAvailability(route, test.info().project.name);
  if (!availability.measure) {
    test.info().annotations.push({ type: "패널 라우트 건너뜀", description: `${route.id} — ${availability.note}` });
    test.skip(true, `${route.id} — ${availability.note}`);
    return;
  }
  if (route.open === "approval-sheet") {
    await page.context().clearCookies();
    await page.goto("/login");
    await page.getByLabel("이메일").fill(fixtures.approver.email);
    await page.getByLabel("비밀번호").fill(fixtures.approver.password);
    await page.getByRole("button", { name: "로그인" }).click();
    await expect(page).toHaveURL(/\/account$/);
  }
  const url = resolvePanelRoute(route, fixtures);
  const response = await page.goto(url);
  expect(response?.status() ?? 0, `${route.id} ${url} 응답`).toBeLessThan(400);
  if (route.open === "approval-sheet") {
    await page.getByRole("button", { name: fixtures.approvalLabel }).click();
  }
  await expect(page.locator("dialog:modal"), `${route.id} 패널`).toHaveCount(1);
  // 패널이 들어오는 움직임이 끝난 뒤의 자리를 잰다(움직이는 중의 x는 뒤 목록 폭을 틀리게 만든다).
  await page.locator("dialog:modal").evaluate((dialog) => Promise.all(dialog.getAnimations({ subtree: true }).map((animation) => animation.finished)));
}
