// 04.1-03(LEAV-01 · D-96 · D-97): 연차 잔고 — 순수 함수(DB·설정·시계 없음). 잔고는 저장하지
// 않고 매번 「부여(grant) 목록 + 신청」에서 계산한다. 회계연도 연차 · 입사 첫해 월차는 같은 명사
// (부여)의 두 출처다. 계산은 끝까지 정수 1/4일(쿼터)이고 날짜는 `YYYY-MM-DD` 문자열의 UTC 연산이다.

export type LeaveBucket = "annual" | "monthly";

export type LeaveGrant = {
  source: "annual" | "monthly";
  bucket: LeaveBucket;
  amountQuarters: number;
  validFrom: string;
  expiresOn: string;
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

function addMonths(date: string, months: number): string {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1 + months, d)).toISOString().slice(0, 10);
}

// 월차는 전부 입사 다음 해 12월 31일에 소멸한다(D-96).
export function monthlyExpiresOn(hireDate: string): string {
  return `${yearOf(hireDate) + 1}-12-31`;
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
  if (input.fiscalYear <= yearOf(input.hireDate)) return 0;
  return full;
}

export function buildLeaveGrants(input: {
  hireDate: string | null;
  resignationDate: string | null;
  fiscalYears: number[];
  annualDaysByYear: Record<number, number>;
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
  return grants;
}

// 신청을 시작일 순으로 훑어 시작일에 유효한 부여에 소멸 빠른 순(같으면 월차 먼저)으로 나눈다.
// 모자라면 시작일 회계연도의 연차로 넘기고 그 양이 `over`다(막지 않는다).
export function allocateLeave(grants: LeaveGrant[], requests: LeaveRequestInput[]): LeaveAllocation[] {
  const pools = grants.map((grant) => ({ ...grant, left: grant.amountQuarters }));
  const ordered = [...requests].sort((a, b) =>
    a.startDate === b.startDate ? (a.id < b.id ? -1 : a.id > b.id ? 1 : 0) : a.startDate < b.startDate ? -1 : 1,
  );
  return ordered.map((request) => {
    const valid = pools
      .filter((pool) => pool.left > 0 && pool.validFrom <= request.startDate && request.startDate <= pool.expiresOn)
      .sort((a, b) =>
        a.expiresOn !== b.expiresOn
          ? a.expiresOn < b.expiresOn
            ? -1
            : 1
          : a.bucket !== b.bucket
            ? a.bucket === "monthly"
              ? -1
              : 1
            : a.validFrom < b.validFrom
              ? -1
              : 1,
      );
    let need = request.quarters;
    let monthly = 0;
    let annual = 0;
    for (const pool of valid) {
      if (need === 0) break;
      const take = Math.min(pool.left, need);
      pool.left -= take;
      need -= take;
      if (pool.bucket === "monthly") monthly += take;
      else annual += take;
    }
    return {
      id: request.id,
      status: request.status,
      monthly,
      annual: annual + need,
      annualFiscalYear: yearOf(request.startDate),
      over: need,
    };
  });
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
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
  const usedQuarters = sum(inYear.filter((a) => a.status === "approved").map((a) => a.annual));
  const pendingQuarters = sum(inYear.filter((a) => a.status === "pending").map((a) => a.annual));
  const annual: AnnualBalanceLine = {
    grantQuarters,
    adjustmentQuarters: 0,
    usedQuarters,
    pendingQuarters,
    remainingQuarters: grantQuarters - usedQuarters - pendingQuarters,
  };

  let monthly: MonthlyBalanceLine | null;
  if (input.hireDate === null) {
    monthly = { status: "no_hire_date" };
  } else if (input.asOf >= input.hireDate && input.asOf < addMonths(input.hireDate, 12)) {
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
export function requestBalanceOf(
  summary: LeaveBalanceSummary,
  allocations: LeaveAllocation[],
  requestId: string,
): {
  annualRemaining: number;
  monthlyRemaining: number | null;
  pending: number;
  thisRequest: number;
  plannedDeduction: { monthly: number; annual: number };
  over: number;
} {
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
