import { randomUUID } from "node:crypto";
import { existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { and, eq, like, sql } from "drizzle-orm";
import { Client } from "pg";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db/client";
import { certEvents, certSignatureUploads, certSubmissions, documentCounters } from "@/db/schema";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { loadIntake, submitCertificate, type SubmitCertificateInput } from "@/domain/certs/intake";
import { CERT_CONSENT_VERSION } from "@/domain/certs/consent";
import { getSettingValue, setSettingValue } from "@/domain/settings/registry";
import { CERT_ENABLED, CERT_RETENTION_YEARS } from "@/domain/settings/keys";
import { addDays, kstDayStart, kstToday, kstYear } from "@/lib/kst-date";
import { env } from "@/lib/env";
import { log } from "@/lib/log";
import { handleServerError } from "@/lib/actions/handle-server-error";
import { withTransaction } from "@/lib/db-transaction";
import { getSignatureStore, type SignatureStore } from "@/lib/storage/signature-store";
import {
  closeCertEventForTest,
  createCertEvent,
  seedIpSubmissionsForTest,
  setCertPrizeValueForTest,
  signaturePngFixture,
} from "@/test/e2e/helpers/cert";
import { leakPatternsFor, scanForLeaks, scannerSelfTest } from "@/test/e2e/helpers/cert-leak";

// 04.3-15 — 명단 → 경품 목록 모델(5909578685). Task 1 tracer: 경품 셋(하나는 50,000 이하) 행사에서
// loadIntake → submitCertificate → 저장 행 · 결과의 가액 누수 0(양성 대조군), 그리고 경품 빠짐 · 안내 바뀜 ·
// 속도 제한 · 열림 시작의 기본 한 케이스씩. 경계 · 경합 · 재전송 조합은 Task 2가 더한다.

beforeEach(async () => {
  await setSettingValue(SYSTEM_VIEWER, CERT_ENABLED, true);
});

const A = { name: "누수대조-A", unitValueKrw: 73_519, delivery: "onsite" as const };
const B = { name: "누수대조-B", unitValueKrw: 581_247, delivery: "parcel" as const };
const C = { name: "누수대조-C", unitValueKrw: 49_731, delivery: "onsite" as const };
const LEAK_PATTERNS = leakPatternsFor([A.unitValueKrw, B.unitValueKrw, C.unitValueKrw]);

async function leakEvent(overrides: { wonOn?: string } = {}) {
  const event = await createCertEvent({ name: "누수대조", prizes: [A, B, C], ...overrides });
  const [prizeA, prizeB, prizeC] = event.prizeIds;
  if (!event.token || !prizeA || !prizeB || !prizeC) throw new Error("열린 행사를 만들지 못했다");
  return { ...event, token: event.token, prizeA, prizeB, prizeC };
}

async function currentTerms() {
  return { consentVersion: CERT_CONSENT_VERSION, retentionYears: await getSettingValue(CERT_RETENTION_YEARS) };
}

function inputFor(
  prizeId: string,
  terms: { consentVersion: string; retentionYears: number },
  overrides: Partial<SubmitCertificateInput> = {},
): SubmitCertificateInput {
  return {
    prizeId,
    idempotencyKey: randomUUID(),
    consentVersion: terms.consentVersion,
    retentionYears: terms.retentionYears,
    name: "김하늘",
    rrnFront6: "930412",
    rrnBack7: "2123458",
    phone: "010-4821-7730",
    consent: true,
    signaturePngBase64: signaturePngFixture().toString("base64"),
    rrnRecheckConfirmed: true,
    ...overrides,
  };
}

async function submissionsOf(eventId: string) {
  return db.select().from(certSubmissions).where(eq(certSubmissions.eventId, eventId));
}

// 로컬 가짜 드라이버의 실제 파일 — 그 행사의 서명 객체 수.
function objectCount(eventId: string): number {
  const dir = join(tmpdir(), "plant8-cert-signatures", "signatures", eventId);
  return existsSync(dir) ? readdirSync(dir).length : 0;
}

describe("tracer — 경품 목록 모델 한 경로(Task 1)", () => {
  it("loadIntake는 50,000 넘는 경품만 입력 순서로 {id, name, delivery} 세 칸으로 싣고 안내 판을 준다", async () => {
    const ev = await leakEvent();
    const result = await loadIntake(ev.token);
    expect(result.kind).toBe("open");
    if (result.kind !== "open") return;
    expect(result.prizes).toEqual([
      { id: ev.prizeA, name: A.name, delivery: "onsite" },
      { id: ev.prizeB, name: B.name, delivery: "parcel" },
    ]);
    for (const prize of result.prizes) expect(Object.keys(prize).sort()).toEqual(["delivery", "id", "name"]);
    expect(result.terms).toEqual(await currentTerms());
  });

  it("A로 제출 → saved(현장 · 1개) · 저장 행에 경품 · 수량 1 · 암호문 · IP 가명, 현장 경품에 보낸 주소는 저장하지 않는다", async () => {
    const ev = await leakEvent();
    const result = await submitCertificate(
      ev.token,
      inputFor(ev.prizeA, await currentTerms(), { address: "서울시 강남구 테헤란로 1" }),
      "203.0.113.9",
    );
    expect(result).toMatchObject({ kind: "saved", prizeLine: `${A.name} 1개`, delivery: "onsite" });
    const [row, ...rest] = await submissionsOf(ev.eventId);
    expect(rest).toHaveLength(0);
    expect(row?.prizeId).toBe(ev.prizeA);
    expect(row?.quantity).toBe(1);
    expect(row?.rrnEncrypted).toMatch(/^v\d+:/);
    expect(row?.submitIpHash).toMatch(/^[0-9a-f]{32}$/);
    expect(row?.address).toBeNull();
  });

  it("공개 결과(loadIntake · saved)의 JSON에 가액 패턴 0건 · 양성 대조군(오른 경품 이름 있음 · 걸러진 경품 이름 없음 · 검출기 자체 시험)", async () => {
    expect(scannerSelfTest()).toBe(true);
    const ev = await leakEvent();
    const intake = await loadIntake(ev.token);
    const saved = await submitCertificate(ev.token, inputFor(ev.prizeB, await currentTerms(), { address: "서울시 마포구 월드컵로 1" }), "203.0.113.9");
    expect(saved.kind).toBe("saved");
    const corpus = JSON.stringify([intake, saved]);
    expect(corpus).toContain(A.name);
    expect(corpus).toContain(B.name);
    expect(corpus).not.toContain(C.name);
    expect(scanForLeaks(corpus, LEAK_PATTERNS)).toEqual([]);
  });

  it("신청됨 행사(토큰 없음)는 어떤 토큰으로도 찾을 수 없다(notFound)", async () => {
    const requested = await createCertEvent({ status: "requested", prizes: [A] });
    expect(requested.token).toBeUndefined();
    const [row] = await db.select().from(certEvents).where(eq(certEvents.id, requested.eventId));
    expect(row?.tokenHash).toBeNull();
    expect((await loadIntake(randomUUID())).kind).toBe("notFound");
    expect((await loadIntake("")).kind).toBe("notFound");
  });
});

describe("서버 갈래 기본 한 케이스씩(Task 1 — 경계 · 경합은 Task 2)", () => {
  it("제출 직전 고른 경품 가액이 49,000으로 내려가면 prizeGone(지금 목록 — A 없음 · B 있음) · 저장 0", async () => {
    const ev = await leakEvent();
    const terms = await currentTerms();
    await setCertPrizeValueForTest(ev.prizeA, 49_000);
    const result = await submitCertificate(ev.token, inputFor(ev.prizeA, terms), "203.0.113.9");
    expect(result.kind).toBe("prizeGone");
    if (result.kind !== "prizeGone") return;
    expect(result.prizes.map((p) => p.id)).toEqual([ev.prizeB]);
    expect(await submissionsOf(ev.eventId)).toHaveLength(0);
  });

  it("옛 안내 판(보존 연수가 다름)으로 제출하면 termsChanged{지금 판} · 저장 0", async () => {
    const ev = await leakEvent();
    const terms = await currentTerms();
    const result = await submitCertificate(
      ev.token,
      inputFor(ev.prizeA, { ...terms, retentionYears: terms.retentionYears + 1 }),
      "203.0.113.9",
    );
    expect(result).toEqual({ kind: "termsChanged", terms });
    expect(await submissionsOf(ev.eventId)).toHaveLength(0);
  });

  it("같은 IP로 30건 뒤 31번째는 throttled · 저장 30 그대로 · 서명 객체 늘지 않음(W = 1)", async () => {
    const ev = await createCertEvent({ name: "속도제한" });
    const prizeId = ev.prizeIds[0];
    if (!ev.token || !prizeId) throw new Error("열린 행사를 만들지 못했다");
    await seedIpSubmissionsForTest(ev.eventId, { ip: "198.51.100.7", count: 30 });
    const before = objectCount(ev.eventId);
    const result = await submitCertificate(ev.token, inputFor(prizeId, await currentTerms()), "198.51.100.7");
    expect(result.kind).toBe("throttled");
    expect(await submissionsOf(ev.eventId)).toHaveLength(30);
    expect(objectCount(ev.eventId)).toBe(before);
  });
});

describe("링크 열림 시작 = 당첨일 00:00 KST(E8 b)", () => {
  it("당첨일이 내일이면 loadIntake는 notYetOpen{eventName, wonOn, managerName, contactPhone} — 경품 목록 · 안내 판 없음", async () => {
    const tomorrow = addDays(kstToday(new Date()), 1);
    const ev = await leakEvent({ wonOn: tomorrow });
    const result = await loadIntake(ev.token);
    expect(result.kind).toBe("notYetOpen");
    if (result.kind !== "notYetOpen") return;
    expect(result.eventName).toBe(ev.eventName);
    expect(result.wonOn).toBe(tomorrow);
    expect(Object.keys(result).sort()).toEqual(["contactPhone", "eventName", "kind", "managerName", "wonOn"]);
  });

  it("열리기 전 제출은 notYetOpen · 저장 0 · 서명 객체 0", async () => {
    const ev = await leakEvent({ wonOn: addDays(kstToday(new Date()), 1) });
    const result = await submitCertificate(ev.token, inputFor(ev.prizeA, await currentTerms()), "203.0.113.9");
    expect(result.kind).toBe("notYetOpen");
    expect(await submissionsOf(ev.eventId)).toHaveLength(0);
    expect(objectCount(ev.eventId)).toBe(0);
  });

  it("당첨일 00:00 KST 1ms 전은 notYetOpen, 정각은 open(시각 주입)", async () => {
    const tomorrow = addDays(kstToday(new Date()), 1);
    const ev = await leakEvent({ wonOn: tomorrow });
    const opensAt = kstDayStart(tomorrow);
    expect((await loadIntake(ev.token, new Date(opensAt.getTime() - 1))).kind).toBe("notYetOpen");
    expect((await loadIntake(ev.token, opensAt)).kind).toBe("open");
  });
});

// ── Task 2 — 서버 갈래 굳히기(경계 · 경합 · 재전송 조합 · 공개 결과 전 갈래 누수 스윕) ──────────────

afterEach(() => {
  vi.restoreAllMocks();
});

function throttleLogs(spy: { mock: { calls: unknown[][] } }) {
  return spy.mock.calls.filter((call) => call[0] === "cert.submit_throttled");
}

// 실제 저장소 위에 put 뒤 끼어들기를 얹는다.
function storeAfterPut(afterPut: () => Promise<void>): SignatureStore {
  const real = getSignatureStore();
  return {
    put: async (key, png) => {
      await real.put(key, png);
      await afterPut();
    },
    get: (key) => real.get(key),
    delete: (key) => real.delete(key),
  };
}

// 별도 연결로 행사 행을 FOR UPDATE로 쥐고 있는다(경품 쓰기 · 다른 제출이 잡는 것과 같은 잠금).
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
    async release() {
      await client.query("ROLLBACK");
      await client.end();
    },
  };
}

