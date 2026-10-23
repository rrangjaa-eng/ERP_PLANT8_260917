import { randomUUID } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import { db, pool } from "@/db/client";
import { approvalRoutes, approvalSteps, notificationLog } from "@/db/schema";
import { createAccount } from "@/domain/auth/accounts";
import { createExpenseFromLines } from "@/domain/expenses";
import { foldInbox } from "@/domain/notify/inbox-fold";
import { listMyNotifications, openMyInbox } from "@/domain/notify/inbox";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { listInbox, openInbox } from "@/repositories/notifications";
import { setupExpenseProject, submitReadyDraft } from "../fixtures/expenses";

// 07-19 Task 3 알림함 조회 칸 · 착지 링크 · 접힘 판정(C-P2-6 · C-P2-7 · N25 · N26 · R12).
// 링크 판정 자체는 07-14 href.test.ts가 갈래별로 덮는다 — 여기서는 알림함 DTO가 그 함수를 한 번에 묶어 부르고(N+1 없음),
// 본인 범위가 그대로이며, 등록부 밖 종류에는 라벨이 없어 접히지 않는 것만 본다.

const RETENTION = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

type Seed = { conditionKind: string; entity: string; entityId: string; message?: string };

async function seed(recipientId: string, rows: Seed[]): Promise<void> {
  await db.insert(notificationLog).values(
    rows.map((row, index) => ({
      conditionKind: row.conditionKind,
      entity: row.entity,
      entityId: row.entityId,
      recipientId,
      round: 1,
      referenceDate: "2026-10-22",
      message: row.message ?? `시험 알림 ${index}`,
    })),
  );
}

async function stranger() {
  const { userId } = await createAccount(SYSTEM_VIEWER, { email: `inbox-links-${randomUUID()}@example.test`, name: "무관", roleId: DEFAULT_ROLE_ID });
  return { id: userId, roleId: DEFAULT_ROLE_ID };
}

async function submitted() {
  const fx = await setupExpenseProject();
  const created = await createExpenseFromLines(fx.pm, { lineIds: [fx.lines.withVendor] });
  const expenseId = created.created[0]?.expenseId;
  if (!expenseId) throw new Error("지출결의 없음");
  const doc = await submitReadyDraft(fx.pm, expenseId);
  if (doc.kind !== "submitted") throw new Error("제출 안 됨");
  const [step] = await db
    .select({ id: approvalSteps.id })
    .from(approvalSteps)
    .innerJoin(approvalRoutes, eq(approvalRoutes.id, approvalSteps.routeId))
    .where(and(eq(approvalRoutes.instanceId, doc.instanceId), isNull(approvalSteps.actedAt)))
    .orderBy(approvalSteps.stepIndex)
    .limit(1);
  if (!step) throw new Error("단계 없음");
  return { fx, expenseId, stepId: step.id };
}

describe("알림함 조회 칸 (C-P2-6)", () => {
  it("listInbox · openInbox 행이 conditionKind · entity · entityId를 싣는다", async () => {
    const me = await stranger();
    const entityId = randomUUID();
    await seed(me.id, [{ conditionKind: "approval-waiting", entity: "approval-step", entityId }]);

    const listed = await listInbox(me, { recipientId: me.id, retentionFrom: RETENTION, limit: 10 });
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({ conditionKind: "approval-waiting", entity: "approval-step", entityId });

    const opened = await openInbox(me, { recipientId: me.id, retentionFrom: RETENTION, limit: 10 });
    expect(opened.rows[0]).toMatchObject({ conditionKind: "approval-waiting", entity: "approval-step", entityId });
  });
});

