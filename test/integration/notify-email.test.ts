import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { Client, type PoolClient } from "pg";
import { describe, expect, it, vi } from "vitest";
import { db, pool } from "@/db/client";
import { notificationLog, notifyTickRuns } from "@/db/schema";
import { createAccount } from "@/domain/auth/accounts";
import { ensureHolidayCandidates } from "@/domain/holidays/candidates";
import {
  EMAIL_SEND_DEADLINE_MS,
  EMAIL_TX_WORST_MS,
  EMAIL_UNKNOWN_AFTER_MS,
  EMAIL_UNKNOWN_VISIBLE_DAYS,
  NOTIFY_TICK_BUDGET_MS,
  runEmailPhase,
} from "@/domain/notify/email-phase";
import { listMyNotifications } from "@/domain/notify/inbox";
import { runTick } from "@/domain/notify/tick";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { log } from "@/lib/log";
import { findLastEmailOutcome, findUnresolvedEmail, type recordEmailOutcome } from "@/repositories/notifications";
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

// ── Task 3: 결과 불명 · 겹친 tick · 요청 예산 · 대기 한도 (D-4216 · Codex 2차 #1·#2·#3·#6 · 3차 · 4차) ──

function unresolvedAt(now: Date) {
  return findUnresolvedEmail(SYSTEM_VIEWER, {
    now,
    unknownAfterMs: EMAIL_UNKNOWN_AFTER_MS,
    visibleDays: EMAIL_UNKNOWN_VISIBLE_DAYS,
  });
}

// DB 장애 — 결과 기록이 던진다(프로세스가 죽은 것과 같은 저장 상태를 만든다).
const brokenRecord: typeof recordEmailOutcome = () => Promise.reject(new Error("결과 기록 실패(주입)"));

function cap(n: number): () => Promise<number> {
  return () => Promise.resolve(n);
}

const at = (iso: string) => () => new Date(iso);

async function openBlocker(): Promise<Client> {
  const blocker = new Client({ connectionString: process.env.DATABASE_URL });
  await blocker.connect();
  await blocker.query("begin");
  return blocker;
}

async function closeBlocker(blocker: Client): Promise<void> {
  await blocker.query("rollback");
  await blocker.end();
}

async function insertRun(): Promise<number> {
  const [row] = await db
    .insert(notifyTickRuns)
    .values({ startedAt: kst(WED)(), finishedAt: kst(WED)(), kstDate: WED, businessDay: true })
    .returning({ id: notifyTickRuns.id });
  if (!row) throw new Error("실행 기록 삽입 실패");
  return row.id;
}

