import { asc } from "drizzle-orm";
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
