import { createHash, randomBytes, randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db/client";
import { certEvents, certWinners } from "@/db/schema";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { createAccount } from "@/domain/auth/accounts";
import { insertRole } from "@/repositories/roles";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { setSettingValue } from "@/domain/settings/registry";
import { CERT_CONTACT_PHONE, CERT_ENABLED } from "@/domain/settings/keys";
import { createEvent, getCreateGate, getEventDetail, listEvents, type CreateEventInput } from "@/domain/certs/events";
import { maskName } from "@/domain/certs/format";
import { encrypt } from "@/lib/crypto";
import { env } from "@/lib/env";

// 04.3-04 Task 2 — 행사 목록 · 상세 · 만들기 domain(실제 Postgres). 매 테스트 전
// setup.ts가 TRUNCATE + 시드한다 — 테스트가 준 권한 · 노출 행은 다음 테스트
// 전에 사라진다. role-pm의 certs.events는 04.3-09가 시드하기 전이라 PM
// 케이스가 스스로 준다(codex-B 3 · checker-B B2).

type WinnerInput = CreateEventInput["winners"][number];

const KIM = { name: "김하늘", phone: "010-4821-7730", prizeName: "갤럭시 탭 S10", quantity: "1", delivery: "현장" } satisfies WinnerInput;

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
async function makeRole(opts: { submissions?: boolean; winnerValue: boolean }): Promise<string> {
  const roleId = `role-cert-it-${randomUUID()}`;
  await insertRole(SYSTEM_VIEWER, { id: roleId, name: `통합 ${roleId.slice(-8)}`, sortOrder: 99 });
  for (const action of ["view", "write"] as const) {
    await upsertPermission(SYSTEM_VIEWER, { roleId, menu: "certs.events", action, allowed: true });
  }
  if (opts.submissions) {
    await upsertPermission(SYSTEM_VIEWER, { roleId, menu: "certs.submissions", action: "view", allowed: true });
  }
  await upsertVisibility(SYSTEM_VIEWER, { roleId, infoItem: "cert_event.value", visible: true });
  await upsertVisibility(SYSTEM_VIEWER, { roleId, infoItem: "cert_winner.value", visible: opts.winnerValue });
  return roleId;
}

function input(overrides: Partial<CreateEventInput> = {}): CreateEventInput {
  return { name: `행사-${randomUUID().slice(0, 8)}`, wonOn: "2026-09-13", winners: [KIM], ...overrides };
}

async function counts() {
  const events = await db.select({ id: certEvents.id }).from(certEvents);
  const winners = await db.select({ id: certWinners.id }).from(certWinners);
  return { events: events.length, winners: winners.length };
}

async function createOk(viewer: Viewer, overrides: Partial<CreateEventInput> = {}) {
  const result = await createEvent(viewer, input(overrides));
  if (result.kind !== "ok") throw new Error(`createEvent 실패: ${result.kind}`);
  return result;
}

describe("createEvent — 한 트랜잭션 · 셀 오류", () => {
  it("오류 셀이 하나라도 있으면 행사도 당첨자도 만들지 않는다(전부 거부)", async () => {
    const before = await counts();
    const result = await createEvent(SYSTEM_VIEWER, input({ winners: [KIM, { ...KIM, name: "이도윤", phone: "02-123-4567" }] }));
    expect(result.kind).toBe("invalid");
    if (result.kind !== "invalid") return;
    expect(result.cellErrors.map((e) => `${e.rowKey}:${e.column}:${e.code}`)).toEqual(["1:phone:phoneFormat"]);
    expect(await counts()).toEqual(before);
  });

  it("(E3-21) 이름 41자 · 경품명 81자 → invalid 셀 오류 nameTooLong · prizeTooLong(던지지 않는다)", async () => {
    const before = await counts();
    const result = await createEvent(
      SYSTEM_VIEWER,
      input({ winners: [{ ...KIM, name: "가".repeat(41), prizeName: "나".repeat(81) }] }),
    );
    expect(result.kind).toBe("invalid");
    if (result.kind !== "invalid") return;
    expect(result.cellErrors.map((e) => e.code)).toEqual(["nameTooLong", "prizeTooLong"]);
    expect(await counts()).toEqual(before);
  });

  it("행사 이름 빈 값 · 당첨일 빈 값은 fieldErrors, 당첨자 0명은 noWinners", async () => {
    const result = await createEvent(SYSTEM_VIEWER, input({ name: " ", wonOn: "", winners: [] }));
    expect(result).toEqual({ kind: "invalid", cellErrors: [], fieldErrors: { name: "required", wonOn: "required" }, noWinners: true });
  });

  it("행사 이름은 NFC · trim 뒤 80자로 판정하고 NFC로 저장한다(NFD 80자 통과 · 81자 tooLong)", async () => {
    const nfd80 = ` ${"가".repeat(80).normalize("NFD")} `;
    const made = await createOk(SYSTEM_VIEWER, { name: nfd80 });
    const [row] = await db.select({ name: certEvents.name }).from(certEvents).where(eq(certEvents.id, made.eventId));
    expect(row?.name).toBe("가".repeat(80));

    const result = await createEvent(SYSTEM_VIEWER, input({ name: "가".repeat(81).normalize("NFD") }));
    expect(result).toMatchObject({ kind: "invalid", fieldErrors: { name: "tooLong" } });
  });

  it("당첨일이 달력에 없는 날(2026-13-45 · 2026-02-30)이면 fieldErrors.wonOn format · 행 수 불변", async () => {
    const before = await counts();
    for (const wonOn of ["2026-13-45", "2026-02-30"]) {
      expect(await createEvent(SYSTEM_VIEWER, input({ wonOn }))).toEqual({
        kind: "invalid",
        cellErrors: [],
        fieldErrors: { wonOn: "format" },
      });
    }
    expect(await counts()).toEqual(before);
  });

  it("(E3-22) 당첨자 501줄은 거부(행 수 불변) · 500줄은 만들어진다", async () => {
    const rows = (n: number): WinnerInput[] =>
      Array.from({ length: n }, (_, i) => ({
        name: `당첨자${i}`,
        phone: `010-${String(1000 + (i % 9000)).padStart(4, "0")}-${String(i).padStart(4, "0")}`,
        prizeName: `경품${i}`,
        quantity: "1",
        delivery: "현장",
      }));
    const before = await counts();
    await expect(createEvent(SYSTEM_VIEWER, input({ winners: rows(501) }))).rejects.toThrow();
    expect(await counts()).toEqual(before);

    const result = await createEvent(SYSTEM_VIEWER, input({ winners: rows(500) }));
    expect(result.kind).toBe("ok");
    expect((await counts()).winners).toBe(before.winners + 500);
  });
});

describe("createEvent — 멱등(E3-22)", () => {
  it("같은 requestId 두 번 → 같은 {eventId, link} · 행사 1 · 당첨자 한 벌", async () => {
    const requestId = randomUUID();
    const first = await createEvent(SYSTEM_VIEWER, input({ requestId }));
    const second = await createEvent(SYSTEM_VIEWER, input({ requestId }));
    expect(first.kind).toBe("ok");
    expect(second).toEqual(first);
    expect(await counts()).toEqual({ events: 1, winners: 1 });
  });

  it("같은 requestId 동시 둘 → 둘 다 같은 eventId · 행사 1", async () => {
    const requestId = randomUUID();
    const body = input({ requestId });
    const [a, b] = await Promise.all([createEvent(SYSTEM_VIEWER, body), createEvent(SYSTEM_VIEWER, body)]);
    expect(a.kind).toBe("ok");
    expect(b.kind).toBe("ok");
    if (a.kind !== "ok" || b.kind !== "ok") return;
    expect(a.eventId).toBe(b.eventId);
    expect(await counts()).toEqual({ events: 1, winners: 1 });
  });

  it("다른 사용자가 A의 requestId로 만들면 A의 링크를 받지 못하고(던짐) 행 수 불변", async () => {
    await grantPmCertEvents();
    const pmA = await makeUser(DEFAULT_ROLE_ID, "PM 가");
    const pmB = await makeUser(DEFAULT_ROLE_ID, "PM 나");
    const requestId = randomUUID();
    await createOk(pmA, { requestId });
    const before = await counts();
    await expect(createEvent(pmB, input({ requestId }))).rejects.toThrow();
    expect(await counts()).toEqual(before);
  });

  it("찾기와 삽입 사이에 같은 사람의 같은 requestId가 끼면 unique 위반 분기에서 먼저 만든 행사를 돌려준다", async () => {
    const requestId = randomUUID();
    const token = randomBytes(32).toString("base64url");
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    let preId = "";
    let signalInserted: () => void = () => {};
    const inserted = new Promise<void>((resolve) => (signalInserted = resolve));
    // 커밋하지 않은 행 — createEvent의 찾기는 못 보고, 삽입은 unique 인덱스에서 이 트랜잭션을 기다린다.
    const holder = db.transaction(async (tx) => {
      const [row] = await tx
        .insert(certEvents)
        .values({
          name: "먼저 만든 행사",
          wonOn: "2026-09-13",
          tokenHash: createHash("sha256").update(token).digest("hex"),
          tokenEncrypted: encrypt(token),
          expiresAt: new Date(Date.now() + 60 * 60 * 1000),
          contactPhone: "02-123-4567",
          createdBy: null,
          createRequestId: requestId,
        })
        .returning({ id: certEvents.id });
      preId = row!.id;
      signalInserted();
      await gate;
    });
    await inserted;

    const creating = createEvent(SYSTEM_VIEWER, input({ requestId }));
    await expect
      .poll(async () => {
        const result = await db.execute<{ n: number }>(
          sql`select count(*)::int as n from pg_stat_activity where datname = current_database() and wait_event_type = 'Lock' and query ilike 'insert into "cert_events"%'`,
        );
        return result.rows[0]?.n;
      })
      .toBe(1);
    release();
    await holder;

    expect(await creating).toEqual({ kind: "ok", eventId: preId, link: `${env.BETTER_AUTH_URL}/c/${token}` });
    expect(await counts()).toEqual({ events: 1, winners: 0 });
  });

  it("requestId가 없으면 부를 때마다 새 행사", async () => {
    await createOk(SYSTEM_VIEWER);
    await createOk(SYSTEM_VIEWER);
    expect((await counts()).events).toBe(2);
  });
});

describe("listEvents · getEventDetail — 범위(T-04.3-19)", () => {
  it("권한 줄이 없으면 PM listEvents가 notFound(권한 없음과 범위 밖이 같은 모양)", async () => {
    const pm = await makeUser(DEFAULT_ROLE_ID);
    expect(await listEvents(pm)).toEqual({ kind: "notFound" });
  });

  it("PM(만든 사람)은 자기 행사만 보고 남의 상세는 notFound · certs.submissions를 켠 계급은 전부 본다", async () => {
    await grantPmCertEvents();
    const pmA = await makeUser(DEFAULT_ROLE_ID, "PM 가");
    const pmB = await makeUser(DEFAULT_ROLE_ID, "PM 나");
    const a = await createOk(pmA);
    const b = await createOk(pmB);

    const listA = await listEvents(pmA);
    expect(listA.kind).toBe("ok");
    if (listA.kind !== "ok") return;
    expect(listA.events.map((e) => e.id)).toEqual([a.eventId]);
    expect(listA.events[0]).toMatchObject({ ownerName: "PM 가", submittedCount: 0, totalCount: 1, status: "open" });

    expect(await getEventDetail(pmA, b.eventId)).toEqual({ kind: "notFound" });
    expect((await getEventDetail(pmA, a.eventId)).kind).toBe("ok");

    const manager = await makeUser(await makeRole({ submissions: true, winnerValue: true }));
    const all = await listEvents(manager);
    if (all.kind !== "ok") throw new Error("경영관리 목록 실패");
    expect(all.events.map((e) => e.id).sort()).toEqual([a.eventId, b.eventId].sort());
    expect((await getEventDetail(manager, b.eventId)).kind).toBe("ok");
  });

  it("목록은 접수 중 → 닫힘, 그룹 안 당첨일 내림차순", async () => {
    const early = await createOk(SYSTEM_VIEWER, { wonOn: "2026-09-01" });
    const late = await createOk(SYSTEM_VIEWER, { wonOn: "2026-09-20" });
    const closed = await createOk(SYSTEM_VIEWER, { wonOn: "2026-09-30" });
    await db.update(certEvents).set({ closedAt: new Date(), closedReason: "manual" }).where(eq(certEvents.id, closed.eventId));

    const list = await listEvents(SYSTEM_VIEWER);
    if (list.kind !== "ok") throw new Error("목록 실패");
    expect(list.events.map((e) => e.id)).toEqual([late.eventId, early.eventId, closed.eventId]);
    expect(list.events.map((e) => e.status)).toEqual(["open", "open", "closed"]);
  });
});

describe("범위 — certs.events 보기 없음", () => {
  it("certs.submissions 보기만 있고 certs.events 보기가 없으면 목록 · 상세 notFound", async () => {
    const made = await createOk(SYSTEM_VIEWER);
    const roleId = `role-cert-it-${randomUUID()}`;
    await insertRole(SYSTEM_VIEWER, { id: roleId, name: `통합 ${roleId.slice(-8)}`, sortOrder: 99 });
    await upsertPermission(SYSTEM_VIEWER, { roleId, menu: "certs.submissions", action: "view", allowed: true });
    await upsertVisibility(SYSTEM_VIEWER, { roleId, infoItem: "cert_event.value", visible: true });
    await upsertVisibility(SYSTEM_VIEWER, { roleId, infoItem: "cert_winner.value", visible: true });
    const viewer = await makeUser(roleId);
    expect(await listEvents(viewer)).toEqual({ kind: "notFound" });
    expect(await getEventDetail(viewer, made.eventId)).toEqual({ kind: "notFound" });
  });
});

describe("기능 꺼짐(C1)", () => {
  it("목록 · 상세 · 만들기 전부 notFound", async () => {
    const made = await createOk(SYSTEM_VIEWER);
    await setSettingValue(SYSTEM_VIEWER, CERT_ENABLED, false);
    expect(await listEvents(SYSTEM_VIEWER)).toEqual({ kind: "notFound" });
    expect(await getEventDetail(SYSTEM_VIEWER, made.eventId)).toEqual({ kind: "notFound" });
    const before = await counts();
    expect(await createEvent(SYSTEM_VIEWER, input())).toEqual({ kind: "notFound" });
    expect(await counts()).toEqual(before);
  });
});

describe("실제 반환값 비노출(Codex #22 · T-04.3-81)", () => {
  const SECRETS = ["김하늘", "01048217730", "010-4821-7730"];

  it("cert_winner.value를 끈 계급의 createEvent · listEvents · getEventDetail에 이름 · 전화가 없다 · 켠 계급은 보인다", async () => {
    const hidden = await makeUser(await makeRole({ winnerValue: false }));
    const created = await createEvent(hidden, input());
    if (created.kind !== "ok") throw new Error("만들기 실패");
    const list = await listEvents(hidden);
    const detail = await getEventDetail(hidden, created.eventId);
    expect(detail.kind).toBe("ok");
    if (detail.kind !== "ok") return;
    expect(detail.event.name).toBeTruthy();

    const dump = JSON.stringify([created, list, detail]);
    for (const secret of SECRETS) expect(dump).not.toContain(secret);
    const winner = detail.event.winners?.[0];
    expect(winner).toBeDefined();
    expect(winner).not.toHaveProperty("name");
    expect(winner).not.toHaveProperty("phone");
    expect(winner).not.toHaveProperty("recipientName");
    expect(winner).not.toHaveProperty("recipientSecondLine");
    expect(dump).not.toContain(maskName("김하늘"));

    const shown = await makeUser(await makeRole({ submissions: true, winnerValue: true }));
    const visibleDetail = await getEventDetail(shown, created.eventId);
    if (visibleDetail.kind !== "ok") throw new Error("상세 실패");
    expect(visibleDetail.event.winners?.[0]).toMatchObject({ name: "김하늘", phone: "010-4821-7730" });
  });
});

describe("getCreateGate", () => {
  it("문의 전화가 비면 시스템 관리자 {true, true} · 기획 PM {true, false}", async () => {
    await setSettingValue(SYSTEM_VIEWER, CERT_CONTACT_PHONE, "");
    await grantPmCertEvents();
    const pm = await makeUser(DEFAULT_ROLE_ID);
    expect(await getCreateGate(SYSTEM_VIEWER)).toEqual({ contactMissing: true, canOpenSettings: true });
    expect(await getCreateGate(pm)).toEqual({ contactMissing: true, canOpenSettings: false });
  });
});

describe("상세 DTO 링크 · QR", () => {
  it("상세 링크가 createEvent 링크와 같고 QR SVG가 있다 · 닫힌 행사는 link · qrSvg 키가 없다", async () => {
    const made = await createOk(SYSTEM_VIEWER);
    const open = await getEventDetail(SYSTEM_VIEWER, made.eventId);
    if (open.kind !== "ok") throw new Error("상세 실패");
    expect(open.event.link).toBe(made.link);
    expect(open.event.qrSvg).toMatch(/^<svg/);
    expect(open.event.status).toBe("open");

    await db.update(certEvents).set({ closedAt: new Date(), closedReason: "manual" }).where(eq(certEvents.id, made.eventId));
    const closed = await getEventDetail(SYSTEM_VIEWER, made.eventId);
    if (closed.kind !== "ok") throw new Error("상세 실패");
    expect(closed.event.status).toBe("closed");
    expect(closed.event).not.toHaveProperty("link");
    expect(closed.event).not.toHaveProperty("qrSvg");
  });

  it("기한이 지났지만 닫지 않은 행사도 link · qrSvg 키가 없다", async () => {
    const made = await createOk(SYSTEM_VIEWER);
    await db.update(certEvents).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(certEvents.id, made.eventId));
    const expired = await getEventDetail(SYSTEM_VIEWER, made.eventId);
    if (expired.kind !== "ok") throw new Error("상세 실패");
    expect(expired.event).toMatchObject({ status: "closed", closedReason: "expired" });
    expect(expired.event).not.toHaveProperty("link");
    expect(expired.event).not.toHaveProperty("qrSvg");
  });
});
