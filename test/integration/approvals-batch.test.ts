import { afterEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { approvalInstances, approvalRoutes, approvalSteps } from "@/db/schema";
import { approveDocument, NotCurrentHolderError } from "@/domain/approvals";
import { APPROVAL_BATCH_LIMIT, APPROVAL_BATCH_ROW_FAILED, approveBatch, ApprovalBatchLimitError, BATCH_KIND_EXCLUDED, rejectBatch } from "@/domain/approvals/batch";
import { BATCH_ROW_FAILED } from "@/domain/payments/batch";
import { submitLeave } from "@/domain/leave";
import { requestLeaveCancel } from "@/domain/leave/cancel";
import { createExpenseFromLines } from "@/domain/expenses";
import { submitSettlement } from "@/domain/settlements";
import { TEAM_LEAD_ROLE_ID } from "@/domain/permissions/roles";
import { settlementApprovals } from "@/db/schema";
import type { Viewer } from "@/domain/viewer";
import { log } from "@/lib/log";
import { makePerson, NOW_2026 } from "./approvals-fixtures";
import { setupExpenseProject, submitReadyDraft, type ExpenseFixture } from "./fixtures/expenses";
import { setupSettlementProject } from "./fixtures/settlements";

// 07.2-16(PU15 · 16 · 17 · D-7269 · D-7271 · D-7272): 결재함 일괄 승인 · 반려 — 도메인 래퍼가 행마다 단건 approveDocument /
// rejectDocument를 낙관적 version으로 부른다. 판정 로직 복사 0 · 부분 성공 · 트랜잭션 없음 · 상한 100 · 정산 제외(종류는 서버가 읽음).
// 단건 함수 호출 수를 세고(판정 복사 0 증명) 최종 승인 훅 실패를 흉내 내려고 그 두 함수만 감싼다 — 나머지는 원래 모듈 그대로.
const engine = vi.hoisted(() => ({
  approveCalls: 0,
  rejectCalls: 0,
  failApproveFor: new Set<string>(),
}));
vi.mock("@/domain/approvals", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/domain/approvals")>();
  return {
    ...actual,
    approveDocument: async (...args: Parameters<typeof actual.approveDocument>) => {
      engine.approveCalls += 1;
      // 최종 승인 훅이 던진 엔진 밖 오류 흉내 — 단건 트랜잭션이 롤백된 것과 같은 결과(쓰기 0)로 던진다.
      if (engine.failApproveFor.has(args[1].instanceId)) throw new Error("최종 승인 훅 실패 흉내");
      return actual.approveDocument(...args);
    },
    rejectDocument: async (...args: Parameters<typeof actual.rejectDocument>) => {
      engine.rejectCalls += 1;
      return actual.rejectDocument(...args);
    },
  };
});

const deps = { now: NOW_2026 };
const SEOUL_HHMM = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

afterEach(() => {
  engine.approveCalls = 0;
  engine.rejectCalls = 0;
  engine.failApproveFor.clear();
  leaveDay = 0;
  vi.restoreAllMocks();
});

type Item = { instanceId: string; expectedVersion: number };

async function instanceRow(instanceId: string) {
  const [row] = await db.select().from(approvalInstances).where(eq(approvalInstances.id, instanceId));
  if (!row) throw new Error("인스턴스 없음");
  return row;
}

async function itemOf(instanceId: string): Promise<Item> {
  return { instanceId, expectedVersion: (await instanceRow(instanceId)).version };
}

async function caught(promise: Promise<unknown>): Promise<Error> {
  try {
    await promise;
  } catch (error) {
    return error as Error;
  }
  throw new Error("거부되지 않았다");
}

// 지금 담당이 누구든 people 중 승인할 수 있는 사람이 끝까지 승인한다.
async function approveThrough(people: Viewer[], instanceId: string): Promise<void> {
  for (let guard = 0; guard < 8; guard++) {
    const row = await instanceRow(instanceId);
    if (row.status === "approved") return;
    let moved = false;
    for (const person of people) {
      try {
        await approveDocument(person, { instanceId, expectedVersion: row.version }, deps);
        moved = true;
        break;
      } catch (error) {
        if (!(error instanceof NotCurrentHolderError)) throw error;
      }
    }
    if (!moved) throw new Error("승인할 사람 없음");
  }
  throw new Error("최종 승인에 닿지 않음");
}

async function expenseInstance(fx: ExpenseFixture): Promise<string> {
  const created = await createExpenseFromLines(fx.pm, { lineIds: [fx.lines.withVendor] });
  const submitted = await submitReadyDraft(fx.pm, created.created[0]?.expenseId ?? "");
  if (submitted.kind !== "submitted") throw new Error("제출 안 됨");
  return submitted.instanceId;
}

