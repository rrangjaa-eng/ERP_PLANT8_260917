import type { DtoSpec } from "@/domain/permissions/project";
import { registerDto } from "@/domain/permissions/dto-registry";
import type { HalfPeriod, LeaveKind } from "@/domain/leave/days";
import type { AnnualBalanceLine, MonthlyBalanceLine, RequestBalance, ResignationBalance } from "@/domain/leave/balance";

// 04.1(ROADMAP 기준 5): 연차 DTO — 필드 전부 leave.value.

export type LeaveRequestDto = {
  id: string;
  number: string | null;
  drafterName: string;
  kind: LeaveKind;
  startDate: string;
  endDate: string;
  half: HalfPeriod | null;
  daysQuarters: number;
  days: string;
  fiscalYear: number;
  note: string | null;
  instanceId: string | null;
  status: string | null;
  version: number | null;
  createdAt: Date;
};

export type LeaveRequestSource = LeaveRequestDto;

export const LEAVE_REQUEST_DTO_SPEC: DtoSpec<LeaveRequestSource, LeaveRequestDto> = {
  fields: [
    { key: "id", from: "id", infoItem: "leave.value" },
    { key: "number", from: "number", infoItem: "leave.value" },
    { key: "drafterName", from: "drafterName", infoItem: "leave.value" },
    { key: "kind", from: "kind", infoItem: "leave.value" },
    { key: "startDate", from: "startDate", infoItem: "leave.value" },
    { key: "endDate", from: "endDate", infoItem: "leave.value" },
    { key: "half", from: "half", infoItem: "leave.value" },
    { key: "daysQuarters", from: "daysQuarters", infoItem: "leave.value" },
    { key: "days", from: "days", infoItem: "leave.value" },
    { key: "fiscalYear", from: "fiscalYear", infoItem: "leave.value" },
    { key: "note", from: "note", infoItem: "leave.value" },
    { key: "instanceId", from: "instanceId", infoItem: "leave.value" },
    { key: "status", from: "status", infoItem: "leave.value" },
    { key: "version", from: "version", infoItem: "leave.value" },
    { key: "createdAt", from: "createdAt", infoItem: "leave.value" },
  ],
};

// 연차 잔고(본인 · 관리자용) — 연차 줄 · 월차 줄 두 객체(두 남음을 합친 필드를 두지 않는다).
// `hireDate` · `resignationDate`는 조회 연도와 무관하게 늘 싣는다(C-N01). 퇴직 줄 재료
// `resignation`은 조회 연도 = 퇴직 연도일 때만 있다(ENG-4 · CXF2).
export type LeaveBalanceDto = {
  fiscalYear: number;
  hireDate: string | null;
  resignationDate: string | null;
  annual: AnnualBalanceLine;
  monthly: MonthlyBalanceLine | null;
  resignation: ResignationBalance | null;
};

export const LEAVE_BALANCE_DTO_SPEC: DtoSpec<LeaveBalanceDto, LeaveBalanceDto> = {
  fields: [
    { key: "fiscalYear", from: "fiscalYear", infoItem: "leave.value" },
    { key: "hireDate", from: "hireDate", infoItem: "leave.value" },
    { key: "resignationDate", from: "resignationDate", infoItem: "leave.value" },
    { key: "annual", from: "annual", infoItem: "leave.value" },
    { key: "monthly", from: "monthly", infoItem: "leave.value" },
    { key: "resignation", from: "resignation", infoItem: "leave.value" },
  ],
};

// 결재자 · 신청 미리보기용 잔고 행 재료(CEO-9) — 입사일 · 퇴직일 · 두 남음의 합계 필드가
// 명세에 없다. `monthlyRemaining`은 월차 줄(D4)이 없거나 입사일이 없으면 null(ENG-11).
export type LeaveRequestBalanceDto = RequestBalance;

export const LEAVE_REQUEST_BALANCE_DTO_SPEC: DtoSpec<LeaveRequestBalanceDto, LeaveRequestBalanceDto> = {
  fields: [
    { key: "annualRemaining", from: "annualRemaining", infoItem: "leave.value" },
    { key: "monthlyRemaining", from: "monthlyRemaining", infoItem: "leave.value" },
    { key: "pending", from: "pending", infoItem: "leave.value" },
    { key: "thisRequest", from: "thisRequest", infoItem: "leave.value" },
    { key: "plannedDeduction", from: "plannedDeduction", infoItem: "leave.value" },
    { key: "over", from: "over", infoItem: "leave.value" },
  ],
};

// 관리자 사람 상세의 조정 기록(CX-R2) — 사람 id · 작성자 id · 회계연도는 싣지 않는다.
export type LeaveAdjustmentDto = {
  id: string;
  kind: "annual" | "monthly";
  quarters: number;
  reason: string;
  createdAt: Date;
  createdByName: string;
};

export const LEAVE_ADJUSTMENT_DTO_SPEC: DtoSpec<LeaveAdjustmentDto, LeaveAdjustmentDto> = {
  fields: [
    { key: "id", from: "id", infoItem: "leave.value" },
    { key: "kind", from: "kind", infoItem: "leave.value" },
    { key: "quarters", from: "quarters", infoItem: "leave.value" },
    { key: "reason", from: "reason", infoItem: "leave.value" },
    { key: "createdAt", from: "createdAt", infoItem: "leave.value" },
    { key: "createdByName", from: "createdByName", infoItem: "leave.value" },
  ],
};

registerDto({
  name: "leaveRequest",
  fields: LEAVE_REQUEST_DTO_SPEC.fields.map((field) => ({ key: field.key, infoItem: field.infoItem })),
});

registerDto({
  name: "leaveBalance",
  fields: LEAVE_BALANCE_DTO_SPEC.fields.map((field) => ({ key: field.key, infoItem: field.infoItem })),
});

registerDto({
  name: "leaveRequestBalance",
  fields: LEAVE_REQUEST_BALANCE_DTO_SPEC.fields.map((field) => ({ key: field.key, infoItem: field.infoItem })),
});

registerDto({
  name: "leaveAdjustment",
  fields: LEAVE_ADJUSTMENT_DTO_SPEC.fields.map((field) => ({ key: field.key, infoItem: field.infoItem })),
});
