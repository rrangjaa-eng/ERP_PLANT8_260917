import { randomBytes } from "node:crypto";
import { auth } from "@/lib/auth";
import type { Viewer } from "@/domain/viewer";

// D-11: 계정 발급 수단은 CLI 하나. 무작위 임시 비밀번호를 반환하고, 어떤 로그·
// 출력에도 비밀번호 값 자체는 절대 남기지 않는다.

export function generateTempPassword(): string {
  // 9바이트 → base64url 12자, D-09(8자 이상) 규칙을 충족한다.
  return randomBytes(9).toString("base64url");
}

export async function createAccount(
  viewer: Viewer,
  input: { email: string; name: string; isAdmin: boolean },
): Promise<{ userId: string; tempPassword: string }> {
  if (!viewer.isAdmin) {
    throw new Error("계정 생성 권한이 없습니다.");
  }

  const tempPassword = generateTempPassword();
  const ctx = await auth.$context;
  const hash = await ctx.password.hash(tempPassword);

  // better-auth 1.7.5 internalAdapter.createUser는 (user, source) 2-인자 시그니처다
  // — source는 필수(UserProvisioningSource). admin 플러그인이 관리자 발급 계정에
  // 쓰는 것과 같은 { method: "admin" }을 그대로 쓴다.
  const user = await ctx.internalAdapter.createUser(
    {
      email: input.email,
      name: input.name,
      emailVerified: true,
      isAdmin: input.isAdmin,
      passwordIsTemporary: true,
    },
    { method: "admin" },
  );

  await ctx.internalAdapter.linkAccount({
    userId: user.id,
    providerId: "credential",
    accountId: user.id,
    password: hash,
  });

  return { userId: user.id, tempPassword };
}