describe("경품 빠짐(prizeGone) — 고른 경품을 받을 수 없게 됨", () => {
  it("존재하지 않는 경품 id · 다른 행사의 경품 id도 prizeGone · 저장 0", async () => {
    const ev = await leakEvent();
    const other = await createCertEvent({ name: "다른행사" });
    const terms = await currentTerms();
    expect((await submitCertificate(ev.token, inputFor(randomUUID(), terms), "203.0.113.9")).kind).toBe("prizeGone");
    expect((await submitCertificate(ev.token, inputFor(other.prizeIds[0]!, terms), "203.0.113.9")).kind).toBe("prizeGone");
    expect(await submissionsOf(ev.eventId)).toHaveLength(0);
  });

  it("목록에서 빠진 경품(50,000 이하 — C)을 골라 보내도 prizeGone · 서명 객체 · 의도 행 0", async () => {
    const ev = await leakEvent();
    const result = await submitCertificate(ev.token, inputFor(ev.prizeC, await currentTerms()), "203.0.113.9");
    expect(result.kind).toBe("prizeGone");
    expect(objectCount(ev.eventId)).toBe(0);
  });
});

describe("안내 바뀜(termsChanged)", () => {
  it("보존 연수를 바꾼 뒤 옛 판 → termsChanged{새 판} · 저장 0 · 새 판으로 다시 → saved", async () => {
    const ev = await leakEvent();
    const old = await currentTerms();
    await setSettingValue(SYSTEM_VIEWER, CERT_RETENTION_YEARS, old.retentionYears + 2);
    const fresh = await currentTerms();
    expect(await submitCertificate(ev.token, inputFor(ev.prizeA, old), "203.0.113.9")).toEqual({
      kind: "termsChanged",
      terms: fresh,
    });
    expect(await submissionsOf(ev.eventId)).toHaveLength(0);
    expect((await submitCertificate(ev.token, inputFor(ev.prizeA, fresh), "203.0.113.9")).kind).toBe("saved");
  });
});