describe("알림함 DTO — href · kindLabel (N25 · C-P3-4 · C-P2-7)", () => {
  it("볼 수 있는 지출결의는 href, 없는 문서 · 문서 아닌 갈래는 없음 — 열기 응답도 같다", async () => {
    const { fx, expenseId } = await submitted();
    await seed(fx.pm.id, [
      { conditionKind: "expense-result", entity: "expense-result", entityId: `${expenseId}:${randomUUID()}`, message: "결과" },
      { conditionKind: "expense-result", entity: "expense", entityId: randomUUID(), message: "없는 문서" },
      { conditionKind: "card-usage", entity: "card-usage", entityId: randomUUID(), message: "갈래 없음" },
    ]);
    const hrefOf = (rows: Array<{ message: string; href?: string }>) => Object.fromEntries(rows.map((row) => [row.message, row.href]));
    const expected = { 결과: `/expenses/${expenseId}`, "없는 문서": undefined, "갈래 없음": undefined };

    expect(hrefOf((await listMyNotifications(fx.pm)).rows)).toEqual(expected);
    expect(hrefOf((await openMyInbox(fx.pm)).rows)).toEqual(expected);
  });

  it("등록부 종류는 kindLabel, 등록부 밖 종류(확인증 즉시 경로)는 kindLabel이 없다", async () => {
    const me = await stranger();
    await seed(me.id, [
      { conditionKind: "approval-waiting", entity: "approval-step", entityId: randomUUID(), message: "차례" },
      { conditionKind: "cert_qr_request", entity: "cert_event", entityId: randomUUID(), message: "확인증" },
    ]);
    const byMessage = Object.fromEntries((await listMyNotifications(me)).rows.map((row) => [row.message, row.kindLabel]));
    expect(byMessage).toEqual({ 차례: "결재 차례", 확인증: undefined });
  });

  it("다른 사람의 행은 여전히 안 보인다(본인 범위)", async () => {
    const { fx, expenseId } = await submitted();
    const other = await stranger();
    await seed(fx.pm.id, [{ conditionKind: "expense-result", entity: "expense", entityId: expenseId, message: "내 것" }]);
    await seed(other.id, [{ conditionKind: "expense-result", entity: "expense", entityId: expenseId, message: "남의 것" }]);
    const mine = (await listMyNotifications(fx.pm)).rows;
    expect(mine.map((row) => row.message)).toEqual(["내 것"]);
    // 남은 그 문서를 볼 수 없으므로 자기 알림이어도 링크가 없다.
    expect((await listMyNotifications(other)).rows.map((row) => [row.message, row.href])).toEqual([["남의 것", undefined]]);
  });
});

describe("결재 차례 50행 (R12 · F-07 · performance)", () => {
  async function queriesOf(viewer: { id: string; roleId: string | null }): Promise<number> {
    const spy = vi.spyOn(pool, "query");
    try {
      await listMyNotifications(viewer, { limit: 50 });
      return spy.mock.calls.length;
    } finally {
      spy.mockRestore();
    }
  }

  it("5행이든 50행이든 한 번의 쿼리 수가 같고 50행은 5초 안이다", async () => {
    const { fx, stepId } = await submitted();
    const stepRows = (count: number): Seed[] =>
      Array.from({ length: count }, (_, index) => ({
        conditionKind: "approval-waiting",
        entity: "approval-step",
        entityId: index === 0 ? stepId : `${randomUUID()}${index % 2 === 0 ? ":fallback" : ""}`,
        message: `차례 ${index}`,
      }));
    await seed(fx.pm.id, stepRows(5));
    const small = await queriesOf(fx.pm);
    await db.delete(notificationLog).where(eq(notificationLog.recipientId, fx.pm.id));
    await seed(fx.pm.id, stepRows(50));
    const startedAt = performance.now();
    const big = await queriesOf(fx.pm);
    expect(performance.now() - startedAt).toBeLessThan(5000);
    expect(big).toBe(small);
    expect((await listMyNotifications(fx.pm, { limit: 50 })).rows).toHaveLength(50);
  });
});

describe("접힘 판정 foldInbox (N26 · C-P2-7)", () => {
  const at = (day: string) => `${day}T01:00:00.000Z`;
  const make = (count: number, kindLabel: string | undefined, day = "2026-10-22") =>
    Array.from({ length: count }, (_, index) => ({ id: `${kindLabel ?? "none"}-${day}-${index}`, createdAt: at(day), kindLabel }));

  it("같은 날 같은 종류 5건 이상이면 한 줄로 접고 첫 행 자리에 둔다", () => {
    const items = foldInbox(make(6, "결재 차례"));
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ type: "fold", key: "2026-10-22|결재 차례", label: "결재 차례" });
    expect(items[0]?.type === "fold" ? items[0].rows : []).toHaveLength(6);
  });

  it("4건은 접지 않고, 날짜가 다르면 따로 센다", () => {
    expect(foldInbox(make(4, "결재 차례")).map((item) => item.type)).toEqual(["row", "row", "row", "row"]);
    const split = foldInbox([...make(3, "결재 차례", "2026-10-22"), ...make(3, "결재 차례", "2026-10-21")]);
    expect(split.every((item) => item.type === "row")).toBe(true);
  });

  it("kindLabel이 없는 행(등록부 밖 확인증 알림)은 6건이어도 그대로 6행이다", () => {
    expect(foldInbox(make(6, undefined)).map((item) => item.type)).toEqual(Array(6).fill("row"));
  });

  it("다른 종류가 사이에 끼어도 접힘 줄은 첫 행 자리이고 나머지 순서는 그대로다", () => {
    const rows = [...make(2, "결재 차례"), ...make(1, "결재 결과"), ...make(4, "결재 차례")];
    const items = foldInbox(rows);
    expect(items.map((item) => (item.type === "fold" ? `fold:${item.rows.length}` : "row"))).toEqual(["fold:6", "row"]);
  });
});
