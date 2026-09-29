import { build } from "esbuild";
import { readFileSync } from "node:fs";

// Cloud Run Job 5개(migrate·seed·db-bootstrap·account·restore)가 공유하는 CLI 번들.
// next를 끌어오면 01-01·01-02 계약 위반이므로 빌드 뒤 문자열 검사로 실패시킨다.

const entryPoints = [
  "scripts/migrate-runner.ts",
  "scripts/seed-master.ts",
  "scripts/account-cli.ts",
  "scripts/db-bootstrap.ts",
  "scripts/restore-rehearsal-cli.ts",
];

const outputs = [
  "dist/cli/migrate-runner.mjs",
  "dist/cli/seed-master.mjs",
  "dist/cli/account-cli.mjs",
  "dist/cli/db-bootstrap.mjs",
  "dist/cli/restore-rehearsal-cli.mjs",
];

async function main() {
  await build({
    entryPoints,
    bundle: true,
    platform: "node",
    target: "node24",
    format: "esm",
    outdir: "dist/cli",
    outExtension: { ".js": ".mjs" },
    // node_modules 전체를 external로 둔다(pg-native 포함) — 실제 실행 확인 중
    // 발견(Rule 1): google-gax/google-cloud 계열(@google-cloud/cloud-sql-connector의
    // 전이 의존성)을 단일 ESM 파일로 번들하면 Node 22/24가 런타임에
    // "Cannot determine intended module format because both require() and
    // top-level await are present"로 크래시한다(require()/동적 로딩이 섞인
    // 대형 gRPC 코드베이스가 esbuild의 CJS interop과 충돌). 런타임엔 진짜
    // node_modules가 필요하다 — `.next/standalone`이 트레이싱하는 node_modules는
    // 이 패키지들의 파일을 담기는 하지만 최상위 심볼릭 링크를 항상 만들어주진
    // 않는다(실제 스테이징 배포에서 재현, 2026-09-18: ERR_MODULE_NOT_FOUND).
    // 그래서 Dockerfile이 dist/cli 바로 아래에 정상적으로 pnpm install된
    // 프로덕션 전용 node_modules를 따로 둔다(deps-prod 스테이지).
    packages: "external",
    banner: {
      js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
    },
    tsconfig: "tsconfig.json",
    logLevel: "info",
  });

  for (const file of outputs) {
    const content = readFileSync(file, "utf8");
    if (content.includes('from "next')) {
      throw new Error(`${file} imports "next" — CLI 번들은 Next.js에 의존하면 안 됩니다`);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
