import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { expenses, quoteLines } from "@/db/schema";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { ForbiddenError } from "@/domain/permissions/can";
import { setPermissionCell } from "@/domain/permissions/matrix";
import { setSettingValue } from "@/domain/settings/registry";
import { PROJECT_CUSTOMER_APPROVAL_GATE } from "@/domain/settings/keys";
import { createProject } from "@/domain/projects";
import { completeViaApproval } from "@/test/support/settlement-authority";
import { getCurrentQuoteRevision, saveQuoteLines } from "@/domain/quotes/lines";
import { createRevisionFromCurrent, setCustomerApproval } from "@/domain/quotes/revisions";
import { approvalBasis } from "@/repositories/quote-revisions";
import { insertVendor } from "@/repositories/vendors";
import { createExpenseFromLines } from "@/domain/expenses";
import { firstSelectableSubcategory } from "@/test/support/quote-subcategory";
import { makePerson, teamIdByName } from "./approvals-fixtures";
import { setupExpenseProject, submitReadyDraft } from "./fixtures/expenses";

// 05-14 Task 1 — 줄에서 지출결의를 만드는 가장자리(EXP-01). 작성 중 문서 하나는 부분 UNIQUE
// (quote_line_id, drafter_id) WHERE number IS NULL AND deleted_at IS NULL + ON CONFLICT DO NOTHING이 최종 판정한다.

const NOT_IN_CURRENT_REVISION = "견적 줄이 현재 차수에 없음 · 견적 줄 바꾸기";
const NO_VENDOR = "거래처 없음 · 거래처 고르기";

async function draftsOn(lineId: string) {
  return db
    .select({ id: expenses.id, drafterId: expenses.drafterId })
    .from(expenses)
    .where(and(eq(expenses.quoteLineId, lineId), isNull(expenses.number), isNull(expenses.deletedAt)));
}

async function linesOf(revisionId: string) {
  return db.select({ id: quoteLines.id, itemName: quoteLines.itemName }).from(quoteLines).where(eq(quoteLines.revisionId, revisionId));
}

async function allDrafts() {
  return db.select({ id: expenses.id }).from(expenses).where(isNull(expenses.number));
}

// 수주중(bidding) 프로젝트 — 1차는 고객 승인 전 그대로. 줄 셋: 거래처 있음 · 거래처 없음 · 취소.
async function setupBiddingProject(pm: Viewer) {
  const client = await insertVendor(SYSTEM_VIEWER, { name: `클라이언트-${randomUUID()}`, normalizedName: `클라이언트-${randomUUID()}` });
  const vendor = await insertVendor(SYSTEM_VIEWER, { name: "조명팀", normalizedName: `조명팀-${randomUUID()}`, defaultEvidenceType: "tax_invoice" });
  const created = await createProject(pm, {
    clientId: client.id,
    teamId: await teamIdByName("기획1팀"),
    pmUserId: pm.id,
    name: "겨울 행사",
    startDate: "2026-11-01",
    endDate: "2026-12-31",
  });
  const revision = await getCurrentQuoteRevision(SYSTEM_VIEWER, created.id ?? "");
  if (!revision || !created.id) throw new Error("프로젝트 · 1차 차수가 없습니다");
  const subcategory = (await firstSelectableSubcategory()).value;
  const row = (itemName: string, vendorId: string | null, lineStatus?: string) => ({
    id: randomUUID(),
    isNew: true as const,
    subcategory,
    itemName,
    vendorId,
    unitPrice: { currency: "KRW" as const, amount: 2_000_000, fxRate: 1 },
    execution: { currency: "KRW" as const, amount: 1_500_000, fxRate: 1 },
    ...(lineStatus ? { lineStatus } : {}),
  });
  const saved = await saveQuoteLines(SYSTEM_VIEWER, revision.id, {
    rows: [row("조명", vendor.id), row("안내 인력", null), row("철회된 무대", vendor.id, "cancelled")],
  });
  const idOf = (itemName: string) => saved.lines.find((line) => line.itemName === itemName)?.id ?? "";
  return { projectId: created.id, lines: { withVendor: idOf("조명"), noVendor: idOf("안내 인력"), cancelled: idOf("철회된 무대") } };
}

