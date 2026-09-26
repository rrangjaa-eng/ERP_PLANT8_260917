"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { returnValidationErrors } from "next-safe-action";
import { authedActionClient } from "@/lib/actions/client";
import {
  addHoliday,
  confirmHolidayYear,
  deleteHoliday,
  DuplicateHolidayError,
  PastHolidayDateError,
} from "@/domain/holidays/admin";
import { LUNAR_TABLE_LAST_YEAR } from "@/domain/holidays/lunar-table";
import { LunarTableRangeError } from "@/domain/holidays/rules";
import "./actions.registry";

// ADMN-11(04.2-11): 입력은 정수 모양만 본다 — 권한·음력 표 범위·후보 완결은
// domain/holidays/admin이 다시 본다(화면에 없는 해를 직접 불러도 같은 규칙).
export const confirmHolidayYearAction = authedActionClient
  .schema(z.object({ year: z.number().int() }))
  .action(async ({ parsedInput, ctx }) => {
    await confirmHolidayYear(ctx.viewer, parsedInput.year);
    revalidatePath("/admin/holidays");
    return { ok: true };
  });

const DATE_FORMAT_MESSAGE = "날짜 형식이 아닙니다 · 2027-06-03처럼 적어 주세요";

function isRealIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}

const addHolidaySchema = z.object({
  date: z.string().refine(isRealIsoDate, DATE_FORMAT_MESSAGE),
  kind: z.enum(["temporary", "election"]),
  name: z.string().trim().min(1),
});

// 04.2-12: 수동 추가. 소급·중복·음력 표 밖 해는 도메인이 거부하고 여기서 날짜 칸
// 오류(`원인 · 다음 행동`)로 바꾼다 — 폼은 칸 아래에 그대로 쓴다(UI-SPEC 카피 계약).
// 삭제의 `되돌리기`도 이 액션을 같은 값으로 다시 부른다(D-4209 개정).
export const addHolidayAction = authedActionClient
  .schema(addHolidaySchema)
  .action(async ({ parsedInput, ctx }) => {
    try {
      const added = await addHoliday(ctx.viewer, parsedInput);
      revalidatePath("/admin/holidays");
      return { date: added.date, year: added.year };
    } catch (error) {
      if (error instanceof PastHolidayDateError || error instanceof DuplicateHolidayError) {
        returnValidationErrors(addHolidaySchema, { date: { _errors: [error.message] } });
      }
      if (error instanceof LunarTableRangeError) {
        returnValidationErrors(addHolidaySchema, {
          date: {
            _errors: [`${error.year}년은 음력 표에 없습니다 · ${LUNAR_TABLE_LAST_YEAR}년 이전 날짜를 적어 주세요`],
          },
        });
      }
      throw error;
    }
  });

// 04.2-12: 수동 미래 행 삭제 — 확인 단계 없음(D-4209 개정). 규칙 행·오늘 이전 행 거부와
// 대체일 재계산·로그는 도메인이 한다. 지운 행의 원래 값을 돌려줘 결과 줄 `되돌리기`가
// addHolidayAction을 같은 값으로 부른다(되돌리기 전용 액션 없음).
export const deleteHolidayAction = authedActionClient
  .schema(z.object({ id: z.string().uuid() }))
  .action(async ({ parsedInput, ctx }) => {
    const result = await deleteHoliday(ctx.viewer, parsedInput.id);
    revalidatePath("/admin/holidays");
    return result;
  });