describe("속도 제한(설계 /cso E10 — 창 15분 · IP max(30, W) · 행사 max(40, 2W))", () => {
  it("W = 1 — 같은 IP 31번째 throttled(저장 0 · 서명 객체 0 · 로그 {scope: ip, eventId} 1줄, IP 가명 없음) · 다른 IP saved", async () => {
    const ev = await createCertEvent({ name: "IP한도" });
    const prizeId = ev.prizeIds[0]!;
    await seedIpSubmissionsForTest(ev.eventId, { ip: "198.51.100.7", count: 30 });
    const objectsBefore = objectCount(ev.eventId);
    const warn = vi.spyOn(log, "warn");

    const blocked = await submitCertificate(ev.token!, inputFor(prizeId, await currentTerms()), "198.51.100.7");
    expect(blocked).toEqual({ kind: "throttled" });
    expect(await submissionsOf(ev.eventId)).toHaveLength(30);
    expect(objectCount(ev.eventId)).toBe(objectsBefore);
    const logs = throttleLogs(warn);
    expect(logs).toHaveLength(1);
    expect(logs[0]?.[1]).toEqual({ scope: "ip", eventId: ev.eventId });

    expect((await submitCertificate(ev.token!, inputFor(prizeId, await currentTerms()), "198.51.100.8")).kind).toBe("saved");
  });

  it("16분 뒤(시각 주입)는 같은 IP도 saved — 창은 저장된 제출 행의 15분 미끄럼", async () => {
    const ev = await createCertEvent({ name: "창지남" });
    await seedIpSubmissionsForTest(ev.eventId, { ip: "198.51.100.9", count: 30 });
    const later = new Date(Date.now() + 16 * 60 * 1000);
    const result = await submitCertificate(ev.token!, inputFor(ev.prizeIds[0]!, await currentTerms()), "198.51.100.9", {
      now: () => later,
    });
    expect(result.kind).toBe("saved");
  });

  it("같은 키 재전송은 한도와 무관하게 saved(저장 1건) — 새 키는 throttled", async () => {
    const ev = await createCertEvent({ name: "재전송한도" });
    const prizeId = ev.prizeIds[0]!;
    await seedIpSubmissionsForTest(ev.eventId, { ip: "198.51.100.10", count: 29 });
    const input = inputFor(prizeId, await currentTerms());
    const first = await submitCertificate(ev.token!, input, "198.51.100.10");
    expect(first.kind).toBe("saved");
    expect(await submitCertificate(ev.token!, input, "198.51.100.10")).toEqual(first);
    expect(await submissionsOf(ev.eventId)).toHaveLength(30);
    expect((await submitCertificate(ev.token!, inputFor(prizeId, await currentTerms()), "198.51.100.10")).kind).toBe(
      "throttled",
    );
  });

  it("행사 한도 — 두 IP 20 · 20건(창 셈 40) 뒤 셋째 IP의 41번째 throttled(scope event · 저장 0)", async () => {
    const ev = await createCertEvent({ name: "행사한도" });
    await seedIpSubmissionsForTest(ev.eventId, { ip: "198.51.100.21", count: 20 });
    await seedIpSubmissionsForTest(ev.eventId, { ip: "198.51.100.22", count: 20 });
    const warn = vi.spyOn(log, "warn");
    const result = await submitCertificate(ev.token!, inputFor(ev.prizeIds[0]!, await currentTerms()), "198.51.100.23");
    expect(result).toEqual({ kind: "throttled" });
    expect(throttleLogs(warn)[0]?.[1]).toEqual({ scope: "event", eventId: ev.eventId });
    expect(await submissionsOf(ev.eventId)).toHaveLength(40);
  });

  it("W = 31(목록 경품 당첨 수) — 한 IP 31번째 saved · 32번째 throttled(scope ip)", async () => {
    const ev = await createCertEvent({ name: "큰행사", prizes: [{ winnerCount: 31 }] });
    const prizeId = ev.prizeIds[0]!;
    await seedIpSubmissionsForTest(ev.eventId, { ip: "198.51.100.31", count: 30 });
    expect((await submitCertificate(ev.token!, inputFor(prizeId, await currentTerms()), "198.51.100.31")).kind).toBe("saved");
    const warn = vi.spyOn(log, "warn");
    expect((await submitCertificate(ev.token!, inputFor(prizeId, await currentTerms()), "198.51.100.31")).kind).toBe(
      "throttled",
    );
    expect(throttleLogs(warn)[0]?.[1]).toEqual({ scope: "ip", eventId: ev.eventId });
  });

  it("창 셈은 저장된 제출 행이다 — 대조 제외 · 파기 칸이 채워진 행도 센다", async () => {
    const ev = await createCertEvent({ name: "제외도셈" });
    await seedIpSubmissionsForTest(ev.eventId, { ip: "198.51.100.41", count: 30 });
    await db
      .update(certSubmissions)
      .set({ excludedAt: new Date(), purgedAt: new Date() })
      .where(eq(certSubmissions.eventId, ev.eventId));
    expect((await submitCertificate(ev.token!, inputFor(ev.prizeIds[0]!, await currentTerms()), "198.51.100.41")).kind).toBe(
      "throttled",
    );
  });

  it("잠근 뒤 재셈 — 창 셈 39에서 다른 IP 둘이 잠금 전 셈을 함께 통과해도 하나만 saved, 하나는 throttled", async () => {
    const ev = await createCertEvent({ name: "잠근뒤재셈" });
    const prizeId = ev.prizeIds[0]!;
    await seedIpSubmissionsForTest(ev.eventId, { ip: "198.51.100.51", count: 20 });
    await seedIpSubmissionsForTest(ev.eventId, { ip: "198.51.100.52", count: 19 });
    let arrived = 0;
    let release: () => void = () => {};
    const barrier = new Promise<void>((resolve) => {
      release = resolve;
    });
    const store = storeAfterPut(async () => {
      arrived++;
      if (arrived === 2) release();
      await barrier;
    });
    const terms = await currentTerms();
    const results = await Promise.all([
      submitCertificate(ev.token!, inputFor(prizeId, terms), "198.51.100.53", { signatureStore: store }),
      submitCertificate(ev.token!, inputFor(prizeId, terms), "198.51.100.54", { signatureStore: store }),
    ]);
    expect(arrived).toBe(2);
    expect(results.map((r) => r.kind).sort()).toEqual(["saved", "throttled"]);
    expect(await submissionsOf(ev.eventId)).toHaveLength(40);
  });
});

