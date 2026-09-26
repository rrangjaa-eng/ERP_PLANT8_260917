import { describe, expect, it } from "vitest";
import {
  VERIFY_HARD_LOCK_THRESHOLD,
  VERIFY_IDEM_MAX_ENTRIES,
  VERIFY_IDEM_RETENTION_MINUTES,
  VERIFY_MISS_BUDGET_PER_EVENT,
  VERIFY_MISS_BUDGET_PER_IP,
  VERIFY_RATE_WINDOW_MINUTES,
  certIpHash,
  eventMissLimit,
  evaluateVerifyAttempt,
  ipKey,
  lockStatus,
  pruneIdemEntries,
  unlockAtDisplay,
  verifyBudgetExceeded,
  verifyBudgetScope,
} from "@/domain/certs/verify-lock";
import type { VerifyIdemEntry } from "@/db/schema/cert-winners";

// 04.3-03 Task 1 ② — 자리 단위 잠금 · 누적 잠김 · 속도 제한 · 멱등 보관의
// 순수 판정. DB·설정을 부르지 않는다.

const NOW = new Date("2026-09-26T09:44:10Z"); // 18:44:10 KST
const MIN = 60 * 1000;

function base(overrides: Partial<Parameters<typeof evaluateVerifyAttempt>[0]> = {}) {
  return {
    failedAttempts: 0,
    lockedUntil: null,
    cumulativeFailed: 0,
    hardLockedAt: null,
    now: NOW,
    maxAttempts: 5,
    lockMinutes: 3,
    matched: false,
    ...overrides,
  };
}

describe("evaluateVerifyAttempt — 짧은 잠김", () => {
  it("첫 틀림 → wrong, 짧은 셈 1 · 누적 1 · 남은 4", () => {
    expect(evaluateVerifyAttempt(base())).toMatchObject({
      outcome: "wrong",
      failedAttempts: 1,
      cumulativeFailed: 1,
      remaining: 4,
    });
  });

  it("4번째 틀림은 남은 1번(경계)", () => {
    expect(evaluateVerifyAttempt(base({ failedAttempts: 3, cumulativeFailed: 3 }))).toMatchObject({
      outcome: "wrong",
      failedAttempts: 4,
      remaining: 1,
    });
  });

  it("5번째 틀림 → locked, 해제 = now + 3분, 표시는 분 올림, 남은 초 180", () => {
    const result = evaluateVerifyAttempt(base({ failedAttempts: 4, cumulativeFailed: 4 }));
    expect(result).toMatchObject({
      outcome: "locked",
      changed: true,
      failedAttempts: 5,
      cumulativeFailed: 5,
      remainingSeconds: 180,
      unlockAtDisplay: "18:48",
    });
    if (result.outcome !== "locked") throw new Error("unreachable");
    expect(result.lockedUntil.getTime()).toBe(NOW.getTime() + 3 * MIN);
  });

  it("잠긴 동안은 맞든 틀리든 locked, 상태 불변", () => {
    const lockedUntil = new Date(NOW.getTime() + 100 * 1000);
    for (const matched of [true, false]) {
      const result = evaluateVerifyAttempt(base({ failedAttempts: 5, cumulativeFailed: 5, lockedUntil, matched }));
      expect(result).toMatchObject({ outcome: "locked", changed: false, remainingSeconds: 100 });
      if (result.outcome !== "locked") throw new Error("unreachable");
      expect(result.lockedUntil).toBe(lockedUntil);
    }
  });

  it("잠금이 지난 뒤 틀림 → 짧은 셈은 1부터 다시, lockedUntil null, 누적은 이어진다", () => {
    const lockedUntil = new Date(NOW.getTime() - 1000);
    expect(evaluateVerifyAttempt(base({ failedAttempts: 5, cumulativeFailed: 5, lockedUntil }))).toMatchObject({
      outcome: "wrong",
      failedAttempts: 1,
      cumulativeFailed: 6,
      lockedUntil: null,
      remaining: 4,
    });
  });

  it("해제 시각 정각(now === lockedUntil)은 풀린 것으로 본다", () => {
    expect(evaluateVerifyAttempt(base({ failedAttempts: 5, cumulativeFailed: 5, lockedUntil: NOW }))).toMatchObject({
      outcome: "wrong",
      failedAttempts: 1,
    });
  });

  it("맞음 → ok, 짧은 셈만 0 · 누적 그대로", () => {
    expect(evaluateVerifyAttempt(base({ failedAttempts: 3, cumulativeFailed: 13, matched: true }))).toMatchObject({
      outcome: "ok",
      failedAttempts: 0,
      lockedUntil: null,
      cumulativeFailed: 13,
    });
  });
});

