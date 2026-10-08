import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { SEED_ROLES } from "@/domain/permissions/roles";

// 06.2(D-6203 · RESEARCH Pitfall 4): 새 DB는 시드(SEED_ROLES)가, 기존 DB는 이행(*_view_scope)이 시드 계급의
// 보는 범위를 정한다 — 두 값이 같아야 한다(0013 업무 범위 선례). 번호를 박지 않고 접미사로 찾는다.
const MIGRATIONS_DIR = resolve(process.cwd(), "db/migrations");

function viewScopeMigrationSql(): string {
  const files = readdirSync(MIGRATIONS_DIR).filter((name) => name.endsWith("_view_scope.sql"));
  expect(files).toHaveLength(1);
  return readFileSync(join(MIGRATIONS_DIR, files[0] as string), "utf8");
}

describe("시드 계급 보는 범위 = 이행 백필 값(06.2 D-6203)", () => {
  it("SEED_ROLES의 viewScope 다섯 값이 D-6203 값이다", () => {
    expect(Object.fromEntries(SEED_ROLES.map((role) => [role.id, role.viewScope]))).toEqual({
      "role-ceo": "company",
      "role-sysadmin": "company",
      "role-division-head": "org_unit",
      "role-team-lead": "team",
      "role-pm": "team",
    });
  });

  it("이행 SQL의 시드 계급 CASE 값이 SEED_ROLES viewScope와 같다", () => {
    const sql = viewScopeMigrationSql();
    const seedUpdate = sql
      .split("--> statement-breakpoint")
      .find((statement) => statement.includes(`SET "view_scope" = CASE "id"`));
    expect(seedUpdate).toBeDefined();
    const pairs = Object.fromEntries(
      [...(seedUpdate as string).matchAll(/WHEN '([^']+)' THEN '([^']+)'/g)].map((m) => [m[1], m[2]]),
    );
    expect(pairs).toEqual(Object.fromEntries(SEED_ROLES.map((role) => [role.id, role.viewScope])));
    for (const role of SEED_ROLES) expect(seedUpdate).toContain(`'${role.id}'`);
  });

  // K1 사용자 답 「쓰기 범위 복사」(2026-10-08): 화면에서 만든 계급은 이행 전 업무 범위를 그대로 받는다.
  it("화면에서 만든 계급(is_seed = false)은 이행 전 work_scope를 그대로 받는다", () => {
    const sql = viewScopeMigrationSql();
    expect(sql).toContain(`UPDATE "roles" SET "view_scope" = "work_scope" WHERE "is_seed" = false;`);
    expect(sql).not.toContain("permission_matrix");
  });
});
