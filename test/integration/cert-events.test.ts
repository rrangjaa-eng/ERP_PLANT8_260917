import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db/client";
import { certEvents, certSubmissions } from "@/db/schema";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { createAccount } from "@/domain/auth/accounts";
import { insertRole } from "@/repositories/roles";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { setSettingValue } from "@/domain/settings/registry";
import { CERT_CONTACT_PHONE, CERT_ENABLED } from "@/domain/settings/keys";
import { getCreateGate, getEventDetail, listEvents } from "@/domain/certs/events";
import { createCertEvent, seedSubmittedCert } from "@/test/e2e/helpers/cert";

// 04.3-04 Task 2 · 04.3-15 — 행사 목록 · 상세 domain(실제 Postgres). 매 테스트 전 setup.ts가 TRUNCATE + 시드한다.
// 행사는 규약 C4 도우미 createCertEvent({ status, prizes, createdBy })로 만든다(만들기 화면은 04.3-10).

beforeEach(async () => {
  await setSettingValue(SYSTEM_VIEWER, CERT_ENABLED, true);
  await setSettingValue(SYSTEM_VIEWER, CERT_CONTACT_PHONE, "02-123-4567");
});

async function grantPmCertEvents(): Promise<void> {
  await upsertPermission(SYSTEM_VIEWER, { roleId: DEFAULT_ROLE_ID, menu: "certs.events", action: "view", allowed: true });
  await upsertPermission(SYSTEM_VIEWER, { roleId: DEFAULT_ROLE_ID, menu: "certs.events", action: "write", allowed: true });
}

async function makeUser(roleId: string, name = "통합 담당자"): Promise<Viewer> {
  const { userId } = await createAccount(SYSTEM_VIEWER, { email: `cert-${randomUUID()}@example.test`, name, roleId });
  return { id: userId, roleId };
}

// 시드 기본값이 아닌 테스트 계급 — certs.events 보기 · 쓰기 + 행사 칸 노출.
async function makeRole(opts: { submissions?: boolean }): Promise<string> {
  const roleId = `role-cert-it-${randomUUID()}`;
  await insertRole(SYSTEM_VIEWER, { id: roleId, name: `통합 ${roleId.slice(-8)}`, sortOrder: 99 });
  for (const action of ["view", "write"] as const) {
    await upsertPermission(SYSTEM_VIEWER, { roleId, menu: "certs.events", action, allowed: true });
  }
  if (opts.submissions) {
    await upsertPermission(SYSTEM_VIEWER, { roleId, menu: "certs.submissions", action: "view", allowed: true });
  }
  await upsertVisibility(SYSTEM_VIEWER, { roleId, infoItem: "cert_event.value", visible: true });
  return roleId;
}

async function createOk(opts: { createdBy?: string | null; wonOn?: string } = {}) {
  const made = await createCertEvent({ createdBy: opts.createdBy ?? null, ...(opts.wonOn ? { wonOn: opts.wonOn } : {}) });
  if (!made.link) throw new Error("열린 행사를 만들지 못했다");
  return { ...made, link: made.link };
}

describe("listEvents · getEventDetail — 범위(T-04.3-19)", () => {
  it("권한 줄이 없으면 PM listEvents가 notFound(권한 없음과 범위 밖이 같은 모양)", async () => {
    // 04.3-09가 PM에게 certs.events를 기본으로 시드하므로 관리자가 권한표에서 끈 상태를 만든다.
    await upsertPermission(SYSTEM_VIEWER, { roleId: DEFAULT_ROLE_ID, menu: "certs.events", action: "view", allowed: false });
    await upsertPermission(SYSTEM_VIEWER, { roleId: DEFAULT_ROLE_ID, menu: "certs.events", action: "write", allowed: false });
    const pm = await makeUser(DEFAULT_ROLE_ID);
    expect(await listEvents(pm)).toEqual({ kind: "notFound" });
  });

  it("PM(만든 사람)은 자기 행사만 보고 남의 상세는 notFound · certs.submissions를 켠 계급은 전부 본다", async () => {
    await grantPmCertEvents();
    const pmA = await makeUser(DEFAULT_ROLE_ID, "PM 가");
    const pmB = await makeUser(DEFAULT_ROLE_ID, "PM 나");
    const a = await createOk({ createdBy: pmA.id });
    const b = await createOk({ createdBy: pmB.id });

    const listA = await listEvents(pmA);
    expect(listA.kind).toBe("ok");
    if (listA.kind !== "ok") return;
    expect(listA.events.map((e) => e.id)).toEqual([a.eventId]);
    expect(listA.events[0]).toMatchObject({ ownerName: "PM 가", submittedCount: 0, status: "open" });

    expect(await getEventDetail(pmA, b.eventId)).toEqual({ kind: "notFound" });
    expect((await getEventDetail(pmA, a.eventId)).kind).toBe("ok");

    const manager = await makeUser(await makeRole({ submissions: true }));
    const all = await listEvents(manager);
    if (all.kind !== "ok") throw new Error("경영관리 목록 실패");
    expect(all.events.map((e) => e.id).sort()).toEqual([a.eventId, b.eventId].sort());
    expect((await getEventDetail(manager, b.eventId)).kind).toBe("ok");
  });

  it("목록은 신청됨 → 접수 중 → 닫힘, 그룹 안 당첨일 내림차순", async () => {
    const early = await createOk({ wonOn: "2026-09-01" });
    const late = await createOk({ wonOn: "2026-09-20" });
    const closed = await createOk({ wonOn: "2026-09-30" });
    await db.update(certEvents).set({ closedAt: new Date(), closedReason: "manual" }).where(eq(certEvents.id, closed.eventId));
    const requestedOld = await createCertEvent({ status: "requested", wonOn: "2026-08-01" });
    const requestedNew = await createCertEvent({ status: "requested", wonOn: "2026-10-05" });

    const list = await listEvents(SYSTEM_VIEWER);
    if (list.kind !== "ok") throw new Error("목록 실패");
    expect(list.events.map((e) => e.id)).toEqual([
      requestedNew.eventId,
      requestedOld.eventId,
      late.eventId,
      early.eventId,
      closed.eventId,
    ]);
    expect(list.events.map((e) => e.status)).toEqual(["requested", "requested", "open", "open", "closed"]);
  });

  it("제출 건수는 대조 제외 행을 세지 않는다(DR-1)", async () => {
    const seeded = await seedSubmittedCert();
    const countOf = async () => {
      const list = await listEvents(SYSTEM_VIEWER);
      if (list.kind !== "ok") throw new Error("목록 실패");
      return list.events.find((e) => e.id === seeded.eventId)?.submittedCount;
    };
    expect(await countOf()).toBe(1);

    await db.update(certSubmissions).set({ excludedAt: new Date() }).where(eq(certSubmissions.id, seeded.submissionId));
    expect(await countOf()).toBe(0);
  });
});

