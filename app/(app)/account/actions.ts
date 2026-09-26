"use server";

import { z } from "zod";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { APIError } from "better-auth/api";
import { authedActionClient } from "@/lib/actions/client";
import { UserFacingError } from "@/lib/actions/user-facing-error";
import { auth } from "@/lib/auth";
import { validateNewPassword, finalizePasswordChange } from "@/domain/auth/password";

// AUTH-03·D-08·D-09·D-10: 본인 비밀번호 변경. authedActionClient가 세션을
// 요구하고 ctx.viewer.id(본인)만 대상으로 삼는다(T-1-12). db/repositories를
// 직접 import하지 않는다 — finalizePasswordChange(domain)만 부른다(Issue 1).
export const changePasswordAction = authedActionClient
  .schema(
    z.object({
      currentPassword: z.string().min(1, "현재 비밀번호 필요 · 현재 비밀번호 입력"),
      newPassword: z.string().min(8, "8자 미만 · 8자 이상으로"),
    }),
  )
  .action(async ({ parsedInput, ctx }) => {
    const { currentPassword, newPassword } = parsedInput;

    // D-09: 8자 미만·흔한 비밀번호는 zod 스키마 통과 뒤에도 여기서 한 번 더 막는다.
    validateNewPassword(newPassword);

    try {
      await auth.api.changePassword({
        body: { currentPassword, newPassword, revokeOtherSessions: true },
        headers: await headers(),
      });
    } catch (e) {
      // 현재 비밀번호 불일치는 better-auth가 APIError(BAD_REQUEST, INVALID_PASSWORD)로
      // 던진다 — 사용자에게는 일관된 한국어 메시지만 보여준다.
      if (e instanceof APIError) {
        throw new UserFacingError("현재 비밀번호 오류 · 다시 입력");
      }
      throw e;
    }

    // D-10: 문자 그대로 — 본인 변경도 현재 세션 포함 전 세션 만료 → 재로그인.
    await finalizePasswordChange(ctx.viewer, ctx.viewer.id);
    redirect("/login?reason=password-changed");
  });
