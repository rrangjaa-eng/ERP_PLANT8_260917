import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { expect, type Page } from "@playwright/test";
import { createExpenseFromLines } from "@/domain/expenses";
import { submitLeave } from "@/domain/leave";
import { SYSADMIN_ROLE_ID } from "@/domain/permissions/roles";
import { seoulToday } from "@/lib/dates";
import { createFixtureUser } from "./fixtures";
import { leaveWeekdayRange } from "./leave-dates";
import { setupExpenseE2E } from "./expense-fixture";
import { createPanelRouteFixtures } from "./panel-routes";

// 04.6-29 — UI-SPEC 「화면 목록」 전 화면의 라우트 표. 원칙(design-principles.spec)·대비(a11y.spec)·글자 위계(type-hierarchy.spec)가 함께 쓴다
// (스펙 파일끼리 import하지 않는다 — 테스트가 두 번 등록된다). 패널이 열린 상태는 이 표가 아니라 `panel-routes.ts`의 `PANEL_ROUTES`(D20 — 04.6-16 소유)가 맡는다.
// 인쇄 `/print/*`는 스킨 대상이 아니라 뺀다. `/dev/components`는 1차 버튼을 일부러 여럿 보이므로 원칙 점검에서만 빼고(`principles: false`) 대비·위계에는 넣는다.
// 머지 판정은 404가 아니라 라우트 파일 존재다(Q5): 조건부 행은 그 페이즈의 라우트 파일이 없을 때만 「머지 전」으로 건너뛰고,
// 기능 스위치(cert) 행은 `certs` 프로젝트 밖에서 「certs 프로젝트에서 잰다」로 건너뛴다(그 프로젝트의 `cert-design-gates.spec.ts` · `principles-certs.spec.ts`가 잰다).

export type ScreenAccount = "sysadmin" | "drafter" | "anon";

export type ScreenRoute = {
  id: string;
  /** 자리표시 — `{projectId}` `{userId}` `{leaveId}` `{expenseId}`. */
  path: string;
  /** 로그인 계정 — `drafter`는 연차 문서의 기안자(문서 보임 규칙이 기안자 · 결재 후보 · 처리자만 허용한다). */
  as: ScreenAccount;
  /** 머지 판정 파일(저장소 루트 기준). 조건부 행만. */
  mergeFile?: string;
  /** 기능 스위치 행 — `certs` 프로젝트에서만 켜져 있다. */
  featureSwitch?: "cert.enabled";
  /** 원칙 점검에서 뺀다(`/dev/components` — 1차 버튼 여럿이 의도). */
  principles?: false;
};

const FIELD_DEFS_FILE = "app/(app)/admin/field-definitions/page.tsx";
const EXPENSE_DOC_FILE = "app/(app)/expenses/[id]/page.tsx";
const CERT_EVENTS_FILE = "app/(app)/certs/events/page.tsx";

export const SCREEN_ROUTES: readonly ScreenRoute[] = [
  { id: "home", path: "/", as: "sysadmin" },
  { id: "projects", path: "/projects", as: "sysadmin" },
  { id: "project-detail", path: "/projects/{projectId}", as: "sysadmin" },
  { id: "expenses", path: "/expenses", as: "sysadmin" },
  { id: "cards", path: "/cards", as: "sysadmin" },
  { id: "pnl", path: "/pnl", as: "sysadmin" },
  { id: "settings", path: "/settings", as: "sysadmin" },
  { id: "reserves", path: "/pnl/reserves", as: "sysadmin" },
  { id: "approvals", path: "/approvals", as: "sysadmin" },
  { id: "leave-list", path: "/leave", as: "drafter" },
  { id: "leave-new", path: "/leave/new", as: "drafter" },
  { id: "leave-doc", path: "/leave/{leaveId}", as: "drafter" },
  { id: "expense-doc", path: "/expenses/{expenseId}", as: "drafter", mergeFile: EXPENSE_DOC_FILE },
  { id: "notifications", path: "/notifications", as: "sysadmin" },
  { id: "account", path: "/account", as: "sysadmin" },
  { id: "admin-index", path: "/admin", as: "sysadmin" },
  { id: "people", path: "/admin/people", as: "sysadmin" },
  { id: "person-detail", path: "/admin/people/{userId}", as: "sysadmin" },
  { id: "org", path: "/admin/people/org", as: "sysadmin" },
  { id: "roles", path: "/admin/people/roles", as: "sysadmin" },
  { id: "vendors", path: "/admin/vendors", as: "sysadmin" },
  { id: "corp-cards", path: "/admin/corp-cards", as: "sysadmin" },
  { id: "code-tables", path: "/admin/code-tables", as: "sysadmin" },
  { id: "holidays", path: "/admin/holidays", as: "sysadmin" },
  { id: "permissions", path: "/admin/permissions", as: "sysadmin" },
  { id: "visibility", path: "/admin/visibility", as: "sysadmin" },
  { id: "admin-settings", path: "/admin/settings", as: "sysadmin" },
  { id: "system-status", path: "/admin/system-status", as: "sysadmin" },
  { id: "action-log", path: "/admin/action-log", as: "sysadmin" },
  { id: "archive", path: "/admin/archive", as: "sysadmin" },
  { id: "login", path: "/login", as: "anon" },
  { id: "field-definitions", path: "/admin/field-definitions", as: "sysadmin", mergeFile: FIELD_DEFS_FILE },
  { id: "dev-components", path: "/dev/components", as: "sysadmin", principles: false },
  { id: "dev-components-panel", path: "/dev/components?panel=1", as: "sysadmin", principles: false },
  { id: "cert-events", path: "/certs/events", as: "sysadmin", mergeFile: CERT_EVENTS_FILE, featureSwitch: "cert.enabled" },
  { id: "cert-event-detail", path: "/certs/events/{eventId}", as: "sysadmin", mergeFile: CERT_EVENTS_FILE, featureSwitch: "cert.enabled" },
  { id: "cert-submission", path: "/certs/submissions/{submissionId}", as: "sysadmin", mergeFile: CERT_EVENTS_FILE, featureSwitch: "cert.enabled" },
  { id: "cert-recipient", path: "/c/{token}", as: "anon", mergeFile: CERT_EVENTS_FILE, featureSwitch: "cert.enabled" },
];

