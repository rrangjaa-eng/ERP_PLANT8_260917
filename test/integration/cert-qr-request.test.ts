import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db/client";
import { actionLog, certEvents, certPrizes, notificationLog } from "@/db/schema";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { DEFAULT_ROLE_ID, SYSADMIN_ROLE_ID } from "@/domain/permissions/roles";
import { ForbiddenError } from "@/domain/permissions/can";
import { createAccount } from "@/domain/auth/accounts";
import { insertRole } from "@/repositories/roles";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { setUserArchived } from "@/repositories/users";
import { getSettingValue, setSettingValue } from "@/domain/settings/registry";
import { CERT_CONTACT_PHONE, CERT_ENABLED } from "@/domain/settings/keys";
import { generateQr, getEventDetail, listEvents, requestQr, savePrizes } from "@/domain/certs/events";
import { loadIntake, submitCertificate } from "@/domain/certs/intake";
import { CERT_CONSENT_VERSION } from "@/domain/certs/consent";
import { CERT_RETENTION_YEARS } from "@/domain/settings/keys";
import { Client } from "pg";
import { pool } from "@/db/client";
import { closeCertEventForTest, createCertEvent, seedIpSubmissionsForTest, signaturePngFixture } from "@/test/e2e/helpers/cert";
import { leakPatternsFor, scanForLeaks } from "@/test/e2e/helpers/cert-leak";
import { waitForLockWaiter } from "@/test/integration/lock-race";
import { runTick } from "@/domain/notify/tick";
import { decrypt } from "@/lib/crypto";
import { addDays, kstDayStart, kstToday } from "@/lib/kst-date";
import { log } from "@/lib/log";
import { createFakeEmailSender } from "@/test/support/fake-email-sender";

// 04.3-10 — 「QR 생성 신청」(requestQr) → 알림함(cert_qr_request) → 경영관리 「QR 생성」(generateQr) → 신청자 알림
// (cert_qr_created). 권한 키 certs.qr · 받는 사람 = certs.qr 쓰기 ∧ certs.events 보기(E11) · 가액 정보 항목
// cert_prize.value(E12) · 잠금 null → notFound(E13) · 설정은 트랜잭션 전(E27) · 문의 전화 재찍기(E28) ·
// document_create(E34). 매 테스트 전 setup.ts가 TRUNCATE + 시드한다(사용자 0명에서 시작).

const PHONE = "02-123-4567";

beforeEach(async () => {
  await setSettingValue(SYSTEM_VIEWER, CERT_ENABLED, true);
  await setSettingValue(SYSTEM_VIEWER, CERT_CONTACT_PHONE, PHONE);
});

async function makeUser(roleId: string, name: string): Promise<Viewer & { email: string }> {
  const email = `qr-${randomUUID()}@example.test`;
  const { userId } = await createAccount(SYSTEM_VIEWER, { email, name, roleId });
  return { id: userId, roleId, email };
}

// 경영관리 고정물 계급(시스템 관리자 아님) — 계급 이름을 코드가 보지 않는다. 메뉴 · 정보 항목만으로 정한다.
async function makeRole(opts: { eventsView?: boolean; eventsWrite?: boolean; qrWrite?: boolean; prizeValue?: boolean }) {
  const roleId = `role-qr-it-${randomUUID()}`;
  await insertRole(SYSTEM_VIEWER, { id: roleId, name: `통합 ${roleId.slice(-8)}`, sortOrder: 99 });
  await upsertPermission(SYSTEM_VIEWER, { roleId, menu: "certs.events", action: "view", allowed: opts.eventsView ?? false });
  await upsertPermission(SYSTEM_VIEWER, { roleId, menu: "certs.events", action: "write", allowed: opts.eventsWrite ?? false });
  await upsertPermission(SYSTEM_VIEWER, { roleId, menu: "certs.qr", action: "write", allowed: opts.qrWrite ?? false });
  await upsertVisibility(SYSTEM_VIEWER, { roleId, infoItem: "cert_event.value", visible: true });
  await upsertVisibility(SYSTEM_VIEWER, { roleId, infoItem: "cert_prize.value", visible: opts.prizeValue ?? false });
  return roleId;
}

const managerRole = () => makeRole({ eventsView: true, qrWrite: true, prizeValue: true });

function future(days: number): string {
  return addDays(kstToday(new Date()), days);
}

async function notificationsOf(eventId: string, kind: string) {
  return db
    .select()
    .from(notificationLog)
    .where(and(eq(notificationLog.entityId, eventId), eq(notificationLog.conditionKind, kind)));
}

async function logsOf(entityId: string, actionType: string) {
  return db
    .select()
    .from(actionLog)
    .where(and(eq(actionLog.entityId, entityId), eq(actionLog.actionType, actionType)));
}

async function eventRow(eventId: string) {
  const [row] = await db.select().from(certEvents).where(eq(certEvents.id, eventId));
  if (!row) throw new Error("행사 행 없음");
  return row;
}

