import { describe, expect, it } from "vitest";
import {
  EVIDENCE_MAX_SIZE_MB,
  EVIDENCE_PREPAID_DUE_DAYS,
  EVIDENCE_REQUIRED,
  PAYMENT_METHOD_EVIDENCE_PAIRS,
  PURCHASE_ONLINE_VENDOR_NAME,
  SETTING_DEFS,
} from "@/domain/settings/keys";
import { describeSettingField } from "@/domain/settings/registry";
import { CODE_TABLES } from "@/domain/code-tables";
import { isMethodEvidencePairAllowed } from "@/domain/payments/method-evidence-pairs";
import { resolveLineDoor } from "@/domain/quotes/line-door";

// 06-02 Task 1 — 새 설정 키 넷(셋 + 짝 하나)이 정의 → 등록 → 설정 화면 서술까지 선다.
describe("Phase 6 설정 키 넷 (06-02)", () => {
  it("증빙 필수는 boolean · 기본 켬이다", () => {
    expect(EVIDENCE_REQUIRED.key).toBe("evidence.required");
    expect(EVIDENCE_REQUIRED.default).toBe(true);
    expect(EVIDENCE_REQUIRED.schema.safeParse(false).success).toBe(true);
    expect(EVIDENCE_REQUIRED.schema.safeParse("yes").success).toBe(false);
  });

  it("선결제 증빙 기한은 양의 정수 · 기본 14 · 단위 일이다", () => {
    expect(EVIDENCE_PREPAID_DUE_DAYS.key).toBe("evidence.prepaid_due_days");
    expect(EVIDENCE_PREPAID_DUE_DAYS.default).toBe(14);
    expect(EVIDENCE_PREPAID_DUE_DAYS.unitLabel).toBe("일");
    expect(EVIDENCE_PREPAID_DUE_DAYS.schema.safeParse(21).success).toBe(true);
    expect(EVIDENCE_PREPAID_DUE_DAYS.schema.safeParse(0).success).toBe(false);
    expect(EVIDENCE_PREPAID_DUE_DAYS.schema.safeParse(-1).success).toBe(false);
    expect(EVIDENCE_PREPAID_DUE_DAYS.schema.safeParse(1.5).success).toBe(false);
  });

  it("온라인구매 협력사는 문자열 · 기본 빈 값이다", () => {
    expect(PURCHASE_ONLINE_VENDOR_NAME.key).toBe("purchase.online_vendor_name");
    expect(PURCHASE_ONLINE_VENDOR_NAME.default).toBe("");
    expect(PURCHASE_ONLINE_VENDOR_NAME.schema.safeParse("쿠팡").success).toBe(true);
  });

  it("지급 방식 · 증빙 종류 짝은 짝 목록 · 기본 빈 목록이고 빈 문자열 · 문자열 값을 거부한다", () => {
    expect(PAYMENT_METHOD_EVIDENCE_PAIRS.key).toBe("payment.method_evidence_pairs");
    expect(PAYMENT_METHOD_EVIDENCE_PAIRS.default).toEqual([]);
    expect(PAYMENT_METHOD_EVIDENCE_PAIRS.schema.safeParse([{ method: "bank_transfer", evidence: "tax_invoice" }]).success).toBe(true);
    expect(PAYMENT_METHOD_EVIDENCE_PAIRS.schema.safeParse([{ method: "", evidence: "x" }]).success).toBe(false);
    expect(PAYMENT_METHOD_EVIDENCE_PAIRS.schema.safeParse("계좌이체:세금계산서").success).toBe(false);
  });

  // 06-06이 evidence.prepaid_due_days를, 06-08이 purchase.online_vendor_name을 처음 읽어 그 readBy를 지웠다.
  it("넷 모두 SETTING_DEFS에 있고, 06-04 · 06-06 · 06-08이 읽는 키는 readBy가 없으며 05의 증빙 크기 한도에도 readBy가 없다", () => {
    for (const def of [EVIDENCE_REQUIRED, PAYMENT_METHOD_EVIDENCE_PAIRS, EVIDENCE_PREPAID_DUE_DAYS, PURCHASE_ONLINE_VENDOR_NAME]) {
      expect(def.readBy).toBeUndefined();
      expect(SETTING_DEFS).toContain(def);
    }
    expect(EVIDENCE_MAX_SIZE_MB.readBy).toBeUndefined();
  });
});

