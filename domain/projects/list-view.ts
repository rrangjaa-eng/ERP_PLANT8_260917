import type { ProjectStatus } from "@/domain/projects/status-transitions";
import { formatCount } from "@/lib/format-number";
import { clampPage, LIST_PAGE_SIZE, pageCountFrom } from "@/lib/paging";

// 04-17(D-88 · D-89 · D-90 · 계약 7) — 목록 보기 범위 · 귀속 · 합계 줄 문구 · 수익금 기준의 순수 함수. 서버 전용 모듈을
// import하지 않는다(04-48의 필터 줄 클라이언트가 이 파일을 import한다).

export type ListRange = { start?: string; end?: string; kind: "year" | "period"; year?: number };
export type ProfitBasis = "quote" | "issued";

// 계약 7 — 이 상태이면서 발행 줄이 1개 이상일 때만 발행 기준. 리포지토리 SQL 식이 같은 목록을 쓴다.
export const ISSUED_BASIS_STATUSES: readonly ProjectStatus[] = ["settling", "completed"];

// 보기 범위 R = 연도 [1/1, 12/31] ∩ 기간. 연도와 기간이 겹치지 않는 조합은 04-48의 연도 자동 전환이 조회 전에 없앤다.
export function resolveListRange(input: { year: number | "all"; period?: { from?: string; to?: string } }): ListRange | null {
  const from = input.period?.from;
  const to = input.period?.to;
  if (input.year === "all") {
    if (!from && !to) return null;
    return { start: from, end: to, kind: "period" };
  }
  const yearStart = `${input.year}-01-01`;
  const yearEnd = `${input.year}-12-31`;
  if (!from && !to) return { start: yearStart, end: yearEnd, kind: "year", year: input.year };
  return {
    start: from && from > yearStart ? from : yearStart,
    end: to && to < yearEnd ? to : yearEnd,
    kind: "period",
  };
}

function isInRange(date: string, range: ListRange): boolean {
  return (!range.start || date >= range.start) && (!range.end || date <= range.end);
}

// 기간 칸 2행 — R 밖에서 끝나는 행만(연도 보기는 종료 연도, 기간 보기는 종료 연월).
export function attributionLabel(input: { endDate: string | null; range: ListRange | null }): string | null {
  const { endDate, range } = input;
  if (!endDate || !range || isInRange(endDate, range)) return null;
  return `${range.kind === "year" ? endDate.slice(0, 4) : endDate.slice(0, 7)} 귀속`;
}

// 합계 줄 오른쪽 — 해 오름차순 뒤 기간 미정, 0건은 쓰지 않는다.
export function exclusionText(input: {
  kind: "year" | "period";
  byYear?: Record<number, number>;
  outside?: number;
  undetermined?: number;
}): string | null {
  const parts: string[] = [];
  if (input.kind === "period") {
    if (input.outside) parts.push(`기간 밖 귀속 ${formatCount(input.outside)}건 제외`);
  } else {
    const years = Object.entries(input.byYear ?? {})
      .filter(([, count]) => count > 0)
      .sort(([a], [b]) => Number(a) - Number(b));
    for (const [year, count] of years) parts.push(`${year} 귀속 ${formatCount(count)}건 제외`);
  }
  if (input.undetermined) parts.push(`기간 미정 ${formatCount(input.undetermined)}건 제외`);
  return parts.length > 0 ? parts.join(" · ") : null;
}

function rangeLabel(range: ListRange | null): string {
  if (!range) return "전체 연도";
  if (range.kind === "year") return `${range.year} 귀속`;
  return `${range.start ?? "—"} ~ ${range.end ?? "—"} 귀속`;
}

export function totalsTitle(input: { statusLabel?: string; range: ListRange | null; count: number }): string {
  const parts = [input.statusLabel, rangeLabel(input.range), `${formatCount(input.count)}건`].filter(Boolean);
  return `합계 (${parts.join(" · ")})`;
}

export function profitBasisFor(status: string, issuedCount: number): ProfitBasis {
  return issuedCount > 0 && (ISSUED_BASIS_STATUSES as readonly string[]).includes(status) ? "issued" : "quote";
}

