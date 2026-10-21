import type { Viewer } from "@/domain/viewer";
import type { DbOrTx } from "@/repositories/document-counters";
import { listSeatDuplicateHolders, listSeatHolders, lockSeatKeys, type OccupiedTeamRow, type SeatDuplicateHolderRow } from "@/repositories/seats";
import { can as defaultCan } from "@/domain/permissions/can";
import { visible as defaultVisible } from "@/domain/permissions/visible";
import { registerDto } from "@/domain/permissions/dto-registry";
import { DIVISION_HEAD_ROLE_ID, TEAM_LEAD_ROLE_ID } from "@/domain/permissions/roles";
import { UserFacingError } from "@/lib/actions/user-facing-error";
import { addDays, kstToday } from "@/lib/kst-date";

// 06.4(D-6404 · D-6408 · D-6415): 한 팀 팀장 · 한 본부 책임자 한 명 — 하루라도 겹치면 둘째. 저장이 새 자리 구간을 더할 때만
// 본다(이미 있던 중복 · 강등 · 이동 · 당기기는 통과). 잠금 뒤 재조회 — 260907은 DB 부분 유니크 인덱스였고
// (`O: db/schema/030_constraints_indexes.sql:1165` 팀 · `:1155` 본부) 우리는 팀이 발령 이력이라 앱 잠금(옛 주석
// `O: server/src/people-rules.ts:108-110`의 경합 경고). SYSTEM_VIEWER도 면제하지 않는다(O4).

export class SeatTakenError extends UserFacingError {}

// 문구 표(D3 · 06.4-02-PLAN 정본): 이름을 못 보면 이름 자리에 담당.
const SEAT_FALLBACK_OWNER = "시스템 관리자";

export function seatTakenMessage(kind: "team" | "division", name: string | null): string {
  return `${kind === "team" ? "팀장 있음" : "본부 책임자 있음"} · ${name ?? SEAT_FALLBACK_OWNER}`;
}

export type SeatSpan = { id: string; from: string; to: string | null };
export type SeatDelta = { teams: SeatSpan[]; orgUnits: SeatSpan[] };
export type Employment = { archivedAt: Date | null; resignationDate: string | null };

type Span = { from: string; to: string | null };

// 날짜는 'YYYY-MM-DD' 글자 비교, to null = 열림.
function endsBefore(end: string | null, day: string): boolean {
  return end !== null && end < day;
}

export function spansOverlap(a: Span, b: Span): boolean {
  return !endsBefore(b.to, a.from) && !endsBefore(a.to, b.from);
}

// 시작 순으로 놓고 겹치거나 이어진(다음 날) 구간을 합친다.
function merge(spans: readonly Span[]): Span[] {
  const sorted = [...spans].sort((x, y) => (x.from < y.from ? -1 : x.from > y.from ? 1 : 0));
  const result: Span[] = [];
  for (const span of sorted) {
    const last = result.at(-1);
    if (last && !endsBefore(last.to, addDays(span.from, -1))) {
      if (last.to !== null && (span.to === null || span.to > last.to)) last.to = span.to;
    } else {
      result.push({ ...span });
    }
  }
  return result;
}

function subtract(span: Span, cuts: readonly Span[]): Span[] {
  let pieces: Span[] = [span];
  for (const cut of cuts) {
    pieces = pieces.flatMap((piece) => {
      if (!spansOverlap(piece, cut)) return [piece];
      const left = piece.from < cut.from ? [{ from: piece.from, to: addDays(cut.from, -1) }] : [];
      const right = cut.to !== null && (piece.to === null || piece.to > cut.to) ? [{ from: addDays(cut.to, 1), to: piece.to }] : [];
      return [...left, ...right];
    });
  }
  return pieces;
}

// 한쪽(저장 전 또는 후)의 자리 구간 — 자리 id → 구간들.
function seatSpans(
  roleId: string | null,
  employed: Employment | null,
  occupied: readonly OccupiedTeamRow[],
): { kind: "team" | "division" | null; byId: Map<string, Span[]> } {
  const byId = new Map<string, Span[]>();
  // D-6404 사용자 확정(2026-10-11 카드): 계급 id 상수로 판정 — 결재 단계 설정은 보지 않는다(연동은 07 권한 검수).
  const kind = roleId === TEAM_LEAD_ROLE_ID ? "team" : roleId === DIVISION_HEAD_ROLE_ID ? "division" : null;
  if (kind === null || employed === null || employed.archivedAt !== null) return { kind, byId };
  for (const row of occupied) {
    const id = kind === "team" ? row.teamId : row.orgUnitId;
    if (id === null) continue;
    const resign = employed.resignationDate;
    const to = resign !== null && (row.to === null || resign < row.to) ? resign : row.to;
    if (endsBefore(to, row.from)) continue;
    byId.set(id, [...(byId.get(id) ?? []), { from: row.from, to }]);
  }
  return { kind, byId };
}

