import { describe, expect, it } from "vitest";
import {
  SUBMIT_BUDGET_PER_EVENT_MIN,
  SUBMIT_BUDGET_PER_IP_MIN,
  SUBMIT_EVENT_ALERT_TOTAL_MIN,
  SUBMIT_RATE_WINDOW_MINUTES,
  certIpHash,
  ipKey,
  submitBudgetScope,
  submitBudgets,
} from "@/domain/certs/submit-limit";

// 04.3-15 Task 1 ④ — 제출 속도 제한(새 흐름 설계 /cso E10)과 IP 가명(옛 verify-last4.test.ts에서 옮김).

describe("상수 — 설계 /cso E10", () => {
  it("창 15분 · IP 최소 30 · 행사 최소 40 · 누적 알림 최소 60", () => {
    expect(SUBMIT_RATE_WINDOW_MINUTES).toBe(15);
    expect(SUBMIT_BUDGET_PER_IP_MIN).toBe(30);
    expect(SUBMIT_BUDGET_PER_EVENT_MIN).toBe(40);
    expect(SUBMIT_EVENT_ALERT_TOTAL_MIN).toBe(60);
  });
});

describe("submitBudgets — W = 목록 경품의 당첨 수 합", () => {
  it("W = 1 → IP 30 · 행사 40 · 누적 알림 60", () => {
    expect(submitBudgets(1)).toEqual({ ip: 30, event: 40, alertTotal: 60 });
  });

  it("W = 50 → IP 50 · 행사 100 · 누적 알림 150", () => {
    expect(submitBudgets(50)).toEqual({ ip: 50, event: 100, alertTotal: 150 });
  });

  it("W 없음 → IP 30 · 행사 60 · 누적 알림 200", () => {
    expect(submitBudgets(null)).toEqual({ ip: 30, event: 60, alertTotal: 200 });
  });
});

describe("submitBudgetScope — 셈 ≥ 한도면 막힘(E35 경계), 둘 다면 event", () => {
  const w1 = submitBudgets(1);
  const w50 = submitBudgets(50);
  const none = submitBudgets(null);

  it("W = 1: IP 29 null · 30 ip · 행사 39 null · 40 event", () => {
    expect(submitBudgetScope({ ip: 29, event: 0 }, w1)).toBeNull();
    expect(submitBudgetScope({ ip: 30, event: 0 }, w1)).toBe("ip");
    expect(submitBudgetScope({ ip: 0, event: 39 }, w1)).toBeNull();
    expect(submitBudgetScope({ ip: 0, event: 40 }, w1)).toBe("event");
  });

  it("W = 50: IP 49 null · 50 ip · 행사 99 null · 100 event", () => {
    expect(submitBudgetScope({ ip: 49, event: 0 }, w50)).toBeNull();
    expect(submitBudgetScope({ ip: 50, event: 0 }, w50)).toBe("ip");
    expect(submitBudgetScope({ ip: 0, event: 99 }, w50)).toBeNull();
    expect(submitBudgetScope({ ip: 0, event: 100 }, w50)).toBe("event");
  });

  it("W 없음: IP 30 ip · 행사 59 null · 60 event", () => {
    expect(submitBudgetScope({ ip: 30, event: 0 }, none)).toBe("ip");
    expect(submitBudgetScope({ ip: 0, event: 59 }, none)).toBeNull();
    expect(submitBudgetScope({ ip: 0, event: 60 }, none)).toBe("event");
  });

  it("둘 다 넘으면 event", () => {
    expect(submitBudgetScope({ ip: 30, event: 40 }, w1)).toBe("event");
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