// 평일 · 공휴일 아닌 날(approvals-concurrency.test.ts T3_DAYS와 같은 줄) — 테스트마다 처음부터 쓴다(DB는 테스트마다 비워진다).
const WEEKDAYS = ["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-09", "2026-11-10", "2026-11-11"];
let leaveDay = 0;
async function leaveInstance(drafter: Viewer): Promise<{ leaveId: string; instanceId: string }> {
  const day = WEEKDAYS[leaveDay++] ?? "";
  return submitLeave(drafter, { kind: "full_day", startDate: day, endDate: day, half: "" }, deps);
}

async function leaveCancelInstance(drafter: Viewer, approvers: Viewer[]): Promise<string> {
  const leave = await leaveInstance(drafter);
  await approveThrough(approvers, leave.instanceId);
  return (await requestLeaveCancel(drafter, { leaveId: leave.leaveId, reason: "일정 바뀜" }, deps)).instanceId;
}

async function settlementInstance(fx: ExpenseFixture): Promise<string> {
  const settlement = await setupSettlementProject({ pm: fx.pm, lead: fx.lead, ceo: fx.ceo }, "겨울 팝업");
  await submitSettlement(fx.pm, { projectId: settlement.projectId });
  const [doc] = await db.select().from(settlementApprovals).where(eq(settlementApprovals.projectId, settlement.projectId));
  if (!doc) throw new Error("정산 결재 문서 없음");
  const [instance] = await db
    .select()
    .from(approvalInstances)
    .where(and(eq(approvalInstances.documentKind, "settlement"), eq(approvalInstances.documentId, doc.id)));
  if (!instance) throw new Error("정산 인스턴스 없음");
  return instance.id;
}

async function rejectReasonsOf(instanceId: string): Promise<(string | null)[]> {
  const rows = await db
    .select({ reason: approvalSteps.reason })
    .from(approvalSteps)
    .innerJoin(approvalRoutes, eq(approvalRoutes.id, approvalSteps.routeId))
    .where(and(eq(approvalRoutes.instanceId, instanceId), eq(approvalSteps.action, "rejected")));
  return rows.map((row) => row.reason);
}

