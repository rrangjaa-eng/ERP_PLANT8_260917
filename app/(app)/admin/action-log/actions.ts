"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { authedActionClient } from "@/lib/actions/client";
import { parseActionLogDateBoundary, type ActionLogFilter } from "@/domain/action-log";
import { pruneActionLog } from "@/domain/action-log";
import { exportActionLog } from "@/domain/action-log/export";
import "./actions.registry";

// ADMN-10·OPS-05: 두 액션이 domain/action-log만 부른다. 등록은
// ./actions.registry로 분리(03-03 선례 — server-only 의존 체인 때문에 누수
// 스캔이 이 파일을 직접 import할 수 없다).
const filterSchema = z.object({
  actorId: z.string().min(1).optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  actionType: z.string().min(1).optional(),
  documentId: z.string().min(1).optional(),
  includePruned: z.boolean().optional(),
});

function toDomainFilter(input: z.infer<typeof filterSchema>): ActionLogFilter {
  return {
    actorId: input.actorId,
    actionType: input.actionType,
    documentId: input.documentId,
    from: parseActionLogDateBoundary(input.from, "start"),
    to: parseActionLogDateBoundary(input.to, "end"),
    includePruned: input.includePruned,
  };
}

// 내보내기 실패는 화면 전환 없이 토스트로 알리고 부분 파일을 내려주지
// 않는다 — 직렬화(exportActionLog)가 완전히 끝난 뒤에만 응답을 만든다.
export const exportActionLogAction = authedActionClient
  .schema(filterSchema)
  .action(async ({ parsedInput, ctx }) => {
    return exportActionLog(ctx.viewer, toDomainFilter(parsedInput));
  });

// 정리는 두 단계 제출(화면)이 확인을 대신한다 — 이 액션 자체는 확인 없이
// 즉시 실행하고, 정리 자체가 행동 로그에 남는다(domain/action-log가 기록).
export const pruneActionLogAction = authedActionClient
  .schema(filterSchema)
  .action(async ({ parsedInput, ctx }) => {
    const result = await pruneActionLog(ctx.viewer, toDomainFilter(parsedInput));
    revalidatePath("/admin/action-log");
    return result;
  });
