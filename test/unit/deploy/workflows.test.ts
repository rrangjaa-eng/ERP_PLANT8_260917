import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// .github/workflows/deploy.yml·account.yml — 텍스트 메타 검사(YAML 파서 없이).
// 01-04의 test/unit/ci-guard.test.ts와 같은 접근.

const WORKFLOWS_DIR = resolve(process.cwd(), ".github/workflows");

function readWorkflow(filename: string): string {
  return readFileSync(resolve(WORKFLOWS_DIR, filename), "utf8");
}

describe("deploy.yml", () => {
  const deploy = readWorkflow("deploy.yml");

  it("push(main, paths-ignore)와 workflow_dispatch(target/sha)로 트리거된다", () => {
    expect(deploy).toContain("branches: [main]");
    expect(deploy).toContain("paths-ignore");
    expect(deploy).toContain(".planning/**");
    expect(deploy).toContain("docs/**");
    expect(deploy).toMatch(/options:\s*\n\s*- staging\s*\n\s*- production/);
    expect(deploy).toContain("default: staging");
    expect(deploy).toMatch(/sha:[\s\S]*?default: ""/);
  });

  it("permissions에 id-token: write와 contents: read가 있다", () => {
    expect(deploy).toContain("id-token: write");
    expect(deploy).toContain("contents: read");
  });

  it("ci 잡이 workflow_call로 ci.yml을 부른다", () => {
    expect(deploy).toContain("uses: ./.github/workflows/ci.yml");
  });

  it("WIF 인증에 정확한 workload_identity_provider 키를 쓴다(오타 없음)", () => {
    expect(deploy).toContain("workload_identity_provider:");
    expect(deploy).not.toContain("workflow_identity_provider:");
    expect(deploy).toContain("google-github-actions/auth@v3");
  });

  it("staging 잡은 needs: ci이고 push 또는 target==staging에서 실행된다", () => {
    const stagingStart = deploy.indexOf("\n  staging:");
    const productionStart = deploy.indexOf("\n  production:");
    expect(stagingStart).toBeGreaterThan(-1);
    expect(productionStart).toBeGreaterThan(stagingStart);
    const stagingBlock = deploy.slice(stagingStart, productionStart);
    expect(stagingBlock).toContain("needs: ci");
    expect(stagingBlock).toContain("github.event_name == 'push'");
    expect(stagingBlock).toContain("inputs.target == 'staging'");
  });

  it("production 잡은 workflow_dispatch + target==production으로만 실행되고 needs가 없으며 push로는 실행되지 않는다", () => {
    const productionStart = deploy.indexOf("\n  production:");
    const productionBlock = deploy.slice(productionStart);
    const ifLine = productionBlock.split("\n").find((l) => l.trim().startsWith("if:"));
    expect(ifLine).toBeDefined();
    expect(ifLine).toContain("workflow_dispatch");
    expect(ifLine).toContain("inputs.target == 'production'");
    expect(ifLine).not.toContain("push");
    expect(productionBlock.split("\n").slice(0, 5).some((l) => l.includes("needs:"))).toBe(false);
  });

  it("production 잡의 guard 스텝이 scripts/promote-guard.sh에 위임하고 결과 SHA를 출력으로 넘긴다", () => {
    const productionStart = deploy.indexOf("\n  production:");
    const productionBlock = deploy.slice(productionStart);
    expect(productionBlock).toContain("id: guard");
    expect(productionBlock).toContain("bash scripts/promote-guard.sh");
    expect(productionBlock).toContain("PROMOTE_SHA=");
    expect(productionBlock).toMatch(/echo "sha=\$SHA" >> "\$GITHUB_OUTPUT"/);
    expect(productionBlock).toContain("promoting $SHA (staging serving $STAGING_SHA)");
    // 입력은 env로 넘겨 셸 인젝션을 막는다(T-1-32 — account.yml과 같은 규약).
    expect(productionBlock).toContain("SHA_INPUT: ${{ inputs.sha }}");
    expect(productionBlock).toContain('--sha "$SHA_INPUT"');
  });

  it("guard가 리비전 이미지 문자열에서 SHA를 잘라내지 않는다 (01-07 실측으로 기각된 전제)", () => {
    // Cloud Run은 `app:<sha>` 태그를 다이제스트로 해석해 `app@sha256:…`로
    // 저장한다 — 마지막 `:` 뒤를 git SHA로 쓰면 승격이 영구히 막힌다.
    const guard = readFileSync(resolve(process.cwd(), "scripts/promote-guard.sh"), "utf8");
    for (const content of [deploy, guard]) {
      expect(content).not.toContain("${STAGING_IMAGE##*:}");
      expect(content).not.toMatch(/value\(spec\.containers\[0\]\.image\)/);
    }
    // 대신 리비전의 APP_GIT_SHA 환경변수에서 읽는다.
    expect(guard).toContain("APP_GIT_SHA");
    expect(guard).toContain("run revisions describe");
    expect(guard).toContain("artifacts docker images describe");
    expect(guard).toContain("svc_name staging");
    expect(guard).toContain("git rev-parse --verify");
    expect(guard).toContain("exit 1");
    expect(guard).not.toMatch(/[0-9]{12}/);
  });

  it("두 잡 모두 scripts/deploy.sh를 실행하고, staging은 --sha github.sha, production은 --env prod --sha steps.guard.outputs.sha를 쓴다", () => {
    const stagingStart = deploy.indexOf("\n  staging:");
    const productionStart = deploy.indexOf("\n  production:");
    const stagingBlock = deploy.slice(stagingStart, productionStart);
    const productionBlock = deploy.slice(productionStart);

    expect(stagingBlock).toContain("bash scripts/deploy.sh --env staging");
    expect(stagingBlock).toContain('--sha "${{ github.sha }}"');
    expect(productionBlock).toContain("bash scripts/deploy.sh --env prod");
    expect(productionBlock).toContain('--sha "${{ steps.guard.outputs.sha }}"');
    expect(stagingBlock).toContain("ALERT_EMAIL: ${{ vars.ALERT_EMAIL }}");
    expect(productionBlock).toContain("ALERT_EMAIL: ${{ vars.ALERT_EMAIL }}");
  });

  it("environment: 키를 쓰지 않는다(GitHub Environments 미사용, D-05)", () => {
    for (const file of ["deploy.yml", "account.yml", "ci.yml"]) {
      const content = readWorkflow(file);
      const hasEnvironmentKey = content
        .split("\n")
        .some((line) => /^\s*environment:/.test(line) && !line.trim().startsWith("#"));
      expect(hasEnvironmentKey, `${file}에 environment: 키가 있으면 안 된다`).toBe(false);
    }
  });

  it("needs: staging가 없다(production이 push 체인에 매달리지 않는다)", () => {
    expect(deploy).not.toContain("needs: staging");
  });

  it("deploy.sh 스텝과 guard 스텝 모두 shell: bash이고 setup-gcloud는 alpha,beta 컴포넌트를 쓴다", () => {
    const shellBashCount = (deploy.match(/shell: bash/g) ?? []).length;
    expect(shellBashCount).toBeGreaterThanOrEqual(3);
    const installComponentsCount = (deploy.match(/install_components: alpha,beta/g) ?? []).length;
    expect(installComponentsCount).toBeGreaterThanOrEqual(2);
  });

  it("실제 프로젝트 번호·이메일 등 식별자를 담지 않는다", () => {
    expect(deploy).not.toMatch(/[0-9]{12}/);
    expect(deploy).not.toMatch(/@gmail\.com/);
  });
});

