import { createHmac, hkdfSync } from "node:crypto";
import { isIPv4, isIPv6 } from "node:net";
import type { VerifyIdemOutcomeMap } from "@/repositories/cert-winners";

// 04.3-03 Task 1 ② — 전화번호 뒤 4자리 확인의 순수 판정. DB·설정을 부르지
// 않는다(한도·잠금 시간은 호출자가 설정에서 읽어 넘긴다).

// 누적 잠김 문턱(소유자 결정 2026-09-24 21:56 「누적 잠금 넣기로 해」) —
// 설정 키가 아니라 고정 상수다. 담당자의 「잠금 풀기」(04.3-10)로만 0이 된다.
export const VERIFY_HARD_LOCK_THRESHOLD = 20;

// 속도 제한(C5 — 설계 /cso 2026-09-25 확정, E3-08 · D-16).
export const VERIFY_RATE_WINDOW_MINUTES = 15;
export const VERIFY_MISS_BUDGET_PER_EVENT = 40;
export const VERIFY_MISS_BUDGET_PER_IP = 20;

// 멱등 재생 보관 — 속도 제한 창과 별개. ok 항목만 개수로 묶는다(B1).
export const VERIFY_IDEM_RETENTION_MINUTES = 60;
export const VERIFY_IDEM_MAX_ENTRIES = 20;

const MINUTE_MS = 60 * 1000;

export type VerifyAttemptInput = {
  failedAttempts: number;
  lockedUntil: Date | null;
  cumulativeFailed: number;
  hardLockedAt: Date | null;
  now: Date;
  maxAttempts: number;
  lockMinutes: number;
  matched: boolean;
};

export type VerifyAttemptOutcome =
  | { outcome: "hardLocked"; changed: false }
  | { outcome: "hardLocked"; changed: true; failedAttempts: number; cumulativeFailed: number; hardLockedAt: Date }
  | { outcome: "locked"; changed: false; lockedUntil: Date; unlockAtDisplay: string; remainingSeconds: number }
  | {
      outcome: "locked";
      changed: true;
      failedAttempts: number;
      cumulativeFailed: number;
      lockedUntil: Date;
      unlockAtDisplay: string;
      remainingSeconds: number;
    }
  | { outcome: "ok"; failedAttempts: 0; lockedUntil: null; cumulativeFailed: number }
  | { outcome: "wrong"; failedAttempts: number; cumulativeFailed: number; lockedUntil: null; remaining: number };

export function remainingSeconds(until: Date, now: Date): number {
  return Math.max(0, Math.ceil((until.getTime() - now.getTime()) / 1000));
}

// 해제 시각을 분 단위로 올려 HH:mm(Asia/Seoul)로 — 보인 시각에 다시 눌러도
// 잠김을 또 받지 않는다.
export function unlockAtDisplay(until: Date): string {
  const rounded = new Date(Math.ceil(until.getTime() / MINUTE_MS) * MINUTE_MS);
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(rounded);
}

// 판정 순서: ⓐ 누적 잠김 ⓑ 짧은 잠김 중 ⓒ 맞음 ⓓ 틀림(누적 20이 짧은 잠김보다 앞선다).
export function evaluateVerifyAttempt(input: VerifyAttemptInput): VerifyAttemptOutcome {
  const { now } = input;
  if (input.hardLockedAt) return { outcome: "hardLocked", changed: false };
  if (input.lockedUntil && now < input.lockedUntil) {
    return {
      outcome: "locked",
      changed: false,
      lockedUntil: input.lockedUntil,
      unlockAtDisplay: unlockAtDisplay(input.lockedUntil),
      remainingSeconds: remainingSeconds(input.lockedUntil, now),
    };
  }
  if (input.matched) {
    return { outcome: "ok", failedAttempts: 0, lockedUntil: null, cumulativeFailed: input.cumulativeFailed };
  }

  // 짧은 잠김이 지났으면 짧은 셈은 0부터 다시 센다. 누적은 이어진다.
  const failedAttempts = (input.lockedUntil ? 0 : input.failedAttempts) + 1;
  const cumulativeFailed = input.cumulativeFailed + 1;
  if (cumulativeFailed >= VERIFY_HARD_LOCK_THRESHOLD) {
    return { outcome: "hardLocked", changed: true, failedAttempts, cumulativeFailed, hardLockedAt: now };
  }
  if (failedAttempts >= input.maxAttempts) {
    const lockedUntil = new Date(now.getTime() + input.lockMinutes * MINUTE_MS);
    return {
      outcome: "locked",
      changed: true,
      failedAttempts,
      cumulativeFailed,
      lockedUntil,
      unlockAtDisplay: unlockAtDisplay(lockedUntil),
      remainingSeconds: remainingSeconds(lockedUntil, now),
    };
  }
  return {
    outcome: "wrong",
    failedAttempts,
    cumulativeFailed,
    lockedUntil: null,
    remaining: input.maxAttempts - failedAttempts,
  };
}

export type LockStatus =
  | { kind: "hardLocked" }
  | { kind: "shortLocked"; unlockAt: Date; remainingSec: number }
  | { kind: "open" };

export function lockStatus(input: { lockedUntil: Date | null; hardLockedAt: Date | null; now: Date }): LockStatus {
  if (input.hardLockedAt) return { kind: "hardLocked" };
  if (input.lockedUntil && input.now < input.lockedUntil) {
    return { kind: "shortLocked", unlockAt: input.lockedUntil, remainingSec: remainingSeconds(input.lockedUntil, input.now) };
  }
  return { kind: "open" };
}

// ── 속도 제한 ─────────────────────────────────────────────────────────

