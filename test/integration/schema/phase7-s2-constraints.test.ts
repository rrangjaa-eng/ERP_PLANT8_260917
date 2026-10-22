import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { notificationLog, notificationRules } from "@/db/schema";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { makePerson } from "../approvals-fixtures";

// 07-07(스키마 S2) — 알림 규칙 덮어쓰기 표(D-717 · D-748 · FA-1)와 이메일 끔 상태 값(P7)이 DB에서 직접 막히는지(도메인을 거치지 않는
// 최후 방어선). 행은 db.insert로 직접 넣는다.
// 단언 규칙(E-42): drizzle 0.45는 pg 오류를 DrizzleQueryError로 감싸 원본을 .cause에 두므로 cause.code · cause.constraint로 본다.

type PgCause = { code?: unknown; constraint?: unknown };

async function expectPgError(run: () => Promise<unknown>, code: string, constraint: string): Promise<void> {
  let caught: unknown = null;
  try {
    await run();
  } catch (error) {
    caught = error;
  }
  const cause = (caught instanceof Error ? caught.cause : null) as PgCause | null;
  expect({ code: cause?.code, constraint: cause?.constraint }).toEqual({ code, constraint });
}

async function admin(): Promise<string> {
  const person = await makePerson("관리자", DEFAULT_ROLE_ID, null);
  return person.id;
}

describe("07 S2 — 알림 규칙 덮어쓰기 표(D-717 · D-748)", () => {
  it("칸이 FA-1 아홉 칸과 정확히 같다 — 범위 · 사람별 끄기 · 즉시 칸 없음(D-748 · D-719 · D-716)", async () => {
    const result = await db.execute<{ column_name: string }>(
      sql`select column_name from information_schema.columns where table_schema = 'public' and table_name = 'notification_rules' order by column_name`,
    );
    expect(result.rows.map((row) => row.column_name)).toEqual([
      "days",
      "email_enabled",
      "enabled",
      "enabled_at",
      "extra_role_ids",
      "kind",
      "updated_at",
      "updated_by",
      "version",
    ]);
  });

  it("같은 kind 두 행은 유일 위반으로 거부된다", async () => {
    await db.insert(notificationRules).values({ kind: "approval_pending" });
    await expectPgError(
      () => db.insert(notificationRules).values({ kind: "approval_pending" }),
      "23505",
      "notification_rules_pkey",
    );
  });

  it("days 음수는 notification_rules_days_check로 거부된다", async () => {
    await expectPgError(
      () => db.insert(notificationRules).values({ kind: "approval_pending", days: -1 }),
      "23514",
      "notification_rules_days_check",
    );
  });

  it("days 0 · 30은 들어간다", async () => {
    const rows = await db
      .insert(notificationRules)
      .values([
        { kind: "approval_pending", days: 0 },
        { kind: "payment_due", days: 30 },
      ])
      .returning({ days: notificationRules.days });
    expect(rows.map((row) => row.days)).toEqual([0, 30]);
  });

  it("NULL 칸(종류 기본값 따름) 행이 들어가고 extra_role_ids는 빈 배열 · version은 1이 기본값이다", async () => {
    const updatedBy = await admin();
    const [row] = await db
      .insert(notificationRules)
      .values({ kind: "orphan_receipt", enabled: null, emailEnabled: null, enabledAt: null, updatedBy })
      .returning();
    expect(row).toMatchObject({
      kind: "orphan_receipt",
      enabled: null,
      days: null,
      emailEnabled: null,
      enabledAt: null,
      extraRoleIds: [],
      version: 1,
      updatedBy,
    });
    expect(row?.updatedAt).toBeInstanceOf(Date);
  });

  it("없는 사용자 id를 updated_by에 넣으면 FK로 거부된다", async () => {
    await expectPgError(
      () => db.insert(notificationRules).values({ kind: "approval_pending", updatedBy: randomUUID() }),
      "23503",
      "notification_rules_updated_by_users_id_fk",
    );
  });
});

describe("07 S2 — notification_log.email_status 이메일 끔 값(P7)", () => {
  async function insertWithStatus(recipientId: string, emailStatus: string) {
    return db
      .insert(notificationLog)
      .values({
        conditionKind: "test_s2",
        entity: "test",
        entityId: randomUUID(),
        recipientId,
        referenceDate: "2026-10-22",
        message: "S2 시험",
        emailStatus,
      })
      .returning({ id: notificationLog.id });
  }

  it("skipped_rule_off는 들어간다", async () => {
    const recipientId = await admin();
    const [row] = await insertWithStatus(recipientId, "skipped_rule_off");
    if (!row) throw new Error("행 없음");
    const [stored] = await db
      .select({ emailStatus: notificationLog.emailStatus })
      .from(notificationLog)
      .where(eq(notificationLog.id, row.id));
    expect(stored?.emailStatus).toBe("skipped_rule_off");
  });

  it("목록에 없는 값은 notification_log_email_status_check로 거부된다", async () => {
    const recipientId = await admin();
    await expectPgError(
      () => insertWithStatus(recipientId, "skipped_anything"),
      "23514",
      "notification_log_email_status_check",
    );
  });

  it("기존 여섯 값은 그대로 들어간다", async () => {
    const recipientId = await admin();
    for (const status of ["pending", "sending", "sent", "failed", "unknown", "skipped_no_smtp"]) {
      const rows = await insertWithStatus(recipientId, status);
      expect(rows).toHaveLength(1);
    }
  });
});
