import { describe, expect, it } from "vitest";
import {
  APPROVAL_ROUTE_EXPENSE_STEP1_SCOPE,
  APPROVAL_ROUTE_EXPENSE_STEP2_SCOPE,
  APPROVAL_ROUTE_EXPENSE_STEP3_SCOPE,
  APPROVAL_ROUTE_EXPENSE_STEP4_SCOPE,
  APPROVAL_ROUTE_LEAVE_STEP1_SCOPE,
  APPROVAL_ROUTE_LEAVE_STEP2_SCOPE,
  APPROVAL_ROUTE_LEAVE_STEP3_SCOPE,
  APPROVAL_ROUTE_LEAVE_STEP4_SCOPE,
  APPROVAL_ROUTE_SETTLEMENT_STEP1_SCOPE,
  APPROVAL_ROUTE_SETTLEMENT_STEP2_SCOPE,
  APPROVAL_ROUTE_SETTLEMENT_STEP3_SCOPE,
  APPROVAL_ROUTE_SETTLEMENT_STEP4_SCOPE,
  EXPENSE_ROUTE_SCOPE_VALUES,
} from "@/domain/settings/keys";

// 06.2-02(D-6215 · RESEARCH Pitfall 5 · T-06.2-10): 행사 담당 팀(project_team)은 지출결의 결재선 네 단계에만 있다 —
// 연차 · 정산은 행사에 안 매인 문서라 저장 스키마가 거부한다(260907 `O: server/src/expenses.ts:1021-1022`).

const LEAVE = [APPROVAL_ROUTE_LEAVE_STEP1_SCOPE, APPROVAL_ROUTE_LEAVE_STEP2_SCOPE, APPROVAL_ROUTE_LEAVE_STEP3_SCOPE, APPROVAL_ROUTE_LEAVE_STEP4_SCOPE];
const SETTLEMENT = [
  APPROVAL_ROUTE_SETTLEMENT_STEP1_SCOPE,
  APPROVAL_ROUTE_SETTLEMENT_STEP2_SCOPE,
  APPROVAL_ROUTE_SETTLEMENT_STEP3_SCOPE,
  APPROVAL_ROUTE_SETTLEMENT_STEP4_SCOPE,
];
const EXPENSE = [APPROVAL_ROUTE_EXPENSE_STEP1_SCOPE, APPROVAL_ROUTE_EXPENSE_STEP2_SCOPE, APPROVAL_ROUTE_EXPENSE_STEP3_SCOPE, APPROVAL_ROUTE_EXPENSE_STEP4_SCOPE];

describe("결재선 단계 범위 스키마 — 행사 담당 팀 (06.2 D-6215)", () => {
  for (const def of LEAVE) {
    it(`연차 ${def.key}는 project_team을 거부한다`, () => {
      expect(def.schema.safeParse("project_team").success).toBe(false);
    });
  }

  for (const def of SETTLEMENT) {
    it(`정산 ${def.key}는 project_team을 거부한다`, () => {
      expect(def.schema.safeParse("project_team").success).toBe(false);
    });
  }

  for (const def of EXPENSE) {
    it(`지출결의 ${def.key}는 project_team을 받고 선택지 이름이 「행사 담당 팀」이다`, () => {
      expect(def.schema.safeParse("project_team").success).toBe(true);
      expect(def.optionLabels?.project_team).toBe("행사 담당 팀");
    });
  }

  it("지출결의 1단 조직 범위 기본값은 project_team이다 (D-6216)", () => {
    expect(APPROVAL_ROUTE_EXPENSE_STEP1_SCOPE.default).toBe("project_team");
  });

  it("지출결의 선택지 순서는 기안자 팀 · 행사 담당 팀 · 기안자 본부 · 전사 · 특정 부서다 (UI-SPEC S5)", () => {
    expect(EXPENSE_ROUTE_SCOPE_VALUES).toEqual(["drafter_team", "project_team", "drafter_org_unit", "company", "org_unit"]);
  });
});
