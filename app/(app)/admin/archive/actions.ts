"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { returnValidationErrors } from "next-safe-action";
import { authedActionClient } from "@/lib/actions/client";
import { restore, type RestoreResult } from "@/domain/archive";
import { HolidayNotRestorableError } from "@/domain/holidays/admin";
import "./actions.registry";

// ADMN-12: domain/archive만 부른다(03-01의 보관·복원 진입점) — 등록은
// ./actions.registry로 분리(03-03 선례). 예외 하나: 공휴일 복원 거부(HolidayNotRestorableError)를
// 루트 오류로 바꾸려고 그 오류 클래스만 domain/holidays/admin에서 가져온다.
const restoreArchivedSchema = z.object({ entity: z.string().min(1), id: z.string().min(1) });

export const restoreArchivedAction = authedActionClient
  .schema(restoreArchivedSchema)
  .action(async ({ parsedInput, ctx }) => {
    let result: RestoreResult;
    try {
      result = await restore(ctx.viewer, parsedInput.entity, parsedInput.id);
    } catch (error) {
      // quick 261001-hfi: 공휴일 복원 거부(오늘 이전 · 그 날짜에 다른 공휴일)는 원인을 루트 오류로 — 토스트가 싣는다.
      if (error instanceof HolidayNotRestorableError) {
        returnValidationErrors(restoreArchivedSchema, { _errors: [error.message] });
      }
      throw error;
    }
    revalidatePath("/admin/archive");
    // 복원 대상 표의 목록 화면도 즉시 갱신되게 한다.
    revalidatePath("/admin/code-tables");
    revalidatePath("/admin/people");
    revalidatePath("/admin/people/roles");
    revalidatePath("/admin/people/org");
    revalidatePath("/admin/corp-cards");
    revalidatePath("/admin/vendors");
    revalidatePath("/admin/holidays");
    return { restored: result.restored };
  });
