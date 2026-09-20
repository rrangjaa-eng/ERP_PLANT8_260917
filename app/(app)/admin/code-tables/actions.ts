"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { authedActionClient } from "@/lib/actions/client";
import { createCodeItem, setCodeItemActive } from "@/domain/code-tables";
import { registerAction } from "@/lib/actions/registry";

// MAST-04: 두 액션이 domain/code-tables만 부르고 리포지토리·db 계층을 직접
// import하지 않는다(기존 boundaries가 이미 금지한다).
export const createCodeItemAction = authedActionClient
  .schema(
    z.object({
      tableKey: z.string().min(1),
      value: z.string().min(1, "값을 입력하세요."),
      label: z.string().min(1, "이름을 입력하세요."),
      sortOrder: z.coerce.number().int().default(0),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    await createCodeItem(ctx.viewer, parsedInput);
    revalidatePath("/admin/code-tables");
  });

registerAction({
  name: "createCodeItemAction",
  menu: "admin.code-tables",
  action: "write",
  dtoName: "CodeItemDto",
});

export const setCodeItemActiveAction = authedActionClient
  .schema(z.object({ id: z.string().min(1), active: z.boolean() }))
  .action(async ({ parsedInput, ctx }) => {
    await setCodeItemActive(ctx.viewer, parsedInput.id, parsedInput.active);
    revalidatePath("/admin/code-tables");
  });

registerAction({
  name: "setCodeItemActiveAction",
  menu: "admin.code-tables",
  action: "write",
  dtoName: "CodeItemDto",
});
