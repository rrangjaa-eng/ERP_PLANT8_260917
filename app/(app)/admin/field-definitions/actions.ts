"use server";

import { revalidatePath } from "next/cache";
import { authedActionClient } from "@/lib/actions/client";
import { createFieldDefinition } from "@/domain/custom-fields/admin";
import { createFieldDefinitionInput } from "@/domain/custom-fields/admin-input";

// 04.5-01: domain/custom-fields만 부른다. 액션 등록부(actions.registry.ts)는 메뉴 등록(MENUS)과
// 한 묶음으로 09가 만든다 — 누수 스캔 액션 축이 action.menu가 MENUS에 있기를 요구한다.
export const createFieldDefinitionAction = authedActionClient
  .schema(createFieldDefinitionInput)
  .action(async ({ parsedInput, ctx }) => {
    await createFieldDefinition(ctx.viewer, parsedInput);
    revalidatePath("/admin/field-definitions");
    revalidatePath("/admin/vendors");
    revalidatePath("/admin/visibility");
  });