async function requestOk(viewer: Viewer, overrides: { name?: string; wonOn?: string; requestId?: string } = {}) {
  const result = await requestQr(viewer, {
    name: overrides.name ?? `쇼케이스-${randomUUID().slice(0, 6)}`,
    wonOn: overrides.wonOn ?? future(10),
    requestId: overrides.requestId ?? randomUUID(),
  });
  if (result.kind !== "ok") throw new Error(`신청 실패: ${result.kind}`);
  return result.eventId;
}

const ONE_PRIZE = { inserts: [{ key: "n1", name: "갤럭시 탭 S10", unitValue: "73,519", delivery: "현장", winnerCount: "1" }] };

describe("requestQr — 신청(N1 a): 행사 신청됨 + 알림 한 트랜잭션", () => {
  it("PM 신청 → 신청됨 · 토큰 · 마감 없음 · 받는 사람마다 알림 1 · 보관된 사람 0 · document_create 1줄", async () => {
    const pm = await makeUser(DEFAULT_ROLE_ID, "기획 김민지");
    const role = await managerRole();
    const manager = await makeUser(role, "경영 이수아");
    const archived = await makeUser(role, "경영 퇴사자");
    await setUserArchived(SYSTEM_VIEWER, archived.id, true);

    const wonOn = future(10);
    const eventId = await requestOk(pm, { name: "아이오닉9 쇼케이스", wonOn });

    const row = await eventRow(eventId);
    expect(row).toMatchObject({ tokenHash: null, tokenEncrypted: null, expiresAt: null, qrCreatedAt: null, createdBy: pm.id });
    expect(row.contactPhone).toBe(await getSettingValue(CERT_CONTACT_PHONE));

    const rows = await notificationsOf(eventId, "cert_qr_request");
    expect(rows.map((r) => r.recipientId)).toEqual([manager.id]);
    expect(rows[0]).toMatchObject({
      entity: "cert_event",
      round: 1,
      emailStatus: "pending",
      message: `QR 생성 신청 · 아이오닉9 쇼케이스 · ${wonOn} · 기획 김민지`,
    });

    const logs = await logsOf(eventId, "document_create");
    expect(logs).toHaveLength(1);
    expect(logs[0]?.entity).toBe("cert_event");
    expect(JSON.stringify(logs[0]?.detail)).not.toMatch(/쇼케이스|김민지|\d{2,3}-\d{3,4}-\d{4}/);

    const list = await listEvents(pm);
    expect(list.kind === "ok" && list.events.find((e) => e.id === eventId)?.status).toBe("requested");
  });

  it("같은 requestId 재전송 → 같은 행사 · 알림 · 로그 그대로(E34)", async () => {
    const pm = await makeUser(DEFAULT_ROLE_ID, "기획 김민지");
    await makeUser(await managerRole(), "경영 이수아");
    const requestId = randomUUID();
    const first = await requestOk(pm, { requestId });
    const second = await requestOk(pm, { requestId });
    expect(second).toBe(first);
    expect(await db.select().from(certEvents)).toHaveLength(1);
    expect(await notificationsOf(first, "cert_qr_request")).toHaveLength(1);
    expect(await logsOf(first, "document_create")).toHaveLength(1);
  });

  it("certs.events 쓰기 없음 → Forbidden · 문의 전화 비움 → contactMissing(행 0) · 지난 날짜 · 빈 이름 → invalid", async () => {
    const viewer = await makeUser(await makeRole({ eventsView: true }), "보기 전용");
    await expect(requestQr(viewer, { name: "x", wonOn: future(1), requestId: randomUUID() })).rejects.toBeInstanceOf(ForbiddenError);

    const pm = await makeUser(DEFAULT_ROLE_ID, "기획 김민지");
    expect(await requestQr(pm, { name: "", wonOn: addDays(kstToday(new Date()), -1), requestId: randomUUID() })).toEqual({
      kind: "invalid",
      fieldErrors: { name: "required", wonOn: "past" },
    });
    await setSettingValue(SYSTEM_VIEWER, CERT_CONTACT_PHONE, "");
    expect(await requestQr(pm, { name: "x", wonOn: future(1), requestId: randomUUID() })).toEqual({ kind: "contactMissing" });
    expect(await db.select().from(certEvents)).toHaveLength(0);
  });
});

