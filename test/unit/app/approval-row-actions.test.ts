import { describe, expect, it } from "vitest";
import { rowApprovalActions } from "@/app/(app)/approvals/row-actions";

// 05-10 D4: PC 결재함 행 · 「내 차례」 PC 행의 막힌 `승인` 셀 판정 — 두 행이 같은 순수 함수 하나를 쓴다.
describe("rowApprovalActions", () => {
  it("막힘 이유가 없으면 승인 · 반려가 있고 이유 글자는 없다", () => {
    expect(rowApprovalActions({ approveBlockedReason: null, canReject: true })).toEqual({ showApprove: true, reasonText: null, showReject: true });
  });

  it("막힘 이유가 있으면 승인 대신 서버 원문 그대로의 이유 글자 + 반려", () => {
    expect(rowApprovalActions({ approveBlockedReason: "진행으로 바뀜 · 반려", canReject: true })).toEqual({
      showApprove: false,
      reasonText: "진행으로 바뀜 · 반려",
      showReject: true,
    });
  });

  it("지금 담당이 아니라 막히고 반려도 없으면 이유 글자만", () => {
    expect(rowApprovalActions({ approveBlockedReason: "지금 담당이 아님 · 새로 고침", canReject: false })).toEqual({
      showApprove: false,
      reasonText: "지금 담당이 아님 · 새로 고침",
      showReject: false,
    });
  });
});
