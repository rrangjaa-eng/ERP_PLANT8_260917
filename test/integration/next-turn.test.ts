import { describe, expect, it, vi } from "vitest";

// 06-23(E-31): 「내 차례」 Phase 6 원천을 실제 함수 그대로 감싸 호출 수를 센다(approvals-inbox-projection.test.ts 꼴 — 동작은 그대로).
vi.mock("@/domain/payments/targets", async () => {
  const actual = await vi.importActual<typeof import("@/domain/payments/targets")>("@/domain/payments/targets");
  return { ...actual, listAllPaymentTargets: vi.fn(actual.listAllPaymentTargets) };
});
vi.mock("@/domain/purchase-requests", async () => {
  const actual = await vi.importActual<typeof import("@/domain/purchase-requests")>("@/domain/purchase-requests");
  return { ...actual, listPurchaseRequests: vi.fn(actual.listPurchaseRequests) };
});
vi.mock("@/repositories/next-turn", async () => {
  const actual = await vi.importActual<typeof import("@/repositories/next-turn")>("@/repositories/next-turn");
  return {
    ...actual,
    listSettlingProjectsOfPm: vi.fn(actual.listSettlingProjectsOfPm),
    findOldestRequestedPurchaseAt: vi.fn(actual.findOldestRequestedPurchaseAt),
    findCardSlipWaiting: vi.fn(actual.findCardSlipWaiting),
  };
});
// 07.1-17(PF2): 구매 묶음은 목록 전체가 아니라 목록 합계가 쓰는 견적 질의를 부른다 — 호출을 센다.
vi.mock("@/repositories/purchase-requests", async () => {
  const actual = await vi.importActual<typeof import("@/repositories/purchase-requests")>("@/repositories/purchase-requests");
  return { ...actual, listPurchaseRequestEstimates: vi.fn(actual.listPurchaseRequestEstimates) };
});
vi.mock("@/domain/issue-requests", async () => {
  const actual = await vi.importActual<typeof import("@/domain/issue-requests")>("@/domain/issue-requests");
  return { ...actual, summarizeOpenIssueRequests: vi.fn(actual.summarizeOpenIssueRequests) };
});
vi.mock("@/domain/evidence/has-evidence", async () => {
  const actual = await vi.importActual<typeof import("@/domain/evidence/has-evidence")>("@/domain/evidence/has-evidence");
  return { ...actual, hasEvidence: vi.fn(actual.hasEvidence), ownersWithEvidence: vi.fn(actual.ownersWithEvidence) };
});
vi.mock("@/domain/pre-settle-check", async () => {
  const actual = await vi.importActual<typeof import("@/domain/pre-settle-check")>("@/domain/pre-settle-check");
  return {
    ...actual,
    loadPreSettleInputs: vi.fn(actual.loadPreSettleInputs),
    computePreSettleCheck: vi.fn(actual.computePreSettleCheck),
    getPreSettleCheck: vi.fn(actual.getPreSettleCheck),
  };
});

import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { randomBytes, randomUUID } from "node:crypto";
import { approvalInstances, corpCardUsages, evidenceImportBatches, evidenceRecordLinks, evidenceRecords, expenseEvidenceReviews, expensePayments, expenses, files, projects, purchaseRequests, teams } from "@/db/schema";
import { approveDocument, getDocumentKind, listMyBlockedDocuments, listMyInbox, loadKindDetails, registerDocumentKind, rejectDocument, withdrawDocument } from "@/domain/approvals";
import { closeExpense, createExpenseFromLines, EXPENSE_DOCUMENT_KIND, saveExpenseDraft } from "@/domain/expenses";
import { listExpenseEvidenceSignals, pickExpenseEvidenceSignal } from "@/domain/expenses/evidence-signals";
import { hasEvidence, ownersWithEvidence } from "@/domain/evidence/has-evidence";
import { voidEvidence } from "@/domain/evidence";
import { submitLeave } from "@/domain/leave";
import { listNextTurnItems } from "@/domain/next-turn";
import { createVisibleMemo } from "@/domain/approvals";
import { addHistorizedValue } from "@/domain/settings/registry";
import { TAX_VAT_RATE } from "@/domain/settings/keys";
import { DEFAULT_ROLE_ID, TEAM_LEAD_ROLE_ID } from "@/domain/permissions/roles";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { upsertVisibility } from "@/repositories/permissions";
import { NOW_2026 } from "./approvals-fixtures";
import { attachEvidence, makeEvidenceManager, setupExpenseProject, submitReadyDraft, type ExpenseFixture } from "./fixtures/expenses";
import { submitSettlement } from "@/domain/settlements";
import { setupSettlementProject } from "./fixtures/settlements";
import { approvedExpenseWithEvidence, makePaymentManager, setEvidenceRequired } from "./fixtures/payments";
import { addDays } from "@/lib/kst-date";
import { listAllPaymentTargets } from "@/domain/payments/targets";
import { seoulToday } from "@/lib/dates";
import { listPurchaseRequests } from "@/domain/purchase-requests";
import { summarizeOpenIssueRequests } from "@/domain/issue-requests";
import { computePreSettleCheck, getPreSettleCheck, loadPreSettleInputs } from "@/domain/pre-settle-check";
import { findCardSlipWaiting, findOldestRequestedPurchaseAt, listSettlingProjectsOfPm } from "@/repositories/next-turn";
import { listPurchaseRequestEstimates } from "@/repositories/purchase-requests";
import { createProject } from "@/domain/projects";
import { getCurrentQuoteRevision, saveQuoteLines } from "@/domain/quotes/lines";
import { insertRole } from "@/repositories/roles";
import { upsertPermission } from "@/repositories/permissions";
import { insertVendor } from "@/repositories/vendors";
import { insertFile } from "@/repositories/files";
import { createCorpCard } from "@/domain/corp-cards";
import { insertLinkFixture, insertRecordFixture, createCardUsageFixture } from "./fixtures/evidence";
import { insertIssueRequest } from "@/repositories/revenue-issue-requests";
import { firstSelectableSubcategory } from "@/test/support/quote-subcategory";
import { formatKrw } from "@/lib/format-number";
import { CEO_ROLE_ID } from "@/domain/permissions/roles";
import { makePerson } from "./approvals-fixtures";
import type { Viewer } from "@/domain/viewer";

// 05-10 Task 1 — 「내 차례」 공급 함수의 [결재] 갈래와 결재 시트 지출결의 상세(구조 → 투영 → 문자열 행, 증빙 갈래 · 세율 바뀜).
// 판정 · 글자는 전부 종류 요약(nextTurnText · measure)에서 온다 — 함수는 종류 이름으로 분기하지 않는다.

async function submittedExpense(fx: ExpenseFixture, note?: string) {
  const created = await createExpenseFromLines(fx.pm, { lineIds: [fx.lines.withVendor] });
  const expenseId = created.created[0]?.expenseId ?? "";
  if (note) await saveExpenseDraft(fx.pm, { expenseId, expectedVersion: 1, fields: { note } });
  const submitted = await submitReadyDraft(fx.pm, expenseId);
  if (submitted.kind !== "submitted") throw new Error("제출 안 됨");
  return { expenseId, instanceId: submitted.instanceId };
}

describe("listNextTurnItems — [결재]", () => {
  it("팀장(1단 담당)에게 지출결의 한 줄 — 대상 · 상황 · 숫자 · 행동 참조(인스턴스 id · version)", async () => {
    const fx = await setupExpenseProject();
    const { instanceId } = await submittedExpense(fx);

    const items = await listNextTurnItems(fx.lead);

    expect(items).toHaveLength(1);
    const item = items[0];
    expect(item).toMatchObject({
      tag: "결재",
      label: "가을 팝업 · 무대 제작 — 지출결의, 박서연",
      reason: "",
      measureText: "12,400,000",
    });
    expect(item?.key).toBeTruthy();
    expect(item?.approval).toMatchObject({ instanceId, version: 1, kind: EXPENSE_DOCUMENT_KIND });
    expect(item?.action).toEqual({ label: "지출결의 열기", href: item?.approval?.href });
  });

  it("무관한 사람(기안자 · 같은 팀 PM)은 0줄", async () => {
    const fx = await setupExpenseProject();
    await submittedExpense(fx);

    expect(await listNextTurnItems(fx.pm)).toEqual([]);
    expect(await listNextTurnItems(fx.otherPm)).toEqual([]);
  });

  it("연차 담당이면 연차 줄도 — 대상 = 기안자, 상황 = 연차 종류 · 기간, 숫자 = 일수 글자", async () => {
    const fx = await setupExpenseProject();
    await submittedExpense(fx);
    await submitLeave(fx.pm, { kind: "full_day", startDate: "2026-10-06", endDate: "2026-10-06", half: "" }, { now: NOW_2026 });

    const items = await listNextTurnItems(fx.lead);

    expect(items.map((item) => item.label)).toEqual(["가을 팝업 · 무대 제작 — 지출결의, 박서연", "박서연 — 연차 종일 10-06"]);
    expect(items[1]?.measureText).toBe("1일");
    expect(items.every((item) => item.tag === "결재")).toBe(true);
  });
});

