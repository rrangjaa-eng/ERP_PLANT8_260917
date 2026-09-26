// 04.1-03(LEAV-01 · D-96 · D-97): 연차 잔고 — 순수 함수(DB·설정·시계 없음). 잔고는 저장하지
// 않고 매번 「부여(grant) 목록 + 신청」에서 계산한다. 회계연도 연차 · 입사 첫해 월차는 같은 명사
// (부여)의 두 출처다. 계산은 끝까지 정수 1/4일(쿼터)이고 날짜는 `YYYY-MM-DD` 문자열의 UTC 연산이다.

import { formatLeaveDays, type LeaveKind } from "@/domain/leave/days";

export type LeaveBucket = "annual" | "monthly";

// 조정도 부여의 한 출처다. 음수 조정은 같은 버킷 · 같은 창(소멸일)의 부여에서만 빠지는 차감
// 기록이다(ENG-13) — 다른 버킷으로 넘어가지 않고, 모자라면 그 버킷 남음이 음수가 된다.
export type LeaveGrant = {
  source: "annual" | "monthly" | "adjustment";
  bucket: LeaveBucket;
  amountQuarters: number;
  validFrom: string;
  expiresOn: string;
  id?: string;
};

// createdOn = 조정을 입력한 날(서울 날짜). 연차 조정만 fiscalYear가 있다.
export type LeaveAdjustmentInput = {
  id: string;
  bucket: LeaveBucket;
  fiscalYear: number | null;
  amountQuarters: number;
  createdOn: string;
};

export type LeaveRequestInput = { id: string; startDate: string; quarters: number; status: "approved" | "pending" };

export type LeaveAllocation = {
  id: string;
  status: "approved" | "pending";
  monthly: number;
  annual: number;
  annualFiscalYear: number;
  over: number;
};

export type AnnualBalanceLine = {
  grantQuarters: number;
  adjustmentQuarters: number;
  usedQuarters: number;
  pendingQuarters: number;
  remainingQuarters: number;
};

export type MonthlyBalanceLine =
  | {
      status: "active";
      accruedQuarters: number;
      usedQuarters: number;
      pendingQuarters: number;
      remainingQuarters: number;
      expiresOn: string;
    }
  | { status: "no_hire_date" };

export type ResignationBalance = {
  resignationDate: string;
  annualRemainingQuarters: number;
  monthlyRemainingQuarters: number;
};

export type LeaveBalanceSummary = {
  fiscalYear: number;
  annual: AnnualBalanceLine;
  monthly: MonthlyBalanceLine | null;
};

function yearOf(date: string): number {
  return Number(date.slice(0, 4));
}

function parts(date: string): [number, number, number] {
  return date.split("-").map(Number) as [number, number, number];
}

// 같은 날, 그달에 없으면 말일(1월 31일 + 1개월 → 2월 28/29일).
function addMonths(date: string, months: number): string {
  const [y, m, d] = parts(date);
  const lastDay = new Date(Date.UTC(y, m - 1 + months + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m - 1 + months, Math.min(d, lastDay))).toISOString().slice(0, 10);
}

const DAY_MS = 24 * 60 * 60 * 1000;

function dayNumber(date: string): number {
  const [y, m, d] = parts(date);
  return Date.UTC(y, m - 1, d) / DAY_MS;
}

// 월차는 전부 입사 다음 해 12월 31일에 소멸한다(D-96).
export function monthlyExpiresOn(hireDate: string): string {
  return `${yearOf(hireDate) + 1}-12-31`;
}

// 배분 연도 범위(A2-01 · A-12): 월차 창이 입사 연도 H와 H+1에 걸치므로 H ≤ Y ≤ H+1이면
// H ~ Y를 함께 배분한다. 그 밖(입사일 없음 · Y ≥ H+2 · Y < H)은 Y 한 해.
export function balanceFiscalYears(hireDate: string | null, fiscalYear: number): number[] {
  if (hireDate === null) return [fiscalYear];
  const hireYear = yearOf(hireDate);
  if (fiscalYear < hireYear || fiscalYear > hireYear + 1) return [fiscalYear];
  const years: number[] = [];
  for (let year = hireYear; year <= fiscalYear; year++) years.push(year);
  return years;
}

