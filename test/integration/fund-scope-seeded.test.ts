import { describe, expect, it } from "vitest";
import { can } from "@/domain/permissions/can";
import { FUND_SCOPED_MENUS } from "@/domain/permissions/fund-scope";
import { DEFAULT_ROLE_ID, DIVISION_HEAD_ROLE_ID, TEAM_LEAD_ROLE_ID } from "@/domain/permissions/roles";
import { evidenceScopeFor } from "@/domain/permissions/scope-for";
import type { Viewer } from "@/domain/viewer";
import { orgUnitIdByName } from "./approvals-fixtures";
import { makeFundPerson } from "./fixtures/fund-scope";

// 07.3-02(D-7315 · D-7305 · D-7303 · D-7301 결과): 시드만으로(픽스처 권한 0) 경영관리본부 사람은 자금 기능을 쓰고 기획본부 사람은 못 쓴다.
// 시험 DB는 매번 seedMasterData로 선다 — 이 파일은 권한 행을 하나도 손대지 않는다.
const SEVEN = FUND_SCOPED_MENUS.filter((menu) => menu !== "projects.adjustment");

async function fundCells(viewer: Viewer, menus: readonly string[]): Promise<Record<string, boolean>> {
  const cells: Record<string, boolean> = {};
  for (const menu of menus) {
    for (const action of ["view", "write"] as const) cells[`${menu}:${action}`] = await can(viewer, menu, action);
  }
  return cells;
}

function all(menus: readonly string[], value: boolean): Record<string, boolean> {
  return Object.fromEntries(menus.flatMap((menu) => [`${menu}:view`, `${menu}:write`].map((key) => [key, value])));
}

describe("시드만으로 자금 키 (07.3-02 D-7315)", () => {
  it("경영관리 사원(경영관리팀 · 기본 계급)은 자금 7키 보기 · 쓰기가 참이고 조정 줄은 거짓이다(D-7305)", async () => {
    const mgmtStaff = await makeFundPerson("경영관리 사원", DEFAULT_ROLE_ID, "경영관리팀");
    expect(await fundCells(mgmtStaff, SEVEN)).toEqual(all(SEVEN, true));
    expect(await fundCells(mgmtStaff, ["projects.adjustment"])).toEqual(all(["projects.adjustment"], false));
  });

  it("같은 계급의 기획 사원(기획1팀)은 자금 8키 모두 거짓이다", async () => {
    const planningStaff = await makeFundPerson("기획 사원", DEFAULT_ROLE_ID, "기획1팀");
    expect(await fundCells(planningStaff, FUND_SCOPED_MENUS)).toEqual(all(FUND_SCOPED_MENUS, false));
  });

  it("경영관리 책임자(팀 없음 · 본부 칸)는 자금 8키 모두 참 · 증빙 범위 전체다", async () => {
    const mgmtHead = await makeFundPerson("경영관리 책임자", DIVISION_HEAD_ROLE_ID, { division: "경영관리본부" });
    expect(await fundCells(mgmtHead, FUND_SCOPED_MENUS)).toEqual(all(FUND_SCOPED_MENUS, true));
    expect(await evidenceScopeFor(mgmtHead)).toEqual({ rows: "all" });
  });

  it("기획 책임자(팀 없음)는 자금 8키 거짓 · 증빙 보기는 참이고 범위는 기획본부 공개 줄이다(D-7303 — 전체 아님)", async () => {
    const planningHead = await makeFundPerson("기획 책임자", DIVISION_HEAD_ROLE_ID, { division: "기획본부" });
    expect(await fundCells(planningHead, FUND_SCOPED_MENUS)).toEqual(all(FUND_SCOPED_MENUS, false));
    expect(await can(planningHead, "evidence", "view")).toBe(true);
    expect(await evidenceScopeFor(planningHead)).toEqual({ rows: "published", teamId: null, orgUnitId: await orgUnitIdByName("기획본부") });
  });

  it("팀장 계급 사람을 경영관리팀에 두면 자금 7키가 참이다(경영관리본부에 팀장 자리가 없어도 사원 이상 규칙)", async () => {
    const lead = await makeFundPerson("경영관리 팀장", TEAM_LEAD_ROLE_ID, "경영관리팀");
    expect(await fundCells(lead, SEVEN)).toEqual(all(SEVEN, true));
    expect(await can(lead, "projects.adjustment", "write")).toBe(false);
  });
});