describe("결재 시트 상세 — 증빙 갈래 · 세율 바뀜 (05-05 문자열 행에 덧붙임)", () => {
  const LABEL_ORDER = ["프로젝트", "견적 줄", "지급처", "증빙 종류", "공급가액", "지급 예정일", "지급 방식", "증빙", "상세"];
  const uniqueLabels = (rows: { label: string }[]) => [...new Set(rows.map((row) => row.label))];

  it("loadKindDetails와 listMyInbox(withDetails)가 같은 행을 돌려준다 — 증빙 행은 파일 id · 이름 · 크기 · 형식만, 주소 없음", async () => {
    const fx = await setupExpenseProject();
    const { expenseId } = await submittedExpense(fx, "1차 선금");

    const inbox = await listMyInbox(fx.lead, { withDetails: true });
    const rows = inbox.mine[0]?.detail?.rows ?? [];
    expect(uniqueLabels(rows)).toEqual(LABEL_ORDER);

    const evidence = rows.find((row) => row.files);
    expect(evidence).toEqual({
      label: "증빙",
      value: "세금계산서.jpg",
      tone: "default",
      files: [{ id: expect.any(String) as string, name: "세금계산서.jpg", sizeBytes: 212_000, contentType: "image/jpeg" }],
    });
    expect(JSON.stringify(evidence)).not.toMatch(/https?:|objectKey|sha256|url/i);

    const direct = await loadKindDetails(fx.lead, EXPENSE_DOCUMENT_KIND, [expenseId], { visible: createVisibleMemo() });
    expect(direct.get(expenseId)?.rows).toEqual(rows);
  });

  it("(A13) 여러 문서를 한 번에 읽은 상세가 문서마다 따로 읽은 상세와 같다", async () => {
    const fx = await setupExpenseProject();
    const first = await submittedExpense(fx, "1차 선금");
    const created = await createExpenseFromLines(fx.pm, { lineIds: [fx.lines.split] });
    const secondId = created.created[0]?.expenseId ?? "";
    await submitReadyDraft(fx.pm, secondId);

    const together = await loadKindDetails(fx.lead, EXPENSE_DOCUMENT_KIND, [first.expenseId, secondId], { visible: createVisibleMemo() });
    for (const id of [first.expenseId, secondId]) {
      const alone = await loadKindDetails(fx.lead, EXPENSE_DOCUMENT_KIND, [id], { visible: createVisibleMemo() });
      expect(together.get(id)).toEqual(alone.get(id));
      expect(together.get(id)?.rows.length).toBeGreaterThan(0);
    }
  });

  it("증빙이 아직 없는 문서는 증빙 행이 없다", async () => {
    const fx = await setupExpenseProject();
    const created = await createExpenseFromLines(fx.pm, { lineIds: [fx.lines.withVendor] });
    const expenseId = created.created[0]?.expenseId ?? "";
    const direct = await loadKindDetails(fx.pm, EXPENSE_DOCUMENT_KIND, [expenseId], { visible: createVisibleMemo() });
    expect(direct.get(expenseId)?.rows.some((row) => row.files)).toBe(false);
  });

  it("세율이 바뀌면 계산 한 줄 바로 아래에 세율 바뀜 한 줄(warning)", async () => {
    const fx = await setupExpenseProject();
    await addHistorizedValue(SYSTEM_VIEWER, TAX_VAT_RATE, { effectiveFrom: "2026-01-01", value: 0.1 });
    await submittedExpense(fx);
    await addHistorizedValue(SYSTEM_VIEWER, TAX_VAT_RATE, { effectiveFrom: "2026-06-01", value: 0.12 });

    const inbox = await listMyInbox(fx.lead, { withDetails: true });
    const supplyRows = (inbox.mine[0]?.detail?.rows ?? []).filter((row) => row.label === "공급가액");
    expect(supplyRows.map((row) => row.value)).toEqual([
      "12,400,000",
      "부가세 10% 1,240,000 · 지급 총액 13,640,000 · 세금계산서 규칙",
      "세율 바뀜 · 부가세 10% → 12% · 지급 총액 13,640,000 → 13,888,000",
    ]);
    expect(supplyRows[2]?.tone).toBe("warning");
  });

  it("expense.amount 노출을 끈 계급의 결재 담당에게는 어떤 행 문자열에도 금액이 없고 증빙 행은 남는다", async () => {
    const fx = await setupExpenseProject();
    await addHistorizedValue(SYSTEM_VIEWER, TAX_VAT_RATE, { effectiveFrom: "2026-01-01", value: 0.1 });
    await submittedExpense(fx);
    await addHistorizedValue(SYSTEM_VIEWER, TAX_VAT_RATE, { effectiveFrom: "2026-06-01", value: 0.12 });
    await upsertVisibility(SYSTEM_VIEWER, { roleId: TEAM_LEAD_ROLE_ID, infoItem: "expense.amount", visible: false });

    const inbox = await listMyInbox(fx.lead, { withDetails: true });
    const rows = inbox.mine[0]?.detail?.rows ?? [];
    const text = JSON.stringify(rows);
    for (const digits of ["12,400,000", "1,240,000", "13,640,000", "13,888,000", "12400000", "세율 바뀜"]) expect(text).not.toContain(digits);
    expect(uniqueLabels(rows)).toEqual(LABEL_ORDER.filter((label) => label !== "공급가액"));
    expect(rows.some((row) => row.files)).toBe(true);
  });
});

// 05-10 Task 3 — [막힘]: 내가 기안한 문서 중 반려된 것 · 승인 뒤 종류가 막힘으로 알린 것(증빙 무효, G1). 회수 · 작성 중은 줄이 아니다.
describe("listNextTurnItems — [막힘] 반려", () => {
  it("반려된 지출결의 한 줄 — 대상 · `지출결의 반려, {반려자}` · 숫자 · 행동 `지출결의 열기`", async () => {
    const fx = await setupExpenseProject();
    const { expenseId, instanceId } = await submittedExpense(fx);
    await rejectDocument(fx.lead, { instanceId, expectedVersion: 1, reason: "증빙 다시" });

    const items = await listNextTurnItems(fx.pm);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      tag: "막힘",
      label: "가을 팝업 · 무대 제작 — 지출결의 반려, 김도윤",
      reason: "",
      measureText: "12,400,000",
      action: { label: "지출결의 열기", href: `/expenses/${expenseId}` },
    });
    expect(items[0]?.approval).toBeUndefined();
    expect(await listNextTurnItems(fx.otherPm)).toEqual([]);
  });

  it("approval.value 노출을 끈 계급의 기안자에게는 반려 줄에 반려자 이름이 없다 (CSO-05-1)", async () => {
    const fx = await setupExpenseProject();
    const { instanceId } = await submittedExpense(fx);
    await rejectDocument(fx.lead, { instanceId, expectedVersion: 1, reason: "증빙 다시" });
    await upsertVisibility(SYSTEM_VIEWER, { roleId: DEFAULT_ROLE_ID, infoItem: "approval.value", visible: false });

    const items = await listNextTurnItems(fx.pm);

    expect(items).toHaveLength(1);
    expect(items[0]?.label).toMatch(/지출결의 반려$/);
    expect(JSON.stringify(items)).not.toContain("김도윤");
  });

  it("회수한 문서 · 작성 중 문서는 줄이 없다", async () => {
    const fx = await setupExpenseProject();
    const { instanceId } = await submittedExpense(fx);
    await withdrawDocument(fx.pm, { instanceId, expectedVersion: 1 });
    const draft = await createExpenseFromLines(fx.pm, { lineIds: [fx.lines.split] });
    expect(draft.created).toHaveLength(1);

    expect(await listNextTurnItems(fx.pm)).toEqual([]);
  });

  it("반려된 연차도 [막힘] — 행동 `연차 열기`", async () => {
    const fx = await setupExpenseProject();
    const leave = await submitLeave(fx.pm, { kind: "full_day", startDate: "2026-10-06", endDate: "2026-10-06", half: "" }, { now: NOW_2026 });
    await rejectDocument(fx.lead, { instanceId: leave.instanceId, expectedVersion: leave.version, reason: "일정 겹침" });

    const items = await listNextTurnItems(fx.pm);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ tag: "막힘", measureText: "1일", action: { label: "연차 열기", href: expect.stringContaining(leave.leaveId) as string } });
    expect(items[0]?.label).toMatch(/연차 반려, 김도윤$/);
  });
});

async function approvedExpense(fx: ExpenseFixture) {
  const doc = await submittedExpense(fx);
  const first = await approveDocument(fx.lead, { instanceId: doc.instanceId, expectedVersion: 1 });
  await approveDocument(fx.ceo, { instanceId: doc.instanceId, expectedVersion: first.version });
  return doc;
}

async function fileIds(expenseId: string): Promise<string[]> {
  const rows = await db.select().from(files).where(and(eq(files.ownerKind, "expense"), eq(files.ownerId, expenseId))).orderBy(asc(files.createdAt), asc(files.id));
  return rows.map((row) => row.id);
}