// D-6415: 새 자리 = 늘어난 날짜만 — 퇴직일 늦추기 · 지우기 · 비재직 → 재직(03)도 같은 계산.
export function newSeats(input: {
  roleBefore: string | null;
  roleAfter: string | null;
  employedBefore: Employment | null;
  employedAfter: Employment | null;
  occupiedBefore: readonly OccupiedTeamRow[];
  occupiedAfter: readonly OccupiedTeamRow[];
}): SeatDelta {
  const before = seatSpans(input.roleBefore, input.employedBefore, input.occupiedBefore);
  const after = seatSpans(input.roleAfter, input.employedAfter, input.occupiedAfter);
  const added: SeatSpan[] = [];
  for (const [id, spans] of after.byId) {
    const cuts = before.kind === after.kind ? merge(before.byId.get(id) ?? []) : [];
    for (const span of merge(merge(spans).flatMap((span) => subtract(span, cuts)))) added.push({ id, ...span });
  }
  added.sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : x.from < y.from ? -1 : x.from > y.from ? 1 : 0));
  return after.kind === "division" ? { teams: [], orgUnits: added } : { teams: added, orgUnits: [] };
}

// 호출자가 같은 tx에서 사람(· 관리자) 키를 먼저 잡고 점유를 읽었다 — 여기서 팀 · 본부 층을 잡고 보유자를 다시 읽는다.
export async function assertSeatsFree(
  viewer: Viewer,
  input: { userId?: string; roleId: string; seats: SeatDelta; today: string; showNames: boolean },
  tx: DbOrTx,
): Promise<void> {
  const { teams, orgUnits } = input.seats;
  if (teams.length === 0 && orgUnits.length === 0) return;
  const teamIds = [...new Set(teams.map((seat) => seat.id))];
  const orgUnitIds = [...new Set(orgUnits.map((seat) => seat.id))];
  await lockSeatKeys(viewer, { teamIds, orgUnitIds }, tx);
  const holders = await listSeatHolders(
    viewer,
    { roleId: input.roleId, today: input.today, teamIds, orgUnitIds, excludeUserId: input.userId },
    tx,
  );
  const taken = holders
    .filter(
      (holder) =>
        teams.some((seat) => seat.id === holder.teamId && spansOverlap(seat, holder)) ||
        orgUnits.some((seat) => seat.id === holder.orgUnitId && spansOverlap(seat, holder)),
    )
    .sort((x, y) => (x.name < y.name ? -1 : x.name > y.name ? 1 : 0));
  const first = taken[0];
  if (first) {
    throw new SeatTakenError(seatTakenMessage(teams.length > 0 ? "team" : "division", input.showNames ? first.name : null));
  }
}

// 다른 보유자와 하루라도 겹치는 보유자 구간만 — 열쇠 `${kind}:${seatId}:${userId}`.
function duplicatedHolders(rows: readonly SeatDuplicateHolderRow[]): SeatDuplicateHolderRow[] {
  return rows.filter((span) =>
    rows.some((other) => other.kind === span.kind && other.seatId === span.seatId && other.userId !== span.userId && spansOverlap(span, other)),
  );
}

function holderKey(row: SeatDuplicateHolderRow): string {
  return `${row.kind}:${row.seatId}:${row.userId}`;
}

// 복원 전 이미 있던 중복 보유자 — 복원이 새로 만든 중복만 거부하려고 보관을 풀기 전에 같은 tx에서 읽는다.
export async function seatDuplicateBaseline(viewer: Viewer, today: string, tx: DbOrTx): Promise<Set<string>> {
  const rows = await listSeatDuplicateHolders(
    viewer,
    { today, teamLeadRoleId: TEAM_LEAD_ROLE_ID, divisionHeadRoleId: DIVISION_HEAD_ROLE_ID },
    tx,
  );
  return new Set(duplicatedHolders(rows).map(holderKey));
}

