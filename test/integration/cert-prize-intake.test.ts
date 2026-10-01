import { randomUUID } from "node:crypto";
import { existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db/client";
import { certEvents, certSubmissions } from "@/db/schema";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { loadIntake, submitCertificate, type SubmitCertificateInput } from "@/domain/certs/intake";
import { CERT_CONSENT_VERSION } from "@/domain/certs/consent";
import { getSettingValue, setSettingValue } from "@/domain/settings/registry";
import { CERT_ENABLED, CERT_RETENTION_YEARS } from "@/domain/settings/keys";
import { addDays, kstDayStart, kstToday } from "@/lib/kst-date";
import {
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
