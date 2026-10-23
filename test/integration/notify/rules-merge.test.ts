import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import { db, pool } from "@/db/client";
import { notificationLog, notificationRules, notifyTickRuns, roles, users } from "@/db/schema";
import { createAccount } from "@/domain/auth/accounts";
import type { NotificationCandidate } from "@/domain/notify/condition-kinds";
import { runTick } from "@/domain/notify/tick";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { log } from "@/lib/log";
import { claimNextEmailBundle, NOTIFY_TICK_LOCK_KEY, openInbox } from "@/repositories/notifications";
import { insertRole } from "@/repositories/roles";
import { createFakeEmailSender } from "@/test/support/fake-email-sender";
import { createTestConditionKind } from "@/test/support/notify-tick";

// 07-10 D-748 · D-717 · R6: 규칙의 받는 계급 추가(회사 전체) · 이메일 끔 · 후보 폭증 시 동작 불변.

const WED = "2026-10-07";

function at(date: string): () => Date {
  return () => new Date(`${date}T09:00:00+09:00`);
}

async function person(prefix: string, roleId?: string): Promise<string> {
  const { userId } = await createAccount(SYSTEM_VIEWER, {
    email: `${prefix}-${randomUUID()}@example.test`,
    name: prefix,
    ...(roleId ? { roleId } : {}),
  });
  return userId;
}

async function makeRole(): Promise<string> {
  const role = await insertRole(SYSTEM_VIEWER, { id: `role-${randomUUID()}`, name: `계급-${randomUUID().slice(0, 8)}`, workScope: "team", viewScope: "team" });
  return role.id;
}

function candidate(recipientId: string, entityId = "T-1"): NotificationCandidate {
  return { entity: "test", entityId, recipientId, round: 1, referenceDate: "2026-10-05", message: `테스트 알림 · ${entityId}` };
}

async function rowsOf(userId: string) {
  return db.select().from(notificationLog).where(eq(notificationLog.recipientId, userId));
}

describe("받는 계급 추가 (D-748)", () => {
  it("그 계급의 회사 전체 활성 사용자에게 같은 문장 — 보관 계급 id · 보관 · 퇴직 사용자는 제외", async () => {
    const owner = await person("owner");
    const roleId = await makeRole();
    const archivedRoleId = await makeRole();
    const holderA = await person("holder-a", roleId);
    const holderB = await person("holder-b", roleId);
    const archivedUser = await person("archived-user", roleId);
    const resigned = await person("resigned-user", roleId);
    const archivedRoleHolder = await person("archived-role-holder", archivedRoleId);
    await db.update(users).set({ archivedAt: new Date("2026-09-01T00:00:00Z") }).where(eq(users.id, archivedUser));
    await db.update(users).set({ resignationDate: "2026-10-01" }).where(eq(users.id, resigned));
    await db.update(roles).set({ archivedAt: new Date("2026-09-01T00:00:00Z") }).where(eq(roles.id, archivedRoleId));
    await db.insert(notificationRules).values({ kind: "test", extraRoleIds: [roleId, archivedRoleId, "role-없음"] });

    const kind = createTestConditionKind([candidate(owner)]);
    await runTick({ conditionKinds: [kind], now: at(WED), emailSender: null });

    for (const id of [owner, holderA, holderB]) {
      const rows = await rowsOf(id);
      expect(rows).toHaveLength(1);
      expect(rows[0]?.message).toBe("테스트 알림 · T-1");
    }
    for (const id of [archivedUser, resigned, archivedRoleHolder]) expect(await rowsOf(id)).toHaveLength(0);
  });

  it("owner가 이미 그 계급이면 한 행(받는 사람 중복 제거)", async () => {
    const roleId = await makeRole();
    const holder = await person("holder", roleId);
    await db.insert(notificationRules).values({ kind: "test", extraRoleIds: [roleId] });
    await runTick({ conditionKinds: [createTestConditionKind([candidate(holder)])], now: at(WED), emailSender: null });
    expect(await rowsOf(holder)).toHaveLength(1);
  });
});

describe("이메일 끔 (D-717)", () => {
  it("규칙 emailEnabled=false → 행은 skipped_rule_off이고 메일 묶음에 안 들어간다", async () => {
    const owner = await person("quiet");
    await db.insert(notificationRules).values({ kind: "test", emailEnabled: false });
    const fake = createFakeEmailSender();
    await runTick({ conditionKinds: [createTestConditionKind([candidate(owner)])], now: at(WED), emailSender: fake.sender });
    const rows = await rowsOf(owner);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.emailStatus).toBe("skipped_rule_off");
    expect(fake.sent).toHaveLength(0);
  });

  it("이메일 켬(기본)이면 pending → 발송", async () => {
    const owner = await person("loud");
    const fake = createFakeEmailSender();
    await runTick({ conditionKinds: [createTestConditionKind([candidate(owner)])], now: at(WED), emailSender: fake.sender });
    expect((await rowsOf(owner))[0]?.emailStatus).toBe("sent");
    expect(fake.sent).toHaveLength(1);
  });
});

