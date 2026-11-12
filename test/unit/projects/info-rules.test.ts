import { describe, expect, it } from "vitest";
import { infoEditRights, pmEligible, validateInfoChange, type InfoValues } from "@/domain/projects/info-rules";

// 07.2-17(PU5 · D-7217~D-7219) — 정보 면 4칸(행사명 · 고객사 · 담당 팀 · 담당 PM)의 순수 판정. 화면과 서버가 같은 함수를 부른다.

const BEFORE: InfoValues = { name: "가을 팝업", clientId: "client-a", teamId: "team-1", pmUserId: "pm-a" };

describe("infoEditRights", () => {
  it("projects.info 쓰기가 없으면 담당 PM · 팀장이라도 none", () => {
    expect(infoEditRights({ canEditInfo: false, isAssignedPm: true, actorCoversTeam: true })).toBe("none");
  });
  it("쓰기 + 담당 PM이면 edit", () => {
    expect(infoEditRights({ canEditInfo: true, isAssignedPm: true, actorCoversTeam: false })).toBe("edit");
  });
  it("쓰기 + 업무 범위가 프로젝트 팀을 덮으면 edit", () => {
    expect(infoEditRights({ canEditInfo: true, isAssignedPm: false, actorCoversTeam: true })).toBe("edit");
  });
  it("쓰기만 있고 담당 PM도 범위도 아니면 none", () => {
    expect(infoEditRights({ canEditInfo: true, isAssignedPm: false, actorCoversTeam: false })).toBe("none");
  });
});

describe("pmEligible", () => {
  it("바뀐 팀에 오늘 발령된 사람이면 자격", () => {
    expect(pmEligible({ teamIdAfter: "team-1", memberTeamId: "team-1", participant: false })).toBe(true);
  });
  it("다른 팀이라도 프로젝트 참여자면 자격", () => {
    expect(pmEligible({ teamIdAfter: "team-1", memberTeamId: "team-2", participant: true })).toBe(true);
  });
  it("다른 팀 · 소속 없음이고 참여자가 아니면 자격 없음", () => {
    expect(pmEligible({ teamIdAfter: "team-1", memberTeamId: "team-2", participant: false })).toBe(false);
    expect(pmEligible({ teamIdAfter: "team-1", memberTeamId: null, participant: false })).toBe(false);
  });
});

describe("validateInfoChange", () => {
  it("바뀐 것이 없으면 오류 0", () => {
    expect(validateInfoChange({ before: BEFORE, after: BEFORE, moneyCount: 3, pmEligibleAfter: false })).toEqual([]);
  });
  it("행사명이 비거나 공백뿐이면 거부", () => {
    expect(validateInfoChange({ before: BEFORE, after: { ...BEFORE, name: "   " }, moneyCount: 0, pmEligibleAfter: true })).toEqual([
      { field: "name", reason: "프로젝트명 필요 · 프로젝트명 입력" },
    ]);
  });
  it("돈 문서가 붙으면 고객사 · 담당 팀 변경을 거부한다", () => {
    expect(
      validateInfoChange({ before: BEFORE, after: { ...BEFORE, clientId: "client-b", teamId: "team-2" }, moneyCount: 1, pmEligibleAfter: true }),
    ).toEqual([
      { field: "client", reason: "고객사 · 담당 팀 잠김 · 돈 문서 연결" },
      { field: "team", reason: "고객사 · 담당 팀 잠김 · 돈 문서 연결" },
    ]);
  });
  it("돈 문서 0건이면 고객사 · 담당 팀을 바꾼다", () => {
    expect(validateInfoChange({ before: BEFORE, after: { ...BEFORE, clientId: "client-b", teamId: "team-2" }, moneyCount: 0, pmEligibleAfter: true })).toEqual([]);
  });
  it("돈 문서가 붙어도 행사명 · PM은 바꾼다", () => {
    expect(validateInfoChange({ before: BEFORE, after: { ...BEFORE, name: "겨울 팝업", pmUserId: "pm-b" }, moneyCount: 2, pmEligibleAfter: true })).toEqual([]);
  });
  it("팀만 바꿔 지금 PM이 자격을 잃으면 PM 칸 오류", () => {
    expect(validateInfoChange({ before: BEFORE, after: { ...BEFORE, teamId: "team-2" }, moneyCount: 0, pmEligibleAfter: false })).toEqual([
      { field: "pm", reason: "담당 PM 소속 아님 · PM 다시 고르기" },
    ]);
  });
  it("자격 없는 PM으로 바꾸면 PM 칸 오류", () => {
    expect(validateInfoChange({ before: BEFORE, after: { ...BEFORE, pmUserId: "pm-x" }, moneyCount: 0, pmEligibleAfter: false })).toEqual([
      { field: "pm", reason: "담당 PM 소속 아님 · PM 다시 고르기" },
    ]);
  });
  it("행사명만 바꾸면 기존 PM 자격은 다시 재지 않는다", () => {
    expect(validateInfoChange({ before: BEFORE, after: { ...BEFORE, name: "겨울 팝업" }, moneyCount: 0, pmEligibleAfter: false })).toEqual([]);
  });
});
