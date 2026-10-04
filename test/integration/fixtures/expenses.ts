import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { expenses } from "@/db/schema";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { CEO_ROLE_ID, DEFAULT_ROLE_ID, TEAM_LEAD_ROLE_ID } from "@/domain/permissions/roles";
import { insertVendor } from "@/repositories/vendors";
import { approvalBasis } from "@/repositories/quote-revisions";
import { createProject } from "@/domain/projects";
import { getCurrentQuoteRevision, saveQuoteLines } from "@/domain/quotes/lines";
import { setCustomerApproval } from "@/domain/quotes/revisions";
import { changeProjectStatus } from "@/domain/projects/status";
import { submitExpense } from "@/domain/expenses";
import { firstSelectableSubcategory } from "@/test/support/quote-subcategory";
import { makePerson, teamIdByName } from "../approvals-fixtures";

// 05-03 지출결의 통합 픽스처 — 사람 · 발령 · 프로젝트 · 차수 승인 · 견적 줄은 도메인 · 리포지토리 함수로만 만든다
// (SQL 직접 삽입 없음). 기획1팀: 기획 PM 박서연 · 팀장 김도윤 · 무관한 기획 PM, 대표 최대표(팀 없음).
// 경영관리본부에는 사람이 없어 3단은 빈 자리다.

export type ExpenseFixture = {
  pm: Viewer;
  lead: Viewer;
  ceo: Viewer;
  otherPm: Viewer;
  projectId: string;
  projectNumber: string;
  revisionId: string;
  stageOneId: string;
  lines: { withVendor: string; noVendor: string; split: string };
};

export async function setupExpenseProject(): Promise<ExpenseFixture> {
  const pm = await makePerson("박서연", DEFAULT_ROLE_ID, "기획1팀");
  const lead = await makePerson("김도윤", TEAM_LEAD_ROLE_ID, "기획1팀");
  const ceo = await makePerson("최대표", CEO_ROLE_ID, null);
  const otherPm = await makePerson("무관PM", DEFAULT_ROLE_ID, "기획1팀");

  const client = await insertVendor(SYSTEM_VIEWER, { name: `클라이언트-${randomUUID()}`, normalizedName: `클라이언트-${randomUUID()}` });
  const stageOne = await insertVendor(SYSTEM_VIEWER, { name: "스테이지원", normalizedName: `스테이지원-${randomUUID()}`, defaultEvidenceType: "tax_invoice" });

  const project = await createProject(pm, {
    clientId: client.id,
    teamId: await teamIdByName("기획1팀"),
    pmUserId: pm.id,
    name: "가을 팝업",
    startDate: "2026-09-01",
    endDate: "2026-12-31",
  });
  const revision = await getCurrentQuoteRevision(SYSTEM_VIEWER, project.id);
  if (!revision || !project.id || !project.number) throw new Error("프로젝트 · 1차 차수가 없습니다");

  const subcategory = (await firstSelectableSubcategory()).value;
  const line = (itemName: string, vendorId: string | null, executionKrw: number) => ({
    id: randomUUID(),
    isNew: true as const,
    subcategory,
    itemName,
    vendorId,
    unitPrice: { currency: "KRW" as const, amount: executionKrw + 1_000_000, fxRate: 1 },
    execution: { currency: "KRW" as const, amount: executionKrw, fxRate: 1 },
  });
  const saved = await saveQuoteLines(SYSTEM_VIEWER, revision.id, {
    rows: [line("무대 제작", stageOne.id, 12_400_000), line("현장 진행 인력", null, 3_000_000), line("영상 제작(분할)", stageOne.id, 10_000_000)],
  });
  const idOf = (itemName: string) => {
    const found = saved.lines.find((row) => row.itemName === itemName)?.id;
    if (!found) throw new Error(`견적 줄 없음: ${itemName}`);
    return found;
  };

  await changeProjectStatus(lead, project.id, { from: "bidding", to: "in_progress" });
  const basis = await approvalBasis(SYSTEM_VIEWER, revision.id);
  await setCustomerApproval(pm, revision.id, { approvedOn: "2026-09-15", seenTotalKrw: basis.totalKrw, contentToken: basis.contentToken });

  return {
    pm,
    lead,
    ceo,
    otherPm,
    projectId: project.id,
    projectNumber: project.number,
    revisionId: revision.id,
    stageOneId: stageOne.id,
    lines: { withVendor: idOf("무대 제작"), noVendor: idOf("현장 진행 인력"), split: idOf("영상 제작(분할)") },
  };
}

// 제출 도우미 — 지금은 version을 읽어 submitExpense만 부른다. 05-04가 증빙 첨부를 더한다(이 플랜 · 05-14 테스트는
// 이 도우미로만 제출한다).
export async function submitReadyDraft(viewer: Viewer, expenseId: string) {
  const [row] = await db.select({ version: expenses.version }).from(expenses).where(eq(expenses.id, expenseId));
  if (!row) throw new Error("지출결의 없음");
  return submitExpense(viewer, { expenseId, expectedVersion: row.version });
}
