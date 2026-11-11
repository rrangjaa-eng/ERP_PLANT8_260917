import type { DtoSpec } from "@/domain/permissions/project";
import { registerDto } from "@/domain/permissions/dto-registry";
import type { HalfPeriod, LeaveKind } from "@/domain/leave/days";
import type { AnnualBalanceLine, MonthlyBalanceLine, RequestBalance, ResignationBalance } from "@/domain/leave/balance";

// 04.1(ROADMAP 기준 5): 연차 DTO — 필드 전부 leave.value.

// 07.2-15(PU10): 취소 요청 상태 — none(취소 인스턴스 없음 · 반려 · 회수) · requested(결재 중) · cancelled(최종 승인).
export type LeaveCancelState = "none" | "requested" | "cancelled";

export type LeaveRequestDto = {
  id: string;
  number: string | null;
  drafterName: string;
  kind: LeaveKind;
  startDate: string;
  endDate: string;
  half: HalfPeriod | null;
  // 07.2-08(PU11): 반반차 시작 시각 `HH:MM` — 반반차가 아니거나 시각 없는 기존 행은 null.
  startTime: string | null;
  daysQuarters: number;
  days: string;
  fiscalYear: number;
  note: string | null;
  instanceId: string | null;
  status: string | null;
  version: number | null;
  createdAt: Date;
  cancelState: LeaveCancelState;
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
    { key: "startTime", from: "startTime", infoItem: "leave.value" },
    { key: "daysQuarters", from: "daysQuarters", infoItem: "leave.value" },
    { key: "days", from: "days", infoItem: "leave.value" },
    { key: "fiscalYear", from: "fiscalYear", infoItem: "leave.value" },
    { key: "note", from: "note", infoItem: "leave.value" },
    { key: "instanceId", from: "instanceId", infoItem: "leave.value" },
    { key: "status", from: "status", infoItem: "leave.value" },
    { key: "version", from: "version", infoItem: "leave.value" },
    { key: "createdAt", from: "createdAt", infoItem: "leave.value" },
    { key: "cancelState", from: "cancelState", infoItem: "leave.value" },
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

// 07.2-08(PU12 · D-7260): 사람별 연차 잔여 표 한 행 — 숫자 칸은 leave.value, 이름 · 퇴직 표시는 사람 정보, 팀 이름은 팀 정보.
// 부여 = 연차 부여 + 조정(남음 = 부여 − 사용 − 결재 중). 월차 남음은 월차 줄이 없으면 null. **두 잔고를 더한 칸은 두지 않는다.**
export type PeopleLeaveBalanceDto = {
  userId: string;
  name: string;
  resigned: boolean;
  teamName: string | null;
  grantedQuarters: number;
  usedQuarters: number;
  pendingQuarters: number;
  remainingQuarters: number;
  monthlyRemainingQuarters: number | null;
};

export const PEOPLE_LEAVE_BALANCE_DTO_SPEC: DtoSpec<PeopleLeaveBalanceDto, PeopleLeaveBalanceDto> = {
  fields: [
    { key: "userId", from: "userId", infoItem: "person.value" },
    { key: "name", from: "name", infoItem: "person.value" },
    { key: "resigned", from: "resigned", infoItem: "person.value" },
    { key: "teamName", from: "teamName", infoItem: "team.value" },
    { key: "grantedQuarters", from: "grantedQuarters", infoItem: "leave.value" },
    { key: "usedQuarters", from: "usedQuarters", infoItem: "leave.value" },
    { key: "pendingQuarters", from: "pendingQuarters", infoItem: "leave.value" },
    { key: "remainingQuarters", from: "remainingQuarters", infoItem: "leave.value" },
    { key: "monthlyRemainingQuarters", from: "monthlyRemainingQuarters", infoItem: "leave.value" },
  ],
};

registerDto({
  name: "peopleLeaveBalance",
  fields: PEOPLE_LEAVE_BALANCE_DTO_SPEC.fields.map((field) => ({ key: field.key, infoItem: field.infoItem })),
});

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
