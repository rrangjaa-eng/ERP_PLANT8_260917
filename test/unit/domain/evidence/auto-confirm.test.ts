import { describe, expect, it } from "vitest";
import { autoConfirmEligible, type EvidenceSources } from "@/domain/evidence/has-evidence";

// 06.1-12(RP-1 · D-6117 × D-6520 · 카드 R2) — 자동 확인 조건 한 함수(DB 없음). 붙임 ≥ 1 ∧ 작성자 붙임 0 ∧ 파일 0 ∧ 문서 공급가 있음 ∧
// 붙은 기록 공급가 합 = 문서 공급가. 금액은 비교만 한다 — 저장 · 권한 · 결재 상태는 evidence-reviews 몫이다.

const DOC_SUPPLY = 12_400_000;

function sources(patch: Partial<EvidenceSources>): EvidenceSources {
  return { fileCount: 0, linkCount: 1, authorLinkCount: 0, recordSupplyKrw: DOC_SUPPLY, lastAttachedAt: new Date("2026-10-16T01:00:00Z"), ...patch };
}

describe("autoConfirmEligible (06.1-12 RP-1)", () => {
  it("경영관리 붙임 1 · 파일 0 · 합 = 공급가 → 참", () => {
    expect(autoConfirmEligible(sources({}), DOC_SUPPLY)).toBe(true);
  });

  it("대조 붙임 1 + 경영관리 붙임 1 · 합 = 공급가 → 참", () => {
    expect(autoConfirmEligible(sources({ linkCount: 2, recordSupplyKrw: DOC_SUPPLY }), DOC_SUPPLY)).toBe(true);
  });

  it("합 ≠ 공급가 → 거짓", () => {
    expect(autoConfirmEligible(sources({ recordSupplyKrw: DOC_SUPPLY - 1 }), DOC_SUPPLY)).toBe(false);
    expect(autoConfirmEligible(sources({ recordSupplyKrw: DOC_SUPPLY + 1 }), DOC_SUPPLY)).toBe(false);
  });

  it("음수(취소) 기록이 섞여도 합 = 공급가면 → 참", () => {
    // 13,000,000 + (−600,000) — 합은 리포지토리가 낸다. 이 함수는 받은 합을 비교만 한다.
    expect(autoConfirmEligible(sources({ linkCount: 2, recordSupplyKrw: DOC_SUPPLY }), DOC_SUPPLY)).toBe(true);
  });

  it("작성자 붙임이 하나라도 있으면 → 거짓", () => {
    expect(autoConfirmEligible(sources({ linkCount: 2, authorLinkCount: 1 }), DOC_SUPPLY)).toBe(false);
  });

  it("05 파일이 하나라도 있으면 → 거짓(파일은 사람이 본다)", () => {
    expect(autoConfirmEligible(sources({ fileCount: 1 }), DOC_SUPPLY)).toBe(false);
  });

  it("붙임 0 → 거짓", () => {
    expect(autoConfirmEligible(sources({ linkCount: 0, recordSupplyKrw: 0 }), 0)).toBe(false);
    expect(autoConfirmEligible(sources({ linkCount: 0, fileCount: 1, recordSupplyKrw: 0 }), DOC_SUPPLY)).toBe(false);
  });

  it("문서 공급가 없음(null) → 거짓", () => {
    expect(autoConfirmEligible(sources({}), null)).toBe(false);
  });

  it("증빙 원천 없음(맵에 없는 주인) → 거짓", () => {
    expect(autoConfirmEligible(undefined, DOC_SUPPLY)).toBe(false);
  });
});
