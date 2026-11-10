"use server";

import { z } from "zod";
import { authedActionClient } from "@/lib/actions/client";
import { recordDocumentPrint } from "@/domain/print/record";
import "./actions.registry";

// 07.4-01 D-7415: 서류 인쇄 기록. kind · id는 클라이언트 입력이라 zod로 모양을 보고, 열람은 domain/print/record.ts가 서류 읽기 함수로 다시 판정한다.
const printSchema = z.object({
  kind: z.enum(["expense", "leave", "settlement", "quote"]),
  id: z.string().uuid(),
});

export const recordDocumentPrintAction = authedActionClient.schema(printSchema).action(async ({ parsedInput, ctx }) => {
  await recordDocumentPrint(ctx.viewer, parsedInput);
});
