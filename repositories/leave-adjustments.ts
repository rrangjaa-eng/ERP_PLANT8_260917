import { desc, eq } from "drizzle-orm";
import type { InferSelectModel } from "drizzle-orm";
import { db, type DbOrTx } from "@/db/client";
import { leaveAdjustments, users } from "@/db/schema";
import type { Viewer } from "@/domain/viewer";

// 04.1-03: 연차·월차 조정 기록 — 추가와 목록만 있다(수정·삭제 함수 없음, 틀리면
// 반대 부호로 한 줄 더). 행과 행동 로그는 호출자(domain)가 같은 tx로 쓴다.

export type LeaveAdjustmentRow = InferSelectModel<typeof leaveAdjustments>;
export type LeaveAdjustmentWithAuthor = LeaveAdjustmentRow & { createdByName: string };

export async function insertLeaveAdjustment(
  viewer: Viewer,
  input: {
    userId: string;
    bucket: "annual" | "monthly";
    fiscalYear: number | null;
    amountQuarters: number;
    reason: string;
    createdBy: string;
    createdAt?: Date;
  },
  tx: DbOrTx = db,
): Promise<LeaveAdjustmentRow> {
  void viewer;
  const [row] = await tx.insert(leaveAdjustments).values(input).returning();
  if (!row) throw new Error("leave_adjustments insert가 행을 반환하지 않았습니다.");
  return row;
}

// 한 사람의 조정 전부 — 작성자 이름을 같은 쿼리의 조인으로 싣는다(CX-R2). 최신이 먼저.
export async function listLeaveAdjustments(viewer: Viewer, userId: string): Promise<LeaveAdjustmentWithAuthor[]> {
  void viewer;
  const rows = await db
    .select({ adjustment: leaveAdjustments, createdByName: users.name })
    .from(leaveAdjustments)
    .innerJoin(users, eq(users.id, leaveAdjustments.createdBy))
    .where(eq(leaveAdjustments.userId, userId))
    .orderBy(desc(leaveAdjustments.createdAt), desc(leaveAdjustments.id));
  return rows.map((row) => ({ ...row.adjustment, createdByName: row.createdByName }));
}