describe("결과 불명과 끊긴 실행 (D-4216 · Codex 2차 #1·#2 · #4)", () => {
  it("모호한 끊김 — indeterminate·ECONNECTION은 행 unknown · email_unknown 1 · 실패 0 · 1분 뒤에도 결과 불명 1 · 다시 보내지 않는다", async () => {
    const a = await createUser("amb-a");
    const kind = createTestConditionKind([occ(a.id, "T-1")]);
    const fake = createFakeEmailSender({
      outcomeFor: new Map([[a.email, { outcome: "indeterminate", code: "ECONNECTION" }]]),
    });
    const warn = vi.spyOn(log, "warn");
    try {
      await runTick({ conditionKinds: [kind], now: kst(WED), emailSender: fake.sender });
      expect((await rowsFor(a.id))[0]?.emailStatus).toBe("unknown");
      const runs = await tickRuns();
      expect(runs[0]).toMatchObject({ emailClaimed: 1, emailSent: 0, emailFailed: 0, emailUnknown: 1 });
      expect(runs[0]?.emailFinishedAt).toBeInstanceOf(Date);
      expect(await findLastEmailOutcome(SYSTEM_VIEWER)).toMatchObject({ failed: 0 });
      expect(await unresolvedAt(new Date("2026-10-07T00:01:00Z"))).toMatchObject({ bundles: 1 });
      const unknownLogs = warn.mock.calls.filter(([event]) => event === "notify.email_unknown");
      expect(unknownLogs).toHaveLength(1);
      expect(unknownLogs[0]?.[1]).toEqual({ code: "ECONNECTION" });

      await runTick({ conditionKinds: [kind], now: at("2026-10-07T02:00:00Z"), emailSender: fake.sender });
      expect(fake.calls).toHaveLength(1);
    } finally {
      warn.mockRestore();
    }
  });

  it("끊긴 실행(가) — 발송 성공 뒤 결과 기록이 던지면 tick이 오류 · 1통 · 행 sending · 결과 0 · 끝 표시 없음 · 다음 tick이 다시 보내지 않는다", async () => {
    const a = await createUser("cut-a");
    const kind = createTestConditionKind([occ(a.id, "T-1")]);
    const fake = createFakeEmailSender();
    await expect(
      runTick({ conditionKinds: [kind], now: kst(WED), emailSender: fake.sender, recordOutcome: brokenRecord }),
    ).rejects.toThrow("결과 기록 실패(주입)");
    expect(fake.sent).toHaveLength(1);
    expect((await rowsFor(a.id))[0]?.emailStatus).toBe("sending");
    const runs = await tickRuns();
    expect(runs[0]).toMatchObject({ emailClaimed: 1, emailSent: 0, emailFailed: 0, emailUnknown: 0 });
    expect(runs[0]?.emailFinishedAt).toBeNull();

    await runTick({ conditionKinds: [kind], now: at("2026-10-07T02:00:00Z"), emailSender: fake.sender });
    expect(fake.calls).toHaveLength(1);
  });

  it("끊긴 실행(나) — 발송기와 결과 기록이 모두 던지면 0통 · 같은 저장 상태 · 다음 tick이 다시 보내지 않는다", async () => {
    const a = await createUser("cut2-a");
    const kind = createTestConditionKind([occ(a.id, "T-1")]);
    const fake = createFakeEmailSender({ throwFor: new Map([[a.email, new Error("boom")]]) });
    await expect(
      runTick({ conditionKinds: [kind], now: kst(WED), emailSender: fake.sender, recordOutcome: brokenRecord }),
    ).rejects.toThrow("결과 기록 실패(주입)");
    expect(fake.sent).toHaveLength(0);
    expect((await rowsFor(a.id))[0]?.emailStatus).toBe("sending");
    const runs = await tickRuns();
    expect(runs[0]).toMatchObject({ emailClaimed: 1, emailSent: 0, emailFailed: 0, emailUnknown: 0 });
    expect(runs[0]?.emailFinishedAt).toBeNull();

    await runTick({ conditionKinds: [kind], now: at("2026-10-07T02:00:00Z"), emailSender: fake.sender });
    expect(fake.calls).toHaveLength(1);
  });

  it("가려지지 않음 — 09:00 끊긴 실행 뒤 09:01 성공한 실행이 와도 결과 불명은 10분 뒤부터 7일 동안 보인다", async () => {
    const a = await createUser("hide-a");
    const c = await createUser("hide-c");
    const fake = createFakeEmailSender();
    await expect(
      runTick({
        conditionKinds: [createTestConditionKind([occ(a.id, "T-A")])],
        now: kst(WED),
        emailSender: fake.sender,
        recordOutcome: brokenRecord,
      }),
    ).rejects.toThrow();
    await runTick({
      conditionKinds: [createTestConditionKind([occ(c.id, "T-C")])],
      now: at("2026-10-07T00:01:00Z"),
      emailSender: fake.sender,
    });
    const runs = await tickRuns();
    expect(runs[1]).toMatchObject({ emailClaimed: 1, emailSent: 1 });

    const last = await findLastEmailOutcome(SYSTEM_VIEWER);
    expect(last?.failed).toBe(0);
    expect(last?.at.toISOString()).toBe("2026-10-07T00:01:00.000Z");

    expect(await unresolvedAt(new Date("2026-10-07T00:05:00Z"))).toEqual({ bundles: 0, since: null });
    const shown = await unresolvedAt(new Date("2026-10-07T00:11:00Z"));
    expect(shown.bundles).toBe(1);
    expect(shown.since?.toISOString()).toBe("2026-10-07T00:00:00.000Z");
    const later = new Date(Date.parse("2026-10-07T00:00:00Z") + 7 * 86_400_000 + 60_000);
    expect((await unresolvedAt(later)).bundles).toBe(0);
  });
});

