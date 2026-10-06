import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DbOrTx } from "@/repositories/document-counters";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import {
  EVIDENCE_CONFIRMATION_GATES_PAYMENT,
  confirmationBlocksPayment,
  evidenceGateDecision,
  resolveExpenseActionRow,
} from "@/domain/payments/action-row";
import { evidenceGateInputs, evidenceOverrunLine, evidenceStampOf, resolveEvidenceStatus } from "@/domain/evidence-reviews";
import { EVIDENCE_AMOUNT_TAX_INCLUSIVE, isTaxInclusiveEvidenceAmount } from "@/domain/evidence-reviews/tax-inclusive";

const mocks = vi.hoisted(() => ({ hasEvidence: vi.fn(), findReviewByExpense: vi.fn() }));
vi.mock("@/domain/evidence/has-evidence", () => ({ hasEvidence: mocks.hasEvidence }));
vi.mock("@/repositories/expense-evidence-reviews", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/repositories/expense-evidence-reviews")>()),
  findReviewByExpense: mocks.findReviewByExpense,
}));

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

describe("resolveEvidenceStatus — 다섯 값 (06-06)", () => {
  const base = { hasEvidence: false, prepaid: false, review: null };
  it("면제 기록 → 면제(선결제를 이긴다)", () => {
    expect(resolveEvidenceStatus({ ...base, prepaid: true, review: { status: "waived" } })).toBe("면제");
  });
  it("증빙 있음 · 기록 없음 → 확인 전", () => {
    expect(resolveEvidenceStatus({ ...base, hasEvidence: true })).toBe("확인 전");
  });
  it("증빙 있음 · confirmed → 확인됨", () => {
    expect(resolveEvidenceStatus({ ...base, hasEvidence: true, review: { status: "confirmed" } })).toBe("확인됨");
  });
  it("증빙 없음 · 선결제 → 선결제", () => {
    expect(resolveEvidenceStatus({ ...base, prepaid: true })).toBe("선결제");
  });
  it("증빙 없음 → 증빙 없음(증빙 필수 off의 화면 `—`는 화면이 고른다)", () => {
    expect(resolveEvidenceStatus(base)).toBe("증빙 없음");
  });
});

describe("O-2 — 확인 전 막힘은 상수 한 곳 (06-06 Task 2)", () => {
  const ctx = { evidenceRequired: false, hasEvidence: true, prepaid: false, waived: false, confirmation: null, drafterName: "박서연" };

  it("EVIDENCE_CONFIRMATION_GATES_PAYMENT = true(O-2 확정)", () => {
    expect(EVIDENCE_CONFIRMATION_GATES_PAYMENT).toBe(true);
  });

  it("증빙 있음 · 확인 전 → `증빙 확인 전 · 증빙 확인`으로 막는다(증빙 필수 off여도)", () => {
    expect(evidenceGateDecision(ctx)).toEqual({ allowed: false, reason: "증빙 확인 전 · 증빙 확인" });
    expect(evidenceGateDecision({ ...ctx, evidenceRequired: true })).toEqual({ allowed: false, reason: "증빙 확인 전 · 증빙 확인" });
  });

  it("상수를 false로 주입하면 같은 문서가 통과한다 — 정책이 한 곳에서만 온다", () => {
    expect(evidenceGateDecision(ctx, false)).toEqual({ allowed: true });
    expect(confirmationBlocksPayment(ctx, false)).toBe(false);
  });

  it("확인됨 · 면제는 막지 않는다", () => {
    expect(evidenceGateDecision({ ...ctx, confirmation: CONFIRMED })).toEqual({ allowed: true });
    expect(evidenceGateDecision({ ...ctx, waived: true })).toEqual({ allowed: true });
  });
});

describe("resolveExpenseActionRow — P5 (06-06 Task 2)", () => {
  const paid = { approvalState: "approved", paid: true, hasEvidence: true, waived: false, evidence: OPEN, pair: OPEN };

  it("지급 뒤 · 확인 전 → P5(1차 `증빙 확인` · 2차 `지급 취소` · 3차 `바꾸기`)", () => {
    expect(resolveExpenseActionRow({ ...paid, confirmation: null }, payer)).toEqual({
      row: "P5",
      primary: "confirm",
      blockReason: null,
      secondary: "cancel",
      tertiary: "change",
      ownerNote: null,
    });
  });

  it("지급 뒤 · 확인됨 → P6", () => {
    expect(resolveExpenseActionRow({ ...paid, confirmation: CONFIRMED }, payer)).toMatchObject({ row: "P6", primary: null, secondary: "cancel" });
  });

  it("지급 권한 없는 사람 → P6 버튼 없음", () => {
    expect(resolveExpenseActionRow({ ...paid, confirmation: null }, { canPay: false })).toMatchObject({ row: "P6", primary: null, secondary: null });
  });
});

