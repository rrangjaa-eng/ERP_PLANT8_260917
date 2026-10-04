import { describe, expect, it } from "vitest";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { actionLog, approvalInstances, approvalRoutes, approvalSteps, expenses, settingsHistorized } from "@/db/schema";
import { approveDocument } from "@/domain/approvals";
import { isRouteStepSettingKey } from "@/domain/approvals/route-step-settings";
import { createExpenseFromLines, EXPENSE_DOCUMENT_KIND, getExpense, saveExpenseDraft } from "@/domain/expenses";
import { setupExpenseProject, submitReadyDraft } from "./fixtures/expenses";
import { listMyInbox } from "@/domain/approvals";
import { listLineDoors } from "@/domain/expenses";
import { getDocumentKind } from "@/domain/approvals/kinds";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { TEAM_LEAD_ROLE_ID, createRole } from "@/domain/permissions/roles";
import { upsertVisibility } from "@/repositories/permissions";
import { makePerson } from "./approvals-fixtures";

// 05-03 트레이서 — 견적 줄 하나 → 작성 중(자동 채움) → 임시 저장 → 제출(번호 · 세금 스냅숏 · 결재선 고정) → 팀장 ·
// 대표 승인 → 최종 승인. 가장자리 사례(두 번 제출 · 동시 제출 · 회차 상한 · 거부 문자열)는 05-14가 증명한다.

async function expenseRow(id: string) {
  const [row] = await db.select().from(expenses).where(eq(expenses.id, id));
  if (!row) throw new Error("지출결의 행 없음");
  return row;
}

async function instanceOf(documentId: string) {
  const [row] = await db
    .select()
    .from(approvalInstances)
    .where(and(eq(approvalInstances.documentKind, EXPENSE_DOCUMENT_KIND), eq(approvalInstances.documentId, documentId)));
  return row ?? null;
}

async function stepsOf(instanceId: string) {
  return db
    .select({ round: approvalRoutes.round, stepIndex: approvalSteps.stepIndex, roleId: approvalSteps.roleId, label: approvalSteps.label, action: approvalSteps.action })
    .from(approvalSteps)
    .innerJoin(approvalRoutes, eq(approvalRoutes.id, approvalSteps.routeId))
    .where(eq(approvalRoutes.instanceId, instanceId))
    .orderBy(asc(approvalRoutes.round), asc(approvalSteps.stepIndex));
}