// 06.4 /review: 팀 · 본부 복원 — 보관된 팀 · 본부는 자리 검사 밖이라 그사이 둘째 보유자가 생길 수 있다. 호출자가 같은 tx에서
// 그 팀 · 본부 키를 잡고 보관을 푼 뒤 부른다 — 그 자리들에 하루라도 겹치는 다른 보유자가 있으면 거부(tx째 되돌린다).
// baseline(복원 전 중복)에 있던 보유자는 넘긴다 — 이미 있던 중복은 다른 화면처럼 허용.
export async function assertNoSeatDuplicates(
  viewer: Viewer,
  input: { teamIds: readonly string[]; orgUnitIds: readonly string[]; today: string; showNames: boolean; baseline?: ReadonlySet<string> },
  tx: DbOrTx,
): Promise<void> {
  const rows = await listSeatDuplicateHolders(
    viewer,
    { today: input.today, teamLeadRoleId: TEAM_LEAD_ROLE_ID, divisionHeadRoleId: DIVISION_HEAD_ROLE_ID },
    tx,
  );
  for (const kind of ["team", "division"] as const) {
    const ids = kind === "team" ? input.teamIds : input.orgUnitIds;
    const taken = duplicatedHolders(rows.filter((row) => row.kind === kind && ids.includes(row.seatId)))
      .filter((span) => !input.baseline?.has(holderKey(span)))
      .sort((x, y) => (x.name < y.name ? -1 : x.name > y.name ? 1 : 0));
    const first = taken[0];
    if (first) throw new SeatTakenError(seatTakenMessage(kind, input.showNames ? first.name : null));
  }
}

export type SeatHolderDto = { userId: string; name: string };
export type SeatDuplicatesDto = { teams: Record<string, SeatHolderDto[]>; orgUnits: Record<string, SeatHolderDto[]> };

// 07-03(R1) — listSeatDuplicates가 사람 · 팀 정보를 둘 다 볼 때만 이름을 싣는다(아래). 같은 규칙을 누수 스캔이 계급마다 돈다.
registerDto({
  name: "SeatDuplicatesDto",
  fields: [
    { key: "teams", infoItem: ["person.value", "team.value"] },
    { key: "orgUnits", infoItem: ["person.value", "team.value"] },
  ],
});

// 06.4(D-6405 · D-6413 · D-6415): 조직 화면 중복 — 자리마다 다른 보유자 구간과 하루라도 겹치는 사람만 남기고(퇴직 예정
// 보유자와 그 다음 날부터의 후임은 중복이 아니다), 남은 사람이 2명 이상인 자리만 이름 오름차순으로.
// D-6405 · D-6413 사용자 확정(2026-10-12 카드): 사람 · 팀 정보를 둘 다 볼 때만 계산해 보낸다 — 꺼진 뷰어에게는 개수 · 이름조차
// 보내지 않는다(SYSTEM.md:864 「열은 서버가 아예 보내지 않는다」와 같은 결).
export async function listSeatDuplicates(
  viewer: Viewer,
  deps?: Partial<{ can: typeof defaultCan; visible: typeof defaultVisible; now: () => Date }>,
): Promise<SeatDuplicatesDto | null> {
  const can = deps?.can ?? defaultCan;
  const visible = deps?.visible ?? defaultVisible;
  const [canView, seesPerson, seesTeam] = await Promise.all([
    can(viewer, "admin.people", "view"),
    visible(viewer, "person.value"),
    visible(viewer, "team.value"),
  ]);
  if (!canView || !seesPerson || !seesTeam) return null;
  const rows = await listSeatDuplicateHolders(viewer, {
    today: kstToday((deps?.now ?? (() => new Date()))()),
    teamLeadRoleId: TEAM_LEAD_ROLE_ID,
    divisionHeadRoleId: DIVISION_HEAD_ROLE_ID,
  });
  const result: SeatDuplicatesDto = { teams: {}, orgUnits: {} };
  const seats = new Map<string, typeof rows>();
  for (const row of rows) {
    const key = `${row.kind}:${row.seatId}`;
    seats.set(key, [...(seats.get(key) ?? []), row]);
  }
  for (const spans of seats.values()) {
    const kept = new Map<string, string>();
    for (const span of spans) {
      if (spans.some((other) => other.userId !== span.userId && spansOverlap(span, other))) kept.set(span.userId, span.name);
    }
    if (kept.size < 2) continue;
    const holders = [...kept].map(([userId, name]) => ({ userId, name }));
    holders.sort((x, y) => (x.name < y.name ? -1 : x.name > y.name ? 1 : 0));
    const first = spans[0];
    if (first) (first.kind === "team" ? result.teams : result.orgUnits)[first.seatId] = holders;
  }
  return result;
}