describe("받는 사람 · 범위(E11 · E22)", () => {
  it("certs.qr 쓰기만 있고 certs.events 보기가 없는 계급 → 알림 0 · 목록 · 상세 · generateQr 404", async () => {
    const pm = await makeUser(DEFAULT_ROLE_ID, "기획 김민지");
    const qrOnly = await makeUser(await makeRole({ qrWrite: true, prizeValue: true }), "QR만");
    const eventId = await requestOk(pm);
    expect((await notificationsOf(eventId, "cert_qr_request")).map((r) => r.recipientId)).not.toContain(qrOnly.id);
    expect(await listEvents(qrOnly)).toEqual({ kind: "notFound" });
    expect(await getEventDetail(qrOnly, eventId)).toEqual({ kind: "notFound" });
    expect(await generateQr(qrOnly, eventId, { requestId: randomUUID(), changes: ONE_PRIZE })).toEqual({ kind: "notFound" });
  });

  it("비시스템관리자 경영관리 고정물 → 알림 1 · 목록 · 상세(가액 키 있음) ok · PM 상세에는 가액 키가 없다", async () => {
    const pm = await makeUser(DEFAULT_ROLE_ID, "기획 김민지");
    const manager = await makeUser(await managerRole(), "경영 이수아");
    const eventId = await requestOk(pm);
    expect((await notificationsOf(eventId, "cert_qr_request")).map((r) => r.recipientId)).toEqual([manager.id]);

    const list = await listEvents(manager);
    expect(list.kind === "ok" && list.events.some((e) => e.id === eventId)).toBe(true);

    expect(await generateQr(manager, eventId, { requestId: randomUUID(), changes: { inserts: [{ ...ONE_PRIZE.inserts[0]!, unitValue: "1,290,000" }] } })).toEqual({ kind: "ok" });

    const forManager = await getEventDetail(manager, eventId);
    expect(forManager.kind).toBe("ok");
    if (forManager.kind !== "ok") return;
    expect(forManager.event.canManagePrizes).toBe(true);
    expect(forManager.event.prizes?.[0]).toMatchObject({ name: "갤럭시 탭 S10", unitValueKrw: 1_290_000, quantityCounts: [] });

    const forPm = await getEventDetail(pm, eventId);
    expect(forPm.kind).toBe("ok");
    if (forPm.kind !== "ok") return;
    expect(forPm.event.canManagePrizes).toBe(false);
    const pmPrize = forPm.event.prizes?.[0] ?? {};
    expect(Object.keys(pmPrize)).not.toContain("unitValueKrw");
    expect(Object.keys(pmPrize)).not.toContain("quantityCounts");
    expect(Object.keys(pmPrize)).not.toContain("purgeTargetCount");
    expect(JSON.stringify(forPm)).not.toMatch(/1,?290,?000/);
  });

  it("cert_prize.value가 꺼진 시스템 관리자 계급(certs.qr 쓰기 · certs.events 보기)은 신청 알림을 받지 않는다 — 행동할 수 있는 사람만(W5 a · 5928674957)", async () => {
    const pm = await makeUser(DEFAULT_ROLE_ID, "기획 김민지");
    const sysadmin = await makeUser(SYSADMIN_ROLE_ID, "담당 박서연");
    const manager = await makeUser(await managerRole(), "경영 이수아");
    const eventId = await requestOk(pm);
    expect((await notificationsOf(eventId, "cert_qr_request")).map((r) => r.recipientId)).toEqual([manager.id]);
    // 받지 않는 까닭 — 그 사람은 「QR 생성」을 할 수 없다(E12 같은 두 조건).
    await expect(generateQr(sysadmin, eventId, { requestId: randomUUID(), changes: ONE_PRIZE })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("신청자가 certs.qr도 가지면 그 사람 행 0 · 생성자 = 신청자면 cert_qr_created 0", async () => {
    const both = await makeUser(await makeRole({ eventsView: true, eventsWrite: true, qrWrite: true, prizeValue: true }), "겸직");
    const eventId = await requestOk(both);
    expect((await notificationsOf(eventId, "cert_qr_request")).map((r) => r.recipientId)).not.toContain(both.id);
    expect(await generateQr(both, eventId, { requestId: randomUUID(), changes: ONE_PRIZE })).toEqual({ kind: "ok" });
    expect(await notificationsOf(eventId, "cert_qr_created")).toHaveLength(0);
  });

  it("받는 사람 0명 → ok · 알림 0 · log.warn(cert.qr_request_no_recipient, {eventId}) 1(E22)", async () => {
    // 시드 시스템 관리자 계급은 certs.qr을 갖지만 사용자가 0명이다(setup TRUNCATE) — PM 하나뿐.
    const pm = await makeUser(DEFAULT_ROLE_ID, "기획 김민지");
    const warn = vi.spyOn(log, "warn");
    try {
      const eventId = await requestOk(pm);
      expect(await notificationsOf(eventId, "cert_qr_request")).toHaveLength(0);
      const calls = warn.mock.calls.filter(([event]) => event === "cert.qr_request_no_recipient");
      expect(calls).toEqual([["cert.qr_request_no_recipient", { eventId }]]);
    } finally {
      warn.mockRestore();
    }
  });

  it("다음 영업일 tick의 이메일 단계가 신청 알림을 묶음에 담고 email_status가 바뀐다(04.2 규칙)", async () => {
    const pm = await makeUser(DEFAULT_ROLE_ID, "기획 김민지");
    const manager = await makeUser(await managerRole(), "경영 이수아");
    const eventId = await requestOk(pm, { name: "메일 묶음 행사" });
    const fake = createFakeEmailSender();
    // 다음 수요일 09:00 KST(영업일) — 공휴일 표와 무관한 평일.
    const wed = "2026-10-07";
    await runTick({ conditionKinds: [], now: () => new Date(`${wed}T00:00:00Z`), emailSender: fake.sender });
    const [row] = await notificationsOf(eventId, "cert_qr_request");
    expect(row?.emailStatus).toBe("sent");
    expect(fake.sent.map((m) => m.to)).toContain(manager.email);
  });
});

describe("generateQr — 경품 저장 + QR 생성 한 트랜잭션", () => {
  it("경품 한 줄 73,519 현장 → ok · 토큰 · 마감(당첨일 00:00 KST + 72h) · status_change · cert_prize_value · 신청자 알림", async () => {
    const pm = await makeUser(DEFAULT_ROLE_ID, "기획 김민지");
    const manager = await makeUser(await managerRole(), "경영 이수아");
    const wonOn = future(5);
    const eventId = await requestOk(pm, { name: "생성 행사", wonOn });
    const requestId = randomUUID();

    expect(await generateQr(manager, eventId, { requestId, changes: ONE_PRIZE })).toEqual({ kind: "ok" });

    const row = await eventRow(eventId);
    expect(row.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(row.tokenEncrypted).not.toBeNull();
    expect(row.qrCreatedBy).toBe(manager.id);
    expect(row.qrRequestId).toBe(requestId);
    expect(row.qrCreatedAt).not.toBeNull();
    expect(row.expiresAt?.toISOString()).toBe(new Date(kstDayStart(wonOn).getTime() + 72 * 3600_000).toISOString());

    const prizes = await db.select().from(certPrizes).where(eq(certPrizes.eventId, eventId));
    expect(prizes).toHaveLength(1);
    expect(prizes[0]).toMatchObject({ name: "갤럭시 탭 S10", unitValueKrw: 73_519, delivery: "onsite", winnerCount: 1 });

    const status = await logsOf(eventId, "status_change");
    expect(status.map((l) => l.detail)).toEqual([{ from: "requested", to: "open" }]);
    const valueLogs = await logsOf(prizes[0]?.id ?? "", "cert_prize_value");
    expect(valueLogs.map((l) => [l.entity, l.detail])).toEqual([
      ["cert_prize", { eventId, prizeId: prizes[0]?.id, name: "갤럭시 탭 S10", from: null, to: 73_519 }],
    ]);

    const created = await notificationsOf(eventId, "cert_qr_created");
    expect(created.map((r) => [r.recipientId, r.message])).toEqual([[pm.id, "QR 생성 · 생성 행사"]]);
    expect(created.map((r) => r.message).join()).not.toMatch(/73,?519/);

    // 같은 키 재전송 → ok · QR 하나 · 로그 그대로 · 다른 키 → alreadyGenerated
    const tokenBefore = row.tokenHash;
    expect(await generateQr(manager, eventId, { requestId, changes: ONE_PRIZE })).toEqual({ kind: "ok" });
    expect((await eventRow(eventId)).tokenHash).toBe(tokenBefore);
    expect(await logsOf(eventId, "status_change")).toHaveLength(1);
    expect(await db.select().from(certPrizes).where(eq(certPrizes.eventId, eventId))).toHaveLength(1);
    expect(await generateQr(manager, eventId, { requestId: randomUUID(), changes: ONE_PRIZE })).toEqual({ kind: "alreadyGenerated" });
  });

  it("당첨일이 사흘 전이면 마감 = 생성 시각 + 72h(N15 a)", async () => {
    const pm = await makeUser(DEFAULT_ROLE_ID, "기획 김민지");
    const manager = await makeUser(await managerRole(), "경영 이수아");
    const eventId = await requestOk(pm, { wonOn: future(1) });
    // 신청 때는 미래였고, 생성은 나흘 뒤(당첨일 사흘 지남)에 한다 — 시각 주입.
    const now = new Date(Date.now() + 4 * 24 * 3600_000);
    expect(await generateQr(manager, eventId, { requestId: randomUUID(), changes: ONE_PRIZE }, { now: () => now })).toEqual({ kind: "ok" });
    expect((await eventRow(eventId)).expiresAt?.toISOString()).toBe(new Date(now.getTime() + 72 * 3600_000).toISOString());
  });

  it("문의 전화 사본을 생성 때 지금 설정값으로 다시 찍는다 · 비었으면 blocked{contactMissing} · 쓰기 0(E28)", async () => {
    const pm = await makeUser(DEFAULT_ROLE_ID, "기획 김민지");
    const manager = await makeUser(await managerRole(), "경영 이수아");
    const eventId = await requestOk(pm);

    await setSettingValue(SYSTEM_VIEWER, CERT_CONTACT_PHONE, "");
    expect(await generateQr(manager, eventId, { requestId: randomUUID(), changes: ONE_PRIZE })).toEqual({
      kind: "blocked",
      reason: "contactMissing",
    });
    expect((await eventRow(eventId)).tokenHash).toBeNull();
    expect(await db.select().from(certPrizes).where(eq(certPrizes.eventId, eventId))).toHaveLength(0);

    await setSettingValue(SYSTEM_VIEWER, CERT_CONTACT_PHONE, "02-999-0000");
    expect(await generateQr(manager, eventId, { requestId: randomUUID(), changes: ONE_PRIZE })).toEqual({ kind: "ok" });
    const fresh = await getSettingValue(CERT_CONTACT_PHONE);
    expect((await eventRow(eventId)).contactPhone).toBe(fresh);
    expect(fresh).toMatch(/9990000/);
  });

  it("경품 없음 → blocked{noPrize} · 49,000뿐 → blocked{noListedPrize}(롤백 — 줄 0) · PM → Forbidden", async () => {
    const pm = await makeUser(DEFAULT_ROLE_ID, "기획 김민지");
    const manager = await makeUser(await managerRole(), "경영 이수아");
    const eventId = await requestOk(pm);
    expect(await generateQr(manager, eventId, { requestId: randomUUID(), changes: {} })).toEqual({ kind: "blocked", reason: "noPrize" });
    const low = { inserts: [{ key: "n1", name: "스타벅스 카드", unitValue: "49,000", delivery: "현장", winnerCount: "1" }] };
    expect(await generateQr(manager, eventId, { requestId: randomUUID(), changes: low })).toEqual({ kind: "blocked", reason: "noListedPrize" });
    expect(await db.select().from(certPrizes).where(eq(certPrizes.eventId, eventId))).toHaveLength(0);
    expect((await eventRow(eventId)).tokenHash).toBeNull();
    await expect(generateQr(pm, eventId, { requestId: randomUUID(), changes: ONE_PRIZE })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("cert_prize.value가 꺼진 certs.qr 쓰기 계급 → Forbidden(화면 canManagePrizes와 같은 두 조건 — E12)", async () => {
    const pm = await makeUser(DEFAULT_ROLE_ID, "기획 김민지");
    const noValue = await makeUser(await makeRole({ eventsView: true, qrWrite: true, prizeValue: false }), "가액 없음");
    const eventId = await requestOk(pm);
    await expect(generateQr(noValue, eventId, { requestId: randomUUID(), changes: ONE_PRIZE })).rejects.toBeInstanceOf(ForbiddenError);
    const detail = await getEventDetail(noValue, eventId);
    expect(detail.kind === "ok" && detail.event.canManagePrizes).toBe(false);
  });

  it("셀 오류면 invalid · 쓰기 0", async () => {
    const pm = await makeUser(DEFAULT_ROLE_ID, "기획 김민지");
    const manager = await makeUser(await managerRole(), "경영 이수아");
    const eventId = await requestOk(pm);
    const bad = { inserts: [{ key: "n1", name: "", unitValue: "abc", delivery: "현장", winnerCount: "1" }] };
    const result = await generateQr(manager, eventId, { requestId: randomUUID(), changes: bad });
    expect(result).toEqual({
      kind: "invalid",
      cellErrors: [
        { rowKey: "n1", column: "name", code: "required" },
        { rowKey: "n1", column: "unitValue", code: "amount" },
      ],
    });
    expect((await eventRow(eventId)).tokenHash).toBeNull();
  });

  it("당첨일 오늘 행사는 생성 뒤 loadIntake가 그 경품을 싣고, 미래면 notYetOpen(E8 b)", async () => {
    const pm = await makeUser(DEFAULT_ROLE_ID, "기획 김민지");
    const manager = await makeUser(await managerRole(), "경영 이수아");
    const today = await requestOk(pm, { wonOn: kstToday(new Date()) });
    const later = await requestOk(pm, { wonOn: future(3) });
    const prize = { inserts: [{ ...ONE_PRIZE.inserts[0]!, unitValue: "1,290,000" }] };
    for (const id of [today, later]) {
      expect(await generateQr(manager, id, { requestId: randomUUID(), changes: prize })).toEqual({ kind: "ok" });
    }
    const open = await loadIntake(decrypt((await eventRow(today)).tokenEncrypted ?? ""));
    expect(open.kind).toBe("open");
    expect(open.kind === "open" && open.prizes.map((p) => p.name)).toEqual(["갤럭시 탭 S10"]);
    expect((await loadIntake(decrypt((await eventRow(later)).tokenEncrypted ?? ""))).kind).toBe("notYetOpen");
  });

  it("목록 · 상세 파생 태그: QR이 있고 당첨일 전이면 beforeOpen · 그룹 신청됨 → 접수 전 → 접수 중(UD-1 b)", async () => {
    const pm = await makeUser(DEFAULT_ROLE_ID, "기획 김민지");
    const manager = await makeUser(await managerRole(), "경영 이수아");
    const requested = await requestOk(pm, { name: "가-신청" });
    const before = await requestOk(pm, { name: "나-접수전", wonOn: future(2) });
    const open = await requestOk(pm, { name: "다-접수중", wonOn: kstToday(new Date()) });
    for (const id of [before, open]) {
      expect(await generateQr(manager, id, { requestId: randomUUID(), changes: { inserts: [{ ...ONE_PRIZE.inserts[0]!, unitValue: "100,000" }] } })).toEqual({ kind: "ok" });
    }
    const list = await listEvents(pm);
    if (list.kind !== "ok") throw new Error("목록 없음");
    expect(list.events.map((e) => [e.id, e.status, e.beforeOpen])).toEqual([
      [requested, "requested", false],
      [before, "open", true],
      [open, "open", false],
    ]);
    const detail = await getEventDetail(pm, before);
    expect(detail.kind === "ok" && detail.event.beforeOpen).toBe(true);
  });
});

// ── Task 2 — 경품 표 저장 savePrizes(행사 행 잠금 먼저 · 셀 오류 · 읽기 전용 · 버전 · 가액 로그) ──────────────

async function prizesOf(eventId: string) {
  return db.select().from(certPrizes).where(eq(certPrizes.eventId, eventId)).orderBy(certPrizes.sortOrder);
}

async function valueLogsOfEvent(eventId: string) {
  const rows = await db.select().from(actionLog).where(eq(actionLog.actionType, "cert_prize_value"));
  return rows.filter((row) => (row.detail as { eventId?: string }).eventId === eventId).map((row) => row.detail);
}

async function openWithPrizes(opts: { createdBy?: string | null; closed?: boolean } = {}) {
  const ev = await createCertEvent({
    name: "저장 행사",
    createdBy: opts.createdBy ?? null,
    prizes: [
      { name: "갤럭시 탭 S10", unitValueKrw: 1_290_000, delivery: "onsite", winnerCount: 3 },
      { name: "다이슨 에어랩", unitValueKrw: 599_000, delivery: "parcel", winnerCount: 2 },
      { name: "스타벅스 카드", unitValueKrw: 30_000, delivery: "onsite", winnerCount: 5 },
    ],
  });
  const [p1, p2, p3] = ev.prizeIds as [string, string, string];
  // 다이슨 줄에 제출 하나 — 경품명 · 전달 읽기 전용 · 삭제 불가(N5 a).
  await seedIpSubmissionsForTest(ev.eventId, { ip: "203.0.113.41", count: 1, prizeId: p2 });
  if (opts.closed) await closeCertEventForTest(ev.eventId);
  return { ...ev, p1, p2, p3 };
}

async function versionOf(prizeId: string): Promise<number> {
  const [row] = await db.select({ version: certPrizes.version }).from(certPrizes).where(eq(certPrizes.id, prizeId));
  return row?.version ?? -1;
}

async function holdEventRow(eventId: string, then?: (client: Client) => Promise<void>) {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  await client.query("BEGIN");
  await client.query("SELECT id FROM cert_events WHERE id = $1 FOR UPDATE", [eventId]);
  if (then) await then(client);
  return {
    async commit() {
      await client.query("COMMIT");
      await client.end();
    },
  };
}

describe("savePrizes — 접수 중 · 닫힘 경품 표 저장(Task 2)", () => {
  it("가액 변경 · 경품명만 변경 → saved · 버전 +1 · document_update(줄 수만) · cert_prize_value는 가액이 바뀐 줄만", async () => {
    const manager = await makeUser(await managerRole(), "경영 이수아");
    const ev = await openWithPrizes();
    const result = await savePrizes(manager, ev.eventId, {
      changes: {
        updates: [
          { id: ev.p1, version: 1, unitValue: "1,300,000" },
          { id: ev.p3, version: 1, name: "스타벅스 카드 큰 것" },
        ],
      },
    });
    expect(result.kind).toBe("saved");
    expect(result.kind === "saved" && result.rows).toBe(2);
    expect(await versionOf(ev.p1)).toBe(2);
    const docLogs = await logsOf(ev.eventId, "document_update");
    expect(docLogs.map((l) => l.detail)).toEqual([{ updated: 2, inserted: 0, deleted: 0 }]);
    expect(await valueLogsOfEvent(ev.eventId)).toEqual([
      { eventId: ev.eventId, prizeId: ev.p1, name: "갤럭시 탭 S10", from: 1_290_000, to: 1_300_000 },
    ]);
  });

  it("제출 없는 줄 삭제 → to: null 로그(행이 사라져도 흔적 — NF-4) · 새 줄 → from: null", async () => {
    const manager = await makeUser(await managerRole(), "경영 이수아");
    const ev = await openWithPrizes();
    const result = await savePrizes(manager, ev.eventId, {
      changes: {
        deletes: [{ id: ev.p3, version: 1 }],
        inserts: [{ key: "n1", name: "애플워치", unitValue: "399,000", delivery: "택배", winnerCount: "1" }],
      },
    });
    expect(result.kind).toBe("saved");
    const rows = await prizesOf(ev.eventId);
    expect(rows.map((r) => r.name)).toEqual(["갤럭시 탭 S10", "다이슨 에어랩", "애플워치"]);
    const inserted = rows.find((r) => r.name === "애플워치");
    expect(await valueLogsOfEvent(ev.eventId)).toEqual(
      expect.arrayContaining([
        { eventId: ev.eventId, prizeId: inserted?.id, name: "애플워치", from: null, to: 399_000 },
        { eventId: ev.eventId, prizeId: ev.p3, name: "스타벅스 카드", from: 30_000, to: null },
      ]),
    );
    expect(await valueLogsOfEvent(ev.eventId)).toHaveLength(2);
  });

  it("제출 있는 줄의 경품명 · 전달 변경 · 삭제 → readOnly(쓰기 0) · 가액 · 당첨 수는 saved", async () => {
    const manager = await makeUser(await managerRole(), "경영 이수아");
    const ev = await openWithPrizes();
    for (const changes of [
      { updates: [{ id: ev.p2, version: 1, name: "다른 이름" }] },
      { updates: [{ id: ev.p2, version: 1, delivery: "현장" }] },
      { deletes: [{ id: ev.p2, version: 1 }] },
    ]) {
      expect(await savePrizes(manager, ev.eventId, { changes })).toEqual({ kind: "readOnly" });
    }
    expect(await versionOf(ev.p2)).toBe(1);
    expect((await savePrizes(manager, ev.eventId, { changes: { updates: [{ id: ev.p2, version: 1, unitValue: "49,000", winnerCount: "4" }] } })).kind).toBe("saved");
  });

  it("닫힌 행사: 새 줄 · 경품명 → readOnly, 가액 → saved", async () => {
    const manager = await makeUser(await managerRole(), "경영 이수아");
    const ev = await openWithPrizes({ closed: true });
    const insert = { inserts: [{ key: "n1", name: "새 경품", unitValue: "100,000", delivery: "현장" }] };
    expect(await savePrizes(manager, ev.eventId, { changes: insert })).toEqual({ kind: "readOnly" });
    expect(await savePrizes(manager, ev.eventId, { changes: { updates: [{ id: ev.p1, version: 1, name: "새 이름" }] } })).toEqual({ kind: "readOnly" });
    expect((await savePrizes(manager, ev.eventId, { changes: { updates: [{ id: ev.p1, version: 1, unitValue: "700,000" }] } })).kind).toBe("saved");
  });

  it("옛 버전 → conflict{prizes} · 셀 오류 → invalid · 둘 다 쓰기 0", async () => {
    const manager = await makeUser(await managerRole(), "경영 이수아");
    const ev = await openWithPrizes();
    const conflict = await savePrizes(manager, ev.eventId, { changes: { updates: [{ id: ev.p1, version: 9, unitValue: "1" }] } });
    expect(conflict.kind).toBe("conflict");
    expect(conflict.kind === "conflict" && conflict.prizes.find((p) => p.id === ev.p1)?.version).toBe(1);
    const invalid = await savePrizes(manager, ev.eventId, { changes: { updates: [{ id: ev.p1, version: 1, name: "", unitValue: "abc" }] } });
    expect(invalid).toEqual({
      kind: "invalid",
      cellErrors: [
        { rowKey: ev.p1, column: "name", code: "required" },
        { rowKey: ev.p1, column: "unitValue", code: "amount" },
      ],
    });
    expect(await versionOf(ev.p1)).toBe(1);
    expect(await valueLogsOfEvent(ev.eventId)).toEqual([]);
  });

  it("당첨 수 0 · abc · 1000 → 셀 오류 · 2 · 999 → 저장(설계 /cso H-3 — 서버 · 화면 같은 판정)", async () => {
    const manager = await makeUser(await managerRole(), "경영 이수아");
    const ev = await openWithPrizes();
    for (const winnerCount of ["0", "abc", "1000"]) {
      const result = await savePrizes(manager, ev.eventId, { changes: { updates: [{ id: ev.p1, version: 1, winnerCount }] } });
      expect(result).toEqual({ kind: "invalid", cellErrors: [{ rowKey: ev.p1, column: "winnerCount", code: "winnerCount" }] });
    }
    expect((await savePrizes(manager, ev.eventId, { changes: { updates: [{ id: ev.p1, version: 1, winnerCount: "2" }] } })).kind).toBe("saved");
    expect((await savePrizes(manager, ev.eventId, { changes: { updates: [{ id: ev.p1, version: 2, winnerCount: 999 }] } })).kind).toBe("saved");
    expect((await prizesOf(ev.eventId))[0]?.winnerCount).toBe(999);
  });

  it("PM → Forbidden · 없는 행사 → notFound · 신청됨 savePrizes는 QR을 만들지 않는다", async () => {
    const pm = await makeUser(DEFAULT_ROLE_ID, "기획 김민지");
    const manager = await makeUser(await managerRole(), "경영 이수아");
    const ev = await openWithPrizes({ createdBy: pm.id });
    await expect(savePrizes(pm, ev.eventId, { changes: {} })).rejects.toBeInstanceOf(ForbiddenError);
    expect(await savePrizes(manager, randomUUID(), { changes: {} })).toEqual({ kind: "notFound" });

    const requested = await requestOk(pm);
    const saved = await savePrizes(manager, requested, { changes: ONE_PRIZE });
    expect(saved.kind).toBe("saved");
    expect((await eventRow(requested)).tokenHash).toBeNull();
    expect(await prizesOf(requested)).toHaveLength(1);
  });

  it("가액을 49,000으로 내리면 그 줄이 loadIntake 목록에서 빠진다(B1 — 오류 아님)", async () => {
    const manager = await makeUser(await managerRole(), "경영 이수아");
    const ev = await openWithPrizes();
    expect((await savePrizes(manager, ev.eventId, { changes: { updates: [{ id: ev.p1, version: 1, unitValue: "49,000" }] } })).kind).toBe("saved");
    const intake = await loadIntake(ev.token ?? "");
    expect(intake.kind === "open" && intake.prizes.map((p) => p.name)).toEqual(["다이슨 에어랩"]);
  });

  it("E13 — 잠금을 기다리는 사이 행사 행이 지워지면 savePrizes · generateQr 모두 notFound(500 없음 · 쓰기 0)", async () => {
    const pm = await makeUser(DEFAULT_ROLE_ID, "기획 김민지");
    const manager = await makeUser(await managerRole(), "경영 이수아");
    for (const call of [
      (id: string) => savePrizes(manager, id, { changes: ONE_PRIZE }),
      (id: string) => generateQr(manager, id, { requestId: randomUUID(), changes: ONE_PRIZE }),
    ]) {
      const eventId = await requestOk(pm);
      const holder = await holdEventRow(eventId, async (client) => {
        await client.query("DELETE FROM notification_log WHERE entity_id = $1", [eventId]);
        await client.query("DELETE FROM cert_events WHERE id = $1", [eventId]);
      });
      const pending = call(eventId);
      await waitForLockWaiter(pool);
      await holder.commit();
      expect(await pending).toEqual({ kind: "notFound" });
      expect(await prizesOf(eventId)).toHaveLength(0);
    }
  });

  it("경합 — 가액 49,000 저장과 그 경품 제출을 겹치면 먼저 잠근 쪽이 이기고 제출은 saved 또는 prizeGone", async () => {
    const manager = await makeUser(await managerRole(), "경영 이수아");
    const ev = await createCertEvent({ name: "경합 행사", prizes: [{ name: "경합 경품", unitValueKrw: 73_519 }] });
    const prizeId = ev.prizeIds[0] ?? "";
    const holder = await holdEventRow(ev.eventId);
    const save = savePrizes(manager, ev.eventId, { changes: { updates: [{ id: prizeId, version: 1, unitValue: "49,000" }] } });
    const submit = submitCertificate(
      ev.token ?? "",
      {
        prizeId,
        idempotencyKey: randomUUID(),
        consentVersion: CERT_CONSENT_VERSION,
        retentionYears: await getSettingValue(CERT_RETENTION_YEARS),
        name: "김하늘",
        rrnFront6: "930412",
        rrnBack7: "2123458",
        phone: "010-4821-7730",
        consent: true,
        signaturePngBase64: signaturePngFixture().toString("base64"),
        rrnRecheckConfirmed: true,
      },
      "203.0.113.77",
    );
    await waitForLockWaiter(pool);
    await holder.commit();
    const [saved, submitted] = await Promise.all([save, submit]);
    expect(saved.kind).toBe("saved");
    expect(["saved", "prizeGone"]).toContain(submitted.kind);
    // 제출이 이겼으면 가액 변경 전(73,519)에 판정됐고, 저장이 이겼으면 제출은 49,000을 보고 prizeGone이다 — 둘 다 아닌 조합은 없다.
    const valueLogs = await valueLogsOfEvent(ev.eventId);
    expect(valueLogs).toEqual([{ eventId: ev.eventId, prizeId, name: "경합 경품", from: 73_519, to: 49_000 }]);
  });
});

describe("상세 DTO 가액 키 — certs.qr 쓰기 ∧ cert_prize.value만(E12 · N7 a)", () => {
  it("경영관리에는 unitValueKrw · quantityCounts가 있고 PM · 보기 전용 · cert_prize.value 꺼진 certs.qr 쓰기에는 키가 없으며 그 계급의 저장 · 생성은 Forbidden", async () => {
    const pm = await makeUser(DEFAULT_ROLE_ID, "기획 김민지");
    const manager = await makeUser(await managerRole(), "경영 이수아");
    const viewOnly = await makeUser(await makeRole({ eventsView: true, prizeValue: true }), "보기 전용");
    const qrNoValue = await makeUser(await makeRole({ eventsView: true, qrWrite: true, prizeValue: false }), "가액 없음");
    const ev = await openWithPrizes({ createdBy: pm.id });
    await upsertPermission(SYSTEM_VIEWER, { roleId: viewOnly.roleId ?? "", menu: "certs.submissions", action: "view", allowed: true });

    const forManager = await getEventDetail(manager, ev.eventId);
    expect(forManager.kind === "ok" && forManager.event.prizes?.find((p) => p.id === ev.p2)).toMatchObject({
      unitValueKrw: 599_000,
      quantityCounts: [{ quantity: 1, count: 1 }],
      purgeTargetCount: 0,
      locked: true,
      submittedCount: 1,
    });

    for (const viewer of [pm, viewOnly, qrNoValue]) {
      const detail = await getEventDetail(viewer, ev.eventId);
      expect(detail.kind).toBe("ok");
      if (detail.kind !== "ok") continue;
      for (const prize of detail.event.prizes ?? []) {
        expect(Object.keys(prize)).not.toContain("unitValueKrw");
        expect(Object.keys(prize)).not.toContain("quantityCounts");
        expect(Object.keys(prize)).not.toContain("purgeTargetCount");
      }
      const json = JSON.stringify(detail);
      expect(scanForLeaks(json, leakPatternsFor([1_290_000, 599_000, 30_000]))).toEqual([]);
      expect(json).toContain("다이슨 에어랩"); // 양성 — 경품명은 실린다(검출기가 빈 응답을 보고 통과하지 않는다)
    }
    for (const viewer of [viewOnly, qrNoValue]) {
      await expect(savePrizes(viewer, ev.eventId, { changes: {} })).rejects.toBeInstanceOf(ForbiddenError);
      await expect(generateQr(viewer, ev.eventId, { requestId: randomUUID(), changes: {} })).rejects.toBeInstanceOf(ForbiddenError);
    }
  });
});
