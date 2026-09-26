import { createHash, randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { Client } from "pg";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db/client";
import { certEvents, certWinners } from "@/db/schema";
import type { VerifyIdemEntry } from "@/db/schema/cert-winners";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { loadIntake, recheckWinnerLock, selectWinner, verifyLast4 } from "@/domain/certs/intake";
import { certIpHash } from "@/domain/certs/verify-lock";
import { setSettingValue } from "@/domain/settings/registry";
import { CERT_ENABLED, CERT_VERIFY_MAX_ATTEMPTS } from "@/domain/settings/keys";
import { countRecentMisses, listWinnersForIntake } from "@/repositories/cert-winners";
import { env } from "@/lib/env";
import { log } from "@/lib/log";
import { createCertEvent, withCertFeatureOff } from "@/test/e2e/helpers/cert";

// 04.3-03 Task 1 ⑦ — 자리 단위 잠금 · 누적 잠김 · 키별 멱등 재생 · 속도
// 제한 · 잠금 다시 확인 · 기능 게이트(실제 Postgres). 시각은 domain의
// now 인자로 주입한다. 동시 요청은 Promise.all(통합 프로젝트는 파일
// 병렬 없음 — 한 파일 안의 동시성만 본다).

const MIN = 60 * 1000;

beforeEach(async () => {
  await setSettingValue(SYSTEM_VIEWER, CERT_ENABLED, true);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function key(): string {
  return randomBytes(16).toString("base64url");
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function pad4(i: number): string {
  return String(i).padStart(4, "0");
}

// 당첨자 n명 — 이름·전화가 서로 다르고 뒤 4자리 = pad4(i + 1).
async function makeEvent(n = 1) {
  const winners = Array.from({ length: n }, (_, i) => ({
    name: `당첨자${i + 1}호`,
    phone: `010-5${pad4(i).slice(1)}-${pad4(i + 1)}`,
  }));
  const event = await createCertEvent({ winners });
  const rows = await listWinnersForIntake(SYSTEM_VIEWER, event.eventId);
  const seats = winners.map((w) => {
    const row = rows.find((r) => r.name === w.name);
    if (!row) throw new Error("당첨자를 찾지 못했다");
    return { id: row.id, last4: w.phone.slice(-4) };
  });
  return { ...event, seats };
}

async function seat(id: string) {
  const [row] = await db.select().from(certWinners).where(eq(certWinners.id, id));
  if (!row) throw new Error("자리 없음");
  return row;
}

async function patchSeat(id: string, patch: Partial<typeof certWinners.$inferInsert>) {
  await db.update(certWinners).set(patch).where(eq(certWinners.id, id));
}

function wrongEntry(at: Date, ip = "x"): VerifyIdemEntry {
  return { o: "wrong", r: { kind: "wrong", remaining: 4 }, ip, at: at.toISOString() };
}

// 행사 한도를 채운다 — 자리 하나의 맵에 틀림 항목 n개를 직접 쓴다(E2E와 같은 방법).
async function fillMisses(seatId: string, n: number, at: Date) {
  const map: Record<string, VerifyIdemEntry> = {};
  for (let i = 0; i < n; i++) map[`fill-${i}`] = wrongEntry(at);
  await patchSeat(seatId, { verifyIdemOutcome: map });
}

describe("자리 단위 짧은 잠금 · 동시 틀림", () => {
  it("같은 자리에 틀린 요청 6개 동시 → wrong 4 + locked 2, 잠금은 정확히 한 번", async () => {
    const ev = await makeEvent(1);
    const s = ev.seats[0]!;
    const results = await Promise.all(
      Array.from({ length: 6 }, () => verifyLast4(ev.token, s.id, "9999", key(), "10.0.0.1")),
    );
    const kinds = results.map((r) => r.kind).sort();
    expect(kinds).toEqual(["locked", "locked", "wrong", "wrong", "wrong", "wrong"]);
    const row = await seat(s.id);
    expect(row.failedAttempts).toBe(5);
    expect(row.cumulativeFailedAttempts).toBe(5);
    expect(row.lockedUntil).not.toBeNull();
    const lockingEntries = Object.values(row.verifyIdemOutcome ?? {}).filter((e) => e.r.kind === "locked");
    expect(lockingEntries).toHaveLength(1);
  });

  it("4번째 틀림은 남은 1번, 5번째는 잠김(한도 · 시각은 응답 값)", async () => {
    const ev = await makeEvent(1);
    const s = ev.seats[0]!;
    const now = new Date("2026-09-26T09:40:10Z");
    for (let i = 0; i < 3; i++) await verifyLast4(ev.token, s.id, "9999", key(), null, now);
    expect(await verifyLast4(ev.token, s.id, "9999", key(), null, now)).toEqual({ kind: "wrong", remaining: 1 });
    expect(await verifyLast4(ev.token, s.id, "9999", key(), null, now)).toEqual({
      kind: "locked",
      limit: 5,
      unlockAtDisplay: "18:44",
      remainingSeconds: 180,
    });
  });

  it("잠긴 동안 맞는 4자리도 locked, 해제 시각 뒤 맞는 4자리는 ok(클라이언트 타이머와 무관한 서버 판정)", async () => {
    const ev = await makeEvent(1);
    const s = ev.seats[0]!;
    const now = new Date();
    for (let i = 0; i < 5; i++) await verifyLast4(ev.token, s.id, "9999", key(), null, now);
    expect((await verifyLast4(ev.token, s.id, s.last4, key(), null, new Date(now.getTime() + MIN))).kind).toBe("locked");
    const after = await verifyLast4(ev.token, s.id, s.last4, key(), null, new Date(now.getTime() + 3 * MIN));
    expect(after.kind).toBe("ok");
    const row = await seat(s.id);
    expect(row.failedAttempts).toBe(0);
    expect(row.cumulativeFailedAttempts).toBe(5);
  });
});

describe("키별 멱등 재생(틀림)", () => {
  it("같은 키 두 번 → 응답 같고 failed 1 · 다른 키 → 2", async () => {
    const ev = await makeEvent(1);
    const s = ev.seats[0]!;
    const k = key();
    const first = await verifyLast4(ev.token, s.id, "9999", k, null);
    const second = await verifyLast4(ev.token, s.id, "9999", k, null);
    expect(second).toEqual(first);
    expect((await seat(s.id)).failedAttempts).toBe(1);
    await verifyLast4(ev.token, s.id, "9999", key(), null);
    expect((await seat(s.id)).failedAttempts).toBe(2);
  });

  it("끼어든 키 A → B → A: A의 두 응답이 같고 failed 2", async () => {
    const ev = await makeEvent(1);
    const s = ev.seats[0]!;
    const a = key();
    const first = await verifyLast4(ev.token, s.id, "9999", a, null);
    await verifyLast4(ev.token, s.id, "9998", key(), null);
    const again = await verifyLast4(ev.token, s.id, "9999", a, null);
    expect(again).toEqual(first);
    expect((await seat(s.id)).failedAttempts).toBe(2);
  });

  it("동시에 온 같은 키 둘 → 응답 같고 failed 1", async () => {
    const ev = await makeEvent(1);
    const s = ev.seats[0]!;
    const a = key();
    const [r1, r2] = await Promise.all([
      verifyLast4(ev.token, s.id, "9999", a, null),
      verifyLast4(ev.token, s.id, "9999", a, null),
    ]);
    expect(r1).toEqual(r2);
    expect((await seat(s.id)).failedAttempts).toBe(1);
  });

  it("잠금을 건 키의 재전송 — 잠긴 동안 같은 해제 시각, 해제 뒤에도 다시 세지 않는다(남은 초 0)", async () => {
    const ev = await makeEvent(1);
    const s = ev.seats[0]!;
    const now = new Date();
    for (let i = 0; i < 4; i++) await verifyLast4(ev.token, s.id, "9999", key(), null, now);
    const k5 = key();
    const locking = await verifyLast4(ev.token, s.id, "9999", k5, null, now);
    expect(locking.kind).toBe("locked");
    const before = await seat(s.id);

    const during = await verifyLast4(ev.token, s.id, "9999", k5, null, new Date(now.getTime() + MIN));
    expect(during).toMatchObject({ kind: "locked", unlockAtDisplay: (locking as { unlockAtDisplay: string }).unlockAtDisplay });
    const mid = await seat(s.id);
    expect(mid.failedAttempts).toBe(before.failedAttempts);
    expect(mid.lockedUntil?.getTime()).toBe(before.lockedUntil?.getTime());

    const later = await verifyLast4(ev.token, s.id, "9999", k5, null, new Date(now.getTime() + 4 * MIN));
    expect(later).toMatchObject({ kind: "locked", remainingSeconds: 0 });
    expect((await seat(s.id)).failedAttempts).toBe(5);
  });

  it("잠김만 받은(상태를 바꾸지 않은) 키 — 잠긴 동안 재전송해도 locked_until이 늘지 않고, 해제 뒤 맞는 4자리는 지금 판정해 ok", async () => {
    const ev = await makeEvent(1);
    const s = ev.seats[0]!;
    const now = new Date();
    for (let i = 0; i < 5; i++) await verifyLast4(ev.token, s.id, "9999", key(), null, now);
    const lockedUntil = (await seat(s.id)).lockedUntil;
    const k = key();
    expect((await verifyLast4(ev.token, s.id, s.last4, k, null, new Date(now.getTime() + MIN))).kind).toBe("locked");
    expect((await verifyLast4(ev.token, s.id, s.last4, k, null, new Date(now.getTime() + 2 * MIN))).kind).toBe("locked");
    expect((await seat(s.id)).lockedUntil?.getTime()).toBe(lockedUntil?.getTime());
    expect((await verifyLast4(ev.token, s.id, s.last4, k, null, new Date(now.getTime() + 3 * MIN))).kind).toBe("ok");
  });

  it("60분 정각 재전송은 재생, 61분 재전송은 새 시도(읽을 때 만료)", async () => {
    const ev = await makeEvent(2);
    const now = new Date();
    const [s1, s2] = ev.seats as [{ id: string }, { id: string }];

    const a = key();
    await verifyLast4(ev.token, s1.id, "9999", a, null, now);
    await verifyLast4(ev.token, s1.id, "9999", a, null, new Date(now.getTime() + 60 * MIN));
    expect((await seat(s1.id)).failedAttempts).toBe(1);

    const b = key();
    await verifyLast4(ev.token, s2.id, "9999", b, null, now);
    await verifyLast4(ev.token, s2.id, "9999", b, null, new Date(now.getTime() + 61 * MIN));
    expect((await seat(s2.id)).failedAttempts).toBe(2);
  });
});

describe("키별 멱등 재생(맞음 · 증표)", () => {
  it("증표 불변 — A 재전송은 같은 P1 · T1, 뒤에 B가 P2를 받아도 늦은 A는 P1 · T1이고 자리 해시는 P2", async () => {
    const ev = await makeEvent(1);
    const s = ev.seats[0]!;
    const a = key();
    const first = await verifyLast4(ev.token, s.id, s.last4, a, null);
    if (first.kind !== "ok") throw new Error("unreachable");
    const again = await verifyLast4(ev.token, s.id, s.last4, a, null);
    expect(again).toEqual(first);
    expect((await seat(s.id)).verifyProofHash).toBe(sha256Hex(first.proof));

    const second = await verifyLast4(ev.token, s.id, s.last4, key(), null);
    if (second.kind !== "ok") throw new Error("unreachable");
    expect(second.proof).not.toBe(first.proof);

    const late = await verifyLast4(ev.token, s.id, s.last4, a, null);
    expect(late).toEqual(first);
    expect((await seat(s.id)).verifyProofHash).toBe(sha256Hex(second.proof));
  });

  it("재생 불가(복호 실패) → expiredProof, 자리의 더 새 증표 · 만료 · 셈 · 맵이 그대로, 새 키 C는 정상 ok", async () => {
    const ev = await makeEvent(1);
    const s = ev.seats[0]!;
    const a = key();
    const first = await verifyLast4(ev.token, s.id, s.last4, a, null);
    if (first.kind !== "ok") throw new Error("unreachable");
    const map = { ...(await seat(s.id)).verifyIdemOutcome };
    const aHash = sha256Hex(a);
    const entry = map[aHash];
    if (!entry || entry.o !== "ok") throw new Error("A 항목이 없다");
    map[aHash] = { ...entry, p: "v1:broken-ciphertext" };
    await patchSeat(s.id, { verifyIdemOutcome: map });

    const second = await verifyLast4(ev.token, s.id, s.last4, key(), null);
    if (second.kind !== "ok") throw new Error("unreachable");
    const before = await seat(s.id);

    expect(await verifyLast4(ev.token, s.id, s.last4, a, null)).toEqual({ kind: "expiredProof" });
    const after = await seat(s.id);
    expect(after.verifyProofHash).toBe(sha256Hex(second.proof));
    expect(after.verifiedUntil?.getTime()).toBe(before.verifiedUntil?.getTime());
    expect(after.failedAttempts).toBe(before.failedAttempts);
    expect(after.verifyIdemOutcome).toEqual(before.verifyIdemOutcome);

    expect((await verifyLast4(ev.token, s.id, s.last4, key(), null)).kind).toBe("ok");
  });

  it("제출 뒤 재생 → 증표가 아니라 submitted", async () => {
    const ev = await makeEvent(1);
    const s = ev.seats[0]!;
    const a = key();
    expect((await verifyLast4(ev.token, s.id, s.last4, a, null)).kind).toBe("ok");
    await patchSeat(s.id, { submittedAt: new Date() });
    expect((await verifyLast4(ev.token, s.id, s.last4, a, null)).kind).toBe("submitted");
  });

  it("맵 상한 — 서로 다른 키 21개로 맞음 → 맵 20개 · 첫 키 없음, 첫 키 재전송은 새 증표", async () => {
    const ev = await makeEvent(1);
    const s = ev.seats[0]!;
    const base = Date.now();
    const keys = Array.from({ length: 21 }, () => key());
    let firstProof = "";
    for (let i = 0; i < keys.length; i++) {
      const r = await verifyLast4(ev.token, s.id, s.last4, keys[i]!, null, new Date(base + i * 1000));
      if (r.kind !== "ok") throw new Error("unreachable");
      if (i === 0) firstProof = r.proof;
    }
    const map = (await seat(s.id)).verifyIdemOutcome ?? {};
    expect(Object.keys(map)).toHaveLength(20);
    expect(map[sha256Hex(keys[0]!)]).toBeUndefined();
    const again = await verifyLast4(ev.token, s.id, s.last4, keys[0]!, null, new Date(base + 30_000));
    if (again.kind !== "ok") throw new Error("unreachable");
    expect(again.proof).not.toBe(firstProof);
  });

  it("저장된 맵에 증표 평문 · 4자리 · IP 원문이 없다", async () => {
    const ev = await makeEvent(1);
    const s = ev.seats[0]!;
    await verifyLast4(ev.token, s.id, "9999", key(), "211.34.56.78");
    const ok = await verifyLast4(ev.token, s.id, s.last4, key(), "211.34.56.78");
    if (ok.kind !== "ok") throw new Error("unreachable");
    const json = JSON.stringify((await seat(s.id)).verifyIdemOutcome);
    expect(json).not.toContain(ok.proof);
    expect(json).not.toContain("211.34.56.78");
    expect(json).not.toContain(s.last4);
    expect(json).not.toContain("9999");
  });
});

describe("누적 잠김(고정 20)", () => {
  it("짧은 잠김 넷을 지나 20번째 틀림 = hardLocked, 1시간 뒤 맞는 4자리도 hardLocked", async () => {
    const ev = await makeEvent(1);
    const s = ev.seats[0]!;
    let t = Date.now();
    let ipN = 0;
    const results: string[] = [];
    for (let round = 0; round < 4; round++) {
      for (let i = 0; i < 5; i++) {
        const r = await verifyLast4(ev.token, s.id, "9999", key(), `10.1.0.${ipN++}`, new Date(t));
        results.push(r.kind);
      }
      t += 4 * MIN;
    }
    expect(results.slice(0, 4)).toEqual(["wrong", "wrong", "wrong", "wrong"]);
    expect(results[4]).toBe("locked");
    expect(results[9]).toBe("locked");
    expect(results[14]).toBe("locked");
    expect(results.slice(15, 19)).toEqual(["wrong", "wrong", "wrong", "wrong"]);
    expect(results[19]).toBe("hardLocked");
    const row = await seat(s.id);
    expect(row.cumulativeFailedAttempts).toBe(20);
    expect(row.hardLockedAt).not.toBeNull();
    // 세 번째 짧은 잠김(15번째 틀림)이 쓴 시각 그대로 — 누적 잠김은 locked_until을 쓰지 않는다.
    expect(row.lockedUntil!.getTime()).toBeLessThan(row.hardLockedAt!.getTime());

    const later = await verifyLast4(ev.token, s.id, s.last4, key(), "10.1.1.1", new Date(t + 60 * MIN));
    expect(later).toEqual({ kind: "hardLocked" });
    expect((await seat(s.id)).verifyProofHash).toBeNull();
  });

  it("맞음은 누적을 줄이지 않는다 — 틀림 5 → 맞음 → 틀림 15번째 = 누적 20 → hardLocked", async () => {
    const ev = await makeEvent(1);
    const s = ev.seats[0]!;
    let t = Date.now();
    let ipN = 0;
    for (let i = 0; i < 5; i++) await verifyLast4(ev.token, s.id, "9999", key(), `10.2.0.${ipN++}`, new Date(t));
    t += 4 * MIN;
    expect((await verifyLast4(ev.token, s.id, s.last4, key(), `10.2.0.${ipN++}`, new Date(t))).kind).toBe("ok");
    const afterOk = await seat(s.id);
    expect(afterOk.failedAttempts).toBe(0);
    expect(afterOk.cumulativeFailedAttempts).toBe(5);
    const kinds: string[] = [];
    for (let i = 0; i < 15; i++) {
      kinds.push((await verifyLast4(ev.token, s.id, "9999", key(), `10.2.0.${ipN++}`, new Date(t))).kind);
      if ((i + 1) % 5 === 0) t += 4 * MIN;
    }
    expect(kinds[14]).toBe("hardLocked");
    expect((await seat(s.id)).cumulativeFailedAttempts).toBe(20);
  });

  it("재전송은 누적을 더하지 않는다 · 담당자가 푼 뒤 재전송은 다시 세지 않고 wrong{remaining: 5}", async () => {
    const ev = await makeEvent(1);
    const s = ev.seats[0]!;
    await patchSeat(s.id, { cumulativeFailedAttempts: 18 });
    const x = key();
    const rx = await verifyLast4(ev.token, s.id, "9999", x, null);
    expect((await seat(s.id)).cumulativeFailedAttempts).toBe(19);
    expect(await verifyLast4(ev.token, s.id, "9999", x, null)).toEqual(rx);
    expect(await verifyLast4(ev.token, s.id, "9999", x, null)).toEqual(rx);
    expect((await seat(s.id)).cumulativeFailedAttempts).toBe(19);

    const y = key();
    expect(await verifyLast4(ev.token, s.id, "9999", y, null)).toEqual({ kind: "hardLocked" });
    expect(await verifyLast4(ev.token, s.id, "9999", y, null)).toEqual({ kind: "hardLocked" });
    expect((await seat(s.id)).cumulativeFailedAttempts).toBe(20);

    await patchSeat(s.id, { failedAttempts: 0, cumulativeFailedAttempts: 0, hardLockedAt: null, lockedUntil: null });
    expect(await verifyLast4(ev.token, s.id, "9999", y, null)).toEqual({ kind: "wrong", remaining: 5 });
    const row = await seat(s.id);
    expect(row.failedAttempts).toBe(0);
    expect(row.cumulativeFailedAttempts).toBe(0);
  });

  it("누적 19에서 서로 다른 키의 틀림 둘이 동시에 → 둘 다 hardLocked, 누적은 정확히 20", async () => {
    const ev = await makeEvent(1);
    const s = ev.seats[0]!;
    await patchSeat(s.id, { cumulativeFailedAttempts: 19 });
    const [r1, r2] = await Promise.all([
      verifyLast4(ev.token, s.id, "9999", key(), null),
      verifyLast4(ev.token, s.id, "9998", key(), null),
    ]);
    expect(r1).toEqual({ kind: "hardLocked" });
    expect(r2).toEqual({ kind: "hardLocked" });
    const row = await seat(s.id);
    expect(row.cumulativeFailedAttempts).toBe(20);
    expect(Object.keys(row.verifyIdemOutcome ?? {})).toHaveLength(1);
  });

  it("누적 잠김이 맞음 재생보다 앞선다 — A 맞음 → 남이 누적 잠금 → A 재전송 = hardLocked, 셈 · 맵 · 증표 불변(제출돼도 같다)", async () => {
    const ev = await makeEvent(1);
    const s = ev.seats[0]!;
    const a = key();
    expect((await verifyLast4(ev.token, s.id, s.last4, a, null)).kind).toBe("ok");
    await patchSeat(s.id, { cumulativeFailedAttempts: 19 });
    expect((await verifyLast4(ev.token, s.id, "9999", key(), null)).kind).toBe("hardLocked");
    const before = await seat(s.id);
    expect(await verifyLast4(ev.token, s.id, s.last4, a, null)).toEqual({ kind: "hardLocked" });
    const after = await seat(s.id);
    expect(after.failedAttempts).toBe(before.failedAttempts);
    expect(after.cumulativeFailedAttempts).toBe(before.cumulativeFailedAttempts);
    expect(after.hardLockedAt?.getTime()).toBe(before.hardLockedAt?.getTime());
    expect(after.verifyIdemOutcome).toEqual(before.verifyIdemOutcome);
    expect(after.verifyProofHash).toBe(before.verifyProofHash);

    await patchSeat(s.id, { submittedAt: new Date() });
    expect(await verifyLast4(ev.token, s.id, s.last4, a, null)).toEqual({ kind: "hardLocked" });
  });

  it("누적 잠긴 제출 자리에 맞는 4자리 → submitted가 아니라 hardLocked", async () => {
    const ev = await makeEvent(1);
    const s = ev.seats[0]!;
    await patchSeat(s.id, { submittedAt: new Date(), cumulativeFailedAttempts: 20, hardLockedAt: new Date() });
    expect(await verifyLast4(ev.token, s.id, s.last4, key(), null)).toEqual({ kind: "hardLocked" });
  });
});

describe("제출 비노출 · 닫힘 · 기능 게이트", () => {
  it("제출한 자리를 틀린 4자리로 → wrong(셈), 맞힌 4자리 → submitted", async () => {
    const ev = await makeEvent(1);
    const s = ev.seats[0]!;
    await patchSeat(s.id, { submittedAt: new Date() });
    expect((await verifyLast4(ev.token, s.id, "9999", key(), null)).kind).toBe("wrong");
    expect((await seat(s.id)).failedAttempts).toBe(1);
    expect((await verifyLast4(ev.token, s.id, s.last4, key(), null)).kind).toBe("submitted");
  });

  it("링크가 닫힌 뒤(기한 지남) verifyLast4 → closed(사유 expired), 셈 변화 없음", async () => {
    const ev = await makeEvent(1);
    const s = ev.seats[0]!;
    const future = new Date(Date.now() + 100 * 60 * MIN);
    expect(await verifyLast4(ev.token, s.id, "9999", key(), null, future)).toMatchObject({
      kind: "closed",
      reason: "expired",
    });
    expect((await seat(s.id)).failedAttempts).toBe(0);
  });

  it("C1 — 기능이 꺼지면 selectWinner · verifyLast4 · recheckWinnerLock이 판정 없이 notFound, 자리 행 그대로", async () => {
    const ev = await makeEvent(1);
    const s = ev.seats[0]!;
    const before = await seat(s.id);
    await withCertFeatureOff(async () => {
      expect((await selectWinner(ev.token, s.id)).kind).toBe("notFound");
      expect((await verifyLast4(ev.token, s.id, "9999", key(), null)).kind).toBe("notFound");
      expect((await recheckWinnerLock(ev.token, s.id)).kind).toBe("notFound");
    });
    expect(await seat(s.id)).toEqual(before);
  });

  it("입력 거부 — 4자리 숫자가 아니거나 멱등 키 형식이 아니면 던지고 세지 않는다", async () => {
    const ev = await makeEvent(1);
    const s = ev.seats[0]!;
    await expect(verifyLast4(ev.token, s.id, "12a4", key(), null)).rejects.toThrow();
    await expect(verifyLast4(ev.token, s.id, "999", key(), null)).rejects.toThrow();
    await expect(verifyLast4(ev.token, s.id, "9999", "short", null)).rejects.toThrow();
    expect((await seat(s.id)).failedAttempts).toBe(0);
  });
});

describe("selectWinner — 잠김 증명 · 제출 비노출", () => {
  it("짧은 잠김 자리 → ok + locked{limit, unlockAtDisplay, remainingSeconds}", async () => {
    const ev = await makeEvent(1);
    const s = ev.seats[0]!;
    await patchSeat(s.id, { failedAttempts: 5, lockedUntil: new Date(Date.now() + 2 * MIN) });
    const r = await selectWinner(ev.token, s.id);
    expect(r).toMatchObject({ kind: "ok", locked: { limit: 5 } });
    if (r.kind !== "ok" || !r.locked) throw new Error("unreachable");
    expect(r.locked.unlockAtDisplay).toMatch(/^\d{2}:\d{2}$/);
    expect(r.locked.remainingSeconds).toBeGreaterThan(100);
    expect(r).not.toHaveProperty("hardLocked");
  });

  it("누적 잠긴 자리 → ok + hardLocked: true, locked 블록 없음", async () => {
    const ev = await makeEvent(1);
    const s = ev.seats[0]!;
    await patchSeat(s.id, {
      cumulativeFailedAttempts: 20,
      hardLockedAt: new Date(),
      lockedUntil: new Date(Date.now() + 2 * MIN),
    });
    const r = await selectWinner(ev.token, s.id);
    expect(r).toMatchObject({ kind: "ok", hardLocked: true });
    expect(r).not.toHaveProperty("locked");
  });

  it("제출한 자리와 안 한 자리의 응답 키 집합이 같다(누적 잠긴 두 자리도 같다)", async () => {
    const ev = await makeEvent(4);
    const [a, b, c, d] = ev.seats as [{ id: string }, { id: string }, { id: string }, { id: string }];
    await patchSeat(a.id, { submittedAt: new Date() });
    await patchSeat(c.id, { submittedAt: new Date(), cumulativeFailedAttempts: 20, hardLockedAt: new Date() });
    await patchSeat(d.id, { cumulativeFailedAttempts: 20, hardLockedAt: new Date() });
    const keysOf = async (id: string) => Object.keys(await selectWinner(ev.token, id)).sort();
    expect(await keysOf(a.id)).toEqual(await keysOf(b.id));
    expect(await keysOf(c.id)).toEqual(await keysOf(d.id));
  });

  it("닫힌 행사에서 selectWinner → closed{reason}", async () => {
    const ev = await makeEvent(1);
    await db.update(certEvents).set({ closedAt: new Date(), closedReason: "manual" }).where(eq(certEvents.id, ev.eventId));
    expect(await selectWinner(ev.token, ev.seats[0]!.id)).toMatchObject({ kind: "closed", reason: "manual" });
  });
});

describe("recheckWinnerLock — 잠금 다시 확인(닫힘 우선 · limit · 제출 비노출 · 쓰기 없음)", () => {
  it("누적 잠김 → hardLocked · 짧은 잠김 → shortLocked{unlockAt, remainingSec, limit=설정값} · 잠김 없음 → open", async () => {
    await setSettingValue(SYSTEM_VIEWER, CERT_VERIFY_MAX_ATTEMPTS, 7);
    const ev = await makeEvent(3);
    const [h, sl, o] = ev.seats as [{ id: string }, { id: string }, { id: string }];
    const unlockAt = new Date(Date.now() + 2 * MIN);
    await patchSeat(h.id, { cumulativeFailedAttempts: 20, hardLockedAt: new Date() });
    await patchSeat(sl.id, { failedAttempts: 7, lockedUntil: unlockAt });
    expect(await recheckWinnerLock(ev.token, h.id)).toEqual({ kind: "hardLocked" });
    const short = await recheckWinnerLock(ev.token, sl.id);
    expect(short).toMatchObject({ kind: "shortLocked", limit: 7, unlockAt: unlockAt.toISOString() });
    if (short.kind !== "shortLocked") throw new Error("unreachable");
    expect(short.remainingSec).toBeGreaterThan(100);
    expect(await recheckWinnerLock(ev.token, o.id)).toEqual({ kind: "open" });
  });

  it("제출된 · 잠김 없는 자리도 open — 제출 자리와 안 한 자리의 응답 키 집합이 같다", async () => {
    const ev = await makeEvent(2);
    const [a, b] = ev.seats as [{ id: string }, { id: string }];
    await patchSeat(a.id, { submittedAt: new Date() });
    const ra = await recheckWinnerLock(ev.token, a.id);
    const rb = await recheckWinnerLock(ev.token, b.id);
    expect(ra).toEqual({ kind: "open" });
    expect(Object.keys(ra).sort()).toEqual(Object.keys(rb).sort());
  });

  it("행사가 닫혔으면 누적 잠긴 자리든 짧은 잠김 자리든 closed{reason}", async () => {
    const ev = await makeEvent(2);
    const [h, sl] = ev.seats as [{ id: string }, { id: string }];
    await patchSeat(h.id, { cumulativeFailedAttempts: 20, hardLockedAt: new Date() });
    await patchSeat(sl.id, { failedAttempts: 5, lockedUntil: new Date(Date.now() + 2 * MIN) });
    await db.update(certEvents).set({ closedAt: new Date(), closedReason: "manual" }).where(eq(certEvents.id, ev.eventId));
    expect(await recheckWinnerLock(ev.token, h.id)).toMatchObject({ kind: "closed", reason: "manual" });
    expect(await recheckWinnerLock(ev.token, sl.id)).toMatchObject({ kind: "closed", reason: "manual" });
    const expiredLater = new Date(Date.now() + 100 * 60 * MIN);
    await db.update(certEvents).set({ closedAt: null, closedReason: null }).where(eq(certEvents.id, ev.eventId));
    expect(await recheckWinnerLock(ev.token, h.id, expiredLater)).toMatchObject({ kind: "closed", reason: "expired" });
  });

  it("세 번 물어도 자리 행이 그대로 · 다른 행사의 자리 id → notFound", async () => {
    const ev = await makeEvent(1);
    const other = await makeEvent(1);
    const s = ev.seats[0]!;
    await patchSeat(s.id, { cumulativeFailedAttempts: 20, hardLockedAt: new Date(), failedAttempts: 3 });
    const before = await seat(s.id);
    for (let i = 0; i < 3; i++) await recheckWinnerLock(ev.token, s.id);
    expect(await seat(s.id)).toEqual(before);
    expect(await recheckWinnerLock(ev.token, other.seats[0]!.id)).toEqual({ kind: "notFound" });
  });
});

describe("속도 제한(C5 — 15분 · 행사 max(40, ceil(n×0.5)) · IP 20)", () => {
  it("같은 IP 20번 뒤 21번째 → throttled(셈 · 맵 불변), 같은 IP 맞는 4자리도 throttled, 다른 IP는 판정", async () => {
    const ev = await makeEvent(6);
    const ip = "203.0.113.7";
    for (let i = 0; i < 20; i++) {
      const s = ev.seats[Math.floor(i / 4)]!;
      const r = await verifyLast4(ev.token, s.id, "9999", key(), ip);
      expect(["wrong", "locked"]).toContain(r.kind);
    }
    const target = ev.seats[5]!;
    const before = await seat(target.id);
    expect(await verifyLast4(ev.token, target.id, "9999", key(), ip)).toEqual({ kind: "throttled" });
    expect(await verifyLast4(ev.token, target.id, target.last4, key(), ip)).toEqual({ kind: "throttled" });
    const after = await seat(target.id);
    expect(after.failedAttempts).toBe(before.failedAttempts);
    expect(after.verifyIdemOutcome).toEqual(before.verifyIdemOutcome);
    expect((await verifyLast4(ev.token, target.id, "9999", key(), "198.51.100.1")).kind).toBe("wrong");
  });

  it("15분이 지나면 같은 IP가 다시 판정받는다", async () => {
    const ev = await makeEvent(6);
    const ip = "203.0.113.8";
    const now = new Date();
    for (let i = 0; i < 20; i++) await verifyLast4(ev.token, ev.seats[Math.floor(i / 4)]!.id, "9999", key(), ip, now);
    const target = ev.seats[5]!;
    expect((await verifyLast4(ev.token, target.id, "9999", key(), ip, now)).kind).toBe("throttled");
    expect((await verifyLast4(ev.token, target.id, "9999", key(), ip, new Date(now.getTime() + 16 * MIN))).kind).toBe(
      "wrong",
    );
  });

  it("서로 다른 IP 40개가 틀림 하나씩 → 41번째 IP throttled, 다른 행사는 영향 없음", async () => {
    const ev = await makeEvent(11);
    for (let i = 0; i < 40; i++) {
      await verifyLast4(ev.token, ev.seats[Math.floor(i / 4)]!.id, "9999", key(), `192.0.2.${i + 1}`);
    }
    expect((await verifyLast4(ev.token, ev.seats[10]!.id, "9999", key(), "192.0.2.200")).kind).toBe("throttled");
    const other = await makeEvent(1);
    expect((await verifyLast4(other.token, other.seats[0]!.id, "9999", key(), "192.0.2.200")).kind).toBe("wrong");
  });

  it("한 IP가 자리 30곳에 동시에 틀림 → 판정된 wrong/locked 정확히 20, 나머지 throttled", async () => {
    const ev = await makeEvent(30);
    const results = await Promise.all(
      ev.seats.map((s) => verifyLast4(ev.token, s.id, "9999", key(), "203.0.113.30")),
    );
    const judged = results.filter((r) => r.kind === "wrong" || r.kind === "locked");
    const throttled = results.filter((r) => r.kind === "throttled");
    expect(judged).toHaveLength(20);
    expect(throttled).toHaveLength(10);
  });

  it("명단 비례 — 당첨자 120명(한도 60)은 61번째 IP에서, 10명은 41번째에서 throttled", async () => {
    const big = await makeEvent(120);
    for (let i = 0; i < 60; i++) {
      expect((await verifyLast4(big.token, big.seats[i]!.id, "9999", key(), `198.18.0.${i + 1}`)).kind).toBe("wrong");
    }
    expect((await verifyLast4(big.token, big.seats[60]!.id, "9999", key(), "198.18.1.1")).kind).toBe("throttled");

    const small = await makeEvent(10);
    for (let i = 0; i < 40; i++) {
      await verifyLast4(small.token, small.seats[Math.floor(i / 4)]!.id, "9999", key(), `198.19.0.${i + 1}`);
    }
    expect((await verifyLast4(small.token, small.seats[0]!.id, "9999", key(), "198.19.1.1")).kind).toBe("throttled");
  });

  it("틀림은 축출되지 않는다(B1) — X 틀림 1 → Y 새 키 20개 맞음 → X 다른 자리 19 → X 다음 = throttled", async () => {
    const ev = await makeEvent(7);
    const S = ev.seats[0]!;
    const X = "203.0.113.50";
    await verifyLast4(ev.token, S.id, "9999", key(), X);
    for (let i = 0; i < 20; i++) {
      expect((await verifyLast4(ev.token, S.id, S.last4, key(), "203.0.113.51")).kind).toBe("ok");
    }
    for (let i = 0; i < 19; i++) {
      await verifyLast4(ev.token, ev.seats[1 + Math.floor(i / 4)]!.id, "9999", key(), X);
    }
    expect((await verifyLast4(ev.token, ev.seats[6]!.id, "9999", key(), X)).kind).toBe("throttled");
    const map = (await seat(S.id)).verifyIdemOutcome ?? {};
    expect(Object.values(map).filter((e) => e.o === "wrong")).toHaveLength(1);
    const counts = await countRecentMisses(
      SYSTEM_VIEWER,
      { eventId: ev.eventId, ipHash: certIpHash(env.BETTER_AUTH_SECRET, ev.eventId, X), since: new Date(Date.now() - 15 * MIN) },
      db,
    );
    expect(counts.eventMisses).toBe(20);
    expect(counts.ipMisses).toBe(20);
  });

  it("운영 가시성 — throttled마다 log.warn('cert.verify_throttled', {scope, eventId}) 한 번, 인자에 IP · 해시 · 이름 · 4자리 없음", async () => {
    const ev = await makeEvent(6);
    const ip = "203.0.113.60";
    for (let i = 0; i < 20; i++) await verifyLast4(ev.token, ev.seats[Math.floor(i / 4)]!.id, "9999", key(), ip);
    const warn = vi.spyOn(log, "warn");
    expect((await verifyLast4(ev.token, ev.seats[5]!.id, "1234", key(), ip)).kind).toBe("throttled");
    const calls = warn.mock.calls.filter((c) => c[0] === "cert.verify_throttled");
    expect(calls).toHaveLength(1);
    expect(calls[0]![1]).toEqual({ scope: "ip", eventId: ev.eventId });
    const json = JSON.stringify(warn.mock.calls);
    expect(json).not.toContain(ip);
    expect(json).not.toContain(certIpHash(env.BETTER_AUTH_SECRET, ev.eventId, ip));
    expect(json).not.toContain("당첨자");
    expect(json).not.toContain("1234");

    const ev2 = await makeEvent(1);
    await fillMisses(ev2.seats[0]!.id, 40, new Date());
    warn.mockClear();
    expect((await verifyLast4(ev2.token, ev2.seats[0]!.id, "9999", key(), "203.0.113.61")).kind).toBe("throttled");
    expect(warn.mock.calls.filter((c) => c[0] === "cert.verify_throttled")[0]![1]).toEqual({
      scope: "event",
      eventId: ev2.eventId,
    });
  });

  it("시간대 — TZ=Asia/Seoul에서도 14분 전 틀림은 셈에 들고 16분 전 틀림은 들지 않는다(timestamptz 비교)", async () => {
    const ev = await makeEvent(1);
    const now = new Date();
    const map: Record<string, VerifyIdemEntry> = {
      a: wrongEntry(new Date(now.getTime() - 14 * MIN)),
      b: wrongEntry(new Date(now.getTime() - 16 * MIN)),
    };
    await patchSeat(ev.seats[0]!.id, { verifyIdemOutcome: map });
    const prevTz = process.env.TZ;
    process.env.TZ = "Asia/Seoul";
    try {
      const counts = await countRecentMisses(
        SYSTEM_VIEWER,
        { eventId: ev.eventId, ipHash: "x", since: new Date(now.getTime() - 15 * MIN) },
        db,
      );
      expect(counts.eventMisses).toBe(1);
      expect(counts.ipMisses).toBe(1);
      expect(counts.rosterSize).toBe(1);
    } finally {
      if (prevTz === undefined) delete process.env.TZ;
      else process.env.TZ = prevTz;
    }
  });
});

describe("잠금 전 빠른 거부 · 풀 고갈 없음(AX-P2)", () => {
  async function holdEventRow(eventId: string) {
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    await client.query("BEGIN");
    await client.query("SELECT id FROM cert_events WHERE id = $1 FOR UPDATE", [eventId]);
    return {
      async release() {
        await client.query("ROLLBACK");
        await client.end();
      },
    };
  }

  it("한도를 넘은 행사의 행을 남이 쥔 동안에도 throttled가 곧바로 온다 · 셈 · 맵 불변 · 경고 한 번", async () => {
    const ev = await makeEvent(2);
    await fillMisses(ev.seats[0]!.id, 40, new Date());
    const target = ev.seats[1]!;
    const before = await seat(target.id);
    const warn = vi.spyOn(log, "warn");
    const holder = await holdEventRow(ev.eventId);
    let settledWhileHeld = false;
    try {
      const pending = verifyLast4(ev.token, target.id, "9999", key(), "203.0.113.70").then((r) => {
        settledWhileHeld = true;
        return r;
      });
      const winner = await Promise.race([pending, new Promise((r) => setTimeout(() => r("timeout"), 2000))]);
      expect(winner).toEqual({ kind: "throttled" });
      expect(settledWhileHeld).toBe(true);
    } finally {
      await holder.release();
    }
    expect(warn.mock.calls.filter((c) => c[0] === "cert.verify_throttled")).toHaveLength(1);
    const after = await seat(target.id);
    expect(after.failedAttempts).toBe(before.failedAttempts);
    expect(after.verifyIdemOutcome).toEqual(before.verifyIdemOutcome);
  });

  it(
    "한도 넘은 동시 확인 DB_POOL_MAX×3 동안 다른 행사의 loadIntake가 5초 안에 ok, 뒤에 A 요청 전부 throttled",
    async () => {
      const a = await makeEvent(2);
      const b = await makeEvent(1);
      await fillMisses(a.seats[0]!.id, 40, new Date());
      const holder = await holdEventRow(a.eventId);
      let pending: Promise<Array<PromiseSettledResult<Awaited<ReturnType<typeof verifyLast4>>>>> | undefined;
      try {
        pending = Promise.allSettled(
          Array.from({ length: env.DB_POOL_MAX * 3 }, (_, i) =>
            verifyLast4(a.token, a.seats[1]!.id, "9999", key(), `203.0.113.${100 + i}`),
          ),
        );
        const start = performance.now();
        const intake = await loadIntake(b.token);
        expect(intake.kind).toBe("open");
        expect(performance.now() - start).toBeLessThan(5000);
        await new Promise((r) => setTimeout(r, 6000 - (performance.now() - start)));
      } finally {
        await holder.release();
      }
      if (!pending) throw new Error("unreachable");
      const settled = await pending;
      expect(settled.every((s) => s.status === "fulfilled" && s.value.kind === "throttled")).toBe(true);
    },
    15_000,
  );
});
