"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { authedActionClient } from "@/lib/actions/client";
import { SaveRejectedError } from "@/domain/quotes/lines";
import { CURRENCIES } from "@/domain/money/currency";
import { listReserves, ReserveBalanceRejectedError, RESERVE_INPUT_REASONS, saveReserves } from "@/domain/reserves";
import { RESERVE_SAVE_CAP_REASON, RESERVE_SAVE_MAX_ROWS } from "@/domain/reserves/save-contract";
import "./actions.registry";

// 04-42 — 리저브 대장의 1차 「일괄 저장」 하나. 잔액·클라이언트 잠금·재전송·권한 판정은 전부 04-07의 saveReserves다.
// 가장자리에서는 id 모양(uuid)과 구분만 거른다 — 모양이 아닌 id는 PG 22P02가 아니라 그 칸의 이유가 된다(04-07 리뷰 S3).
const rowSchema = z.object({
  id: z.string().uuid(RESERVE_INPUT_REASONS.entryNotFound),
  isNew: z.literal(true).optional(),
  version: z.number().int().optional(),
  clientId: z.string().uuid(RESERVE_INPUT_REASONS.clientNotFound),
  entryDate: z.string().max(10),
  direction: z.enum(["deposit", "withdrawal"], { error: RESERVE_INPUT_REASONS.directionInvalid }),
  amount: z.object({ currency: z.enum(CURRENCIES), amount: z.number(), fxRate: z.number() }),
  fxRateTouched: z.boolean().optional(),
  projectId: z.string().uuid(RESERVE_INPUT_REASONS.projectMismatch).nullable().optional(),
  evidenceType: z.string().max(200).nullable().optional(),
  taxInvoiceNumber: z.string().max(200).nullable().optional(),
  note: z.string().max(2000).nullable().optional(),
});

// 리뷰 R8 · Codex #4 — 한 요청의 줄·보관 수 상한과 그 이유는 화면과 함께 쓰는 잎 모듈(domain/reserves/save-contract.ts)에 있다.

export type ReserveRejectedCell = { rowId: string | undefined; field: string; reason: string };

export const saveReservesAction = authedActionClient
  .schema(
    z.object({
      rows: z.array(rowSchema).max(RESERVE_SAVE_MAX_ROWS, RESERVE_SAVE_CAP_REASON),
      // 리뷰 R9 — 보관(삭제)도 화면이 본 version을 싣는다(낡은 탭·복원 초안이 방금 고친 줄을 보관하지 않게).
      archived: z
        // 리뷰 R12 — version 오류도 같은 줄 이유다(화면이 그 줄의 칸 오류로 붙인다 — zod 기본 영어 문구를 내보내지 않는다).
        .array(
          z.object({
            id: z.string().uuid(RESERVE_INPUT_REASONS.entryNotFound),
            version: z.number({ error: RESERVE_INPUT_REASONS.entryNotFound }).int(RESERVE_INPUT_REASONS.entryNotFound),
          }),
        )
        .max(RESERVE_SAVE_MAX_ROWS, RESERVE_SAVE_CAP_REASON)
        .optional(),
      // 성공 뒤 돌려줄 대장의 쪽(화면이 보는 쪽).
      page: z.number().int().min(1).optional(),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    try {
      await saveReserves(ctx.viewer, { rows: parsedInput.rows, archived: parsedInput.archived });
    } catch (error) {
      // 거부 봉투 — 칸 좌표로 돌려준다(트랜잭션은 이미 되돌렸다). 잔액 거부는 그 줄의 쪽 정보(Codex #7)를 함께 싣는다.
      if (!(error instanceof SaveRejectedError)) throw error;
      const cells: ReserveRejectedCell[] = error.formatErrors.map((cell) => ({ rowId: cell.rowId, field: cell.field, reason: cell.reason }));
      return {
        rejected: {
          summary: error.summary,
          cells,
          balance: error instanceof ReserveBalanceRejectedError ? error.rejection : null,
        },
      };
    }
    revalidatePath("/pnl/reserves");
    return { saved: await listReserves(ctx.viewer, { page: parsedInput.page }) };
  });
