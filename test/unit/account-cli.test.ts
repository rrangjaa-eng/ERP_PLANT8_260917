import { describe, expect, it } from "vitest";
import { parseArgs, UsageError } from "@/scripts/account-cli";

describe("scripts/account-cli parseArgs", () => {
  it("create: --email --name --admin을 파싱한다(account.yml이 넘기는 argv와 동일)", () => {
    expect(parseArgs(["create", "--email", "a@b.c", "--name", "홍길동", "--admin"])).toEqual({
      cmd: "create",
      email: "a@b.c",
      name: "홍길동",
      admin: true,
    });
  });

  it("create: --admin 없으면 admin=false", () => {
    expect(parseArgs(["create", "--email", "a@b.c", "--name", "홍길동"])).toEqual({
      cmd: "create",
      email: "a@b.c",
      name: "홍길동",
      admin: false,
    });
  });

  it("reset: --email만 파싱한다", () => {
    expect(parseArgs(["reset", "--email", "a@b.c"])).toEqual({
      cmd: "reset",
      email: "a@b.c",
    });
  });

  it("unlock: --email만 파싱한다", () => {
    expect(parseArgs(["unlock", "--email", "a@b.c"])).toEqual({
      cmd: "unlock",
      email: "a@b.c",
    });
  });

  it("create에 --name이 없으면 UsageError", () => {
    expect(() => parseArgs(["create", "--email", "a@b.c"])).toThrow(UsageError);
  });

  it("알 수 없는 서브커맨드는 UsageError", () => {
    expect(() => parseArgs(["delete", "--email", "a@b.c"])).toThrow(UsageError);
  });

  it("--email이 이메일 형식이 아니면 UsageError", () => {
    expect(() => parseArgs(["reset", "--email", "not-an-email"])).toThrow(UsageError);
  });

  it("등호 결합 토큰(--email=a@b.c)은 알 수 없는 플래그로 UsageError", () => {
    expect(() => parseArgs(["reset", "--email=a@b.c"])).toThrow(UsageError);
  });

  it("--email 없이 reset을 호출하면 UsageError", () => {
    expect(() => parseArgs(["reset"])).toThrow(UsageError);
  });
});
