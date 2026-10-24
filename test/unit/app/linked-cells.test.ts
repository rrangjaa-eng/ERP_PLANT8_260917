import { describe, expect, it } from "vitest";
import { MENUS, menuActions } from "@/domain/permissions/menus";
import { dependentCells, permissionRequiresMap } from "@/domain/permissions/matrix";
import { linkedCells, revertSteps } from "@/app/(app)/admin/permissions/linked-cells";

// 07-21(R7 화면 · SYSTEM 개정 8 · K4): 권한표 딸린 칸 예측 · 결과 줄 `되돌리기` 순서. 시험만 07-15 서버 규칙(dependentCells)을 같이 import한다.

const requires = permissionRequiresMap();

describe("linkedCells = 07-15 dependentCells(모든 메뉴 × 칸 × 켬/끔)", () => {
  for (const menu of MENUS) {
    for (const action of menuActions(menu)) {
      for (const next of [true, false]) {
        it(`${menu.key}::${action} ${next ? "켬" : "끔"}`, () => {
          const expected = dependentCells(menu.key, action, next).map((cell) => `${cell.menu}::${cell.action}`);
          expect(new Set(linkedCells(requires, `${menu.key}::${action}`, next))).toEqual(new Set(expected));
        });
      }
    }
  }
});

describe("revertSteps — 그 누름으로 실제 바뀐 칸만, 끔은 딸린 쪽 먼저 · 켬은 필요한 쪽 먼저", () => {
  // 세 칸 있는 메뉴 하나(보기 · 쓰기 · 승인) — 07-15 지도에서 고른다.
  const menu = MENUS.find((candidate) => menuActions(candidate).length === 3);
  if (!menu) throw new Error("세 칸 메뉴 없음");
  const view = `${menu.key}::view`;
  const write = `${menu.key}::write`;
  const approve = `${menu.key}::approve`;

  it("보기 켬 · 쓰기 끔 · 승인 켬에서 쓰기 켬(changed = 쓰기) → [쓰기 끔]뿐", () => {
    expect(revertSteps(requires, [{ columnId: write, before: false, after: true }])).toEqual([{ columnId: write, next: false }]);
  });

  it("모두 끔에서 쓰기 켬(changed = 쓰기 · 보기) → [쓰기 끔, 보기 끔]", () => {
    expect(
      revertSteps(requires, [
        { columnId: view, before: false, after: true },
        { columnId: write, before: false, after: true },
      ]),
    ).toEqual([
      { columnId: write, next: false },
      { columnId: view, next: false },
    ]);
  });

  it("보기 끔(changed = 보기 · 쓰기 · 승인) → [보기 켬, 쓰기 켬, 승인 켬]", () => {
    expect(
      revertSteps(requires, [
        { columnId: write, before: true, after: false },
        { columnId: approve, before: true, after: false },
        { columnId: view, before: true, after: false },
      ]),
    ).toEqual([
      { columnId: view, next: true },
      { columnId: write, next: true },
      { columnId: approve, next: true },
    ]);
  });

  it("메뉴 건너는 딸림 — 계좌 쓰기 켬(거래처 보기도 켬) → [계좌 쓰기 끔, 거래처 보기 끔]", () => {
    expect(
      revertSteps(requires, [
        { columnId: "admin.vendors::view", before: false, after: true },
        { columnId: "vendors.account::write", before: false, after: true },
      ]),
    ).toEqual([
      { columnId: "vendors.account::write", next: false },
      { columnId: "admin.vendors::view", next: false },
    ]);
  });

  it("changed 밖 칸은 단계에 없다", () => {
    const steps = revertSteps(requires, [{ columnId: approve, before: false, after: true }]);
    expect(steps.map((step) => step.columnId)).toEqual([approve]);
  });
});
