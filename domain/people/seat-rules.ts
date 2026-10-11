import type { Viewer } from "@/domain/viewer";
import type { DbOrTx } from "@/repositories/document-counters";
import { listSeatHolders, lockSeatKeys, type OccupiedTeamRow } from "@/repositories/seats";
import { DIVISION_HEAD_ROLE_ID, TEAM_LEAD_ROLE_ID } from "@/domain/permissions/roles";
import { UserFacingError } from "@/lib/actions/user-facing-error";
import { addDays } from "@/lib/kst-date";

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
