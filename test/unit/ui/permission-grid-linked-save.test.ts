import { describe, expect, it } from "vitest";
import { applyLinkedSave, buildCellKey } from "@/ui/permission-grid/PermissionGrid";

// 07-21 Codex 델타 P3 — commitLinked가 서버 `resulting`을 settleLinkedCells에 넘기는 한 줄(a2b51e7f)을 지킨다.
// 옛 코드는 `changed`만 넘겨, 다른 관리자가 이미 켠 딸린 칸(changed에 없음)을 누르기 전 값(꺼짐)으로 되돌려 DB와 다르게 보였다.
describe("applyLinkedSave — 저장 응답을 칸 상태로 확정", () => {
  const row = "role-a";
  const write = buildCellKey(row, "vendors::write");
  const view = buildCellKey(row, "vendors::view");
  const saving = {
    [write]: { checked: true, status: "saving" as const },
    [view]: { checked: true, status: "saving" as const },
  };

  it("changed에 없는 딸린 칸도 resulting 값(켬)으로 남긴다", () => {
    const { cells } = applyLinkedSave(saving, row, write, [view], true, {
      changed: [{ columnId: "vendors::write", checked: true }],
      resulting: [
        { columnId: "vendors::write", checked: true },
        { columnId: "vendors::view", checked: true },
      ],
    });

    expect(cells[write]).toEqual({ checked: true, status: "idle" });
    expect(cells[view]).toEqual({ checked: true, status: "idle" });
  });

  it("결과 줄용 changes는 changed만으로 만든다", () => {
    const { changes } = applyLinkedSave(saving, row, write, [view], true, {
      changed: [{ columnId: "vendors::write", checked: true }],
      resulting: [
        { columnId: "vendors::write", checked: true },
        { columnId: "vendors::view", checked: true },
      ],
    });

    expect(changes).toEqual([{ columnId: "vendors::write", before: false, after: true }]);
  });

  it("응답이 없으면 요청 칸만 next로 확정하고 예측 칸은 누르기 전 값", () => {
    const { cells, changes } = applyLinkedSave(saving, row, write, [view], true, undefined);

    expect(cells[write]).toEqual({ checked: true, status: "idle" });
    expect(cells[view]).toEqual({ checked: false, status: "idle" });
    expect(changes).toEqual([]);
  });
});
