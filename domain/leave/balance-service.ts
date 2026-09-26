import type { Viewer } from "@/domain/viewer";
import { can as defaultCan } from "@/domain/permissions/can";
import { project } from "@/domain/permissions/project";
import { getSettingValue } from "@/domain/settings/registry";
import { LEAVE_ANNUAL_DAYS } from "@/domain/settings/keys";
import { ForbiddenError, UserNotFoundError } from "@/domain/people";
import { seoulDateToUtcDate, seoulToday } from "@/lib/dates";
import { findUserById, type UserRow } from "@/repositories/users";
import { listLeaveUsage } from "@/repositories/leave-usage";
import { findLeaveRequestById } from "@/repositories/leave-requests";
import { canSeeLeaveDocument, LEAVE_DOCUMENT_KIND } from "@/domain/leave/access";
import { countLeaveQuarters, type LeaveDaysInput } from "@/domain/leave/days";
import {
  allocateLeave,
  buildLeaveGrants,
  requestBalanceOf,
  summarizeLeaveBalance,
  type LeaveAllocation,
  type LeaveBalanceSummary,
  type LeaveRequestInput,
} from "@/domain/leave/balance";
import {
  LEAVE_BALANCE_DTO_SPEC,
  LEAVE_REQUEST_BALANCE_DTO_SPEC,
  type LeaveBalanceDto,
  type LeaveRequestBalanceDto,
} from "@/domain/leave/dto";

// 04.1-03(LEAV-01): 연차 잔고 조회 — 저장된 잔고가 없다. 매번 부여 목록(설정 · 입사일 ·
// 퇴직일) + 신청(최종 승인 · 진행 중)에서 순수 함수(domain/leave/balance.ts)가 계산한다.
// 연차 모듈 입구(./index)를 import하지 않는다 — 보임 규칙은 access.ts에서(CEO-4).
// 「오늘」은 공개 입구의 seoulToday(deps?.now) 한 번에서만 얻는다(CX-B2 · CEO-11).

const PEOPLE_MENU = "admin.people";
// 저장 전 신청(미리보기)의 자리 id — 같은 시작일의 기존 신청 뒤에 배분된다.
const PREVIEW_REQUEST_ID = "~preview";

export type BalanceDeps = { now?: Date; can?: typeof defaultCan };

function yearOf(date: string): number {
  return Number(date.slice(0, 4));
}

// 배분 연도 범위(A2-01 · A-12): 월차 창이 입사 연도 H와 H+1에 걸치므로 H ≤ Y ≤ H+1이면
// H ~ Y를 함께 배분한다. 그 밖(입사일 없음 · Y ≥ H+2 · Y < H)은 Y 한 해.
function balanceYears(hireDate: string | null, fiscalYear: number): number[] {
  if (hireDate === null) return [fiscalYear];
  const hireYear = yearOf(hireDate);
  if (fiscalYear < hireYear || fiscalYear > hireYear + 1) return [fiscalYear];
  const years: number[] = [];
  for (let year = hireYear; year <= fiscalYear; year++) years.push(year);
  return years;
}

async function computeBalance(
  viewer: Viewer,
  user: UserRow,
  fiscalYear: number,
  today: string,
  extra?: LeaveRequestInput,
): Promise<{ summary: LeaveBalanceSummary; allocations: LeaveAllocation[] }> {
  const years = balanceYears(user.hireDate, fiscalYear);
  const annualDaysByYear: Record<number, number> = {};
  for (const year of years) {
    annualDaysByYear[year] = await getSettingValue(LEAVE_ANNUAL_DAYS, { asOf: seoulDateToUtcDate(`${year}-01-01`) });
  }
  const usage = await listLeaveUsage(viewer, { drafterId: user.id, fiscalYears: years, documentKind: LEAVE_DOCUMENT_KIND });
  const requests: LeaveRequestInput[] = usage.map((row) => ({
    id: row.id,
    startDate: row.startDate,
    quarters: row.daysQuarters,
    status: row.status,
  }));
  if (extra && !requests.some((request) => request.id === extra.id)) requests.push(extra);

  const grants = buildLeaveGrants({
    hireDate: user.hireDate,
    resignationDate: user.resignationDate,
    fiscalYears: years,
    annualDaysByYear,
    asOf: today,
  });
  const allocations = allocateLeave(grants, requests);
  const summary = summarizeLeaveBalance({ fiscalYear, asOf: today, hireDate: user.hireDate, grants, allocations });
  return { summary, allocations };
}