// 회계연도 Y의 연차 부여(쿼터).
export function annualGrantQuarters(input: {
  fiscalYear: number;
  hireDate: string | null;
  resignationDate: string | null;
  annualDays: number;
}): number {
  const full = input.annualDays * 4;
  if (input.resignationDate !== null && input.fiscalYear > yearOf(input.resignationDate)) return 0;
  if (input.hireDate === null) return full;
  const hireYear = yearOf(input.hireDate);
  if (input.fiscalYear <= hireYear) return 0;
  if (input.fiscalYear > hireYear + 1) return full;
  // 입사 다음 해(R1): 0.25일 단위 올림 — ceil(full × 근무일수 / 그 해 날수)를 정수 나눗셈으로.
  const worked = dayNumber(`${hireYear}-12-31`) - dayNumber(input.hireDate) + 1;
  const daysInYear = dayNumber(`${hireYear}-12-31`) - dayNumber(`${hireYear}-01-01`) + 1;
  return Math.floor((full * worked + daysInYear - 1) / daysInYear);
}

export function buildLeaveGrants(input: {
  hireDate: string | null;
  resignationDate: string | null;
  fiscalYears: number[];
  annualDaysByYear: Record<number, number>;
  adjustments: LeaveAdjustmentInput[];
  asOf: string;
}): LeaveGrant[] {
  const grants: LeaveGrant[] = [];
  for (const fiscalYear of input.fiscalYears) {
    const amountQuarters = annualGrantQuarters({
      fiscalYear,
      hireDate: input.hireDate,
      resignationDate: input.resignationDate,
      annualDays: input.annualDaysByYear[fiscalYear] ?? 0,
    });
    if (amountQuarters > 0) {
      grants.push({
        source: "annual",
        bucket: "annual",
        amountQuarters,
        validFrom: `${fiscalYear}-01-01`,
        expiresOn: `${fiscalYear}-12-31`,
      });
    }
  }
  if (input.hireDate !== null) {
    const expiresOn = monthlyExpiresOn(input.hireDate);
    for (let k = 1; k <= 11; k++) {
      const accrual = addMonths(input.hireDate, k);
      if (accrual > input.asOf) break;
      if (input.resignationDate !== null && accrual > input.resignationDate) break;
      grants.push({ source: "monthly", bucket: "monthly", amountQuarters: 4, validFrom: accrual, expiresOn });
    }
  }
  for (const adjustment of input.adjustments) {
    if (adjustment.bucket === "annual" && adjustment.fiscalYear !== null) {
      grants.push({
        source: "adjustment",
        bucket: "annual",
        amountQuarters: adjustment.amountQuarters,
        validFrom: `${adjustment.fiscalYear}-01-01`,
        expiresOn: `${adjustment.fiscalYear}-12-31`,
        id: adjustment.id,
      });
    } else if (adjustment.bucket === "monthly" && input.hireDate !== null) {
      grants.push({
        source: "adjustment",
        bucket: "monthly",
        amountQuarters: adjustment.amountQuarters,
        validFrom: adjustment.createdOn > input.hireDate ? adjustment.createdOn : input.hireDate,
        expiresOn: monthlyExpiresOn(input.hireDate),
        id: adjustment.id,
      });
    }
  }
  return grants;
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

type Pool = LeaveGrant & { left: number };

// 차감 기록(음수 조정)과 신청을 (날짜, 조정 먼저, id) 순으로 한 줄로 훑는다. 신청은 시작일에
// 유효한 부여에 소멸 빠른 순(같으면 월차 먼저)으로 나누고, 모자라면 시작일 회계연도의 연차로
// 넘기며 그 양이 `over`다(막지 않는다 — 그 해 연차 부여가 없어도 같다, CX-R02).
export function allocateLeave(grants: LeaveGrant[], requests: LeaveRequestInput[]): LeaveAllocation[] {
  const pools: Pool[] = grants.filter((grant) => grant.amountQuarters > 0).map((grant) => ({ ...grant, left: grant.amountQuarters }));
  type Event =
    | { kind: 0; date: string; id: string; deduction: LeaveGrant }
    | { kind: 1; date: string; id: string; request: LeaveRequestInput };
  const events: Event[] = [
    ...grants
      .filter((grant) => grant.amountQuarters < 0)
      .map((deduction): Event => ({ kind: 0, date: deduction.validFrom, id: deduction.id ?? "", deduction })),
    ...requests.map((request): Event => ({ kind: 1, date: request.startDate, id: request.id, request })),
  ].sort((a, b) => compare(a.date, b.date) || a.kind - b.kind || compare(a.id, b.id));

  const allocations: LeaveAllocation[] = [];
  for (const event of events) {
    if (event.kind === 0) {
      let need = -event.deduction.amountQuarters;
      const sameWindow = pools
        .filter((pool) => pool.bucket === event.deduction.bucket && pool.expiresOn === event.deduction.expiresOn)
        .sort((a, b) => compare(a.validFrom, b.validFrom));
      for (const pool of sameWindow) {
        const take = Math.min(pool.left, need);
        pool.left -= take;
        need -= take;
      }
      continue;
    }
    const request = event.request;
    const valid = pools
      .filter((pool) => pool.left > 0 && pool.validFrom <= request.startDate && request.startDate <= pool.expiresOn)
      .sort(
        (a, b) =>
          compare(a.expiresOn, b.expiresOn) ||
          (a.bucket === b.bucket ? 0 : a.bucket === "monthly" ? -1 : 1) ||
          compare(a.validFrom, b.validFrom),
      );
    let need = request.quarters;
    let monthly = 0;
    let annual = 0;
    for (const pool of valid) {
      const take = Math.min(pool.left, need);
      pool.left -= take;
      need -= take;
      if (pool.bucket === "monthly") monthly += take;
      else annual += take;
    }
    allocations.push({
      id: request.id,
      status: request.status,
      monthly,
      annual: annual + need,
      annualFiscalYear: yearOf(request.startDate),
      over: need,
    });
  }
  return allocations;
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

// D4(ENG-11 · A2-01): 월차 줄은 조회 기준일이 근속 첫 1년 안이거나 조회 연도에 유효한 월차
// 부여(적립 · 양수 월차 조정)가 하나라도 있으면 있다 — 값이 0이어도.
function hasMonthlyLine(hireDate: string, fiscalYear: number, asOf: string, grants: LeaveGrant[]): boolean {
  if (asOf >= hireDate && asOf < addMonths(hireDate, 12)) return true;
  return grants.some(
    (g) =>
      g.bucket === "monthly" &&
      g.amountQuarters > 0 &&
      g.validFrom <= asOf &&
      g.validFrom <= `${fiscalYear}-12-31` &&
      g.expiresOn >= `${fiscalYear}-01-01`,
  );
}

// 남음은 줄마다 하나의 정의 — 부여(+조정) − 사용(최종 승인) − 결재 중(ENG-12 · D3). 두 줄의
// 남음을 더한 필드는 만들지 않는다(사용자 요구 2026-09-24 11:43).
export function summarizeLeaveBalance(input: {
  fiscalYear: number;
  asOf: string;
  hireDate: string | null;
  grants: LeaveGrant[];
  allocations: LeaveAllocation[];
}): LeaveBalanceSummary {
  const yearStart = `${input.fiscalYear}-01-01`;
  const inYear = input.allocations.filter((a) => a.annualFiscalYear === input.fiscalYear);
  const grantQuarters = sum(
    input.grants.filter((g) => g.source === "annual" && g.validFrom === yearStart).map((g) => g.amountQuarters),
  );
  const adjustmentQuarters = sum(
    input.grants
      .filter((g) => g.source === "adjustment" && g.bucket === "annual" && g.validFrom === yearStart)
      .map((g) => g.amountQuarters),
  );
  const usedQuarters = sum(inYear.filter((a) => a.status === "approved").map((a) => a.annual));
  const pendingQuarters = sum(inYear.filter((a) => a.status === "pending").map((a) => a.annual));
  const annual: AnnualBalanceLine = {
    grantQuarters,
    adjustmentQuarters,
    usedQuarters,
    pendingQuarters,
    remainingQuarters: grantQuarters + adjustmentQuarters - usedQuarters - pendingQuarters,
  };

  let monthly: MonthlyBalanceLine | null;
  if (input.hireDate === null) {
    monthly = { status: "no_hire_date" };
  } else if (hasMonthlyLine(input.hireDate, input.fiscalYear, input.asOf, input.grants)) {
    const accruedQuarters = sum(input.grants.filter((g) => g.bucket === "monthly").map((g) => g.amountQuarters));
    const used = sum(input.allocations.filter((a) => a.status === "approved").map((a) => a.monthly));
    const pending = sum(input.allocations.filter((a) => a.status === "pending").map((a) => a.monthly));
    monthly = {
      status: "active",
      accruedQuarters,
      usedQuarters: used,
      pendingQuarters: pending,
      remainingQuarters: accruedQuarters - used - pending,
      expiresOn: monthlyExpiresOn(input.hireDate),
    };
  } else {
    monthly = null;
  }

  return { fiscalYear: input.fiscalYear, annual, monthly };
}

// 한 신청의 잔고 행 재료(D3): 두 남음은 다른 문서의 진행 중 신청만 빼고 이 문서는 빼지 않는다.
// `결재 중`은 이 문서를 뺀 그 회계연도의 다른 진행 중 신청 합이다.
export type RequestBalance = {
  annualRemaining: number;
  monthlyRemaining: number | null;
  pending: number;
  thisRequest: number;
  plannedDeduction: { monthly: number; annual: number };
  over: number;
};

export function requestBalanceOf(summary: LeaveBalanceSummary, allocations: LeaveAllocation[], requestId: string): RequestBalance {
  const own = allocations.find((a) => a.id === requestId);
  const mine = own ?? { monthly: 0, annual: 0, over: 0, status: "approved" as const };
  const ownPendingAnnual = mine.status === "pending" ? mine.annual : 0;
  const ownPendingMonthly = mine.status === "pending" ? mine.monthly : 0;
  const ownUsedAnnual = mine.status === "approved" ? mine.annual : 0;
  const ownUsedMonthly = mine.status === "approved" ? mine.monthly : 0;
  const pending = sum(
    allocations
      .filter((a) => a.id !== requestId && a.status === "pending" && a.annualFiscalYear === summary.fiscalYear)
      .map((a) => a.monthly + a.annual),
  );
  return {
    annualRemaining: summary.annual.remainingQuarters + ownPendingAnnual + ownUsedAnnual,
    monthlyRemaining:
      summary.monthly?.status === "active" ? summary.monthly.remainingQuarters + ownPendingMonthly + ownUsedMonthly : null,
    pending,
    thisRequest: mine.monthly + mine.annual,
    plannedDeduction: { monthly: mine.monthly, annual: mine.annual },
    over: mine.over,
  };
}

// 퇴직 줄 재료 — 조회 연도 = 퇴직 연도일 때만 그 해 요약으로 만든다(D-97 · ENG-4 · CXF2).
export function resignationBalanceOf(summary: LeaveBalanceSummary, resignationDate: string | null): ResignationBalance | null {
  if (resignationDate === null || yearOf(resignationDate) !== summary.fiscalYear) return null;
  return {
    resignationDate,
    annualRemainingQuarters: summary.annual.remainingQuarters,
    monthlyRemainingQuarters: summary.monthly?.status === "active" ? summary.monthly.remainingQuarters : 0,
  };
}

// 조정 입력 검증(ENG-13 · 계획 가정 10) — 오류(칸 · 문구) 또는 null. 통과하면 amountDays × 4가
// 정수 쿼터다.
export type LeaveAdjustmentField = "amountDays" | "reason" | "fiscalYear" | "bucket";

export function checkLeaveAdjustment(input: {
  bucket: LeaveBucket;
  fiscalYear: number | null;
  amountDays: number;
  reason: string;
  createdOn: string;
  hireDate: string | null;
}): { field: LeaveAdjustmentField; message: string } | null {
  if (!Number.isFinite(input.amountDays) || !Number.isInteger(input.amountDays * 4)) {
    return { field: "amountDays", message: "일수는 0.25 단위 · 0.5처럼 적어 주세요" };
  }
  if (input.amountDays === 0) return { field: "amountDays", message: "일수가 0 · 빼려면 -1처럼 적기" };
  if (input.reason.trim() === "") return { field: "reason", message: "사유 비어 있음 · 사유 적기" };
  if ((input.bucket === "annual") !== (input.fiscalYear !== null)) {
    return { field: "fiscalYear", message: "잔고와 연도가 맞지 않음 · 다시 고르기" };
  }
  if (input.bucket === "monthly") {
    if (input.hireDate === null) return { field: "bucket", message: "입사일 없음 · 먼저 입사일 넣기" };
    const expiresOn = monthlyExpiresOn(input.hireDate);
    if (input.createdOn > expiresOn) return { field: "bucket", message: `월차 ${expiresOn} 소멸 · 연차로 조정하기` };
  }
  return null;
}

// 잔고 문자열(UI-SPEC Copywriting 원문) — 화면 넷(S1 · S2 · S3/S5 · S9)이 같은 함수를 쓴다.
// 두 잔고의 남음을 더한 값을 만드는 경로가 없다(사용자 요구 11:43).
export type BalanceLine = { text: string; tone: "default" | "muted" | "warning" };

const days = formatLeaveDays;

export function formatResignationLine(resignation: ResignationBalance): string {
  return `퇴직 ${resignation.resignationDate} · 남은 연차 ${days(resignation.annualRemainingQuarters)} · 월차 ${days(resignation.monthlyRemainingQuarters)}`;
}

export function formatBalanceLines(balance: {
  annual: AnnualBalanceLine;
  monthly: MonthlyBalanceLine | null;
  resignation?: ResignationBalance | null;
}): BalanceLine[] {
  if (balance.resignation) return [{ text: formatResignationLine(balance.resignation), tone: "default" }];
  const a = balance.annual;
  const adjustment = a.adjustmentQuarters !== 0 ? ` · 조정 ${days(a.adjustmentQuarters)}` : "";
  const lines: BalanceLine[] = [
    {
      text: `연차 ${days(a.grantQuarters)}${adjustment} · 사용 ${days(a.usedQuarters)} · 결재 중 ${days(a.pendingQuarters)} · 남음 ${days(a.remainingQuarters)}`,
      tone: "default",
    },
  ];
  const m = balance.monthly;
  if (m?.status === "no_hire_date") lines.push({ text: "월차 계산 불가 · 입사일 없음", tone: "default" });
  if (m?.status === "active") {
    lines.push({
      text: `월차 적립 ${days(m.accruedQuarters)} · 사용 ${days(m.usedQuarters)} · 결재 중 ${days(m.pendingQuarters)} · 남음 ${days(m.remainingQuarters)} · ${m.expiresOn} 소멸`,
      tone: "default",
    });
  }
  return lines;
}

export function formatBalanceRow(row: RequestBalance, kind: LeaveKind): BalanceLine[] | null {
  if (kind === "remote") return null;
  const monthly = row.monthlyRemaining !== null ? ` · 월차 남음 ${days(row.monthlyRemaining)}` : "";
  const lines: BalanceLine[] = [
    {
      text: `연차 남음 ${days(row.annualRemaining)}${monthly} · 결재 중 ${days(row.pending)} · 이번 신청 ${days(row.thisRequest)}`,
      tone: "default",
    },
  ];
  if (row.monthlyRemaining !== null) {
    lines.push({
      text: `차감 예정 월차 ${days(row.plannedDeduction.monthly)} · 연차 ${days(row.plannedDeduction.annual)}`,
      tone: "muted",
    });
  }
  if (row.over > 0) lines.push({ text: `잔여 초과 ${days(row.over)}`, tone: "warning" });
  return lines;
}