describe("두 번 눌러도 하나", () => {
  it("같은 PM이 같은 줄로 연달아 두 번 부르면 같은 expenseId이고 작성 중 행은 하나다", async () => {
    const fx = await setupExpenseProject();
    const first = await createExpenseFromLines(fx.pm, { lineIds: [fx.lines.withVendor] });
    const second = await createExpenseFromLines(fx.pm, { lineIds: [fx.lines.withVendor] });
    expect(second.created).toEqual(first.created);
    expect(first.created).toHaveLength(1);
    expect(await draftsOn(fx.lines.withVendor)).toHaveLength(1);
  });

  it("같은 PM이 같은 줄로 동시에 두 번 부르면(Promise.all) 작성 중 행은 하나이고 두 응답의 expenseId가 같다", async () => {
    const fx = await setupExpenseProject();
    const [a, b] = await Promise.all([
      createExpenseFromLines(fx.pm, { lineIds: [fx.lines.withVendor] }),
      createExpenseFromLines(fx.pm, { lineIds: [fx.lines.withVendor] }),
    ]);
    const drafts = await draftsOn(fx.lines.withVendor);
    expect(drafts).toHaveLength(1);
    expect(a.created).toEqual([{ lineId: fx.lines.withVendor, expenseId: drafts[0]?.id }]);
    expect(b.created).toEqual(a.created);
  });

  it("같은 팀의 다른 PM이 같은 줄로 만들면 그 사람 몫 작성 중 문서가 따로 하나 생긴다", async () => {
    const fx = await setupExpenseProject();
    const mine = await createExpenseFromLines(fx.pm, { lineIds: [fx.lines.withVendor] });
    const theirs = await createExpenseFromLines(fx.otherPm, { lineIds: [fx.lines.withVendor] });
    expect(theirs.created).toHaveLength(1);
    expect(theirs.created[0]?.expenseId).not.toBe(mine.created[0]?.expenseId);
    const drafts = await draftsOn(fx.lines.withVendor);
    expect(drafts.map((row) => row.drafterId).sort()).toEqual([fx.pm.id, fx.otherPm.id].sort());
  });
});

describe("여러 줄", () => {
  it("거래처 있음 · 거래처 없음 · 취소 줄을 한 번에 넘기면 열린 줄만 만들고 막힌 줄은 {lineId, reason}으로 돌아온다", async () => {
    const fx = await setupExpenseProject();
    const bidding = await setupBiddingProject(fx.pm);
    const result = await createExpenseFromLines(fx.pm, {
      lineIds: [bidding.lines.withVendor, bidding.lines.noVendor, bidding.lines.cancelled],
    });
    expect(result.created.map((row) => row.lineId)).toEqual([bidding.lines.withVendor]);
    expect(result.blocked).toEqual([
      { lineId: bidding.lines.noVendor, reason: NO_VENDOR },
      { lineId: bidding.lines.cancelled, reason: NOT_IN_CURRENT_REVISION },
    ]);
    expect(await draftsOn(bidding.lines.noVendor)).toHaveLength(0);
    expect(await draftsOn(bidding.lines.cancelled)).toHaveLength(0);
  });

  it("이전 차수 줄 id는 `견적 줄이 현재 차수에 없음`으로 막히고 현재 차수 줄은 만들어진다", async () => {
    const fx = await setupExpenseProject();
    const second = await createRevisionFromCurrent(fx.pm, { projectId: fx.projectId, fromRevisionId: fx.revisionId });
    const basis = await approvalBasis(SYSTEM_VIEWER, second.revisionId);
    await setCustomerApproval(fx.pm, second.revisionId, { approvedOn: "2026-09-20", seenTotalKrw: basis.totalKrw, contentToken: basis.contentToken });
    const currentStage = (await linesOf(second.revisionId)).find((line) => line.itemName === "무대 제작")?.id ?? "";

    const result = await createExpenseFromLines(fx.pm, { lineIds: [fx.lines.withVendor, currentStage] });
    expect(result.blocked).toEqual([{ lineId: fx.lines.withVendor, reason: NOT_IN_CURRENT_REVISION }]);
    expect(result.created.map((row) => row.lineId)).toEqual([currentStage]);
    expect(await draftsOn(fx.lines.withVendor)).toHaveLength(0);
  });

  it("분할 없이 제출된 문서가 있는 줄은 그 번호로 막힌다(닫힌 줄)", async () => {
    const fx = await setupExpenseProject();
    const created = await createExpenseFromLines(fx.pm, { lineIds: [fx.lines.withVendor] });
    await submitReadyDraft(fx.pm, created.created[0]?.expenseId ?? "");

    const again = await createExpenseFromLines(fx.otherPm, { lineIds: [fx.lines.withVendor] });
    expect(again.created).toEqual([]);
    expect(again.blocked).toEqual([{ lineId: fx.lines.withVendor, reason: "이 줄에 지출결의 26001-0001 있음 · 지출결의 열기" }]);
    expect(await draftsOn(fx.lines.withVendor)).toHaveLength(0);
  });
});

