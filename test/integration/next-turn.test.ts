import { describe, expect, it, vi } from "vitest";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { files } from "@/db/schema";
import { approveDocument, getDocumentKind, listMyInbox, loadKindDetails, rejectDocument, withdrawDocument } from "@/domain/approvals";
import { createExpenseFromLines, EXPENSE_DOCUMENT_KIND, saveExpenseDraft } from "@/domain/expenses";
import { voidEvidence } from "@/domain/evidence";
import { submitLeave } from "@/domain/leave";
import { listNextTurnItems } from "@/domain/next-turn";
import { createVisibleMemo } from "@/domain/approvals";
import { addHistorizedValue } from "@/domain/settings/registry";
import { TAX_VAT_RATE } from "@/domain/settings/keys";
import { TEAM_LEAD_ROLE_ID } from "@/domain/permissions/roles";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { upsertVisibility } from "@/repositories/permissions";
import { NOW_2026 } from "./approvals-fixtures";
import { attachEvidence, makeEvidenceManager, setupExpenseProject, submitReadyDraft, type ExpenseFixture } from "./fixtures/expenses";
import { submitSettlement } from "@/domain/settlements";
import { setupSettlementProject } from "./fixtures/settlements";

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
    await submitLeave(fx.pm, { kind: "full_day", startDate: "2026-10-05", endDate: "2026-10-05", half: "" }, { now: NOW_2026 });

    const items = await listNextTurnItems(fx.lead);

    expect(items.map((item) => item.label)).toEqual(["가을 팝업 · 무대 제작 — 지출결의, 박서연", "박서연 — 연차 종일 10-05"]);
    expect(items[1]?.measureText).toBe("1일");
    expect(items.every((item) => item.tag === "결재")).toBe(true);
  });
});

describe("결재 시트 상세 — 증빙 갈래 · 세율 바뀜 (05-05 문자열 행에 덧붙임)", () => {
  const LABEL_ORDER = ["프로젝트", "견적 줄", "거래처", "증빙 종류", "공급가액", "지급 예정일", "지급 방식", "증빙", "비고"];
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
    const leave = await submitLeave(fx.pm, { kind: "full_day", startDate: "2026-10-05", endDate: "2026-10-05", half: "" }, { now: NOW_2026 });
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
      label: "가을 팝업 · 무대 제작 — 증빙 무효",
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
        "가을 팝업 · 무대 제작 — 증빙 무효",
      ]);
      expect(spy).toHaveBeenCalledTimes(1);
    } finally {
      spy.mockRestore();
    }
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
