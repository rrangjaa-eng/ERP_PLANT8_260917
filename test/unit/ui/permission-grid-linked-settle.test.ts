import { describe, expect, it } from "vitest";
import { buildCellKey, settleLinkedCells } from "@/ui/permission-grid/PermissionGrid";

// 0721-gates /review P3-1 — 딸린 칸 저장이 성공하면 요청 칸 + 예측 칸을 모두 next로 두던 탓에,
// 서버 `changed`에 없는 예측 칸(서버가 실제로 바꾸지 않은 칸)이 새로고침 전까지 틀린 값으로 남았다.
// 예측 칸은 서버가 바꿨다고 돌려준 것만 바뀌고, 나머지는 누르기 전 값으로 돌아가야 한다.
describe("settleLinkedCells — 서버 changed로 예측 칸 확정", () => {
  const row = "role-a";
  const requested = buildCellKey(row, "vendors::view");
  const predictedA = buildCellKey(row, "vendors::write");
  const predictedB = buildCellKey(row, "vendors::approve");

  it("서버 changed에 없는 예측 칸은 누르기 전 값으로 되돌린다", () => {
    const prev = {
      [requested]: { checked: false, status: "saving" as const },
      [predictedA]: { checked: false, status: "saving" as const },
      [predictedB]: { checked: false, status: "saving" as const },
    };
    // 끄기를 눌렀다(next=false) — 예측 칸 둘은 누르기 전 true였다. 서버는 A만 같이 껐다.
    const next = settleLinkedCells(prev, row, requested, [predictedA, predictedB], false, [
      { columnId: "vendors::view", checked: false },
      { columnId: "vendors::write", checked: false },
    ]);

    expect(next[requested]).toEqual({ checked: false, status: "idle" });
    expect(next[predictedA]).toEqual({ checked: false, status: "idle" });
    expect(next[predictedB]).toEqual({ checked: true, status: "idle" });
  });

  it("서버 changed가 비어도 요청 칸은 next로 확정한다", () => {
    const prev = {
      [requested]: { checked: true, status: "saving" as const },
      [predictedA]: { checked: true, status: "saving" as const },
    };
    const next = settleLinkedCells(prev, row, requested, [predictedA], true, []);

    expect(next[requested]).toEqual({ checked: true, status: "idle" });
    expect(next[predictedA]).toEqual({ checked: false, status: "idle" });
  });

  it("다른 관리자가 이미 켠 딸린 칸은 changed에 없어도 resulting 값(켬)으로 확정한다(07-21 Codex P2)", () => {
    const write = buildCellKey(row, "vendors::write");
    const view = buildCellKey(row, "vendors::view");
    const prev = {
      [write]: { checked: true, status: "saving" as const },
      [view]: { checked: true, status: "saving" as const },
    };
    // 쓰기 켬(next=true) — 화면은 보기가 꺼진 줄로 알았지만 DB에선 이미 켜져 있어 서버 changed는 쓰기뿐, resulting은 둘 다 켬.
    const next = settleLinkedCells(prev, row, write, [view], true, [
      { columnId: "vendors::write", checked: true },
      { columnId: "vendors::view", checked: true },
    ]);

    expect(next[write]).toEqual({ checked: true, status: "idle" });
    expect(next[view]).toEqual({ checked: true, status: "idle" });
  });
});