describe("증빙 무효 [막힘] (G1)", () => {
  it("승인 문서의 증빙이 무효 처리되면 기안자에게 한 줄 — `증빙 무효` · 숫자 = 공급가액 · 행동 `증빙 올리기` → #evidence, 새 증빙 뒤 사라지고 전부 무효면 다시", async () => {
    const fx = await setupExpenseProject();
    const manager = await makeEvidenceManager();
    const { expenseId } = await approvedExpense(fx);
    expect(await listNextTurnItems(fx.pm)).toEqual([]);

    const [first] = await fileIds(expenseId);
    await voidEvidence(manager, { fileId: first ?? "", reason: "다른 건 영수증" });

    const items = await listNextTurnItems(fx.pm);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      tag: "막힘",
      // 06-23 PN-7: 결재 통과 · 지급 전 · 유일한 파일 무효 = 증빙 0 → 문서마다 신호 하나(PN-6)라 `증빙 없음 · 지급 대기`.
      label: "가을 팝업 · 무대 제작 — 증빙 없음 · 지급 대기",
      reason: "",
      measureText: "12,400,000",
      action: { label: "증빙 올리기", href: `/expenses/${expenseId}#evidence` },
    });
    // 사유 · 처리자는 줄에 싣지 않는다(문서 화면에서 본다).
    expect(JSON.stringify(items)).not.toMatch(/다른 건 영수증|경영지원/);

    // 권한자 · 결재자 · 무관한 사람은 0줄.
    for (const viewer of [manager, fx.lead, fx.ceo, fx.otherPm]) expect(await listNextTurnItems(viewer)).toEqual([]);

    // 기안자가 새 증빙을 올리면 줄이 없다. 살아 있는 파일을 전부 무효로 하면 다시 선다.
    const added = await attachEvidence(fx.pm, expenseId);
    expect(await listNextTurnItems(fx.pm)).toEqual([]);
    await voidEvidence(manager, { fileId: added.id, reason: "다른 건" });
    expect(await listNextTurnItems(fx.pm)).toHaveLength(1);
  });

  it("같은 기안자의 반려 문서가 함께 있으면 반려 줄이 먼저, 종류 함수 blockedAfterApproval은 종류당 한 번만 불린다", async () => {
    const fx = await setupExpenseProject();
    const manager = await makeEvidenceManager();
    const approved = await approvedExpense(fx);
    await voidEvidence(manager, { fileId: (await fileIds(approved.expenseId))[0] ?? "", reason: "다른 건" });
    const rejectedCreated = await createExpenseFromLines(fx.pm, { lineIds: [fx.lines.split] });
    const rejectedId = rejectedCreated.created[0]?.expenseId ?? "";
    const rejectedSubmit = await submitReadyDraft(fx.pm, rejectedId);
    if (rejectedSubmit.kind !== "submitted") throw new Error("제출 안 됨");
    await rejectDocument(fx.lead, { instanceId: rejectedSubmit.instanceId, expectedVersion: 1, reason: "다시" });

    const spy = vi.spyOn(getDocumentKind(EXPENSE_DOCUMENT_KIND), "blockedAfterApproval");
    try {
      const items = await listNextTurnItems(fx.pm);
      expect(items.map((item) => item.label)).toEqual([
        expect.stringMatching(/지출결의 반려, 김도윤$/) as string,
        "가을 팝업 · 무대 제작 — 증빙 없음 · 지급 대기",
      ]);
      expect(spy).toHaveBeenCalledTimes(1);
    } finally {
      spy.mockRestore();
    }
  });
});

describe("증빙 무효 [막힘] — 오래된 승인 문서 (A9 · adversarial F6)", () => {
  it("그 뒤에 승인된 문서가 200건 넘게 쌓여도 오래된 승인 문서의 증빙 무효 줄이 선다", async () => {
    const fx = await setupExpenseProject();
    const manager = await makeEvidenceManager();
    const { expenseId } = await approvedExpense(fx);
    await voidEvidence(manager, { fileId: (await fileIds(expenseId))[0] ?? "", reason: "다른 건" });
    // 더 최근에 처리된 승인 인스턴스 201건(결재 인스턴스 행만 — 도메인 경로로 201건 승인은 느리다). 증빙이 없어 막힘이 아니다.
    const later = new Date(Date.now() + 60_000);
    await db.insert(approvalInstances).values(
      Array.from({ length: 201 }, () => ({
        documentKind: EXPENSE_DOCUMENT_KIND,
        documentId: randomUUID(),
        drafterId: fx.pm.id,
        status: "approved",
        currentRound: 1,
        createdAt: later,
        updatedAt: later,
      })),
    );

    const items = await listNextTurnItems(fx.pm);
    expect(items.map((item) => item.label)).toEqual(["가을 팝업 · 무대 제작 — 증빙 없음 · 지급 대기"]);
  });
});

// 05 /review C6(adversarial F5): 승인 뒤 막힘 후보 거르기는 종류가 준다 — 증빙 무효와 다른 원인으로 막히는 종류가 SQL에서 조용히 빠지지 않는다.
const OTHER_BLOCKED_KIND = "test_next_turn_blocked_other";
registerDocumentKind({
  kind: OTHER_BLOCKED_KIND,
  label: "테스트 막힘",
  loadRouteConfig: () => Promise.resolve({ selfApproval: "skip", steps: [{ enabled: true, roleId: TEAM_LEAD_ROLE_ID, scope: "drafter_team", orgUnitId: "" }] }),
  href: (id) => `/test-blocked/${id}`,
  describeDocuments: () => Promise.resolve(new Map()),
  blockedAfterApproval: (_viewer, ids) => Promise.resolve(new Map(ids.map((id) => [id, { situation: "다른 막힘", actionLabel: "열기", href: `/test-blocked/${id}` }]))),
});

describe("승인 뒤 막힘 — 증빙 말고 다른 원인 (C6 · adversarial F5)", () => {
  it("증빙이 없는 다른 종류의 승인 문서도 종류 함수까지 가서 [막힘]이 된다", async () => {
    const fx = await setupExpenseProject();
    const documentId = randomUUID();
    await db.insert(approvalInstances).values({ documentKind: OTHER_BLOCKED_KIND, documentId, drafterId: fx.pm.id, status: "approved", currentRound: 1 });

    const blocked = await listMyBlockedDocuments(fx.pm);
    expect(blocked.map((item) => [item.kind, item.documentId])).toEqual([[OTHER_BLOCKED_KIND, documentId]]);
  });
});

describe("listNextTurnItems — 정산 결재(05-11)", () => {
  it("대표에게 [결재] `{프로젝트명} — 정산 결재, 박서연` · 숫자 `—`, 반려 뒤 박서연에게 [막힘] `… — 정산 결재 반려, 최대표` · `정산 결재 열기` → 문서 화면", async () => {
    const fx = await setupSettlementProject();
    await submitSettlement(fx.pm, { projectId: fx.projectId });
    const href = `/projects/${fx.projectId}/settlement`;

    const items = await listNextTurnItems(fx.ceo);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ tag: "결재", label: "가을 팝업 — 정산 결재, 박서연", reason: "", measureText: "—", action: { label: "정산 결재 열기", href } });
    const approval = items[0]?.approval;
    if (!approval?.instanceId || approval.version === undefined) throw new Error("결재 참조 없음");

    await rejectDocument(fx.ceo, { instanceId: approval.instanceId, expectedVersion: approval.version, reason: "실행가 확인" });

    expect(await listNextTurnItems(fx.ceo)).toEqual([]);
    const blocked = await listNextTurnItems(fx.pm);
    expect(blocked).toHaveLength(1);
    expect(blocked[0]).toMatchObject({ tag: "막힘", label: "가을 팝업 — 정산 결재 반려, 최대표", measureText: "—", action: { label: "정산 결재 열기", href } });
  });
});

// 06-23 Task 1(S19 · UA-611 · O-15): 지급 권한자 홈에 지급 묶음 한 줄 — 05 공급 함수 뒤에 이어 붙는다. 권한 없는 역할은 원천을 부르지 않는다.
describe("「내 차례」 Phase 6 — 지급 묶음 (06-23)", () => {
  const today = seoulToday();

  async function payerWithTarget() {
    const fx = await setupExpenseProject();
    const payer = await makePaymentManager();
    await upsertVisibility(SYSTEM_VIEWER, { roleId: payer.roleId ?? "", infoItem: "expense.amount", visible: true });
    const approved = await approvedExpenseWithEvidence(fx);
    await db.update(expenses).set({ scheduledPaymentDate: today }).where(eq(expenses.id, approved.expenseId));
    return { fx, payer };
  }

  it("지급 권한자 — [오늘] label `지급 1건` · reason `예정일 지남·오늘 · 확인 전 1건` · 지급 총액 · `지급 대상 보기` → 지급 대상 목록", async () => {
    const { payer } = await payerWithTarget();

    const items = await listNextTurnItems(payer, undefined, { today });

    const payment = items.filter((item) => item.key === "phase6-payment");
    expect(payment).toEqual([
      {
        key: "phase6-payment",
        tag: "오늘",
        label: "지급 1건",
        reason: "예정일 지남·오늘 · 확인 전 1건",
        measureText: "13,640,000",
        action: { label: "지급 대상 보기", href: "/expenses?status=지급 대상" },
      },
    ]);
  });

  it("대표 · 기안 직원 · 팀장 — 지급 줄이 없고 지급 대상 원천을 부르지 않는다", async () => {
    const { fx } = await payerWithTarget();
    vi.mocked(listAllPaymentTargets).mockClear();

    for (const viewer of [fx.ceo, fx.pm, fx.lead]) {
      const items = await listNextTurnItems(viewer, undefined, { today });
      expect(items.filter((item) => item.key === "phase6-payment")).toEqual([]);
    }
    expect(listAllPaymentTargets).toHaveBeenCalledTimes(0);
  });
});

