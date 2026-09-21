import { describe, expect, it } from "vitest";
import {
  buildCellKey,
  buildInitialCells,
  resyncCells,
  type PermissionGridColumn,
  type PermissionGridRow,
} from "@/ui/permission-grid/PermissionGrid";

// 03-REVIEW.md M-1 — PermissionGrid의 `cells`는 useState(() =>
// buildInitialCells(...))로 딱 한 번만 만들어진다. readPermissionGrid()가
// 일시적으로 실패하면 page.tsx는 rows=[] columns=[] values={}로 렌더하고,
// 사용자가 "다시 시도"를 눌러 router.refresh()해도 클라이언트 컴포넌트는
// 리마운트되지 않아 cells가 빈 채로 남는다 — 실제 매트릭스가 도착해도
// 격자가 전부 미체크로 그려진다(관리자가 "권한이 전부 날아갔다"고 오인해
// 잘못 체크할 위험). resyncCells는 rows/columns/values가 바뀔 때마다
// cells를 다시 만들되, 진행 중이거나 실패한 셀(status !== "idle")의
// 낙관적 상태는 무관한 리렌더에 지우지 않고 그대로 넘긴다.
describe("resyncCells — M-1 회귀: 재조회 후 매트릭스 재동기화", () => {
  const rows: PermissionGridRow[] = [{ id: "role-a", label: "역할 A" }];
  const columns: PermissionGridColumn[] = [{ id: "menu::view", label: "보기" }];
  const key = buildCellKey("role-a", "menu::view");

  it("빈 초기 상태(prev={})에서 뒤늦게 도착한 values를 그대로 반영한다 (재시도 시나리오)", () => {
    const prev = {}; // 오류 화면 첫 마운트 때 rows=[] values={}로 만들어진 초기 cells
    const next = resyncCells(prev, rows, columns, { [key]: true });

    expect(next[key]?.checked).toBe(true);
    expect(next[key]?.status).toBe("idle");
  });

  it("idle 상태의 셀은 최신 서버 값으로 갱신된다", () => {
    const prev = buildInitialCells(rows, columns, { [key]: false });
    const next = resyncCells(prev, rows, columns, { [key]: true });

    expect(next[key]?.checked).toBe(true);
  });

  it("저장 진행 중(delayed)인 셀은 낙관적 상태를 지우지 않고 그대로 넘긴다", () => {
    const prev = { [key]: { checked: true, status: "delayed" as const } };
    // values에는 아직 반영 전 값(false)이 와도 진행 중 셀은 건드리지 않는다.
    const next = resyncCells(prev, rows, columns, { [key]: false });

    expect(next[key]).toEqual({ checked: true, status: "delayed" });
  });

  it("저장 실패(error)로 되돌려진 셀은 이유 문구까지 그대로 유지된다", () => {
    const prev = {
      [key]: { checked: false, status: "error" as const, reason: "저장하지 못했습니다 · 다시 시도" },
    };
    const next = resyncCells(prev, rows, columns, { [key]: true });

    expect(next[key]).toEqual({
      checked: false,
      status: "error",
      reason: "저장하지 못했습니다 · 다시 시도",
    });
  });
});
