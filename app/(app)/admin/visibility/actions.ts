"use server";

import { z } from "zod";
import { authedActionClient } from "@/lib/actions/client";
import { setVisibilityCell } from "@/domain/permissions/matrix";
import { INFO_ITEMS } from "@/domain/permissions/info-items";
import { roleExists } from "@/domain/permissions/roles";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import "./actions.registry";

// T-03-17: 좌표(계급·정보 항목)를 레지스트리에 등록된 값 집합으로 제한한다.
// roleId 검증은 app/(app)/admin/permissions/actions.ts와 같은 이유로 DB
// 실제 계급 표를 비동기로 확인한다(시드 집합으로 좁히지 않는다).
const infoItemKeys = new Set(INFO_ITEMS.map((item) => item.key));

export const setVisibilityCellAction = authedActionClient
  .schema(
    z.object({
      roleId: z.string().min(1).refine(async (value) => roleExists(SYSTEM_VIEWER, value), {
        message: "알 수 없는 계급입니다.",
      }),
      infoItem: z.string().refine((value) => infoItemKeys.has(value), "알 수 없는 정보 항목입니다."),
      visible: z.boolean(),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    await setVisibilityCell(ctx.viewer, parsedInput);
  });