async function balanceDto(viewer: Viewer, user: UserRow, fiscalYear: number, today: string): Promise<Partial<LeaveBalanceDto>> {
  const { summary } = await computeBalance(viewer, user, fiscalYear, today);
  const resignation =
    user.resignationDate !== null && yearOf(user.resignationDate) === fiscalYear
      ? {
          resignationDate: user.resignationDate,
          annualRemainingQuarters: summary.annual.remainingQuarters,
          monthlyRemainingQuarters: summary.monthly?.status === "active" ? summary.monthly.remainingQuarters : 0,
        }
      : null;
  const source: LeaveBalanceDto = {
    fiscalYear,
    hireDate: user.hireDate,
    resignationDate: user.resignationDate,
    annual: summary.annual,
    monthly: summary.monthly,
    resignation,
  };
  return project(viewer, source, LEAVE_BALANCE_DTO_SPEC);
}

// 본인 잔고 — 연도 기본값은 서울 오늘의 연도.
export async function getMyLeaveBalance(
  viewer: Viewer,
  input: { fiscalYear?: number },
  deps?: BalanceDeps,
): Promise<Partial<LeaveBalanceDto>> {
  const today = seoulToday(deps?.now);
  const user = await findUserById(viewer, viewer.id);
  if (!user) throw new UserNotFoundError("사람을 찾을 수 없습니다.");
  return balanceDto(viewer, user, input.fiscalYear ?? yearOf(today), today);
}

// 관리자 사람 상세의 잔고 — 사람 관리 보기 권한(admin.people view). 보관된 사람도 읽는다
// (퇴직 처리 = 퇴직일 + 보관, C-N01).
export async function getLeaveBalanceForUser(
  viewer: Viewer,
  userId: string,
  input: { fiscalYear: number },
  deps?: BalanceDeps,
): Promise<Partial<LeaveBalanceDto>> {
  const today = seoulToday(deps?.now);
  if (!(await (deps?.can ?? defaultCan)(viewer, PEOPLE_MENU, "view"))) {
    throw new ForbiddenError("연차 잔고를 볼 권한이 없습니다.");
  }
  const user = await findUserById(viewer, userId);
  if (!user) throw new UserNotFoundError("사람을 찾을 수 없습니다.");
  return balanceDto(viewer, user, input.fiscalYear, today);
}

async function requestBalanceDto(
  viewer: Viewer,
  user: UserRow,
  request: LeaveRequestInput,
  fiscalYear: number,
  today: string,
): Promise<Partial<LeaveRequestBalanceDto>> {
  const { summary, allocations } = await computeBalance(viewer, user, fiscalYear, today, request);
  const source: LeaveRequestBalanceDto = requestBalanceOf(summary, allocations, request.id);
  return project(viewer, source, LEAVE_REQUEST_BALANCE_DTO_SPEC);
}

// 결재자 · 기안자가 보는 한 문서의 잔고 행 — 그 문서를 볼 수 없으면 null.
export async function getLeaveBalanceForRequest(
  viewer: Viewer,
  leaveId: string,
  deps?: { now?: Date },
): Promise<Partial<LeaveRequestBalanceDto> | null> {
  const today = seoulToday(deps?.now);
  const leave = await findLeaveRequestById(viewer, { id: leaveId, documentKind: LEAVE_DOCUMENT_KIND });
  if (!leave) return null;
  if (!(await canSeeLeaveDocument(viewer, leave, { today }))) return null;
  const drafter = await findUserById(viewer, leave.drafterId);
  if (!drafter) return null;
  return requestBalanceDto(
    viewer,
    drafter,
    { id: leave.id, startDate: leave.startDate, quarters: leave.daysQuarters, status: "pending" },
    leave.fiscalYear,
    today,
  );
}

// 신청 폼 미리보기 — 저장 전 신청의 같은 계산. 입력이 아직 신청이 되지 않으면 null.
export async function previewLeaveBalance(
  viewer: Viewer,
  input: LeaveDaysInput,
  deps?: { now?: Date },
): Promise<Partial<LeaveRequestBalanceDto> | null> {
  const today = seoulToday(deps?.now);
  const days = countLeaveQuarters(input);
  if (!days.ok) return null;
  const user = await findUserById(viewer, viewer.id);
  if (!user) throw new UserNotFoundError("사람을 찾을 수 없습니다.");
  return requestBalanceDto(
    viewer,
    user,
    { id: PREVIEW_REQUEST_ID, startDate: days.startDate, quarters: days.quarters, status: "pending" },
    days.fiscalYear,
    today,
  );
}