// 06-23 Task 2 — 구매 요청 · 발행 요청 묶음 · PM 완료 전 점검 항목 · 역할 범위(T-06-111) · 조회 수(E-31) · 구매 가장 오래된 날짜 집계(E-54).
type Grant = { menu: string; action: "view" | "write" };

async function roleViewer(name: string, grants: readonly Grant[], infoItems: readonly string[]): Promise<Viewer> {
  const role = await insertRole(SYSTEM_VIEWER, { id: `role-${randomUUID()}`, name: `${name}-${randomUUID().slice(0, 8)}`, workScope: "company", viewScope: "company" });
  for (const grant of grants) await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: grant.menu, action: grant.action, allowed: true });
  for (const infoItem of infoItems) await upsertVisibility(SYSTEM_VIEWER, { roleId: role.id, infoItem, visible: true });
  return makePerson(name, role.id, null);
}

// 경영관리 — 지급 · 구매 · 매출 기록 쓰기(셋 다).
function makeFinanceManager(): Promise<Viewer> {
  return roleViewer(
    "경영관리",
    [
      { menu: "expenses", action: "view" },
      { menu: "expenses.payments", action: "write" },
      { menu: "cards.purchases", action: "write" },
      { menu: "projects", action: "view" },
      { menu: "projects.revenue", action: "view" },
      { menu: "projects.revenue", action: "write" },
    ],
    ["expense.amount", "purchase_request.value", "purchase_request.amount", "project.value", "revenue.issued_amount"],
  );
}

type PurchaseSeed = { requester: { id: string }; status?: "requested" | "purchased" | "cancelled"; amount?: number; createdAt?: Date };

async function seedPurchases(rows: readonly PurchaseSeed[]): Promise<string[]> {
  const inserted = await db
    .insert(purchaseRequests)
    .values(
      rows.map((row) => ({
        number: `TC${randomUUID().slice(0, 8)}`,
        linkKind: "team_cost",
        requestedBy: row.requester.id,
        itemName: "내 차례 물건",
        estimateAmountKrw: row.amount ?? 10_000,
        status: row.status ?? "requested",
        ...(row.status === "purchased" ? { completedBy: row.requester.id, completedAt: new Date() } : {}),
        ...(row.status === "cancelled" ? { cancelledBy: row.requester.id, cancelledAt: new Date(), cancelReason: "취소" } : {}),
        ...(row.createdAt ? { createdAt: row.createdAt } : {}),
      })),
    )
    .returning({ id: purchaseRequests.id });
  return inserted.map((row) => row.id);
}

async function seedIssueRequest(projectId: string, requestedBy: string, desiredIssueDate: string, amount = 10_000_000): Promise<void> {
  await insertIssueRequest(
    SYSTEM_VIEWER,
    { id: randomUUID(), projectId, requestedBy, desiredIssueDate, amountCurrency: "KRW", amountForeignAmount: null, amountFxRate: "1.0000", amountAmountKrw: amount, memo: null },
    db,
  );
}

// 담당 PM의 프로젝트 — 거래처 없는 견적 줄 하나(미매칭 · 매출 미입력이라 완료 전 점검 막힘이 있다). status를 주면 그 상태로 둔다.
async function pmProject(pm: Viewer, name: string, status: "settling" | "in_progress" = "settling"): Promise<string> {
  const client = await insertVendor(SYSTEM_VIEWER, { name: `클라이언트-${randomUUID()}`, normalizedName: `클라이언트-${randomUUID()}` });
  const [team] = await db.select().from(teams).limit(1);
  if (!team) throw new Error("시드된 팀이 없습니다");
  const project = await createProject(SYSTEM_VIEWER, { clientId: client.id, teamId: team.id, pmUserId: pm.id, name, startDate: "2026-01-05", endDate: "2026-03-31" });
  const revision = await getCurrentQuoteRevision(SYSTEM_VIEWER, project.id);
  if (!revision) throw new Error("1차 차수 없음");
  const subcategory = (await firstSelectableSubcategory()).value;
  await saveQuoteLines(SYSTEM_VIEWER, revision.id, {
    rows: [
      {
        id: randomUUID(),
        isNew: true as const,
        subcategory,
        itemName: "무대 제작",
        vendorId: null,
        unitPrice: { currency: "KRW" as const, amount: 2_000_000, fxRate: 1 },
        execution: { currency: "KRW" as const, amount: 1_000_000, fxRate: 1 },
      },
    ],
  });
  await db.update(projects).set({ status }).where(eq(projects.id, project.id));
  return project.id;
}

function phase6Kinds(items: readonly { key: string }[]): string[] {
  return [...new Set(items.filter((item) => item.key.startsWith("phase6-")).map((item) => (item.key.startsWith("phase6-presettle-") ? "phase6-presettle" : item.key)))].sort();
}

const PHASE6_SOURCES = [listAllPaymentTargets, listPurchaseRequests, listPurchaseRequestEstimates, findCardSlipWaiting, findOldestRequestedPurchaseAt, summarizeOpenIssueRequests, listSettlingProjectsOfPm, loadPreSettleInputs, computePreSettleCheck, getPreSettleCheck];

function clearSourceMocks(): void {
  for (const source of PHASE6_SOURCES) vi.mocked(source).mockClear();
}

