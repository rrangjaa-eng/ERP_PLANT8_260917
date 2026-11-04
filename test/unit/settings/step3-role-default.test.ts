import { describe, expect, it } from "vitest";
import { CEO_ROLE_ID, DIVISION_HEAD_ROLE_ID, TEAM_LEAD_ROLE_ID } from "@/domain/permissions/roles";
import {
  APPROVAL_ROUTE_EXPENSE_STEP1_ROLE_ID,
  APPROVAL_ROUTE_EXPENSE_STEP2_ROLE_ID,
  APPROVAL_ROUTE_EXPENSE_STEP3_ROLE_ID,
  APPROVAL_ROUTE_EXPENSE_STEP4_ROLE_ID,
  APPROVAL_ROUTE_LEAVE_STEP1_ROLE_ID,
  APPROVAL_ROUTE_LEAVE_STEP2_ROLE_ID,
  APPROVAL_ROUTE_LEAVE_STEP3_ROLE_ID,
  APPROVAL_ROUTE_LEAVE_STEP4_ROLE_ID,
  APPROVAL_ROUTE_SETTLEMENT_STEP1_ROLE_ID,
  APPROVAL_ROUTE_SETTLEMENT_STEP2_ROLE_ID,
  APPROVAL_ROUTE_SETTLEMENT_STEP3_ROLE_ID,
  APPROVAL_ROUTE_SETTLEMENT_STEP4_ROLE_ID,
} from "@/domain/settings/keys";

// 07.3-02(D-7306): 결재선 ③단 「경영관리」 담당 계급 기본값은 본부 책임자다 — 경영관리 사원(실무)은 결재 후보가 아니다.
// keys.ts는 roles.ts를 import하지 않고 문자열로 적는다(2단 선례) — 상수와 같은 값인지 여기서 지킨다.
describe("결재선 ③단 담당 계급 기본값 (07.3-02 D-7306)", () => {
  it.each([
    ["연차", APPROVAL_ROUTE_LEAVE_STEP3_ROLE_ID],
    ["지출결의", APPROVAL_ROUTE_EXPENSE_STEP3_ROLE_ID],
    ["정산", APPROVAL_ROUTE_SETTLEMENT_STEP3_ROLE_ID],
  ])("%s ③단 기본값 = 본부 책임자", (_name, def) => {
    expect(def.default).toBe(DIVISION_HEAD_ROLE_ID);
  });

  it("「계급 무관」은 고르는 칸으로 남는다", () => {
    for (const def of [APPROVAL_ROUTE_LEAVE_STEP3_ROLE_ID, APPROVAL_ROUTE_EXPENSE_STEP3_ROLE_ID, APPROVAL_ROUTE_SETTLEMENT_STEP3_ROLE_ID]) {
      expect(def.optionLabels).toEqual({ "": "계급 무관" });
    }
  });

  it("1 · 2 · 4단 기본값은 그대로다", () => {
    for (const def of [APPROVAL_ROUTE_LEAVE_STEP1_ROLE_ID, APPROVAL_ROUTE_EXPENSE_STEP1_ROLE_ID, APPROVAL_ROUTE_SETTLEMENT_STEP1_ROLE_ID]) {
      expect(def.default).toBe(TEAM_LEAD_ROLE_ID);
    }
    for (const def of [APPROVAL_ROUTE_LEAVE_STEP2_ROLE_ID, APPROVAL_ROUTE_EXPENSE_STEP2_ROLE_ID, APPROVAL_ROUTE_SETTLEMENT_STEP2_ROLE_ID]) {
      expect(def.default).toBe(DIVISION_HEAD_ROLE_ID);
    }
    for (const def of [APPROVAL_ROUTE_LEAVE_STEP4_ROLE_ID, APPROVAL_ROUTE_EXPENSE_STEP4_ROLE_ID, APPROVAL_ROUTE_SETTLEMENT_STEP4_ROLE_ID]) {
      expect(def.default).toBe(CEO_ROLE_ID);
    }
  });
});
