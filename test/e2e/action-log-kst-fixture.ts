import { db } from "@/db/client";
import { actionLog } from "@/db/schema";

// 07-25 DOM 감사 고침 — UTC와 KST의 날짜가 갈리는 시각(UTC 2026-10-22 15:30 = KST 2026-10-23 00:30)에 남긴 네 칸 행.
// 문서 번호를 token으로 두어 `?documentId=<token>` 한 줄만 보이게 한다. action_log는 INSERT만 한다(UPDATE 없음).
export const KST_MIDNIGHT_LABEL = "2026-10-23 00:30:00";
export const UTC_DATE_OF_ROW = "2026-10-22";

export async function insertKstMidnightRow(token: string): Promise<void> {
  await db.insert(actionLog).values({
    actorId: null,
    actorRoleId: null,
    actionType: "settings_change",
    entity: "e2e_settings",
    entityId: token,
    documentId: token,
    detail: {
      scope: "import",
      changes: {
        "tax.vat.rate": [0.1, 0.12],
        "auth.lockout.threshold": [5, 10],
        accountNumber: ["110123451234", "220987655678"],
        password: ["x-old-secret", "y-new-secret"],
      },
    },
    occurredAt: new Date("2026-10-22T15:30:00Z"),
  });
}
