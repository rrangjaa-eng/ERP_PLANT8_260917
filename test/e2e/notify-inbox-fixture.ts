import { randomUUID } from "node:crypto";
import { db } from "@/db/client";
import { notificationLog } from "@/db/schema";
import { createExpenseFromLines } from "@/domain/expenses";
import { setupExpenseE2E, type ExpenseE2E } from "./expense-fixture";

// 07-19 알림함 링크 · 접힘 E2E 공용 준비 — 알림 행을 테스트 DB에 직접 넣는다(프로덕션에는 없는 경로 — 알림 기록은 tick만 쓴다).
// 링크가 있는 행은 기안 PM의 실제 지출결의(상세 화면을 볼 수 있는 문서)를 가리킨다.

export type InboxSeed = {
  conditionKind: string;
  entity: string;
  entityId: string;
  message: string;
  createdAt?: Date;
  read?: boolean;
};

export async function seedInboxRows(recipientId: string, rows: InboxSeed[]): Promise<void> {
  await db.insert(notificationLog).values(
    rows.map((row) => ({
      conditionKind: row.conditionKind,
      entity: row.entity,
      entityId: row.entityId,
      recipientId,
      round: 1,
      referenceDate: "2026-10-22",
      message: row.message,
      ...(row.createdAt ? { createdAt: row.createdAt } : {}),
      ...(row.read ? { readAt: new Date() } : {}),
    })),
  );
}

// 기안 PM + 그 PM의 작성 중 지출결의 하나. 알림은 `expense` 갈래(entityId 첫 `:` 앞 = 문서 id)로 이 문서에 이어진다.
export async function setupLinkedInbox(): Promise<{ fx: ExpenseE2E; expenseId: string }> {
  const fx = await setupExpenseE2E();
  const created = await createExpenseFromLines(fx.pm.viewer, { lineIds: [fx.lines.tracer.id] });
  const expenseId = created.created[0]?.expenseId;
  if (!expenseId) throw new Error("지출결의 없음");
  return { fx, expenseId };
}

export function approvalTurnRows(expenseId: string, count: number, options: { read?: boolean; at?: Date } = {}): InboxSeed[] {
  const at = options.at ?? new Date(Date.now() - 60_000);
  return Array.from({ length: count }, (_, index) => ({
    conditionKind: "approval-waiting",
    entity: "expense",
    entityId: `${expenseId}:${randomUUID()}`,
    message: `결재 차례 시험 ${index + 1}`,
    createdAt: new Date(at.getTime() - index * 1000),
    read: options.read ?? false,
  }));
}