describe("일괄 승인 — 종류 판정 · 부분 성공(D-7269 · D-7271)", () => {
  it("지출결의 · 연차 · 연차 취소 각 1건 → 셋 다 처리 · 정산 결재 섞음 → 정산만 막힘(종류는 서버가 읽음)", async () => {
    const fx = await setupExpenseProject();
    const expense = await expenseInstance(fx);
    const leave = (await leaveInstance(fx.pm)).instanceId;
    const cancel = await leaveCancelInstance(fx.pm, [fx.lead, fx.ceo]);
    const settlement = await settlementInstance(fx);
    const items = [await itemOf(expense), await itemOf(leave), await itemOf(cancel), await itemOf(settlement)];

    engine.approveCalls = 0;
    const result = await approveBatch(fx.lead, items, deps);

    expect([...result.processedIds].sort()).toEqual([expense, leave, cancel].sort());
    expect(result.blocked).toEqual([{ id: settlement, reason: BATCH_KIND_EXCLUDED }]);
    expect(BATCH_KIND_EXCLUDED).toBe("정산 결재 · 건별 승인");
    // 정산은 단건 함수를 부르지 않는다 — 판정 전 종류에서 막힌다.
    expect(engine.approveCalls).toBe(3);
    expect((await instanceRow(settlement)).status).toBe("submitted");
    expect(result.time).toMatch(/^\d{2}:\d{2}$/);
  }, 60000);

  it("다른 계정이 먼저 처리한 건 → 막힘 이유 = 그 단건 호출이 던진 글자 그대로 · 나머지는 처리", async () => {
    const fx = await setupExpenseProject();
    const otherLead = await makePerson("이팀장", TEAM_LEAD_ROLE_ID, "기획1팀");
    const first = (await leaveInstance(fx.pm)).instanceId;
    const second = (await leaveInstance(fx.pm)).instanceId;
    const stale = await itemOf(first);
    await approveDocument(otherLead, stale, deps);
    const expected = (await caught(approveDocument(fx.lead, stale, deps))).message;
    expect(expected).toMatch(/ · 새로 고침$/);

    engine.approveCalls = 0;
    const result = await approveBatch(fx.lead, [stale, await itemOf(second)], deps);

    expect(result.processedIds).toEqual([second]);
    expect(result.blocked).toEqual([{ id: first, reason: expected }]);
  }, 60000);

  it("내 차례가 아닌 건 → `지금 담당이 아님 · 새로 고침`(엔진 판정 그대로) · 같은 id 두 번 → 한 번만 호출", async () => {
    const fx = await setupExpenseProject();
    const leave = (await leaveInstance(fx.pm)).instanceId;
    const item = await itemOf(leave);

    engine.approveCalls = 0;
    const result = await approveBatch(fx.otherPm, [item, item], deps);

    expect(result.processedIds).toEqual([]);
    expect(result.blocked).toEqual([{ id: leave, reason: "지금 담당이 아님 · 새로 고침" }]);
    expect(engine.approveCalls).toBe(1);
    expect((await instanceRow(leave)).version).toBe(item.expectedVersion);
  }, 60000);

  it("엔진 밖 오류(최종 승인 훅 흉내) → 그 행만 `처리 실패 · 새로 고침` + log.warn 1회(id · 오류 이름만) · 나머지 처리", async () => {
    const fx = await setupExpenseProject();
    const broken = (await leaveInstance(fx.pm)).instanceId;
    const fine = (await leaveInstance(fx.pm)).instanceId;
    engine.failApproveFor.add(broken);
    const warn = vi.spyOn(log, "warn");

    const result = await approveBatch(fx.lead, [await itemOf(broken), await itemOf(fine)], deps);

    expect(result.processedIds).toEqual([fine]);
    expect(APPROVAL_BATCH_ROW_FAILED).toBe(BATCH_ROW_FAILED);
    expect(result.blocked).toEqual([{ id: broken, reason: BATCH_ROW_FAILED }]);
    const batchWarns = warn.mock.calls.filter(([event]) => event === "approval.batch_row_failed");
    expect(batchWarns).toEqual([["approval.batch_row_failed", { id: broken, error: "Error" }]]);
  }, 60000);

  it("같은 사용자 두 탭 동시 일괄(같은 3건) → 처리 합 3 · 이중 승인 0 · 진 쪽 이유 = 엔진 충돌 글자", async () => {
    const fx = await setupExpenseProject();
    const ids = [(await leaveInstance(fx.pm)).instanceId, (await leaveInstance(fx.pm)).instanceId, (await leaveInstance(fx.pm)).instanceId];
    const items = await Promise.all(ids.map(itemOf));

    const [a, b] = await Promise.all([approveBatch(fx.lead, items, deps), approveBatch(fx.lead, items, deps)]);

    expect(a.processedIds.length + b.processedIds.length).toBe(3);
    expect([...a.processedIds, ...b.processedIds].sort()).toEqual([...ids].sort());
    for (const blocked of [...a.blocked, ...b.blocked]) {
      const row = await instanceRow(blocked.id);
      expect(blocked.reason).toBe(`김도윤이 ${SEOUL_HHMM.format(row.updatedAt)}에 승인함 · 새로 고침`);
    }
    for (const id of ids) expect((await instanceRow(id)).version).toBe(items[0]!.expectedVersion + 1);
  }, 60000);

  it("101건 → 처리 없이 거부 `100건까지`", async () => {
    const items = Array.from({ length: APPROVAL_BATCH_LIMIT + 1 }, (_, i) => ({
      instanceId: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
      expectedVersion: 1,
    }));
    const fx = await setupExpenseProject();

    const error = await caught(approveBatch(fx.lead, items, deps));

    expect(APPROVAL_BATCH_LIMIT).toBe(100);
    expect(error).toBeInstanceOf(ApprovalBatchLimitError);
    expect(error.message).toBe("100건까지");
    expect(engine.approveCalls).toBe(0);
  }, 60000);
});

describe("일괄 반려 — 한 사유 · 빈 사유 서버 단언(D-7270 · eng r2 D-16)", () => {
  it("세 건을 한 사유로 반려 → 세 문서 모두 같은 사유 글자", async () => {
    const fx = await setupExpenseProject();
    const ids = [await expenseInstance(fx), (await leaveInstance(fx.pm)).instanceId, await leaveCancelInstance(fx.pm, [fx.lead, fx.ceo])];

    const result = await rejectBatch(fx.lead, await Promise.all(ids.map(itemOf)), "  증빙 다시 확인  ", deps);

    expect([...result.processedIds].sort()).toEqual([...ids].sort());
    expect(result.blocked).toEqual([]);
    for (const id of ids) {
      expect((await instanceRow(id)).status).toBe("rejected");
      expect(await rejectReasonsOf(id)).toEqual(["증빙 다시 확인"]);
    }
  }, 60000);

  it.each(["", "   "])("사유 %j → 전부 거부 `사유 없음 · 사유 적기` · 단건 호출 0 · 상태 변경 0", async (reason) => {
    const fx = await setupExpenseProject();
    const leave = (await leaveInstance(fx.pm)).instanceId;
    const item = await itemOf(leave);

    const error = await caught(rejectBatch(fx.lead, [item], reason, deps));

    expect(error.message).toBe("사유 없음 · 사유 적기");
    expect(engine.rejectCalls).toBe(0);
    expect((await instanceRow(leave))).toMatchObject({ status: "submitted", version: item.expectedVersion });
  }, 60000);
});
