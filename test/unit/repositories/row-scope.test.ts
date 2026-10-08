import { describe, expect, it } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { projects } from "@/db/schema";
import type { RowScope } from "@/domain/permissions/scope-for";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { rowScopeCondition } from "@/repositories/row-scope";

// 06.2-03(D-6204 · D-6205 ① · ③ · D-6207 · T-06.2-21 · T-06.2-24 · CSO-4): 행 범위 번역기 — DB 없이 생성 SQL로 fail-closed를 고정한다.
// 주 증거는 통합 매트릭스(test/integration/row-scope-entries.test.ts), 이 파일은 갈래마다 조각이 빠지지 않는다는 보조 증거다.

const dialect = new PgDialect();
const COLS = { projectId: projects.id, teamId: projects.teamId, pmUserId: projects.pmUserId };
const VIEWER = "user-viewer-1";
const TEAM = "11111111-1111-4111-8111-111111111111";
const ORG = "22222222-2222-4222-8222-222222222222";

function render(scope: RowScope): { sql: string; params: unknown[] } {
  const query = dialect.sqlToQuery(rowScopeCondition(SYSTEM_VIEWER, scope, COLS));
  return { sql: query.sql, params: query.params };
}

const limited = (by: Extract<RowScope, { rows: "limited" }>["by"]): RowScope => ({ rows: "limited", includeArchived: false, viewerId: VIEWER, by });

// PM · 참여 OR 조각 — 범위와 무관하게 늘 있다(D-6205 ① · ③).
function expectPmAndMember(out: { sql: string; params: unknown[] }) {
  expect(out.sql).toContain('"projects"."pm_user_id" = $');
  expect(out.sql).toMatch(/exists \(select 1 from "project_members"/);
  expect(out.sql).toContain('"project_members"."project_id" = "projects"."id"');
  expect(out.sql).toContain('"project_members"."user_id" = $');
  expect(out.sql).toContain('"project_members"."archived_at" is null');
  expect(out.params.filter((value) => value === VIEWER)).toHaveLength(2);
  expect(out.sql).toMatch(/ or /);
}

describe("rowScopeCondition (06.2 행 범위 번역기)", () => {
  it("none → false (조각 없음)", () => {
    const out = render({ rows: "none", includeArchived: true });
    expect(out.sql.trim()).toBe("false");
    expect(out.params).toEqual([]);
  });

  it("all → true", () => {
    const out = render({ rows: "all", includeArchived: false });
    expect(out.sql.trim()).toBe("true");
    expect(out.params).toEqual([]);
  });

  it("limited team(T) → PM · 참여 · 살아 있는 팀 비교가 OR로", () => {
    const out = render(limited({ kind: "team", teamId: TEAM }));
    expectPmAndMember(out);
    expect(out.sql).toContain('"projects"."team_id" = $');
    expect(out.params).toContain(TEAM);
  });

  it("limited team(T) — 보관된 팀 발령은 팀 범위를 주지 않는다(팀 조각이 보관 아닌 팀만 잇는다)", () => {
    const out = render(limited({ kind: "team", teamId: TEAM }));
    expect(out.sql).toMatch(/exists \(select 1 from "teams" where "teams"\."id" = \$\d+ and "teams"\."archived_at" is null\)/);
  });

  it("limited team(null) → 팀 조각은 false, PM · 참여는 그대로 OR (CSO-4 — 조각이 사라져 전 행이 되지 않는다)", () => {
    const out = render(limited({ kind: "team", teamId: null }));
    expectPmAndMember(out);
    expect(out.sql).not.toContain('"projects"."team_id"');
    expect(out.sql).toMatch(/ or false\)$/);
    expect(out.sql.trim()).not.toBe("true");
    expect(out.params).not.toContain(null);
  });

  it("limited org_unit(O) → teams 하위 질의 org_unit_id 비교", () => {
    const out = render(limited({ kind: "org_unit", orgUnitId: ORG }));
    expectPmAndMember(out);
    expect(out.sql).toMatch(/"projects"\."team_id" in \(select "teams"\."id" from "teams" where "teams"\."org_unit_id" = \$\d+\)/);
    expect(out.params).toContain(ORG);
  });

  it("limited org_unit(null) → 본부 조각은 false, PM · 참여는 그대로 OR (CSO-4)", () => {
    const out = render(limited({ kind: "org_unit", orgUnitId: null }));
    expectPmAndMember(out);
    expect(out.sql).not.toContain('"projects"."team_id"');
    expect(out.sql).toMatch(/ or false\)$/);
    expect(out.params).not.toContain(null);
  });

  it("own → PM · 참여 둘만 (범위 조각 false)", () => {
    const out = render(limited({ kind: "own" }));
    expectPmAndMember(out);
    expect(out.sql).not.toContain('"projects"."team_id"');
    expect(out.sql).toMatch(/ or false\)$/);
  });

  it("viewerId는 문자열 보간이 아니라 파라미터로만 간다(T-06.2-25)", () => {
    const hostile = "x' or 1=1 --";
    const query = dialect.sqlToQuery(rowScopeCondition(SYSTEM_VIEWER, { rows: "limited", includeArchived: false, viewerId: hostile, by: { kind: "own" } }, COLS));
    expect(query.sql).not.toContain(hostile);
    expect(query.params).toContain(hostile);
  });
});

// 06.2-05 검토 반영(I-2 · 사용자 결정 2026-10-08 「막기」): 쓰기 권리의 업무 범위 갈래는 참여 조각을 뺀 보는 범위로만 인정한다.
describe("rowScopeCondition — 참여 조각 뺌(excludeMembership)", () => {
  function renderWithout(scope: RowScope): { sql: string; params: unknown[] } {
    const query = dialect.sqlToQuery(rowScopeCondition(SYSTEM_VIEWER, scope, COLS, { excludeMembership: true }));
    return { sql: query.sql, params: query.params };
  }

  it("limited team(T) → PM · 팀 조각만 · project_members 하위 질의 없음", () => {
    const out = renderWithout(limited({ kind: "team", teamId: TEAM }));
    expect(out.sql).toContain('"projects"."pm_user_id" = $');
    expect(out.sql).not.toContain("project_members");
    expect(out.sql).toContain('"projects"."team_id" = $');
    expect(out.params.filter((value) => value === VIEWER)).toHaveLength(1);
  });

  it("own → PM 하나만(범위 조각 false)", () => {
    const out = renderWithout(limited({ kind: "own" }));
    expect(out.sql).not.toContain("project_members");
    expect(out.sql).toMatch(/ or false\)$/);
  });

  it("none · all은 그대로", () => {
    expect(renderWithout({ rows: "none", includeArchived: false }).sql.trim()).toBe("false");
    expect(renderWithout({ rows: "all", includeArchived: false }).sql.trim()).toBe("true");
  });

  it("선택을 주지 않으면 참여 조각이 늘 있다(기존 호출부 그대로)", () => {
    expectPmAndMember(render(limited({ kind: "own" })));
  });
});
