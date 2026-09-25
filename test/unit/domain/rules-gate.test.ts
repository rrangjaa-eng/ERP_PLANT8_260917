import { afterEach, describe, expect, it, vi } from "vitest";
import { gate, registerGateRule, listGateRules, UnknownGateRuleError, GateBlockedError } from "@/domain/rules/gate";
import "@/domain/rules/register";
import type { ProjectLineEditCtx } from "@/domain/rules/register";
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

  // 04-12(D-78 · 사용자 D10·D12) — 셀 단위 판정. 바뀐 칸마다 lineCellEditability를 본다.
  describe("project.line-edit (D-47·D-45·D-75·D-78)", () => {
    const update = (fields: string[]) => ({ kind: "update" as const, fields });
    // 04-13 — 견적 줄(quote)을 `projects` 쓰기가 있는 사람이 고칠 때(조정 권한 없음).
    const actor = { lineKind: "quote" as const, actorCanWrite: true, actorCanAdjust: false };
    const ctx = (status: string, fields: string[], linked: { hasLinkedDocuments: boolean; linkedDocumentNumber?: string } = { hasLinkedDocuments: false }) => ({
      status,
      ...actor,
      ...linked,
      change: update(fields),
    });

    it("정산 + 실행가만 바꾼 저장은 통과한다", async () => {
      await expect(gate({}, "project.line-edit", ctx("settling", ["execution"]))).resolves.toEqual({ allowed: true });
    });

    it("정산 + 실행가·단가를 바꾸면 「정산 · 실행가와 새 줄만」", async () => {
      await expect(gate({}, "project.line-edit", ctx("settling", ["execution", "unitPrice"]))).resolves.toEqual({
        allowed: false,
        reason: "정산 · 실행가와 새 줄만",
      });
    });

    it("완료 + 비고만 바꿔도 「완료 · 견적 줄 잠김」", async () => {
      await expect(gate({}, "project.line-edit", ctx("completed", ["note"]))).resolves.toEqual({
        allowed: false,
        reason: "완료 · 견적 줄 잠김",
      });
    });

    it("진행 + 연결 문서 + 수량이면 「지출결의 {번호} 연결됨 · 고치려면 새 차수」", async () => {
      const decision = await gate(
        {},
        "project.line-edit",
        ctx("in_progress", ["quantity"], { hasLinkedDocuments: true, linkedDocumentNumber: "26001-0004" }),
      );
      expect(decision).toEqual({ allowed: false, reason: "지출결의 26001-0004 연결됨 · 고치려면 새 차수" });
    });

    it("수주중·진행·미수주는 모든 칸이 통과한다(D-45)", async () => {
      for (const status of ["bidding", "in_progress", "lost"]) {
        await expect(
          gate({}, "project.line-edit", ctx(status, ["subcategory", "itemName", "quantity", "unitPrice", "execution", "note"])),
        ).resolves.toEqual({ allowed: true });
      }
    });

    it("완료에서 새 줄(insert)은 「완료 · 견적 줄 잠김」", async () => {
      await expect(
        gate({}, "project.line-edit", { status: "completed", ...actor, hasLinkedDocuments: false, change: { kind: "insert", quoteCellsZero: true } }),
      ).resolves.toEqual({ allowed: false, reason: "완료 · 견적 줄 잠김" });
    });

    // 04-12 Task 2(사용자 D10·D12) — 구조 판정.
    const structural = (status: string, change: ProjectLineEditCtx["change"], hasLinkedDocuments = false) =>
      gate({}, "project.line-edit", { status, ...actor, hasLinkedDocuments, change });

    it("정산 + insert(견적 칸 0)는 통과, 견적 칸이 0이 아니면 「정산 · 새 줄은 실행가만」", async () => {
      await expect(structural("settling", { kind: "insert", quoteCellsZero: true })).resolves.toEqual({ allowed: true });
      await expect(structural("settling", { kind: "insert", quoteCellsZero: false })).resolves.toEqual({
        allowed: false,
        reason: "정산 · 새 줄은 실행가만",
      });
    });

    it("정산 + archive·reorder·duplicate는 「정산 · 줄 삭제·이동 없음」", async () => {
      for (const kind of ["archive", "reorder", "duplicate"] as const) {
        await expect(structural("settling", { kind })).resolves.toEqual({ allowed: false, reason: "정산 · 줄 삭제·이동 없음" });
      }
    });

    it("완료 + archive·reorder·duplicate는 「완료 · 견적 줄 잠김」", async () => {
      for (const kind of ["archive", "reorder", "duplicate"] as const) {
        await expect(structural("completed", { kind })).resolves.toEqual({ allowed: false, reason: "완료 · 견적 줄 잠김" });
      }
    });

    it("진행 + 연결 문서 줄 archive는 「연결 문서 있음 · 삭제 대신 취소」, 연결 문서가 없으면 통과", async () => {
      await expect(structural("in_progress", { kind: "archive" }, true)).resolves.toEqual({
        allowed: false,
        reason: "연결 문서 있음 · 삭제 대신 취소",
      });
      await expect(structural("in_progress", { kind: "archive" })).resolves.toEqual({ allowed: true });
    });

    // 04-12 Task 3(A-19 · OV-2) — 보관함 복원은 그 상태에서 줄을 더하는 것과 같다.
    it("복원: 완료는 「완료 · 견적 줄 잠김」, 정산은 견적가 0일 때만, 진행은 통과", async () => {
      await expect(structural("completed", { kind: "restore", quoteAmountZero: true })).resolves.toEqual({
        allowed: false,
        reason: "완료 · 견적 줄 잠김",
      });
      await expect(structural("settling", { kind: "restore", quoteAmountZero: false })).resolves.toEqual({
        allowed: false,
        reason: "정산 · 새 줄은 실행가만",
      });
      await expect(structural("settling", { kind: "restore", quoteAmountZero: true })).resolves.toEqual({ allowed: true });
      await expect(structural("in_progress", { kind: "restore", quoteAmountZero: false })).resolves.toEqual({ allowed: true });
    });

    it("진행 + insert(견적 칸 있음)·reorder·duplicate는 통과", async () => {
      await expect(structural("in_progress", { kind: "insert", quoteCellsZero: false })).resolves.toEqual({ allowed: true });
      await expect(structural("in_progress", { kind: "reorder" })).resolves.toEqual({ allowed: true });
      await expect(structural("in_progress", { kind: "duplicate" })).resolves.toEqual({ allowed: true });
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
