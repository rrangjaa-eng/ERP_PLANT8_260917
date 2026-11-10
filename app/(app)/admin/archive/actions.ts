"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { returnValidationErrors } from "next-safe-action";
import { authedActionClient } from "@/lib/actions/client";
import { restore, VendorBusinessNoTakenError, CorpCardLast4TakenError, ParentOrgUnitArchivedError, type RestoreResult } from "@/domain/archive";
import { ReserveClientArchivedError } from "@/domain/reserves";
import { HolidayNotRestorableError } from "@/domain/holidays/admin";
import { PersonNotRestorableError, PersonRestoreForbiddenError } from "@/domain/people/restore";
import { RoleGrantForbiddenError } from "@/domain/permissions/grant-ceiling";
import { SeatTakenError } from "@/domain/people/seat-rules";
import "./actions.registry";

// ADMN-12: domain/archive만 부른다(03-01의 보관·복원 진입점) — 등록은
// ./actions.registry로 분리(03-03 선례). 예외: 원인을 토스트에 실을 복원 거부 오류 클래스들(공휴일 · 거래처 · 사람)을
// 루트 오류로 바꾸려고 그 오류 클래스만 각 도메인에서 가져온다.
const restoreArchivedSchema = z.object({ entity: z.string().min(1), id: z.string().min(1) });

export const restoreArchivedAction = authedActionClient
  .schema(restoreArchivedSchema)
  .action(async ({ parsedInput, ctx }) => {
    let result: RestoreResult;
    try {
      result = await restore(ctx.viewer, parsedInput.entity, parsedInput.id);
    } catch (error) {
      // quick 261001-hfi: 공휴일 복원 거부(오늘 이전 · 그 날짜에 다른 공휴일)는 원인을 루트 오류로 — 토스트가 싣는다.
      // PR #178: 거래처 복원 거부(같은 사업자번호 거래처가 살아 있음)도 같다.
      // 06.4(D-6406 · N1): 사람 복원 거부(사람 쓰기 없음 · 없는 사람 · 권한 상한 · 자리)도 같다 — 문구가 ` · 복원 불가`로 끝난다.
      // 06-37(G-06-A): 법인카드 복원 거부(같은 발급사 · 뒤 4자리의 살아 있는 카드)도 같다.
      // 07.2-11(PU22 ② · ③): 사용중지 본부 아래 팀 · 사용중지 거래처 리저브 줄 복원 거부도 같다 — 행 아래 이유 줄(S22).
      if (
        error instanceof HolidayNotRestorableError ||
        error instanceof VendorBusinessNoTakenError ||
        error instanceof CorpCardLast4TakenError ||
        error instanceof PersonRestoreForbiddenError ||
        error instanceof PersonNotRestorableError ||
        error instanceof RoleGrantForbiddenError ||
        error instanceof SeatTakenError ||
        error instanceof ParentOrgUnitArchivedError ||
        error instanceof ReserveClientArchivedError
      ) {
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
    revalidatePath("/admin/field-definitions");
    revalidatePath("/admin/visibility");
    return { restored: result.restored };
  });