// 귀속 구간 건수의 합 = 표에 보이는 전체 행 수(쪽 수의 근거).
export function bucketTotal(buckets: readonly { count: number }[]): number {
  return buckets.reduce((sum, bucket) => sum + bucket.count, 0);
}

// D-91 — 50건씩 번호 페이지. 쪽 보정·쪽 수 규칙은 lib/paging(04-29) 그대로 쓴다.
export function resolveListPage(
  buckets: readonly { count: number }[],
  rawPage: string | number | undefined,
): { total: number; pageCount: number; page: number; offset: number; limit: number } {
  const total = bucketTotal(buckets);
  const pageCount = pageCountFrom(total, LIST_PAGE_SIZE);
  const page = clampPage(rawPage, pageCount);
  return { total, pageCount, page, offset: (page - 1) * LIST_PAGE_SIZE, limit: LIST_PAGE_SIZE };
}

export type ListPeriod = { from?: string; to?: string };
export type ListPeriodErrors = { from?: string; to?: string };

export const PERIOD_FORMAT_ERROR = "날짜 형식이 아닙니다 · 2026-09-18처럼 적어 주세요";
export const PERIOD_REVERSED_ERROR = "기간이 거꾸로입니다 · 앞 날짜를 먼저 적어 주세요";

// 연도 2000–2100 · `YYYY-MM-DD` · 달력에 있는 날짜만(C-08 — 틀린 값이 PG 날짜 오류로 가지 않는다).
function isListDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  if (year < 2000 || year > 2100) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

// 04-48(UX-04 · UI-SPEC Copywriting 「Error — 목록 기간 필터」) — 기간 필터 두 칸의 서버 판정. 오류가 하나라도 있으면
// 기간 전체를 적용하지 않는다(period null). 거꾸로 오류는 종료 칸에 단다.
export function parseListPeriod(
  rawFrom: string | undefined,
  rawTo: string | undefined,
): { period: ListPeriod | null; errors: ListPeriodErrors } {
  const from = rawFrom?.trim() || undefined;
  const to = rawTo?.trim() || undefined;
  const errors: ListPeriodErrors = {};
  if (from && !isListDate(from)) errors.from = PERIOD_FORMAT_ERROR;
  if (to && !isListDate(to)) errors.to = PERIOD_FORMAT_ERROR;
  if (!errors.from && !errors.to && from && to && from > to) errors.to = PERIOD_REVERSED_ERROR;
  if (errors.from || errors.to || (!from && !to)) return { period: null, errors };
  return { period: { ...(from ? { from } : {}), ...(to ? { to } : {}) }, errors };
}

// ---- 04-48 Task 2 — 조회 조건(C-08 · DR-30 · 엔지 리뷰 C 공백 10) ----

export type ListParam = string | readonly string[] | number | undefined;
export type NormalizedListParams = {
  status?: string;
  teamId?: string;
  year: number | "all";
  q?: string;
  from?: string;
  to?: string;
  page?: string;
};
export type ListEmptyKind = "none" | "default-view" | "filtered";

const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// 같은 이름이 여럿이면 첫 값, 빈 문자열은 없는 값.
export function firstListParam(value: ListParam): string | undefined {
  const first = typeof value === "string" || typeof value === "number" ? String(value) : value?.[0];
  return first ? first : undefined;
}

export function isTeamIdShape(value: string | undefined): boolean {
  return value !== undefined && UUID_SHAPE.test(value);
}

// 연도는 `all` 또는 2000–2100 정수, 그 밖(0000 · 99999 · 글자)은 올해 — 틀린 값이 PG 날짜 오류로 가지 않는다(C-08).
export function normalizeListYear(value: ListParam, thisYear: number): number | "all" {
  const raw = firstListParam(value);
  if (raw === "all") return "all";
  if (raw === undefined || !/^\d{4}$/.test(raw)) return thisYear;
  const year = Number(raw);
  return year >= 2000 && year <= 2100 ? year : thisYear;
}

