import { randomBytes, randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { expenses, quoteLines } from "@/db/schema";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { CEO_ROLE_ID, DEFAULT_ROLE_ID, TEAM_LEAD_ROLE_ID } from "@/domain/permissions/roles";
import { insertVendor } from "@/repositories/vendors";
import { insertRole } from "@/repositories/roles";
import { upsertPermission } from "@/repositories/permissions";
import { approvalBasis } from "@/repositories/quote-revisions";
import { createProject } from "@/domain/projects";
import { getCurrentQuoteRevision, saveQuoteLines } from "@/domain/quotes/lines";
import { createRevisionFromCurrent, setCustomerApproval } from "@/domain/quotes/revisions";
import { changeProjectStatus } from "@/domain/projects/status";
import { submitExpense } from "@/domain/expenses";
import { completeEvidenceUpload, requestEvidenceUpload } from "@/domain/evidence";
import { firstSelectableSubcategory } from "@/test/support/quote-subcategory";
import { makePerson, teamIdByName } from "../approvals-fixtures";
import { createMemoryStorage, type MemoryStorage } from "../fakes/memory-storage";

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

// 06.2-08 — 지출결의를 결재 통과까지 낼 수 있는 프로젝트(진행 · 1차 고객 승인 · 거래처 있는 줄 하나) — 시스템 주체가 만들고(다른 팀 PM 지정) 고객 승인은 담당 PM이 한다.
export async function setupApprovedProject(name: string, teamId: string, pm: Viewer, vendorId: string): Promise<{ id: string; lineId: string }> {
  const client = await insertVendor(SYSTEM_VIEWER, { name: `클라이언트-${randomUUID()}`, normalizedName: `클라이언트-${randomUUID()}` });
  const project = await createProject(SYSTEM_VIEWER, { clientId: client.id, teamId, pmUserId: pm.id, name, startDate: "2026-09-01", endDate: "2026-12-31" });
  const revision = await getCurrentQuoteRevision(SYSTEM_VIEWER, project.id);
  if (!revision) throw new Error(`1차 차수 없음: ${name}`);
  const subcategory = (await firstSelectableSubcategory()).value;
  const saved = await saveQuoteLines(SYSTEM_VIEWER, revision.id, {
    rows: [
      {
        id: randomUUID(),
        isNew: true as const,
        subcategory,
        itemName: `${name} 무대`,
        vendorId,
        unitPrice: { currency: "KRW" as const, amount: 13_400_000, fxRate: 1 },
        execution: { currency: "KRW" as const, amount: 12_400_000, fxRate: 1 },
      },
    ],
  });
  const lineId = saved.lines[0]?.id;
  if (!lineId) throw new Error(`견적 줄 없음: ${name}`);
  await changeProjectStatus(SYSTEM_VIEWER, project.id, { from: "bidding", to: "in_progress" });
  const basis = await approvalBasis(SYSTEM_VIEWER, revision.id);
  await setCustomerApproval(pm, revision.id, { approvedOn: "2026-09-15", seenTotalKrw: basis.totalKrw, contentToken: basis.contentToken });
  return { id: project.id, lineId };
}

// 05-04 — 증빙 한 장을 도메인 경로(선언 → 메모리 가짜 PUT → 완료 통보)로 붙인다. sha256은 호출마다 새것이라 다른 문서와
// 중복으로 막히지 않는다. 05-09가 재사용한다.
export async function attachEvidence(
  viewer: Viewer,
  expenseId: string,
  storage: MemoryStorage = createMemoryStorage(),
  file: { size?: number; contentType?: string; sha256?: string; name?: string } = {},
) {
  const declared = {
    size: file.size ?? 212_000,
    contentType: file.contentType ?? "image/jpeg",
    sha256: file.sha256 ?? randomBytes(32).toString("hex"),
    name: file.name ?? "세금계산서.jpg",
  };
  const intent = await requestEvidenceUpload(viewer, { ownerKind: "expense", ownerId: expenseId, ...declared }, { storage });
  storage.put(intent.url, { size: declared.size, contentType: declared.contentType, sha256: declared.sha256 });
  return completeEvidenceUpload(viewer, { intentId: intent.intentId }, { storage });
}

// 05-09 — 테스트 계급 「경영관리」(시드 계급 5종에 없다 — 관리자가 권한표에서 켜는 계급): 전사 업무 범위 · 지출결의 보기 +
// 결재 중 증빙 붙이기(expenses.evidence_attach) · 증빙 무효 처리(expenses.evidence_void) 쓰기. 팀 발령 없음(결재선 단계 담당이 아니다).
export async function makeEvidenceManager(name = "경영지원", perms: { attach?: boolean; void?: boolean } = {}): Promise<Viewer> {
  const role = await insertRole(SYSTEM_VIEWER, { id: `role-${randomUUID()}`, name: `경영관리-${randomUUID().slice(0, 8)}`, workScope: "company" });
  await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "expenses", action: "view", allowed: true });
  if (perms.attach !== false) await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "expenses.evidence_attach", action: "write", allowed: true });
  if (perms.void !== false) await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "expenses.evidence_void", action: "write", allowed: true });
  return makePerson(name, role.id, null);
}

// 제출 도우미 — 증빙 한 장을 붙이고(05-04 게이트 ⑧) version을 읽어 submitExpense를 부른다(05-03 · 05-14 테스트는
// 이 도우미로만 제출한다). deps는 그대로 넘긴다(05-14 경합 사례의 afterLock).
export async function submitReadyDraft(viewer: Viewer, expenseId: string, deps?: Parameters<typeof submitExpense>[2]) {
  await attachEvidence(viewer, expenseId);
  const [row] = await db.select({ version: expenses.version }).from(expenses).where(eq(expenses.id, expenseId));
  if (!row) throw new Error("지출결의 없음");
  return submitExpense(viewer, { expenseId, expectedVersion: row.version }, deps);
}

export type ExtraLine = {
  itemName: string;
  vendorId: string | null;
  execution: { currency: "KRW" | "USD"; amount: number; fxRate: number };
};

// 05-14 — 승인된 1차에는 줄을 더할 수 없다. 2차를 만들어 줄을 더하고 2차를 고객 승인한다(도메인 함수로만).
// 2차 줄 전부(1차에서 복사된 줄 포함)의 이름 → id를 돌려준다.
export async function addApprovedRevision(fx: ExpenseFixture, rows: readonly ExtraLine[]): Promise<{ revisionId: string; lineIds: Map<string, string> }> {
  const second = await createRevisionFromCurrent(fx.pm, { projectId: fx.projectId, fromRevisionId: fx.revisionId });
  const subcategory = (await firstSelectableSubcategory()).value;
  await saveQuoteLines(SYSTEM_VIEWER, second.revisionId, {
    rows: rows.map((row) => ({
      id: randomUUID(),
      isNew: true as const,
      subcategory,
      itemName: row.itemName,
      vendorId: row.vendorId,
      unitPrice: { ...row.execution, amount: row.execution.amount * 2 },
      execution: row.execution,
    })),
  });
  const basis = await approvalBasis(SYSTEM_VIEWER, second.revisionId);
  await setCustomerApproval(fx.pm, second.revisionId, { approvedOn: "2026-09-20", seenTotalKrw: basis.totalKrw, contentToken: basis.contentToken });
  const lines = await db.select({ id: quoteLines.id, itemName: quoteLines.itemName }).from(quoteLines).where(eq(quoteLines.revisionId, second.revisionId));
  return { revisionId: second.revisionId, lineIds: new Map(lines.map((line) => [line.itemName, line.id])) };
}