describe("겹친 tick과 선점 줄 세우기 (Codex 2차 #3 · 3차 추가 #1 · 4차 E3)", () => {
  it("겹친 tick의 미완 목록 — A가 X 발송에서 멈춘 사이 B가 C를 반만 넣으면 A·B 모두 C를 선점하지 않고, 다 들어간 뒤 C에게 1통 · 3줄", async () => {
    expect(pool.options.max ?? 10).toBeGreaterThanOrEqual(2);
    const x = await createUser("ovl-x");
    const c = await createUser("ovl-c");
    const gate = deferred();
    const fake = createFakeEmailSender({ blockFor: new Map([[x.email, gate.promise]]) });
    const cKind = createTestConditionKind([occ(c.id, "C-1"), occ(c.id, "C-2"), occ(c.id, "C-3")]);
    try {
      const tickA = runTick({
        conditionKinds: [createTestConditionKind([occ(x.id, "X-1")])],
        now: kst(WED),
        emailSender: fake.sender,
        batchMax: cap(10),
      });
      await until(() => fake.calls.length === 1);
      await runTick({ conditionKinds: [cKind], now: at("2026-10-07T00:01:00Z"), emailSender: fake.sender, batchMax: cap(2) });
      expect((await tickRuns())[1]?.incompleteRecipientIds).toEqual([c.id]);
      gate.resolve();
      await tickA;

      const cRows = await rowsFor(c.id);
      expect(cRows.map((row) => row.emailStatus)).toEqual(["pending", "pending"]);
      expect(fake.calls.filter((call) => call.message.to === c.email)).toHaveLength(0);

      await runTick({ conditionKinds: [cKind], now: at("2026-10-07T00:02:00Z"), emailSender: fake.sender, batchMax: cap(10) });
      const toC = fake.sent.filter((m) => m.to === c.email);
      expect(toC).toHaveLength(1);
      expect(listedLines(toC[0]?.text)).toHaveLength(3);
    } finally {
      gate.resolve();
    }
  });

  it("선점–삽입 줄 세우기 — A의 선점은 B가 쥔 tick 잠금을 기다렸다가 B가 커밋한 미완 {C}를 읽고 C를 고르지 않는다", async () => {
    expect(pool.options.max ?? 10).toBeGreaterThanOrEqual(3);
    const x = await createUser("line-x");
    const c = await createUser("line-c");
    const xGate = deferred();
    const bEntered = deferred();
    const bGate = deferred();
    const fake = createFakeEmailSender({ blockFor: new Map([[x.email, xGate.promise]]) });
    const cAll = [occ(c.id, "C-1"), occ(c.id, "C-2"), occ(c.id, "C-3")];
    const cBlocking = createTestConditionKind(async () => {
      bEntered.resolve();
      await bGate.promise;
      return cAll;
    });
    try {
      const tickA = runTick({
        conditionKinds: [createTestConditionKind([occ(x.id, "X-1")])],
        now: kst(WED),
        emailSender: fake.sender,
        batchMax: cap(10),
      });
      await until(() => fake.calls.length === 1);
      const tickB = runTick({
        conditionKinds: [cBlocking],
        now: at("2026-10-07T00:01:00Z"),
        emailSender: fake.sender,
        batchMax: cap(2),
      });
      await bEntered.promise;
      xGate.resolve();
      await until(async () => {
        const waiting = await db.execute<{ count: number }>(sql`
          select count(*)::int as count from pg_stat_activity
          where datname = current_database() and wait_event_type = 'Lock' and wait_event = 'advisory'
        `);
        return waiting.rows[0]?.count === 1;
      }, 3000);
      bGate.resolve();
      await Promise.all([tickA, tickB]);

      expect((await rowsFor(c.id)).map((row) => row.emailStatus)).toEqual(["pending", "pending"]);
      expect(fake.calls.filter((call) => call.message.to === c.email)).toHaveLength(0);
      expect(fake.sent.filter((m) => m.to === x.email)).toHaveLength(1);

      await runTick({
        conditionKinds: [createTestConditionKind(cAll)],
        now: at("2026-10-07T00:02:00Z"),
        emailSender: fake.sender,
        batchMax: cap(10),
      });
      const toC = fake.sent.filter((m) => m.to === c.email);
      expect(toC).toHaveLength(1);
      expect(listedLines(toC[0]?.text)).toHaveLength(3);
    } finally {
      xGate.resolve();
      bEntered.resolve();
      bGate.resolve();
    }
  });

  it("평가 실패 보류 — 부분 삽입 → 평가 실패 tick은 아무에게도 선점하지 않고, 복구 tick 뒤 A에게 3건 1통 · B에게 1통", async () => {
    const a = await createUser("evf-a");
    const b = await createUser("evf-b");
    let xBroken = false;
    const x = createTestConditionKind(
      () => {
        if (xBroken) throw new Error("x broke");
        return [occ(a.id, "A-1"), occ(a.id, "A-2"), occ(a.id, "A-3")];
      },
      { kind: "X" },
    );
    const y = createTestConditionKind([occ(b.id, "B-1")], { kind: "Y" });
    const fake = createFakeEmailSender();
    const error = vi.spyOn(log, "error");
    try {
      await runTick({ conditionKinds: [x], now: kst(WED), emailSender: fake.sender, batchMax: cap(1) });
      expect(await rowsFor(a.id)).toHaveLength(1);
      expect((await tickRuns())[0]?.incompleteRecipientIds).toEqual([a.id]);
      expect(fake.calls).toHaveLength(0);

      xBroken = true;
      await runTick({ conditionKinds: [x, y], now: at("2026-10-07T00:01:00Z"), emailSender: fake.sender, batchMax: cap(10) });
      const second = (await tickRuns())[1];
      expect(second).toMatchObject({ evaluationFailed: true, incompleteRecipientIds: [], emailClaimed: 0 });
      expect(fake.calls).toHaveLength(0);
      expect((await rowsFor(a.id)).map((row) => row.emailStatus)).toEqual(["pending"]);
      expect((await rowsFor(b.id)).map((row) => row.emailStatus)).toEqual(["pending"]);

      xBroken = false;
      await runTick({ conditionKinds: [x, y], now: at("2026-10-07T00:02:00Z"), emailSender: fake.sender, batchMax: cap(10) });
      expect((await tickRuns())[2]?.evaluationFailed).toBe(false);
      const toA = fake.sent.filter((m) => m.to === a.email);
      expect(toA).toHaveLength(1);
      expect(listedLines(toA[0]?.text)).toHaveLength(3);
      expect(fake.sent.filter((m) => m.to === b.email)).toHaveLength(1);
      expect(fake.calls.filter((call) => call.message.to === a.email)).toHaveLength(1);
    } finally {
      error.mockRestore();
    }
  });
});

