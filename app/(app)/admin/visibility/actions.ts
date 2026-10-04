"use server";

import { z } from "zod";
import { authedActionClient } from "@/lib/actions/client";
import { setVisibilityCell } from "@/domain/permissions/matrix";
import { isAssignableInfoItem } from "@/domain/custom-fields/visibility";
import { roleExists } from "@/domain/permissions/roles";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import "./actions.registry";

// T-03-17: 좌표(계급·정보 항목)를 레지스트리에 등록된 값 집합으로 제한한다.
// roleId 검증은 app/(app)/admin/permissions/actions.ts와 같은 이유로 DB
// 실제 계급 표를 비동기로 확인한다(시드 집합으로 좁히지 않는다).
// 04.5-03(T-04.5-03): 정보 항목은 INFO_ITEMS 또는 활성 커스텀 항목(cf.<entity>.<key>)만.

export const setVisibilityCellAction = authedActionClient
  .schema(
    z.object({
      roleId: z.string().min(1).refine(async (value) => roleExists(SYSTEM_VIEWER, value), {
        message: "알 수 없는 계급",
      }),
      infoItem: z.string().refine(async (value) => isAssignableInfoItem(value), "알 수 없는 정보 항목"),
      visible: z.boolean(),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    await setVisibilityCell(ctx.viewer, parsedInput);
  });