describe("evaluateVerifyAttempt — 누적 잠김(고정 20)", () => {
  it("VERIFY_HARD_LOCK_THRESHOLD는 20이다", () => {
    expect(VERIFY_HARD_LOCK_THRESHOLD).toBe(20);
  });

  it("누적 18에서 틀림 → wrong, 누적 19", () => {
    expect(evaluateVerifyAttempt(base({ cumulativeFailed: 18 }))).toMatchObject({
      outcome: "wrong",
      cumulativeFailed: 19,
    });
  });

  it("누적 19에서 틀림 → hardLocked, 누적 20 · hardLockedAt = now", () => {
    const result = evaluateVerifyAttempt(base({ cumulativeFailed: 19 }));
    expect(result).toMatchObject({ outcome: "hardLocked", changed: true, cumulativeFailed: 20 });
    if (result.outcome !== "hardLocked" || !result.changed) throw new Error("unreachable");
    expect(result.hardLockedAt).toBe(NOW);
  });

  it("짧은 한도와 누적 한도가 함께 닿으면 누적 잠김만 선다(lockedUntil을 쓰지 않는다)", () => {
    const result = evaluateVerifyAttempt(base({ failedAttempts: 4, cumulativeFailed: 19 }));
    expect(result.outcome).toBe("hardLocked");
    expect(result).not.toHaveProperty("lockedUntil");
  });

  it("hardLockedAt이 있으면 맞든 틀리든 · 짧은 잠김이 지났든 hardLocked, 세지 않는다", () => {
    const hardLockedAt = new Date(NOW.getTime() - 60 * MIN);
    for (const matched of [true, false]) {
      for (const lockedUntil of [null, new Date(NOW.getTime() - MIN), new Date(NOW.getTime() + MIN)]) {
        expect(
          evaluateVerifyAttempt(base({ cumulativeFailed: 20, hardLockedAt, lockedUntil, matched })),
        ).toEqual({ outcome: "hardLocked", changed: false });
      }
    }
  });
});

describe("lockStatus", () => {
  it("hardLockedAt이 있으면 짧은 잠김 시각과 무관하게 hardLocked", () => {
    expect(lockStatus({ hardLockedAt: NOW, lockedUntil: new Date(NOW.getTime() + 3 * MIN), now: NOW })).toEqual({
      kind: "hardLocked",
    });
  });

  it("짧은 잠김 중이면 shortLocked(해제 시각 · 남은 초)", () => {
    const lockedUntil = new Date(NOW.getTime() + 170 * 1000);
    expect(lockStatus({ hardLockedAt: null, lockedUntil, now: NOW })).toEqual({
      kind: "shortLocked",
      unlockAt: lockedUntil,
      remainingSec: 170,
    });
  });

  it("해제 시각이 지났거나 없으면 open", () => {
    expect(lockStatus({ hardLockedAt: null, lockedUntil: new Date(NOW.getTime() - 1000), now: NOW })).toEqual({
      kind: "open",
    });
    expect(lockStatus({ hardLockedAt: null, lockedUntil: null, now: NOW })).toEqual({ kind: "open" });
  });

  it("남은 초는 올림 정수다", () => {
    const lockedUntil = new Date(NOW.getTime() + 1500);
    expect(lockStatus({ hardLockedAt: null, lockedUntil, now: NOW })).toMatchObject({ remainingSec: 2 });
  });
});

describe("unlockAtDisplay — 분 올림(Asia/Seoul)", () => {
  it("18:44:10 → 18:45", () => {
    expect(unlockAtDisplay(new Date("2026-09-26T09:44:10Z"))).toBe("18:45");
  });

  it("18:45:00 정각은 그대로 18:45", () => {
    expect(unlockAtDisplay(new Date("2026-09-26T09:45:00Z"))).toBe("18:45");
  });

  it("23:59:30 → 00:00(자정 넘김)", () => {
    expect(unlockAtDisplay(new Date("2026-09-26T14:59:30Z"))).toBe("00:00");
  });
});

