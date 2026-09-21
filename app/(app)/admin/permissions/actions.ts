"use server";

import { z } from "zod";
import { authedActionClient } from "@/lib/actions/client";
import { setPermissionCell } from "@/domain/permissions/matrix";
import { MENUS, PERMISSION_ACTIONS } from "@/domain/permissions/menus";
import { roleExists } from "@/domain/permissions/roles";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import "./actions.registry";

// T-03-17: 좌표(계급·메뉴·동작)를 레지스트리에 등록된 값 집합으로 제한한다.
// roleId는 DB의 실제 계급 표를 비동기로 확인한다 — 메뉴·동작은 이 페이즈의
// 코드 레지스트리(MENUS·PERMISSION_ACTIONS)가 정본이지만, 계급은 ADMN-08이
// 관리 화면 밖에서도 늘어날 수 있는 데이터라 시드 집합으로 좁히면 새로
// 등록된 계급의 권한을 아예 조정할 수 없게 된다.
const menuKeys = new Set(MENUS.map((menu) => menu.key));

export const setPermissionCellAction = authedActionClient
  .schema(
    z.object({
      roleId: z.string().min(1).refine(async (value) => roleExists(SYSTEM_VIEWER, value), {
        message: "알 수 없는 계급입니다.",
      }),
      menu: z.string().refine((value) => menuKeys.has(value), "알 수 없는 메뉴입니다."),
      action: z.enum(PERMISSION_ACTIONS),
      allowed: z.boolean(),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    await setPermissionCell(ctx.viewer, parsedInput);
  });
