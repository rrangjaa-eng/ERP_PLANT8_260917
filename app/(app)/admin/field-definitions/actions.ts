"use server";

import { revalidatePath } from "next/cache";
import { returnValidationErrors } from "next-safe-action";
import { authedActionClient } from "@/lib/actions/client";
import { can } from "@/domain/permissions/can";
import { createFieldDefinition, DuplicateFieldNameError } from "@/domain/custom-fields/admin";
import { createFieldDefinitionInput, nameConflictMessage } from "@/domain/custom-fields/admin-input";
import "./actions.registry";

// 04.5-01: domain/custom-fields만 부른다. 액션 등록부(actions.registry.ts)는 메뉴 등록(MENUS)과
// 한 묶음으로 09가 만든다 — 누수 스캔 액션 축이 action.menu가 MENUS에 있기를 요구한다.
export const createFieldDefinitionAction = authedActionClient
  .schema(createFieldDefinitionInput)
  .action(async ({ parsedInput, ctx }) => {
    try {
      await createFieldDefinition(ctx.viewer, parsedInput);
    } catch (error) {
      if (error instanceof DuplicateFieldNameError) {
        // 「보관함에서 복원」 링크는 복원에 필요한 두 쓰기 권한과, 링크가 가리키는 /admin/archive를 열 보기 권한이 다 있을 때만.
        const [archiveView, archiveWrite, fieldWrite] = await Promise.all([
          can(ctx.viewer, "admin.archive", "view"),
          can(ctx.viewer, "admin.archive", "write"),
          can(ctx.viewer, "admin.field-definitions", "write"),
        ]);
        const message = nameConflictMessage({
          archived: error.archived,
          canRestore: archiveView && archiveWrite && fieldWrite,
        });
        returnValidationErrors(createFieldDefinitionInput, { name: { _errors: [message] } });
      }
      throw error;
    }
    revalidatePath("/admin/field-definitions");
    revalidatePath("/admin/vendors");
    revalidatePath("/admin/visibility");
  });
