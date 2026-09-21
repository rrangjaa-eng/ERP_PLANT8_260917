import { pathToFileURL } from "node:url";
import { createAccount, resetPassword, unlockAccount } from "@/domain/auth/accounts";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { SEED_ROLES, DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { findRoleById as defaultFindRoleById } from "@/repositories/roles";
import { closeDb } from "@/db/client";

// D-11: 계정 발급 수단은 CLI 하나(로컬 tsx, 01-06 Cloud Run Job 번들 공용).
// 인자 규약은 하나뿐 — 플래그와 값은 항상 별개 argv 원소(`--email a@b.c`).
// account.yml이 `--args=<action>,--email,<v>[,--name,<v>][,--role,<v>]` 쉼표
// 목록으로 넘기는 것도 결국 같은 argv가 된다.

export class UsageError extends Error {}

export type ParsedArgs =
  | { cmd: "create"; email: string; name: string; roleId: string }
  | { cmd: "reset"; email: string }
  | { cmd: "unlock"; email: string };

// domain/system-status의 StatusDeps·domain/permissions/can의 CanDeps와 같은
// deps?: Partial<XDeps> 주입 패턴 — 단위 테스트가 Postgres 없이 findRoleById를
// 스텁할 수 있게 한다.
export type ParseArgsDeps = {
  findRoleById: typeof defaultFindRoleById;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// 시드 5종은 정적으로, 그 밖의 값은 DB(관리자가 화면에서 추가한 계급)에서
// 확인한다. 둘 다 아니면 오타를 조용히 기본 계급으로 만들지 않고 거부한다(T-03-12).
async function assertKnownRole(roleId: string, deps?: Partial<ParseArgsDeps>): Promise<void> {
  if (SEED_ROLES.some((role) => role.id === roleId)) return;
  const findRoleById = deps?.findRoleById ?? defaultFindRoleById;
  const found = await findRoleById(SYSTEM_VIEWER, roleId);
  if (!found) {
    throw new UsageError(`알 수 없는 계급 식별자: ${roleId}`);
  }
}

// D-36(03-02): 계급 인자 --role. 값이 없으면 DEFAULT_ROLE_ID로 해석한다 —
// 관리자 여부를 켜는 불리언 플래그는 없다.
export async function parseArgs(argv: string[], deps?: Partial<ParseArgsDeps>): Promise<ParsedArgs> {
  const [cmd, ...rest] = argv;
  if (cmd !== "create" && cmd !== "reset" && cmd !== "unlock") {
    throw new UsageError(`알 수 없는 서브커맨드: ${cmd ?? "(없음)"}. create|reset|unlock 중 하나여야 합니다.`);
  }

  const flags: { email?: string; name?: string; role?: string } = {};
  for (let i = 0; i < rest.length; i++) {
    const token = rest[i];
    if (token === "--email" || token === "--name" || token === "--role") {
      const value = rest[i + 1];
      if (value === undefined || value.startsWith("--")) {
        throw new UsageError(`${token} 뒤에 값이 필요합니다.`);
      }
      flags[token === "--email" ? "email" : token === "--name" ? "name" : "role"] = value;
      i++;
    } else {
      throw new UsageError(`알 수 없는 플래그: ${token}. 등호 결합(--flag=value) 토큰은 지원하지 않습니다.`);
    }
  }

  if (!flags.email || !EMAIL_PATTERN.test(flags.email)) {
    throw new UsageError("--email이 필요하고 이메일 형식이어야 합니다.");
  }

  if (cmd === "create") {
    if (!flags.name) {
      throw new UsageError("create에는 --name이 필요합니다.");
    }
    const roleId = flags.role ?? DEFAULT_ROLE_ID;
    await assertKnownRole(roleId, deps);
    return { cmd: "create", email: flags.email, name: flags.name, roleId };
  }

  return { cmd, email: flags.email };
}

// D-11: 임시 비밀번호는 이 함수를 통해서만, stdout에 정확히 한 줄로 출력한다.
// 어떤 log.* 호출에도 비밀번호 값 자체는 절대 남기지 않는다.
function printTempPassword(tempPassword: string): void {
  console.log(`temporary password: ${tempPassword}`);
}

async function run(parsed: ParsedArgs): Promise<void> {
  if (parsed.cmd === "create") {
    const { tempPassword } = await createAccount(SYSTEM_VIEWER, {
      email: parsed.email,
      name: parsed.name,
      roleId: parsed.roleId,
    });
    console.log(`account created: ${parsed.email} (role=${parsed.roleId})`);
    printTempPassword(tempPassword);
    return;
  }

  if (parsed.cmd === "reset") {
    const { tempPassword } = await resetPassword(SYSTEM_VIEWER, parsed.email);
    console.log(`password reset: ${parsed.email}`);
    printTempPassword(tempPassword);
    return;
  }

  const { resolved } = await unlockAccount(SYSTEM_VIEWER, parsed.email);
  console.log(`account unlocked: ${parsed.email} (resolved=${resolved})`);
}

export async function main(): Promise<void> {
  // parseArgs가 계급 검증(assertKnownRole)으로 DB를 조회할 수 있어(--role
  // 값이 시드가 아닐 때) 이제 사용법 오류도 DB 접근 뒤에 날 수 있다 — closeDb()를
  // 한 finally로 묶어 어느 단계에서 실패해도 커넥터가 남지 않게 한다.
  try {
    const parsed = await parseArgs(process.argv.slice(2));
    await run(parsed);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = error instanceof UsageError ? 2 : 1;
  } finally {
    await closeDb();
  }
}

// 테스트가 이 파일을 import해도 실행되지 않게: 직접 실행될 때만 main()을 부른다.
// next import 금지(01-05가 esbuild로 번들해 Cloud Run Job이 실행한다).
//
// main()이 끝나면 migrate-runner와 같이 명시적으로 종료한다 — 남은 핸들
// 하나가 Cloud Run Job을 task-timeout까지 매달리게 만든 적이 있다
// (2026-09-18 plant8-staging-account-txfcr). 근본 원인인 Cloud SQL 커넥터는
// db/client.ts의 closeDb()가 닫지만, 이 진입점에서도 이중으로 막는다.
// process.exit는 main() 안이 아니라 여기에 둔다(테스트가 main()을 직접
// import해 부를 때 테스트 프로세스를 죽이지 않도록).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main()
    .then(() => {
      process.exit(process.exitCode ?? 0);
    })
    // main()이 거부할 수 있는 경로는 finally의 closeDb() 하나뿐인데, 바로 그
    // closeDb()가 커넥터를 닫으면서 새로 던질 수 있게 됐다. catch가 없으면
    // unhandled rejection으로 죽어 process.exit에 닿지 못한다 — 계정은 이미
    // 만들어진 뒤라 정확히 이번에 고친 그 실패 모양이 된다.
    // migrate-runner.ts의 .catch와 같은 짝.
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(process.exitCode || 1);
    });
}