describe("「내 차례」 Phase 6 — 구매 · 발행 묶음 · PM 점검 · 역할 범위 (06-23)", () => {
  const today = seoulToday();

  // 역할 넷이 한 DB에 함께 있는 세상 — 지급 대상 1 · 구매 신청 1 · 발행 요청 1 · 기안자(PM)의 정산 프로젝트 1.
  async function phase6World() {
    const fx = await setupExpenseProject();
    const manager = await makeFinanceManager();
    const approved = await approvedExpenseWithEvidence(fx);
    await db.update(expenses).set({ scheduledPaymentDate: today }).where(eq(expenses.id, approved.expenseId));
    await seedPurchases([{ requester: fx.otherPm }]);
    const settlingId = await pmProject(fx.pm, "정산 팝업");
    await seedIssueRequest(settlingId, fx.pm.id, "2026-12-30");
    // 대표는 매출 정산 보기만 — 발행 묶음 없음(D-601).
    await upsertPermission(SYSTEM_VIEWER, { roleId: CEO_ROLE_ID, menu: "projects.revenue", action: "view", allowed: true });
    return { fx, manager, settlingId };
  }

  it("역할 넷의 Phase 6 항목 종류 집합 — 경영관리 = 지급 · 구매 · 발행 / PM = 점검 / 기안 직원 · 대표 = 빈 집합", async () => {
    const { fx, manager } = await phase6World();

    expect(phase6Kinds(await listNextTurnItems(manager, undefined, { today }))).toEqual(["phase6-issue", "phase6-payment", "phase6-purchase"]);
    expect(phase6Kinds(await listNextTurnItems(fx.pm, undefined, { today }))).toEqual(["phase6-presettle"]);
    expect(phase6Kinds(await listNextTurnItems(fx.otherPm, undefined, { today }))).toEqual([]);
    expect(phase6Kinds(await listNextTurnItems(fx.ceo, undefined, { today }))).toEqual([]);
  });

  it("권한 없는 역할(대표 · 기안 직원 · PM)은 지급 · 구매 · 발행 원천을 부르지 않는다", async () => {
    const { fx } = await phase6World();
    clearSourceMocks();

    for (const viewer of [fx.ceo, fx.otherPm, fx.pm]) await listNextTurnItems(viewer, undefined, { today });

    expect(listAllPaymentTargets).toHaveBeenCalledTimes(0);
    expect(listPurchaseRequests).toHaveBeenCalledTimes(0);
    expect(listPurchaseRequestEstimates).toHaveBeenCalledTimes(0);
    expect(findCardSlipWaiting).toHaveBeenCalledTimes(0);
    expect(findOldestRequestedPurchaseAt).toHaveBeenCalledTimes(0);
    expect(summarizeOpenIssueRequests).toHaveBeenCalledTimes(0);
  });

  it("신청 51건 — 가장 오래된 날짜는 집계(첫 쪽 밖의 가장 오래된 요청) · 건수 · 합계 = 06-14 목록 서버 합계", async () => {
    const requester = await makePerson("요청자", DEFAULT_ROLE_ID, null);
    const purchaser = await roleViewer("구매담당", [{ menu: "cards.purchases", action: "write" }], ["purchase_request.value", "purchase_request.amount"]);
    // 가장 오래된 신청은 서울 09-18 01:30(UTC 09-17 16:30) — 목록은 최근 순이라 51번째(둘째 쪽)다. 더 오래된 구매 완료 · 취소는 세지 않는다.
    const [oldestId] = await seedPurchases([{ requester, createdAt: new Date("2026-09-17T16:30:00Z"), amount: 7_000 }]);
    await seedPurchases(Array.from({ length: 50 }, () => ({ requester, amount: 1_000 })));
    await seedPurchases([
      { requester, status: "purchased", createdAt: new Date("2026-09-01T00:00:00Z") },
      { requester, status: "cancelled", createdAt: new Date("2026-09-02T00:00:00Z") },
    ]);

    const list = await listPurchaseRequests(purchaser, { status: "requested" });
    expect(list.rows.map((row) => row.id)).not.toContain(oldestId);
    expect(list.totals).toEqual({ count: 51, estimateKrw: 57_000 });

    clearSourceMocks();
    const items = await listNextTurnItems(purchaser, undefined, { today });
    expect(listPurchaseRequests).toHaveBeenCalledTimes(0);
    expect(listPurchaseRequestEstimates).toHaveBeenCalledTimes(1);
    expect(items.filter((item) => item.key === "phase6-purchase")).toEqual([
      {
        key: "phase6-purchase",
        tag: "대기",
        label: "구매 요청 51건",
        reason: "신청 · 가장 오래된 09-18",
        measureText: formatKrw(57_000),
        action: { label: "구매 요청 보기", href: "/cards/purchases" },
      },
    ]);
  });

  it("구매 권한자 — 신청 0건(구매 완료 · 취소만)이면 줄이 없다", async () => {
    const requester = await makePerson("요청자", DEFAULT_ROLE_ID, null);
    const purchaser = await roleViewer("구매담당", [{ menu: "cards.purchases", action: "write" }], ["purchase_request.amount"]);
    await seedPurchases([{ requester, status: "purchased" }, { requester, status: "cancelled" }]);

    expect(await findOldestRequestedPurchaseAt(purchaser)).toBeNull();
    expect((await listNextTurnItems(purchaser, undefined, { today })).filter((item) => item.key === "phase6-purchase")).toEqual([]);
  });

  it("매출 기록 권한자 — 발행 요청 묶음 = summarizeOpenIssueRequests(건수 · 가장 이른 희망일 · 공급가 합), 희망일이 오늘 이전이면 [오늘]", async () => {
    const finance = await roleViewer(
      "매출기록",
      [
        { menu: "projects", action: "view" },
        { menu: "projects.revenue", action: "view" },
        { menu: "projects.revenue", action: "write" },
      ],
      ["project.value", "revenue.issued_amount"],
    );
    const pm = await makePerson("담당", DEFAULT_ROLE_ID, null);
    const projectId = await pmProject(pm, "발행 프로젝트", "in_progress");
    await seedIssueRequest(projectId, pm.id, "2026-10-02", 3_000_000);
    await seedIssueRequest(projectId, pm.id, "2026-09-30", 2_000_000);
    expect(await summarizeOpenIssueRequests(finance)).toEqual({ count: 2, earliestDesiredDate: "2026-09-30", supplyKrw: 5_000_000 });

    const before = await listNextTurnItems(finance, undefined, { today: "2026-09-24" });
    expect(before.filter((item) => item.key === "phase6-issue")).toEqual([
      {
        key: "phase6-issue",
        tag: "대기",
        label: "매출 발행 요청 2건",
        reason: "희망 09-30",
        measureText: "5,000,000",
        action: { label: "발행 요청 보기", href: "/projects/issue-requests" },
      },
    ]);
    const due = await listNextTurnItems(finance, undefined, { today: "2026-09-30" });
    expect(due.find((item) => item.key === "phase6-issue")?.tag).toBe("오늘");
  });

  it("담당 PM — 막힘 있는 정산 프로젝트마다 한 줄 · 건수 = 06-19 점검 막힘 건수, 진행 중 · 남의 정산 프로젝트는 줄 없음", async () => {
    const pm = await makePerson("담당PM", DEFAULT_ROLE_ID, "기획1팀");
    const other = await makePerson("다른PM", DEFAULT_ROLE_ID, "기획1팀");
    const first = await pmProject(pm, "정산 하나");
    const second = await pmProject(pm, "정산 둘");
    await pmProject(pm, "진행 중", "in_progress");
    await pmProject(other, "남의 정산");

    const items = (await listNextTurnItems(pm, undefined, { today })).filter((item) => item.key.startsWith("phase6-presettle-"));

    const expected = await Promise.all(
      [first, second].map(async (id) => ({ id, blocked: (await getPreSettleCheck(pm, id)).blockedCount })),
    );
    expect(expected.every((entry) => entry.blocked > 0)).toBe(true);
    expect(items.map((item) => [item.tag, item.label, item.measureText, item.action.href]).sort()).toEqual(
      [
        ["막힘", `정산 하나 — 완료 전 점검 ${expected[0]?.blocked}건`, "—", `/projects/${first}#pre-settle-check`],
        ["막힘", `정산 둘 — 완료 전 점검 ${expected[1]?.blocked}건`, "—", `/projects/${second}#pre-settle-check`],
      ].sort(),
    );
  });

  it("담당 PM이라도 계급에 프로젝트 보기가 없으면(행 범위 none) 점검 줄이 없다 (06-23 검토 낮음-1)", async () => {
    const pm = await roleViewer("보기없는PM", [], []);
    await pmProject(pm, "보기 없는 정산");

    expect((await listNextTurnItems(pm, undefined, { today })).filter((item) => item.key.startsWith("phase6-presettle-"))).toEqual([]);
    expect(loadPreSettleInputs).not.toHaveBeenCalledWith(pm);
  });

  it("홈 공급 조회 수 — 경영관리 한 번 로드 · 정산 프로젝트 2개의 PM 한 번 로드 (E-31)", async () => {
    const { fx, manager } = await phase6World();
    await pmProject(fx.pm, "정산 둘째");

    clearSourceMocks();
    await listNextTurnItems(manager, undefined, { today });
    expect(listAllPaymentTargets).toHaveBeenCalledTimes(1);
    // 07.1-17(PF2): 목록 전체(행 · 줄 번호 · 붙임 수 · 투영)를 읽지 않고 견적 질의만 한 번.
    expect(listPurchaseRequests).toHaveBeenCalledTimes(0);
    expect(listPurchaseRequestEstimates).toHaveBeenCalledTimes(1);
    expect(listPurchaseRequestEstimates).toHaveBeenCalledWith(manager, { scope: { kind: "all" }, filter: { status: "requested" } });
    expect(findCardSlipWaiting).toHaveBeenCalledTimes(1);
    expect(findOldestRequestedPurchaseAt).toHaveBeenCalledTimes(1);
    expect(summarizeOpenIssueRequests).toHaveBeenCalledTimes(1);
    expect(loadPreSettleInputs).toHaveBeenCalledTimes(0);
    expect(computePreSettleCheck).toHaveBeenCalledTimes(0);

    clearSourceMocks();
    await listNextTurnItems(fx.pm, undefined, { today });
    expect(listSettlingProjectsOfPm).toHaveBeenCalledTimes(1);
    expect(loadPreSettleInputs).toHaveBeenCalledTimes(1);
    expect(computePreSettleCheck).toHaveBeenCalledTimes(2);
    expect(getPreSettleCheck).toHaveBeenCalledTimes(0);
    expect(listAllPaymentTargets).toHaveBeenCalledTimes(0);
  });
});

