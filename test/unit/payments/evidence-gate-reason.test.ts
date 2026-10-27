import { describe, expect, it } from "vitest";
import { EVIDENCE_MISSING_MANAGEMENT, evidenceGateDecision, type EvidenceGateInput } from "@/domain/payments/action-row";
import { expenseDrafterAddsEvidence, expenseDrafterRemoves, type ExpenseDrafterRuleInput } from "@/domain/evidence/drafter-rule";

// 07.1-03 D-7101 · U-2 — 증빙 없음 막힘 이유가 다음 행동을 할 수 있는 사람을 가리킨다. 기안자가 붙일 수 없으면(완료 프로젝트) 경영관리.
const BLOCKED: EvidenceGateInput = { evidenceRequired: true, hasEvidence: false, prepaid: false, waived: false, confirmation: null, drafterName: "박서연" };

describe("evidenceGateDecision — 증빙 없음 이유 갈래 (D-7101)", () => {
  it("기안자가 붙일 수 없으면 `증빙 없음 · 경영관리 등록`", () => {
    expect(EVIDENCE_MISSING_MANAGEMENT).toBe("증빙 없음 · 경영관리 등록");
    expect(evidenceGateDecision({ ...BLOCKED, drafterCanAdd: false })).toEqual({ allowed: false, reason: "증빙 없음 · 경영관리 등록" });
  });

  it("기안자가 붙일 수 있거나 칸이 없으면 지금 문구 `증빙 없음 · 기안자 {이름}`", () => {
    expect(evidenceGateDecision({ ...BLOCKED, drafterCanAdd: true })).toEqual({ allowed: false, reason: "증빙 없음 · 기안자 박서연" });
    expect(evidenceGateDecision(BLOCKED)).toEqual({ allowed: false, reason: "증빙 없음 · 기안자 박서연" });
  });

  // 허용 집합은 칸과 무관하다 — 글자만 갈린다(T-07.1-03-01).
  const ALLOWED: ReadonlyArray<[string, Partial<EvidenceGateInput>]> = [
    ["증빙 있음", { hasEvidence: true }],
    ["선결제", { prepaid: true }],
    ["면제", { waived: true }],
    ["증빙 필수 off", { evidenceRequired: false }],
  ];
  for (const [label, patch] of ALLOWED) {
    for (const drafterCanAdd of [true, false, undefined]) {
      it(`${label} · drafterCanAdd ${String(drafterCanAdd)} → 허용`, () => {
        const ctx: EvidenceGateInput = { ...BLOCKED, ...patch, ...(drafterCanAdd === undefined ? {} : { drafterCanAdd }) };
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
