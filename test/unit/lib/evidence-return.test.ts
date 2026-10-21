import { describe, expect, it } from "vitest";
import { EVIDENCE_RETURN_FALLBACK, evidenceReturnHref } from "@/lib/evidence-return";

// 06.1-16(G-06.1-40): S8 대리 등록 출발 목록 주소 검증 — 같은 앱 `/expenses/evidence`만 · 아니면 지금 닫을 곳(열린 리디렉션 T-06.1-16-01).
const BATCH = "3f2b8c1e-4d5a-4b6c-8d7e-9f0a1b2c3d4e";
const REGISTERED = "9a1b2c3d-4e5f-4a6b-8c7d-0e1f2a3b4c5d";

describe("evidenceReturnHref (G-06.1-40)", () => {
  it.each([undefined, ""])("값이 없거나 비면 지금 닫을 곳 %j", (raw) => {
    expect(evidenceReturnHref(raw)).toBe("/expenses/evidence?state=unmatched");
    expect(EVIDENCE_RETURN_FALLBACK).toBe("/expenses/evidence?state=unmatched");
  });

  it("쿼리 없는 증빙 목록은 그대로", () => {
    expect(evidenceReturnHref("/expenses/evidence")).toBe("/expenses/evidence");
  });

  it("거르개는 쿼리 순서까지 그대로 (직전 기록 주소와 글자가 같아야 SidePanel이 뒤로 간다)", () => {
    expect(evidenceReturnHref("/expenses/evidence?state=all&type=card_receipt")).toBe("/expenses/evidence?state=all&type=card_receipt");
    expect(evidenceReturnHref("/expenses/evidence?type=card_receipt&state=all")).toBe("/expenses/evidence?type=card_receipt&state=all");
    const full = `/expenses/evidence?state=published&type=card_receipt&period=last-month&batch=${BATCH}&page=2`;
    expect(evidenceReturnHref(full)).toBe(full);
  });

  it("registered는 빼고 나머지는 그대로", () => {
    expect(evidenceReturnHref(`/expenses/evidence?state=all&registered=${REGISTERED}&type=card_receipt`)).toBe("/expenses/evidence?state=all&type=card_receipt");
    expect(evidenceReturnHref(`/expenses/evidence?registered=${REGISTERED}`)).toBe("/expenses/evidence");
  });

  it("hash는 버린다", () => {
    expect(evidenceReturnHref("/expenses/evidence?state=all#row")).toBe("/expenses/evidence?state=all");
  });

  // PR #255 Codex 봇 P2 — 주소창 글자(`%20` · `~`)를 `+` · `%7E`로 다시 쓰면 SidePanel 정확 일치 비교가 어긋나 back 대신 replace로 빠진다.
  it("쿼리 글자는 다시 인코딩하지 않는다 (%20 · ~ 보존)", () => {
    expect(evidenceReturnHref("/expenses/evidence?state=all&q=a%20b")).toBe("/expenses/evidence?state=all&q=a%20b");
    expect(evidenceReturnHref(`/expenses/evidence?q=a%20b~c&registered=${REGISTERED}`)).toBe("/expenses/evidence?q=a%20b~c");
  });

  it.each([
    "//evil.example/x",
    "/\\evil.example",
    "https://evil.example/expenses/evidence",
    "http:/expenses/evidence",
    "javascript:alert(1)",
    "/expenses/evidence/../admin",
    "/expenses/evidence%2F..%2Fadmin",
    "/expenses/evidencex",
    "/expenses/evidence/",
    " /expenses/evidence",
    "expenses/evidence",
    "/cards?new=1",
  ])("증빙 목록이 아니면 지금 닫을 곳 %j", (raw) => {
    expect(evidenceReturnHref(raw)).toBe(EVIDENCE_RETURN_FALLBACK);
  });
});
