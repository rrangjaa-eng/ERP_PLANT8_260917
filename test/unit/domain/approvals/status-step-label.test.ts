import { describe, expect, it } from "vitest";
import { statusStepLabel } from "@/domain/approvals";

// 06.2-02 A-9(사용자 결정 2026-10-09 「목록만 줄임」): 지출결의 목록 상태 낱말은 행사 담당 팀 단계도 계급 이름만 쓴다
// (「행사 담당 팀장」 → 「팀장」). 결재선 · 결재 시트는 단계 이름 전체를 그대로 쓴다 — 이 함수는 목록용 낱말만 만든다.

describe("statusStepLabel — 목록 상태 낱말의 단계 이름 (A-9)", () => {
  it("행사 담당 {계급} → 계급 이름만", () => {
    expect(statusStepLabel("행사 담당 팀장")).toBe("팀장");
    expect(statusStepLabel("행사 담당 본부장")).toBe("본부장");
  });

  it("계급 없는 행사 담당 팀 단계는 단계 이름 그대로", () => {
    expect(statusStepLabel("행사 담당 팀")).toBe("행사 담당 팀");
  });

  it("행사 담당 팀이 아닌 단계 이름은 바꾸지 않는다", () => {
    for (const label of ["팀장", "본부장", "대표", "전사", "기획1팀", "대표 (대행)"]) expect(statusStepLabel(label)).toBe(label);
  });
});
