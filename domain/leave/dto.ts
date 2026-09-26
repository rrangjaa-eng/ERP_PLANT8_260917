import type { DtoSpec } from "@/domain/permissions/project";
import { registerDto } from "@/domain/permissions/dto-registry";
import type { HalfPeriod, LeaveKind } from "@/domain/leave/days";

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

// 연차 잔고 — 연차 줄 · 월차 줄 두 객체(두 남음을 합친 필드를 두지 않는다).
// 인터페이스 먼저 — 줄의 내용과 계산은 04.1-03이 채운다.
export type LeaveBalanceDto = {
  fiscalYear: number;
  annual: object;
  monthly: object | null;
};

export const LEAVE_BALANCE_DTO_SPEC: DtoSpec<LeaveBalanceDto, LeaveBalanceDto> = {
  fields: [
    { key: "fiscalYear", from: "fiscalYear", infoItem: "leave.value" },
    { key: "annual", from: "annual", infoItem: "leave.value" },
    { key: "monthly", from: "monthly", infoItem: "leave.value" },
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