describe("describeSettingField — pair-grid 갈래 (06-02)", () => {
  it("짝 키는 pair-grid 서술이고 행 · 열 코드표 키가 CODE_TABLES에 있다", () => {
    const descriptor = describeSettingField(PAYMENT_METHOD_EVIDENCE_PAIRS);
    expect(descriptor).toEqual({
      kind: "pair-grid",
      rows: "payment_method",
      cols: "evidence_type",
      rowField: "method",
      colField: "evidence",
    });
    const tableKeys: readonly string[] = CODE_TABLES.map((table) => table.key);
    expect(tableKeys).toContain("payment_method");
    expect(tableKeys).toContain("evidence_type");
  });

  it("다른 키들의 서술은 그대로다(boolean · number · string)", () => {
    expect(describeSettingField(EVIDENCE_REQUIRED)).toEqual({ kind: "boolean" });
    expect(describeSettingField(EVIDENCE_PREPAID_DUE_DAYS)).toEqual({ kind: "number", numberKind: undefined });
    expect(describeSettingField(PURCHASE_ONLINE_VENDOR_NAME)).toEqual({ kind: "string" });
  });
});

// 06-02 Task 2 — 짝 판정(Q4 · SP-9 빈 행 = 검사 없음).
describe("isMethodEvidencePairAllowed", () => {
  const pairs = [{ method: "bank_transfer", evidence: "tax_invoice" }];

  it("짝 목록이 비면 어떤 조합이든 참이다", () => {
    expect(isMethodEvidencePairAllowed([], { method: "cash", evidenceType: "etc" })).toBe(true);
  });

  it("그 지급 방식의 짝에 증빙 종류가 있으면 참이다", () => {
    expect(isMethodEvidencePairAllowed(pairs, { method: "bank_transfer", evidenceType: "tax_invoice" })).toBe(true);
  });

  it("그 지급 방식의 짝이 있는데 증빙 종류가 목록에 없으면 거짓이다", () => {
    expect(isMethodEvidencePairAllowed(pairs, { method: "bank_transfer", evidenceType: "card_slip" })).toBe(false);
  });

  it("그 지급 방식의 짝이 하나도 없으면 참이다(빈 행 = 검사 없음)", () => {
    expect(isMethodEvidencePairAllowed(pairs, { method: "cash", evidenceType: "card_slip" })).toBe(true);
  });

  // 06-02 검토 P2-2 — 보관된 증빙 종류의 짝만 남은 지급 방식은 빈 행이 아니다: 활성 증빙 종류 전부가 거짓이다.
  // 그래서 설정 화면은 그 짝을 「(보관됨)」 열로 보여 해제할 수 있게 한다(pair-grid-axes).
  it("보관된 증빙 종류의 짝만 있는 지급 방식은 활성 증빙 종류 전부가 거짓이다", () => {
    expect(isMethodEvidencePairAllowed(pairs, { method: "bank_transfer", evidenceType: "invoice" })).toBe(false);
  });
});

// 견적 줄 문 갈래(O-13) — 공백 제거 · NFC 정규화 뒤 정확 비교.
describe("resolveLineDoor", () => {
  it("설정이 비었으면 지출결의다", () => {
    expect(resolveLineDoor({ vendorName: "쿠팡" }, "")).toBe("expense");
  });

  it("앞뒤 공백을 지운 거래처 이름이 설정과 같으면 구매 요청이다", () => {
    expect(resolveLineDoor({ vendorName: " 쿠팡 " }, "쿠팡")).toBe("purchase");
  });

  it("NFD로 적힌 같은 이름도 구매 요청이다", () => {
    const nfd = "한글상회".normalize("NFD");
    expect(nfd).not.toBe("한글상회");
    expect(resolveLineDoor({ vendorName: nfd }, "한글상회")).toBe("purchase");
  });

  it("다른 이름이면 지출결의다(부분 일치 없음)", () => {
    expect(resolveLineDoor({ vendorName: "쿠팡페이" }, "쿠팡")).toBe("expense");
  });

  it("거래처가 없으면 지출결의다", () => {
    expect(resolveLineDoor({ vendorName: null }, "쿠팡")).toBe("expense");
  });
});
