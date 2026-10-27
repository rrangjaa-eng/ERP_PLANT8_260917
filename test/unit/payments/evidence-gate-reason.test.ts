import { describe, expect, expectTypeOf, it } from "vitest";
import { EVIDENCE_MISSING_MANAGEMENT, evidenceGateDecision, type EvidenceGateInput } from "@/domain/payments/action-row";
import { expenseDrafterAddsEvidence, expenseDrafterRemoves, type ExpenseDrafterRuleInput } from "@/domain/evidence/drafter-rule";

// 07.1-03 D-7101 · U-2 — 증빙 없음 막힘 이유가 다음 행동을 할 수 있는 사람을 가리킨다. 기안자가 붙일 수 없으면(완료 프로젝트) 경영관리.
const BLOCKED: EvidenceGateInput = { evidenceRequired: true, hasEvidence: false, prepaid: false, waived: false, confirmation: null, drafterName: "박서연", drafterCanAdd: true };

describe("evidenceGateDecision — 증빙 없음 이유 갈래 (D-7101)", () => {
  it("기안자가 붙일 수 없으면 `증빙 없음 · 경영관리 등록`", () => {
    expect(EVIDENCE_MISSING_MANAGEMENT).toBe("증빙 없음 · 경영관리 등록");
    expect(evidenceGateDecision({ ...BLOCKED, drafterCanAdd: false })).toEqual({ allowed: false, reason: "증빙 없음 · 경영관리 등록" });
  });

  it("기안자가 붙일 수 있으면 지금 문구 `증빙 없음 · 기안자 {이름}`", () => {
    expect(evidenceGateDecision({ ...BLOCKED, drafterCanAdd: true })).toEqual({ allowed: false, reason: "증빙 없음 · 기안자 박서연" });
  });

  // #309 검토 P3 — 칸을 빠뜨리면 조용히 기안자 문구가 나오던 선택 칸을 필수로(호출부마다 명시).
  it("drafterCanAdd는 필수 boolean", () => {
    expectTypeOf<EvidenceGateInput["drafterCanAdd"]>().toEqualTypeOf<boolean>();
  });

  // 허용 집합은 칸과 무관하다 — 글자만 갈린다(T-07.1-03-01).
  const ALLOWED: ReadonlyArray<[string, Partial<EvidenceGateInput>]> = [
    ["증빙 있음", { hasEvidence: true }],
    ["선결제", { prepaid: true }],
    ["면제", { waived: true }],
    ["증빙 필수 off", { evidenceRequired: false }],
  ];
  for (const [label, patch] of ALLOWED) {
    for (const drafterCanAdd of [true, false]) {
      it(`${label} · drafterCanAdd ${String(drafterCanAdd)} → 허용`, () => {
        const ctx: EvidenceGateInput = { ...BLOCKED, ...patch, drafterCanAdd };
        expect(evidenceGateDecision(ctx, false)).toEqual({ allowed: true });
      });
    }
  }
});

describe("expenseDrafterAddsEvidence — 기안자 붙임 규칙 한 함수 (D-7101 · E-P2-09)", () => {
  const owner = (patch: Partial<ExpenseDrafterRuleInput>): ExpenseDrafterRuleInput => ({ closed: false, number: "EXP-1", status: "approved", projectCompleted: false, ...patch });

  it("승인 · 완료 프로젝트 → 거짓 · 승인 · 미완료 프로젝트 → 참", () => {
    expect(expenseDrafterAddsEvidence(owner({ projectCompleted: true }))).toBe(false);
    expect(expenseDrafterAddsEvidence(owner({ projectCompleted: false }))).toBe(true);
  });

  // #309 검토 P3 — 종결 문서는 승인 · 미완료 프로젝트여도 기안자가 붙이지 못한다(실제 붙이기도 EXPENSE_ALREADY_CLOSED로 막힌다).
  it("승인 · 미완료 프로젝트라도 종결이면 거짓", () => {
    expect(expenseDrafterAddsEvidence(owner({ closed: true }))).toBe(false);
  });

  it("작성 중 · 반려 · 회수 · 결재 중 · 종결은 떼기 규칙과 같은 답", () => {
    const cases = [
      owner({ number: null, status: null }),
      owner({ status: "rejected" }),
      owner({ status: "withdrawn" }),
      owner({ status: "submitted" }),
      owner({ status: "in_review" }),
      owner({ status: "rejected", closed: true }),
      owner({ number: null, status: null, projectCompleted: true }),
    ];
    for (const state of cases) expect(expenseDrafterAddsEvidence(state), JSON.stringify(state)).toBe(expenseDrafterRemoves(state));
  });
});