export type ScreenAvailability = { measure: true } | { measure: false; note: string };

export function screenAvailability(
  route: ScreenRoute,
  projectName: string,
  fileExists: (file: string) => boolean = (file) => existsSync(resolve(process.cwd(), file)),
): ScreenAvailability {
  if (route.mergeFile !== undefined && !fileExists(route.mergeFile)) return { measure: false, note: "머지 전" };
  if (route.featureSwitch !== undefined && projectName !== "certs") return { measure: false, note: "certs 프로젝트에서 잰다" };
  return { measure: true };
}

type Credentials = { email: string; password: string };

export type ScreenFixtures = {
  projectId: string;
  userId: string;
  leaveId: string;
  expenseId: string;
  sysadmin: Credentials;
  drafter: Credentials;
};

let cached: Promise<ScreenFixtures> | null = null;

async function createFixtures(): Promise<ScreenFixtures> {
  const panel = await createPanelRouteFixtures();
  const sysadmin = await createFixtureUser({ roleId: SYSADMIN_ROLE_ID });
  // 연차 문서 하나 — 기안자가 신청한다. 패널 라우트 표 픽스처(12주)와 겹치지 않는 13주 하루.
  const today = seoulToday();
  const range = leaveWeekdayRange(today, { week: 13, weekdays: 1 });
  // 지출결의 E2E 준비(`setupExpenseE2E`)가 기안 PM · 진행 프로젝트 · 견적 줄을 도메인 함수로 만든다 — 그 기안자가 연차 · 지출결의 화면의 `drafter`다.
  const expenseSetup = await setupExpenseE2E();
  const org = { drafter: expenseSetup.pm };
  const submitted = await submitLeave(org.drafter.viewer, { kind: "full_day", startDate: range.startDate, endDate: range.endDate, half: "" });
  // 작성 중 지출결의 하나 — 폼 화면(S3)을 잰다(제출 문서는 증빙 파일이 필요해 E2E 스펙이 따로 증명한다).
  const created = await createExpenseFromLines(expenseSetup.pm.viewer, { lineIds: [expenseSetup.lines.tracer.id] });
  const expenseId = created.created[0]?.expenseId;
  if (!expenseId) throw new Error("화면 점검용 지출결의를 만들지 못했다");
  return {
    projectId: panel.projectId,
    userId: org.drafter.viewer.id,
    leaveId: submitted.leaveId,
    expenseId,
    sysadmin,
    drafter: { email: org.drafter.email, password: org.drafter.password },
  };
}

/** 한 워커 프로세스에서 한 번만 만든다. */
export function createScreenFixtures(): Promise<ScreenFixtures> {
  cached ??= createFixtures();
  return cached;
}

/** 자리표시 치환 — 모르는 자리표시는 throw. 건너뛰는 cert 행(`{eventId}` 등)은 치환하기 전에 `screenAvailability`로 가른다. */
export function resolveScreenRoute(route: ScreenRoute, fixtures: ScreenFixtures): string {
  const values: Record<string, string> = { projectId: fixtures.projectId, userId: fixtures.userId, leaveId: fixtures.leaveId, expenseId: fixtures.expenseId };
  return route.path.replace(/\{(\w+)\}/g, (_match, name: string) => {
    const value = Object.hasOwn(values, name) ? values[name] : undefined;
    if (value === undefined) throw new Error(`화면 ${route.id}: 모르는 자리표시 {${name}}`);
    return value;
  });
}

/** 계정을 바꿔 로그인한다 — 쿠키를 비운 뒤 로그인 화면으로 들어간다. `anon`은 로그아웃 상태로 둔다. */
export async function loginScreenAccount(page: Page, fixtures: ScreenFixtures, account: ScreenAccount): Promise<void> {
  await page.context().clearCookies();
  if (account === "anon") return;
  const credentials = fixtures[account];
  await page.goto("/login");
  await page.getByLabel("이메일").fill(credentials.email);
  await page.getByLabel("비밀번호").fill(credentials.password);
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page).toHaveURL(/\/account$/);
}
