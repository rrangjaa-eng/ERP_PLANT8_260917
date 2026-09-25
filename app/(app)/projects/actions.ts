"use server";

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { authedActionClient } from "@/lib/actions/client";
import { createProject } from "@/domain/projects";
import {
  PeriodRejectedError,
  PreEstimateRejectedError,
  saveProjectLedger,
  type PeriodFieldError,
} from "@/domain/projects/ledger";
import type { PreEstimateFieldError } from "@/domain/projects/pre-estimate";
import { quoteLinesInputSchema, SaveRejectedError } from "@/domain/quotes/lines";
import {
  changeProjectStatus,
  listProjectStatusCatalog,
  StatusChangedError,
  statusChangedMessage,
} from "@/domain/projects/status";
import { PROJECT_STATUSES } from "@/domain/projects/status-transitions";
import "./actions.registry";

// PROJ-01·PROJ-02: domain/projects·domain/quotes/lines만 부른다. 등록은
// ./actions.registry로 분리(03-03 선례 — 누수 스캔이 server-only 의존
// 체인인 이 파일을 직접 import할 수 없다).
const currencySchema = z.enum(["KRW", "USD"]);
const moneyInputSchema = z.object({
  currency: currencySchema,
  amount: z.coerce.number(),
  fxRate: z.coerce.number(),
});

