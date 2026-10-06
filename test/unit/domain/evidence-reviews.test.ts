import { describe, expect, it } from "vitest";
import { resolveExpenseActionRow } from "@/domain/payments/action-row";

// 06-06(EVID-02 · EVID-03 · O-2) — 증빙 상태 · 확인 게이트 · 행동 줄 P2 · P5 · 증빙 지문 · Q-F 초과 한 줄 · EA-1(DB 없음).

const OPEN = { allowed: true } as const;
const payer = { canPay: true };
const CONFIRMED = { reviewedAt: new Date("2026-09-18T05:02:00Z") };

describe("resolveExpenseActionRow — P2 (06-06)", () => {
  const passed = { approvalState: "approved", paid: false, hasEvidence: true, waived: false, evidence: OPEN, pair: OPEN };

  it("통과 · 지급 전 · 증빙 있음 · 확인 기록 없음 → P2(1차 `증빙 확인` · 3차 `바꾸기`)", () => {
    expect(resolveExpenseActionRow({ ...passed, confirmation: null }, payer)).toEqual({
      row: "P2",
      primary: "confirm",
      blockReason: null,
      secondary: null,
      tertiary: "change",
      ownerNote: null,
    });
  });

  it("확인 기록 있음 → P4(1차 `지급 완료`)", () => {
    expect(resolveExpenseActionRow({ ...passed, confirmation: CONFIRMED }, payer)).toMatchObject({ row: "P4", primary: "pay" });
  });

  it("지급 권한 없는 사람에게는 P2 버튼이 없다 — 담당 표기만(D-601)", () => {
    expect(resolveExpenseActionRow({ ...passed, confirmation: null }, { canPay: false })).toEqual({
      row: "P4",
      primary: null,
      blockReason: null,
      secondary: null,
      tertiary: null,
      ownerNote: "지급은 경영관리",
    });
  });
});
