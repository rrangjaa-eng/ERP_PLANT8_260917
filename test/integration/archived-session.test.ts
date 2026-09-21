import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { auth } from "@/lib/auth";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { SYSADMIN_ROLE_ID } from "@/domain/permissions/roles";
import { createAccount } from "@/domain/auth/accounts";
import { findUserByEmail } from "@/repositories/users";
import { archive } from "@/domain/archive";
import { CLIENT_IP_HEADER } from "@/lib/client-ip";

// /review M-2: 보관(사용자에게는 「삭제」)된 사람의 기존 세션이 만료일(30일)까지
// 그대로 동작했다. archivePerson은 보관(admin.archive:write)과 세션 만료
// (admin.people:write)가 별개 권한인 두 단계라, 두 번째가 실패하면 그 상태가 된다.
//
// 수정은 lib/viewer.ts의 getSession이 archivedAt을 보고 fail-closed로 거부하는
// 것이고, 그게 성립하려면 better-auth가 요청마다 사용자 행을 다시 읽어야 한다
// (cookieCache 미사용). 그 전제를 여기서 직접 잰다 — 세션을 만든 뒤 사용자를
// 보관하고, 같은 세션으로 조회했을 때 archivedAt이 최신 값으로 오는지 본다.
describe("보관된 사람의 기존 세션 (M-2)", () => {
  it("세션 발급 후 보관하면 같은 세션 조회에 archivedAt이 실려 온다", async () => {
    const email = `m2-${randomUUID()}@example.test`;
    const { tempPassword } = await createAccount(SYSTEM_VIEWER, {
      email,
      name: "M2 대상",
      roleId: SYSADMIN_ROLE_ID,
    });

    // 로그인 훅(before)이 x-client-ip 없는 요청을 fail-closed로 막는다 —
    // 프록시를 거치지 않은 직접 호출이므로 여기서 채워 준다.
    const signIn = await auth.api.signInEmail({
      body: { email, password: tempPassword },
      headers: new Headers({ [CLIENT_IP_HEADER]: "127.0.0.1" }),
      asResponse: true,
    });
    const setCookie = signIn.headers.get("set-cookie");
    expect(setCookie, "로그인이 세션 쿠키를 돌려줘야 한다").toBeTruthy();
    const cookie = setCookie!.split(";")[0] ?? "";

    const before = await auth.api.getSession({ headers: new Headers({ cookie }) });
    expect(before?.user, "보관 전에는 세션이 살아 있어야 한다").toBeTruthy();
    expect((before?.user as unknown as { archivedAt?: unknown }).archivedAt ?? null).toBeNull();

    const row = await findUserByEmail(SYSTEM_VIEWER, email);
    expect(row).not.toBeNull();
    await archive(SYSTEM_VIEWER, "user", row!.id);

    // 같은 쿠키로 다시 조회 — 세션은 살아 있지만 사용자 행은 보관됐다.
    const after = await auth.api.getSession({ headers: new Headers({ cookie }) });
    const archivedAt = (after?.user as unknown as { archivedAt?: unknown } | undefined)?.archivedAt ?? null;
    expect(
      archivedAt,
      "better-auth가 사용자 행을 다시 읽지 않으면 여기가 null로 남고 getSession의 판정이 무력해진다",
    ).not.toBeNull();
  });
});
