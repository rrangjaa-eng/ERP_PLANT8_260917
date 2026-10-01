import { pathToFileURL } from "node:url";
import { closeDb } from "@/db/client";
import { runCertPurge } from "@/domain/certs/purge";
import { log } from "@/lib/log";

// CERT-02 확인증 파기 CLI. 기본이 미리 보기(dry-run)다 — 대상 수만 보이고 아무것도 바꾸지 않는다(RESEARCH 보안 표
// 「dry-run 필수」). `--apply`일 때만 개인정보 칸을 비운다. 실행 주기 · 절차는 docs/OPERATIONS.md 「확인증 파기」 절.
// scripts/rotate-key.ts와 같은 인자 규약 — 플래그와 값은 별개 argv 원소, 등호 결합(--flag=value) 거부.
export class UsageError extends Error {}

export function parseArgs(argv: string[]): { apply: boolean } {
  let apply = false;
  for (const token of argv) {
    if (token.startsWith("--") && token.includes("=")) {
      throw new UsageError(`등호 결합(--flag=value) 토큰은 지원하지 않습니다: ${token}`);
    }
    if (token === "--apply") {
      apply = true;
    } else if (token.startsWith("--")) {
      throw new UsageError(`알 수 없는 플래그: ${token}`);
    }
  }
  return { apply };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void Promise.resolve()
    .then(() => {
      const { apply } = parseArgs(process.argv.slice(2));
      return runCertPurge({ now: new Date(), apply }).then((result) => ({ apply, result }));
    })
    .then(async ({ apply, result }) => {
      log.info("purge_certs.done", { mode: apply ? "apply" : "dry-run", ...result });
      await closeDb();
      process.exit(0);
    })
    .catch(async (error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error));
      await closeDb().catch(() => undefined);
      process.exit(1);
    });
}
