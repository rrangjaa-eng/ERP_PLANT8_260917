import {
  allocateLeave,
  balanceFiscalYears,
  buildLeaveGrants,
  requestBalanceOf,
  summarizeLeaveBalance,
  type LeaveAdjustmentInput,
  type LeaveRequestInput,
} from "@/domain/leave/balance";

// 04.1-03 단위 사례표 공용 — 서비스와 같은 순서(배분 연도 범위 → 부여 목록 → 배분 → 요약)로
// 순수 함수만 부른다. 테스트 파일이 아니다(수집되지 않는다).
export type BalanceCase = {
  hireDate: string | null;
  resignationDate?: string | null;
  fiscalYear: number;
  asOf: string;
  annualDays?: Record<number, number>;
  adjustments?: LeaveAdjustmentInput[];
  requests?: LeaveRequestInput[];
};

export function runBalance(input: BalanceCase) {
  const fiscalYears = balanceFiscalYears(input.hireDate, input.fiscalYear);
  const annualDaysByYear: Record<number, number> = {};
  for (const year of fiscalYears) annualDaysByYear[year] = input.annualDays?.[year] ?? 15;
  const grants = buildLeaveGrants({
    hireDate: input.hireDate,
    resignationDate: input.resignationDate ?? null,
    fiscalYears,
    annualDaysByYear,
    adjustments: input.adjustments ?? [],
    asOf: input.asOf,
  });
  const allocations = allocateLeave(grants, input.requests ?? []);
  const summary = summarizeLeaveBalance({
    fiscalYear: input.fiscalYear,
    asOf: input.asOf,
    hireDate: input.hireDate,
    grants,
    allocations,
  });
  return { grants, allocations, summary };
}

export function runRequestBalance(input: BalanceCase & { request: LeaveRequestInput }) {
  const { summary, allocations } = runBalance({ ...input, requests: [...(input.requests ?? []), input.request] });
  return requestBalanceOf(summary, allocations, input.request.id);
}

export function approved(id: string, startDate: string, quarters: number): LeaveRequestInput {
  return { id, startDate, quarters, status: "approved" };
}

export function pending(id: string, startDate: string, quarters: number): LeaveRequestInput {
  return { id, startDate, quarters, status: "pending" };
}