// 07.1-17 Task 2(PD1 · C-01 · U-11): 전표 대기 — 구매 완료 요청에 딸린 보관되지 않은 카드 사용 중 살아 있는 전표 파일도 증빙 붙임도 없는 것.
describe("「내 차례」 Phase 6 — 전표 대기 줄 (07.1-17 PD1)", () => {
  const today = seoulToday();

  async function holderAndCard() {
    const holder = await makePerson("카드 보유자", DEFAULT_ROLE_ID, "기획1팀");
    const card = await createCorpCard(SYSTEM_VIEWER, { issuer: `카드사-${randomUUID().slice(0, 6)}`, numberLast4: String(1000 + Math.floor(Math.random() * 9000)), label: "전표 대기", kind: "personal", holderUserId: holder.id });
    if (!card.id) throw new Error("카드 없음");
    return { holder, cardId: card.id };
  }

  // 구매 요청(상태 지정) + 그 요청에 딸린 카드 사용 한 건(구매 경로 — `purchase_request_id` 고리). 구매 완료 시각은 지정할 수 있다.
  async function requestWithUsage(opts: { status?: "requested" | "purchased" | "cancelled"; completedAt?: Date; archived?: boolean } = {}) {
    const { holder, cardId } = await holderAndCard();
    const [requestId] = await seedPurchases([{ requester: holder, status: opts.status ?? "purchased" }]);
    if (!requestId) throw new Error("구매 요청 없음");
    if (opts.completedAt) await db.update(purchaseRequests).set({ completedAt: opts.completedAt }).where(eq(purchaseRequests.id, requestId));
    const usage = await createCardUsageFixture(holder, { corpCardId: cardId, usedOn: today, totalKrw: 33_000 });
    await db.update(corpCardUsages).set({ registeredVia: "purchase", purchaseRequestId: requestId, ...(opts.archived ? { archivedAt: new Date(), archivedBy: holder.id } : {}) }).where(eq(corpCardUsages.id, usage.id));
    return { holder, requestId, usageId: usage.id };
  }

  async function slipItems(viewer: Viewer) {
    return (await listNextTurnItems(viewer, undefined, { today })).filter((item) => item.key === "phase6-card-slip");
  }

  async function waitingCount(viewer: Viewer): Promise<number> {
    return (await findCardSlipWaiting(viewer)).count;
  }

  it("구매 완료 셋 — 전표 파일 있음 · 증빙 붙임 있음 · 둘 다 없음 → 대기 1건 · 가장 오래된 날짜 = 그 건의 구매 완료 서울 날짜 · 줄 모양(U-11)", async () => {
    const manager = await makeFinanceManager();
    const before = await waitingCount(manager);
    // 서울 2020-01-01 01:30(UTC 2019-12-31 16:30) — 어느 시험의 구매 완료보다 오래돼 가장 오래된 날짜가 된다.
    const waiting = await requestWithUsage({ completedAt: new Date("2019-12-31T16:30:00Z") });
    const withFile = await requestWithUsage();
    const withLink = await requestWithUsage();
    await insertFile(SYSTEM_VIEWER, { ownerKind: "corp_card_usage", ownerId: withFile.usageId, objectKey: `evidence/${randomUUID()}`, sha256: randomBytes(32).toString("hex"), sizeBytes: 10, contentType: "image/png", originalName: "전표.png", uploadedBy: withFile.holder.id, privateToOwner: false }, db);
    await insertLinkFixture({ recordId: await insertRecordFixture(manager), ownerKind: "corp_card_usage", ownerId: withLink.usageId, attachedBy: manager.id });

    expect(await waitingCount(manager)).toBe(before + 1);
    expect((await findCardSlipWaiting(manager)).oldestCompletedAt).toEqual(new Date("2019-12-31T16:30:00Z"));
    expect(await slipItems(manager)).toEqual([
      {
        key: "phase6-card-slip",
        tag: "대기",
        label: `전표 대기 ${before + 1}건`,
        reason: "결제 완료 · 가장 오래된 01-01",
        measureText: "",
        action: { label: "구매 요청 보기", href: "/cards/purchases" },
      },
    ]);
  });

  it("전표 파일을 지우면(살아 있지 않음) 다시 센다 · 신청됨 · 취소 요청은 세지 않는다", async () => {
    const manager = await makeFinanceManager();
    const before = await waitingCount(manager);
    const target = await requestWithUsage();
    const file = await insertFile(SYSTEM_VIEWER, { ownerKind: "corp_card_usage", ownerId: target.usageId, objectKey: `evidence/${randomUUID()}`, sha256: randomBytes(32).toString("hex"), sizeBytes: 10, contentType: "image/png", originalName: "전표.png", uploadedBy: target.holder.id, privateToOwner: false }, db);
    expect(await waitingCount(manager)).toBe(before);

    await db.update(files).set({ removedAt: new Date() }).where(eq(files.id, file.id));
    expect(await waitingCount(manager)).toBe(before + 1);

    await requestWithUsage({ status: "requested" });
    await requestWithUsage({ status: "cancelled" });
    expect(await waitingCount(manager)).toBe(before + 1);
  });

  it("보관된 카드 사용(전표 · 붙임 없음)은 세지 않는다 — 카드 목록 `listCardUsageRows`와 같은 대상 집합 · 보관을 풀면 다시 센다 (P3 notes-C #2)", async () => {
    const manager = await makeFinanceManager();
    const before = await waitingCount(manager);
    const archived = await requestWithUsage({ archived: true });
    expect(await waitingCount(manager)).toBe(before);

    await db.update(corpCardUsages).set({ archivedAt: null, archivedBy: null }).where(eq(corpCardUsages.id, archived.usageId));
    expect(await waitingCount(manager)).toBe(before + 1);
  });

  it("`cards.purchases` write 없는 사람 → 줄 없음 · 집계 함수를 부르지 않는다 (T-07.1-17-01)", async () => {
    await requestWithUsage();
    const viewer = await roleViewer("구매권한없음", [{ menu: "expenses", action: "view" }], ["purchase_request.value"]);
    vi.mocked(findCardSlipWaiting).mockClear();

    expect(await slipItems(viewer)).toEqual([]);
    expect(findCardSlipWaiting).toHaveBeenCalledTimes(0);
  });

  it("대기가 0건이면 줄이 없고, 구매 요청 줄 바로 다음이 전표 대기 줄이다", async () => {
    const manager = await makeFinanceManager();
    if ((await waitingCount(manager)) === 0) expect(await slipItems(manager)).toEqual([]);
    await requestWithUsage();
    await seedPurchases([{ requester: await makePerson("요청자", DEFAULT_ROLE_ID, null) }]);

    const keys = (await listNextTurnItems(manager, undefined, { today })).map((item) => item.key).filter((key) => key.startsWith("phase6-"));
    expect(keys.indexOf("phase6-card-slip")).toBe(keys.indexOf("phase6-purchase") + 1);
  });
});

// 06-23 Task 3 — 기안자 증빙 신호 하나(B-C8 · H-1 · PN-6) · 승인 뒤 막힘 후보 갈래(E-3 · R-3) · 종결 제외(C10) · 공급 실패(PN-3).
describe("pickExpenseEvidenceSignal — 문서마다 신호 하나(PN-6)", () => {
  it("선결제 16일 경과 + 무효 → `선결제 증빙 16일 경과`", () => {
    expect(pickExpenseEvidenceSignal({ prepaidOverdueDays: 16, missingUnpaid: false, voided: true })).toBe("선결제 증빙 16일 경과");
  });

  it("증빙 없음 · 지급 대기 + 무효 → `증빙 없음 · 지급 대기`", () => {
    expect(pickExpenseEvidenceSignal({ prepaidOverdueDays: null, missingUnpaid: true, voided: true })).toBe("증빙 없음 · 지급 대기");
  });

  it("무효만 → `증빙 무효`", () => {
    expect(pickExpenseEvidenceSignal({ prepaidOverdueDays: null, missingUnpaid: false, voided: true })).toBe("증빙 무효");
  });

  it("셋 다 없으면 신호 없음(기한 전 0일 포함)", () => {
    expect(pickExpenseEvidenceSignal({ prepaidOverdueDays: null, missingUnpaid: false, voided: false })).toBeNull();
    expect(pickExpenseEvidenceSignal({ prepaidOverdueDays: 0, missingUnpaid: false, voided: false })).toBeNull();
  });
});

const SIGNAL_TODAY = "2026-10-13";

// 살아 있는 파일을 지운 표시(removed_at)로 증빙 0을 만든다 — 무효 이력이 없는 증빙 0 결재 통과 문서(제출 게이트 ⑧ 때문에 도메인 경로로는 못 만든다).
async function removeAllFiles(expenseId: string): Promise<void> {
  await db.update(files).set({ removedAt: new Date() }).where(and(eq(files.ownerKind, "expense"), eq(files.ownerId, expenseId)));
}

async function markPaid(expenseId: string, payDate: string, processedBy: string): Promise<void> {
  await db.insert(expensePayments).values({ expenseId, payDate, transferKrw: 13_640_000, payableKrw: 13_640_000, diffKrw: 0, paymentMethod: "transfer", processedBy });
}

async function markPrepaid(expenseId: string): Promise<void> {
  await db.update(expenses).set({ prepaid: true, prepaidReason: "행사장 선입금 요구" }).where(eq(expenses.id, expenseId));
}

async function markWaived(expenseId: string, reviewedBy: string): Promise<void> {
  await db.insert(expenseEvidenceReviews).values({ expenseId, status: "waived", waiveReason: "영수증 분실", reviewedBy });
}

async function signalOf(viewer: Viewer, expenseId: string, today = SIGNAL_TODAY): Promise<string | null> {
  return (await listExpenseEvidenceSignals(viewer, { ids: [expenseId], today })).get(expenseId)?.situation ?? null;
}

