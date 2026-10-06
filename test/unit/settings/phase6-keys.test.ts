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

  it("넷 모두 readBy 6이고 SETTING_DEFS에 있으며 05의 증빙 크기 한도에는 readBy가 없다", () => {
    for (const def of [EVIDENCE_REQUIRED, EVIDENCE_PREPAID_DUE_DAYS, PURCHASE_ONLINE_VENDOR_NAME, PAYMENT_METHOD_EVIDENCE_PAIRS]) {
      expect(def.readBy?.phase).toBe("6");
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
