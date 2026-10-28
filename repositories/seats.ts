import { and, eq, gte, inArray, isNotNull, isNull, ne, or, sql } from "drizzle-orm";
import { db, type DbOrTx } from "@/db/client";
import { orgUnits, teamMemberships, teams, users } from "@/db/schema";
import type { Viewer } from "@/domain/viewer";

// 06.4(D-6408): 사람 · 관리자 · 팀 · 본부 자리 쓰기를 줄 세운다. 층 순서(사람 → 관리자 → 회사(07.1) → 팀 → 본부)와 같은 층 정렬을
// 이 함수가 강제해 교착이 없다. 점유 팀을 읽어야 팀 키가 정해지는 쓰기는 사람 · 관리자 층을 먼저 잡고, 점유를 tx로 읽은 뒤
// 팀 · 본부 층을 두 번째 호출로 잡는다. 트랜잭션 끝에 풀린다(5초 lock_timeout — `lib/db-transaction.ts`).

export const ADMIN_SEAT_LOCK_KEY = "seat:admin:last";

export type SeatLockInput = {
  personIds?: readonly string[];
  admin?: boolean;
  // 07.1(D-7128): 회사에 한 명인 계급(대표 · 시스템 관리자) — 키는 계급마다 하나.
  companyRoleIds?: readonly string[];
  teamIds?: readonly string[];
  orgUnitIds?: readonly string[];
};

function layer(prefix: string, ids: readonly string[] | undefined): string[] {
  return [...new Set(ids ?? [])].sort().map((id) => prefix + id);
}

export function seatLockOrder(viewer: Viewer, input: SeatLockInput): string[] {
  void viewer;
  return [
    ...layer("seat:person:", input.personIds),
    ...(input.admin ? [ADMIN_SEAT_LOCK_KEY] : []),
    ...layer("seat:company:", input.companyRoleIds),
    ...layer("seat:team:", input.teamIds),
    ...layer("seat:division:", input.orgUnitIds),
  ];
}

