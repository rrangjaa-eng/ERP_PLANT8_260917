import { describe, expect, it } from "vitest";
import { UNPRUNABLE_ACTION_TYPES, isPrunableActionType } from "@/domain/action-log/prune-scope";

// 04.3-14 사용자 결정 5936870579 — 행동 로그 「정리」는 정리 흔적(action_log_prune)과 개인정보 접속기록 셋을 표시할 수 없다.
// PR #88 /review F5 — 끌 수 없는 확인증 감사 기록(가액 변경 · 파기)도 정리할 수 없다.
describe("isPrunableActionType", () => {
  it.each(["action_log_prune", "cert_view", "mask_reveal", "cert_correct", "cert_prize_value", "cert_purge", "document_reopen"])("%s는 정리할 수 없다", (type) => {
    expect(isPrunableActionType(type)).toBe(false);
  });

  it.each(["document_create", "login", "excel_export"])("%s는 정리할 수 있다", (type) => {
    expect(isPrunableActionType(type)).toBe(true);
  });

  // 07.2-19(D-7216): 완료 되돌리기 사유(document_reopen)는 결재선 끝 줄의 유일한 원천이라 정리로도 지우지 않는다.
  it("정리할 수 없는 종류는 일곱이다", () => {
    expect([...UNPRUNABLE_ACTION_TYPES].sort()).toEqual([
      "action_log_prune",
      "cert_correct",
      "cert_prize_value",
      "cert_purge",
      "cert_view",
      "document_reopen",
      "mask_reveal",
    ]);
  });
});
