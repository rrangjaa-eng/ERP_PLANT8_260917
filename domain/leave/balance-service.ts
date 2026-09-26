import type { Viewer } from "@/domain/viewer";
import { can as defaultCan } from "@/domain/permissions/can";
import { project, projectMany } from "@/domain/permissions/project";
import { getSettingValue } from "@/domain/settings/registry";
import { LEAVE_ANNUAL_DAYS } from "@/domain/settings/keys";
import { ForbiddenError, UserNotFoundError, ValidationError } from "@/domain/people";
import { loadActionLogGate, recordActionInTx, type TxLogDeps } from "@/domain/approvals/tx-log";
import { withTransaction } from "@/lib/db-transaction";
import { seoulDateToUtcDate, seoulToday } from "@/lib/dates";
import { findUserById, type UserRow } from "@/repositories/users";
import { listLeaveUsage } from "@/repositories/leave-usage";
import { findLeaveRequestById } from "@/repositories/leave-requests";
import { insertLeaveAdjustment, listLeaveAdjustments } from "@/repositories/leave-adjustments";
import { canSeeLeaveDocument, LEAVE_DOCUMENT_KIND } from "@/domain/leave/access";
import { countLeaveQuarters, type LeaveDaysInput } from "@/domain/leave/days";
import {
  allocateLeave,
  balanceFiscalYears,
  buildLeaveGrants,
  checkLeaveAdjustment,
  monthlyExpiresOn,
  requestBalanceOf,
  resignationBalanceOf,
  summarizeLeaveBalance,
  type LeaveAdjustmentField,
  type LeaveAllocation,
  type LeaveBalanceSummary,
  type LeaveBucket,
  type LeaveRequestInput,
} from "@/domain/leave/balance";
import {
  LEAVE_ADJUSTMENT_DTO_SPEC,
  LEAVE_BALANCE_DTO_SPEC,
  LEAVE_REQUEST_BALANCE_DTO_SPEC,
  type LeaveAdjustmentDto,
  type LeaveBalanceDto,
  type LeaveRequestBalanceDto,
} from "@/domain/leave/dto";

// 04.1-03(LEAV-01): 연차 잔고 조회 · 조정 — 저장된 잔고가 없다. 매번 부여 목록(설정 · 입사일 ·
// 퇴직일 · 조정) + 신청(최종 승인 · 진행 중)에서 순수 함수(domain/leave/balance.ts)가 계산한다.
// 연차 모듈 입구(./index)를 import하지 않는다 — 보임 규칙은 access.ts에서(CEO-4).
// 「오늘」은 공개 입구의 seoulToday(deps?.now) 한 번에서만 얻는다(CX-B2 · CEO-11).

const PEOPLE_MENU = "admin.people";
// 저장 전 신청(미리보기)의 자리 id — 같은 시작일의 기존 신청 뒤에 배분된다.
const PREVIEW_REQUEST_ID = "~preview";
const BUCKETS: readonly string[] = ["annual", "monthly"];

// 칸 이름을 가진 조정 입력 오류 — 04.1-06 폼이 칸 아래에 붙인다.
export class LeaveAdjustmentValidationError extends ValidationError {
  constructor(
    readonly field: LeaveAdjustmentField,
    message: string,
  ) {
    super(message);
  }
}

export type BalanceDeps = { now?: Date; can?: typeof defaultCan };

function yearOf(date: string): number {
  return Number(date.slice(0, 4));
}

async function computeBalance(
  viewer: Viewer,
  user: UserRow,
  fiscalYear: number,
  today: string,
  extra?: LeaveRequestInput,
): Promise<{ summary: LeaveBalanceSummary; allocations: LeaveAllocation[] }> {
  const years = balanceFiscalYears(user.hireDate, fiscalYear);
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
  // 조정은 대상자의 전부를 넘기고 창 규칙(연차 = 그 회계연도 · 월차 = 월차 창)이 거른다.
  const adjustments = (await listLeaveAdjustments(viewer, user.id)).map((row) => ({
    id: row.id,
    bucket: row.bucket as LeaveBucket,
    fiscalYear: row.fiscalYear,
    amountQuarters: row.amountQuarters,
    createdOn: seoulToday(row.createdAt),
  }));

  const grants = buildLeaveGrants({
    hireDate: user.hireDate,
    resignationDate: user.resignationDate,
    fiscalYears: years,
    annualDaysByYear,
    adjustments,
    asOf: today,
  });
  const allocations = allocateLeave(grants, requests);
  const summary = summarizeLeaveBalance({ fiscalYear, asOf: today, hireDate: user.hireDate, grants, allocations });
  return { summary, allocations };
}

