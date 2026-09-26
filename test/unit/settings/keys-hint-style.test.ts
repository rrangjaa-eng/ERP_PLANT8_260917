import { describe, expect, it } from "vitest";
import { QUOTE_LINE_MAX_PER_REVISION, PROJECT_CUSTOMER_APPROVAL_GATE } from "@/domain/settings/keys";

// VERDICT.md N-7 · 사용자 결정 2026-09-26 — 새로 추가한 힌트 2개만 명사형(마침표 없음)이라
// 기존 24개("~합니다.")와 말투가 섞인다. 기존 말투에 맞춘다.
describe("설정 힌트 말투 통일 (D-93 항목 8)", () => {
  it("차수당 견적 줄 상한 힌트가 '~합니다.' 말투다", () => {
    expect(QUOTE_LINE_MAX_PER_REVISION.hint).toBe(
      "한 차수에 둘 수 있는 견적 줄 수를 정합니다(조정·취소 줄 포함).",
    );
  });

  it("고객 승인 게이트 힌트가 '~있습니다.' 말투다", () => {
    expect(PROJECT_CUSTOMER_APPROVAL_GATE.hint).toBe(
      "끄면 고객 승인 전 차수에서도 지출결의를 올릴 수 있습니다.",
    );
  });
});
