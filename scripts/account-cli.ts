import { pathToFileURL } from "node:url";
import { createAccount, resetPassword, unlockAccount } from "@/domain/auth/accounts";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { closeDb } from "@/db/client";

// D-11: 계정 발급 수단은 CLI 하나(로컬 tsx, 01-06 Cloud Run Job 번들 공용).
// 인자 규약은 하나뿐 — 플래그와 값은 항상 별개 argv 원소(`--email a@b.c`).
// account.yml이 `--args=<action>,--email,<v>[,--name,<v>][,--admin]` 쉼표
// 목록으로 넘기는 것도 결국 같은 argv가 된다.

export class UsageError extends Error {}

export type ParsedArgs =
  | { cmd: "create"; email: string; name: string; admin: boolean }
  | { cmd: "reset"; email: string }
  | { cmd: "unlock"; email: string };

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function parseArgs(argv: string[]): ParsedArgs {
  const [cmd, ...rest] = argv;
  if (cmd !== "create" && cmd !== "reset" && cmd !== "unlock") {
    throw new UsageError(`알 수 없는 서브커맨드: ${cmd ?? "(없음)"}. create|reset|unlock 중 하나여야 합니다.`);
  }

  const flags: { email?: string; name?: string; admin?: boolean } = {};
  for (let i = 0; i < rest.length; i++) {
    const token = rest[i];
    if (token === "--email" || token === "--name") {
      const value = rest[i + 1];
      if (value === undefined || value.startsWith("--")) {
        throw new UsageError(`${token} 뒤에 값이 필요합니다.`);
      }
      flags[token === "--email" ? "email" : "name"] = value;
      i++;
    } else if (token === "--admin") {
      flags.admin = true;
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
    return { cmd: "create", email: flags.email, name: flags.name, admin: Boolean(flags.admin) };
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
      isAdmin: parsed.admin,
    });
    console.log(`account created: ${parsed.email} (admin=${parsed.admin})`);
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
  let parsed: ParsedArgs;
  try {
    parsed = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 2;
    return;
  }

  try {
    await run(parsed);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
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
  void main().then(() => {
    process.exit(process.exitCode ?? 0);
  });
}