export function normalizeListParams(
  raw: { status?: ListParam; teamId?: ListParam; year?: ListParam; q?: ListParam; from?: ListParam; to?: ListParam; page?: ListParam },
  opts: { teamIds: readonly string[]; thisYear: number },
): NormalizedListParams {
  const teamId = firstListParam(raw.teamId);
  const out: NormalizedListParams = { year: normalizeListYear(raw.year, opts.thisYear) };
  const status = firstListParam(raw.status);
  if (status) out.status = status;
  if (isTeamIdShape(teamId) && teamId && opts.teamIds.includes(teamId)) out.teamId = teamId;
  for (const key of ["q", "from", "to", "page"] as const) {
    const value = firstListParam(raw[key]);
    if (value) out[key] = value;
  }
  return out;
}

// 기본 보기(올해 · 전체 상태 · 전체 팀 · 검색어·기간 없음)와 다른 값이 있는가. 올해 연도 값은 필터로 세지 않는다.
export function isUserFiltered(params: Omit<NormalizedListParams, "page">, thisYear: number): boolean {
  return Boolean(params.status || params.teamId || params.q || params.from || params.to || params.year !== thisYear);
}

// 빈 목록 세 갈래(UI-SPEC S1 empty) — 행이 있으면 null.
export function listEmptyKind(input: { total: number; userFiltered: boolean; visibleCount: number }): ListEmptyKind | null {
  if (input.total > 0) return null;
  if (input.visibleCount === 0) return "none";
  return input.userFiltered ? "filtered" : "default-view";
}

// 연도 선택지 — 기본 창(내년 ~ 3년 전) + 창 밖이지만 정규화를 통과한 요청 연도(선택된 채 보이게), 내림차순.
export function yearOptions(thisYear: number, requested: number | "all"): number[] {
  const years = [thisYear + 1, thisYear, thisYear - 1, thisYear - 2, thisYear - 3];
  if (requested !== "all" && !years.includes(requested)) years.push(requested);
  return years.sort((a, b) => b - a);
}

// 목록 기간 칸(D-89) — 식별자형 날짜라 쉼표 없음.
export function formatListPeriod(start: string | null, end: string | null, viewYear: number | null): string {
  if (!start && !end) return "—";
  const side = (date: string | null) => (!date ? "—" : Number(date.slice(0, 4)) === viewYear ? date.slice(5) : date);
  if (start && end) {
    if (start.slice(0, 4) !== end.slice(0, 4)) return `${start.slice(0, 7)} ~ ${end.slice(0, 7)}`;
    return `${side(start)} ~ ${end.slice(5)}`;
  }
  return `${side(start)} ~ ${side(end)}`;
}

// DR-30 — 기간이 연도와 겹치는가. 기간이 없거나 전체 연도면 늘 겹친다. 열린 쪽은 끝없이 본다.
export function periodOverlapsYear(period: ListPeriod | null, year: number | "all"): boolean {
  if (year === "all" || !period || (!period.from && !period.to)) return true;
  return (!period.from || period.from <= `${year}-12-31`) && (!period.to || period.to >= `${year}-01-01`);
}

// DR-30 연도 자동 전환 — 제출된 기간(형식 오류 없음)이 선택 연도와 겹치지 않으면 고칠 연도(같은 해면 그 해, 해를 걸치거나
// 한쪽이 열려 있으면 `all`), 바꿀 것이 없으면 null. 멱등이다(돌려준 연도는 늘 기간과 겹친다).
export function reconcileListYear(input: { year: string | number; from?: string; to?: string }): string | null {
  const year = input.year === "all" ? "all" : Number(input.year);
  if (year !== "all" && !Number.isInteger(year)) return null;
  const { period } = parseListPeriod(input.from, input.to);
  if (!period || periodOverlapsYear(period, year)) return null;
  if (period.from && period.to && period.from.slice(0, 4) === period.to.slice(0, 4)) return period.from.slice(0, 4);
  return "all";
}

// (RED 골격 — 04-48 Task 3)
export function filterSummary(input: { year: number | "all"; statusLabel: string; teamLabel: string; from?: string; to?: string }): string[] {
  return [String(input.year)];
}
