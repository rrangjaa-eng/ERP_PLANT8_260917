import type { Viewer } from "@/domain/viewer";
import { can as defaultCan } from "@/domain/permissions/can";
import type { visible as defaultVisible } from "@/domain/permissions/visible";
import { project, projectMany } from "@/domain/permissions/project";
import { getSettingValue } from "@/domain/settings/registry";
import { LEAVE_ANNUAL_DAYS } from "@/domain/settings/keys";
import { ForbiddenError, SELF_LEAVE_EDIT_ERROR, UserNotFoundError, ValidationError } from "@/domain/people";
import { loadActionLogGate, recordActionInTx, type TxLogDeps } from "@/domain/approvals/tx-log";
import { withTransaction } from "@/lib/db-transaction";
import { seoulDateToUtcDate, seoulToday } from "@/lib/dates";
import { findUserById, type UserRow } from "@/repositories/users";
import { listLeaveUsage, type LeaveUsageRow } from "@/repositories/leave-usage";
import { findLeaveRequestsByIds, type LeaveRequestRow } from "@/repositories/leave-requests";
import { insertLeaveAdjustment, listLeaveAdjustments, type LeaveAdjustmentWithAuthor } from "@/repositories/leave-adjustments";
import { assertLeaveWrite, canSeeLeaveDocument, LEAVE_DOCUMENT_KIND } from "@/domain/leave/access";
import type { HolidayLookup } from "@/domain/holidays/business-day";
import { countLeaveQuarters, leaveYearRange, type LeaveDaysInput } from "@/domain/leave/days";
import { loadLeaveHolidays } from "@/domain/leave/guard";
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

// 잔고 재료 읽기 — 호출 하나 안에서만 사는 지역 메모(모듈 전역 캐시 없음). 여러 문서의 잔고를 한 번에
// 만들 때 사용 · 조정은 기안자별 한 번, 연차 일수 설정은 회계연도별 한 번만 읽는다(CEO-17 · Codex MEDIUM).
type BalanceReads = {
  annualDays: (year: number) => Promise<number>;
  usage: (drafterId: string, years: number[]) => Promise<LeaveUsageRow[]>;
  adjustments: (userId: string) => Promise<LeaveAdjustmentWithAuthor[]>;
  user: (userId: string) => Promise<UserRow | null>;
};

function memoized<K, V>(read: (key: K) => Promise<V>): (key: K) => Promise<V> {
  const memo = new Map<K, Promise<V>>();
  return (key) => {
    let value = memo.get(key);
    if (!value) {
      value = read(key);
      memo.set(key, value);
    }
    return value;
  };
}

function createBalanceReads(viewer: Viewer): BalanceReads {
  const usageByKey = memoized((key: string) => {
    const [drafterId = "", years = ""] = key.split("|");
    return listLeaveUsage(viewer, { drafterId, fiscalYears: years.split(",").map(Number), documentKind: LEAVE_DOCUMENT_KIND });
  });
  return {
    annualDays: memoized((year: number) => getSettingValue(LEAVE_ANNUAL_DAYS, { asOf: seoulDateToUtcDate(`${year}-01-01`) })),
    usage: (drafterId, years) => usageByKey(`${drafterId}|${years.join(",")}`),
    adjustments: memoized((userId: string) => listLeaveAdjustments(viewer, userId)),
    user: memoized((userId: string) => findUserById(viewer, userId)),
  };
}