describe("닫힘 · 재전송", () => {
  it("제출 직전 담당자가 닫으면 closed{manual} · 기한이 지났으면 closed{expired} · 저장 0", async () => {
    const manual = await leakEvent();
    await closeCertEventForTest(manual.eventId);
    expect(await submitCertificate(manual.token, inputFor(manual.prizeA, await currentTerms()), "203.0.113.9")).toMatchObject({
      kind: "closed",
      reason: "manual",
    });
    const expired = await leakEvent();
    await db.update(certEvents).set({ expiresAt: new Date(Date.now() - 60_000) }).where(eq(certEvents.id, expired.eventId));
    expect(await submitCertificate(expired.token, inputFor(expired.prizeA, await currentTerms()), "203.0.113.9")).toMatchObject({
      kind: "closed",
      reason: "expired",
    });
    expect(await submissionsOf(manual.eventId)).toHaveLength(0);
    expect(await submissionsOf(expired.eventId)).toHaveLength(0);
  });

  it("같은 키 재전송은 닫힌 뒤에도 saved(같은 결과)", async () => {
    const ev = await leakEvent();
    const input = inputFor(ev.prizeA, await currentTerms());
    const first = await submitCertificate(ev.token, input, "203.0.113.9");
    await closeCertEventForTest(ev.eventId);
    expect(await submitCertificate(ev.token, input, "203.0.113.9")).toEqual(first);
    expect(await submissionsOf(ev.eventId)).toHaveLength(1);
  });
});