describe("listExpenseEvidenceSignals — 기안자 증빙 신호(B-C8 · H-1)", () => {
  it("결재 통과 · 지급 전 · 증빙 필수 on · 살아 있는 파일 0 · 선결제 아님 · 면제 아님 → `증빙 없음 · 지급 대기`", async () => {
    const fx = await setupExpenseProject();
    const { expenseId } = await approvedExpenseWithEvidence(fx);
    await removeAllFiles(expenseId);

    expect(await signalOf(fx.pm, expenseId)).toBe("증빙 없음 · 지급 대기");
  });

  it("유일한 파일을 무효 처리한 지급 전 문서 → `증빙 없음 · 지급 대기` 한 줄(증빙 무효와 두 줄이 아니다)", async () => {
    const fx = await setupExpenseProject();
    const manager = await makeEvidenceManager();
    const { expenseId } = await approvedExpense(fx);
    await voidEvidence(manager, { fileId: (await fileIds(expenseId))[0] ?? "", reason: "다른 건" });

    const signals = await listExpenseEvidenceSignals(fx.pm, { ids: [expenseId], today: SIGNAL_TODAY });
    expect([...signals.values()]).toEqual([{ situation: "증빙 없음 · 지급 대기" }]);
  });

  it("지급 뒤 · 무효 → `증빙 무효`", async () => {
    const fx = await setupExpenseProject();
    const manager = await makeEvidenceManager();
    const { expenseId } = await approvedExpense(fx);
    await markPaid(expenseId, "2026-10-01", fx.ceo.id);
    await voidEvidence(manager, { fileId: (await fileIds(expenseId))[0] ?? "", reason: "다른 건" });

    expect(await signalOf(fx.pm, expenseId)).toBe("증빙 무효");
  });

  it("G-06-I — 증빙 무효 뒤 면제한 지급 전 문서 → 신호 없음", async () => {
    const fx = await setupExpenseProject();
    const manager = await makeEvidenceManager();
    const { expenseId } = await approvedExpense(fx);
    await voidEvidence(manager, { fileId: (await fileIds(expenseId))[0] ?? "", reason: "다른 건" });
    await markWaived(expenseId, manager.id);

    expect(await signalOf(fx.pm, expenseId)).toBeNull();
  });

  it("G-06-I — 증빙 무효 → 면제 → 지급(UAT T26-0002 순서) → 신호 없음", async () => {
    const fx = await setupExpenseProject();
    const manager = await makeEvidenceManager();
    const { expenseId } = await approvedExpense(fx);
    await voidEvidence(manager, { fileId: (await fileIds(expenseId))[0] ?? "", reason: "다른 건" });
    await markWaived(expenseId, manager.id);
    await markPaid(expenseId, "2026-10-01", fx.ceo.id);

    expect(await signalOf(fx.pm, expenseId)).toBeNull();
  });

  it("`확인 전`(증빙 있음 · 확인 기록 없음) → 신호 없음", async () => {
    const fx = await setupExpenseProject();
    const { expenseId } = await approvedExpenseWithEvidence(fx);

    expect(await signalOf(fx.pm, expenseId)).toBeNull();
  });

  it("증빙 필수 off → 신호 없음", async () => {
    const fx = await setupExpenseProject();
    const { expenseId } = await approvedExpenseWithEvidence(fx);
    await removeAllFiles(expenseId);
    await setEvidenceRequired(false);

    expect(await signalOf(fx.pm, expenseId)).toBeNull();
  });

  it("면제 → 신호 없음", async () => {
    const fx = await setupExpenseProject();
    const { expenseId } = await approvedExpenseWithEvidence(fx);
    await removeAllFiles(expenseId);
    await markWaived(expenseId, fx.ceo.id);

    expect(await signalOf(fx.pm, expenseId)).toBeNull();
  });

  it("선결제 · 기한(지급일 + 14일) 16일 경과 · 증빙 0 → `선결제 증빙 16일 경과`", async () => {
    const fx = await setupExpenseProject();
    const { expenseId } = await approvedExpenseWithEvidence(fx);
    await markPrepaid(expenseId);
    await markPaid(expenseId, addDays(SIGNAL_TODAY, -30), fx.ceo.id);
    await removeAllFiles(expenseId);

    expect(await signalOf(fx.pm, expenseId)).toBe("선결제 증빙 16일 경과");
  });

  it("여러 문서 한 번 — 문서마다 신호는 그대로이고 증빙 유무는 묶음 조회 한 번(ownersWithEvidence)이다 (06-23 검토 낮음-3)", async () => {
    const fx = await setupExpenseProject();
    const missing = (await approvedExpenseWithEvidence(fx)).expenseId;
    await removeAllFiles(missing);
    // 한 줄로는 지출결의 하나만 만들어진다 — 문서마다 프로젝트를 따로 둔다(판정은 문서 id만 본다).
    const fx2 = await setupExpenseProject();
    const overdue = (await approvedExpenseWithEvidence(fx2)).expenseId;
    await markPrepaid(overdue);
    await markPaid(overdue, addDays(SIGNAL_TODAY, -30), fx.ceo.id);
    await removeAllFiles(overdue);
    const withEvidence = (await approvedExpenseWithEvidence(await setupExpenseProject())).expenseId;

    vi.mocked(hasEvidence).mockClear();
    vi.mocked(ownersWithEvidence).mockClear();
    const signals = await listExpenseEvidenceSignals(fx.pm, { ids: [missing, overdue, withEvidence], today: SIGNAL_TODAY });

    expect(Object.fromEntries([...signals].map(([id, signal]) => [id, signal.situation]))).toEqual({
      [missing]: "증빙 없음 · 지급 대기",
      [overdue]: "선결제 증빙 16일 경과",
    });
    expect(hasEvidence).toHaveBeenCalledTimes(0);
    expect(ownersWithEvidence).toHaveBeenCalledTimes(1);
  });

  it("선결제 · 기한 전 → 신호 없음", async () => {
    const fx = await setupExpenseProject();
    const { expenseId } = await approvedExpenseWithEvidence(fx);
    await markPrepaid(expenseId);
    await markPaid(expenseId, addDays(SIGNAL_TODAY, -5), fx.ceo.id);
    await removeAllFiles(expenseId);

    expect(await signalOf(fx.pm, expenseId)).toBeNull();
  });
});

// 기안자를 바꾼다 — 같은 프로젝트의 PM(박서연)이 기안자가 아닌 문서(지출결의 · 결재 인스턴스의 기안자 칸만 옮긴다).
async function moveDrafter(expenseId: string, drafterId: string): Promise<void> {
  await db.update(expenses).set({ drafterId }).where(eq(expenses.id, expenseId));
  await db.update(approvalInstances).set({ drafterId }).where(and(eq(approvalInstances.documentKind, EXPENSE_DOCUMENT_KIND), eq(approvalInstances.documentId, expenseId)));
}

describe("「내 차례」 기안자 증빙 줄 — 05 훅 경유 (06-23)", () => {
  it("기안 직원 → 자기 문서의 신호 줄 하나, 같은 프로젝트 PM(기안자 아님) · 경영관리 → 그 줄 없음", async () => {
    const fx = await setupExpenseProject();
    const { expenseId } = await approvedExpenseWithEvidence(fx);
    await removeAllFiles(expenseId);
    await moveDrafter(expenseId, fx.otherPm.id);
    const manager = await makeFinanceManager();

    const mine = await listNextTurnItems(fx.otherPm);
    expect(mine).toEqual([
      {
        key: expect.stringMatching(/^blocked-/) as string,
        tag: "막힘",
        label: "가을 팝업 · 무대 제작 — 증빙 없음 · 지급 대기",
        reason: "",
        measureText: "12,400,000",
        action: { label: "증빙 올리기", href: `/expenses/${expenseId}#evidence` },
      },
    ]);
    for (const viewer of [fx.pm, manager]) {
      expect((await listNextTurnItems(viewer)).filter((item) => item.action.href === `/expenses/${expenseId}#evidence`)).toEqual([]);
    }
  });

  it("유일한 파일을 무효 처리한 지급 전 문서 → 신호 줄 정확히 1개", async () => {
    const fx = await setupExpenseProject();
    const manager = await makeEvidenceManager();
    const { expenseId } = await approvedExpense(fx);
    await voidEvidence(manager, { fileId: (await fileIds(expenseId))[0] ?? "", reason: "다른 건" });

    const lines = (await listNextTurnItems(fx.pm)).filter((item) => item.action.href === `/expenses/${expenseId}#evidence`);
    expect(lines.map((item) => item.label)).toEqual(["가을 팝업 · 무대 제작 — 증빙 없음 · 지급 대기"]);
  });

  it("G-06-I — 증빙 무효 → 면제 → 지급한 문서 → 기안자 「내 차례」에 증빙 줄 0", async () => {
    const fx = await setupExpenseProject();
    const manager = await makeEvidenceManager();
    const { expenseId } = await approvedExpense(fx);
    await voidEvidence(manager, { fileId: (await fileIds(expenseId))[0] ?? "", reason: "다른 건" });
    await markWaived(expenseId, manager.id);
    await markPaid(expenseId, "2026-10-01", fx.ceo.id);

    expect((await listNextTurnItems(fx.pm)).filter((item) => item.action.href === `/expenses/${expenseId}#evidence`)).toEqual([]);
  });

  it("종결한 반려 문서 → 기안자 [막힘] 반려 줄 없음(C10 · 06-28, 반려 문서 50건 미만 — E-47 회귀 메모)", async () => {
    const fx = await setupExpenseProject();
    const { expenseId, instanceId } = await submittedExpense(fx);
    await rejectDocument(fx.lead, { instanceId, expectedVersion: 1, reason: "다시" });
    expect((await listNextTurnItems(fx.pm)).map((item) => item.label)).toEqual([expect.stringMatching(/지출결의 반려, 김도윤$/) as string]);

    const [row] = await db.select({ version: expenses.version }).from(expenses).where(eq(expenses.id, expenseId));
    await closeExpense(fx.pm, { expenseId, expectedVersion: row?.version ?? 0, reason: "업체 취소" });

    expect(await listNextTurnItems(fx.pm)).toEqual([]);
  });

  it("공급 실패 — Phase 6 원천 하나가 던지면 listNextTurnItems가 던진다(빈 목록 · 일부 항목으로 숨기지 않는다)", async () => {
    const manager = await makeFinanceManager();
    vi.mocked(listAllPaymentTargets).mockRejectedValueOnce(new Error("지급 대상 원천 실패"));

    await expect(listNextTurnItems(manager)).rejects.toThrow("지급 대상 원천 실패");
  });
});

