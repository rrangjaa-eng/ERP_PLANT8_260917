"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { returnValidationErrors } from "next-safe-action";
import { authedActionClient } from "@/lib/actions/client";
import { can } from "@/domain/permissions/can";
import {
  createFieldDefinition,
  DuplicateFieldNameError,
  updateFieldDefinition,
} from "@/domain/custom-fields/admin";
import {
  createFieldDefinitionInput,
  nameConflictMessage,
  updateFieldDefinitionInput,
} from "@/domain/custom-fields/admin-input";
import { archive } from "@/domain/archive";
import type { Viewer } from "@/domain/viewer";
import "./actions.registry";

// 이름 충돌 칸 오류 문구 — 「보관함에서 복원」 링크는 복원에 필요한 두 쓰기 권한과, 링크가 가리키는 /admin/archive를 열 보기 권한이 다 있을 때만.
async function nameConflictText(viewer: Viewer, error: DuplicateFieldNameError): Promise<string> {
  const [archiveView, archiveWrite, fieldWrite] = await Promise.all([
    can(viewer, "admin.archive", "view"),
    can(viewer, "admin.archive", "write"),
    can(viewer, "admin.field-definitions", "write"),
  ]);
  return nameConflictMessage({ archived: error.archived, canRestore: archiveView && archiveWrite && fieldWrite });
}

function revalidateFieldDefinitionPaths(): void {
  revalidatePath("/admin/field-definitions");
  revalidatePath("/admin/vendors");
  revalidatePath("/admin/visibility");
}

// 04.5-01: domain/custom-fields만 부른다. 액션 등록부(actions.registry.ts)는 메뉴 등록(MENUS)과
// 한 묶음으로 09가 만들었다 — 누수 스캔 액션 축이 action.menu가 MENUS에 있기를 요구한다.
export const createFieldDefinitionAction = authedActionClient
  .schema(createFieldDefinitionInput)
  .action(async ({ parsedInput, ctx }) => {
    try {
      await createFieldDefinition(ctx.viewer, parsedInput);
    } catch (error) {
      if (error instanceof DuplicateFieldNameError) {
        const message = await nameConflictText(ctx.viewer, error);
        returnValidationErrors(createFieldDefinitionInput, { name: { _errors: [message] } });
      }
      throw error;
    }
    revalidateFieldDefinitionPaths();
  });

// 04.5-02: 수정 — 버전 조건부 갱신(domain). 보관 · 버전 충돌 · 없는 칸은 UserFacingError로 이유 자리에 간다.
export const updateFieldDefinitionAction = authedActionClient
  .schema(updateFieldDefinitionInput)
  .action(async ({ parsedInput, ctx }) => {
    try {
      await updateFieldDefinition(ctx.viewer, parsedInput);
    } catch (error) {
      if (error instanceof DuplicateFieldNameError) {
        const message = await nameConflictText(ctx.viewer, error);
        returnValidationErrors(updateFieldDefinitionInput, { name: { _errors: [message] } });
      }
      throw error;
    }
    revalidateFieldDefinitionPaths();
  });

// 04.5-04: 칸 「삭제」 = 보관. 권한(보관함 쓰기 + 칸 관리 쓰기)은 domain/archive가 판정한다(UI-SPEC O21).
export const archiveFieldDefinitionAction = authedActionClient
  .schema(z.object({ id: z.string().min(1) }))
  .action(async ({ parsedInput, ctx }) => {
    await archive(ctx.viewer, "field_definitions", parsedInput.id);
    revalidateFieldDefinitionPaths();
    revalidatePath("/admin/archive");
  });