describe("경합 — 제출과 가액 변경(행사 행 잠금 규약)", () => {
  it("가액 변경 트랜잭션이 행사 행을 쥔 채 49,000으로 내리고 먼저 커밋하면, 잠금 전 검사를 통과한 제출도 prizeGone · 저장 0", async () => {
    const ev = await leakEvent();
    let holder: Awaited<ReturnType<typeof holdEventRow>> | undefined;
    const pending = submitCertificate(ev.token, inputFor(ev.prizeA, await currentTerms()), "203.0.113.9", {
      signatureStore: storeAfterPut(async () => {
        // 잠금 전 검사(가액 73,519 — 목록에 있음)는 끝났다. 이제 경품 쓰기가 행사 행을 먼저 잡고 가액을 내린다.
        holder = await holdEventRow(ev.eventId, async (client) => {
          await client.query("UPDATE cert_prizes SET unit_value_krw = 49000 WHERE id = $1", [ev.prizeA]);
        });
        setTimeout(() => void holder?.commit(), 300);
      }),
    });
    const result = await pending;
    expect(result.kind).toBe("prizeGone");
    if (result.kind === "prizeGone") expect(result.prizes.map((p) => p.id)).toEqual([ev.prizeB]);
    expect(await submissionsOf(ev.eventId)).toHaveLength(0);
  });

  it("제출이 먼저 커밋되면 saved — 뒤의 가액 변경은 저장된 제출을 바꾸지 않는다", async () => {
    const ev = await leakEvent();
    const result = await submitCertificate(ev.token, inputFor(ev.prizeA, await currentTerms()), "203.0.113.9");
    expect(result.kind).toBe("saved");
    await setCertPrizeValueForTest(ev.prizeA, 49_000);
    const [row] = await submissionsOf(ev.eventId);
    expect(row?.prizeId).toBe(ev.prizeA);
  });

  it("같은 멱등 키 동시 둘 → 제출 행 1 · 둘 다 saved(같은 결과)", async () => {
    const ev = await leakEvent();
    const input = inputFor(ev.prizeA, await currentTerms());
    let arrived = 0;
    let release: () => void = () => {};
    const barrier = new Promise<void>((resolve) => {
      release = resolve;
    });
    const store = storeAfterPut(async () => {
      arrived++;
      if (arrived === 2) release();
      await barrier;
    });
    const [a, b] = await Promise.all([
      submitCertificate(ev.token, input, "203.0.113.9", { signatureStore: store }),
      submitCertificate(ev.token, input, "203.0.113.9", { signatureStore: store }),
    ]);
    expect(a.kind).toBe("saved");
    expect(b).toEqual(a);
    expect(await submissionsOf(ev.eventId)).toHaveLength(1);
  });

  it("잠금 전 검사 뒤 경품이 현장 → 택배로 바뀌면(주소 없이 낸 제출) prizeGone(지금 목록) · 저장 0 · 객체 0 · 의도 행 0", async () => {
    const ev = await leakEvent();
    let holder: Awaited<ReturnType<typeof holdEventRow>> | undefined;
    const result = await submitCertificate(ev.token, inputFor(ev.prizeA, await currentTerms()), "203.0.113.9", {
      signatureStore: storeAfterPut(async () => {
        holder = await holdEventRow(ev.eventId, async (client) => {
          await client.query("UPDATE cert_prizes SET delivery = 'parcel' WHERE id = $1", [ev.prizeA]);
        });
        setTimeout(() => void holder?.commit(), 300);
      }),
    });
    expect(result.kind).toBe("prizeGone");
    if (result.kind === "prizeGone") {
      expect(result.prizes.find((p) => p.id === ev.prizeA)?.delivery).toBe("parcel");
    }
    expect(await submissionsOf(ev.eventId)).toHaveLength(0);
    expect(objectCount(ev.eventId)).toBe(0);
    const intents = await db
      .select()
      .from(certSignatureUploads)
      .where(like(certSignatureUploads.objectKey, `signatures/${ev.eventId}/%`));
    expect(intents).toHaveLength(0);
  });

  it("잠금 전 검사 뒤 경품이 택배 → 현장으로 바뀌면(주소를 낸 제출) prizeGone(지금 목록) · 저장 0 · 객체 0 · 의도 행 0", async () => {
    const ev = await leakEvent();
    let holder: Awaited<ReturnType<typeof holdEventRow>> | undefined;
    const input = inputFor(ev.prizeB, await currentTerms(), { address: "서울시 중구 세종대로 110" });
    const result = await submitCertificate(ev.token, input, "203.0.113.9", {
      signatureStore: storeAfterPut(async () => {
        holder = await holdEventRow(ev.eventId, async (client) => {
          await client.query("UPDATE cert_prizes SET delivery = 'onsite' WHERE id = $1", [ev.prizeB]);
        });
        setTimeout(() => void holder?.commit(), 300);
      }),
    });
    expect(result.kind).toBe("prizeGone");
    if (result.kind === "prizeGone") {
      expect(result.prizes.find((p) => p.id === ev.prizeB)?.delivery).toBe("onsite");
    }
    expect(await submissionsOf(ev.eventId)).toHaveLength(0);
    expect(objectCount(ev.eventId)).toBe(0);
    const intents = await db
      .select()
      .from(certSignatureUploads)
      .where(like(certSignatureUploads.objectKey, `signatures/${ev.eventId}/%`));
    expect(intents).toHaveLength(0);
  });

  it("E13 — 제출이 행사 행 잠금을 기다리는 사이 행사 행이 지워지면 notFound · 저장 0 · 번호 카운터 그대로 · 객체 0", async () => {
    const ev = await leakEvent();
    const counterOf = async () => {
      const [row] = await db
        .select({ value: documentCounters.value })
        .from(documentCounters)
        .where(and(eq(documentCounters.counterKey, "cert"), eq(documentCounters.period, String(kstYear(new Date())))));
      return row?.value ?? null;
    };
    const counterBefore = await counterOf();
    let holder: Awaited<ReturnType<typeof holdEventRow>> | undefined;
    const result = await submitCertificate(ev.token, inputFor(ev.prizeA, await currentTerms()), "203.0.113.9", {
      signatureStore: storeAfterPut(async () => {
        holder = await holdEventRow(ev.eventId, async (client) => {
          await client.query("DELETE FROM cert_prizes WHERE event_id = $1", [ev.eventId]);
          await client.query("DELETE FROM cert_events WHERE id = $1", [ev.eventId]);
        });
        setTimeout(() => void holder?.commit(), 300);
      }),
    });
    expect(result.kind).toBe("notFound");
    expect(await submissionsOf(ev.eventId)).toHaveLength(0);
    expect(await counterOf()).toBe(counterBefore);
    expect(objectCount(ev.eventId)).toBe(0);
  });
});

