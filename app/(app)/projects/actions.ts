"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { authedActionClient } from "@/lib/actions/client";
import { createProject } from "@/domain/projects";
import { saveQuoteLines } from "@/domain/quotes/lines";
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

// D-63·D-65: 클라이언트가 견적가·차익·원화 환산액 필드를 실어 보내도 이
// 스키마에 그 필드가 없어 애초에 파싱되지 않는다 — domain 층이
// computeQuoteLineAmounts로 다시 계산한다(PROJ-02).
export const saveQuoteLinesAction = authedActionClient
  .schema(
    z.object({
      revisionId: z.string().min(1),
      rows: z.array(
        z.object({
          id: z.string().optional(),
          version: z.number().optional(),
          sortOrder: z.number().optional(),
          subcategory: z.string().min(1, "소분류를 고르세요."),
          itemName: z.string().min(1, "항목명을 입력하세요."),
          vendorId: z.string().optional(),
          quantity: z.coerce.number().optional(),
          unitPrice: moneyInputSchema,
          execution: moneyInputSchema,
          lineStatus: z.string().optional(),
          note: z.string().optional(),
        }),
      ),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    const result = await saveQuoteLines(ctx.viewer, parsedInput.revisionId, parsedInput.rows);
    revalidatePath("/projects");
    return result;
  });
