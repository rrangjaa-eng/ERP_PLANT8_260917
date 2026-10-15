import { beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import type { DbOrTx } from "@/repositories/document-counters";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import {
  EVIDENCE_CONFIRMATION_GATES_PAYMENT,
  confirmationBlocksPayment,
  evidenceGateDecision,
  resolveExpenseActionRow,
} from "@/domain/payments/action-row";
import {
  evidenceGateInputs,
  evidenceStampOf,
  resolveEvidenceStatus,
  SUPPLY_CORRECTION_PAID_LOCKED,
  supplyCorrectionKind,
} from "@/domain/evidence-reviews";
import { moneyFromRow } from "@/domain/money";

const mocks = vi.hoisted(() => ({ hasEvidence: vi.fn(), findReviewByExpense: vi.fn() }));
vi.mock("@/domain/evidence/has-evidence", () => ({ hasEvidence: mocks.hasEvidence }));
vi.mock("@/repositories/expense-evidence-reviews", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/repositories/expense-evidence-reviews")>()),
  findReviewByExpense: mocks.findReviewByExpense,
}));

// 06-06(EVID-02 · EVID-03 · O-2) — 증빙 상태 · 확인 게이트 · 행동 줄 P2 · P5 · 증빙 지문 · Q-F 초과 한 줄(DB 없음).
// 06.5 D-6520 — 공급가액 고침 판정(같음 · 고침 · 지급 뒤 막힘). EA-1 · F2 · MISMATCH 사례는 D-6520으로 사라졌다.

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

  it("지급 뒤 · 확인 전 → P5(1차 확인 · 2차 `지급 취소` · 3차 없음 — 06.5 D-6520 · UI-SPEC V8 잠김)", () => {
    expect(resolveExpenseActionRow({ ...paid, confirmation: null }, payer)).toEqual({
      row: "P5",
      primary: "confirm",
      blockReason: null,
      secondary: "cancel",
      tertiary: null,
      ownerNote: null,
    });
  });

  it("지급 뒤 · 확인됨 → P6", () => {
    expect(resolveExpenseActionRow({ ...paid, confirmation: CONFIRMED }, payer)).toMatchObject({ row: "P6", primary: null, secondary: "cancel" });
  });

  it("지급 권한 없는 사람 → P6 버튼 없음", () => {
    expect(resolveExpenseActionRow({ ...paid, confirmation: null }, { canPay: false })).toMatchObject({ row: "P6", primary: null, secondary: null });
  });

  it("O-2 상수를 false로 주입하면 P2 · P5 둘 다 사라진다 — 같은 상수 한 곳을 읽는다(06-06 검토 S-6)", () => {
    expect(resolveExpenseActionRow({ ...paid, confirmation: null }, payer, false)).toMatchObject({ row: "P6", primary: null });
    expect(resolveExpenseActionRow({ ...paid, paid: false, confirmation: null }, payer, false)).toMatchObject({ row: "P4", primary: "pay" });
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

// 06.5 D-6520 — 지문은 살아 있는 파일 id와 증빙일로만 만든다(증빙 금액 칸은 읽지 않는다 · 공급가 고침은 version을 올린다).
describe("evidenceStampOf — 증빙 지문 (06-06 Task 3 · 06.5 D-6520)", () => {
  const base = { fileIds: ["b", "a", "c"], evidenceDate: "2026-09-17" };
  it("파일 id 순서가 달라도 같은 문자열", () => {
    expect(evidenceStampOf(base)).toBe(evidenceStampOf({ ...base, fileIds: ["c", "b", "a"] }));
  });
  it("증빙일이 다르면 다른 문자열", () => {
    expect(evidenceStampOf({ ...base, evidenceDate: "2026-09-18" })).not.toBe(evidenceStampOf(base));
    expect(evidenceStampOf({ ...base, evidenceDate: null })).not.toBe(evidenceStampOf(base));
  });
  it("입력에 증빙 금액 칸이 없다(타입 수준)", () => {
    expectTypeOf(evidenceStampOf).parameter(0).toEqualTypeOf<{ fileIds: readonly string[]; evidenceDate: string | null }>();
  });
  it("파일이 하나 늘면 다른 문자열", () => {
    expect(evidenceStampOf({ ...base, fileIds: [...base.fileIds, "d"] })).not.toBe(evidenceStampOf(base));
  });
});

describe("공급가액 고침 판정 — supplyCorrectionKind (06.5 D-6520)", () => {
  const krw = moneyFromRow({ currency: "KRW", foreignAmount: null, fxRate: "1", amountKrw: 12_400_000 });
  const usd = moneyFromRow({ currency: "USD", foreignAmount: "1000.00", fxRate: "1350.0000", amountKrw: 1_350_000 });

  it("고침 칸 없음 → same(지급 유무와 무관하게 확정)", () => {
    expect(supplyCorrectionKind({ current: krw, corrected: undefined, paid: false })).toBe("same");
    expect(supplyCorrectionKind({ current: krw, corrected: undefined, paid: true })).toBe("same");
  });

  it("지금 공급가와 같은 값 → same(고침 아님 — 지급 뒤여도 막지 않는다)", () => {
    expect(supplyCorrectionKind({ current: krw, corrected: 12_400_000, paid: true })).toBe("same");
    expect(supplyCorrectionKind({ current: usd, corrected: 1000, paid: true })).toBe("same");
  });

  it("다른 값 · 지급 전 → correct", () => {
    expect(supplyCorrectionKind({ current: krw, corrected: 12_000_000, paid: false })).toBe("correct");
    expect(supplyCorrectionKind({ current: usd, corrected: 950.5, paid: false })).toBe("correct");
  });

  it("다른 값 · 지급 뒤 → locked(카드 ② 「지금처럼 막기」)", () => {
    expect(supplyCorrectionKind({ current: krw, corrected: 12_000_000, paid: true })).toBe("locked");
  });

  it("LOCKED 문구는 UI-SPEC V8 D-6520 개정 글자", () => {
    expect(SUPPLY_CORRECTION_PAID_LOCKED).toBe("지급 완료 문서 · 공급가액 못 바꿈 · 새로 고침");
  });
});