describe("트레이서 — 견적 줄에서 최종 승인까지", () => {
  it("견적 줄 하나 → 작성 중 → 임시 저장 → 제출(26001-0001 · 세금 스냅숏 · 단계 넷) → 팀장 · 대표 승인 → approved · 로그", async () => {
    const fx = await setupExpenseProject();

    // 작성 중 — 자동 채움, 번호 · 인스턴스 없음.
    const created = await createExpenseFromLines(fx.pm, { lineIds: [fx.lines.withVendor] });
    expect(created.blocked).toEqual([]);
    expect(created.created).toHaveLength(1);
    const expenseId = created.created[0]?.expenseId ?? "";
    const draft = await expenseRow(expenseId);
    expect(draft).toMatchObject({
      number: null,
      projectId: fx.projectId,
      quoteLineId: fx.lines.withVendor,
      vendorId: fx.stageOneId,
      evidenceType: "tax_invoice",
      paymentMethod: "bank_transfer",
      supplyCurrency: "KRW",
      supplyAmountKrw: 12_400_000,
      version: 1,
    });
    expect(await instanceOf(expenseId)).toBeNull();
    expect((await getExpense(fx.pm, { expenseId }))?.statusWord).toBe("작성 중");

    // 임시 저장.
    const saved = await saveExpenseDraft(fx.pm, { expenseId, expectedVersion: 1, fields: { note: "1차 선금" } });
    expect(saved.version).toBe(2);
    expect((await expenseRow(expenseId)).note).toBe("1차 선금");

    // 제출 — 번호 · 세금 스냅숏 · 결재선 고정.
    const submitted = await submitReadyDraft(fx.pm, expenseId);
    expect(submitted).toMatchObject({ kind: "submitted", number: `${fx.projectNumber}-0001` });
    expect(fx.projectNumber).toBe("26001");
    const [vatRow] = await db.select().from(settingsHistorized).where(eq(settingsHistorized.key, "tax.vat.rate"));
    const row = await expenseRow(expenseId);
    expect(row.submittedAt).toBeInstanceOf(Date);
    expect(row).toMatchObject({
      number: "26001-0001",
      taxRuleKind: "vat_surcharge",
      taxRate: "0.100000",
      vatKrw: 1_240_000,
      withholdingKrw: 0,
      companyBorneKrw: 0,
      payableKrw: 13_640_000,
      // 시드가 이력형 키의 기본 행(2000-01-01)을 넣는다 — 그 행의 id · 적용일 값 복사.
      taxRateSettingId: vatRow?.id ?? null,
      taxRateEffectiveFrom: vatRow?.effectiveFrom ?? null,
    });
    const instance = await instanceOf(expenseId);
    expect(instance?.status).toBe("submitted");
    const steps = await stepsOf(instance?.id ?? "");
    expect(steps.map((step) => [step.round, step.stepIndex, step.roleId])).toEqual([
      [1, 1, "role-team-lead"],
      [1, 2, "role-division-head"],
      [1, 3, null],
      [1, 4, "role-ceo"],
    ]);
    expect(steps[2]?.label).toBe("경영관리본부");
    expect((await getExpense(fx.pm, { expenseId }))?.statusWord).toBe("결재 중");

    // 팀장 승인 → 2 · 3단 빈 자리 건너뜀 → 대표 승인 → 최종.
    const first = await approveDocument(fx.lead, { instanceId: instance?.id ?? "", expectedVersion: 1 });
    await approveDocument(fx.ceo, { instanceId: instance?.id ?? "", expectedVersion: first.version });
    expect((await instanceOf(expenseId))?.status).toBe("approved");
    expect((await expenseRow(expenseId)).number).toBe("26001-0001");

    // OPS-08 — 제출 · 승인이 핵심 행동 로그에 남는다(엔진이 쓴다, 설정 기본값 그대로).
    const logs = await db.select().from(actionLog).where(eq(actionLog.documentId, expenseId)).orderBy(asc(actionLog.seq));
    const submits = logs.filter((log) => log.actionType === "document_submit");
    const approves = logs.filter((log) => log.actionType === "document_approve");
    expect(submits).toHaveLength(1);
    expect(submits[0]?.detail).toMatchObject({ round: 1, kind: EXPENSE_DOCUMENT_KIND });
    expect(approves.map((log) => log.actorId)).toEqual([fx.lead.id, fx.ceo.id]);
    for (const log of [...submits, ...approves]) {
      expect(log).toMatchObject({ entity: "approval_instance", entityId: instance?.id, documentId: expenseId });
      expect(log.detail).toMatchObject({ kind: EXPENSE_DOCUMENT_KIND });
    }
  });

  it("무관한 기획 PM은 남의 작성 중 지출결의를 볼 수 없다(null → 404)", async () => {
    const fx = await setupExpenseProject();
    const created = await createExpenseFromLines(fx.pm, { lineIds: [fx.lines.withVendor] });
    const expenseId = created.created[0]?.expenseId ?? "";
    expect(await getExpense(fx.otherPm, { expenseId })).toBeNull();
    expect(await getExpense(fx.pm, { expenseId })).not.toBeNull();
  });

  it("지출결의 종류 적재 뒤 결재선 단계 칸 16키는 단계 저장 키이고 자기 승인 키는 아니다(Round 4 D12)", () => {
    for (const step of [1, 2, 3, 4]) {
      for (const field of ["enabled", "role_id", "scope", "org_unit_id"]) {
        expect(isRouteStepSettingKey(`approval_route.expense.step${step}.${field}`)).toBe(true);
      }
    }
    expect(isRouteStepSettingKey("approval_route.expense.self_approval")).toBe(false);
  });
});