describe("범위 — certs.events 보기 없음", () => {
  it("certs.submissions 보기만 있고 certs.events 보기가 없으면 목록 · 상세 notFound", async () => {
    const made = await createOk();
    const roleId = `role-cert-it-${randomUUID()}`;
    await insertRole(SYSTEM_VIEWER, { id: roleId, name: `통합 ${roleId.slice(-8)}`, sortOrder: 99 });
    await upsertPermission(SYSTEM_VIEWER, { roleId, menu: "certs.submissions", action: "view", allowed: true });
    await upsertVisibility(SYSTEM_VIEWER, { roleId, infoItem: "cert_event.value", visible: true });
    const viewer = await makeUser(roleId);
    expect(await listEvents(viewer)).toEqual({ kind: "notFound" });
    expect(await getEventDetail(viewer, made.eventId)).toEqual({ kind: "notFound" });
  });
});

describe("기능 꺼짐(C1)", () => {
  it("목록 · 상세 notFound", async () => {
    const made = await createOk();
    await setSettingValue(SYSTEM_VIEWER, CERT_ENABLED, false);
    expect(await listEvents(SYSTEM_VIEWER)).toEqual({ kind: "notFound" });
    expect(await getEventDetail(SYSTEM_VIEWER, made.eventId)).toEqual({ kind: "notFound" });
  });
});

describe("getCreateGate", () => {
  it("문의 전화가 비면 시스템 관리자 {true, true} · 기획 PM {true, false}", async () => {
    await setSettingValue(SYSTEM_VIEWER, CERT_CONTACT_PHONE, "");
    await grantPmCertEvents();
    const pm = await makeUser(DEFAULT_ROLE_ID);
    expect(await getCreateGate(SYSTEM_VIEWER)).toEqual({ contactMissing: true, canOpenSettings: true, linkExpireHours: 72 });
    expect(await getCreateGate(pm)).toEqual({ contactMissing: true, canOpenSettings: false, linkExpireHours: 72 });
  });
});

describe("상세 DTO 링크 · QR", () => {
  it("상세 링크가 만든 행사의 링크와 같고 QR SVG가 있다 · 닫힌 행사는 link · qrSvg 키가 없다", async () => {
    const made = await createOk();
    const open = await getEventDetail(SYSTEM_VIEWER, made.eventId);
    if (open.kind !== "ok") throw new Error("상세 실패");
    expect(open.event.link).toBe(made.link);
    expect(open.event.qrSvg).toMatch(/^<svg/);
    expect(open.event.status).toBe("open");

    await db.update(certEvents).set({ closedAt: new Date(), closedReason: "manual" }).where(eq(certEvents.id, made.eventId));
    const closed = await getEventDetail(SYSTEM_VIEWER, made.eventId);
    if (closed.kind !== "ok") throw new Error("상세 실패");
    expect(closed.event).toMatchObject({ status: "closed", closedReason: "manual" });
    expect(closed.event).not.toHaveProperty("link");
    expect(closed.event).not.toHaveProperty("qrSvg");
  });

  it("기한이 지났지만 닫지 않은 행사도 link · qrSvg 키가 없다", async () => {
    const made = await createOk();
    await db.update(certEvents).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(certEvents.id, made.eventId));
    const expired = await getEventDetail(SYSTEM_VIEWER, made.eventId);
    if (expired.kind !== "ok") throw new Error("상세 실패");
    expect(expired.event).toMatchObject({ status: "closed", closedReason: "expired" });
    expect(expired.event).not.toHaveProperty("link");
    expect(expired.event).not.toHaveProperty("qrSvg");
  });

  it("신청됨 행사(토큰 없음)는 link · qrSvg 키가 없고 마감 · 닫힘 사유가 비어 있다", async () => {
    const made = await createCertEvent({ status: "requested" });
    expect(made.link).toBeUndefined();
    const requested = await getEventDetail(SYSTEM_VIEWER, made.eventId);
    if (requested.kind !== "ok") throw new Error("상세 실패");
    expect(requested.event).toMatchObject({ status: "requested", closedReason: null, expiresAt: null, closedAt: null });
    expect(requested.event).not.toHaveProperty("link");
    expect(requested.event).not.toHaveProperty("qrSvg");
  });
});
