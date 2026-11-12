import { describe, expect, it } from "vitest";
import { DATE_CHANGE_BLOCKED, dateChangeEligibility } from "@/domain/expenses/date-change";

// 07.2-18 X4(D-7290 · D-7294 · D-7295): 희망 지급일 변경 요청 판정 — 화면 입구와 서버가 같은 순수 함수를 쓴다.
const base = { isDrafter: true, finalApproved: true, closed: false, paid: false, inTransferFile: false, pending: false };

describe("dateChangeEligibility", () => {
  it("기안자 본인 · 최종 승인 · 미지급 · 이체 파일 전 · 대기 없음 → can", () => {
    expect(dateChangeEligibility(base)).toEqual({ kind: "can" });
  });

  it("본인 아님(PM이 쓴 문서의 팀장 · 다른 사람) → none", () => {
    expect(dateChangeEligibility({ ...base, isDrafter: false })).toEqual({ kind: "none" });
  });

  it("결재 중 · 종결 → none", () => {
    expect(dateChangeEligibility({ ...base, finalApproved: false })).toEqual({ kind: "none" });
    expect(dateChangeEligibility({ ...base, closed: true })).toEqual({ kind: "none" });
  });

  it("지급 완료 · 이체 파일에 담김 → blocked `지급 진행 중 · 변경 요청 불가`(대기 요청이 있어도)", () => {
    expect(DATE_CHANGE_BLOCKED).toBe("지급 진행 중 · 변경 요청 불가");
    expect(dateChangeEligibility({ ...base, paid: true })).toEqual({ kind: "blocked", reason: DATE_CHANGE_BLOCKED });
    expect(dateChangeEligibility({ ...base, inTransferFile: true })).toEqual({ kind: "blocked", reason: DATE_CHANGE_BLOCKED });
    expect(dateChangeEligibility({ ...base, paid: true, pending: true })).toEqual({ kind: "blocked", reason: DATE_CHANGE_BLOCKED });
  });

  it("대기 요청 있음 → pending", () => {
    expect(dateChangeEligibility({ ...base, pending: true })).toEqual({ kind: "pending" });
  });
});
