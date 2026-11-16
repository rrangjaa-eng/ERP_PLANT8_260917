import { pathToFileURL } from "node:url";
import type * as CutoverDomain from "@/domain/cutover";
import type { log as Log } from "@/lib/log";
import type { Viewer } from "@/domain/viewer";

// 08-02(D8-05): 전환 CLI — 기본이 dry-run(건수 · 확인 문자열만), `--apply --confirm <확인 문자열>`일 때만 업무 표를 비운다.
// 운영에는 08-04 Cloud Run Job으로만 닿는다(세션이 운영 DB에 직접 명령하지 않는다).
// 인자 규약은 purge-certs.ts와 같다 — 플래그와 값은 별개 argv 원소, 등호 결합 거부.
// node: 내장만 정적으로 불러온다(restore-rehearsal-cli.ts 선례) — db/client.ts의 top-level await 전에 인자를 검사한다.
// 종료 코드: 0 끝남 · 2 사용 오류 · 3 거부(already_cut_over · confirm_mismatch · backup_not_fresh) · 1 그 밖.

export class UsageError extends Error {}

export type CutoverArgs = { apply: boolean; confirm: string | null; runUrl: string | null };

const CONFIRM_PATTERN = /^[0-9]+-[0-9a-f]{8}$/;
const RUN_URL_PATTERN = /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/actions\/runs\/[0-9]+$/;

function valueAfter(argv: string[], index: number, flag: string): string {
  const value = argv[index + 1];
  if (value === undefined || value.startsWith("--")) throw new UsageError(`${flag} 뒤에 값이 없습니다.`);
  return value;
}

export function parseArgs(argv: string[]): CutoverArgs {
  const args: CutoverArgs = { apply: false, confirm: null, runUrl: null };
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i] ?? "";
    if (token.startsWith("--") && token.includes("=")) {
      throw new UsageError(`등호 결합(--flag=value) 토큰은 지원하지 않습니다: ${token}`);
    }
    if (token === "--apply") {
      args.apply = true;
    } else if (token === "--confirm") {
      const value = valueAfter(argv, i++, token);
      if (!CONFIRM_PATTERN.test(value)) throw new UsageError(`확인 문자열 꼴이 아닙니다: ${value}`);
      args.confirm = value;
    } else if (token === "--run-url") {
      const value = valueAfter(argv, i++, token);
      if (!RUN_URL_PATTERN.test(value)) throw new UsageError(`GitHub Actions 실행 주소가 아닙니다: ${value}`);
      args.runUrl = value;
    } else if (token.startsWith("--")) {
      throw new UsageError(`알 수 없는 플래그: ${token}`);
    } else {
      throw new UsageError(`알 수 없는 인자: ${token}`);
    }
  }
  if (args.apply && args.confirm === null) throw new UsageError("--apply에는 --confirm <확인 문자열>이 필요합니다.");
  if (!args.apply && args.confirm !== null) throw new UsageError("--confirm은 --apply와 함께만 씁니다.");
  return args;
}

export type CliDeps = {
  domain: Pick<typeof CutoverDomain, "dryRunCutover" | "applyCutover" | "cleanupCutoverObjects" | "CutoverRefusedError">;
  cutoverDeps: CutoverDomain.CutoverDeps;
  viewer: Viewer;
  log: Pick<typeof Log, "info" | "warn">;
  appEnv: string;
  now: () => Date;
  // 운영 · 스테이징은 gcs 드라이버(getObjectStorage). apply 전에 부른다 — 버킷 설정이 없으면 아무것도 지우기 전에 끝난다.
  getStorage: () => CutoverDomain.CleanupStorage;
};

export async function runCli(argv: string[], loadDeps: () => Promise<CliDeps>): Promise<number> {
  let args: CutoverArgs;
  try {
    args = parseArgs(argv);
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    console.error(error.message);
    return 2;
  }

  let deps: CliDeps | null = null;
  try {
    deps = await loadDeps();
    const { domain, log } = deps;
    if (!args.apply) {
      log.info("cutover.done", { env: deps.appEnv, ...(await domain.dryRunCutover(deps.viewer)) });
      return 0;
    }
    const storage = deps.getStorage();
    const { objectKeys, ...result } = await domain.applyCutover(
      deps.viewer,
      { confirm: args.confirm ?? "", now: deps.now(), runUrl: args.runUrl },
      deps.cutoverDeps,
    );
    // eng 검토 1회차 2026-11-04 (E4): 커밋 직후 · 정리 전에 DB 결과와 지울 키 전부를 먼저 남긴다 — 정리 중 Job이 끊겨도
    // 전환 여부와 남은 키가 로그에 있다(pending만 있고 cutover.objects가 없으면 정리 중 끊긴 것).
    log.info("cutover.done", { env: deps.appEnv, ...result, objects: objectKeys.length });
    if (objectKeys.length === 0) return 0;
    log.info("cutover.objects.pending", { total: objectKeys.length, keys: objectKeys });
    const objects = await domain.cleanupCutoverObjects(objectKeys, { storage }, { now: deps.now });
    if (objects.orphaned > 0) log.warn("cutover.objects", objects);
    else log.info("cutover.objects", objects);
    return 0;
  } catch (error) {
    if (deps && error instanceof deps.domain.CutoverRefusedError) {
      deps.log.warn("cutover.refused", { reason: error.reason, ...(error.backup ? { backup: error.backup } : {}) });
      return 3;
    }
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

let closeDb: (() => Promise<void>) | null = null;

async function loadDeps(): Promise<CliDeps> {
  const [client, domain, backup, { log }, { env }, { SYSTEM_VIEWER }, { getObjectStorage }] = await Promise.all([
    import("@/db/client"),
    import("@/domain/cutover"),
    import("@/lib/gcp/cloud-sql-admin"),
    import("@/lib/log"),
    import("@/lib/env"),
    import("@/domain/viewer"),
    import("@/lib/gcp/storage"),
  ]);
  closeDb = client.closeDb;
  return {
    domain,
    cutoverDeps: { getLastBackup: (params) => backup.getLastBackup(params) },
    viewer: SYSTEM_VIEWER,
    log,
    appEnv: env.APP_ENV,
    now: () => new Date(),
    getStorage: getObjectStorage,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void runCli(process.argv.slice(2), loadDeps).then(async (code) => {
    await closeDb?.().catch(() => undefined);
    process.exit(code);
  });
}
