import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";

// account-cli.ts는 Cloud Run Job(plant8-{env}-account)이 실행하는 진입점이다.
// 여기서 중요한 건 "계정이 만들어졌는가"만이 아니라 **프로세스가 스스로
// 끝나는가**다 — 2026-09-18 스테이징 실행(plant8-staging-account-txfcr)에서
// 계정 생성·임시 비밀번호 출력까지 다 성공(16:48:26)했는데 프로세스가
// 종료되지 않아 task-timeout 900초를 다 쓰고 "The configured timeout was
// reached"로 실행이 실패 처리됐다. account.yml은 `jobs execute --wait`가
// 실패하면 exit 1이므로, 계정은 실제로 생겼는데 워크플로는 실패로 끝난다.
// 그래서 migrate-runner와 같은 방식으로 자식 프로세스로 돌려 **timeout 안에
// 스스로 exit하는지**를 단언한다.
//
// 주의(코드 리뷰 2026-09-18): 이 파일은 **그 버그의 회귀 테스트가 아니다**.
// 로컬 경로는 DATABASE_URL을 쓰므로 Connector를 아예 만들지 않아 수정 전
// 코드에서도 통과한다(실제로 되돌려 확인함). 진짜 회귀 테스트는
// test/unit/db-client-close.test.ts 하나다. 이 파일이 지키는 건 "로컬 경로의
// CLI가 앞으로도 매달리지 않는다"는 더 약한 성질이다.
const DATABASE_URL = process.env.DATABASE_URL ?? "postgres://erp:erp@127.0.0.1:5432/erp_test";

// spawnSync의 예산. vitest 기본 testTimeout(5초)이 먼저 터지면 signal 단언이
// 아니라 "Test timed out"만 보이므로, it()의 타임아웃을 이보다 넉넉히 준다.
const EXIT_TIMEOUT_MS = 30_000;
// 여기 측정치는 2.3~2.5초였다 — 느린 러너를 감안해도 충분하되 위 예산보다는 크게.
const IT_TIMEOUT_MS = 60_000;

function runAccountCli(args: string[]): { status: number | null; signal: NodeJS.Signals | null; stdout: string; stderr: string } {
  const result = spawnSync("node", ["--import", "tsx", "scripts/account-cli.ts", ...args], {
    env: {
      ...process.env,
      DATABASE_URL,
      APP_ENV: "local",
      BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET ?? randomBytes(32).toString("hex"),
      BETTER_AUTH_URL: process.env.BETTER_AUTH_URL ?? "http://127.0.0.1:3000",
    },
    encoding: "utf8",
    timeout: EXIT_TIMEOUT_MS,
  });
  return {
    status: result.status,
    signal: result.signal,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

describe("scripts/account-cli 프로세스 종료", () => {
  it("create가 끝나면 스스로 exit 0으로 끝난다(Cloud Run Job task-timeout 방지)", () => {
    const email = `exit-probe-${randomBytes(4).toString("hex")}@example.invalid`;
    const { status, signal, stdout } = runAccountCli(["create", "--email", email, "--name", "exit probe"]);

    // signal !== null이면 timeout에 걸려 강제 종료된 것 = 스테이징에서 난 바로 그 증상.
    expect(signal).toBeNull();
    expect(status).toBe(0);
    expect(stdout).toContain(`account created: ${email}`);
  }, IT_TIMEOUT_MS);

  it("사용법 오류(exit 2)에서도 매달리지 않고 끝난다", () => {
    const { status, signal } = runAccountCli(["create", "--email", "not-an-email"]);

    expect(signal).toBeNull();
    expect(status).toBe(2);
  }, IT_TIMEOUT_MS);
});