describe("요청 예산과 발송 마감 (Codex 2차 #6)", () => {
  it("예산 — 호출마다 25초 흐르는 시계 · 받는 사람 넷 → 경과가 한도를 넘으면 선점하지 않고 남은 사람은 pending · 끝 표시 있음 · 기준 시각이 예산 끝이면 선점 0", async () => {
    const limit = NOTIFY_TICK_BUDGET_MS - (2 * EMAIL_TX_WORST_MS + EMAIL_SEND_DEADLINE_MS + 2_000);
    expect(limit).toBe(68_000);
    const people = [await createUser("bud-1"), await createUser("bud-2"), await createUser("bud-3"), await createUser("bud-4")];
    const kind = createTestConditionKind(people.map((p, i) => occ(p.id, `B-${i}`)));
    let clock = 0;
    const ticking = () => {
      const value = clock;
      clock += 25_000;
      return value;
    };
    const fake = createFakeEmailSender();
    await runTick({ conditionKinds: [kind], now: kst(WED), emailSender: fake.sender, requestStartedAtMs: 0, monotonicNow: ticking });

    // 0 · 25 · 50초는 한도 68초 안, 75초는 넘는다 → 세 명.
    expect(fake.calls).toHaveLength(3);
    const rows = (await Promise.all(people.map((p) => rowsFor(p.id)))).flat();
    const left = rows.filter((row) => row.emailStatus === "pending");
    expect(left).toHaveLength(1);
    expect(left[0]?.emailAttemptedAt).toBeNull();
    let runs = await tickRuns();
    expect(runs[0]).toMatchObject({ emailClaimed: 3, emailSent: 3 });
    expect(runs[0]?.emailFinishedAt).toBeInstanceOf(Date);

    await runTick({
      conditionKinds: [kind],
      now: at("2026-10-07T00:05:00Z"),
      emailSender: fake.sender,
      requestStartedAtMs: 0,
      monotonicNow: () => 170_000,
    });
    expect(fake.calls).toHaveLength(3);
    runs = await tickRuns();
    expect(runs[1]?.emailClaimed).toBe(0);
    expect(runs[1]?.emailFinishedAt).toBeInstanceOf(Date);
    expect((await rowsFor(left[0]?.recipientId ?? "")).map((row) => row.emailStatus)).toEqual(["pending"]);
  });

  it("발송 마감 — 신호를 받는 발송기가 풀리지 않는 대기에 걸리면 200ms 마감에 unknown·DEADLINE, 다음 사람으로 간다(1초 안)", async () => {
    const a = await createUser("dl-a");
    const b = await createUser("dl-b");
    await insertPending(a.id, "A-1", new Date("2026-10-06T01:00:00Z"));
    await insertPending(b.id, "B-1", new Date("2026-10-06T02:00:00Z"));
    const runId = await insertRun();
    const fake = createFakeEmailSender({ blockFor: new Map([[a.email, new Promise<void>(() => {})]]) });
    const warn = vi.spyOn(log, "warn");
    try {
      const started = Date.now();
      const result = await runEmailPhase(
        { runId, kstDate: WED, dayStart: new Date(`${WED}T00:00:00+09:00`), requestStartedAtMs: performance.now() },
        { sender: fake.sender, serviceUrl: "https://erp.test.invalid", now: kst(WED), monotonicNow: () => performance.now(), sendDeadlineMs: 200 },
      );
      expect(Date.now() - started).toBeLessThan(1000);
      expect(result).toEqual({ emailSent: 1, emailFailed: 0, emailUnknown: 1 });
      expect((await rowsFor(a.id))[0]?.emailStatus).toBe("unknown");
      expect((await rowsFor(b.id))[0]?.emailStatus).toBe("sent");
      expect(warn.mock.calls.filter(([event]) => event === "notify.email_unknown").map(([, f]) => f)).toEqual([{ code: "DEADLINE" }]);
    } finally {
      warn.mockRestore();
    }
  });

  it("발송 마감 — 신호를 무시하는 발송기도 이메일 단계의 경주가 마감 + grace에 unknown·DEADLINE으로 끝내고 다음 사람으로 간다(1초 안)", async () => {
    const a = await createUser("ign-a");
    const b = await createUser("ign-b");
    await insertPending(a.id, "A-1", new Date("2026-10-06T01:00:00Z"));
    await insertPending(b.id, "B-1", new Date("2026-10-06T02:00:00Z"));
    const runId = await insertRun();
    const fake = createFakeEmailSender({ blockFor: new Map([[a.email, new Promise<void>(() => {})]]), ignoreSignal: true });
    const warn = vi.spyOn(log, "warn");
    try {
      const started = Date.now();
      const result = await runEmailPhase(
        { runId, kstDate: WED, dayStart: new Date(`${WED}T00:00:00+09:00`), requestStartedAtMs: performance.now() },
        {
          sender: fake.sender,
          serviceUrl: "https://erp.test.invalid",
          now: kst(WED),
          monotonicNow: () => performance.now(),
          sendDeadlineMs: 200,
          sendGraceMs: 50,
        },
      );
      expect(Date.now() - started).toBeLessThan(1000);
      expect(result).toEqual({ emailSent: 1, emailFailed: 0, emailUnknown: 1 });
      expect((await rowsFor(a.id))[0]?.emailStatus).toBe("unknown");
      expect((await rowsFor(b.id))[0]?.emailStatus).toBe("sent");
      expect(warn.mock.calls.filter(([event]) => event === "notify.email_unknown").map(([, f]) => f)).toEqual([{ code: "DEADLINE" }]);
    } finally {
      warn.mockRestore();
    }
  }, 3_000);
});

