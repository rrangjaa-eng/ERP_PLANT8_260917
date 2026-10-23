import { desc, eq, inArray, sql } from "drizzle-orm";
import { db, type DbOrTx } from "@/db/client";
import { expensePayments, expenses, users, vendorAccountChanges } from "@/db/schema";
import type { Viewer } from "@/domain/viewer";

// 07-23: 거래처 묶음 표(07-11 S3) 읽기 · 쓰기 — 계좌 변경 기록 · 담당자 · 서류. 판정(권한 · 노출)은 domain/vendors가 한다.

export type AccountChangeSource = "admin" | "workplace" | "evidence";

// 계좌 변경 기록 한 줄 — 원값 없이 뒤 4자리만(07-11 CHECK `^[0-9]{4}$` 또는 NULL). 저장 트랜잭션 안에서만 부른다(tx 필수).
export async function insertAccountChange(
  viewer: Viewer,
  input: { vendorId: string; beforeLast4: string | null; afterLast4: string | null; source: AccountChangeSource },
  tx: DbOrTx,
): Promise<void> {
  await tx.insert(vendorAccountChanges).values({ ...input, changedBy: viewer.id });
}

export type AccountChangeRow = { id: string; beforeLast4: string | null; afterLast4: string | null; changedAt: Date; changedByName: string };

// 한 거래처의 변경 기록 — 최신 위(같은 시각이면 id 순으로 결정적).
export async function listAccountChanges(viewer: Viewer, vendorId: string): Promise<AccountChangeRow[]> {
  void viewer;
  return db
    .select({
      id: vendorAccountChanges.id,
      beforeLast4: vendorAccountChanges.beforeLast4,
      afterLast4: vendorAccountChanges.afterLast4,
      changedAt: vendorAccountChanges.changedAt,
      changedByName: users.name,
    })
    .from(vendorAccountChanges)
    .innerJoin(users, eq(users.id, vendorAccountChanges.changedBy))
    .where(eq(vendorAccountChanges.vendorId, vendorId))
    .orderBy(desc(vendorAccountChanges.changedAt), desc(vendorAccountChanges.id));
}

// AQ-36: 거래처마다 가장 늦은 계좌 변경이 그 거래처로 처리된(취소 안 된) 가장 늦은 지급보다 뒤인 거래처 id — 한 질의.
// 지급은 거래처가 지급처인 문서만 센다(직원 지급처 문서는 그 거래처 계좌로 나간 돈이 아니다).
export async function findVendorsChangedSinceLastPayment(viewer: Viewer, vendorIds: readonly string[]): Promise<string[]> {
  void viewer;
  if (vendorIds.length === 0) return [];
  const lastPaid = sql`(select max(${expensePayments.processedAt}) from ${expensePayments} inner join ${expenses} on ${expenses.id} = ${expensePayments.expenseId}
    where ${expenses.vendorId} = ${vendorAccountChanges.vendorId} and ${expenses.payeeUserId} is null and ${expensePayments.cancelledAt} is null)`;
  const rows = await db
    .select({ vendorId: vendorAccountChanges.vendorId })
    .from(vendorAccountChanges)
    .where(inArray(vendorAccountChanges.vendorId, [...vendorIds]))
    .groupBy(vendorAccountChanges.vendorId)
    .having(sql`max(${vendorAccountChanges.changedAt}) > coalesce(${lastPaid}, '-infinity'::timestamp)`);
  return rows.map((row) => row.vendorId);
}
