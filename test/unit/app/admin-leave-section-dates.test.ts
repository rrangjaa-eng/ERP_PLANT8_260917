import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// /review(red-team): 관리자 사람 상세의 입사일 · 퇴직일 칸은 leave.value로 투영된 잔고 DTO에서 채운다. 보는 사람 계급에
// 연차 정보가 가려져 있으면 칸이 빈 채로 그려져 「없음」처럼 보이고, 저장하면 실제 값을 덮어쓴다 — 값이 가려졌으면
// 입력 칸을 그리지 않는다(새 노출 경로를 만들지 않는다).
vi.mock("@/app/(app)/admin/people/[id]/actions", () => ({
  addLeaveAdjustmentAction: () => undefined,
  setHireDateAction: () => undefined,
  setResignationDateAction: () => undefined,
}));
vi.mock("next-safe-action/hooks", () => ({ useAction: () => ({ execute: () => undefined, isExecuting: false, result: {} }) }));

const { LeaveSection } = await import("@/app/(app)/admin/people/[id]/leave-section");

const base = {
  userId: "u1",
  year: 2026,
  thisYear: 2026,
  balanceLines: [],
  hireDate: null,
  resignationDate: null,
  adjustments: [],
  canWrite: true,
  monthlyBlockedReason: null,
};

describe("관리자 연차 섹션 — 입사일 · 퇴직일 칸", () => {
  it("날짜를 볼 수 있으면(datesVisible) 두 칸을 그린다", () => {
    const html = renderToStaticMarkup(createElement(LeaveSection, { ...base, hireDate: "2025-01-01", datesVisible: true }));
    expect(html).toContain('id="hireDate"');
    expect(html).toContain('id="resignationDate"');
  });

  it("날짜가 투영에서 가려졌으면 쓰기 권한이 있어도 두 칸을 그리지 않는다", () => {
    const html = renderToStaticMarkup(createElement(LeaveSection, { ...base, datesVisible: false }));
    expect(html).not.toContain('id="hireDate"');
    expect(html).not.toContain('id="resignationDate"');
  });
});

// 07-17 독립 검토 M1: 대상 계급이 상한 밖이면 입사일 칸도 퇴직일 칸과 같이 그리지 않는다(서버 setHireDate도 상한으로 거부).
describe("관리자 연차 섹션 — 상한 밖 대상의 날짜 칸", () => {
  it("datesWritable=false면 입사일 · 퇴직일 두 칸 모두 없다", () => {
    const html = renderToStaticMarkup(createElement(LeaveSection, { ...base, hireDate: "2025-01-01", datesVisible: true, datesWritable: false }));
    expect(html).not.toContain('id="hireDate"');
    expect(html).not.toContain('id="resignationDate"');
  });
});