async function balanceDto(viewer: Viewer, user: UserRow, fiscalYear: number, today: string): Promise<Partial<LeaveBalanceDto>> {
  const { summary } = await computeBalance(viewer, user, fiscalYear, today);
  const source: LeaveBalanceDto = {
    fiscalYear,
    hireDate: user.hireDate,
    resignationDate: user.resignationDate,
    annual: summary.annual,
    monthly: summary.monthly,
    resignation: resignationBalanceOf(summary, user.resignationDate),
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
  if (!user) throw new UserNotFoundError("사람 찾을 수 없음");
  return balanceDto(viewer, user, input.fiscalYear ?? yearOf(today), today);
}

// 관리자 사람 상세의 잔고 — 사람 관리 보기 권한(admin.people view). 받은 연도를 그대로 쓰고
// (CXF2), 보관된 사람도 읽는다(퇴직 처리 = 퇴직일 + 보관, C-N01).
export async function getLeaveBalanceForUser(
  viewer: Viewer,
  userId: string,
  input: { fiscalYear: number },
  deps?: BalanceDeps,
): Promise<Partial<LeaveBalanceDto>> {
  const today = seoulToday(deps?.now);
  if (!(await (deps?.can ?? defaultCan)(viewer, PEOPLE_MENU, "view"))) {
    throw new ForbiddenError("연차 잔고 열람 권한 없음");
  }
  const user = await findUserById(viewer, userId);
  if (!user) throw new UserNotFoundError("사람 찾을 수 없음");
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
  return project(viewer, requestBalanceOf(summary, allocations, request.id), LEAVE_REQUEST_BALANCE_DTO_SPEC);
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
  if (!user) throw new UserNotFoundError("사람 찾을 수 없음");
  return requestBalanceDto(
    viewer,
    user,
    { id: PREVIEW_REQUEST_ID, startDate: days.startDate, quarters: days.quarters, status: "pending" },
    days.fiscalYear,
    today,
  );
}

export type AddLeaveAdjustmentInput = {
  userId: string;
  bucket: string;
  fiscalYear: number | null;
  amountDays: number;
  reason: string;
};

export type AddLeaveAdjustmentDeps = { now?: Date; can?: typeof defaultCan } & TxLogDeps;

// 관리자 연차·월차 조정 — 추가만 된다. 검증은 트랜잭션 전에 끝내고(행이 생기지 않는다), 조정
// 행과 행동 로그는 같은 tx다(로그가 실패하면 조정도 남지 않는다 — Codex HIGH 원자성).
export async function addLeaveAdjustment(
  viewer: Viewer,
  input: AddLeaveAdjustmentInput,
  deps?: AddLeaveAdjustmentDeps,
): Promise<{ id: string }> {
  const today = seoulToday(deps?.now);
  if (!(await (deps?.can ?? defaultCan)(viewer, PEOPLE_MENU, "write"))) {
    throw new ForbiddenError("연차 조정 권한 없음");
  }
  if (!BUCKETS.includes(input.bucket)) {
    throw new LeaveAdjustmentValidationError("bucket", "잔고 비어 있음 · 잔고 고르기");
  }
  const bucket = input.bucket as LeaveBucket;
  const user = await findUserById(viewer, input.userId);
  if (!user) throw new UserNotFoundError("사람 찾을 수 없음");
  const error = checkLeaveAdjustment({
    bucket,
    fiscalYear: input.fiscalYear,
    amountDays: input.amountDays,
    reason: input.reason,
    createdOn: today,
    hireDate: user.hireDate,
  });
  if (error) throw new LeaveAdjustmentValidationError(error.field, error.message);

  const gate = await loadActionLogGate();
  return withTransaction(async (tx) => {
    const row = await insertLeaveAdjustment(
      viewer,
      {
        userId: user.id,
        bucket,
        fiscalYear: input.fiscalYear,
        amountQuarters: input.amountDays * 4,
        reason: input.reason.trim(),
        createdBy: viewer.id,
        createdAt: deps?.now,
      },
      tx,
    );
    await recordActionInTx(
      viewer,
      { actionType: "document_create", entity: "leave_adjustment", entityId: row.id, detail: { userId: user.id, bucket } },
      tx,
      gate,
      { appendActionLog: deps?.appendActionLog },
    );
    return { id: row.id };
  });
}

// 관리자 사람 상세의 조정 기록(CX-R2) — 잔고와 같은 **보기** 판정(쓰기는 요구하지 않는다).
// 그 회계연도 잔고 줄에 들어가는 조정만: 연차는 fiscal_year = Y, 월차는 유효 창(입력한 날 ~
// 월차 소멸일)이 Y와 겹치는 것. 최신이 먼저.
export async function listLeaveAdjustmentsForUser(
  viewer: Viewer,
  input: { userId: string; fiscalYear: number },
  deps?: { can?: typeof defaultCan },
): Promise<Partial<LeaveAdjustmentDto>[]> {
  if (!(await (deps?.can ?? defaultCan)(viewer, PEOPLE_MENU, "view"))) {
    throw new ForbiddenError("연차 조정 기록 열람 권한 없음");
  }
  const user = await findUserById(viewer, input.userId);
  if (!user) throw new UserNotFoundError("사람 찾을 수 없음");
  const monthlyLastYear = user.hireDate === null ? null : yearOf(monthlyExpiresOn(user.hireDate));
  const rows = (await listLeaveAdjustments(viewer, input.userId)).filter((row) =>
    row.bucket === "annual"
      ? row.fiscalYear === input.fiscalYear
      : monthlyLastYear !== null && yearOf(seoulToday(row.createdAt)) <= input.fiscalYear && input.fiscalYear <= monthlyLastYear,
  );
  const sources: LeaveAdjustmentDto[] = rows.map((row) => ({
    id: row.id,
    kind: row.bucket as LeaveBucket,
    quarters: row.amountQuarters,
    reason: row.reason,
    createdAt: row.createdAt,
    createdByName: row.createdByName,
  }));
  return projectMany(viewer, sources, LEAVE_ADJUSTMENT_DTO_SPEC);
}