describe("evidenceGateInputs — 잠금 뒤 tx로 한 함수에서 (06-06 Task 2)", () => {
  const tx = { marker: "tx" } as unknown as DbOrTx;
  const locked = { id: "00000000-0000-4000-8000-000000000001", prepaid: true };
  const pre = { evidenceRequired: true, drafterName: "박서연" };

  beforeEach(() => {
    mocks.hasEvidence.mockReset().mockResolvedValue(true);
    mocks.findReviewByExpense.mockReset();
  });

  it("확인 기록 waived → waived: true · confirmation null · prepaid는 잠근 행 값 · 두 읽기 모두 tx", async () => {
    mocks.findReviewByExpense.mockResolvedValue({ status: "waived", reviewedAt: CONFIRMED.reviewedAt });
    expect(await evidenceGateInputs(SYSTEM_VIEWER, locked, pre, tx)).toEqual({
      evidenceRequired: true,
      hasEvidence: true,
      prepaid: true,
      waived: true,
      confirmation: null,
      drafterName: "박서연",
    });
    expect(mocks.hasEvidence).toHaveBeenCalledWith(SYSTEM_VIEWER, { ownerKind: "expense", ownerId: locked.id }, tx);
    expect(mocks.findReviewByExpense).toHaveBeenCalledWith(SYSTEM_VIEWER, locked.id, tx);
  });

  it("확인 기록 confirmed → confirmation(확인 시각)", async () => {
    mocks.findReviewByExpense.mockResolvedValue({ status: "confirmed", reviewedAt: CONFIRMED.reviewedAt });
    expect(await evidenceGateInputs(SYSTEM_VIEWER, { ...locked, prepaid: false }, pre, tx)).toMatchObject({ waived: false, confirmation: CONFIRMED, prepaid: false });
  });

  it("기록 없음 → confirmation null", async () => {
    mocks.findReviewByExpense.mockResolvedValue(null);
    expect(await evidenceGateInputs(SYSTEM_VIEWER, locked, pre, tx)).toMatchObject({ waived: false, confirmation: null });
  });
});

describe("evidenceStampOf — 증빙 지문 (06-06 Task 3)", () => {
  const base = { fileIds: ["b", "a", "c"], evidenceAmountKrw: 12_400_000, evidenceDate: "2026-09-17" };
  it("파일 id 순서가 달라도 같은 문자열", () => {
    expect(evidenceStampOf(base)).toBe(evidenceStampOf({ ...base, fileIds: ["c", "b", "a"] }));
  });
  it("증빙 금액이나 증빙일이 다르면 다른 문자열", () => {
    expect(evidenceStampOf({ ...base, evidenceAmountKrw: 12_000_000 })).not.toBe(evidenceStampOf(base));
    expect(evidenceStampOf({ ...base, evidenceDate: "2026-09-18" })).not.toBe(evidenceStampOf(base));
    expect(evidenceStampOf({ ...base, evidenceAmountKrw: null })).not.toBe(evidenceStampOf(base));
  });
  it("파일이 하나 늘면 다른 문자열", () => {
    expect(evidenceStampOf({ ...base, fileIds: [...base.fileIds, "d"] })).not.toBe(evidenceStampOf(base));
  });
});

describe("증빙 금액 초과 한 줄(Q-F)", () => {
  const base = { hasLiveEvidence: true, evidenceAmountKrw: 12_400_000, approvedSupplyKrw: 12_000_000, lineRemainingKrw: 20_000_000 };
  it("승인액만 넘음 → `승인액보다 +400,000`", () => {
    expect(evidenceOverrunLine(base)).toBe("승인액보다 +400,000");
  });
  it("둘 다 넘음 → ` · `로 이은 한 줄", () => {
    expect(evidenceOverrunLine({ ...base, lineRemainingKrw: 12_250_000 })).toBe("승인액보다 +400,000 · 실행가 초과 150,000");
  });
  it("남은 실행가만 넘음 → `실행가 초과 100,000`", () => {
    expect(evidenceOverrunLine({ ...base, evidenceAmountKrw: 11_900_000, lineRemainingKrw: 11_800_000 })).toBe("실행가 초과 100,000");
  });
  it("둘 다 이하 → null", () => {
    expect(evidenceOverrunLine({ ...base, evidenceAmountKrw: 11_000_000 })).toBeNull();
  });
  it("증빙 금액 null → null", () => {
    expect(evidenceOverrunLine({ ...base, evidenceAmountKrw: null })).toBeNull();
  });
  it("남은 실행가 null(팀 비용) · 증빙 > 승인액 → `승인액보다 +{차액}`만", () => {
    expect(evidenceOverrunLine({ ...base, lineRemainingKrw: null })).toBe("승인액보다 +400,000");
  });
  it("파일 0 · 증빙 금액만 → null(R-4 · E-7)", () => {
    expect(evidenceOverrunLine({ hasLiveEvidence: false, evidenceAmountKrw: 12_400_000, approvedSupplyKrw: 12_000_000, lineRemainingKrw: 11_800_000 })).toBeNull();
  });
});

describe("부가세 포함 증빙 금액(EA-1)", () => {
  const base = { supplyKrw: 10_000_000, vatKrw: 1_000_000 };
  it("공급가 + 부가세와 정확히 같으면 참", () => {
    expect(isTaxInclusiveEvidenceAmount({ ...base, evidenceAmountKrw: 11_000_000 })).toBe(true);
  });
  it("정확 일치만 — 10,999,999 · 11,000,001 · 10,000,000은 거짓", () => {
    for (const evidenceAmountKrw of [10_999_999, 11_000_001, 10_000_000]) expect(isTaxInclusiveEvidenceAmount({ ...base, evidenceAmountKrw })).toBe(false);
  });
  it("부가세 0(면세 · 원천징수 규칙) · 증빙 = 공급가 → 거짓", () => {
    expect(isTaxInclusiveEvidenceAmount({ supplyKrw: 10_000_000, vatKrw: 0, evidenceAmountKrw: 10_000_000 })).toBe(false);
  });
  it("증빙 null → 거짓", () => {
    expect(isTaxInclusiveEvidenceAmount({ ...base, evidenceAmountKrw: null })).toBe(false);
  });
  it("문구는 명사형 한 줄", () => {
    expect(EVIDENCE_AMOUNT_TAX_INCLUSIVE).toBe("부가세 포함 금액 · 공급가로 입력");
  });
});