// 더 최근에 처리된 승인 인스턴스 n건(결재 인스턴스 행만 · 지출결의 행 없음 — 05 A9와 같은 꼴).
async function laterApprovedInstances(drafterId: string, count: number): Promise<void> {
  const later = new Date(Date.now() + 60_000);
  await db.insert(approvalInstances).values(
    Array.from({ length: count }, () => ({ documentKind: EXPENSE_DOCUMENT_KIND, documentId: randomUUID(), drafterId, status: "approved", currentRound: 1, createdAt: later, updatedAt: later })),
  );
}

// 06.1-12 /review P3-1: 살아 있는 증빙 기록 붙임 한 줄(등록 묶음 → 기록 → 붙임) — 증빙 = 파일 ∨ 살아 있는 기록 붙임.
async function linkRecord(expenseId: string, by: Viewer): Promise<void> {
  const [batch] = await db
    .insert(evidenceImportBatches)
    .values({ format: "hometax-tax-invoice", originalName: "매입 세금계산서.xls", fileSha256: randomBytes(32).toString("hex"), rowCount: 1, registeredCount: 1, skippedDuplicateCount: 0, uploadedBy: by.id })
    .returning({ id: evidenceImportBatches.id });
  if (!batch) throw new Error("등록 묶음 없음");
  const [record] = await db
    .insert(evidenceRecords)
    .values({ batchId: batch.id, format: "hometax-tax-invoice", evidenceType: "tax_invoice", dedupeKey: `test:${randomUUID()}`, issuedOn: "2026-09-20", supplyKrw: 12_400_000, vatKrw: 0, totalKrw: 12_400_000, createdBy: by.id })
    .returning({ id: evidenceRecords.id });
  if (!record) throw new Error("증빙 기록 없음");
  await db.insert(evidenceRecordLinks).values({ evidenceRecordId: record.id, ownerKind: "expense", ownerId: expenseId, attachMode: "registrar", attachedBy: by.id });
}

describe("승인 뒤 막힘 후보 갈래 expense_blocked_after_approval (E-3 · R-3)", () => {
  it("증빙 0 승인 문서가 201번째로 오래돼도 홈에 선다", async () => {
    const fx = await setupExpenseProject();
    const { expenseId } = await approvedExpenseWithEvidence(fx);
    await removeAllFiles(expenseId);
    await laterApprovedInstances(fx.pm.id, 201);

    expect((await listNextTurnItems(fx.pm)).map((item) => item.label)).toEqual(["가을 팝업 · 무대 제작 — 증빙 없음 · 지급 대기"]);
  });

  it("선결제 · 기한 경과 · 증빙 0 문서도 201번째로 오래돼도 홈에 선다", async () => {
    const fx = await setupExpenseProject();
    const { expenseId } = await approvedExpenseWithEvidence(fx);
    await markPrepaid(expenseId);
    await markPaid(expenseId, addDays(seoulToday(), -30), fx.ceo.id);
    await removeAllFiles(expenseId);
    await laterApprovedInstances(fx.pm.id, 201);

    expect((await listNextTurnItems(fx.pm)).map((item) => item.label)).toEqual(["가을 팝업 · 무대 제작 — 선결제 증빙 16일 경과"]);
  });

  it("후보 SQL이 거르는 셋(무효 이력 없음) — 증빙 0 · 면제 / 증빙 0 · 지급 뒤(선결제 아님) / 살아 있는 파일 있음 → 훅에 닿지 않는다", async () => {
    const cases: { name: string; prepare: (fx: ExpenseFixture, expenseId: string) => Promise<void> }[] = [
      { name: "면제", prepare: async (fx, id) => { await removeAllFiles(id); await markWaived(id, fx.ceo.id); } },
      { name: "지급 뒤", prepare: async (fx, id) => { await removeAllFiles(id); await markPaid(id, "2026-10-01", fx.ceo.id); } },
      { name: "살아 있는 파일", prepare: () => Promise.resolve() },
    ];
    for (const entry of cases) {
      const fx = await setupExpenseProject();
      const { expenseId } = await approvedExpenseWithEvidence(fx);
      await entry.prepare(fx, expenseId);
      const spy = vi.spyOn(getDocumentKind(EXPENSE_DOCUMENT_KIND), "blockedAfterApproval");
      try {
        expect(await listNextTurnItems(fx.pm), entry.name).toEqual([]);
        for (const call of spy.mock.calls) expect(call[1], entry.name).not.toContain(expenseId);
      } finally {
        spy.mockRestore();
      }
    }
  });

  it("살아 있는 기록 붙임이 있으면 후보 SQL이 LIMIT 앞에서 거른다 — 기록만(파일 0) / 무효 파일 + 기록 (06.1-12 /review P3-1)", async () => {
    const cases: { name: string; prepare: (fx: ExpenseFixture, expenseId: string) => Promise<void> }[] = [
      { name: "기록만", prepare: async (fx, id) => { await removeAllFiles(id); await linkRecord(id, fx.ceo); } },
      {
        name: "무효 파일 + 기록",
        prepare: async (fx, id) => {
          await voidEvidence(await makeEvidenceManager(), { fileId: (await fileIds(id))[0] ?? "", reason: "다른 건" });
          await linkRecord(id, fx.ceo);
        },
      },
    ];
    for (const entry of cases) {
      const fx = await setupExpenseProject();
      const { expenseId } = await approvedExpense(fx);
      await entry.prepare(fx, expenseId);
      const spy = vi.spyOn(getDocumentKind(EXPENSE_DOCUMENT_KIND), "blockedAfterApproval");
      try {
        expect(await listNextTurnItems(fx.pm), entry.name).toEqual([]);
        for (const call of spy.mock.calls) expect(call[1], entry.name).not.toContain(expenseId);
      } finally {
        spy.mockRestore();
      }
    }
  });

  it("후보 SQL은 (선결제 ∧ 지급 행 있음) ∨ (선결제 아님 ∧ 지급 행 없음)만 훅에 넘긴다 — 지급 전 선결제는 LIMIT 앞에서 빠진다", async () => {
    const cases: { name: string; prepaid: boolean; paid: boolean; candidate: boolean }[] = [
      { name: "지급 전 선결제", prepaid: true, paid: false, candidate: false },
      { name: "지급 뒤 선결제", prepaid: true, paid: true, candidate: true },
      { name: "지급 전 일반", prepaid: false, paid: false, candidate: true },
      { name: "지급 뒤 일반", prepaid: false, paid: true, candidate: false },
    ];
    for (const entry of cases) {
      const fx = await setupExpenseProject();
      const { expenseId } = await approvedExpenseWithEvidence(fx);
      if (entry.prepaid) await markPrepaid(expenseId);
      if (entry.paid) await markPaid(expenseId, addDays(seoulToday(), -30), fx.ceo.id);
      await removeAllFiles(expenseId);
      const spy = vi.spyOn(getDocumentKind(EXPENSE_DOCUMENT_KIND), "blockedAfterApproval");
      try {
        await listNextTurnItems(fx.pm);
        expect(spy.mock.calls.some((call) => call[1].includes(expenseId)), entry.name).toBe(entry.candidate);
      } finally {
        spy.mockRestore();
      }
    }
  });

  it("증빙 필수 off — 후보에 들어도 줄 없음", async () => {
    const fx = await setupExpenseProject();
    const { expenseId } = await approvedExpenseWithEvidence(fx);
    await removeAllFiles(expenseId);
    await setEvidenceRequired(false);
    const spy = vi.spyOn(getDocumentKind(EXPENSE_DOCUMENT_KIND), "blockedAfterApproval");
    try {
      expect(await listNextTurnItems(fx.pm)).toEqual([]);
      expect(spy.mock.calls.some((call) => call[1].includes(expenseId))).toBe(true);
    } finally {
      spy.mockRestore();
    }
  });
});
