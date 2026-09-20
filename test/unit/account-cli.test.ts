import { describe, expect, it } from "vitest";
import { parseArgs, UsageError } from "@/scripts/account-cli";

// D-36(03-02): parseArgs가 시드가 아닌 --role 값을 만나면 findRoleById로 DB를
// 확인한다(assertKnownRole) — ParseArgsDeps로 스텁해 Postgres 없이 두 방향
// (있음/없음)을 모두 검사한다.
function fakeRoleRow(id: string) {
  return {
    id,
    name: "커스텀 계급",
    isSeed: false,
    sortOrder: 9,
    customFields: {},
    archivedAt: null,
    archivedBy: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe("scripts/account-cli parseArgs", () => {
  it("create: --email --name --role을 파싱한다(account.yml이 넘기는 argv와 동일)", async () => {
    await expect(
      parseArgs(["create", "--email", "a@b.c", "--name", "홍길동", "--role", "role-sysadmin"]),
    ).resolves.toEqual({
      cmd: "create",
      email: "a@b.c",
      name: "홍길동",
      roleId: "role-sysadmin",
    });
  });

  it("create: --role 없으면 기본 계급(role-pm)으로 해석된다", async () => {
    await expect(parseArgs(["create", "--email", "a@b.c", "--name", "홍길동"])).resolves.toEqual({
      cmd: "create",
      email: "a@b.c",
      name: "홍길동",
      roleId: "role-pm",
    });
  });

  it("create: 시드가 아니지만 DB에 있는 계급 값은 허용된다", async () => {
    await expect(
      parseArgs(["create", "--email", "a@b.c", "--name", "홍길동", "--role", "role-custom"], {
        findRoleById: () => Promise.resolve(fakeRoleRow("role-custom")),
      }),
    ).resolves.toEqual({
      cmd: "create",
      email: "a@b.c",
      name: "홍길동",
      roleId: "role-custom",
    });
  });

  it("create: 시드도 아니고 DB에도 없는 계급 값은 UsageError로 거부한다(오타 방지, T-03-12)", async () => {
    await expect(
      parseArgs(["create", "--email", "a@b.c", "--name", "홍길동", "--role", "role-typo"], {
        findRoleById: () => Promise.resolve(null),
      }),
    ).rejects.toThrow(UsageError);
  });

  it("reset: --email만 파싱한다", async () => {
    await expect(parseArgs(["reset", "--email", "a@b.c"])).resolves.toEqual({
      cmd: "reset",
      email: "a@b.c",
    });
  });

  it("unlock: --email만 파싱한다", async () => {
    await expect(parseArgs(["unlock", "--email", "a@b.c"])).resolves.toEqual({
      cmd: "unlock",
      email: "a@b.c",
    });
  });

  it("create에 --name이 없으면 UsageError", async () => {
    await expect(parseArgs(["create", "--email", "a@b.c"])).rejects.toThrow(UsageError);
  });

  it("알 수 없는 서브커맨드는 UsageError", async () => {
    await expect(parseArgs(["delete", "--email", "a@b.c"])).rejects.toThrow(UsageError);
  });

  it("--email이 이메일 형식이 아니면 UsageError", async () => {
    await expect(parseArgs(["reset", "--email", "not-an-email"])).rejects.toThrow(UsageError);
  });

  it("등호 결합 토큰(--email=a@b.c)은 알 수 없는 플래그로 UsageError", async () => {
    await expect(parseArgs(["reset", "--email=a@b.c"])).rejects.toThrow(UsageError);
  });

  it("--email 없이 reset을 호출하면 UsageError", async () => {
    await expect(parseArgs(["reset"])).rejects.toThrow(UsageError);
  });
});
