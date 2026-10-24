import { describe, expect, it } from "vitest";
import { savedCells } from "@/app/(app)/admin/permissions/permission-grid-client";

// 07-21 Codex P2 — 다른 관리자가 그사이 딸린 칸을 이미 켰으면 서버는 값이 같아 그 칸을 `changed`에서 뺀다. 화면이 `changed`만 보면
// 그 칸을 누르기 전 값(꺼짐)으로 되돌려 DB와 다르게 보인다 — 응답의 `resulting`(요청 칸 + 딸린 칸의 저장 뒤 값)이 표시 값이다.
describe("savedCells — 권한표 액션 응답을 그리드 꼴로", () => {
  it("changed와 resulting을 열 id · 값으로 나눠 돌려준다", () => {
    const saved = savedCells({
      changed: [{ menu: "admin.people", action: "write", allowed: true }],
      resulting: [
        { menu: "admin.people", action: "write", allowed: true },
        { menu: "admin.people", action: "view", allowed: true },
      ],
    });

    expect(saved.changed).toEqual([{ columnId: "admin.people::write", checked: true }]);
    expect(saved.resulting).toEqual([
      { columnId: "admin.people::write", checked: true },
      { columnId: "admin.people::view", checked: true },
    ]);
  });

  it("모양이 어긋난 응답은 빈 목록", () => {
    expect(savedCells(null)).toEqual({ changed: [], resulting: [] });
    expect(savedCells({ changed: [{ menu: 1 }] })).toEqual({ changed: [], resulting: [] });
  });
});
