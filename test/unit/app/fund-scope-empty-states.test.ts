import { createElement, type AnchorHTMLAttributes, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// 07.3-01 /review: D-7314로 자금 본부 사람이 전사 행을 보게 되어, 회사 전체가 0건일 때만 서는 빈 화면 글자를 공유 E2E DB에서
// 더는 닿지 못한다(07.3-01-SUMMARY 「닿지 못한 빈 화면 글자」). 서버 페이지를 목 데이터로 그려 그 글자 · 이동 곳을 지킨다.
// approvals-inbox-measure-header.test.ts와 같은 목 모양 — 목록 함수만 사례마다 바꾼다.
const data = vi.hoisted((): { issueList: unknown; budgetList: unknown; openIssueRequests: unknown } => ({ issueList: null, budgetList: null, openIssueRequests: null }));

vi.mock("next/link", () => ({
  default: ({ href, scroll, children, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; scroll?: boolean; children?: ReactNode }) =>
    createElement("a", { href, "data-scroll": String(scroll), ...rest }, children),
}));
vi.mock("@/ui/link-pending/LinkPending", () => ({ LinkPending: () => null }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("notFound");
  },
  redirect: () => {
    throw new Error("redirect");
  },
  useRouter: () => ({ push: () => undefined, refresh: () => undefined, replace: () => undefined }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/projects",
}));
vi.mock("next-safe-action/hooks", () => ({ useAction: () => ({ execute: () => undefined, isExecuting: false, result: {} }) }));
vi.mock("@/lib/viewer", () => {
  const session = { viewer: { id: "viewer", roleId: "role" } };
  return { requireSession: () => Promise.resolve(session), getSession: () => Promise.resolve(session) };
});
vi.mock("@/domain/permissions/can", () => ({ can: () => Promise.resolve(true) }));
vi.mock("@/domain/issue-requests", () => ({
  listIssueRequests: () => Promise.resolve(data.issueList),
  summarizeOpenIssueRequests: () => Promise.resolve(data.openIssueRequests),
}));
vi.mock("@/domain/projects/budget", () => ({ listBudgetRows: () => Promise.resolve(data.budgetList) }));
// 프로젝트 목록 페이지의 나머지 조회 — 필터 줄이 서는 「올해 0건」 갈래(default-view)만 만든다.
vi.mock("@/domain/settings/registry", () => ({ getSettingValue: () => Promise.resolve(0) }));
vi.mock("@/domain/projects/status", () => ({ listProjectStatusCatalog: () => Promise.resolve([]) }));
vi.mock("@/domain/money/currency", () => ({ recentFxRate: () => Promise.resolve(1) }));
vi.mock("@/domain/projects/references", () => ({
  listProjectFormReferences: () => Promise.resolve({ teams: [], clients: [], pmUsers: [], vendorShown: true }),
  scopeCreateFormReferences: () => Promise.resolve({ teams: [], pmUsers: [] }),
  loadCreatorDefaults: () => Promise.resolve(null),
}));
vi.mock("@/domain/projects", () => ({
  PROJECT_SORT_KEYS: ["endDate"],
  getProjectCopySource: () => Promise.resolve(null),
  loadProjectList: () =>
    Promise.resolve({
      year: 2026,
      rows: [],
      totals: {},
      total: 0,
      page: 1,
      pageCount: 1,
      periodErrors: {},
      emptyKind: "default-view",
      hasFilter: false,
      params: {},
      columnStep: "wide",
      sort: { key: "endDate", direction: "asc" },
    }),
}));
vi.mock("@/app/(app)/projects/actions", () => ({ createProjectAction: () => undefined }));

const { default: IssueRequestsPage } = await import("@/app/(app)/projects/issue-requests/page");
const { default: ProjectBudgetPage } = await import("@/app/(app)/projects/budget/page");
const { default: ProjectsPage } = await import("@/app/(app)/projects/page");

const emptyPage = { page: 1, pageCount: 1, pageSize: 50, total: 0 };

describe("발행 요청 목록 — 신청됨 0건 빈 화면(07.3-01 /review)", () => {
  it("기본 보기(신청됨)에 행이 없으면 `처리할 발행 요청이 없습니다` · `전체 보기`(?status=all)다", async () => {
    data.issueList = { rows: [], page: emptyPage, totals: { count: 0, amountKrw: 0 } };
    const html = renderToStaticMarkup(await IssueRequestsPage({ searchParams: Promise.resolve({}) }));
    expect(html).toContain("처리할 발행 요청이 없습니다");
    expect(html).toMatch(/<a href="\/projects\/issue-requests\?status=all"[^>]*>전체 보기<\/a>/);
  });
});

describe("예산 현황 — 진행 0건 빈 화면(07.3-01 /review)", () => {
  it("진행 보기에 행이 없으면 `예산이 있는 진행 프로젝트가 없습니다` · `전체 보기`(?status=all)다", async () => {
    data.budgetList = { costRateSet: true, rows: [], totals: null, uncomputableCount: 0 };
    const html = renderToStaticMarkup(await ProjectBudgetPage({ searchParams: Promise.resolve({}) }));
    expect(html).toContain("예산이 있는 진행 프로젝트가 없습니다");
    expect(html).toMatch(/<a href="\/projects\/budget\?status=all"[^>]*>전체 보기<\/a>/);
  });
});

describe("프로젝트 목록 — 열린 발행 요청 0건 하위 링크(07.3-01 /review)", () => {
  it("볼 수 있고 열린 요청이 0건이면 링크 글자는 숫자 없는 `발행 요청`이다", async () => {
    data.openIssueRequests = { count: 0 };
    const html = renderToStaticMarkup(await ProjectsPage({ searchParams: Promise.resolve({}) }));
    expect(html).toMatch(/<a [^>]*href="\/projects\/issue-requests"[^>]*>발행 요청<\/a>/);
  });

  it("열린 요청이 있으면 `발행 요청 {N}`이다(대조)", async () => {
    data.openIssueRequests = { count: 3 };
    const html = renderToStaticMarkup(await ProjectsPage({ searchParams: Promise.resolve({}) }));
    expect(html).toMatch(/<a [^>]*href="\/projects\/issue-requests"[^>]*>발행 요청 3<\/a>/);
  });
});
