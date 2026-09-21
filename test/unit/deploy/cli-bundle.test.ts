import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Cloud Run Job은 `--args=dist/cli/<name>.mjs`로 CLI 번들 안의 파일을 실행한다.
// 그 파일을 만드는 건 scripts/build-cli.mjs의 outputs 목록뿐이라, deploy.sh가
// 부르는 이름과 번들이 만드는 이름이 어긋나면 배포 시점까지 아무도 모른다 —
// 실측 결함: 03이 권한표·노출표를 domain/seed에서 파생하게 바꿨는데
// seed-master는 번들에도 배포 파이프라인에도 없어서, 스테이징·프로덕션은
// permission_matrix가 빈 채로 뜨고 can()이 전부 거부했다.
const DEPLOY_SH = readFileSync(resolve(process.cwd(), "scripts/deploy.sh"), "utf8");
const BUILD_CLI = readFileSync(resolve(process.cwd(), "scripts/build-cli.mjs"), "utf8");

function bundledOutputs(): string[] {
  const match = BUILD_CLI.match(/const outputs = \[([^\]]*)\]/);
  if (!match || match[1] === undefined) throw new Error("scripts/build-cli.mjs에서 outputs 배열을 찾지 못했다");
  return [...match[1].matchAll(/"([^"]+)"/g)].map((m) => m[1] ?? "");
}

function cliEntriesCalledByDeploy(): string[] {
  return [...DEPLOY_SH.matchAll(/--args=(dist\/cli\/[A-Za-z0-9._-]+\.mjs)/g)].map((m) => m[1] ?? "");
}

describe("CLI 번들 계약(deploy.sh ↔ build-cli.mjs)", () => {
  it("deploy.sh가 부르는 dist/cli 진입점을 하나 이상 찾는다(파서가 죽어있지 않다)", () => {
    expect(cliEntriesCalledByDeploy().length).toBeGreaterThan(0);
  });

  it("deploy.sh가 부르는 모든 dist/cli 진입점을 build-cli.mjs가 만든다", () => {
    const outputs = bundledOutputs();
    const missing = cliEntriesCalledByDeploy().filter((entry) => !outputs.includes(entry));
    expect(missing, `번들에 없는 진입점: ${missing.join(", ")}`).toEqual([]);
  });

  it("파생 시드(seed-master)가 번들에 들어 있다", () => {
    expect(bundledOutputs()).toContain("dist/cli/seed-master.mjs");
  });
});