describe("몰림 · 풀 고갈 없음(AX-P2 새 모양 — E18)", () => {
  it(
    "IP 한도를 넘은 같은 IP 가명 DB_POOL_MAX × 3건이 행사 행이 쥐여 있어도 곧바로 모두 throttled · 그동안 다른 행사 loadIntake 5초 안 open · 서명 객체 0",
    async () => {
      const a = await createCertEvent({ name: "몰림A" });
      const b = await createCertEvent({ name: "몰림B" });
      await seedIpSubmissionsForTest(a.eventId, { ip: "198.51.100.61", count: 30 });
      const objectsBefore = objectCount(a.eventId);
      const holder = await holdEventRow(a.eventId);
      try {
        const terms = await currentTerms();
        const pending = Promise.all(
          Array.from({ length: env.DB_POOL_MAX * 3 }, () =>
            submitCertificate(a.token!, inputFor(a.prizeIds[0]!, terms), "198.51.100.61"),
          ),
        );
        const start = performance.now();
        const intake = await loadIntake(b.token!);
        expect(intake.kind).toBe("open");
        expect(performance.now() - start).toBeLessThan(5000);
        const results = await Promise.race([pending, new Promise<"timeout">((r) => setTimeout(() => r("timeout"), 4000))]);
        expect(results).not.toBe("timeout");
        if (results !== "timeout") expect(results.every((r) => r.kind === "throttled")).toBe(true);
      } finally {
        await holder.release();
      }
      expect(objectCount(a.eventId)).toBe(objectsBefore);
    },
    30_000,
  );

  it(
    "여러 IP 몰림 — 행사 창 셈 40 뒤 서로 다른 IP DB_POOL_MAX × 3건도 잠금 대기 없이 모두 throttled(scope event)",
    async () => {
      const a = await createCertEvent({ name: "몰림여러IP" });
      await seedIpSubmissionsForTest(a.eventId, { ip: "198.51.100.71", count: 20 });
      await seedIpSubmissionsForTest(a.eventId, { ip: "198.51.100.72", count: 20 });
      const warn = vi.spyOn(log, "warn");
      const holder = await holdEventRow(a.eventId);
      try {
        const terms = await currentTerms();
        const pending = Promise.all(
          Array.from({ length: env.DB_POOL_MAX * 3 }, (_, i) =>
            submitCertificate(a.token!, inputFor(a.prizeIds[0]!, terms), `198.51.101.${i + 1}`),
          ),
        );
        const results = await Promise.race([pending, new Promise<"timeout">((r) => setTimeout(() => r("timeout"), 4000))]);
        expect(results).not.toBe("timeout");
        if (results !== "timeout") expect(results.every((r) => r.kind === "throttled")).toBe(true);
      } finally {
        await holder.release();
      }
      const logs = throttleLogs(warn);
      expect(logs.length).toBe(env.DB_POOL_MAX * 3);
      expect(logs.every((call) => (call[1] as { scope: string }).scope === "event")).toBe(true);
    },
    30_000,
  );

  it(
    "한도 안의 제출이 행사 행 잠금을 5초(lock_timeout) 넘게 기다리면 결과 불명(예외)이고, 풀린 뒤 같은 키 재시도는 saved",
    async () => {
      const ev = await createCertEvent({ name: "잠금대기" });
      const input = inputFor(ev.prizeIds[0]!, await currentTerms());
      const holder = await holdEventRow(ev.eventId);
      try {
        await expect(submitCertificate(ev.token!, input, "198.51.100.81")).rejects.toThrow();
      } finally {
        await holder.release();
      }
      expect((await submitCertificate(ev.token!, input, "198.51.100.81")).kind).toBe("saved");
      expect(await submissionsOf(ev.eventId)).toHaveLength(1);
    },
    30_000,
  );
});