async function computeBalance(
  viewer: Viewer,
  user: UserRow,
  fiscalYear: number,
  today: string,
  extra?: LeaveRequestInput,
  reads: BalanceReads = createBalanceReads(viewer),
): Promise<{ summary: LeaveBalanceSummary; allocations: LeaveAllocation[] }> {
  const years = balanceFiscalYears(user.hireDate, fiscalYear);
  const annualDaysByYear: Record<number, number> = {};
  for (const year of years) {
    annualDaysByYear[year] = await reads.annualDays(year);
  }
  const usage = await reads.usage(user.id, years);
  const requests: LeaveRequestInput[] = usage.map((row) => ({
    id: row.id,
    startDate: row.startDate,
    quarters: row.daysQuarters,
    status: row.status,
  }));
  if (extra && !requests.some((request) => request.id === extra.id)) requests.push(extra);
  // 조정은 대상자의 전부를 넘기고 창 규칙(연차 = 그 회계연도 · 월차 = 월차 창)이 거른다.
  const adjustments = (await reads.adjustments(user.id)).map((row) => ({
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
  reads?: BalanceReads,
  visible?: typeof defaultVisible,
): Promise<Partial<LeaveRequestBalanceDto>> {
  const { summary, allocations } = await computeBalance(viewer, user, fiscalYear, today, request, reads);
  return project(viewer, requestBalanceOf(summary, allocations, request.id), LEAVE_REQUEST_BALANCE_DTO_SPEC, visible ? { visible } : undefined);
}

// 결재자 · 기안자가 보는 한 문서의 잔고 행 — 그 문서를 볼 수 없으면 null.
export async function getLeaveBalanceForRequest(
  viewer: Viewer,
  leaveId: string,
  deps?: { now?: Date },
): Promise<Partial<LeaveRequestBalanceDto> | null> {
  return (await getLeaveBalancesForRequests(viewer, [leaveId], deps)).get(leaveId) ?? null;
}

export type RequestBalancesDeps = {
  now?: Date;
  // 요청 단위 노출 메모(결재함 한 번이 같은 메모를 쓴다 — CEO-17).
  visible?: typeof defaultVisible;
  // 호출자가 이미 읽고 보임 판정을 마친 연차 행(결재함 상세 — 연차 행을 다시 읽거나 판정하지 않는다, CXF2-B-RF02 · 검토 MEDIUM-1).
  leaves?: LeaveRequestRow[];
};

// 결재자 · 기안자가 보는 문서들의 잔고 행(신청용 DTO — 입사일 · 퇴직일 없음, CEO-9) — 볼 수 없는 문서는
// 결과에 없다. 사용 · 조정은 기안자별 한 번, 연차 일수 설정은 회계연도별 한 번 읽는다(CEO-17). 「오늘」은
// 이 입구의 서울 날짜 한 번(deps.now)뿐이다(CX-B2).
export async function getLeaveBalancesForRequests(
  viewer: Viewer,
  leaveIds: string[],
  deps?: RequestBalancesDeps,
): Promise<Map<string, Partial<LeaveRequestBalanceDto>>> {
  const today = seoulToday(deps?.now);
  const leaves = deps?.leaves
    ? deps.leaves.filter((leave) => leaveIds.includes(leave.id))
    : await findLeaveRequestsByIds(viewer, { ids: leaveIds, documentKind: LEAVE_DOCUMENT_KIND });
  const reads = createBalanceReads(viewer);
  const result = new Map<string, Partial<LeaveRequestBalanceDto>>();
  for (const leave of leaves) {
    if (!deps?.leaves && !(await canSeeLeaveDocument(viewer, leave, { today }))) continue;
    const drafter = await reads.user(leave.drafterId);
    if (!drafter) continue;
    result.set(
      leave.id,
      await requestBalanceDto(
        viewer,
        drafter,
        { id: leave.id, startDate: leave.startDate, quarters: leave.daysQuarters, status: "pending" },
        leave.fiscalYear,
        today,
        reads,
        deps?.visible,
      ),
    );
  }
  return result;
}


// 신청 폼 미리보기 — 저장 전 신청의 같은 계산. 입력이 아직 신청이 되지 않으면 null.
export async function previewLeaveBalance(
  viewer: Viewer,
  input: LeaveDaysInput,
  deps?: { now?: Date; holidays?: HolidayLookup },
): Promise<Partial<LeaveRequestBalanceDto> | null> {
  await assertLeaveWrite(viewer);
  const today = seoulToday(deps?.now);
  // 제출(submitLeave)과 같은 연도 범위 — 범위 밖 날짜는 날짜 전과 같다(그 해 잔고를 계산하지 않는다, Codex P2).
  const range = leaveYearRange(today);
  const holidays = deps?.holidays ?? (await loadLeaveHolidays(input.startDate, range));
  const days = countLeaveQuarters(input, range, holidays);
  const user = await findUserById(viewer, viewer.id);
  if (!user) throw new UserNotFoundError("사람 찾을 수 없음");
  if (!days.ok) {
    // 날짜 전(계산 전) — 오늘 회계연도의 두 남음 · 결재 중만(이번 신청 0, UI-SPEC S2 · 04.1-06 DOM 감사 #2).
    const { summary, allocations } = await computeBalance(viewer, user, yearOf(today), today);
    return project(viewer, requestBalanceOf(summary, allocations, PREVIEW_REQUEST_ID), LEAVE_REQUEST_BALANCE_DTO_SPEC);
  }
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
  if (viewer.id === input.userId) throw new ForbiddenError(SELF_LEAVE_EDIT_ERROR);
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
