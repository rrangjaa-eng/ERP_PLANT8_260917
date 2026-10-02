import { randomUUID } from "node:crypto";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db/client";
import { certPrizes, certSubmissions, notificationLog } from "@/db/schema";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { SYSADMIN_ROLE_ID } from "@/domain/permissions/roles";
import { createAccount } from "@/domain/auth/accounts";
import { insertRole } from "@/repositories/roles";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { setUserArchived } from "@/repositories/users";
import { getSettingValue, setSettingValue } from "@/domain/settings/registry";
import { CERT_ENABLED, CERT_RETENTION_YEARS } from "@/domain/settings/keys";
import { CERT_CONSENT_VERSION } from "@/domain/certs/consent";
import { submitCertificate, type SubmitCertificateInput } from "@/domain/certs/intake";
import { ageSubmissionsForTest, createCertEvent, signaturePngFixture } from "@/test/e2e/helpers/cert";
import { leakPatternsFor, scanForLeaks } from "@/test/e2e/helpers/cert-leak";

// 04.3-10 Task 1 ⑤-b — 제출 한도 알림 cert_submit_limit(새 흐름 설계 /cso E10 · T-04.3-428). 한도 셈 · throttled는
// 04.3-15. 이 플랜은 잠근 트랜잭션 안에서 「행사 15분 창 셈이 한도에 닿음」 또는 「누적(대조 제외 뺀) 제출이 알림 임계에
// 처음 닿음」이면 받는 사람(certs.qr 쓰기 ∧ certs.events 보기 · 보관 안 됨)마다 알림 행 하나를 같은 트랜잭션에 넣는다
// — 기존 중복 키라 행사당 한 번. W = 1이면 창 한도 40 · 누적 임계 60.

const VALUE = 73_519;
const SUBMITTER_NAME = "한도시험";
const SUBMITTER_PHONE = "010-5512-9087";

beforeEach(async () => {
  await setSettingValue(SYSTEM_VIEWER, CERT_ENABLED, true);
});

async function roleWith(opts: { eventsView: boolean; qrWrite: boolean; prizeValue?: boolean }): Promise<string> {
  const roleId = `role-limit-it-${randomUUID()}`;
  await insertRole(SYSTEM_VIEWER, { id: roleId, name: `한도 ${roleId.slice(-8)}`, sortOrder: 99 });
  await upsertPermission(SYSTEM_VIEWER, { roleId, menu: "certs.events", action: "view", allowed: opts.eventsView });
  await upsertPermission(SYSTEM_VIEWER, { roleId, menu: "certs.qr", action: "write", allowed: opts.qrWrite });
  await upsertVisibility(SYSTEM_VIEWER, { roleId, infoItem: "cert_event.value", visible: true });
  await upsertVisibility(SYSTEM_VIEWER, { roleId, infoItem: "cert_prize.value", visible: opts.prizeValue ?? true });
  return roleId;
}

async function user(roleId: string, name: string): Promise<string> {
  const { userId } = await createAccount(SYSTEM_VIEWER, { email: `limit-${randomUUID()}@example.test`, name, roleId });
  return userId;
}

// 받는 사람 고정물 — 경영관리(받음) · 같은 조합 보관됨(안 받음) · certs.qr 쓰기만(안 받음) · 시드 시스템 관리자 계급
// (certs.qr 쓰기 · certs.events 보기지만 cert_prize.value 꺼짐 — 행동할 수 없어 안 받음, W5 a · 5928674957) ·
// 같은 조합에 cert_prize.value만 꺼진 계급(안 받음).
async function recipients() {
  const managerRole = await roleWith({ eventsView: true, qrWrite: true });
  const manager = await user(managerRole, "경영 이수아");
  const archived = await user(managerRole, "경영 퇴사자");
  await setUserArchived(SYSTEM_VIEWER, archived, true);
  const qrOnly = await user(await roleWith({ eventsView: false, qrWrite: true }), "QR만");
  const sysadmin = await user(SYSADMIN_ROLE_ID, "담당 박서연");
  const noValue = await user(await roleWith({ eventsView: true, qrWrite: true, prizeValue: false }), "가액 없음");
  return { manager, archived, qrOnly, sysadmin, noValue };
}

async function openEvent() {
  const event = await createCertEvent({ name: "한도 행사", prizes: [{ name: "한도 경품", unitValueKrw: VALUE, winnerCount: 1 }] });
  const [prizeId] = event.prizeIds;
  if (!event.token || !prizeId) throw new Error("열린 행사를 만들지 못했다");
  return { ...event, token: event.token, prizeId };
}

async function input(prizeId: string, idempotencyKey = randomUUID()): Promise<SubmitCertificateInput> {
  return {
    prizeId,
    idempotencyKey,
    consentVersion: CERT_CONSENT_VERSION,
    retentionYears: await getSettingValue(CERT_RETENTION_YEARS),
    name: SUBMITTER_NAME,
    rrnFront6: "930412",
    rrnBack7: "2123458",
    phone: SUBMITTER_PHONE,
    consent: true,
    signaturePngBase64: signaturePngFixture().toString("base64"),
    rrnRecheckConfirmed: true,
  };
}

let ipSeq = 0;
function nextIp(): string {
  ipSeq += 1;
  return `198.51.${Math.floor(ipSeq / 250)}.${(ipSeq % 250) + 1}`;
}

async function submitMany(ev: { token: string; prizeId: string }, count: number, now?: Date): Promise<void> {
  for (let i = 0; i < count; i++) {
    const result = await submitCertificate(ev.token, await input(ev.prizeId), nextIp(), now ? { now: () => now } : {});
    if (result.kind !== "saved") throw new Error(`${i + 1}번째 제출이 ${result.kind}`);
  }
}

