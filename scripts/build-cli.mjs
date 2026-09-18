import { build } from "esbuild";
import { readFileSync } from "node:fs";

// 01-06 Cloud Run Job 3개(migrate·db-bootstrap·account)가 공유하는 CLI 번들.
// next를 끌어오면 01-01·01-02 계약 위반이므로 빌드 뒤 문자열 검사로 실패시킨다.

const entryPoints = ["scripts/migrate-runner.ts", "scripts/account-cli.ts", "scripts/db-bootstrap.ts"];

const outputs = ["dist/cli/migrate-runner.mjs", "dist/cli/account-cli.mjs", "dist/cli/db-bootstrap.mjs"];

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
    // 대형 gRPC 코드베이스가 esbuild의 CJS interop과 충돌). 이 패키지들은 이미
    // Next.js 앱(app/admin/system-status, db/client.ts)이 실제로 쓰고 있어
    // `.next/standalone/node_modules`에 pnpm trace로 포함되고, 같은 이미지의
    // dist/cli는 standalone과 같은 /app 루트에서 실행되므로(Node 모듈 해석이
    // 상위 디렉터리로 올라가며 node_modules를 찾는다) external로 둬도 런타임에
    // 정상 resolve된다.
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
