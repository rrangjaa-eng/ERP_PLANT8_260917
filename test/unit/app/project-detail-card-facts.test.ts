import { beforeEach, describe, expect, it, vi } from "vitest";

// 리뷰 P3-5 — 프로젝트 상세의 견적 표 카드 쪽 사실(lineCardSideFacts) 읽기가 실패해도 상세 전체가 오류로 넘어가지 않는다.
// 표는 사실 없이 서고(보관 대신 취소 · 실행가 초과 표시만 빠짐), 실패는 로그로 남는다(카드 섹션 S15의 실패 가두기와 같은 결).

const PROJECT_ID = "11111111-1111-4111-8111-111111111111";
const REVISION_ID = "22222222-2222-4222-8222-222222222222";

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("notFound");
  },
  redirect: () => {
    throw new Error("redirect");
  },
}));
vi.mock("@/lib/viewer", () => ({ getSession: () => Promise.resolve({ viewer: { id: "u1", roleId: "r1" } }) }));
vi.mock("@/domain/permissions/can", () => ({ can: () => Promise.resolve(true) }));
vi.mock("@/domain/permissions/visible", () => ({ visible: () => Promise.resolve(true) }));
vi.mock("@/domain/projects", () => ({
  findProject: () =>
    Promise.resolve({ id: PROJECT_ID, number: "26001", name: "프로젝트", status: "in_progress", pmUserId: "u1", startDate: "2026-09-01", endDate: "2026-12-31", archivedAt: null, preEstimate: null }),
}));
vi.mock("@/domain/projects/references", () => ({
  listProjectFormReferences: () => Promise.resolve({ clients: [], vendors: [], vendorShown: true, subcategories: [], subcategoryLabels: {} }),
  scopeCreateFormReferences: () => Promise.resolve({ teams: [], pmUsers: [] }),
}));
const listQuoteLines = vi.fn<(...args: unknown[]) => Promise<unknown[]>>(() => Promise.resolve([]));
vi.mock("@/domain/quotes/lines", () => ({
  getCurrentQuoteRevision: () => Promise.resolve({ id: REVISION_ID, seq: 1, approved: false }),
  listQuoteLines: (...args: unknown[]) => listQuoteLines(...args),
}));
const lineCardSideFacts = vi.fn<(...args: unknown[]) => Promise<unknown>>();
vi.mock("@/domain/corp-card-usages/link-targets", () => ({ lineCardSideFacts: (...args: unknown[]) => lineCardSideFacts(...args) }));
vi.mock("@/domain/quotes/revisions", () => ({ listRevisionSummaries: () => Promise.resolve([]) }));
vi.mock("@/domain/revenue", () => ({ listRevenue: () => Promise.resolve({}) }));
vi.mock("@/domain/issue-requests", () => ({ listProjectIssueRequests: () => Promise.resolve([]) }));
vi.mock("@/domain/money/currency", () => ({ recentFxRate: () => Promise.resolve(null) }));
vi.mock("@/domain/settings/registry", () => ({ getSettingValue: () => Promise.resolve(100) }));
vi.mock("@/domain/settings/keys", () => ({ QUOTE_LINE_MAX_PER_REVISION: { key: "quote.line_max_per_revision" } }));
vi.mock("@/domain/projects/status", () => ({
  actorCoversProjectTeam: () => Promise.resolve(true),
  isEndDatePassed: () => false,
  lastStatusChangeOn: () => Promise.resolve("2026-09-01"),
  listProjectStatusCatalog: () => Promise.resolve([]),
  statusDestinations: () => Promise.resolve([]),
}));
vi.mock("@/domain/projects/responsibles", () => ({ projectResponsibles: () => Promise.resolve({ pmName: null, teamLeadName: null }) }));
vi.mock("@/domain/people", () => ({ getPerson: () => Promise.resolve(null) }));
vi.mock("@/domain/expenses", () => ({ listLineDoors: () => Promise.resolve({}) }));
vi.mock("@/app/(app)/document-kinds", () => ({}));
vi.mock("@/domain/settlements", () => ({ getSettlementHeader: () => Promise.resolve(null) }));
vi.mock("@/app/(app)/projects/[id]/quote-table", () => ({ QuoteLedger: () => null }));
vi.mock("@/app/(app)/projects/[id]/revision-section", () => ({ RevisionSection: () => null }));
vi.mock("@/app/(app)/projects/[id]/card-usage-section", () => ({ CardUsageSection: () => null }));
const logError = vi.fn<(...args: unknown[]) => void>();
vi.mock("@/lib/log", () => ({ log: { error: (...args: unknown[]) => logError(...args), info: vi.fn(), warn: vi.fn() } }));

const { default: ProjectDetailPage } = await import("@/app/(app)/projects/[id]/page");

beforeEach(() => {
  listQuoteLines.mockClear();
  lineCardSideFacts.mockReset();
  logError.mockReset();
});

describe("프로젝트 상세 — 카드 쪽 사실 읽기 실패 가두기(P3-5)", () => {
  it("lineCardSideFacts가 실패해도 페이지가 서고, 견적 표는 사실 없이 읽히며 실패는 로그로 남는다", async () => {
    lineCardSideFacts.mockRejectedValue(new Error("lock timeout"));
    await expect(ProjectDetailPage({ params: Promise.resolve({ id: PROJECT_ID }) })).resolves.toBeTruthy();
    expect(listQuoteLines).toHaveBeenCalledTimes(1);
    expect(listQuoteLines.mock.calls[0]?.[2]).toMatchObject({ cardSideFacts: undefined });
    expect(logError).toHaveBeenCalledWith("project.card_side_facts_failed", expect.objectContaining({ projectId: PROJECT_ID, message: "lock timeout" }));
  });

  it("읽기가 되면 사실을 견적 표에 넘긴다", async () => {
    const facts = new Map([["line-1", { linked: true, overKrw: null }]]);
    lineCardSideFacts.mockResolvedValue(facts);
    await ProjectDetailPage({ params: Promise.resolve({ id: PROJECT_ID }) });
    expect(listQuoteLines.mock.calls[0]?.[2]).toMatchObject({ cardSideFacts: facts });
    expect(logError).not.toHaveBeenCalled();
  });
});
