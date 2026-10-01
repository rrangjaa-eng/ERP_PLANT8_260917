import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db/client";
import { actionLog, certEvents, certPrizes, notificationLog } from "@/db/schema";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { ForbiddenError } from "@/domain/permissions/can";
import { createAccount } from "@/domain/auth/accounts";
import { insertRole } from "@/repositories/roles";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { setUserArchived } from "@/repositories/users";
import { getSettingValue, setSettingValue } from "@/domain/settings/registry";
import { CERT_CONTACT_PHONE, CERT_ENABLED } from "@/domain/settings/keys";
import { generateQr, getEventDetail, listEvents, requestQr } from "@/domain/certs/events";
import { loadIntake } from "@/domain/certs/intake";
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
