import type { ProjectStatus } from "@/domain/projects/status-transitions";
import { formatCount } from "@/lib/format-number";

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
