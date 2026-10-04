import { describe, expect, it } from "vitest";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { randomUUID } from "node:crypto";
import { actionLog, approvalInstances, approvalRoutes, approvalSteps, documentCounters, expenses, settingsHistorized } from "@/db/schema";
import { ApprovalConflictError, approveDocument, getApprovalView, rejectDocument } from "@/domain/approvals";
import { listExpenses } from "@/domain/expenses/list";
import { APPROVAL_ROUTE_EXPENSE_STEP2_ROLE_ID } from "@/domain/settings/keys";
import { upsertSimpleValue } from "@/repositories/settings";
import { isRouteStepSettingKey } from "@/domain/approvals/route-step-settings";
import {
  changeExpenseLine,
  createExpenseFromLines,
  deleteExpenseDraft,
  restoreExpenseDraft,
  createTeamExpenseDraft,
  EXPENSE_DOCUMENT_KIND,
  ExpenseConflictError,
  ExpenseNotFoundError,
  ExpenseUndoRefusedError,
  getExpense,
  listExpenseFormOptions,
  saveExpenseDraft,
  submitExpense,
  withdrawExpense,
} from "@/domain/expenses";
import { GateBlockedError } from "@/domain/rules/gate";
import { insertVendor } from "@/repositories/vendors";
import { addApprovedRevision, setupExpenseProject, submitReadyDraft, type ExpenseFixture } from "./fixtures/expenses";
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

  it("1차에 제출한 줄은 2차(계보)에서도 문이 닫혀 지출결의 열기 → 그 문서이고 새 문서를 만들지 않는다(D-66 · UI-SPEC S1)", async () => {
    const fx = await setupExpenseProject();
    const created = await createExpenseFromLines(fx.pm, { lineIds: [fx.lines.withVendor] });
    const expenseId = created.created[0]?.expenseId ?? "";
    const submitted = await submitReadyDraft(fx.pm, expenseId);
    const number = submitted.kind === "submitted" ? submitted.number : "";

    const second = await addApprovedRevision(fx, []);
    const secondLineId = second.lineIds.get("무대 제작") ?? "";
    const doors = await listLineDoors(fx.pm, { projectId: fx.projectId });
    expect(doors.cells[secondLineId]).toMatchObject({ state: "closed", latestId: expenseId });

    const again = await createExpenseFromLines(fx.pm, { lineIds: [secondLineId] });
    expect(again).toEqual({ created: [], blocked: [{ lineId: secondLineId, reason: `이 줄에 지출결의 ${number} 있음 · 지출결의 열기` }] });
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

// 05-09 Task 1 트레이서 — 제출 토스트 `되돌리기`(undo · 차수만 받음) → 고칠 수 있는 문서 → 같은 번호 · 같은 인스턴스 · 차수 2 다시 제출.
// 다시 제출의 expectedVersion은 문서 version, 인스턴스 version은 서버가 잠근 뒤 읽는다(P3-7). 문서 화면 회수만 화면이 본 인스턴스 version을 쓴다.
describe("회수 뒤 같은 번호 다시 제출", () => {
  const SEOUL_HHMM = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

  async function submittedDoc(fx: ExpenseFixture, lineId = fx.lines.withVendor) {
    const created = await createExpenseFromLines(fx.pm, { lineIds: [lineId] });
    const expenseId = created.created[0]?.expenseId ?? "";
    const submitted = await submitReadyDraft(fx.pm, expenseId);
    if (submitted.kind !== "submitted") throw new Error("제출 안 됨");
    return { expenseId, instanceId: submitted.instanceId, number: submitted.number };
  }

  async function countersSnapshot() {
    return (await db.select({ key: documentCounters.counterKey, period: documentCounters.period, value: documentCounters.value }).from(documentCounters)).sort(
      (a, b) => `${a.key}/${a.period}`.localeCompare(`${b.key}/${b.period}`),
    );
  }

  async function logsOf(expenseId: string) {
    return db.select().from(actionLog).where(eq(actionLog.documentId, expenseId)).orderBy(asc(actionLog.seq));
  }

  it("되돌리기(차수 1) → 회수 · 공급가액 고침 → 같은 번호 · 같은 인스턴스 · 차수 2 · 새 스냅숏 · 카운터 불변, 옛 문서 version은 충돌 · 로그", async () => {
    const fx = await setupExpenseProject();
    const { expenseId, instanceId, number } = await submittedDoc(fx);
    expect(number).toBe("26001-0001");
    const counters = await countersSnapshot();

    const undone = await withdrawExpense(fx.pm, { expenseId, undo: true, round: 1 });
    expect(undone.status).toBe("withdrawn");
    expect((await instanceOf(expenseId))?.status).toBe("withdrawn");
    const doc = await getExpense(fx.pm, { expenseId });
    expect(doc?.statusWord).toBe("회수");
    // 고칠 수 있는 폼 재료 — 번호 있는 회수 문서도 견적 줄 실행가 줄을 받는다.
    expect(doc?.executionLines?.length).toBeGreaterThan(0);

    const before = (await expenseRow(expenseId)).version;
    const saved = await saveExpenseDraft(fx.pm, { expenseId, expectedVersion: before, fields: { supply: { currency: "KRW", amount: 10_000_000, fxRate: 1 } } });
    expect(saved.version).toBe(before + 1);

    // 옛 문서 version — 05-03 문서 충돌, 인스턴스 그대로.
    const stale = await submitExpense(fx.pm, { expenseId, expectedVersion: before }).catch((error: unknown) => error);
    expect(stale).toBeInstanceOf(ExpenseConflictError);
    expect((stale as Error).message).toContain("다른 곳에서 저장됨");
    expect(await instanceOf(expenseId)).toMatchObject({ status: "withdrawn", currentRound: 1 });

    const again = await submitExpense(fx.pm, { expenseId, expectedVersion: saved.version });
    expect(again).toMatchObject({ kind: "submitted", number: "26001-0001", instanceId, round: 2 });
    expect(await instanceOf(expenseId)).toMatchObject({ id: instanceId, status: "submitted", currentRound: 2 });
    expect(await expenseRow(expenseId)).toMatchObject({ number: "26001-0001", supplyAmountKrw: 10_000_000, vatKrw: 1_000_000, payableKrw: 11_000_000 });
    expect(await countersSnapshot()).toEqual(counters);
    const steps = await stepsOf(instanceId);
    expect(steps.filter((step) => step.round === 2).map((step) => step.stepIndex)).toEqual([1, 2, 3, 4]);
    expect(steps.filter((step) => step.round === 1)).toHaveLength(4);

    // 다시 제출한 문서는 팀장이 첫 단계부터 승인한다.
    const current = await instanceOf(expenseId);
    const approved = await approveDocument(fx.lead, { instanceId, expectedVersion: current?.version ?? 0 });
    expect(approved.status).toBe("in_review");

    // OPS-08 — 되돌리기 회수 한 행 · 제출 두 행(차수 1 · 2) · 승인 한 행, 모두 결재 인스턴스 항목.
    const logs = await logsOf(expenseId);
    const withdraws = logs.filter((log) => log.actionType === "document_withdraw");
    const submits = logs.filter((log) => log.actionType === "document_submit");
    expect(withdraws).toHaveLength(1);
    expect(withdraws[0]?.detail).toMatchObject({ round: 1 });
    expect(submits.map((log) => (log.detail as { round?: number }).round)).toEqual([1, 2]);
    for (const log of [...withdraws, ...submits]) {
      expect(log).toMatchObject({ entity: "approval_instance", entityId: instanceId, documentId: expenseId });
      expect(log.detail).toMatchObject({ kind: EXPENSE_DOCUMENT_KIND });
    }
  });

  it("팀장 승인 뒤 되돌리기는 처리자 · 시각 · approved로 거부되고, 문서 화면 회수는 화면이 본 인스턴스 version으로만 된다 · 거부는 로그 없음", async () => {
    const fx = await setupExpenseProject();
    const { expenseId, instanceId } = await submittedDoc(fx);
    const approved = await approveDocument(fx.lead, { instanceId, expectedVersion: 1 });

    const late = await withdrawExpense(fx.pm, { expenseId, undo: true, round: 1 }).catch((error: unknown) => error);
    expect(late).toBeInstanceOf(ExpenseUndoRefusedError);
    const detail = (late as ExpenseUndoRefusedError).detail;
    expect(detail).toMatchObject({ actorName: "김도윤", status: "approved" });
    expect(detail.at).toBeInstanceOf(Date);
    expect((late as Error).message).toBe(`김도윤이 ${SEOUL_HHMM.format(detail.at)}에 승인함 · 문서에서 회수`);
    expect(await instanceOf(expenseId)).toMatchObject({ status: "in_review", version: approved.version });

    // 문서 화면 회수 — 승인 전 version이면 04.1 충돌 문구.
    const stale = await withdrawExpense(fx.pm, { expenseId, expectedInstanceVersion: 1 }).catch((error: unknown) => error);
    expect(stale).toBeInstanceOf(ApprovalConflictError);
    expect(await instanceOf(expenseId)).toMatchObject({ status: "in_review", version: approved.version });

    const withdrawn = await withdrawExpense(fx.pm, { expenseId, expectedInstanceVersion: approved.version });
    expect(withdrawn.status).toBe("withdrawn");

    const withdraws = (await logsOf(expenseId)).filter((log) => log.actionType === "document_withdraw");
    expect(withdraws).toHaveLength(1);
    expect(withdraws[0]).toMatchObject({ entity: "approval_instance", entityId: instanceId, actorId: fx.pm.id });
    expect(withdraws[0]?.detail).toMatchObject({ kind: EXPENSE_DOCUMENT_KIND, round: 1 });
  });

  it("팀장 반려 뒤 되돌리기는 `반려함 · 새로 고침`으로 거부된다(상태 rejected)", async () => {
    const fx = await setupExpenseProject();
    const { expenseId, instanceId } = await submittedDoc(fx);
    await rejectDocument(fx.lead, { instanceId, expectedVersion: 1, reason: "금액 확인" });
    const late = await withdrawExpense(fx.pm, { expenseId, undo: true, round: 1 }).catch((error: unknown) => error);
    expect(late).toBeInstanceOf(ExpenseUndoRefusedError);
    const detail = (late as ExpenseUndoRefusedError).detail;
    expect(detail).toMatchObject({ actorName: "김도윤", status: "rejected" });
    expect((late as Error).message).toBe(`김도윤이 ${SEOUL_HHMM.format(detail.at)}에 반려함 · 새로 고침`);
    expect((await instanceOf(expenseId))?.status).toBe("rejected");
    expect((await logsOf(expenseId)).filter((log) => log.actionType === "document_withdraw")).toHaveLength(0);
  });

  it("남의 문서 · 지난 차수의 되돌리기는 회수하지 않는다", async () => {
    const fx = await setupExpenseProject();
    const { expenseId } = await submittedDoc(fx);
    await expect(withdrawExpense(fx.otherPm, { expenseId, undo: true, round: 1 })).rejects.toThrow();
    await expect(withdrawExpense(fx.pm, { expenseId, undo: true, round: 2 })).rejects.toThrow();
    expect((await instanceOf(expenseId))?.status).toBe("submitted");
  });

  it("(F6) 회수된 번호 문서는 다른 프로젝트 줄로 옮기지 못하고 원래 줄의 문은 닫힌 채다 · 같은 프로젝트 줄로는 바뀐다", async () => {
    const fx = await setupExpenseProject();
    const other = await setupExpenseProject();
    const { expenseId } = await submittedDoc(fx);
    await withdrawExpense(fx.pm, { expenseId, undo: true, round: 1 });
    const version = (await expenseRow(expenseId)).version;

    const moved = await changeExpenseLine(fx.pm, { expenseId, lineId: other.lines.withVendor, expectedVersion: version }).catch((error: unknown) => error);
    expect(moved).toBeInstanceOf(GateBlockedError);
    expect((moved as Error).message).toBe("번호 있는 문서 · 같은 프로젝트 줄만");
    expect(await expenseRow(expenseId)).toMatchObject({ quoteLineId: fx.lines.withVendor, number: "26001-0001", version });
    const doors = await listLineDoors(fx.pm, { projectId: fx.projectId });
    expect(doors.cells[fx.lines.withVendor]).toMatchObject({ state: "closed", latestId: expenseId });

    const same = await changeExpenseLine(fx.pm, { expenseId, lineId: fx.lines.split, expectedVersion: version });
    expect(same).toEqual({ version: version + 1 });
    expect(await expenseRow(expenseId)).toMatchObject({ quoteLineId: fx.lines.split, number: "26001-0001", projectId: fx.projectId });
  });

  it("(F6) 회수된 팀 비용 문서에는 견적 줄을 줄 수 없다", async () => {
    const fx = await setupExpenseProject();
    const vendor = await insertVendor(SYSTEM_VIEWER, { name: "회식집", normalizedName: `회식집-${randomUUID()}`, defaultEvidenceType: "tax_invoice" });
    const { expenseId } = await createTeamExpenseDraft(fx.pm, {
      idempotencyKey: randomUUID(),
      fields: { teamExpenseKind: "team_overhead", usageDate: "2026-09-26", content: "팀 회식" },
    });
    const payment = (await listExpenseFormOptions(fx.pm)).payment[0]?.value ?? null;
    await saveExpenseDraft(fx.pm, {
      expenseId,
      expectedVersion: (await expenseRow(expenseId)).version,
      fields: { vendorId: vendor.id, evidenceType: "tax_invoice", paymentMethod: payment, supply: { currency: "KRW", amount: 440_000, fxRate: 1 } },
    });
    const submitted = await submitReadyDraft(fx.pm, expenseId);
    expect(submitted.kind === "submitted" ? submitted.number : "").toMatch(/^T\d{2}-\d{4}$/);
    await withdrawExpense(fx.pm, { expenseId, undo: true, round: 1 });

    const moved = await changeExpenseLine(fx.pm, { expenseId, lineId: fx.lines.withVendor, expectedVersion: (await expenseRow(expenseId)).version }).catch(
      (error: unknown) => error,
    );
    expect(moved).toBeInstanceOf(GateBlockedError);
    expect((moved as Error).message).toBe("번호 있는 문서 · 같은 프로젝트 줄만");
    expect(await expenseRow(expenseId)).toMatchObject({ projectId: null, quoteLineId: null });
  });
});

// 05-09 Task 2 — 04.1 엔진의 반려 · 본인 승인 · 결재선 고정을 지출결의로 다시 증명하고, 작성 중 삭제 · 되돌리기(복원)를 세운다.
async function draftOf(fx: ExpenseFixture, viewer = fx.pm, lineId = fx.lines.withVendor) {
  const created = await createExpenseFromLines(viewer, { lineIds: [lineId] });
  const expenseId = created.created[0]?.expenseId;
  if (!expenseId) throw new Error(`작성 중 문서 없음: ${JSON.stringify(created.blocked)}`);
  return expenseId;
}

describe("반려 뒤 다시 제출", () => {
  it("팀장 반려(사유) → 기안자 고침 → 같은 번호 · 차수 2 · 차수 1 반려 기록과 사유 보존 · 반려 로그(사유 원문 없음)", async () => {
    const fx = await setupExpenseProject();
    const expenseId = await draftOf(fx);
    const submitted = await submitReadyDraft(fx.pm, expenseId);
    const instanceId = submitted.kind === "submitted" ? submitted.instanceId : "";
    await rejectDocument(fx.lead, { instanceId, expectedVersion: 1, reason: "금액 확인" });
    expect((await getExpense(fx.pm, { expenseId }))?.statusWord).toBe("반려");

    const saved = await saveExpenseDraft(fx.pm, { expenseId, expectedVersion: (await expenseRow(expenseId)).version, fields: { note: "금액 고침" } });
    const again = await submitExpense(fx.pm, { expenseId, expectedVersion: saved.version });
    expect(again).toMatchObject({ kind: "submitted", number: "26001-0001", instanceId, round: 2 });

    const rows = await db
      .select({ round: approvalRoutes.round, stepIndex: approvalSteps.stepIndex, action: approvalSteps.action, reason: approvalSteps.reason, actedBy: approvalSteps.actedBy })
      .from(approvalSteps)
      .innerJoin(approvalRoutes, eq(approvalRoutes.id, approvalSteps.routeId))
      .where(eq(approvalRoutes.instanceId, instanceId))
      .orderBy(asc(approvalRoutes.round), asc(approvalSteps.stepIndex));
    expect(rows.find((row) => row.round === 1 && row.stepIndex === 1)).toMatchObject({ action: "rejected", reason: "금액 확인", actedBy: fx.lead.id });
    expect(rows.filter((row) => row.round === 2).every((row) => row.action === null)).toBe(true);

    const logs = await db.select().from(actionLog).where(eq(actionLog.documentId, expenseId)).orderBy(asc(actionLog.seq));
    const rejects = logs.filter((log) => log.actionType === "document_reject");
    expect(rejects).toHaveLength(1);
    expect(rejects[0]).toMatchObject({ entity: "approval_instance", entityId: instanceId });
    expect(rejects[0]?.detail).toMatchObject({ kind: EXPENSE_DOCUMENT_KIND, round: 1, stepIndex: 1 });
    expect(JSON.stringify(rejects[0]?.detail)).not.toContain("금액 확인");
    const resubmits = logs.filter((log) => log.actionType === "document_submit" && (log.detail as { round?: number }).round === 2);
    expect(resubmits).toHaveLength(1);
    expect(resubmits[0]).toMatchObject({ entity: "approval_instance", entityId: instanceId });
    expect(resubmits[0]?.detail).toMatchObject({ kind: EXPENSE_DOCUMENT_KIND });
  });
});

describe("본인 승인", () => {
  it("팀장이 기안하면 1단 후보는 기안자 한 사람 · 가능 행동 승인 + 회수(반려 없음) · 승인하면 self_approved · 다음 단계로", async () => {
    const fx = await setupExpenseProject();
    // 팀장은 담당 프로젝트가 없어 팀 비용 문서로 기안한다(결재선 판정은 문서 종류의 설정 하나).
    const vendor = await insertVendor(SYSTEM_VIEWER, { name: "회식집", normalizedName: `회식집-${randomUUID()}`, defaultEvidenceType: "tax_invoice" });
    const { expenseId } = await createTeamExpenseDraft(fx.lead, {
      idempotencyKey: randomUUID(),
      fields: { teamExpenseKind: "team_overhead", usageDate: "2026-09-26", content: "팀 회식" },
    });
    const payment = (await listExpenseFormOptions(fx.lead)).payment[0]?.value ?? null;
    await saveExpenseDraft(fx.lead, {
      expenseId,
      expectedVersion: (await expenseRow(expenseId)).version,
      fields: { vendorId: vendor.id, evidenceType: "tax_invoice", paymentMethod: payment, supply: { currency: "KRW", amount: 440_000, fxRate: 1 } },
    });
    const submitted = await submitReadyDraft(fx.lead, expenseId);
    const instanceId = submitted.kind === "submitted" ? submitted.instanceId : "";
    const view = await getApprovalView(fx.lead, { kind: EXPENSE_DOCUMENT_KIND, documentId: expenseId });
    expect(view?.actions).toEqual(["approve", "withdraw"]);
    expect(view?.steps?.find((step) => step.state === "current")).toMatchObject({ stepIndex: 1, viewerHolds: true });

    const approved = await approveDocument(fx.lead, { instanceId, expectedVersion: 1 });
    expect(approved.status).toBe("in_review");
    const [step] = await db
      .select({ selfApproved: approvalSteps.selfApproved, action: approvalSteps.action })
      .from(approvalSteps)
      .innerJoin(approvalRoutes, eq(approvalRoutes.id, approvalSteps.routeId))
      .where(and(eq(approvalRoutes.instanceId, instanceId), eq(approvalSteps.stepIndex, 1)));
    expect(step).toEqual({ selfApproved: true, action: "approved" });
    const after = await getApprovalView(fx.lead, { kind: EXPENSE_DOCUMENT_KIND, documentId: expenseId });
    expect(after?.steps?.find((row) => row.stepIndex === 1)).toMatchObject({ state: "approved", selfApproved: true });
    expect(after?.actions).toEqual(["withdraw"]);
  });
});

describe("결재선 고정", () => {
  it("제출 뒤 2단 계급 설정을 바꿔도 제출된 문서의 단계는 그대로, 새 문서와 반려 뒤 다시 제출은 새 설정", async () => {
    const fx = await setupExpenseProject();
    const first = await draftOf(fx);
    const submitted = await submitReadyDraft(fx.pm, first);
    const instanceId = submitted.kind === "submitted" ? submitted.instanceId : "";
    const role = await createRole(SYSTEM_VIEWER, { name: `새2단-${Date.now()}` });
    await upsertSimpleValue(SYSTEM_VIEWER, APPROVAL_ROUTE_EXPENSE_STEP2_ROLE_ID.key, role.id, null);

    const roleOfStep2 = async (id: string, round: number) =>
      (await stepsOf(id)).find((step) => step.round === round && step.stepIndex === 2)?.roleId;
    expect(await roleOfStep2(instanceId, 1)).toBe("role-division-head");

    const second = await draftOf(fx, fx.pm, fx.lines.split);
    const secondSubmitted = await submitReadyDraft(fx.pm, second);
    expect(await roleOfStep2(secondSubmitted.kind === "submitted" ? secondSubmitted.instanceId : "", 1)).toBe(role.id);

    await rejectDocument(fx.lead, { instanceId, expectedVersion: 1, reason: "다시" });
    await submitExpense(fx.pm, { expenseId: first, expectedVersion: (await expenseRow(first)).version });
    expect(await roleOfStep2(instanceId, 1)).toBe("role-division-head");
    expect(await roleOfStep2(instanceId, 2)).toBe(role.id);
  });
});

describe("작성 중 삭제", () => {
  it("deleteExpenseDraft → deleted_at · 목록 · getExpense에서 사라짐 · 로그 → restoreExpenseDraft → 되돌아옴", async () => {
    const fx = await setupExpenseProject();
    const expenseId = await draftOf(fx);
    const deleted = await deleteExpenseDraft(fx.pm, { expenseId, expectedVersion: 1 });
    expect(deleted).toEqual({ expenseId });
    expect((await expenseRow(expenseId)).deletedAt).toBeInstanceOf(Date);
    expect(await getExpense(fx.pm, { expenseId })).toBeNull();
    const ids = (await listExpenses(fx.pm, { status: "all" })).groups.flatMap((group) => group.rows.map((row) => row.id));
    expect(ids).not.toContain(expenseId);
    const logs = await db.select().from(actionLog).where(eq(actionLog.documentId, expenseId));
    expect(logs.filter((log) => log.actionType === "document_delete")).toHaveLength(1);
    expect(logs.find((log) => log.actionType === "document_delete")).toMatchObject({ entity: "expense", entityId: expenseId, actorId: fx.pm.id });

    // 남의 되돌리기는 없는 문서.
    await expect(restoreExpenseDraft(fx.otherPm, { expenseId })).rejects.toBeInstanceOf(ExpenseNotFoundError);
    const restored = await restoreExpenseDraft(fx.pm, { expenseId });
    expect(restored).toEqual({ expenseId });
    expect((await expenseRow(expenseId)).deletedAt).toBeNull();
    expect((await getExpense(fx.pm, { expenseId }))?.statusWord).toBe("작성 중");
    // 복원도 기록이 남는다(T-05-904) — document_update detail.change = "restore".
    const after = await db.select().from(actionLog).where(eq(actionLog.documentId, expenseId));
    const restoreLogs = after.filter((log) => log.actionType === "document_update" && (log.detail as { change?: string }).change === "restore");
    expect(restoreLogs).toHaveLength(1);
    expect(restoreLogs[0]).toMatchObject({ entity: "expense", entityId: expenseId, actorId: fx.pm.id });
  });

  it("옛 version · 남의 문서 · 번호 있는 문서는 지우지 않는다", async () => {
    const fx = await setupExpenseProject();
    const expenseId = await draftOf(fx);
    await saveExpenseDraft(fx.pm, { expenseId, expectedVersion: 1, fields: { note: "고침" } });
    await expect(deleteExpenseDraft(fx.pm, { expenseId, expectedVersion: 1 })).rejects.toBeInstanceOf(ExpenseConflictError);
    await expect(deleteExpenseDraft(fx.otherPm, { expenseId, expectedVersion: 2 })).rejects.toBeInstanceOf(ExpenseNotFoundError);
    expect((await expenseRow(expenseId)).deletedAt).toBeNull();

    const submitted = await submitReadyDraft(fx.pm, expenseId);
    expect(submitted.kind).toBe("submitted");
    await expect(deleteExpenseDraft(fx.pm, { expenseId, expectedVersion: (await expenseRow(expenseId)).version })).rejects.toBeInstanceOf(ExpenseNotFoundError);
    expect(await expenseRow(expenseId)).toMatchObject({ deletedAt: null, number: "26001-0001" });
  });

  it("지운 사이 같은 줄에 새 작성 중 문서가 생겼으면 복원하지 않고 그 문서 id를 돌려준다(부분 UNIQUE)", async () => {
    const fx = await setupExpenseProject();
    const first = await draftOf(fx);
    await deleteExpenseDraft(fx.pm, { expenseId: first, expectedVersion: 1 });
    const second = await draftOf(fx);
    expect(second).not.toBe(first);
    expect(await restoreExpenseDraft(fx.pm, { expenseId: first })).toEqual({ expenseId: second });
    expect((await expenseRow(first)).deletedAt).toBeInstanceOf(Date);
  });
});
