import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

// D8-08: 복원 리허설 결과를 기록하는 유일한 경로 — 리허설 워크플로의 Cloud Run Job이
// 이 CLI를 돌리고, 사람은 운영 DB에 명령하지 않는다. 인자 규약은 account-cli.ts와
// 같다(플래그와 값은 항상 별개 argv 원소, 등호 결합 없음).
//
// 이 진입점은 node: 내장 모듈만 정적으로 불러온다(Codex #11). db/client.ts가
// top-level await로 Cloud SQL 커넥터를 만들기 때문에, 인자·APP_ENV 검사를 통과한
// 뒤에만 DB·도메인 모듈을 동적으로 불러온다.
//
// 원본 환경은 인자가 아니라 컨테이너의 APP_ENV로 정한다 — 스테이징 Job이
// 프로덕션 기록을 만들 경로가 없다.

export class UsageError extends Error {}

type Stage = "restore" | "verify" | "cleanup";

export type RecordArgs = {
  cmd: "record";
  succeeded: boolean;
  failedStage: Stage | null;
  backupId: string | null;
  startedAt: Date;
  finishedAt: Date;
  runUrl: string | null;
  runKey: string;
};

export type VerifyArgs = { cmd: "verify"; target: string };

export type ParsedArgs = RecordArgs | VerifyArgs;

const FLAGS = [
  "--succeeded",
  "--failed-stage",
  "--backup-id",
  "--started-at",
  "--finished-at",
  "--run-url",
  "--run-key",
] as const;
type Flag = (typeof FLAGS)[number];

const STAGES: readonly string[] = ["restore", "verify", "cleanup"] satisfies Stage[];

// 같은 run_key에 다른 결과가 이미 저장돼 있을 때(사용 오류 2 · 그 밖 1과 구분).
const EXIT_STORED_OUTCOME_DIFFERS = 4;

function isFlag(token: string): token is Flag {
  return (FLAGS as readonly string[]).includes(token);
}

// 복원된 임시 인스턴스만 검증 대상이다(D8-08) — 원본 인스턴스 이름은 이 모양이 아니다.
const REHEARSAL_TARGET_PATTERN = /^[a-z0-9-]+:[a-z0-9-]+:plant8-(staging|prod)-rehearsal-\d+-\d+$/;

// 가드에 걸리면 사용 오류(2)가 아니라 검증 실패(1)다 — 워크플로가 단계 「검증」으로 기록한다.
class TargetRejectedError extends Error {}

function parseVerifyArgs(rest: string[]): VerifyArgs {
  const [flag, value, ...extra] = rest;
  if (flag !== "--target" || value === undefined || value.startsWith("--") || extra.length > 0) {
    throw new UsageError("verify는 --target <연결 이름> 하나만 받습니다.");
  }
  return { cmd: "verify", target: value };
}

export function parseArgs(argv: string[]): ParsedArgs {
  const [cmd, ...rest] = argv;
  if (cmd === "verify") return parseVerifyArgs(rest);
  if (cmd !== "record") {
    throw new UsageError(`알 수 없는 서브커맨드: ${cmd ?? "(없음)"}. record 또는 verify여야 합니다.`);
  }

  const flags: Partial<Record<Flag, string>> = {};
  for (let i = 0; i < rest.length; i++) {
    const token = rest[i] ?? "";
    if (!isFlag(token)) {
      throw new UsageError(`알 수 없는 플래그: ${token}. 등호 결합(--flag=value) 토큰은 지원하지 않습니다.`);
    }
    const value = rest[i + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new UsageError(`${token} 뒤에 값이 필요합니다.`);
    }
    flags[token] = value;
    i++;
  }

  const succeeded = flags["--succeeded"];
  if (succeeded !== "true" && succeeded !== "false") {
    throw new UsageError("--succeeded가 필요하고 true 또는 false여야 합니다.");
  }
  const failedStage = flags["--failed-stage"] ?? null;
  if (failedStage !== null && !STAGES.includes(failedStage)) {
    throw new UsageError("--failed-stage는 restore·verify·cleanup 중 하나여야 합니다.");
  }
  const startedAt = flags["--started-at"];
  const finishedAt = flags["--finished-at"];
  if (!startedAt || !finishedAt) {
    throw new UsageError("--started-at과 --finished-at이 필요합니다.");
  }
  const runKey = flags["--run-key"];
  if (!runKey) {
    throw new UsageError("--run-key(<실행 id>-<시도>)가 필요합니다.");
  }

  return {
    cmd,
    succeeded: succeeded === "true",
    failedStage: failedStage as Stage | null,
    backupId: flags["--backup-id"] ?? null,
    startedAt: new Date(startedAt),
    finishedAt: new Date(finishedAt),
    runUrl: flags["--run-url"] ?? null,
    runKey,
  };
}

