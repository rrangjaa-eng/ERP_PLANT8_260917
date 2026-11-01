import { describe, expect, it, vi } from "vitest";
import { viewerDivision } from "@/domain/permissions/viewer-division";
import type { Viewer } from "@/domain/viewer";

// 07.3-01(D-7311): 사람의 소속 본부 — 오늘 발령 팀의 본부(팀이 이긴다), 팀이 없으면 사람 본부 칸(보관 본부면 null).
// 07.1-07이 evidenceScopeFor 안에 둔 규칙을 그대로 옮긴 헬퍼라 deps 이름 · 결과가 그 규칙과 같다.
const viewer: Viewer = { id: "u1", roleId: "role-pm" };
const TEAM_ID = "11111111-1111-4111-8111-1111111111a1";
const ARCHIVED_TEAM_ID = "11111111-1111-4111-8111-1111111111a2";
const DIVISION_A = "11111111-1111-4111-8111-1111111111d1";
const DIVISION_B = "11111111-1111-4111-8111-1111111111d2";
const ARCHIVED_DIVISION = "11111111-1111-4111-8111-1111111111d3";

function deps(opts: { teamId?: string | null; divisionId?: string | null }) {
  return {
    findMembershipAtDate: vi.fn(() => Promise.resolve(opts.teamId ? { teamId: opts.teamId } : null)),
    // 보관된 팀도 본부는 살아 있다 — 팀 조회는 보관 여부를 거르지 않는다(evidenceScopeFor와 같음).
    findTeamById: vi.fn((_v: Viewer, id: string) =>
      Promise.resolve(id === TEAM_ID || id === ARCHIVED_TEAM_ID ? { orgUnitId: DIVISION_A } : null),
    ),
    findUserDivision: vi.fn((_v: Viewer, id: string) =>
      Promise.resolve(id === viewer.id ? { divisionId: opts.divisionId ?? null } : null),
    ),
    findOrgUnitById: vi.fn((_v: Viewer, id: string) =>
      Promise.resolve(
        id === ARCHIVED_DIVISION ? { archivedAt: new Date("2026-09-01T00:00:00Z") } : id === DIVISION_B ? { archivedAt: null } : null,
      ),
    ),
    today: () => "2026-10-27",
  };
}

describe("viewerDivision (07.3-01 D-7311)", () => {
  it("오늘 발령 팀이 있으면 팀의 본부다 — 본부 칸은 보지 않는다", async () => {
    const d = deps({ teamId: TEAM_ID, divisionId: DIVISION_B });
    expect(await viewerDivision(viewer, d)).toEqual({ teamId: TEAM_ID, orgUnitId: DIVISION_A });
    expect(d.findUserDivision).not.toHaveBeenCalled();
  });

  it("오늘 팀이 없고 본부 칸이 보관 안 된 본부면 그 본부다", async () => {
    expect(await viewerDivision(viewer, deps({ teamId: null, divisionId: DIVISION_B }))).toEqual({ teamId: null, orgUnitId: DIVISION_B });
  });

  it("본부 칸이 보관된 본부면 null이다", async () => {
    expect(await viewerDivision(viewer, deps({ teamId: null, divisionId: ARCHIVED_DIVISION }))).toEqual({ teamId: null, orgUnitId: null });
  });

  it("팀도 본부 칸도 없으면 null이다", async () => {
    expect(await viewerDivision(viewer, deps({ teamId: null, divisionId: null }))).toEqual({ teamId: null, orgUnitId: null });
  });

  it("마지막 발령 팀이 보관됐어도 그 팀의 본부다(evidenceScopeFor와 같은 규칙)", async () => {
    expect(await viewerDivision(viewer, deps({ teamId: ARCHIVED_TEAM_ID, divisionId: DIVISION_B }))).toEqual({
      teamId: ARCHIVED_TEAM_ID,
      orgUnitId: DIVISION_A,
    });
  });

  it("발령 조회 날짜는 deps.today다", async () => {
    const d = deps({ teamId: TEAM_ID });
    await viewerDivision(viewer, d);
    expect(d.findMembershipAtDate).toHaveBeenCalledWith(viewer, viewer.id, "2026-10-27");
  });
});
