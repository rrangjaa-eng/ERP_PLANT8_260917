import { describe, expect, it } from "vitest";
import { canWriteExpenseOnProject } from "@/domain/expenses/write-gate";

// 06.2-10(D-6214): 지출결의 쓰기 = 담당 PM ∨ 업무 범위가 덮음 ∨ 살아 있는 참여 — 네 입구가 이 함수 하나를 쓴다.
const P = "project-p";
const OTHER_P = "project-other";
const A = "user-a";
const B = "user-b";
const T1 = "team-1";
const T2 = "team-2";
const project = { id: P, pmUserId: A, teamId: T1 };
const none = new Set<string>();

describe("canWriteExpenseOnProject — 담당 PM ∨ 업무 범위 ∨ 참여 (D-6214)", () => {
  it("담당 PM은 업무 범위가 프로젝트 팀을 덮지 않아도 쓴다", () => {
    expect(canWriteExpenseOnProject(project, { viewerId: A, teamScope: { workScope: "team", teamId: T2 }, memberProjectIds: none })).toBe(true);
  });

  it("업무 범위가 프로젝트 팀을 덮으면 담당 PM이 아니어도 쓴다", () => {
    expect(canWriteExpenseOnProject(project, { viewerId: B, teamScope: { workScope: "team", teamId: T1 }, memberProjectIds: none })).toBe(true);
  });

  it("그 프로젝트에 살아 있는 참여 줄이 있으면 다른 팀이어도 쓴다", () => {
    expect(canWriteExpenseOnProject(project, { viewerId: B, teamScope: { workScope: "team", teamId: T2 }, memberProjectIds: new Set([P]) })).toBe(true);
  });

  it("다른 프로젝트의 참여는 이 프로젝트 쓰기 권리가 아니다", () => {
    expect(canWriteExpenseOnProject(project, { viewerId: B, teamScope: { workScope: "team", teamId: T2 }, memberProjectIds: new Set([OTHER_P]) })).toBe(false);
  });

  it("전사 업무 범위는 어느 프로젝트나 쓴다", () => {
    expect(canWriteExpenseOnProject(project, { viewerId: B, teamScope: { workScope: "company", teamId: null }, memberProjectIds: none })).toBe(true);
  });

  it("발령 없는 사람(팀 null)은 PM · 참여가 아니면 쓰지 못한다", () => {
    expect(canWriteExpenseOnProject(project, { viewerId: B, teamScope: { workScope: "team", teamId: null }, memberProjectIds: none })).toBe(false);
  });
});
