import type { Viewer } from "@/domain/viewer";
import { can } from "@/domain/permissions/can";
import { recordAction as defaultRecordAction } from "@/domain/action-log/record";
import { toKstDate } from "@/domain/holidays/business-day";
import {
  ensureHolidayCandidates,
  ensureHolidayCandidatesLocked,
  recomputeFutureSubstitutes,
  withHolidayCalendarLock,
} from "@/domain/holidays/candidates";
import { HOLIDAY_KIND_LABELS, LunarTableRangeError, type HolidayKind } from "@/domain/holidays/rules";
import { UserFacingError } from "@/lib/actions/user-facing-error";
import { log } from "@/lib/log";
import type { DbOrTx } from "@/repositories/document-counters";
import {
  deleteHolidayById,
  findHolidayByDate,
  findHolidayDates,
  findYearConfirmation,
  findYearGeneration,
  insertManualHoliday,
  insertYearConfirmation,
  listHolidaysForYear,
  listHolidayYears,
} from "@/repositories/holidays";
import { findUserById } from "@/repositories/users";

// ADMN-11(04.2-11): 공휴일 관리 화면의 데이터와 연도 확정. 화면이 권한으로 버튼을
// 숨겨도 도메인이 같은 권한을 다시 본다(T-4.2-70·73).
const HOLIDAYS_MENU = "admin.holidays";

export class HolidayForbiddenError extends UserFacingError {}
export class HolidayYearIncompleteError extends UserFacingError {}

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"] as const;

export type HolidayRowView = {
  id: string;
  date: string;
  monthDay: string;
  weekday: string;
  name: string;
  kind: HolidayKind;
  kindLabel: string;
  deletable: boolean;
};

export type HolidayAdminView = {
  years: { year: number; confirmed: boolean }[];
  year: number;
  rows: HolidayRowView[];
  confirmation: { confirmedAt: Date; confirmedByName: string } | null;
  count: number;
  candidateError: string | null;
};

export type HolidayAdminDeps = { now?: () => Date };

export type HolidayBannerDeps = { now?: () => Date; findConfirmation?: typeof findYearConfirmation };