describe("계급 추가로 후보가 batchMax보다 많아짐 (R6 — 동작 불변)", () => {
  it("tick당 insert ≤ batchMax, 나머지는 다음 tick, 사람당 하루 메일 한 통 이하", async () => {
    const owner = await person("bulk-owner");
    const roleId = await makeRole();
    const holders = [await person("bh-1", roleId), await person("bh-2", roleId), await person("bh-3", roleId), await person("bh-4", roleId)];
    await db.insert(notificationRules).values({ kind: "test", extraRoleIds: [roleId] });
    const kind = createTestConditionKind([candidate(owner)]);
    const fake = createFakeEmailSender();
    const cap = () => Promise.resolve(3);

    const first = await runTick({ conditionKinds: [kind], now: at(WED), emailSender: fake.sender, batchMax: cap });
    expect(first).toMatchObject({ status: "ok", sent: 3, remaining: 2 });
    expect((await db.select().from(notificationLog)).length).toBe(3);
    const run = (await db.select().from(notifyTickRuns).orderBy(notifyTickRuns.id))[0];
    expect(run?.incompleteRecipientIds).toHaveLength(2);
    // 미완 받는 사람은 그날 선점되지 않는다 — 메일은 들어간 받는 사람 수 이하.
    expect(fake.sent.length).toBeLessThanOrEqual(3);

    const second = await runTick({ conditionKinds: [kind], now: at("2026-10-08"), emailSender: fake.sender, batchMax: cap });
    expect(second).toMatchObject({ status: "ok", sent: 2, remaining: 0 });
    const all = await db.select().from(notificationLog);
    expect(all).toHaveLength(5);
    expect(new Set(all.map((row) => row.recipientId))).toEqual(new Set([owner, ...holders]));
    const perPerson = new Map<string, number>();
    for (const message of fake.sent) perPerson.set(message.to, (perPerson.get(message.to) ?? 0) + 1);
    expect(Math.max(0, ...perPerson.values())).toBeLessThanOrEqual(1);
  });
});

// 04.2 P3 #4~#6 (Task 2 ⑤).
describe("04.2 P3 이월", () => {
  it(
    "#4 DB 세션 시간대가 Asia/Seoul이어도 알림함 열기의 read_at은 UTC로 저장된다",
    async () => {
    const owner = await person("tz-owner");
    await runTick({ conditionKinds: [createTestConditionKind([candidate(owner)])], now: at(WED), emailSender: null });
    // 풀의 모든 연결 세션 시간대를 바꿔 둔다(연결은 풀에 남아 openInbox가 그중 하나를 쓴다).
    const setZone = async (statement: string) => {
      const clients = await Promise.all(Array.from({ length: pool.options.max ?? 5 }, () => pool.connect()));
      for (const client of clients) await client.query(statement);
      for (const client of clients) client.release();
    };
    await setZone("SET TIME ZONE 'Asia/Seoul'");
    try {
      await openInbox(SYSTEM_VIEWER, { recipientId: owner, retentionFrom: new Date("2026-01-01T00:00:00Z"), limit: 10 });
    } finally {
      await setZone("RESET TIME ZONE");
    }
    const diff = await db.execute<{ seconds: string }>(
      sql`select extract(epoch from (read_at - (now() at time zone 'UTC')))::text as seconds from notification_log where recipient_id = ${owner}`,
    );
    expect(Math.abs(Number(diff.rows[0]?.seconds))).toBeLessThan(60);
  },
    30_000,
  );

  it(
    "#5 겹친 tick의 이메일 선점이 잠금 시간 초과(55P03)를 만나면 null을 돌려준다",
    async () => {
      const holder = await pool.connect();
      try {
        await holder.query("BEGIN");
        await holder.query("select pg_advisory_xact_lock($1)", [NOTIFY_TICK_LOCK_KEY]);
        const claimed = await claimNextEmailBundle(SYSTEM_VIEWER, {
          runId: 1,
          dayStart: new Date(`${WED}T00:00:00+09:00`),
          now: at(WED)(),
          deadlineMs: 15_000,
        });
        expect(claimed).toBeNull();
      } finally {
        await holder.query("ROLLBACK");
        holder.release();
      }
    },
    30_000,
  );

  it("#6 오늘이 2034년 이후면 holiday.lunar_table_ending 경고를 한 번 남긴다", async () => {
    const warn = vi.spyOn(log, "warn");
    try {
      await runTick({
        conditionKinds: [],
        now: () => new Date("2034-01-03T09:00:00+09:00"),
        isBusinessDay: () => Promise.resolve(true),
        emailSender: null,
      });
      const calls = warn.mock.calls.filter(([event]) => event === "holiday.lunar_table_ending");
      expect(calls).toHaveLength(1);
      expect(calls[0]?.[1]).toMatchObject({ lastYear: 2035 });
    } finally {
      warn.mockRestore();
    }
    const quiet = vi.spyOn(log, "warn");
    try {
      await runTick({ conditionKinds: [], now: at(WED), emailSender: null });
      expect(quiet.mock.calls.filter(([event]) => event === "holiday.lunar_table_ending")).toHaveLength(0);
    } finally {
      quiet.mockRestore();
    }
  });
});
