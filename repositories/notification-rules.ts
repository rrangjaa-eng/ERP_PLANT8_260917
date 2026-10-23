import { and, asc, eq } from "drizzle-orm";
import { db, type DbOrTx } from "@/db/client";
import { notificationRules } from "@/db/schema";
import type { NotificationRuleRow } from "@/domain/notify/rules";
import type { Viewer } from "@/domain/viewer";

// 07-07 notification_rules 읽기 — 관리자가 바꾼 것만 있는 표(NULL 칸 = 종류 기본값). tick이 잠금 tx 안에서 한 번 읽는다.
export async function listNotificationRules(viewer: Viewer, tx: DbOrTx = db): Promise<NotificationRuleRow[]> {
  void viewer;
  const rows = await tx
    .select({
      kind: notificationRules.kind,
      enabled: notificationRules.enabled,
      days: notificationRules.days,
      extraRoleIds: notificationRules.extraRoleIds,
      emailEnabled: notificationRules.emailEnabled,
      enabledAt: notificationRules.enabledAt,
    })
    .from(notificationRules)
    .orderBy(asc(notificationRules.kind));
  return rows;
}

// 07-19 규칙 화면 — 행에 version을 함께 읽는다(없는 종류는 행이 없다 = version 0).
export type NotificationRuleRecord = NotificationRuleRow & { version: number };

const RECORD_COLUMNS = {
  kind: notificationRules.kind,
  enabled: notificationRules.enabled,
  days: notificationRules.days,
  extraRoleIds: notificationRules.extraRoleIds,
  emailEnabled: notificationRules.emailEnabled,
  enabledAt: notificationRules.enabledAt,
  version: notificationRules.version,
};

export async function listNotificationRuleRecords(viewer: Viewer, tx: DbOrTx = db): Promise<NotificationRuleRecord[]> {
  void viewer;
  return tx.select(RECORD_COLUMNS).from(notificationRules).orderBy(asc(notificationRules.kind));
}

// 저장 직전 행 잠금 — 같은 종류를 동시에 고치는 두 저장을 줄 세운다.
export async function lockNotificationRule(viewer: Viewer, kind: string, tx: DbOrTx): Promise<NotificationRuleRecord | null> {
  void viewer;
  const [row] = await tx.select(RECORD_COLUMNS).from(notificationRules).where(eq(notificationRules.kind, kind)).for("update");
  return row ?? null;
}

export type NotificationRuleWrite = {
  kind: string;
  enabled: boolean | null;
  days: number | null;
  extraRoleIds: string[];
  emailEnabled: boolean | null;
  enabledAt: Date | null;
};

// 기대 version이 0이면 행이 아직 없어야 하고(삽입), 아니면 그 version이어야 한다(갱신). 어긋나면 false — 호출자가 충돌로 바꾼다.
export async function upsertNotificationRule(
  viewer: Viewer,
  row: NotificationRuleWrite,
  expectedVersion: number,
  tx: DbOrTx,
): Promise<boolean> {
  const values = {
    enabled: row.enabled,
    days: row.days,
    extraRoleIds: row.extraRoleIds,
    emailEnabled: row.emailEnabled,
    enabledAt: row.enabledAt,
    updatedBy: viewer.id,
    updatedAt: new Date(),
  };
  if (expectedVersion === 0) {
    const inserted = await tx.insert(notificationRules).values({ kind: row.kind, ...values, version: 1 }).onConflictDoNothing().returning({ kind: notificationRules.kind });
    return inserted.length > 0;
  }
  const updated = await tx
    .update(notificationRules)
    .set({ ...values, version: expectedVersion + 1 })
    .where(and(eq(notificationRules.kind, row.kind), eq(notificationRules.version, expectedVersion)))
    .returning({ kind: notificationRules.kind });
  return updated.length > 0;
}