describe("속도 제한 — 상수 · eventMissLimit · verifyBudgetExceeded", () => {
  it("설계 /cso 확정 상수", () => {
    expect(VERIFY_RATE_WINDOW_MINUTES).toBe(15);
    expect(VERIFY_MISS_BUDGET_PER_EVENT).toBe(40);
    expect(VERIFY_MISS_BUDGET_PER_IP).toBe(20);
    expect(VERIFY_IDEM_RETENTION_MINUTES).toBe(60);
    expect(VERIFY_IDEM_MAX_ENTRIES).toBe(20);
  });

  it("eventMissLimit = max(40, ceil(n × 0.5)) — 1→40 · 80→40 · 81→41 · 500→250", () => {
    expect(eventMissLimit(1)).toBe(40);
    expect(eventMissLimit(80)).toBe(40);
    expect(eventMissLimit(81)).toBe(41);
    expect(eventMissLimit(500)).toBe(250);
  });

  it("명단 10명: 행사 39 · IP 19는 통과, 행사 40 또는 IP 20이면 넘음(경계는 이상)", () => {
    expect(verifyBudgetExceeded({ eventMisses: 39, ipMisses: 19, rosterSize: 10 })).toBe(false);
    expect(verifyBudgetExceeded({ eventMisses: 40, ipMisses: 0, rosterSize: 10 })).toBe(true);
    expect(verifyBudgetExceeded({ eventMisses: 0, ipMisses: 20, rosterSize: 10 })).toBe(true);
  });

  it("명단 500명: 행사 249 통과 · 250 넘음", () => {
    expect(verifyBudgetExceeded({ eventMisses: 249, ipMisses: 0, rosterSize: 500 })).toBe(false);
    expect(verifyBudgetExceeded({ eventMisses: 250, ipMisses: 0, rosterSize: 500 })).toBe(true);
  });

  it("verifyBudgetScope — 막은 한도(event 먼저 · ip · 없음 null)", () => {
    expect(verifyBudgetScope({ eventMisses: 40, ipMisses: 20, rosterSize: 10 })).toBe("event");
    expect(verifyBudgetScope({ eventMisses: 39, ipMisses: 20, rosterSize: 10 })).toBe("ip");
    expect(verifyBudgetScope({ eventMisses: 39, ipMisses: 19, rosterSize: 10 })).toBeNull();
  });
});

describe("ipKey — IPv4 원문 · IPv6 /64 · IPv4-매핑(M-3 · 교차 B3 · R2-1 · R3-3)", () => {
  it("IPv4는 원문 그대로", () => {
    expect(ipKey("211.34.56.78")).toBe("211.34.56.78");
  });

  it("IP가 아닌 값(쓰레기 XFF)은 원문 그대로, 던지지 않는다", () => {
    expect(ipKey("not-an-ip")).toBe("not-an-ip");
  });

  it("IPv4-매핑 점 표기 → IPv4", () => {
    expect(ipKey("::ffff:211.34.56.78")).toBe("211.34.56.78");
  });

  it("IPv4-매핑 대문자 접두 → 같은 IPv4 키", () => {
    expect(ipKey("::FFFF:1.2.3.4")).toBe(ipKey("1.2.3.4"));
  });

  it("IPv4-매핑 16진 표기 → 같은 IPv4 키", () => {
    expect(ipKey("::ffff:102:304")).toBe(ipKey("1.2.3.4"));
  });

  it("압축 표기 두 개가 같은 /64면 같은 키", () => {
    expect(ipKey("2001:db8::a:b:c:d")).toBe(ipKey("2001:db8::e:f:1:2"));
  });

  it("대소문자 · 앞 0 · 완전 표기와 압축 표기가 같은 /64면 같은 키", () => {
    expect(ipKey("2001:DB8:0:0:1::1")).toBe(ipKey("2001:db8::2"));
    expect(ipKey("2001:0db8:0000:0000:0000:0000:0000:0001")).toBe(ipKey("2001:db8::2"));
  });

  it("서로 다른 /64는 다른 키", () => {
    expect(ipKey("2001:db8:1::1")).not.toBe(ipKey("2001:db8:2::1"));
  });

  it("영역 표시(%zone)를 뗀다", () => {
    expect(ipKey("fe80::1%eth0")).toBe(ipKey("fe80::2"));
  });
});