function sourceFromAppEnv(appEnv: string | undefined): "staging" | "production" {
  if (appEnv === "staging") return "staging";
  if (appEnv === "prod") return "production";
  throw new UsageError("로컬에서는 리허설 결과를 기록하지 않습니다.");
}

function outcomeCode(outcome: { succeeded: boolean; failedStage: Stage | null }): string {
  return outcome.succeeded ? "success" : (outcome.failedStage ?? "unknown");
}

// DB 모듈을 불러오기 전에(= 커넥터 초기화 전에) 대상이 임시 인스턴스이고 컨테이너가
// 실제로 그 인스턴스에 붙도록 덮어써졌는지 확인한다(Codex #11). 덮어쓰기가 안 먹어
// 원본 연결 이름이 남아 있으면 여기서 실패한다.
async function runVerify(parsed: VerifyArgs, setCloseDb: (close: () => Promise<void>) => void): Promise<void> {
  if (
    !REHEARSAL_TARGET_PATTERN.test(parsed.target) ||
    process.env.CLOUD_SQL_CONNECTION_NAME !== parsed.target
  ) {
    throw new TargetRejectedError("검증 대상이 임시 인스턴스가 아닙니다.");
  }
  // 컨테이너 작업 디렉터리 기준 — Dockerfile이 db/migrations를 이미지에 복사한다(migrate-runner와 같은 기준).
  const journal = JSON.parse(readFileSync(resolve(process.cwd(), "db/migrations/meta/_journal.json"), "utf8")) as {
    entries: { idx: number; when: number; tag: string }[];
  };

  const dbModule = await import("@/db/client");
  setCloseDb(dbModule.closeDb);
  const { SYSTEM_VIEWER } = await import("@/domain/viewer");
  const { verifyRestoredDatabase } = await import("@/domain/ops/restore-verify");

  const result = await verifyRestoredDatabase(SYSTEM_VIEWER, journal);
  for (const check of result.checks) {
    console.log(`${check.ok ? "통과" : "실패"} ${check.name}: ${check.detail}`);
  }
  if (result.ok) {
    console.log("복원본 확인을 통과했습니다.");
  } else {
    console.log("복원본 확인에 실패했습니다.");
    process.exitCode = 1;
  }
}

export async function main(argv: string[] = process.argv.slice(2)): Promise<void> {
  let closeDb: (() => Promise<void>) | null = null;
  try {
    const parsed = parseArgs(argv);
    if (parsed.cmd === "verify") {
      await runVerify(parsed, (close) => {
        closeDb = close;
      });
      return;
    }
    const source = sourceFromAppEnv(process.env.APP_ENV);

    const dbModule = await import("@/db/client");
    closeDb = dbModule.closeDb;
    const { SYSTEM_VIEWER } = await import("@/domain/viewer");
    const { recordRestoreRehearsal } = await import("@/domain/ops/restore-rehearsal");

    const { inserted, stored } = await recordRestoreRehearsal(SYSTEM_VIEWER, {
      source,
      succeeded: parsed.succeeded,
      failedStage: parsed.failedStage,
      backupId: parsed.backupId,
      startedAt: parsed.startedAt,
      finishedAt: parsed.finishedAt,
      runUrl: parsed.runUrl,
      runKey: parsed.runKey,
    });

    const requested = outcomeCode(parsed);
    const storedCode = outcomeCode(stored);
    if (inserted) {
      console.log(`실행 ${parsed.runKey}의 복원 리허설 결과를 기록했습니다.`);
    } else if (storedCode === requested) {
      console.log("이미 기록된 실행입니다 — 새로 쓰지 않았습니다.");
    } else {
      console.error("이미 다른 결과로 기록된 실행입니다 — 저장된 결과를 바꾸지 않았습니다.");
      process.exitCode = EXIT_STORED_OUTCOME_DIFFERS;
    }
    // 기계용 한 줄(저장된 결과) — 리허설 워크플로의 finalize가 로그에서 읽는다.
    console.log(`stored_outcome=${storedCode} run_key=${parsed.runKey}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = error instanceof UsageError ? 2 : 1;
  } finally {
    await closeDb?.();
  }
}

// 직접 실행될 때만 main()을 부르고, 끝나면 명시적으로 종료한다(account-cli.ts와 같은
// 이유 — 남은 핸들이 Cloud Run Job을 task-timeout까지 매달리게 하지 않는다).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main()
    .then(() => {
      process.exit(process.exitCode ?? 0);
    })
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(process.exitCode || 1);
    });
}
