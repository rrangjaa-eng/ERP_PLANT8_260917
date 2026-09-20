import { describe, expect, it } from "vitest";
import { teamAtDate } from "@/domain/org";
import type { Viewer } from "@/domain/viewer";

const viewer: Viewer = { id: "u1", roleId: "role-sysadmin" };

// MAST-02: Phase 5·10의 계약 — teamAtDate(viewer, userId, date, deps?)가
// 발령일이 조회 날짜 이하인 행 중 가장 늦은 것의 팀을 돌려주고, 해당 행이
// 없으면 null을 돌려준다. deps 스텁으로 실제 DB 없이 경계 동작을 고정한다.
describe("teamAtDate (MAST-02, 단위)", () => {
  it("발령일이 조회 날짜와 정확히 같으면 그 발령을 유효로 본다(경계 포함)", async () => {
    const result = await teamAtDate(viewer, "person-1", "2026-01-15", {
      findMembershipAtDate: () =>
        Promise.resolve({
          id: "m1",
          userId: "person-1",
          teamId: "team-1",
          effectiveFrom: "2026-01-15",
          createdAt: new Date(),
          createdBy: null,
        }),
      findTeamById: () =>
        Promise.resolve({
          id: "team-1",
          orgUnitId: "org-1",
          name: "기획1팀",
          sortOrder: 0,
          customFields: {},
          archivedAt: null,
          archivedBy: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      // project()는 visible()을 거쳐 실제 DB를 연다 — 단위 테스트는 투영을
      // 항등 함수로 스텁해 DB 없이 돈다(값 노출 정합성은 통합 테스트가 증명).
      project: (_viewer, row) => Promise.resolve(row as never),
    });

    expect(result?.id).toBe("team-1");
    expect(result?.name).toBe("기획1팀");
  });

  it("이력이 없는 사람의 시점 소속은 null이다 — 임의의 기본 팀으로 떨어지지 않는다", async () => {
    const result = await teamAtDate(viewer, "person-2", "2026-01-15", {
      findMembershipAtDate: () => Promise.resolve(null),
      findTeamById: () => {
        throw new Error("findMembershipAtDate가 null이면 findTeamById는 호출되면 안 된다");
      },
    });

    expect(result).toBeNull();
  });

  it("조회 날짜보다 뒤인 발령은 무시한다 — 리포지토리가 그 발령을 후보로 주지 않으면 null이다", async () => {
    const result = await teamAtDate(viewer, "person-3", "2026-01-01", {
      findMembershipAtDate: () => Promise.resolve(null),
      findTeamById: () => {
        throw new Error("findMembershipAtDate가 null이면 findTeamById는 호출되면 안 된다");
      },
    });

    expect(result).toBeNull();
  });

  it("발령이 여러 건이면 조회 날짜 이하 중 가장 늦은 발령의 팀을 돌려준다", async () => {
    const result = await teamAtDate(viewer, "person-4", "2026-03-01", {
      findMembershipAtDate: () =>
        Promise.resolve({
          id: "m3",
          userId: "person-4",
          teamId: "team-latest",
          effectiveFrom: "2026-02-01",
          createdAt: new Date(),
          createdBy: null,
        }),
      findTeamById: (viewerArg, id) => {
        expect(id).toBe("team-latest");
        return Promise.resolve({
          id: "team-latest",
          orgUnitId: "org-1",
          name: "최신팀",
          sortOrder: 0,
          customFields: {},
          archivedAt: null,
          archivedBy: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      },
      project: (_viewer, row) => Promise.resolve(row as never),
    });

    expect(result?.id).toBe("team-latest");
  });
});