describe("certIpHash — HKDF(BETTER_AUTH_SECRET, cert-ip-v1) HMAC-SHA256 앞 32자(E3-15 · R2-2 · R3-2)", () => {
  const SECRET = "golden-vector-secret-0123456789abcdef";
  const EVENT = "11111111-2222-3333-4444-555555555555";

  it("골든 벡터 — IPv4", () => {
    expect(certIpHash(SECRET, EVENT, "211.34.56.78")).toBe("3cc1e5dd151dc1ca23a8e35370df5e77");
  });

  it("골든 벡터 — IPv6는 /64로 묶은 뒤 해시", () => {
    expect(certIpHash(SECRET, EVENT, "2001:db8::abcd")).toBe("567343ac75272398916519e64878c7a6");
  });

  it("골든 벡터 — IP 없음은 unknown 한 칸", () => {
    expect(certIpHash(SECRET, EVENT, null)).toBe("c3dd9fd847768a7a1ac8b68c7bdce2ad");
  });

  it("행사가 다르면 같은 IP도 다른 해시(행사 사이 연결 불가)", () => {
    expect(certIpHash(SECRET, EVENT, "211.34.56.78")).not.toBe(
      certIpHash(SECRET, "99999999-2222-3333-4444-555555555555", "211.34.56.78"),
    );
  });

  it("빈 secret · undefined는 던진다(빈 키로 해시하지 않는다)", () => {
    expect(() => certIpHash("", EVENT, "211.34.56.78")).toThrow();
    expect(() => certIpHash(undefined, EVENT, "211.34.56.78")).toThrow();
  });
});

describe("pruneIdemEntries — 60분 보관 · ok 20개 상한(wrong은 나이로만, B1)", () => {
  function entry(o: "wrong" | "ok", minutesAgo: number): VerifyIdemEntry {
    const at = new Date(NOW.getTime() - minutesAgo * MIN).toISOString();
    return o === "wrong"
      ? { o, r: { kind: "wrong", remaining: 4 }, ip: "h", at }
      : { o, r: { kind: "ok" }, p: "c", until: at, ip: "h", at };
  }

  it("60분보다 이른 항목만 빠지고 60분 정각은 남는다", () => {
    const result = pruneIdemEntries({ a: entry("wrong", 61), b: entry("wrong", 60), c: entry("ok", 60.5) }, NOW);
    expect(Object.keys(result).sort()).toEqual(["b"]);
  });

  it("60분 안의 ok가 21개면 가장 이른 ok 하나가 빠져 20개", () => {
    const entries: Record<string, VerifyIdemEntry> = {};
    for (let i = 0; i < 21; i++) entries[`k${i}`] = entry("ok", 30 - i);
    const result = pruneIdemEntries(entries, NOW);
    expect(Object.keys(result)).toHaveLength(20);
    expect(result.k0).toBeUndefined();
  });

  it("가장 오래된 wrong 1 + ok 21 → wrong 1 + ok 20(개수 상한은 ok만 밀어낸다)", () => {
    const entries: Record<string, VerifyIdemEntry> = { w: entry("wrong", 50) };
    for (let i = 0; i < 21; i++) entries[`k${i}`] = entry("ok", 30 - i);
    const result = pruneIdemEntries(entries, NOW);
    expect(result.w).toBeDefined();
    expect(Object.values(result).filter((e) => e.o === "ok")).toHaveLength(20);
    expect(result.k0).toBeUndefined();
  });

  it("wrong은 개수와 무관하게 60분 안이면 남는다", () => {
    const entries: Record<string, VerifyIdemEntry> = {};
    for (let i = 0; i < 45; i++) entries[`w${i}`] = entry("wrong", i);
    expect(Object.keys(pruneIdemEntries(entries, NOW))).toHaveLength(45);
  });
});

describe("설정 키 — 짧은 잠김 두 키(누적 20은 설정이 아니다)", () => {
  it("cert.verify.max_attempts(1~20, 기본 5) · cert.verify.lock_minutes(1~60, 기본 3)가 SETTING_DEFS에 있다", async () => {
    const { CERT_VERIFY_MAX_ATTEMPTS, CERT_VERIFY_LOCK_MINUTES, SETTING_DEFS } = await import("@/domain/settings/keys");
    expect(CERT_VERIFY_MAX_ATTEMPTS).toMatchObject({ key: "cert.verify.max_attempts", default: 5, namespace: "확인증" });
    expect(CERT_VERIFY_LOCK_MINUTES).toMatchObject({ key: "cert.verify.lock_minutes", default: 3, namespace: "확인증" });
    expect(CERT_VERIFY_MAX_ATTEMPTS.schema.safeParse(20).success).toBe(true);
    expect(CERT_VERIFY_MAX_ATTEMPTS.schema.safeParse(21).success).toBe(false);
    expect(CERT_VERIFY_LOCK_MINUTES.schema.safeParse(60).success).toBe(true);
    expect(CERT_VERIFY_LOCK_MINUTES.schema.safeParse(0).success).toBe(false);
    const keys = SETTING_DEFS.map((d) => d.key);
    expect(keys).toContain("cert.verify.max_attempts");
    expect(keys).toContain("cert.verify.lock_minutes");
    expect(keys.some((k) => /hard_lock|cumulative/i.test(k))).toBe(false);
  });
});
