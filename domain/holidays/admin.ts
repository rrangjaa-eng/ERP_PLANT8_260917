import type { Viewer } from "@/domain/viewer";
import { can } from "@/domain/permissions/can";
import { recordAction as defaultRecordAction } from "@/domain/action-log/record";
import { toKstDate } from "@/domain/holidays/business-day";
import {
  ensureHolidayCandidates,
  ensureHolidayCandidatesLocked,
  withHolidayCalendarLock,
} from "@/domain/holidays/candidates";
import { HOLIDAY_KIND_LABELS, LunarTableRangeError, type HolidayKind } from "@/domain/holidays/rules";
import { UserFacingError } from "@/lib/actions/user-facing-error";
import type { DbOrTx } from "@/repositories/document-counters";
import {
  findHolidayDates,
  findYearConfirmation,
  findYearGeneration,
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
    throw new HolidayForbiddenError("공휴일을 볼 권한이 없습니다.");
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
    throw new HolidayForbiddenError("공휴일을 확정할 권한이 없습니다.");
  }
  const ensure = deps?.ensure ?? ensureHolidayCandidatesLocked;
  const recordAction = deps?.recordAction ?? defaultRecordAction;

  await withHolidayCalendarLock(async (tx) => {
    await ensure(year, tx);
    if (!(await findYearGeneration(viewer, year, tx))) {
      throw new HolidayYearIncompleteError(`${year}년 후보가 아직 없습니다 · 다시 시도`);
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
