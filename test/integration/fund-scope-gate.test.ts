import { describe, expect, it } from "vitest";
import { can } from "@/domain/permissions/can";
import { readFundDivision } from "@/domain/permissions/fund-gate";
import { FUND_DIVISION_SETTING_KEY } from "@/domain/permissions/fund-scope";
import { evidenceScopeFor } from "@/domain/permissions/scope-for";
import { SYSADMIN_ROLE_ID } from "@/domain/permissions/roles";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { findSimpleValue } from "@/repositories/settings";
import { orgUnitIdByName } from "./approvals-fixtures";
import { grantFundKeys, makeFundPerson, makeFundRole } from "./fixtures/fund-scope";

// 07.3-01 트레이서(D-7301 · D-7310 · D-7311 · D-7313): 설정 → 시드 → 소속 본부 → 자금 게이트 → can() → 증빙 범위.
describe("자금 게이트 트레이서 (07.3-01)", () => {
  it("시드 뒤 자금 본부 설정은 경영관리본부 uuid다", async () => {
    const mgmt = await orgUnitIdByName("경영관리본부");
    expect((await findSimpleValue(SYSTEM_VIEWER, FUND_DIVISION_SETTING_KEY))?.value).toBe(mgmt);
    expect(await readFundDivision(SYSTEM_VIEWER)).toEqual({ id: mgmt, name: "경영관리본부" });
  });

  it("같은 team 계급이어도 경영관리팀 사람은 증빙 등록을 쓰고 기획1팀 사람은 못 쓴다 — 증빙 범위도 같은 답", async () => {
    const roleId = await makeFundRole("team");
    await grantFundKeys(roleId, ["evidence.intake"]);
    await grantFundKeys(roleId, ["evidence"], "view");
    const mgmt = await makeFundPerson("경영관리 사원", roleId, "경영관리팀");
    const planning = await makeFundPerson("기획 사원", roleId, "기획1팀");

    expect(await can(mgmt, "evidence.intake", "write")).toBe(true);
    expect(await evidenceScopeFor(mgmt)).toEqual({ rows: "all" });

    expect(await can(planning, "evidence.intake", "write")).toBe(false);
    expect((await evidenceScopeFor(planning)).rows).toBe("published");
  });

  it("시스템 관리자는 소속 없이도 증빙 등록을 쓴다(회사 전체 계급 면제)", async () => {
    const admin = await makeFundPerson("관리자", SYSADMIN_ROLE_ID, null);
    expect(await can(admin, "evidence.intake", "write")).toBe(true);
  });
});
