import { createHmac, hkdfSync } from "node:crypto";
import { isIPv4, isIPv6 } from "node:net";

// 04.3-15 Task 1 ④ — 수령자 제출 속도 제한(순수)과 키 있는 IP 가명. DB · 설정을 부르지 않는다.
// 한도는 새 흐름 설계 /cso E10(docs/designs/plant8-erp-phase04.3-cso-design-260930-newflow.md) — 수치는 /qa
// 실사용으로 보정한다. 창 15분(미끄럼 — 저장된 제출 행을 센다) · IP 가명 한도 max(30, W) · 행사 창 한도
// max(40, 2W)(W = 목록 경품(1개 가액 > 50,000)의 당첨 수 합) · 행사 누적 알림 max(60, 3W)(알림만, 막지 않는다 — 04.3-10).
export const SUBMIT_RATE_WINDOW_MINUTES = 15;
// 행사장 공유 와이파이(D-16 계승) — 한 IP 뒤에 여러 당첨자가 있다.
export const SUBMIT_BUDGET_PER_IP_MIN = 30;
export const SUBMIT_BUDGET_PER_EVENT_MIN = 40;
export const SUBMIT_EVENT_ALERT_TOTAL_MIN = 60;
// W가 없을 때(당첨 수를 모름) 행사 창 한도 · 누적 알림 임계.
export const SUBMIT_BUDGET_PER_EVENT_WITHOUT_WINNERS = 60;
export const SUBMIT_EVENT_ALERT_TOTAL_WITHOUT_WINNERS = 200;

export type SubmitBudgets = { ip: number; event: number; alertTotal: number };

export function submitBudgets(winnerTotal: number | null): SubmitBudgets {
  if (winnerTotal === null) {
    return {
      ip: SUBMIT_BUDGET_PER_IP_MIN,
      event: SUBMIT_BUDGET_PER_EVENT_WITHOUT_WINNERS,
      alertTotal: SUBMIT_EVENT_ALERT_TOTAL_WITHOUT_WINNERS,
    };
  }
  return {
    ip: Math.max(SUBMIT_BUDGET_PER_IP_MIN, winnerTotal),
    event: Math.max(SUBMIT_BUDGET_PER_EVENT_MIN, 2 * winnerTotal),
    alertTotal: Math.max(SUBMIT_EVENT_ALERT_TOTAL_MIN, 3 * winnerTotal),
  };
}

// 창 안 셈이 한도 이상이면 막는다(E35 경계 — W = 1이면 IP 31번째 · 행사 41번째가 막힌다). 둘 다 넘으면
// "event"(행사 한도가 더 넓은 공격 신호다).
export function submitBudgetScope(counts: { ip: number; event: number }, budgets: SubmitBudgets): "event" | "ip" | null {
  if (counts.event >= budgets.event) return "event";
  if (counts.ip >= budgets.ip) return "ip";
  return null;
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
