import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import { db, pool } from "@/db/client";
import { notificationLog, notifyTickRuns } from "@/db/schema";
import { createAccount } from "@/domain/auth/accounts";
import { listMyNotifications } from "@/domain/notify/inbox";
import { runTick } from "@/domain/notify/tick";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { log } from "@/lib/log";
import { setUserArchived } from "@/repositories/users";
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

// 알림 행을 직접 넣는다(생성 시각을 정하려고 — 프로덕션 코드에 테스트 경로를 만들지 않는다).
async function insertPending(recipientId: string, entityId: string, createdAt: Date, message = `테스트 알림 · ${entityId}`) {
  await db.insert(notificationLog).values({
    conditionKind: "test",
    entity: "test",
    entityId,
    recipientId,
    round: 1,
    referenceDate: "2026-10-01",
    message,
    createdAt,
  });
}

function listedLines(text: string | undefined): string[] {
  return (text ?? "").split("\n").filter((line) => line.startsWith("- "));
}

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve: () => void = () => {};
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

async function until(condition: () => boolean | Promise<boolean>, ms = 3000): Promise<void> {
  const deadline = Date.now() + ms;
  while (!(await condition())) {
    if (Date.now() > deadline) throw new Error("조건이 제한 시간 안에 참이 되지 않았다");
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

const emptyKind = () => createTestConditionKind([]);

describe("이메일 묶음 규칙 (엣지 #14~#18)", () => {
  it("격리 — A 2건 · B 1건 → 메일 2통, 각 메일의 to와 본문에 그 사람 것만", async () => {
    const a = await createUser("iso-a");
    const b = await createUser("iso-b");
    const kind = createTestConditionKind([occ(a.id, "A-ONLY-1"), occ(a.id, "A-ONLY-2"), occ(b.id, "B-ONLY-1")]);
    const fake = createFakeEmailSender();
    await runTick({ conditionKinds: [kind], now: kst(WED), emailSender: fake.sender });

    expect(fake.sent).toHaveLength(2);
    const toA = fake.sent.filter((m) => m.to === a.email);
    const toB = fake.sent.filter((m) => m.to === b.email);
    expect(toA).toHaveLength(1);
    expect(toB).toHaveLength(1);
    expect(toA[0]?.text).toContain("A-ONLY-1");
    expect(toA[0]?.text).toContain("A-ONLY-2");
    expect(toA[0]?.text).not.toContain("B-ONLY-1");
    expect(toB[0]?.text).toContain("B-ONLY-1");
    expect(toB[0]?.text).not.toContain("A-ONLY");
    expect(toA[0]?.subject).toBe("PLANT8 알림 2건");
    expect(toB[0]?.subject).toBe("PLANT8 알림 1건");
  });

  it("빈 사람 — 알림이 없는 C에게는 메일이 없고, 발송기 null이면 0통 · claimed 0", async () => {
    const a = await createUser("empty-a");
    const c = await createUser("empty-c");
    const fake = createFakeEmailSender();
    await runTick({ conditionKinds: [createTestConditionKind([occ(a.id, "T-1")])], now: kst(WED), emailSender: fake.sender });
    expect(fake.calls.map((call) => call.message.to)).toEqual([a.email]);
    expect(fake.calls.some((call) => call.message.to === c.email)).toBe(false);

    const b = await createUser("empty-b");
    await runTick({ conditionKinds: [createTestConditionKind([occ(b.id, "T-2")])], now: kst("2026-10-08"), emailSender: null });
    const runs = await tickRuns();
    expect(runs[1]?.emailClaimed).toBe(0);
    expect(fake.calls).toHaveLength(1);
  });

  it("순서 — 본문 줄은 생성 시각 내림차순(최신 먼저), 같은 시각이면 id가 큰 행이 먼저", async () => {
    const a = await createUser("order-a");
    await insertPending(a.id, "MID", new Date("2026-10-06T02:00:00Z"));
    await insertPending(a.id, "OLD", new Date("2026-10-06T01:00:00Z"));
    await insertPending(a.id, "NEW", new Date("2026-10-06T03:00:00Z"));
    await insertPending(a.id, "SAME-1", new Date("2026-10-06T00:30:00Z"));
    await insertPending(a.id, "SAME-2", new Date("2026-10-06T00:30:00Z"));
    const fake = createFakeEmailSender();
    await runTick({ conditionKinds: [emptyKind()], now: kst(WED), emailSender: fake.sender });

    expect(listedLines(fake.sent[0]?.text)).toEqual([
      "- 테스트 알림 · NEW",
      "- 테스트 알림 · MID",
      "- 테스트 알림 · OLD",
      "- 테스트 알림 · SAME-2",
      "- 테스트 알림 · SAME-1",
    ]);
  });

  it("멱등 — 같은 날 재호출·새 알림에는 추가 메일이 없고, 새 행은 pending으로 다음 영업일 묶음에 들어간다", async () => {
    const a = await createUser("idem-a");
    const source: NotificationCandidate[] = [occ(a.id, "T-1")];
    const kind = createTestConditionKind(() => source);
    const fake = createFakeEmailSender();
    await runTick({ conditionKinds: [kind], now: kst(WED), emailSender: fake.sender });
    await runTick({ conditionKinds: [kind], now: kst(WED), emailSender: fake.sender });
    expect(fake.calls).toHaveLength(1);

    source.push(occ(a.id, "T-2"));
    await runTick({ conditionKinds: [kind], now: () => new Date("2026-10-07T05:00:00Z"), emailSender: fake.sender });
    expect(fake.calls).toHaveLength(1);
    const late = (await rowsFor(a.id)).find((row) => row.entityId === "T-2");
    expect(late?.emailStatus).toBe("pending");

    source.push(occ(a.id, "T-3", "2026-10-08"));
    await runTick({ conditionKinds: [kind], now: kst("2026-10-08"), emailSender: fake.sender });
    expect(fake.calls).toHaveLength(2);
    expect(fake.calls[1]?.message.to).toBe(a.email);
    expect(listedLines(fake.calls[1]?.message.text)).toEqual(["- 테스트 알림 · T-3", "- 테스트 알림 · T-2"]);
  });

  it("확정 실패 — rejected·EAUTH는 행 failed · email_failed 1 · 로그는 code뿐 · 같은 날 다시 보내지 않는다", async () => {
    const a = await createUser("rej-a");
    const b = await createUser("rej-b");
    const kind = createTestConditionKind([occ(a.id, "T-1"), occ(b.id, "T-2")]);
    const fake = createFakeEmailSender({
      outcomeFor: new Map([[b.email, { outcome: "rejected", code: "EAUTH" }]]),
    });
    const error = vi.spyOn(log, "error");
    try {
      await runTick({ conditionKinds: [kind], now: kst(WED), emailSender: fake.sender });
      expect(fake.sent.map((m) => m.to)).toEqual([a.email]);
      expect((await rowsFor(b.id))[0]?.emailStatus).toBe("failed");
      const inbox = await listMyNotifications({ id: b.id, roleId: null }, {}, { now: kst(WED) });
      expect(inbox.rows.map((row) => row.emailStatus)).toEqual(["failed"]);
      const runs = await tickRuns();
      expect(runs[0]).toMatchObject({ emailSent: 1, emailFailed: 1, emailUnknown: 0 });
      const failed = error.mock.calls.filter(([event]) => event === "notify.email_failed");
      expect(failed).toHaveLength(1);
      expect(failed[0]?.[1]).toEqual({ code: "EAUTH" });

      await runTick({ conditionKinds: [kind], now: kst(WED), emailSender: fake.sender });
      expect(fake.calls.filter((call) => call.message.to === b.email)).toHaveLength(1);
    } finally {
      error.mockRestore();
    }
  });

  it("로그 비노출 — 발송기 예외의 주소·호스트·사용자·비밀번호·본문이 어떤 로그에도 없고 행은 unknown", async () => {
    const a = await createUser("leak-a");
    const b = await createUser("leak-b");
    const body = "LEAK-BODY-결재-7731";
    const host = "smtp.leak-host.test.invalid";
    const user = "leak-smtp-user";
    const password = "leak-S3cret-pw";
    const kind = createTestConditionKind([occ(a.id, "T-1"), { ...occ(b.id, "T-2"), message: body }]);
    const thrown = Object.assign(new Error(`535 auth failed for ${user}:${password}@${host} rcpt ${b.email} body ${body}`), {
      code: "EAUTH",
    });
    const fake = createFakeEmailSender({ throwFor: new Map([[b.email, thrown]]) });
    const spies = [vi.spyOn(log, "error"), vi.spyOn(log, "warn"), vi.spyOn(log, "info")];
    try {
      const result = await runTick({ conditionKinds: [kind], now: kst(WED), emailSender: fake.sender });
      expect(result).toMatchObject({ status: "ok" });
      const logged = JSON.stringify(spies.flatMap((spy) => spy.mock.calls));
      for (const secret of [b.email, host, user, password, body]) expect(logged).not.toContain(secret);
      expect((await rowsFor(b.id))[0]?.emailStatus).toBe("unknown");
      expect((await tickRuns())[0]).toMatchObject({ emailSent: 1, emailFailed: 0, emailUnknown: 1 });
    } finally {
      for (const spy of spies) spy.mockRestore();
    }
  });

  it("미설정 뒤 켬 — 발송기 null tick(skipped) 뒤 같은 날 새 알림 + 발송기 → 새 건만 1통", async () => {
    const a = await createUser("later-a");
    const source: NotificationCandidate[] = [occ(a.id, "T-OLD")];
    const kind = createTestConditionKind(() => source);
    await runTick({ conditionKinds: [kind], now: kst(WED), emailSender: null });
    expect((await rowsFor(a.id))[0]?.emailStatus).toBe("skipped_no_smtp");

    source.push(occ(a.id, "T-NEW"));
    const fake = createFakeEmailSender();
    await runTick({ conditionKinds: [kind], now: () => new Date("2026-10-07T01:00:00Z"), emailSender: fake.sender });
    expect(fake.sent).toHaveLength(1);
    expect(listedLines(fake.sent[0]?.text)).toEqual(["- 테스트 알림 · T-NEW"]);
  });

  it("동시 tick — A 발송이 막힌 사이 tick 2는 A를 선점하지 않고 B만, 풀면 A에게 모두 합쳐 1통", async () => {
    expect(pool.options.max ?? 10).toBeGreaterThanOrEqual(2);
    const a = await createUser("conc-a");
    const b = await createUser("conc-b");
    const gate = deferred();
    const fake = createFakeEmailSender({ blockFor: new Map([[a.email, gate.promise]]) });
    try {
      const tick1 = runTick({
        conditionKinds: [createTestConditionKind([occ(a.id, "T-A")])],
        now: kst(WED),
        emailSender: fake.sender,
      });
      await until(() => fake.calls.length === 1);
      await runTick({
        conditionKinds: [createTestConditionKind([occ(b.id, "T-B")])],
        now: () => new Date("2026-10-07T00:01:00Z"),
        emailSender: fake.sender,
      });
      expect((await rowsFor(a.id))[0]?.emailStatus).toBe("sending");
      const runs = await tickRuns();
      expect(runs[1]).toMatchObject({ emailClaimed: 1, emailSent: 1 });
      expect(fake.sent.map((m) => m.to)).toEqual([b.email]);

      gate.resolve();
      await tick1;
      expect(fake.calls.filter((call) => call.message.to === a.email)).toHaveLength(1);
      expect((await rowsFor(a.id))[0]?.emailStatus).toBe("sent");
    } finally {
      gate.resolve();
    }
  });

  it("비영업일·잠금 경합 — KST 토요일 tick과 409 tick은 발송기를 부르지 않는다", async () => {
    const a = await createUser("off-a");
    const saturday = createFakeEmailSender();
    await runTick({ conditionKinds: [createTestConditionKind([occ(a.id, "T-1")])], now: kst("2026-10-10"), emailSender: saturday.sender });
    expect(saturday.calls).toHaveLength(0);

    const entered = deferred();
    const gate = deferred();
    const holder = createFakeEmailSender();
    const blocking = createTestConditionKind(async () => {
      entered.resolve();
      await gate.promise;
      return [occ(a.id, "T-2")];
    });
    const loser = createFakeEmailSender();
    try {
      const first = runTick({ conditionKinds: [blocking], now: kst(WED), emailSender: holder.sender });
      await entered.promise;
      const second = await runTick({ conditionKinds: [emptyKind()], now: kst(WED), emailSender: loser.sender });
      expect(second).toEqual({ status: "locked" });
      gate.resolve();
      await first;
      expect(loser.calls).toHaveLength(0);
      expect(holder.calls).toHaveLength(1);
    } finally {
      gate.resolve();
    }
  });

  it("많이 쌓인 행 — 사흘 45건은 한 통 · 첫 줄은 발송일 · 최신 20줄 · 외 25건 · 45행 모두 sent", async () => {
    const a = await createUser("bulk-a");
    const days = [
      { label: "MON", start: Date.parse("2026-10-05T01:00:00Z") },
      { label: "TUE", start: Date.parse("2026-10-06T01:00:00Z") },
      { label: "WED", start: Date.parse("2026-10-06T15:30:00Z") },
    ];
    for (const day of days) {
      for (let i = 0; i < 15; i += 1) {
        const tag = `${day.label}-${String(i).padStart(2, "0")}`;
        await insertPending(a.id, tag, new Date(day.start + i * 60_000), `알림 ${tag}`);
      }
    }
    const fake = createFakeEmailSender();
    await runTick({ conditionKinds: [emptyKind()], now: kst(WED), emailSender: fake.sender });

    expect(fake.sent).toHaveLength(1);
    const mail = fake.sent[0];
    expect(mail?.subject).toBe("PLANT8 알림 45건");
    const lines = (mail?.text ?? "").split("\n");
    expect(lines[0]).toBe("2026-10-07 알림 45건");
    const expected = [
      ...Array.from({ length: 15 }, (_, i) => `- 알림 WED-${String(14 - i).padStart(2, "0")}`),
      ...Array.from({ length: 5 }, (_, i) => `- 알림 TUE-${String(14 - i).padStart(2, "0")}`),
    ];
    expect(listedLines(mail?.text)).toEqual(expected);
    expect(lines).toContain("외 25건은 알림함에서 확인");
    expect(lines.indexOf("외 25건은 알림함에서 확인")).toBe(lines.indexOf(expected[19] ?? "") + 1);
    expect((mail?.text ?? "").includes("MON-")).toBe(false);
    const rows = await rowsFor(a.id);
    expect(rows).toHaveLength(45);
    expect(rows.every((row) => row.emailStatus === "sent")).toBe(true);
    expect((await tickRuns())[0]).toMatchObject({ emailClaimed: 1, emailSent: 1 });
  });

  it("보관 — 보관된 A는 가장 오래된 pending이어도 건너뛰고 B만 1통, 복원 뒤 같은 날 A에게 1통", async () => {
    const a = await createUser("arch-a");
    const b = await createUser("arch-b");
    await insertPending(a.id, "T-A", new Date("2026-10-06T01:00:00Z"));
    await insertPending(b.id, "T-B", new Date("2026-10-06T02:00:00Z"));
    await setUserArchived(SYSTEM_VIEWER, a.id, true);
    const fake = createFakeEmailSender();
    await runTick({ conditionKinds: [emptyKind()], now: kst(WED), emailSender: fake.sender });

    expect(fake.sent.map((m) => m.to)).toEqual([b.email]);
    const aRow = (await rowsFor(a.id))[0];
    expect(aRow?.emailStatus).toBe("pending");
    expect(aRow?.emailAttemptedAt).toBeNull();
    expect((await tickRuns())[0]).toMatchObject({ emailClaimed: 1, emailSent: 1 });

    await setUserArchived(SYSTEM_VIEWER, a.id, false);
    await runTick({ conditionKinds: [emptyKind()], now: () => new Date("2026-10-07T01:00:00Z"), emailSender: fake.sender });
    expect(fake.sent.map((m) => m.to)).toEqual([b.email, a.email]);
  });
});
