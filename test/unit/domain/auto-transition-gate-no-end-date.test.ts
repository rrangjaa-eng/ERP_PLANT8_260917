import { describe, expect, it, vi } from "vitest";
import type { DbOrTx } from "@/repositories/document-counters";
import type { ProjectRow } from "@/repositories/projects";
import type { ProjectGateDeps } from "@/domain/projects/auto-transition";

// gate를 「항상 허용」으로 대체해 규칙 결함(허용인데 종료일 없음)을 만든다. 실제 규칙은 종료일 없음을
// 거부하므로 이 상황은 다른 방법으로 만들 수 없다 — 그래서 gate 모듈만 이 파일에서 대체한다(구현 무수정).
vi.mock("@/domain/rules/gate", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/domain/rules/gate")>();
  return { ...original, gate: () => Promise.resolve({ allowed: true }) };
});

const { loadProjectForGate } = await import("@/domain/projects/auto-transition");

const FAKE_TX = {} as DbOrTx;

describe("loadProjectForGate — 규칙 결함 fail-closed (D-76 리뷰 ①)", () => {
  it("규칙이 허용했는데 종료일이 없으면 project.auto_settle_gate_no_end_date로 던지고 쓰지도 로그도 남기지 않는다", async () => {
    const row = { id: "p", status: "in_progress", endDate: null, archivedAt: null } as ProjectRow;
    const updateStatus = vi.fn();
    const recordAction = vi.fn();
    const deps: Partial<ProjectGateDeps> = {
      lockProject: () => Promise.resolve(row),
      updateStatus,
      recordAction,
      findLatestAction: vi.fn(),
    };

    await expect(
      loadProjectForGate({ id: "lead", roleId: "role-team-lead" }, "p", { now: () => new Date("2026-09-17T15:00:00Z"), tx: FAKE_TX }, deps),
    ).rejects.toThrow("project.auto_settle_gate_no_end_date");
    expect(updateStatus).not.toHaveBeenCalled();
    expect(recordAction).not.toHaveBeenCalled();
  });
});
