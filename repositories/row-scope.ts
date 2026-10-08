import { sql, type AnyColumn, type SQL } from "drizzle-orm";
import { projectMembers, teams } from "@/db/schema";
import type { RowScope, RowScopeBy } from "@/domain/permissions/scope-for";
import type { Viewer } from "@/domain/viewer";

// 06.2(D-6204 · D-6208): 행 범위 서술자(rowScopeFor) → where 조각 번역은 이 함수 하나다. 도메인은 서술자만 만든다.
// 세 열은 모두 필수다 — 260907은 호출부가 `project:` 칸을 안 주면 참여자 조각이 조용히 빠졌다(`O: server/src/scope.ts:36-41`,
// card-uses · settlement · home 호출 누락). 타입이 누락을 잡는다.
// PM · 참여 OR는 범위와 무관하게 늘 더한다(D-6205 ① · ③ · D-6218 — 260907은 team 범위에서만 「내 것」).
// 문자열 보간 금지 — Drizzle 파라미터만(`O: scope.ts:44-48` idOrNull 보간과 다르게).
// fail-closed: none · 모르는 갈래 → false. limited의 팀 · 본부 id가 null이면 범위 조각만 false로 바꾼다(CSO-4) — 조각을
// undefined로 두면 and() · or()가 조용히 빼서 조건 전체가 사라진다. 보관된 팀 발령은 팀 범위를 주지 않는다(06.2-01 남긴 것).
export type RowScopeColumns = {
  projectId: AnyColumn | SQL;
  teamId: AnyColumn | SQL;
  pmUserId: AnyColumn | SQL;
};

// 하위 질의의 "teams"는 바깥 질의가 teams를 조인해도(목록) 가장 안쪽 FROM에 묶인다(Postgres 이름 범위).
function scopeFragment(by: RowScopeBy, teamId: AnyColumn | SQL): SQL {
  switch (by.kind) {
    case "team":
      if (by.teamId === null) return sql`false`;
      return sql`(${teamId} = ${by.teamId} and exists (select 1 from ${teams} where ${teams.id} = ${by.teamId} and ${teams.archivedAt} is null))`;
    case "org_unit":
      if (by.orgUnitId === null) return sql`false`;
      return sql`${teamId} in (select ${teams.id} from ${teams} where ${teams.orgUnitId} = ${by.orgUnitId})`;
    case "own":
      return sql`false`;
    default: {
      const unreachable: never = by;
      void unreachable;
      return sql`false`;
    }
  }
}

// viewer는 4계층 규약(plant8/repository-viewer-param) 자리 — 판정 대상은 서술자의 viewerId다.
export function rowScopeCondition(viewer: Viewer, scope: RowScope, cols: RowScopeColumns): SQL {
  void viewer;
  switch (scope.rows) {
    case "none":
      return sql`false`;
    case "all":
      return sql`true`;
    case "limited": {
      const pm = sql`${cols.pmUserId} = ${scope.viewerId}`;
      const member = sql`exists (select 1 from ${projectMembers} where ${projectMembers.projectId} = ${cols.projectId} and ${projectMembers.userId} = ${scope.viewerId} and ${projectMembers.archivedAt} is null)`;
      return sql`(${pm} or ${member} or ${scopeFragment(scope.by, cols.teamId)})`;
    }
    default: {
      const unreachable: never = scope;
      void unreachable;
      return sql`false`;
    }
  }
}