describe("대기 한도 — 풀·문장·토큰·결과 기록 응답 정지 (Codex 3차 #6 · 4차 E4)", () => {
  it(
    "풀 대기 한도 — 풀 연결이 모두 잡힌 동안 tick은 7초 안에 500 tick_failed · 기록 0행, 풀면 200",
    async () => {
      const a = await createUser("pool-a");
      const kind = createTestConditionKind([occ(a.id, "T-1")]);
      const fake = createFakeEmailSender();
      const deps: Partial<NotifyTickHandlerDeps> = {
        config: CONFIG,
        verify: okVerify,
        runTick: (opts) => runTick({ ...opts, conditionKinds: [kind], now: kst(WED), emailSender: fake.sender }),
      };
      const held: PoolClient[] = [];
      try {
        for (let i = 0; i < (pool.options.max ?? 10); i += 1) held.push(await pool.connect());
        const started = Date.now();
        const response = await handleNotifyTick(tickRequest(), deps);
        expect(Date.now() - started).toBeLessThan(7000);
        expect(response.status).toBe(500);
        expect(await response.json()).toEqual({ error: "tick_failed" });
      } finally {
        for (const client of held) client.release();
      }
      expect(await tickRuns()).toHaveLength(0);
      expect(await db.select().from(notificationLog)).toHaveLength(0);
      expect((await handleNotifyTick(tickRequest(), deps)).status).toBe(200);
    },
    20_000,
  );

  it(
    "문장 대기 한도 — holidays 잠금 동안 10초 안에 500, 공휴일 생성 뒤 settings_simple 잠금 동안(기본 batchMax) 10초 안에 500 · 둘 다 기록 0행",
    async () => {
      const a = await createUser("stmt-a");
      const kind = createTestConditionKind([occ(a.id, "T-1")]);
      const fake = createFakeEmailSender();
      const deps: Partial<NotifyTickHandlerDeps> = {
        config: CONFIG,
        verify: okVerify,
        runTick: (opts) => runTick({ ...opts, conditionKinds: [kind], now: kst(WED), emailSender: fake.sender }),
      };

      let blocker = await openBlocker();
      try {
        await blocker.query("lock table holidays in access exclusive mode");
        const started = Date.now();
        const response = await handleNotifyTick(tickRequest(), deps);
        expect(Date.now() - started).toBeLessThan(10_000);
        expect(response.status).toBe(500);
      } finally {
        await closeBlocker(blocker);
      }
      expect(await tickRuns()).toHaveLength(0);
      expect(await db.select().from(notificationLog)).toHaveLength(0);

      await ensureHolidayCandidates(2026);
      await ensureHolidayCandidates(2027);
      blocker = await openBlocker();
      try {
        await blocker.query("lock table settings_simple in access exclusive mode");
        const started = Date.now();
        const response = await handleNotifyTick(tickRequest(), deps);
        expect(Date.now() - started).toBeLessThan(10_000);
        expect(response.status).toBe(500);
      } finally {
        await closeBlocker(blocker);
      }
      expect(await tickRuns()).toHaveLength(0);
      expect(await db.select().from(notificationLog)).toHaveLength(0);
    },
    20_000,
  );

  it("토큰 검증 마감 — 끝나지 않는 verify는 oidcDeadlineMs 50에 500 tick_failed(1초 안) · runTick 호출 0", async () => {
    let ran = 0;
    const started = Date.now();
    const response = await handleNotifyTick(tickRequest(), {
      config: CONFIG,
      verify: () => new Promise(() => {}),
      oidcDeadlineMs: 50,
      runTick: () => {
        ran += 1;
        return Promise.resolve({ status: "locked" });
      },
    });
    expect(Date.now() - started).toBeLessThan(1000);
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "tick_failed" });
    expect(ran).toBe(0);
  });

  it(
    "결과 기록 응답 정지 — notification_log가 잠긴 동안 결과 기록은 클라이언트 마감으로 1.5초 안에 500 · 행 sending · 끝 표시 없음 · 다시 보내지 않는다",
    async () => {
      const a = await createUser("hang-a");
      const kind = createTestConditionKind([occ(a.id, "T-1")]);
      const gate = deferred();
      const fake = createFakeEmailSender({ blockFor: new Map([[a.email, gate.promise]]) });
      const blocker = new Client({ connectionString: process.env.DATABASE_URL });
      await blocker.connect();
      try {
        const pending = handleNotifyTick(tickRequest(), {
          config: CONFIG,
          verify: okVerify,
          runTick: (opts) =>
            runTick({ ...opts, conditionKinds: [kind], now: kst(WED), emailSender: fake.sender, txDeadlineMs: 300 }),
        });
        await until(() => fake.calls.length === 1);
        await blocker.query("begin");
        await blocker.query("lock table notification_log in access exclusive mode");
        const started = Date.now();
        gate.resolve();
        const response = await pending;
        expect(Date.now() - started).toBeLessThan(1500);
        expect(response.status).toBe(500);
        expect(await response.json()).toEqual({ error: "tick_failed" });
      } finally {
        gate.resolve();
        await blocker.query("rollback").catch(() => {});
        await blocker.end();
      }

      // 파기한 연결의 서버 백엔드가 COMMIT 없이 끝나 notification_log 잠금이 사라질 때까지(6초 한도).
      await until(async () => {
        const locks = await db.execute<{ count: number }>(sql`
          select count(*)::int as count from pg_locks
          where relation = 'notification_log'::regclass and pid <> pg_backend_pid()
        `);
        return locks.rows[0]?.count === 0;
      }, 6000);

      expect((await rowsFor(a.id))[0]?.emailStatus).toBe("sending");
      expect((await tickRuns())[0]?.emailFinishedAt).toBeNull();
      await runTick({ conditionKinds: [kind], now: at("2026-10-07T02:00:00Z"), emailSender: fake.sender });
      expect(fake.calls).toHaveLength(1);
    },
    15_000,
  );
});