// 05-05 C1(plan-checker Round 4) — 지출결의 종류가 04.1 상세 계약 셋(loadDetails → detailDto 투영 → buildDetailRows)을 채워
// 결재함 `내 결재` 항목이 결재 시트 재료(문자열 행)를 갖는다.
describe("결재 시트 상세 — 문자열 행", () => {
  const LABEL_ORDER = ["프로젝트", "견적 줄", "거래처", "증빙 종류", "공급가액", "지급 예정일", "지급 방식", "비고"];
  const uniqueLabels = (rows: { label: string }[]) => [...new Set(rows.map((row) => row.label))];

  it("팀장의 내 결재 항목에 제목 · 부제 · 문자열 행 · 가능 행동이 있고 loadDetails는 한 번만 불린다", async () => {
    const fx = await setupExpenseProject();
    const created = await createExpenseFromLines(fx.pm, { lineIds: [fx.lines.withVendor] });
    const expenseId = created.created[0]?.expenseId ?? "";
    await saveExpenseDraft(fx.pm, { expenseId, expectedVersion: 1, fields: { note: "1차 선금" } });
    await submitReadyDraft(fx.pm, expenseId);

    const def = getDocumentKind(EXPENSE_DOCUMENT_KIND);
    const original = def.loadDetails;
    if (!original) throw new Error("지출결의 종류에 loadDetails가 없음");
    const calls: string[][] = [];
    def.loadDetails = async (viewer, ids, deps) => {
      calls.push(ids);
      return original(viewer, ids, deps);
    };
    let inbox: Awaited<ReturnType<typeof listMyInbox>>;
    try {
      inbox = await listMyInbox(fx.lead, { withDetails: true });
    } finally {
      def.loadDetails = original;
    }

    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual([expenseId]);
    expect(inbox.mine).toHaveLength(1);
    const item = inbox.mine[0];
    expect(item?.actions).toEqual(["approve", "reject"]);
    const detail = item?.detail;
    expect(detail?.title).toBe("지출결의 — 가을 팝업 · 무대 제작");
    expect(detail?.subtitle).toBe("26001-0001 · 박서연");
    expect(uniqueLabels(detail?.rows ?? [])).toEqual(LABEL_ORDER);
    for (const row of detail?.rows ?? []) {
      expect(typeof row.label).toBe("string");
      expect(typeof row.value).toBe("string");
      expect(["default", "muted", "warning"]).toContain(row.tone);
    }
    const valueOf = (label: string) => detail?.rows.filter((row) => row.label === label).map((row) => row.value);
    expect(valueOf("프로젝트")).toEqual(["26001 가을 팝업"]);
    expect(valueOf("견적 줄")).toEqual(["1 무대 제작"]);
    expect(valueOf("거래처")).toEqual(["스테이지원"]);
    expect(valueOf("증빙 종류")).toEqual(["세금계산서"]);
    expect(valueOf("공급가액")).toEqual(["12,400,000", "부가세 10% 1,240,000 · 지급 총액 13,640,000 · 세금계산서 규칙"]);
    expect(valueOf("지급 예정일")).toEqual(["—"]);
    expect(detail?.rows.find((row) => row.label === "지급 예정일")?.tone).toBe("muted");
    expect(valueOf("지급 방식")).toEqual(["계좌이체"]);
    expect(valueOf("비고")).toEqual(["1차 선금"]);
  });

  it("분할 지급 문서는 프로젝트 · 견적 줄 다음에 분할 지급 행(회차)이 선다", async () => {
    const fx = await setupExpenseProject();
    const created = await createExpenseFromLines(fx.pm, { lineIds: [fx.lines.split] });
    const expenseId = created.created[0]?.expenseId ?? "";
    await saveExpenseDraft(fx.pm, { expenseId, expectedVersion: 1, fields: { installment: true, supply: { currency: "KRW", amount: 4_000_000, fxRate: 1 } } });
    await submitReadyDraft(fx.pm, expenseId);
    const inbox = await listMyInbox(fx.lead, { withDetails: true });
    const labels = uniqueLabels(inbox.mine[0]?.detail?.rows ?? []);
    expect(labels.slice(0, 3)).toEqual(["프로젝트", "견적 줄", "분할 지급"]);
    expect(inbox.mine[0]?.detail?.rows.find((row) => row.label === "분할 지급")?.value).toBe("1회차");
  });

  it("expense.amount 노출을 끈 계급의 결재 담당에게는 어떤 행에도 공급가액 · 세액 · 지급 총액이 없다", async () => {
    const fx = await setupExpenseProject();
    const created = await createExpenseFromLines(fx.pm, { lineIds: [fx.lines.withVendor] });
    const expenseId = created.created[0]?.expenseId ?? "";
    await submitReadyDraft(fx.pm, expenseId);
    await upsertVisibility(SYSTEM_VIEWER, { roleId: TEAM_LEAD_ROLE_ID, infoItem: "expense.amount", visible: false });

    const inbox = await listMyInbox(fx.lead, { withDetails: true });
    const detail = inbox.mine[0]?.detail;
    expect(detail).toBeTruthy();
    const text = JSON.stringify(detail);
    for (const digits of ["12,400,000", "1,240,000", "13,640,000", "12400000"]) expect(text).not.toContain(digits);
    expect(detail?.rows.some((row) => row.label === "공급가액")).toBe(false);
    expect(uniqueLabels(detail?.rows ?? [])).toEqual(LABEL_ORDER.filter((label) => label !== "공급가액"));
    expect(inbox.mine[0]?.actions).toEqual(["approve", "reject"]);
  });
});