// 행사 한도는 명단에 비례한다(E3-08) — 명단 500명에서 정상 오타만으로
// 행사 전체가 멈추지 않게.
export function eventMissLimit(rosterSize: number): number {
  return Math.max(VERIFY_MISS_BUDGET_PER_EVENT, Math.ceil(rosterSize * 0.5));
}

export type MissCounts = { eventMisses: number; ipMisses: number; rosterSize: number };

export function eventBudgetExceeded(counts: MissCounts): boolean {
  return counts.eventMisses >= eventMissLimit(counts.rosterSize);
}

// 행사 한도를 넘으면 이 창에 틀린 적 있는 IP만 막는다(/review 결정 A) — 한 공격
// 소스가 행사 전체의 정상 수령자를 막지 못하게. 틀린 적 없는 IP는 판정받고, 한도
// 초과는 경보(cert.verify_event_budget_exceeded)로 드러낸다. 자리별 잠금(5 · 누적
// 20)은 그대로라 자리당 추측 상한은 바뀌지 않는다.
export function verifyBudgetScope(counts: MissCounts): "event" | "ip" | null {
  if (eventBudgetExceeded(counts) && counts.ipMisses > 0) return "event";
  if (counts.ipMisses >= VERIFY_MISS_BUDGET_PER_IP) return "ip";
  return null;
}

export function verifyBudgetExceeded(counts: MissCounts): boolean {
  return verifyBudgetScope(counts) !== null;
}

// ── IP 가명 ──────────────────────────────────────────────────────────

function expandIPv6(address: string): number[] | null {
  let text = address;
  // 끝이 점 표기 IPv4면 16비트 그룹 둘로 바꾼다.
  const lastColon = text.lastIndexOf(":");
  const tail = text.slice(lastColon + 1);
  if (tail.includes(".")) {
    const octets = tail.split(".").map(Number);
    if (octets.length !== 4) return null;
    const [a = 0, b = 0, c = 0, d = 0] = octets;
    text = `${text.slice(0, lastColon + 1)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const halves = text.split("::");
  if (halves.length > 2) return null;
  const parse = (part: string | undefined) => (part ? part.split(":").map((g) => Number.parseInt(g, 16)) : []);
  const head = parse(halves[0]);
  const rest = parse(halves[1]);
  const fill = halves.length === 2 ? 8 - head.length - rest.length : 0;
  const groups = [...head, ...Array<number>(Math.max(fill, 0)).fill(0), ...rest];
  return groups.length === 8 ? groups : null;
}

// IPv4는 원문 · IPv6는 앞 /64(같은 /64 안에서 주소를 바꿔도 한도를 우회하지
// 못한다, M-3) · IPv4-매핑은 그 IPv4 · 어느 것도 아니면 원문(쓰레기 XFF 값 —
// 던지지 않는다, R3-3). 매핑 판정은 소문자로 바꾸고 편 뒤 값으로 한다(R2-1).
export function ipKey(ip: string): string {
  if (isIPv4(ip)) return ip;
  const normalized = (ip.split("%")[0] ?? "").toLowerCase();
  if (!isIPv6(normalized)) return ip;
  const groups = expandIPv6(normalized);
  if (!groups) return ip;
  if (groups.slice(0, 5).every((g) => g === 0) && groups[5] === 0xffff) {
    const hi = groups[6] ?? 0;
    const lo = groups[7] ?? 0;
    return `${hi >> 8}.${hi & 0xff}.${lo >> 8}.${lo & 0xff}`;
  }
  return groups
    .slice(0, 4)
    .map((g) => g.toString(16))
    .join(":");
}

// 키 있는 가명(E3-15 · T-04.3-80) — BETTER_AUTH_SECRET에서 HKDF로 파생한 키의
// HMAC-SHA256 앞 32자. lib/crypto.ts의 데이터 키와 무관하다(04.3-08 KMS
// 재작성이 이 값을 다시 쓰지 않는다). IP가 없으면(로컬 · XFF 없는 경로)
// "unknown" 한 칸에 모인다 — Cloud Run은 늘 XFF가 있어 실사용에서는 안 걸린다.
export function certIpHash(secret: string | undefined, eventId: string, ip: string | null): string {
  if (!secret) throw new Error("certIpHash: BETTER_AUTH_SECRET 없음 · IP 해시 키 파생 불가");
  const key = Buffer.from(hkdfSync("sha256", secret, Buffer.alloc(0), "cert-ip-v1", 32));
  return createHmac("sha256", key)
    .update(`${eventId}:${ip ? ipKey(ip) : "unknown"}`)
    .digest("hex")
    .slice(0, 32);
}

// ── 멱등 보관 ─────────────────────────────────────────────────────────

// 60분 지난 항목을 빼고, ok 항목이 20개를 넘으면 가장 이른 ok부터 뺀다.
// wrong 항목은 나이로만 빠진다 — 속도 제한이 wrong 항목을 세므로 개수로
// 밀어내면 한도가 샌다(B1). 읽기(재생)와 쓰기가 같은 함수를 쓴다.
export function pruneIdemEntries(entries: VerifyIdemOutcomeMap, now: Date): VerifyIdemOutcomeMap {
  const cutoff = now.getTime() - VERIFY_IDEM_RETENTION_MINUTES * MINUTE_MS;
  const fresh = Object.entries(entries).filter(([, entry]) => Date.parse(entry.at) >= cutoff);
  const okKeys = fresh
    .filter(([, entry]) => entry.o === "ok")
    .sort(([, a], [, b]) => Date.parse(a.at) - Date.parse(b.at))
    .map(([k]) => k);
  const drop = new Set(okKeys.slice(0, Math.max(0, okKeys.length - VERIFY_IDEM_MAX_ENTRIES)));
  const result: VerifyIdemOutcomeMap = {};
  for (const [k, entry] of fresh) {
    if (!drop.has(k)) result[k] = entry;
  }
  return result;
}
