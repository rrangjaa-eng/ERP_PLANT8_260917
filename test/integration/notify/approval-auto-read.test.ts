import { and, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { Client } from "pg";
import { describe, expect, it, vi } from "vitest";
import { db } from "@/db/client";
import { approvalRoutes, approvalSteps, notificationLog, notifyTickRuns } from "@/db/schema";
import { approveDocument, rejectDocument, withdrawDocument } from "@/domain/approvals";
import { createExpenseFromLines } from "@/domain/expenses";
import type { ConditionKind } from "@/domain/notify/condition-kinds";
import { approvalWaitingKind } from "@/domain/notify/kinds/approval-waiting";
import { runTick } from "@/domain/notify/tick";
import { DIVISION_HEAD_ROLE_ID, TEAM_LEAD_ROLE_ID } from "@/domain/permissions/roles";
import type { Viewer } from "@/domain/viewer";
import { log } from "@/lib/log";
import { makePerson } from "../approvals-fixtures";
import { setupExpenseProject, submitReadyDraft, type ExpenseFixture } from "../fixtures/expenses";

// 07-14 결재 처리 자동 읽음(N16 · G33 · C-P3-2) + 다음 tick 정리(K25). 결재 차례 알림(approval-waiting · entity approval-step · entityId = 단계 id).
// 2026-10-05 월(대체공휴일) · 08 목 · 17 토.

function at(date: string): () => Date {
  return () => new Date(`${date}T09:00:00+09:00`);
}

async function submitOne(fx: ExpenseFixture, line = fx.lines.withVendor) {
  const created = await createExpenseFromLines(fx.pm, { lineIds: [line] });
  const expenseId = created.created[0]?.expenseId;
  if (!expenseId) throw new Error("지출결의 없음");
  const submitted = await submitReadyDraft(fx.pm, expenseId);
  if (submitted.kind !== "submitted") throw new Error("제출 안 됨");
  await db.update(approvalRoutes).set({ submittedAt: new Date("2026-10-05T10:00:00+09:00") }).where(eq(approvalRoutes.instanceId, submitted.instanceId));
  return { expenseId, instanceId: submitted.instanceId, version: submitted.version };
}

async function waitingRows(entityId?: string) {
  const rows = await db.select().from(notificationLog).where(eq(notificationLog.conditionKind, "approval-waiting")).orderBy(notificationLog.id);
  return entityId === undefined ? rows : rows.filter((row) => row.entityId === entityId);
}

// 두 문서 · 단계 후보 둘(팀장 · 팀장2)에게 결재 차례 1회차(목요일 tick) + 2회차 팀장 자리 행(본부장 — 같은 단계 키, 회차 2).
async function setup() {
  const fx = await setupExpenseProject();
  const second = await makePerson("팀장2", TEAM_LEAD_ROLE_ID, "기획1팀");
  const head = await makePerson("본부장", DIVISION_HEAD_ROLE_ID, "기획1팀");
  const one = await submitOne(fx);
  const two = await submitOne(fx, fx.lines.split);
  await runTick({ conditionKinds: [approvalWaitingKind], now: at("2026-10-08"), emailSender: null });
  const rows = await waitingRows();
  const stepOf = (recipient: Viewer, index: number) => {
    const ids = [...new Set(rows.filter((row) => row.recipientId === recipient.id).map((row) => row.entityId))];
    const id = ids[index];
    if (!id) throw new Error("결재 차례 행 없음");
    return id;
  };
  const stepOne = stepOf(fx.lead, 0);
  const stepTwo = stepOf(fx.lead, 1);
  expect((await waitingRows(stepOne)).map((row) => row.recipientId).sort()).toEqual([fx.lead.id, second.id].sort());
  await db.insert(notificationLog).values({
    conditionKind: "approval-waiting",
    entity: "approval-step",
    entityId: stepOne,
    recipientId: head.id,
    round: 2,
    referenceDate: "2026-10-08",
    message: "결재 차례 · 문서 · 3영업일 · 2회차",
  });
  // 어느 행이 어느 문서인지 — 첫 문서 단계 행을 처리 대상으로 고른다.
  return { fx, second, head, one, two, stepOne, stepTwo };
}

// 처리할 문서 = stepOne이 속한 문서.
function docOf(s: Awaited<ReturnType<typeof setup>>, instanceIds: Map<string, string>) {
  return instanceIds.get(s.stepOne) === s.one.instanceId ? s.one : s.two;
}

async function instanceByStep(stepIds: string[]): Promise<Map<string, string>> {
  const rows = await db
    .select({ stepId: approvalSteps.id, instanceId: approvalRoutes.instanceId })
    .from(approvalSteps)
    .innerJoin(approvalRoutes, eq(approvalRoutes.id, approvalSteps.routeId))
    .where(inArray(approvalSteps.id, stepIds));
  return new Map(rows.map((row) => [row.stepId, row.instanceId]));
}

// 처리된 단계 시각을 목요일(10-08)로 — 다음 단계가 열린 지 3영업일(10-14 수, 10-09 한글날)에 결재 차례 행이 생긴다.
async function actedOnThursday(instanceId: string) {
  const routeIds = (await db.select({ id: approvalRoutes.id }).from(approvalRoutes).where(eq(approvalRoutes.instanceId, instanceId))).map((row) => row.id);
  await db
    .update(approvalSteps)
    .set({ actedAt: new Date("2026-10-08T10:00:00+09:00") })
    .where(and(inArray(approvalSteps.routeId, routeIds), isNotNull(approvalSteps.actedAt)));
}

describe("결재 처리 자동 읽음 (N16 · G33 · C-P3-2)", () => {
  it("단계 후보 하나가 승인하면 같은 트랜잭션에서 그 단계 행이 받는 사람 모두(후보 둘 · 2회차 팀장) 읽음 · 다른 단계 행은 그대로", async () => {
    const s = await setup();
    const doc = docOf(s, await instanceByStep([s.stepOne, s.stepTwo]));
    await approveDocument(s.second, { instanceId: doc.instanceId, expectedVersion: doc.version });
    const handled = await waitingRows(s.stepOne);
    expect(handled).toHaveLength(3);
    for (const row of handled) expect(row.readAt).toBeInstanceOf(Date);
    for (const row of await waitingRows(s.stepTwo)) expect(row.readAt).toBeNull();
  });

  it("반려도 같다", async () => {
    const s = await setup();
    const doc = docOf(s, await instanceByStep([s.stepOne, s.stepTwo]));
    await rejectDocument(s.fx.lead, { instanceId: doc.instanceId, expectedVersion: doc.version, reason: "다시" });
    for (const row of await waitingRows(s.stepOne)) expect(row.readAt).toBeInstanceOf(Date);
    for (const row of await waitingRows(s.stepTwo)) expect(row.readAt).toBeNull();
  });

  it("잠금 — 다른 연결이 그 행을 FOR UPDATE로 잡은 동안 승인은 기다리지 않고 성공 · 그 행은 안 읽음 · 다음 tick(토요일 · 방문 없음)에 읽음(K25)", async () => {
    const s = await setup();
    const doc = docOf(s, await instanceByStep([s.stepOne, s.stepTwo]));
    const [held] = await db
      .select({ id: notificationLog.id })
      .from(notificationLog)
      .where(and(eq(notificationLog.entityId, s.stepOne), eq(notificationLog.recipientId, s.fx.lead.id)));
    if (!held) throw new Error("잠글 행 없음");
    const blocker = new Client({ connectionString: process.env.DATABASE_URL });
    await blocker.connect();
    try {
      await blocker.query("begin");
      await blocker.query("select id from notification_log where id = $1 for update", [held.id]);
      const approved = approveDocument(s.second, { instanceId: doc.instanceId, expectedVersion: doc.version });
      const timeout = new Promise<"waited">((resolve) => setTimeout(() => resolve("waited"), 3000));
      expect(await Promise.race([approved.then(() => "done" as const), timeout])).toBe("done");
      const rows = await waitingRows(s.stepOne);
      expect(rows.find((row) => row.id === held.id)?.readAt).toBeNull();
      expect(rows.filter((row) => row.id !== held.id).every((row) => row.readAt !== null)).toBe(true);
    } finally {
      await blocker.query("rollback").catch(() => undefined);
      await blocker.end();
    }
    const info = vi.spyOn(log, "info");
    try {
      const result = await runTick({ conditionKinds: [], now: at("2026-10-17"), emailSender: null });
      expect(result).toMatchObject({ status: "ok", businessDay: false });
      const tickLog = info.mock.calls.find(([event]) => event === "notify.tick");
      expect(tickLog?.[1]).toMatchObject({ autoRead: 1 });
    } finally {
      info.mockRestore();
    }
    expect((await waitingRows(s.stepOne)).find((row) => row.id === held.id)?.readAt).toBeInstanceOf(Date);
    for (const row of await waitingRows(s.stepTwo)) expect(row.readAt).toBeNull();
  });

  it("다음 tick 정리 — 회수된 인스턴스의 단계 행은 읽음 · 진행 중 단계 행은 그대로", async () => {
    const s = await setup();
    const doc = docOf(s, await instanceByStep([s.stepOne, s.stepTwo]));
    await withdrawDocument(s.fx.pm, { instanceId: doc.instanceId, expectedVersion: doc.version });
    // 회수는 자동 읽음 경로가 아니다 — 알림함을 열지 않은 채 다음 tick이 정리한다.
    expect((await db.select().from(notificationLog).where(and(eq(notificationLog.entityId, s.stepOne), isNull(notificationLog.readAt)))).length).toBe(3);
    await runTick({ conditionKinds: [], now: at("2026-10-17"), emailSender: null });
    for (const row of await waitingRows(s.stepOne)) expect(row.readAt).toBeInstanceOf(Date);
    for (const row of await waitingRows(s.stepTwo)) expect(row.readAt).toBeNull();
  });

  it("다음 tick 정리가 실패해도(P3-2) 그 정리만 되돌리고 tick의 나머지(종류 평가 · 실행 기록)는 커밋된다", async () => {
    const s = await setup();
    const doc = docOf(s, await instanceByStep([s.stepOne, s.stepTwo]));
    await withdrawDocument(s.fx.pm, { instanceId: doc.instanceId, expectedVersion: doc.version });
    const probeKind: ConditionKind = {
      kind: "probe-cleanup-failure",
      label: "정리 실패 탐침",
      dateUnit: "calendar",
      defaults: { enabled: true, emailEnabled: false },
      defaultRecipientLabel: "탐침",
      evaluate: () => Promise.resolve([{ entity: "probe", entityId: "probe-1", recipientId: s.fx.pm.id, round: 1, referenceDate: "2026-10-14", message: "탐침" }]),
    };
    // 읽음 표시(read_at null → 값)만 막는 트리거 — 정리 문장을 실패시킨다.
    await db.execute(sql`create or replace function probe_block_read() returns trigger language plpgsql as $$ begin raise exception 'probe: read blocked'; end $$`);
    await db.execute(sql`create trigger probe_block_read before update on notification_log for each row when (old.read_at is null and new.read_at is not null) execute function probe_block_read()`);
    const error = vi.spyOn(log, "error");
    try {
      const result = await runTick({ conditionKinds: [probeKind], now: at("2026-10-14"), emailSender: null });
      expect(result).toMatchObject({ status: "ok", businessDay: true, sent: 1 });
      expect(error.mock.calls.some(([event]) => event === "notify.auto_read_failed")).toBe(true);
    } finally {
      error.mockRestore();
      await db.execute(sql`drop trigger if exists probe_block_read on notification_log`);
      await db.execute(sql`drop function if exists probe_block_read()`);
    }
    expect(await db.select().from(notificationLog).where(eq(notificationLog.conditionKind, "probe-cleanup-failure"))).toHaveLength(1);
    expect(await db.select().from(notifyTickRuns).where(eq(notifyTickRuns.kstDate, "2026-10-14"))).toHaveLength(1);
    for (const row of await waitingRows(s.stepOne)) expect(row.readAt).toBeNull();
  });

  it("마지막 단계(대표 — 폴백 자리면 차수 키)를 대표가 승인해도 그 단계 행이 읽음", async () => {
    const s = await setup();
    const doc = docOf(s, await instanceByStep([s.stepOne, s.stepTwo]));
    const first = await approveDocument(s.fx.lead, { instanceId: doc.instanceId, expectedVersion: doc.version });
    const second = await approveDocument(s.head, { instanceId: doc.instanceId, expectedVersion: first.version });
    await actedOnThursday(doc.instanceId);
    await runTick({ conditionKinds: [approvalWaitingKind], now: at("2026-10-14"), emailSender: null });
    const ceoRows = (await waitingRows()).filter((row) => row.recipientId === s.fx.ceo.id);
    expect(ceoRows.length).toBeGreaterThan(0);
    const final = await approveDocument(s.fx.ceo, { instanceId: doc.instanceId, expectedVersion: second.version });
    expect(final.status).toBe("approved");
    for (const ceoRow of ceoRows) {
      const [row] = await db.select().from(notificationLog).where(eq(notificationLog.id, ceoRow.id));
      expect(row?.readAt).toBeInstanceOf(Date);
    }
  });
});
