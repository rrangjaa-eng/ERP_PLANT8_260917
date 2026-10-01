import { describe, expect, it } from "vitest";
import { UNPRUNABLE_ACTION_TYPES, isPrunableActionType } from "@/domain/action-log/prune-scope";

// 04.3-14 사용자 결정 5936870579 — 행동 로그 「정리」는 정리 흔적(action_log_prune)과 개인정보 접속기록 셋을 표시할 수 없다.
describe("isPrunableActionType", () => {
  it.each(["action_log_prune", "cert_view", "mask_reveal", "cert_correct"])("%s는 정리할 수 없다", (type) => {
    expect(isPrunableActionType(type)).toBe(false);
  });

  it.each(["document_create", "login", "excel_export", "cert_purge"])("%s는 정리할 수 있다", (type) => {
    expect(isPrunableActionType(type)).toBe(true);
  });

  it("정리할 수 없는 종류는 넷이다", () => {
    expect([...UNPRUNABLE_ACTION_TYPES].sort()).toEqual(["action_log_prune", "cert_correct", "cert_view", "mask_reveal"]);
  });
});
