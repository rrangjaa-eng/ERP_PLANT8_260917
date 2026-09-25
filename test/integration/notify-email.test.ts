import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/db/client";
import { notificationLog, notifyTickRuns } from "@/db/schema";
import { createAccount } from "@/domain/auth/accounts";
import { listMyNotifications } from "@/domain/notify/inbox";
import { runTick } from "@/domain/notify/tick";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { handleNotifyTick, type NotifyTickHandlerDeps } from "@/app/internal/notify-tick/handle";
import { createFakeEmailSender } from "@/test/support/fake-email-sender";
import { createTestConditionKind, testCandidate } from "@/test/support/notify-tick";
import type { NotificationCandidate } from "@/domain/notify/condition-kinds";

type TestUser = { id: string; email: string };

async function createUser(prefix: string): Promise<TestUser> {
  const email = `${prefix}-${randomUUID()}@test.invalid`;
  const { userId } = await createAccount(SYSTEM_VIEWER, { email, name: prefix });
  return { id: userId, email };
}

// KST 날짜 → 그날 09:00 KST의 Date(= 00:00Z).
function kst(date: string): () => Date {
  return () => new Date(`${date}T00:00:00Z`);
}

const WED = "2026-10-07";

function occ(recipientId: string, entityId: string, referenceDate = "2026-10-01"): NotificationCandidate {
  return testCandidate({ recipientId, entityId, referenceDate });
}

async function rowsFor(recipientId: string) {
  return db.select().from(notificationLog).where(eq(notificationLog.recipientId, recipientId)).orderBy(notificationLog.id);
}

async function tickRuns() {
  return db.select().from(notifyTickRuns).orderBy(notifyTickRuns.id);
}

const okVerify: NotifyTickHandlerDeps["verify"] = () => Promise.resolve({ ok: true });
const CONFIG: NotifyTickHandlerDeps["config"] = {
  audience: "https://notify.test.invalid",
  schedulerSa: "scheduler@test.invalid",
  oidcDisabled: false,
};

function tickRequest(): Request {
  return new Request("http://127.0.0.1:3000/internal/notify-tick", {
    method: "POST",
    headers: { authorization: "Bearer test" },
  });
}

describe("이메일 트레이서 (NOTI-02 · D-706 · D-711)", () => {
  it("A의 알림 3건 → 메일 1통 · 세 행 sent · 실행 기록 claimed 1 / sent 1 / finished · 알림함 3건", async () => {
    const a = await createUser("mail-a");
    const kind = createTestConditionKind([occ(a.id, "T-1"), occ(a.id, "T-2"), occ(a.id, "T-3")]);
    const fake = createFakeEmailSender();

    const response = await handleNotifyTick(tickRequest(), {
      config: CONFIG,
      verify: okVerify,
      runTick: (opts) => runTick({ ...opts, conditionKinds: [kind], now: kst(WED), emailSender: fake.sender }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ sent: 3, skipped: 0, remaining: 0 });

    expect(fake.sent).toHaveLength(1);
    expect(fake.sent[0]?.to).toBe(a.email);
    expect(fake.sent[0]?.subject).toBe("PLANT8 알림 3건");
    expect(fake.calls).toHaveLength(1);
    expect(fake.calls[0]?.signal).toBeInstanceOf(AbortSignal);
    expect(fake.calls[0]?.abortedAtCall).toBe(false);

    const rows = await rowsFor(a.id);
    expect(rows.map((row) => row.emailStatus)).toEqual(["sent", "sent", "sent"]);
    for (const row of rows) expect(row.emailAttemptedAt).toBeInstanceOf(Date);

    const runs = await tickRuns();
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ emailClaimed: 1, emailSent: 1, emailFailed: 0, emailUnknown: 0 });
    expect(runs[0]?.emailFinishedAt).toBeInstanceOf(Date);

    const inbox = await listMyNotifications({ id: a.id, roleId: null }, {}, { now: kst(WED) });
    expect(inbox.rows).toHaveLength(3);
  });

  it("SMTP 미설정(발송기 null) → 메일 0통 · 세 행 skipped_no_smtp · 시도 시각 없음 · claimed 0", async () => {
    const a = await createUser("nosmtp-a");
    const kind = createTestConditionKind([occ(a.id, "T-1"), occ(a.id, "T-2"), occ(a.id, "T-3")]);
    const result = await runTick({ conditionKinds: [kind], now: kst(WED), emailSender: null });
    expect(result).toMatchObject({ status: "ok", sent: 3 });

    const rows = await rowsFor(a.id);
    expect(rows.map((row) => row.emailStatus)).toEqual(["skipped_no_smtp", "skipped_no_smtp", "skipped_no_smtp"]);
    for (const row of rows) expect(row.emailAttemptedAt).toBeNull();
    const runs = await tickRuns();
    expect(runs[0]?.emailClaimed).toBe(0);
  });

  it("핸들러 진입 때 잰 시각이 runTick의 requestStartedAtMs로 간다", async () => {
    const received: number[] = [];
    const response = await handleNotifyTick(tickRequest(), {
      config: CONFIG,
      verify: okVerify,
      monotonicNow: () => 12_345,
      runTick: (opts) => {
        received.push(opts.requestStartedAtMs);
        return Promise.resolve({
          status: "ok",
          sent: 0,
          skipped: 0,
          remaining: 0,
          businessDay: true,
          incompleteRecipientIds: [],
          runId: 0,
        });
      },
    });
    expect(response.status).toBe(200);
    expect(received).toEqual([12_345]);
  });
});
