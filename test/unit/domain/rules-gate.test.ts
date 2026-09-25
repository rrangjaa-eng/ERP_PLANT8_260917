import { afterEach, describe, expect, it, vi } from "vitest";
import { gate, registerGateRule, listGateRules, UnknownGateRuleError, GateBlockedError } from "@/domain/rules/gate";
import "@/domain/rules/register";
import { denyWrite, type DenyWriteIds } from "@/domain/rules/deny-write";

// Phase 4 Task 2 ⑫ — 등록·판정·미등록 규칙 오류. register.ts를 side-effect
// import해 실제 등록된 `project.line-edit`(04-06 — 옛 이진 규칙 교체)로 판정을 단언한다.
describe("domain/rules/gate", () => {
  it("등록된 규칙 이름으로 부르면 판정 함수를 그대로 실행한다", async () => {
    registerGateRule<{ id: string }, { allow: boolean }>({
      name: "test.always-configurable",
      check: (_doc, ctx) => (ctx.allow ? { allowed: true } : { allowed: false, reason: "막힘" }),
    });

    await expect(gate({ id: "1" }, "test.always-configurable", { allow: true })).resolves.toEqual({
      allowed: true,
    });
    await expect(gate({ id: "1" }, "test.always-configurable", { allow: false })).resolves.toEqual({
      allowed: false,
      reason: "막힘",
    });
  });

  it("등록되지 않은 규칙 이름으로 부르면 조용히 통과하지 않고 던진다", async () => {
    await expect(gate({}, "없는-규칙", {})).rejects.toBeInstanceOf(UnknownGateRuleError);
  });

  it("listGateRules가 등록된 규칙 이름을 돌려준다 — 옛 이진 규칙 project.completed-lock은 없다", () => {
    expect(listGateRules()).toContain("project.line-edit");
    expect(listGateRules()).not.toContain("project.completed-lock");
  });

  describe("project.line-edit (D-47·D-45·D-75)", () => {
    it("완료 상태면 「완료 · 견적 줄 잠김」으로 거부한다", async () => {
      const decision = await gate({}, "project.line-edit", { status: "completed" });
      expect(decision).toEqual({ allowed: false, reason: "완료 · 견적 줄 잠김" });
    });

    it("수주중 상태면 통과한다", async () => {
      const decision = await gate({}, "project.line-edit", { status: "bidding" });
      expect(decision).toEqual({ allowed: true });
    });

    it("진행 상태면 통과한다", async () => {
      const decision = await gate({}, "project.line-edit", { status: "in_progress" });
      expect(decision).toEqual({ allowed: true });
    });

    it("정산 상태면 통과한다(셀 범위는 04-12)", async () => {
      const decision = await gate({}, "project.line-edit", { status: "settling" });
      expect(decision).toEqual({ allowed: true });
    });

    it("미수주 상태면 잠그지 않고 통과한다(D-45)", async () => {
      const decision = await gate({}, "project.line-edit", { status: "lost" });
      expect(decision).toEqual({ allowed: true });
    });
  });
});

// 04-20 — 사람의 전환 규칙 둘의 경계.
describe("project.transition (D-46·D-79·D11)", () => {
  const allMenus = { status: true, complete: true };

  it("전이표에 없는 쌍은 「갈 수 없는 상태 · 새로 고침」", async () => {
    const decision = await gate({}, "project.transition", {
      from: "in_progress",
      to: "settling",
      actorMenus: allMenus,
      actorCoversTeam: true,
    });
    expect(decision).toEqual({ allowed: false, reason: "갈 수 없는 상태 · 새로 고침" });
  });

  it("그 쌍의 메뉴 권한이 없으면 「상태 바꾸기 권한 없음」 — 완료는 projects.complete", async () => {
    const decision = await gate({}, "project.transition", {
      from: "settling",
      to: "completed",
      actorMenus: { status: true, complete: false },
      actorCoversTeam: true,
    });
    expect(decision).toEqual({ allowed: false, reason: "상태 바꾸기 권한 없음" });
  });

  it("권한이 있어도 팀 범위 밖이면 「다른 팀 프로젝트 · 상태 바꾸기 권한 없음」", async () => {
    const decision = await gate({}, "project.transition", {
      from: "bidding",
      to: "lost",
      actorMenus: { status: true, complete: false },
      actorCoversTeam: false,
    });
    expect(decision).toEqual({ allowed: false, reason: "다른 팀 프로젝트 · 상태 바꾸기 권한 없음" });
  });

  it("쌍·권한·팀 범위가 맞으면 통과한다", async () => {
    const decision = await gate({}, "project.transition", {
      from: "bidding",
      to: "in_progress",
      actorMenus: { status: true, complete: false },
      actorCoversTeam: true,
    });
    expect(decision).toEqual({ allowed: true });
  });
});

describe("project.start-date-required (D-82)", () => {
  it("진행으로 가는데 시작일이 없으면 「시작일 없음 · 기간 적기」", async () => {
    const decision = await gate({}, "project.start-date-required", { to: "in_progress", startDate: null });
    expect(decision).toEqual({ allowed: false, reason: "시작일 없음 · 기간 적기" });
  });

  it("시작일이 있으면 통과, 진행이 아닌 목적지는 시작일 없이 통과", async () => {
    await expect(gate({}, "project.start-date-required", { to: "in_progress", startDate: "2026-10-01" })).resolves.toEqual({
      allowed: true,
    });
    await expect(gate({}, "project.start-date-required", { to: "lost", startDate: null })).resolves.toEqual({
      allowed: true,
    });
  });
});

describe("denyWrite — 거부 운영 로그 한 함수 (D19 · 엔지 리뷰 B)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("write.denied 한 줄에 viewerId·rule·errorName과 허용 목록 키만 싣고 오류를 그대로 던진다", () => {
    const lines: string[] = [];
    vi.spyOn(console, "log").mockImplementation((line: string) => {
      lines.push(line);
    });
    const err = new GateBlockedError("상태 바꾸기 권한 없음 · 금액 1,000,000원");
    // 캐스팅으로 허용 목록 밖 금액 키를 넣어도 로그에 실리지 않아야 한다.
    const ids = { projectId: "p-1", from: "bidding", to: "in_progress", amountKrw: 1_000_000 } as DenyWriteIds;

    expect(() => denyWrite({ id: "u-1", roleId: "role-pm" }, "project.transition", ids, err)).toThrow(err);

    expect(lines).toHaveLength(1);
    const entry = JSON.parse(lines[0] ?? "{}") as Record<string, unknown>;
    expect(entry.event).toBe("write.denied");
    expect(entry.severity).toBe("WARNING");
    const { severity, message, time, event, ...fields } = entry;
    void severity;
    void message;
    void time;
    void event;
    expect(fields).toEqual({
      viewerId: "u-1",
      rule: "project.transition",
      errorName: "GateBlockedError",
      projectId: "p-1",
      from: "bidding",
      to: "in_progress",
    });
    expect(JSON.stringify(entry)).not.toContain("1,000,000");
    expect(entry).not.toHaveProperty("amountKrw");
  });
});