describe("표 전체 게이트", () => {
  it("진행 · 2차 고객 승인 전 · 설정 켜짐이면 모든 줄이 게이트 문자열 그대로 막히고 작성 중 행은 0이다", async () => {
    const fx = await setupExpenseProject();
    const second = await createRevisionFromCurrent(fx.pm, { projectId: fx.projectId, fromRevisionId: fx.revisionId });
    const lines = (await linesOf(second.revisionId)).map((line) => line.id);

    const result = await createExpenseFromLines(fx.pm, { lineIds: lines });
    expect(result.created).toEqual([]);
    expect(result.blocked).toHaveLength(lines.length);
    expect(new Set(result.blocked.map((row) => row.reason))).toEqual(new Set(["2차 고객 승인 전 · 고객 승인 표시"]));
    expect(await allDrafts()).toHaveLength(0);
  });

  it("설정을 끄면 같은 2차 미승인 줄에서 작성 중 문서가 만들어진다", async () => {
    const fx = await setupExpenseProject();
    const second = await createRevisionFromCurrent(fx.pm, { projectId: fx.projectId, fromRevisionId: fx.revisionId });
    const stage = (await linesOf(second.revisionId)).find((line) => line.itemName === "무대 제작")?.id ?? "";
    await setSettingValue(SYSTEM_VIEWER, PROJECT_CUSTOMER_APPROVAL_GATE, false);

    const result = await createExpenseFromLines(fx.pm, { lineIds: [stage] });
    expect(result.blocked).toEqual([]);
    expect(await draftsOn(stage)).toHaveLength(1);
  });

  it("수주중 프로젝트는 고객 승인 전이어도(설정 켜짐) 작성 중 문서가 만들어진다", async () => {
    const fx = await setupExpenseProject();
    const bidding = await setupBiddingProject(fx.pm);
    const result = await createExpenseFromLines(fx.pm, { lineIds: [bidding.lines.withVendor] });
    expect(result.blocked).toEqual([]);
    expect(await draftsOn(bidding.lines.withVendor)).toHaveLength(1);
  });

  it("완료 프로젝트는 `완료 프로젝트 · 새 지출결의 없음`으로 막히고 작성 중 행은 0이다", async () => {
    const fx = await setupExpenseProject();
    // 진행 → 정산은 종료일(2026-12-31) 다음 날 자동 — 그 뒤 시계로 정산 → 완료(잠금 안 선판정).
    await completeViaApproval(fx.ceo, fx.projectId, { now: () => new Date("2027-01-02T03:00:00Z") });

    const result = await createExpenseFromLines(fx.pm, { lineIds: [fx.lines.withVendor] });
    expect(result.blocked).toEqual([{ lineId: fx.lines.withVendor, reason: "완료 프로젝트 · 새 지출결의 없음" }]);
    expect(await allDrafts()).toHaveLength(0);
  });
});

describe("권리 없음", () => {
  it("`expenses` 쓰기 권한 행이 꺼진 계급이면 권한 오류이고 작성 중 행은 0이다", async () => {
    const fx = await setupExpenseProject();
    await setPermissionCell(SYSTEM_VIEWER, { roleId: DEFAULT_ROLE_ID, menu: "expenses", action: "write", allowed: false });

    await expect(createExpenseFromLines(fx.pm, { lineIds: [fx.lines.withVendor] })).rejects.toBeInstanceOf(ForbiddenError);
    expect(await allDrafts()).toHaveLength(0);
  });

  it("그 프로젝트의 쓰기 권리가 없는 다른 팀 PM이 같은 줄로 부르면 권한 오류이고 작성 중 행은 0이다", async () => {
    const fx = await setupExpenseProject();
    const outsider = await makePerson("타팀PM", DEFAULT_ROLE_ID, "경영관리팀");

    await expect(createExpenseFromLines(outsider, { lineIds: [fx.lines.withVendor] })).rejects.toBeInstanceOf(ForbiddenError);
    expect(await allDrafts()).toHaveLength(0);
  });
});
