import { describe, expect, it } from "vitest";
import { buildConflictMessage, isApprovalParty } from "@/domain/approvals/conflict-message";

// 04.1-02 Task 3: 동시 처리 거부 문구(UI-SPEC Copywriting 「거부 — 동시 처리」 원문과 글자 단위로 같다)와
// 관련자 판정(ENG-6 · D1 — 상세 문구를 받을 자격).

const at = new Date("2026-09-18T05:01:00Z"); // 서울 14:01

describe("buildConflictMessage", () => {
  it.each([
    [{ status: "withdrawn", round: 1, actorName: "박서연", at, attempted: "approve" }, "박서연이 14:01에 회수함 · 새로 고침"],
    [{ status: "in_review", round: 1, actorName: "이수아", at, attempted: "withdraw" }, "이수아가 14:01에 승인함 · 새로 고침"],
    [{ status: "rejected", round: 1, actorName: "김팀장", at, attempted: "approve" }, "김팀장이 14:01에 반려함 · 새로 고침"],
    [{ status: "approved", round: 1, actorName: "최대표", at, attempted: "withdraw" }, "최종 승인됨 · 새로 고침"],
    [{ status: "submitted", round: 2, actorName: "박서연", at, attempted: "approve" }, "박서연이 14:01에 다시 신청함 · 새로 고침"],
    [{ status: "submitted", round: 1, actorName: "박서연", at, attempted: "approve" }, "지금 담당이 아님 · 새로 고침"],
    [{ status: "draft", round: 1, actorName: "박서연", at, attempted: "approve" }, "지금 담당이 아님 · 새로 고침"],
  ] as const)("%o → %s", (input, expected) => {
    expect(buildConflictMessage(input)).toBe(expected);
  });

  it("최종 승인 뒤 승인 · 반려 시도(같은 자리 경주에서 진 쪽)는 누가 언제 승인했는지를 받는다", () => {
    expect(buildConflictMessage({ status: "approved", round: 1, actorName: "최대표", at, attempted: "approve" })).toBe(
      "최대표가 14:01에 승인함 · 새로 고침",
    );
  });

  it("조사 — 받침 없는 이름은 가, 있는 이름은 이, 한글이 아닌 끝 글자는 이", () => {
    expect(buildConflictMessage({ status: "in_review", round: 1, actorName: "이수아", at, attempted: "approve" })).toMatch(/^이수아가 /);
    expect(buildConflictMessage({ status: "in_review", round: 1, actorName: "김팀장", at, attempted: "approve" })).toMatch(/^김팀장이 /);
    expect(buildConflictMessage({ status: "in_review", round: 1, actorName: "Kim", at, attempted: "approve" })).toMatch(/^Kim이 /);
  });

  it("이름이 없으면 사람 · 시각 없이 지금 담당이 아님", () => {
    expect(buildConflictMessage({ status: "in_review", round: 1, actorName: null, at, attempted: "approve" })).toBe(
      "지금 담당이 아님 · 새로 고침",
    );
  });
});

describe("isApprovalParty (ENG-6 · D1)", () => {
  const sets = { drafterId: "drafter", actedByIds: ["lead-round1"], currentHolderIds: ["holder"] };

  it.each([
    ["기안자", "drafter", sets, true],
    ["차수 1에서만 처리한 사람(차수 2 진행 중)", "lead-round1", sets, true],
    ["지금 차수 단계의 담당", "holder", sets, true],
    ["이전 차수 담당이었으나 처리하지 않았고 지금 담당이 아닌 사람", "old-holder", sets, false],
    ["무관한 사람", "stranger", sets, false],
    ["빈 집합들 + 무관한 사람", "stranger", { drafterId: "drafter", actedByIds: [], currentHolderIds: [] }, false],
  ])("%s → %s", (_label, viewerId, input, expected) => {
    expect(isApprovalParty(viewerId, input)).toBe(expected);
  });
});