// B1(D-705 · UI-SPEC U-4): 올해·다음 해 가운데 확정 기록이 없는 가장 이른 해. 행동할 수
// 있는 사람(admin.holidays write)에게만 — 권한이 없으면 던지지 않고 null(「관리」 인덱스는
// 다른 권한으로 들어온 사람도 본다). 조회가 실패하면 배너 없이 화면을 그린다(S3/error).
export async function holidayConfirmationBanner(
  viewer: Viewer,
  deps?: HolidayBannerDeps,
): Promise<{ year: number } | null> {
  try {
    if (!(await can(viewer, HOLIDAYS_MENU, "write"))) return null;
    const find = deps?.findConfirmation ?? findYearConfirmation;
    const thisYear = Number(toKstDate((deps?.now ?? (() => new Date()))()).slice(0, 4));
    for (const year of [thisYear, thisYear + 1]) {
      if (!(await find(viewer, year))) return { year };
    }
    return null;
  } catch (error) {
    log.warn("admin.banner_failed", {
      banner: "holiday",
      message: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

function weekdayOf(date: string): string {
  return WEEKDAYS[new Date(`${date}T00:00:00Z`).getUTCDay()] ?? "";
}

// 올해·다음 해 후보를 보장한 뒤(음력 표 밖이면 그 해 오류 문구만 모은다) 화면 한 장의
// 데이터를 돌려준다. `requestedYear`는 행이 있는 해 목록 안의 값만 받는다 — 주소창으로
// 아무 해나 넣어 후보를 만들지 못하게 한다(T-4.2-75).
export async function loadHolidayAdmin(
  viewer: Viewer,
  opts: { requestedYear?: number },
  deps?: HolidayAdminDeps,
): Promise<HolidayAdminView> {
  if (!(await can(viewer, HOLIDAYS_MENU, "view"))) {
    throw new HolidayForbiddenError("공휴일 열람 권한 없음");
  }

  const today = toKstDate((deps?.now ?? (() => new Date()))());
  const thisYear = Number(today.slice(0, 4));
  const candidateErrors = new Map<number, string>();
  for (const year of [thisYear, thisYear + 1]) {
    try {
      await ensureHolidayCandidates(year);
    } catch (error) {
      if (!(error instanceof LunarTableRangeError)) throw error;
      candidateErrors.set(year, error.message);
    }
  }

  const yearNumbers = await listHolidayYears(viewer);
  const confirmations = new Map(
    await Promise.all(yearNumbers.map(async (year) => [year, await findYearConfirmation(viewer, year)] as const)),
  );
  const years = yearNumbers.map((year) => ({ year, confirmed: confirmations.get(year) != null }));

  const isConfirmed = (year: number) => confirmations.get(year) != null;
  const defaultYear = [thisYear, thisYear + 1].find((year) => !isConfirmed(year)) ?? thisYear;
  const year =
    opts.requestedYear !== undefined && yearNumbers.includes(opts.requestedYear) ? opts.requestedYear : defaultYear;

  const rows = (await listHolidaysForYear(viewer, year)).map((row) => {
    const kind = row.kind as HolidayKind;
    return {
      id: row.id,
      date: row.date,
      monthDay: row.date.slice(5),
      weekday: weekdayOf(row.date),
      name: row.name,
      kind,
      kindLabel: HOLIDAY_KIND_LABELS[kind],
      deletable: (kind === "temporary" || kind === "election") && row.date > today,
    };
  });

  const confirmationRow = confirmations.get(year) ?? null;
  const confirmedBy = confirmationRow ? await findUserById(viewer, confirmationRow.confirmedBy) : null;

  return {
    years,
    year,
    rows,
    confirmation: confirmationRow
      ? { confirmedAt: confirmationRow.confirmedAt, confirmedByName: confirmedBy?.name ?? "" }
      : null,
    count: rows.length,
    candidateError: candidateErrors.get(year) ?? null,
  };
}

export type ConfirmHolidayYearDeps = {
  recordAction?: typeof defaultRecordAction;
  ensure?: (year: number, tx: DbOrTx) => Promise<boolean>;
};

// D-4223: 한 달력 잠금 트랜잭션에서 (가) 후보 보장(음력 표 밖이면 LunarTableRangeError)
// (나) 생성 표시 확인 (다) 멱등 확정 삽입 (라) 실제로 들어갔을 때만 끌 수 없는
// `holiday_change` 로그(D-4220) — 로그가 실패하면 확정도 되돌려진다.
export async function confirmHolidayYear(viewer: Viewer, year: number, deps?: ConfirmHolidayYearDeps): Promise<void> {
  if (!(await can(viewer, HOLIDAYS_MENU, "write"))) {
    throw new HolidayForbiddenError("공휴일 확정 권한 없음");
  }
  const ensure = deps?.ensure ?? ensureHolidayCandidatesLocked;
  const recordAction = deps?.recordAction ?? defaultRecordAction;

  await withHolidayCalendarLock(async (tx) => {
    await ensure(year, tx);
    if (!(await findYearGeneration(viewer, year, tx))) {
      throw new HolidayYearIncompleteError(`${year}년 후보 없음 · 다시 시도`);
    }
    const inserted = await insertYearConfirmation(viewer, { year, confirmedBy: viewer.id }, tx);
    if (!inserted) return;
    const count = (await findHolidayDates(viewer, [year], tx)).length;
    await recordAction(
      viewer,
      {
        actionType: "holiday_change",
        entity: "holiday_year",
        entityId: String(year),
        detail: { op: "confirm", year, count },
      },
      { tx },
    );
  });
}

export class PastHolidayDateError extends UserFacingError {
  constructor() {
    super("지난 날짜 · 내일 이후 날짜 고르기");
  }
}

export class DuplicateHolidayError extends UserFacingError {
  constructor(existingName: string) {
    super(`이미 공휴일(${existingName}) · 다른 날짜 고르기`);
  }
}

export class HolidayNotDeletableError extends UserFacingError {}

const MANUAL_KINDS: readonly HolidayKind[] = ["temporary", "election"];

export type HolidayWriteDeps = {
  now?: Date;
  recordAction?: typeof defaultRecordAction;
  recompute?: typeof recomputeFutureSubstitutes;
};

export type AddHolidayInput = { date: string; kind: HolidayKind; name: string };

// D-4210 「추가」: 소급 금지(오늘·과거 거부)는 화면이 아니라 이 함수가 지킨다. 표는
// 달력 잠금 트랜잭션 하나에서만 바뀐다 — 그 해 후보 보장 → 미래 대체일 자리면 그 행을
// 비운다(규칙이 옮긴다) → 수동 행 → 원래 해 Y-1부터 표 끝까지 재계산 한 번 → 끌 수 없는
// `holiday_change` 로그(D-4220). 로그가 실패하면 행과 재계산이 함께 되돌려진다.
export async function addHoliday(
  viewer: Viewer,
  input: AddHolidayInput,
  deps?: HolidayWriteDeps,
): Promise<{ id: string; date: string; year: number }> {
  if (!(await can(viewer, HOLIDAYS_MENU, "write"))) {
    throw new HolidayForbiddenError("공휴일 추가 권한 없음");
  }
  if (!MANUAL_KINDS.includes(input.kind)) {
    throw new UserFacingError("임시공휴일·선거일만 추가 가능");
  }
  const now = deps?.now ?? new Date();
  const today = toKstDate(now);
  if (input.date <= today) throw new PastHolidayDateError();
  const kind = input.kind as "temporary" | "election";
  const year = Number(input.date.slice(0, 4));
  const recordAction = deps?.recordAction ?? defaultRecordAction;
  const recompute = deps?.recompute ?? recomputeFutureSubstitutes;

  return withHolidayCalendarLock(async (tx) => {
    await ensureHolidayCandidatesLocked(year, tx, { now: () => now });
    const existing = await findHolidayByDate(viewer, input.date, tx);
    if (existing) {
      if (existing.kind !== "substitute") throw new DuplicateHolidayError(existing.name);
      await deleteHolidayById(viewer, existing.id, tx);
    }
    const inserted = await insertManualHoliday(
      viewer,
      { date: input.date, name: input.name, kind, createdBy: viewer.id },
      tx,
    );
    const row = await findHolidayByDate(viewer, input.date, tx);
    if (!inserted || !row) throw new DuplicateHolidayError(row?.name ?? "");
    await recompute(year - 1, { today }, tx);
    await recordAction(
      viewer,
      {
        actionType: "holiday_change",
        entity: "holiday",
        entityId: row.id,
        detail: { op: "add", date: input.date, name: input.name, kind },
      },
      { tx },
    );
    return { id: row.id, date: input.date, year };
  });
}

export type DeleteHolidayResult =
  | { deleted: true; date: string; name: string; kind: "temporary" | "election" }
  | { deleted: false };

// D-4210 「삭제」: 달력 잠금 트랜잭션 하나에서 행을 지우고(RETURNING) 규칙 행·오늘 이전
// 행이면 던져 트랜잭션째 되돌린다(소급 금지 — T-4.2-77). 이미 지워진 행(동시 중복 삭제의
// 뒤 사람)은 로그 없이 `{ deleted: false }`. 지운 날짜의 해 Y에 대해 원래 해 Y-1부터 표
// 끝까지 재계산 한 번 → 원래 값을 실은 `holiday_change` op delete 로그(D-4220). 돌려준
// 원래 값으로 결과 줄 `되돌리기`가 addHoliday를 다시 부른다(D-4209 개정).
export async function deleteHoliday(
  viewer: Viewer,
  id: string,
  deps?: HolidayWriteDeps,
): Promise<DeleteHolidayResult> {
  if (!(await can(viewer, HOLIDAYS_MENU, "write"))) {
    throw new HolidayForbiddenError("공휴일 삭제 권한 없음");
  }
  const today = toKstDate(deps?.now ?? new Date());
  const recordAction = deps?.recordAction ?? defaultRecordAction;
  const recompute = deps?.recompute ?? recomputeFutureSubstitutes;

  return withHolidayCalendarLock(async (tx) => {
    const row = await deleteHolidayById(viewer, id, tx);
    if (!row) return { deleted: false };
    if ((row.kind !== "temporary" && row.kind !== "election") || row.date <= today) {
      throw new HolidayNotDeletableError("지울 수 없는 공휴일 · 규칙 행이나 오늘 이전 행");
    }
    const kind = row.kind;
    await recompute(Number(row.date.slice(0, 4)) - 1, { today }, tx);
    await recordAction(
      viewer,
      {
        actionType: "holiday_change",
        entity: "holiday",
        entityId: row.id,
        detail: { op: "delete", date: row.date, name: row.name, kind },
      },
      { tx },
    );
    return { deleted: true, date: row.date, name: row.name, kind };
  });
}