export const createProjectAction = authedActionClient
  .schema(
    z.object({
      clientId: z.string().min(1, "클라이언트를 고르세요."),
      name: z.string().min(1, "프로젝트명을 입력하세요."),
      pmUserId: z.string().min(1, "담당 PM을 고르세요."),
      teamId: z.string().min(1, "팀을 고르세요."),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    const project = await createProject(ctx.viewer, {
      clientId: parsedInput.clientId,
      name: parsedInput.name,
      pmUserId: parsedInput.pmUserId,
      teamId: parsedInput.teamId,
      startDate: parsedInput.startDate || undefined,
      endDate: parsedInput.endDate || undefined,
    });
    revalidatePath("/projects");
    return { project };
  });

// 04-22 — 기간 칸. 날짜 형식·달력 검사는 domain이 칸 오류 문구로 한다(스키마는 길이만 막는다).
// 기준값은 서버가 렌더한 값이라 형식을 여기서 고정한다.
const periodDateSchema = z.string().max(10).nullable();
const periodBaselineDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .nullable();

const revenueEntryRowSchema = z.object({
  id: z.string().optional(),
  version: z.number().optional(),
  entryDate: z.string().min(1, "날짜를 입력하세요."),
  amount: moneyInputSchema,
  fxRateTouched: z.boolean().optional(),
  note: z.string().optional(),
});

// D-63·D-65: 클라이언트가 견적가·차익·원화 환산액·부가세·공급가 역산 필드를
// 실어 보내도 이 스키마에 그 필드가 없어 애초에 파싱되지 않는다 — domain
// 층이 domain/money로 다시 계산한다(PROJ-02·04-02 §7-3 (사)). 04-02 Task 2
// ⑥·⑧ — 화면의 1차 「일괄 저장」 하나가 견적 줄 + 매출(계약 금액·발행·
// 입금)을 같은 트랜잭션으로 저장한다. 새 1차 버튼을 만들지 않는다
// (saveQuoteLinesAction을 이 액션으로 흡수).
// 봉투를 함수 반환값으로 만든다 — 객체 리터럴 반환끼리는 서로의 키를 `?: undefined`로 채워
// 화면의 `"rejected" in data` 좁히기가 풀린다.
function periodRejected(
  error: PeriodRejectedError,
): { periodRejected: { errors: PeriodFieldError[]; preEstimateErrors: PreEstimateFieldError[] } } {
  return { periodRejected: { errors: error.errors, preEstimateErrors: error.preEstimateErrors } };
}

function preEstimateRejected(error: PreEstimateRejectedError): { preEstimateRejected: { errors: PreEstimateFieldError[] } } {
  return { preEstimateRejected: { errors: error.errors } };
}

function statusChanged(message: string): { statusChanged: { message: string } } {
  return { statusChanged: { message } };
}

export const saveProjectLedgerAction = authedActionClient
  .schema(
    z.object({
      projectId: z.string().uuid(),
      // DR-6 · 계약 4 — 화면이 본 상태(필수).
      seenStatus: z.enum(PROJECT_STATUSES),
      // 04-12(A-37) — 줄 상태 enum · 줄·보관·순서 id uuid(스키마는 domain/quotes/lines).
      quoteLines: quoteLinesInputSchema.optional(),
      revenue: z
        .object({
          contract: moneyInputSchema.optional(),
          contractFxRateTouched: z.boolean().optional(),
          issuedEntries: z.array(revenueEntryRowSchema).optional(),
          paidEntries: z.array(revenueEntryRowSchema).optional(),
        })
        .optional(),
      period: z
        .object({
          startDate: periodDateSchema,
          endDate: periodDateSchema,
          baseline: z.object({ startDate: periodBaselineDateSchema, endDate: periodBaselineDateSchema }),
        })
        .optional(),
      // 04-44 — 총 매출 예상가 칸. 숫자가 아닌 금액(NaN)도 받아 domain이 칸 오류 문구로 돌려준다.
      preEstimate: z
        .object({
          currency: currencySchema,
          amount: z.union([z.number(), z.nan()]),
          fxRate: z.union([z.number(), z.nan()]).nullable(),
          fxRateTouched: z.boolean(),
        })
        .optional(),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    let result: Awaited<ReturnType<typeof saveProjectLedger>>;
    try {
      const quoteLines = parsedInput.quoteLines;
      result = await saveProjectLedger(ctx.viewer, parsedInput.projectId, {
        seenStatus: parsedInput.seenStatus,
        // 04-12 과도기 — 도메인은 모든 줄에 id를 요구한다(ENG-D10). 화면이 새 줄 uuid를 싣기 전(04-30)에는 id 없는
        // 새 줄에 서버가 uuid를 붙인다(재전송 멱등은 04-30의 화면 uuid부터).
        quoteLines: quoteLines && {
          ...quoteLines,
          rows: quoteLines.rows.map(({ id, ...row }) => (id ? { ...row, id } : { ...row, id: randomUUID(), isNew: true as const })),
        },
        revenue: parsedInput.revenue,
        period: parsedInput.period,
        preEstimate: parsedInput.preEstimate,
      });
    } catch (error) {
      // 04-22 — 기간 칸 거부는 칸 오류로 돌려준다(화면이 칸 아래 Form.Error로 그린다).
      if (error instanceof PeriodRejectedError) return periodRejected(error);
      // 04-44 — 총 매출 예상가 칸 거부도 칸 오류로(칸 아래 Form.Error).
      if (error instanceof PreEstimateRejectedError) return preEstimateRejected(error);
      // DR-6 — 상태 바뀜 전부 거부. 트랜잭션은 이미 롤백됐다 — 라벨은 그 뒤 트랜잭션 밖에서 코드표로 찾는다.
      // 화면이 오류 문자열을 해석하지 않게 데이터로 돌려준다.
      if (error instanceof StatusChangedError) {
        const catalog = await listProjectStatusCatalog(ctx.viewer);
        const label = catalog.find((entry) => entry.value === error.status)?.label ?? error.status;
        return statusChanged(statusChangedMessage(label, "전부 거부"));
      }
      // 04-28 거부 봉투 — SaveRejectedError만 칸 좌표로 돌려준다(도메인이 쓰기 전에
      // 던지고 트랜잭션은 이미 되돌렸다 — 커밋 뒤에는 생기지 않는다). 칸은 이 사람이
      // 이번 요청에 실어 보낸 줄의 편집 칸에서만 생겨(편집·금액 권한 판정 뒤) 새로
      // 드러나는 정보가 없다. 그 밖의 오류는 지금처럼 던져 serverError가 된다.
      if (!(error instanceof SaveRejectedError)) throw error;
      return {
        rejected: {
          summary: error.summary,
          cells: [
            ...error.conflicts.map((conflict) => ({
              rowId: conflict.rowId,
              field: conflict.field,
              kind: "conflict" as const,
              reason: conflict.reason,
              theirRaw: conflict.theirRaw,
              theirVersion: conflict.theirVersion,
            })),
            ...error.formatErrors.map((formatError) => ({
              rowId: formatError.rowId,
              rowIndex: formatError.rowIndex,
              field: formatError.field,
              kind: "error" as const,
              reason: formatError.reason,
            })),
          ],
        },
      };
    }
    revalidatePath("/projects");
    return result;
  });

// 04-20(PROJ-04): 사람의 상태 전환 — 화면이 본 상태(from)와 목적지(to)를 싣는다.
// 판정(전이표·권한·팀 범위·시작일·동시 변경)은 전부 domain이 하고, 거부 이유
// 문자열이 그대로 serverError로 나간다.
export const changeProjectStatusAction = authedActionClient
  .schema(
    z.object({
      projectId: z.string().uuid(),
      from: z.enum(PROJECT_STATUSES),
      to: z.enum(PROJECT_STATUSES),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    await changeProjectStatus(ctx.viewer, parsedInput.projectId, { from: parsedInput.from, to: parsedInput.to });
    revalidatePath("/projects");
    return { status: parsedInput.to };
  });
