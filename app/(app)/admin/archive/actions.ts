"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { authedActionClient } from "@/lib/actions/client";
import { restore } from "@/domain/archive";
import "./actions.registry";

// ADMN-12: domain/archive만 부른다(03-01의 보관·복원 진입점) — 등록은
// ./actions.registry로 분리(03-03 선례).
export const restoreArchivedAction = authedActionClient
  .schema(z.object({ entity: z.string().min(1), id: z.string().min(1) }))
  .action(async ({ parsedInput, ctx }) => {
    await restore(ctx.viewer, parsedInput.entity, parsedInput.id);
    revalidatePath("/admin/archive");
    // 복원 대상 표의 목록 화면도 즉시 갱신되게 한다.
    revalidatePath("/admin/code-tables");
    revalidatePath("/admin/people");
    revalidatePath("/admin/people/roles");
    revalidatePath("/admin/people/org");
    revalidatePath("/admin/corp-cards");
    revalidatePath("/admin/vendors");
  });
