import { randomBytes } from "node:crypto";
import { auth } from "@/lib/auth";
import { log } from "@/lib/log";
import type { Viewer } from "@/domain/viewer";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { can } from "@/domain/permissions/can";
import { findUserByEmail, setPasswordTemporary } from "@/repositories/users";
import { resolveOpenFailures } from "@/repositories/login-attempts";
import { UserFacingError } from "@/lib/actions/user-facing-error";
import { withTransaction } from "@/lib/db-transaction";
import { recordAction as defaultRecordAction } from "@/domain/action-log/record";

// D-11: 계정 발급 수단은 CLI 하나. 무작위 임시 비밀번호를 반환하고, 어떤 로그·
// 출력에도 비밀번호 값 자체는 절대 남기지 않는다.

export function generateTempPassword(): string {
  // 9바이트 → base64url 12자, D-09(8자 이상) 규칙을 충족한다.
  return randomBytes(9).toString("base64url");
}

export async function createAccount(
  viewer: Viewer,
  input: { email: string; name: string; roleId?: string },
): Promise<{ userId: string; tempPassword: string }> {
  if (!(await can(viewer, "admin.people", "write"))) {
    throw new UserFacingError("계정 생성 권한 없음");
  }

  // 사전 존재 확인 없이 DB unique 제약에만 맡기면 관리자에게 원시 SQL 에러가
  // 그대로 노출된다(Rule 1 — 운영 CLI 사용성 버그, 실제 실행 확인 중 발견).
  const existing = await findUserByEmail(viewer, input.email);
  if (existing) {
    throw new UserFacingError(`이미 있는 이메일: ${input.email}`);
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
      // Phase 3: 선택 인자 — 넘기지 않으면 undefined(better-auth가 등록된
      // additionalFields의 defaultValue 없음 → 컬럼 null)로 저장된다. 기존
      // 세 개의 권한 게이트와 다른 인자·호출은 한 글자도 바꾸지 않는다.
      roleId: input.roleId,
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

  log.info("auth.account_created", { userId: user.id, roleId: input.roleId });

  return { userId: user.id, tempPassword };
}

// AUTH-03·D-10: 관리자 재발급 — 새 임시 비밀번호 발급, 다른 세션 전부 만료,
// password_is_temporary=true. 세 동작 모두 better-auth에 자동 연동이 없어
// 순서대로 직접 호출한다(01-RESEARCH.md Pattern 3).
export async function resetPassword(
  viewer: Viewer,
  email: string,
): Promise<{ userId: string; tempPassword: string }> {
  if (!(await can(viewer, "admin.people", "write"))) {
    throw new UserFacingError("비밀번호 재발급 권한 없음");
  }

  const user = await findUserByEmail(viewer, email);
  if (!user) {
    throw new UserFacingError("사용자 찾을 수 없음");
  }

  const tempPassword = generateTempPassword();
  const ctx = await auth.$context;
  const hash = await ctx.password.hash(tempPassword);

  await ctx.internalAdapter.updatePassword(user.id, hash);
  // D-10: 재발급 순간 다른 기기의 세션까지 전부 만료(현재 세션 구분 없음 — CLI에는 "현재 세션" 개념이 없다).
  await ctx.internalAdapter.deleteUserSessions(user.id);
  // D-08: 관리자가 발급한 비밀번호를 쓰고 있다는 표시.
  await setPasswordTemporary(viewer, user.id, true);

  log.info("auth.password_reset", { userId: user.id });

  return { userId: user.id, tempPassword };
}

// AUTH-01: 관리자 해제 — 열린 실패 기록을 admin_unlock으로 닫는다.
// 04.2-08(D-712·D-4220): 해소와 account_unlock 로그가 한 트랜잭션이다 — 로그
// 쓰기가 실패하면 해소도 롤백되어 계정은 잠긴 채다. D-4222: CLI 경로는 시스템
// 실행(actorId null)이라 워크플로를 실행한 GitHub 계정을 operator로 detail에 남긴다.
export async function unlockAccount(
  viewer: Viewer,
  email: string,
  opts?: { operator?: string; recordAction?: typeof defaultRecordAction },
): Promise<{ resolved: number }> {
  if (!(await can(viewer, "admin.people", "write"))) {
    throw new UserFacingError("계정 잠금 해제 권한 없음");
  }

  const recordAction = opts?.recordAction ?? defaultRecordAction;
  // eng E5: 전역 db를 쓰는 사용자 조회는 트랜잭션 전에 끝낸다 — 콜백 안에서는 tx 호출만.
  const user = await findUserByEmail(SYSTEM_VIEWER, email);

  const resolved = await withTransaction(async (tx) => {
    const count = await resolveOpenFailures(SYSTEM_VIEWER, email, "admin_unlock", tx);
    await recordAction(
      viewer,
      {
        actionType: "account_unlock",
        entity: "user",
        entityId: user?.id ?? null,
        detail: { email, resolved: count, operator: opts?.operator ?? null },
      },
      { tx },
    );
    return count;
  });
  log.info("auth.unlock", { email, resolved });

  return { resolved };
}