describe("account.yml", () => {
  const account = readWorkflow("account.yml");

  it("workflow_dispatch inputs env/action/email/name/admin이 있다", () => {
    expect(account).toContain("workflow_dispatch:");
    expect(account).toContain("env:");
    expect(account).toContain("action:");
    expect(account).toContain("email:");
    expect(account).toContain("name:");
    expect(account).toContain("admin:");
  });

  it("permissions에 id-token: write와 contents: read가 있다", () => {
    expect(account).toContain("id-token: write");
    expect(account).toContain("contents: read");
  });

  it("Cloud Run Job을 --args로 실행하고 01-02 parseArgs 규약(플래그·값 별개 항목)을 따른다", () => {
    expect(account).toContain("--args=");
    expect(account).toContain("--email,");
    expect(account).not.toMatch(/--email=/);
  });

  it("gcloud logging read를 반복문 안에서 폴링하고 재실행 금지 안내를 남긴다", () => {
    expect(account).toContain("gcloud logging read");
    expect(account).toContain("sleep");
    expect(account).toMatch(/for .* in .*seq/);
    expect(account).toContain("do NOT re-run reset");
    expect(account).toContain("temporary password");
  });

  it("입력을 env로 넘겨 셸 인젝션을 막는다(T-1-32)", () => {
    expect(account).toContain("INPUT_EMAIL: ${{ inputs.email }}");
    expect(account).not.toMatch(/\$\{\{\s*inputs\.email\s*\}\}["'].*run:/);
  });

  it("실제 프로젝트 번호·이메일 등 식별자를 담지 않는다", () => {
    expect(account).not.toMatch(/[0-9]{12}/);
    expect(account).not.toMatch(/@gmail\.com/);
  });
});

describe("deploy 워크플로 — ci-guard와 동일한 push 하위 명령 부재 확인", () => {
  it("deploy.yml·account.yml 어디에도 drizzle-kit push가 없다", () => {
    for (const file of readdirSync(WORKFLOWS_DIR)) {
      if (!file.endsWith(".yml")) continue;
      const content = readWorkflow(file);
      expect(content).not.toMatch(/drizzle-kit\s+push/);
    }
  });
});