// 05-05 ④ — 견적 줄 표 행 행동 열의 서버 판정.
describe("listLineDoors — 견적 줄 표 행 행동 열", () => {
  it("쓰기 권한이 있으면 열이 서고 줄마다 문 열림 · 거래처 없음, 내 작성 중 문서 id, 제출 뒤 닫힘 · 가장 최근 문서가 선다", async () => {
    const fx = await setupExpenseProject();
    const before = await listLineDoors(fx.pm, { projectId: fx.projectId });
    expect(before.showColumn).toBe(true);
    expect(before.tableGateReason).toBeNull();
    expect(before.cells[fx.lines.withVendor]).toMatchObject({ state: "open" });
    expect(before.cells[fx.lines.withVendor]?.expenseId).toBeUndefined();
    expect(before.cells[fx.lines.noVendor]).toMatchObject({ state: "no_vendor" });

    const created = await createExpenseFromLines(fx.pm, { lineIds: [fx.lines.withVendor] });
    const expenseId = created.created[0]?.expenseId ?? "";
    const drafting = await listLineDoors(fx.pm, { projectId: fx.projectId });
    expect(drafting.cells[fx.lines.withVendor]).toMatchObject({ state: "open", expenseId });

    await submitReadyDraft(fx.pm, expenseId);
    const submitted = await listLineDoors(fx.pm, { projectId: fx.projectId });
    expect(submitted.cells[fx.lines.withVendor]).toMatchObject({ state: "closed", latestId: expenseId });
    expect(submitted.cells[fx.lines.withVendor]?.expenseId).toBeUndefined();
  });

  it("expenses 쓰기 권한이 없는 계급에는 열이 서지 않는다", async () => {
    const fx = await setupExpenseProject();
    const role = await createRole(SYSTEM_VIEWER, { name: `읽기전용-${Date.now()}` });
    const outsider = await makePerson("권한없음", role.id, "기획1팀");
    const doors = await listLineDoors(outsider, { projectId: fx.projectId });
    expect(doors.showColumn).toBe(false);
    expect(doors.cells).toEqual({});
  });
});
