import { describe, expect, it } from "vitest";
import { BANK_TRANSFER_PAYMENT_METHOD, documentPayee, hasUsableAccount, PAYEE_ACCOUNT_MISSING, PAYEE_ACCOUNT_MISSING_FIXABLE } from "@/domain/expenses/payee";

// 06.5 결정 맥락 15 · D-6507: 돈 갈 곳은 문서의 지급처 칸 하나 — 견적 줄의 거래처를 읽지 않는다. 계좌 있음 = 은행 ∧ 번호(UI-SPEC V4).

describe("documentPayee — 문서 지급처 칸 하나", () => {
  it("거래처 칸이면 거래처", () => {
    expect(documentPayee({ vendorId: "v", payeeUserId: null })).toEqual({ kind: "vendor", id: "v" });
  });

  it("직원 칸이면 직원", () => {
    expect(documentPayee({ vendorId: null, payeeUserId: "u" })).toEqual({ kind: "user", id: "u" });
  });

  it("둘 다 비면 없음", () => {
    expect(documentPayee({ vendorId: null, payeeUserId: null })).toBeNull();
  });
});

describe("hasUsableAccount — 은행 ∧ 번호(V4)", () => {
  it("은행과 번호가 있으면 참", () => {
    expect(hasUsableAccount({ bank: "신한", hasNumber: true })).toBe(true);
  });

  it.each([
    ["은행 공백뿐", { bank: "  ", hasNumber: true }],
    ["은행 없음", { bank: null, hasNumber: true }],
    ["번호 없음", { bank: "신한", hasNumber: false }],
  ])("%s → 거짓", (_name, account) => {
    expect(hasUsableAccount(account)).toBe(false);
  });
});

describe("상수 — UI-SPEC V4 문구 · 지급 방식 코드", () => {
  it("계좌이체 코드와 두 문구", () => {
    expect(BANK_TRANSFER_PAYMENT_METHOD).toBe("bank_transfer");
    expect(PAYEE_ACCOUNT_MISSING).toBe("지급처 계좌 없음 · 계좌 등록은 경영관리");
    expect(PAYEE_ACCOUNT_MISSING_FIXABLE).toBe("지급처 계좌 없음 · 계좌 등록");
  });
});