describe("누수 스윕 — 공개 domain 결과 전 갈래 · 공개 액션 오류 문자열(양성 · 차등 대조군)", () => {
  it(
    "열림 · 닫힘 둘 · 없음 · 열림 전 · 경품 없음과 saved · invalid · rrnRecheck · closed · notFound · notYetOpen · prizeGone · termsChanged · throttled · 재전송 결과에 가액 패턴 0건",
    async () => {
      expect(scannerSelfTest()).toBe(true);
      const terms = await currentTerms();
      const ip = "203.0.113.200";

      const open = await leakEvent();
      const openIntake = await loadIntake(open.token);
      const savedInput = inputFor(open.prizeB, terms, { address: "서울시 마포구 월드컵로 1" });
      const saved = await submitCertificate(open.token, savedInput, ip);
      const replay = await submitCertificate(open.token, savedInput, ip);
      const invalid = await submitCertificate(open.token, inputFor(open.prizeA, terms, { phone: "12" }), ip);
      const rrnRecheck = await submitCertificate(
        open.token,
        inputFor(open.prizeA, terms, { rrnBack7: "2123459", rrnRecheckConfirmed: false }),
        ip,
      );
      const termsChanged = await submitCertificate(open.token, inputFor(open.prizeA, { ...terms, retentionYears: 99 }), ip);
      const notFound = await submitCertificate(randomUUID(), inputFor(open.prizeA, terms), ip);
      const notFoundIntake = await loadIntake(randomUUID());

      const gone = await leakEvent();
      await setCertPrizeValueForTest(gone.prizeA, 49_000);
      const prizeGone = await submitCertificate(gone.token, inputFor(gone.prizeA, terms), ip);

      const manual = await leakEvent();
      await closeCertEventForTest(manual.eventId);
      const closedManualIntake = await loadIntake(manual.token);
      const closedManual = await submitCertificate(manual.token, inputFor(manual.prizeA, terms), ip);
      const expired = await leakEvent();
      await db.update(certEvents).set({ expiresAt: new Date(Date.now() - 60_000) }).where(eq(certEvents.id, expired.eventId));
      const closedExpiredIntake = await loadIntake(expired.token);

      const later = await leakEvent({ wonOn: addDays(kstToday(new Date()), 1) });
      const notYetOpenIntake = await loadIntake(later.token);
      const notYetOpen = await submitCertificate(later.token, inputFor(later.prizeA, terms), ip);

      const empty = await leakEvent();
      await setCertPrizeValueForTest(empty.prizeA, 50_000);
      await setCertPrizeValueForTest(empty.prizeB, 30_000);
      const emptyIntake = await loadIntake(empty.token);

      const busy = await leakEvent();
      await seedIpSubmissionsForTest(busy.eventId, { ip: "198.51.100.90", count: 30, prizeId: busy.prizeA });
      const throttled = await submitCertificate(busy.token, inputFor(busy.prizeA, terms), "198.51.100.90");

      // 공개 액션 오류 처리 — DB 오류(SQL에 가액 숫자 파라미터)를 주입한 제출이 던진 예외를 handleServerError가
      // 화면 문자열로 바꾼다. 원본 예외 메시지에는 가액이 있다(양성 — 검출기가 실제로 걸린다).
      let thrown: unknown;
      try {
        await submitCertificate(open.token, inputFor(open.prizeA, terms), ip, {
          withTransaction: (fn) =>
            withTransaction(async (tx) => {
              await tx.execute(sql`select ${A.unitValueKrw}::int / 0`);
              return fn(tx);
            }),
        });
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toBeInstanceOf(Error);
      const rawMessage =
        thrown instanceof Error ? `${thrown.message} ${thrown.cause instanceof Error ? thrown.cause.message : ""}` : "";
      expect(scanForLeaks(rawMessage, LEAK_PATTERNS).length).toBeGreaterThan(0);
      const actionError = handleServerError(thrown as Error);

      // 양성 단언 — 목록은 open · prizeGone 결과에만 있다.
      expect(JSON.stringify(openIntake)).toContain(A.name);
      expect(JSON.stringify(openIntake)).toContain(B.name);
      expect(JSON.stringify(prizeGone)).toContain(B.name);
      expect(saved.kind).toBe("saved");
      expect(replay).toEqual(saved);
      expect(invalid.kind).toBe("invalid");
      expect(rrnRecheck.kind).toBe("rrnRecheck");
      expect(termsChanged.kind).toBe("termsChanged");
      expect(notFound.kind).toBe("notFound");
      expect(notFoundIntake.kind).toBe("notFound");
      expect(prizeGone.kind).toBe("prizeGone");
      expect(closedManualIntake).toMatchObject({ kind: "closed", reason: "manual" });
      expect(closedManual).toMatchObject({ kind: "closed", reason: "manual" });
      expect(closedExpiredIntake).toMatchObject({ kind: "closed", reason: "expired" });
      expect(notYetOpenIntake).toMatchObject({ kind: "notYetOpen", eventName: later.eventName });
      expect(notYetOpen).toMatchObject({ kind: "notYetOpen", eventName: later.eventName });
      expect(emptyIntake).toMatchObject({ kind: "open", prizes: [] });
      expect(throttled.kind).toBe("throttled");

      // 경품 목록은 open에만(설계 /cso 「공개 목록 범위」) — 열림 전 · 닫힘 둘 · E6-d 결과에는 목록 경품 이름이 없다.
      for (const result of [notYetOpenIntake, notYetOpen, closedManualIntake, closedManual, closedExpiredIntake, emptyIntake]) {
        const text = JSON.stringify(result);
        expect(text).not.toContain(A.name);
        expect(text).not.toContain(B.name);
      }

      const all = [
        openIntake,
        saved,
        replay,
        invalid,
        rrnRecheck,
        termsChanged,
        notFound,
        notFoundIntake,
        prizeGone,
        closedManualIntake,
        closedManual,
        closedExpiredIntake,
        notYetOpenIntake,
        notYetOpen,
        emptyIntake,
        throttled,
      ];
      const corpus = `${JSON.stringify(all)}\n${actionError}`;
      expect(scanForLeaks(corpus, LEAK_PATTERNS)).toEqual([]);
      expect(corpus).not.toContain(C.name);
      expect(corpus).not.toMatch(/winner_?[cC]ount/);
    },
    60_000,
  );

  it("차등 대조군 — 가액 88,888 · 612,345 행사의 결과에 위 패턴 0건", async () => {
    const ev = await createCertEvent({
      name: "차등",
      prizes: [
        { name: "차등-가", unitValueKrw: 88_888, delivery: "onsite" },
        { name: "차등-나", unitValueKrw: 612_345, delivery: "parcel" },
      ],
    });
    const intake = await loadIntake(ev.token!);
    const saved = await submitCertificate(ev.token!, inputFor(ev.prizeIds[0]!, await currentTerms()), "203.0.113.9");
    const corpus = JSON.stringify([intake, saved]);
    expect(corpus).toContain("차등-가");
    expect(scanForLeaks(corpus, LEAK_PATTERNS)).toEqual([]);
    // 자기 가액도 결과에 없다(같은 검출기로 이 행사 값을 찾는다).
    expect(scanForLeaks(corpus, leakPatternsFor([88_888, 612_345]))).toEqual([]);
  });
});
