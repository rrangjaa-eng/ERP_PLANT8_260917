import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { importSettings, ImportValidationError, type SettingsExport } from "@/domain/settings/export";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { closeDb } from "@/db/client";

// ADMN-06: 설정 가져오기 운영자 진입점 — 로컬 tsx 전용(로컬/operator-run,
// Cloud Run Job 번들에는 넣지 않는다). scripts/rotate-key.ts와 같은 판단:
// 두 스크립트 모두 배포마다 자동으로 도는 프로비저닝 단계(migrate·seed·
// account·db-bootstrap, 이 넷만 scripts/build-cli.mjs 번들·Cloud Run Job으로
// 존재)가 아니라, 운영자가 필요할 때 손으로 한 번 돌리는 관리 작업이다.
// db:rotate-key와 동일하게 .env.local(DATABASE_URL 등)을 세팅한 로컬에서
// `pnpm settings:import --file <경로>`로 실행한다(docs/OPERATIONS.md §12).
//
// scripts/account-cli.ts와 같은 인자 규약 — 플래그와 값은 항상 별개 argv
// 원소, 등호 결합(--flag=value) 거부.

export class UsageError extends Error {}

export type ParsedArgs = { file: string };

export function parseArgs(argv: string[]): ParsedArgs {
  const flags: { file?: string } = {};
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token === "--file") {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith("--")) {
        throw new UsageError("--file 뒤에 값이 필요합니다.");
      }
      flags.file = value;
      i++;
    } else {
      throw new UsageError(`알 수 없는 플래그: ${token}. 등호 결합(--flag=value) 토큰은 지원하지 않습니다.`);
    }
  }

  if (!flags.file) {
    throw new UsageError("--file <경로>가 필요합니다.");
  }

  return { file: flags.file };
}

// 파일 시스템·JSON 파싱 오류는 여기서 UsageError로 감싼다 — importSettings의
// ImportValidationError(등록된 값의 스키마 검증 실패)와 운영자가 구분할 수
// 있게. importSettings 자신은 전 항목을 먼저 검증하고 하나라도 실패하면
// 아무것도 쓰지 않는다(단일 트랜잭션) — 이 스크립트는 그 오류(issues 배열)를
// 그대로 표면화하기만 하고 별도로 삼키지 않는다.
export function readPayload(filePath: string): SettingsExport {
  let raw: string;
  try {
    raw = readFileSync(filePath, "utf8");
  } catch (error) {
    throw new UsageError(`파일을 읽을 수 없습니다: ${filePath} (${error instanceof Error ? error.message : String(error)})`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new UsageError(`올바른 JSON이 아닙니다: ${filePath} (${error instanceof Error ? error.message : String(error)})`);
  }

  if (typeof parsed !== "object" || parsed === null || !("settings" in parsed)) {
    throw new UsageError(`올바른 설정 내보내기 형식이 아닙니다(settings 필드 없음): ${filePath}`);
  }

  return parsed as SettingsExport;
}

export async function main(): Promise<void> {
  try {
    const { file } = parseArgs(process.argv.slice(2));
    const payload = readPayload(file);
    const keyCount = Object.keys(payload.settings ?? {}).length;

    await importSettings(SYSTEM_VIEWER, payload);
    console.log(`settings imported: ${keyCount} keys from ${file}`);
  } catch (error) {
    if (error instanceof ImportValidationError) {
      // 부분적으로만 유효한 파일: 아무것도 적용되지 않았음을 먼저 밝히고,
      // 검증 실패 항목 전부를 한 줄씩 나열한다(join된 메시지 한 줄로
      // 뭉개지 않는다 — 운영자가 파일에서 무엇을 고쳐야 하는지 보게).
      console.error(`설정 가져오기 검증 실패(${error.issues.length}건). 아무것도 적용되지 않았습니다.`);
      for (const issue of error.issues) {
        console.error(`  - ${issue}`);
      }
      process.exitCode = 1;
    } else {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = error instanceof UsageError ? 2 : 1;
    }
  } finally {
    await closeDb();
  }
}

// 테스트가 이 파일을 import해도 실행되지 않게: 직접 실행될 때만 main()을
// 부른다(scripts/account-cli.ts와 같은 결). process.exit는 main() 밖에
// 둔다 — main()이 끝난 뒤 finally의 closeDb()가 새로 던질 수 있는 경로까지
// 여기 catch가 잡는다(account-cli.ts와 같은 이유).
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
