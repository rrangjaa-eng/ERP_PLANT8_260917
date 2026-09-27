"use server";

// D-4208: 알림함은 권한표 메뉴가 아니다 — `/account` 선례(app/(app)/account/actions.ts)와
// 같은 본인 범위 액션이다. 셋 다 authedActionClient(세션 필수)만 거치고
// ctx.viewer.id만 다룬다. 레지스트리·MENUS·DTO 목록에 등록하지 않는다(누수 스캔
// 대상이 아닌 이유는 이 파일 밖의 인자를 받지 않는 것으로 막는다).

import { z } from "zod";
import { authedActionClient } from "@/lib/actions/client";
import { listMyNotifications, openMyInbox, countMyUnread } from "@/domain/notify/inbox";

export const openInboxAction = authedActionClient.action(async ({ ctx }) => {
  return openMyInbox(ctx.viewer);
});

export const refreshUnreadCountAction = authedActionClient.action(async ({ ctx }) => {
  return countMyUnread(ctx.viewer);
});

// Codex 2차 #11: 커서 시각은 밀리초 정밀도 계약이다 — created_at이 timestamp(3)라
// DTO의 toISOString()과 정확히 같다. 넘겨받은 id는 bigint 칸이라 숫자 문자열만.
export const loadMoreInboxAction = authedActionClient
  .schema(
    z.object({
      cursor: z.object({
        createdAt: z.string().datetime({ precision: 3 }),
        id: z.string().regex(/^\d+$/),
      }),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    return listMyNotifications(ctx.viewer, { limit: 50, cursor: parsedInput.cursor });
  });
