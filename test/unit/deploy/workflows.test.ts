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

  it("push(main, paths + !)와 workflow_dispatch(target/sha)로 트리거된다", () => {
    expect(deploy).toContain("branches: [main]");
    expect(deploy).not.toContain("paths-ignore");
    expect(deploy).toContain("paths:");
    const patterns = [
      '- "**"',
      '- "!.planning/**"',
      '- "!docs/**"',
      '- "docs/design/tokens.css"',
    ];
    const indexes = patterns.map((pattern) => deploy.indexOf(pattern));
    for (const index of indexes) expect(index).toBeGreaterThan(-1);
    expect(indexes).toEqual([...indexes].sort((a, b) => a - b));
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

  // WR-09: ci.yml과 동일한 구멍 — !docs/**가 unit 테스트가 읽는 docs 파일까지
  // 가려서 docs 전용 PR이 main에 머지된 뒤 배포 경로가 스킵될 수 있다.
  it("push paths가 unit 테스트가 읽는 5개 docs 파일을 모두 재포함한다(ci.yml과 동일, 순서 포함)", () => {
    const patterns = [
      '- "**"',
      '- "!.planning/**"',
      '- "!docs/**"',
      '- "docs/design/tokens.css"',
      '- "docs/design/SYSTEM.md"',
      '- "docs/design/DECISIONS.md"',
      '- "docs/ARCHITECTURE.md"',
      '- "docs/OPERATIONS.md"',
    ];
    const indexes = patterns.map((pattern) => deploy.indexOf(pattern));
    for (const [i, index] of indexes.entries()) {
      expect(index, `deploy.yml에 "${patterns[i]}"가 있어야 한다`).toBeGreaterThan(-1);
    }
    expect(indexes).toEqual([...indexes].sort((a, b) => a - b));
  });

  it(".planning/**은 여전히 완전히 제외된다(재포함 목록에 없다)", () => {
    expect(deploy).toContain('- "!.planning/**"');
    expect(deploy).not.toMatch(/-\s*"\.planning\//);
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

  // ENG-D12(04-50) — main이 아닌 ref의 workflow_dispatch가 클라우드 인증 전에 실패한다.
  it("staging·production 블록에 id: ref-guard가 각각 하나 있고 id: auth보다 앞이다(인증 전에 멈춘다)", () => {
    const stagingStart = deploy.indexOf("\n  staging:");
    const productionStart = deploy.indexOf("\n  production:");
    const stagingBlock = deploy.slice(stagingStart, productionStart);
    const productionBlock = deploy.slice(productionStart);

    for (const block of [stagingBlock, productionBlock]) {
      const guardCount = (block.match(/id: ref-guard/g) ?? []).length;
      expect(guardCount).toBe(1);
      const guardIndex = block.indexOf("id: ref-guard");
      const authIndex = block.indexOf("id: auth");
      expect(authIndex).toBeGreaterThan(-1);
      expect(guardIndex).toBeGreaterThan(-1);
      expect(guardIndex).toBeLessThan(authIndex);
    }
  });

  it("ref-guard는 env REF로 github.ref를 받고, run: 본문은 $REF만 읽어 refs/heads/main이 아니면 exit 1한다", () => {
    const stagingStart = deploy.indexOf("\n  staging:");
    const productionStart = deploy.indexOf("\n  production:");
    const stagingBlock = deploy.slice(stagingStart, productionStart);
    const productionBlock = deploy.slice(productionStart);

    for (const block of [stagingBlock, productionBlock]) {
      const guardStart = block.indexOf("id: ref-guard");
      expect(guardStart).toBeGreaterThan(-1);
      const nextStepStart = block.indexOf("\n      - ", guardStart);
      const guardStep = nextStepStart === -1 ? block.slice(guardStart) : block.slice(guardStart, nextStepStart);

      expect(guardStep).toContain("REF: ${{ github.ref }}");
      expect(guardStep).toContain("refs/heads/main");
      expect(guardStep).toContain("exit 1");

      // ref 값은 env로만 들어온다 — run: 본문에 ${{ 표현식 보간이 없다(T-1-32).
      const runIndex = guardStep.indexOf("run:");
      expect(runIndex).toBeGreaterThan(-1);
      expect(guardStep.slice(runIndex)).not.toContain("${{");
    }
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

  it("workflow_dispatch inputs env/action/email/name/role이 있다(D-36 이후 role, admin 아님)", () => {
    expect(account).toContain("workflow_dispatch:");
    expect(account).toContain("env:");
    expect(account).toContain("action:");
    expect(account).toContain("email:");
    expect(account).toContain("name:");
    expect(account).toContain("role:");
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

  // 04.2-08(D-4222): 해제한 운영자 = 워크플로를 실행한 GitHub 계정. 입력 칸이 아니라
  // GitHub가 정하는 github.triggering_actor를 env로만 받아 unlock일 때만 --operator로
  // 붙인다. github.actor가 아니라 github.triggering_actor를 쓰는 이유 — 재실행(re-run)은
  // github.actor가 워크플로를 처음 만든 사람으로 고정돼 재실행한 사람을 반영하지
  // 않는다.
  it("github.triggering_actor를 env INPUT_OPERATOR로 받는다", () => {
    expect(account).toContain("INPUT_OPERATOR: ${{ github.triggering_actor }}");
  });

  it("unlock일 때만 --args에 --operator,$INPUT_OPERATOR를 붙인다", () => {
    expect(account).toMatch(
      /if \[ "\$INPUT_ACTION" = "unlock" \]; then\s+ARGS="\$ARGS,--operator,\$INPUT_OPERATOR";?\s+fi/,
    );
    expect(account.match(/--operator/g) ?? []).toHaveLength(1);
  });

  it("run: 본문에 ${{ github.triggering_actor }}가 직접 들어가지 않는다(env로만 — T-1-32)", () => {
    const runBody = account.slice(account.indexOf("run: |"));
    expect(runBody).not.toMatch(/\$\{\{\s*github\.triggering_actor\s*\}\}/);
  });

  it("실제 프로젝트 번호·이메일 등 식별자를 담지 않는다", () => {
    expect(account).not.toMatch(/[0-9]{12}/);
    expect(account).not.toMatch(/@gmail\.com/);
  });

  // 실패 경로가 이유를 못 보여주던 결함(2026-09-20 QA 실측) — 실행이 실패하면
  // Actions 로그에 "account job execution failed" 한 줄만 남고 CLI가 stderr에
  // 찍은 한국어 메시지("이미 존재하는 이메일입니다: …" / "create에는 --name이
  // 필요합니다.")가 한 줄도 나오지 않았다. 원인 둘: ① 수집 지연을 모르고 한 번만
  // 읽는다 ② severity>=ERROR로 걸러 stderr가 DEFAULT로 들어오면 버린다.
  it("실패 경로가 severity로 거르지 않는다 — 컨테이너 stderr는 ERROR로 안 올 수 있다", () => {
    expect(account).not.toContain("severity>=ERROR");
  });

  it("실패 경로도 성공 경로와 같은 대기 규칙으로 재조회한다(수집 지연)", () => {
    // 두 경로가 각자 루프를 갖는 것보다 한 함수를 공유하는 편이 어긋날 수 없다 —
    // 이 둘이 어긋나 있던 것이 애초 결함의 원인이었다.
    expect(account).toMatch(/ATTEMPTS=\d+/);
    expect(account).toMatch(/INTERVAL=\d+/);
    expect(account).toMatch(/poll_logs\(\)\s*\{/);
    expect(account).toMatch(/for\s+\S+\s+in\s+\$\(seq 1 "\$ATTEMPTS"\)/);
    const calls = account.match(/poll_logs\s+"/g) ?? [];
    expect(calls.length).toBeGreaterThanOrEqual(2);
  });

  // 분기 경계를 정확히 잘라야 한다 — 마커 뒤 전체를 보면 성공 경로의 조회가
  // 걸려 실패 경로를 전혀 검사하지 않은 채 통과한다.
  const failBranch = (() => {
    const start = account.indexOf("account job execution failed");
    expect(start).toBeGreaterThan(-1);
    const end = account.indexOf("\n          fi", start);
    expect(end).toBeGreaterThan(start);
    return account.slice(start, end);
  })();

  it("실행이 실패해도 execution name으로 좁혀 조회한다(직전 실행 로그 혼입 방지)", () => {
    expect(failBranch).toContain("run.googleapis.com/execution_name");
  });

  it("실패 이유를 Actions 로그와 요약 양쪽에 남기고 여전히 실패로 끝낸다", () => {
    expect(failBranch).toContain("GITHUB_STEP_SUMMARY");
    expect(failBranch).toContain("exit 1");
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

// verify.yml — 사람 판정 중 "GCP 권한만 있으면 되는" 항목(조직 정책·SA 역할 원문,
// 백업 실패 경보 필터·메일)을 키 없이 닫는 경로. 조직 정책
// iam.disableServiceAccountKeyCreation이 SA 키 생성을 막으므로(2026-09-22 실측)
// 세션이 직접 gcloud를 쓰는 대신, 이미 WIF로 붙는 GitHub Actions를 띄우고 로그를 읽는다.
describe("verify.yml", () => {
  const verify = readWorkflow("verify.yml");

  it("workflow_dispatch input check(policies)만 있다 — 쓰기 권한이 필요한 점검은 두지 않는다", () => {
    expect(verify).toContain("workflow_dispatch:");
    expect(verify).toContain("check:");
    expect(verify).toContain("- policies");
    expect(verify).not.toContain("alert-test");
  });

  it("deploy.yml과 같은 WIF 인증을 쓰고 permissions에 id-token: write와 contents: read가 있다", () => {
    expect(verify).toContain("workload_identity_provider: projects/${{ vars.GCP_PROJECT_NUMBER }}/locations/global/workloadIdentityPools/github/providers/erp-repo");
    expect(verify).toContain("id-token: write");
    expect(verify).toContain("contents: read");
  });

  it("입력을 env로 넘겨 scripts/verify-gcp.sh에 위임한다(T-1-32)", () => {
    expect(verify).toContain("INPUT_CHECK: ${{ inputs.check }}");
    expect(verify).toContain("scripts/verify-gcp.sh");
    expect(verify).not.toMatch(/run:.*\$\{\{\s*inputs\./);
  });

  it("실제 프로젝트 번호·이메일 등 식별자를 담지 않는다", () => {
    expect(verify).not.toMatch(/[0-9]{12}/);
    expect(verify).not.toMatch(/@gmail\.com/);
  });
});

describe("scripts/verify-gcp.sh", () => {
  const script = readFileSync(resolve(process.cwd(), "scripts/verify-gcp.sh"), "utf8");

  it("policies는 bootstrap-gcp.sh와 같은 조직 정책 4개와 런타임·배포 SA의 역할을 읽는다", () => {
    for (const c of ["iam.allowedPolicyMemberDomains", "run.allowedIngress", "compute.restrictVpcPeering", "iam.workloadIdentityPoolProviders"]) {
      expect(script).toContain(c);
    }
    expect(script).toContain("get-iam-policy");
    expect(script).toContain("runtime_sa");
    expect(script).toContain("gha-deployer");
  });

  it("로그를 쓰거나 리소스를 바꾸는 명령이 없다(읽기 전용 역할만 받는다)", () => {
    expect(script).not.toMatch(/entries:write|logging write|add-iam-policy-binding|secrets versions add|run deploy/);
  });

  it("실패를 || true로 삼키지 않고 마지막에 실패 수로 종료한다", () => {
    expect(script).not.toMatch(/\|\|\s*true/);
    expect(script).toMatch(/exit\s+"?\$?\{?FAILED/);
  });
});