async function alertsOf(eventId: string) {
  return db
    .select()
    .from(notificationLog)
    .where(and(eq(notificationLog.entityId, eventId), eq(notificationLog.conditionKind, "cert_submit_limit")));
}

describe("cert_submit_limit — 행사 15분 창 셈이 행사 한도에 닿음(W = 1 → 40)", () => {
  it("39건 → 0 · 40번째 saved → 받는 사람 1명에게 1행 · 41번째 throttled · 16분 뒤 창이 다시 40에 닿아도 새 행 0", async () => {
    const people = await recipients();
    const ev = await openEvent();

    await submitMany(ev, 39);
    expect(await alertsOf(ev.eventId)).toHaveLength(0);

    await submitMany(ev, 1);
    const rows = await alertsOf(ev.eventId);
    expect(rows.map((r) => r.recipientId)).toEqual([people.manager]);
    expect(rows[0]).toMatchObject({ entity: "cert_event", round: 1, emailStatus: "pending", message: `제출 한도 도달 · ${ev.eventName}` });
    // 문장에 가액 · 제출자 이름 · 연락처가 없다(공용 누수 도우미 + 이름 · 연락처 직접).
    expect(scanForLeaks(rows[0]?.message ?? "", leakPatternsFor([VALUE]))).toEqual([]);
    expect(rows[0]?.message).not.toContain(SUBMITTER_NAME);
    expect(rows[0]?.message).not.toMatch(/5512|9087/);

    const throttled = await submitCertificate(ev.token, await input(ev.prizeId), nextIp());
    expect(throttled.kind).toBe("throttled");
    expect(await alertsOf(ev.eventId)).toHaveLength(1);

    const later = new Date(Date.now() + 16 * 60_000);
    await submitMany(ev, 40, later);
    expect(await alertsOf(ev.eventId)).toHaveLength(1);
  }, 120_000);
});

describe("cert_submit_limit — 누적(대조 제외 뺀) 제출이 알림 임계에 처음 닿음(W = 1 → 60)", () => {
  it("창 한도 아래로 시간을 벌려 59건(대조 제외 2건은 안 센다) → 0 · 60번째 → 1행 · 61번째 → 0", async () => {
    const people = await recipients();
    const ev = await openEvent();

    await submitMany(ev, 30);
    await ageSubmissionsForTest(ev.eventId, { count: 30, minutes: 16 });

    // 대조 제외 2건 — 누적 셈에서 빠진다.
    await submitMany(ev, 2);
    const excluded = await db
      .select({ id: certSubmissions.id })
      .from(certSubmissions)
      .where(and(eq(certSubmissions.eventId, ev.eventId), isNull(certSubmissions.excludedAt)))
      .orderBy(certSubmissions.submittedAt)
      .limit(32);
    const lastTwo = excluded.slice(-2).map((r) => r.id);
    await db.update(certSubmissions).set({ excludedAt: new Date() }).where(inArray(certSubmissions.id, lastTwo));

    await submitMany(ev, 29);
    expect(await alertsOf(ev.eventId)).toHaveLength(0);

    await submitMany(ev, 1);
    expect((await alertsOf(ev.eventId)).map((r) => r.recipientId)).toEqual([people.manager]);

    await submitMany(ev, 1);
    expect(await alertsOf(ev.eventId)).toHaveLength(1);
  }, 120_000);
});

describe("cert_submit_limit — 임계가 제출 사이에 낮아진 경우(당첨 수 축소)", () => {
  it("W = 30(누적 임계 90)에서 65건 → 0 · 당첨 수를 1로 줄인 뒤 제출(누적 66 > 60) → 받는 사람 1명에게 1행 · 다음 제출은 새 행 0", async () => {
    const people = await recipients();
    const event = await createCertEvent({ name: "한도 축소 행사", prizes: [{ name: "축소 경품", unitValueKrw: VALUE, winnerCount: 30 }] });
    const [prizeId] = event.prizeIds;
    if (!event.token || !prizeId) throw new Error("열린 행사를 만들지 못했다");
    const ev = { token: event.token, prizeId };

    await submitMany(ev, 40);
    await ageSubmissionsForTest(event.eventId, { count: 40, minutes: 16 });
    await submitMany(ev, 25);
    expect(await alertsOf(event.eventId)).toHaveLength(0);

    await db.update(certPrizes).set({ winnerCount: 1 }).where(eq(certPrizes.id, prizeId));

    await submitMany(ev, 1);
    expect((await alertsOf(event.eventId)).map((r) => r.recipientId)).toEqual([people.manager]);

    await submitMany(ev, 1);
    expect(await alertsOf(event.eventId)).toHaveLength(1);
  }, 120_000);
});

describe("cert_submit_limit — 제출과 같은 트랜잭션", () => {
  it("알림 INSERT가 던지면 그 제출도 저장 0(결과 불명) → 같은 키 재시도 saved + 알림 1행", async () => {
    const people = await recipients();
    const ev = await openEvent();
    await submitMany(ev, 39);

    const key = randomUUID();
    const failing = submitCertificate(ev.token, await input(ev.prizeId, key), nextIp(), {
      insertEventNotifications: () => Promise.reject(new Error("알림 INSERT 실패 주입")),
    });
    await expect(failing).rejects.toThrow("알림 INSERT 실패 주입");
    expect(await db.select().from(certSubmissions).where(eq(certSubmissions.eventId, ev.eventId))).toHaveLength(39);
    expect(await alertsOf(ev.eventId)).toHaveLength(0);

    const retried = await submitCertificate(ev.token, await input(ev.prizeId, key), nextIp());
    expect(retried.kind).toBe("saved");
    expect((await alertsOf(ev.eventId)).map((r) => r.recipientId)).toEqual([people.manager]);
  }, 120_000);
});
