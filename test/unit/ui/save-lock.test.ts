import { describe, expect, it } from "vitest";
import { isGridActionAllowed, type GridAction } from "@/ui/table/save-lock";

// 04-49(DR-3 · 계약 3) — 저장 요청 동안 격자는 보이되 편집에 들어가지 않는다. 이동·범위 선택·복사만 된다.
const EDITING_ACTIONS: GridAction[] = ["enterEdit", "typeChar", "paste", "deleteCell", "deleteRow", "newRow", "duplicateRow", "moveRow", "save"];
const VIEWING_ACTIONS: GridAction[] = ["move", "select", "copy"];

describe("isGridActionAllowed", () => {
  it("저장 중(saveLocked)이면 편집 진입·구조·저장 동작은 거짓, 이동·범위 선택·복사는 참이다", () => {
    for (const action of EDITING_ACTIONS) expect(isGridActionAllowed(action, { saveLocked: true }), action).toBe(false);
    for (const action of VIEWING_ACTIONS) expect(isGridActionAllowed(action, { saveLocked: true }), action).toBe(true);
  });

  it("저장 중이 아니면 모든 동작이 참이다", () => {
    for (const action of [...EDITING_ACTIONS, ...VIEWING_ACTIONS]) {
      expect(isGridActionAllowed(action, { saveLocked: false }), action).toBe(true);
    }
  });
});