async function lockKeys(keys: readonly string[], tx: DbOrTx): Promise<void> {
  for (const key of keys) {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${key}, 0))`);
  }
}

// 06.4 /cso: 사람 키를 넘기면 사람 · 관리자 층을 잡은 뒤 그 사람의 발령 팀(보관 여부 무관) · 넘긴 팀의 팀 · 본부 키를 함께 잡는다.
// 팀 · 본부 복원(`restoreSeatedOrg`)은 사람을 모르고 팀 · 본부 키만 잡는다 — 보관된 팀이라 자리가 없어 보여도 그 키에서 줄을
// 서야 복원이 아직 커밋 안 된 둘째 보유자를 놓치지 않는다. 점유는 이 잠금 뒤에 읽어야 먼저 커밋된 복원을 본다. 뒤따르는
// 자리 키(`assertSeatsFree`)는 여기서 잡은 키의 부분집합이라 다시 기다리지 않는다(층 순서 유지). 자리 계산은 그대로다.
export async function lockSeatKeys(viewer: Viewer, input: SeatLockInput, tx: DbOrTx): Promise<void> {
  const personIds = input.personIds ?? [];
  if (personIds.length === 0) {
    await lockKeys(seatLockOrder(viewer, input), tx);
    return;
  }
  // 07.1(E-P2-21): 회사 키는 팀 · 본부 키(아래 두 번째 호출)보다 앞이라 첫 호출에서 잡는다.
  await lockKeys(seatLockOrder(viewer, { personIds, admin: input.admin, companyRoleIds: input.companyRoleIds }), tx);
  const memberTeamIds = tx
    .select({ teamId: teamMemberships.teamId })
    .from(teamMemberships)
    .where(inArray(teamMemberships.userId, [...personIds]));
  const rows = await tx
    .select({ teamId: teams.id, orgUnitId: teams.orgUnitId })
    .from(teams)
    .where(or(inArray(teams.id, memberTeamIds), input.teamIds?.length ? inArray(teams.id, [...input.teamIds]) : undefined));
  await lockKeys(
    seatLockOrder(viewer, {
      teamIds: [...(input.teamIds ?? []), ...rows.map((row) => row.teamId)],
      orgUnitIds: [...(input.orgUnitIds ?? []), ...rows.map((row) => row.orgUnitId)],
    }),
    tx,
  );
}

// 06.4 D-6415 사용자 확정(2026-10-11 카드) · eng 재검토 K-R4 「겹칠 때만 막기」: 자리 = 날짜 구간. 발령 한 줄 =
// [max(발령일, 오늘), 다음 발령 전날]. 보유자 구간은 퇴직일에서 잘린다. 겹침이 하루라도 있으면 둘째 보유자 — 시간 경과 ·
// 예약 취소로 한 날에 둘이 되지 않는다(RESEARCH Pitfall 1). 260907은 팀이 한 값이고
// 퇴사일을 적는 순간 자리가 비었다(`O: db/schema/030_constraints_indexes.sql:1155` · `:1165` `left_date IS NULL`).
// 보관된 팀은 구간이 없고, 본부는 보관 안 된 본부만(보관 본부면 null). 날짜는 'YYYY-MM-DD' 글자로 돌려준다.
function occupancy(today: string) {
  const spans = db
    .select({
      userId: teamMemberships.userId,
      teamId: teamMemberships.teamId,
      from: sql<string>`greatest(${teamMemberships.effectiveFrom}, ${today}::date)::text`.as("span_from"),
      to: sql<string | null>`((lead(${teamMemberships.effectiveFrom}) over (partition by ${teamMemberships.userId} order by ${teamMemberships.effectiveFrom})) - 1)::text`.as(
        "span_to",
      ),
    })
    .from(teamMemberships)
    .as("membership_spans");
  return db
    .select({
      userId: spans.userId,
      // 팀 · 본부 id는 둘 다 열 이름이 "id"라 바깥에서 갈리도록 별칭을 준다(42702).
      teamId: sql<string>`${teams.id}`.as("seat_team_id"),
      orgUnitId: sql<string | null>`${orgUnits.id}`.as("seat_org_unit_id"),
      from: spans.from,
      to: spans.to,
    })
    .from(spans)
    .innerJoin(teams, and(eq(teams.id, spans.teamId), isNull(teams.archivedAt)))
    .leftJoin(orgUnits, and(eq(orgUnits.id, teams.orgUnitId), isNull(orgUnits.archivedAt)))
    .where(or(isNull(spans.to), gte(spans.to, today)))
    .as("seat_occupancy");
}

// 발령 한 줄의 자리 구간 — 고용 상태(보관 · 퇴직일)는 보지 않는다(호출자가 newSeats에 넘긴다).
export type OccupiedTeamRow = { teamId: string; orgUnitId: string | null; from: string; to: string | null };

export async function listOccupiedTeams(viewer: Viewer, userId: string, today: string, tx: DbOrTx): Promise<OccupiedTeamRow[]> {
  void viewer;
  const occ = occupancy(today);
  return tx
    .select({ teamId: occ.teamId, orgUnitId: occ.orgUnitId, from: occ.from, to: occ.to })
    .from(occ)
    .where(eq(occ.userId, userId))
    .orderBy(occ.from);
}

export type SeatHolderRow = {
  userId: string;
  name: string;
  teamId: string;
  orgUnitId: string | null;
  from: string;
  to: string | null;
};

// 계급이 roleId인 재직 보유자의 자리 구간(끝은 퇴직일에서 잘림 — least는 NULL을 열림으로 둔다). 퇴직일이 구간 시작보다
// 앞인 줄(퇴직 뒤 발령)은 구간이 없다. 정렬은 호출자가 JS로(DB 정렬 규칙이 환경마다 다르다 — team-memberships.ts와 같은 이유).
export async function listSeatHolders(
  viewer: Viewer,
  input: { roleId: string; today: string; teamIds?: readonly string[]; orgUnitIds?: readonly string[]; excludeUserId?: string },
  tx: DbOrTx,
): Promise<SeatHolderRow[]> {
  void viewer;
  const teamIds = input.teamIds ?? [];
  const orgUnitIds = input.orgUnitIds ?? [];
  if (teamIds.length === 0 && orgUnitIds.length === 0) return [];
  const occ = occupancy(input.today);
  return tx
    .select({
      userId: users.id,
      name: users.name,
      teamId: occ.teamId,
      orgUnitId: occ.orgUnitId,
      from: occ.from,
      to: sql<string | null>`least(${occ.to}::date, ${users.resignationDate})::text`,
    })
    .from(occ)
    .innerJoin(users, eq(users.id, occ.userId))
    .where(
      and(
        eq(users.roleId, input.roleId),
        isNull(users.archivedAt),
        or(isNull(users.resignationDate), sql`${users.resignationDate} >= ${occ.from}::date`),
        or(
          teamIds.length > 0 ? inArray(occ.teamId, [...teamIds]) : undefined,
          orgUnitIds.length > 0 ? inArray(occ.orgUnitId, [...orgUnitIds]) : undefined,
        ),
        input.excludeUserId === undefined ? undefined : ne(users.id, input.excludeUserId),
      ),
    );
}

export type CompanySeatHolderRow = { userId: string; name: string; from: string; to: string | null };

// 07.1(D-7108 · D-7128 · D-E5): 회사에 한 명인 계급의 보유자 구간 = [max(입사일, 오늘), 퇴직일] — 팀장 자리와 같은 기간 규칙.
// 보관 · 지난 퇴직일은 자리 없음. greatest는 NULL(입사일 없음)을 건너뛰어 오늘이 된다(listSeatHolders의 퇴직일 자르기와 같은 꼴).
// 260907은 부분 유니크 인덱스였다(`O: db/schema/030_constraints_indexes.sql:1145` — 퇴사일을 적는 순간 자리가 빔). 정렬은 호출자가 JS로.
export async function listCompanySeatHolders(
  viewer: Viewer,
  input: { roleId: string; today: string; excludeUserId?: string },
  tx: DbOrTx = db,
): Promise<CompanySeatHolderRow[]> {
  void viewer;
  return tx
    .select({
      userId: users.id,
      name: users.name,
      from: sql<string>`greatest(${users.hireDate}, ${input.today}::date)::text`,
      to: users.resignationDate,
    })
    .from(users)
    .where(
      and(
        eq(users.roleId, input.roleId),
        isNull(users.archivedAt),
        or(isNull(users.resignationDate), gte(users.resignationDate, input.today)),
        input.excludeUserId === undefined ? undefined : ne(users.id, input.excludeUserId),
      ),
    );
}

// 06.4(D-6405 · D-6413): 조직 화면 중복 표시 — 개수와 보유자 이름(그 사람 상세로 가는 링크 재료). 점유 구간 · 퇴직일 자르기는
// 위 `occupancy` · `listSeatHolders`와 같은 정의(06.4-02 D-6415)다. 팀장(teamLeadRoleId)은 팀별, 본부 책임자(divisionHeadRoleId)는
// 본부별로 모아 서로 다른 보유자가 2명 이상인 자리의 구간 행만 돌려준다. 구간 겹침 판정은 도메인(`spansOverlap`)이 한다.
// 정렬은 호출자가 JS로(위와 같은 이유).
export type SeatDuplicateHolderRow = {
  kind: "team" | "division";
  seatId: string;
  userId: string;
  name: string;
  from: string;
  to: string | null;
};

export async function listSeatDuplicateHolders(
  viewer: Viewer,
  input: { today: string; teamLeadRoleId: string; divisionHeadRoleId: string },
  tx: DbOrTx = db,
): Promise<SeatDuplicateHolderRow[]> {
  void viewer;
  const occ = occupancy(input.today);
  const kind = sql<"team" | "division">`case when ${users.roleId} = ${input.teamLeadRoleId} then 'team' else 'division' end`;
  const seatId = sql<string | null>`case when ${users.roleId} = ${input.teamLeadRoleId} then ${occ.teamId} else ${occ.orgUnitId} end`;
  // 자리별 서로 다른 보유자 2명 이상 = 자리 안 최소 · 최대 사람 id가 다르다(창 함수에는 count(distinct)가 없다).
  const spans = db
    .select({
      kind: kind.as("seat_kind"),
      seatId: seatId.as("seat_id"),
      userId: sql<string>`${users.id}`.as("holder_id"),
      name: sql<string>`${users.name}`.as("holder_name"),
      from: sql<string>`${occ.from}`.as("holder_from"),
      to: sql<string | null>`least(${occ.to}::date, ${users.resignationDate})::text`.as("holder_to"),
      lowest: sql<string>`min(${users.id}) over (partition by ${kind}, ${seatId})`.as("seat_lowest_holder"),
      highest: sql<string>`max(${users.id}) over (partition by ${kind}, ${seatId})`.as("seat_highest_holder"),
    })
    .from(occ)
    .innerJoin(users, eq(users.id, occ.userId))
    .where(
      and(
        inArray(users.roleId, [input.teamLeadRoleId, input.divisionHeadRoleId]),
        isNull(users.archivedAt),
        or(isNull(users.resignationDate), sql`${users.resignationDate} >= ${occ.from}::date`),
      ),
    )
    .as("seat_duplicate_spans");
  const rows = await tx
    .select({ kind: spans.kind, seatId: spans.seatId, userId: spans.userId, name: spans.name, from: spans.from, to: spans.to })
    .from(spans)
    .where(and(isNotNull(spans.seatId), ne(spans.lowest, spans.highest)));
  return rows.flatMap((row) => (row.seatId === null ? [] : [{ ...row, seatId: row.seatId }]));
}
