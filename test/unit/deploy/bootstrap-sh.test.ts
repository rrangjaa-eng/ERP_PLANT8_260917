import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// scripts/bootstrap-gcp.sh — 사용자가 Cloud Shell에서 1회 실행하는 부트스트랩을
// 가짜 gcloud 위에서 순서·거부 조건·멱등성으로 단언한다(D-02, D-03).

const REPO_ROOT = process.cwd();
const FAKEBIN = join(REPO_ROOT, "test/unit/deploy/fakebin");
const SCRIPT_PATH = join(REPO_ROOT, "scripts/bootstrap-gcp.sh");
const NAMES_PATH = join(REPO_ROOT, "infra/names.sh");

interface BootstrapResult {
  status: number | null;
  stdout: string;
  stderr: string;
  log: string;
}

function bootstrap(
  args: string[],
  state: Record<string, string | true> = {},
): BootstrapResult {
  const stateDir = mkdtempSync(join(tmpdir(), "bootstrap-state-"));
  for (const [name, value] of Object.entries(state)) {
    writeFileSync(join(stateDir, name), value === true ? "" : value);
  }
  const logDir = mkdtempSync(join(tmpdir(), "bootstrap-log-"));
  const logPath = join(logDir, "log");
  writeFileSync(logPath, "");

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PATH: `${FAKEBIN}:${process.env.PATH ?? ""}`,
    DEPLOY_FAKE_STATE: stateDir,
    DEPLOY_FAKE_LOG: logPath,
  };

  const result = spawnSync("bash", [SCRIPT_PATH, ...args], {
    cwd: REPO_ROOT,
    env,
    encoding: "utf8",
  });

  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
    log: readFileSync(logPath, "utf8"),
  };
}

function lineIndex(log: string, needle: string): number {
  return log.split("\n").findIndex((line) => line.includes(needle));
}

describe("bootstrap-gcp.sh — 새 프로젝트", () => {
  it("exit 0이고 사전 검사 → API → WIF → SA → 역할 → VPC → 조직 정책 순으로 호출된다", () => {
    const r = bootstrap(["--project", "test-proj", "--github-repo", "rrangjaa-eng/ERP_PLANT8_260917"], {
      "no-vpc-peering": true,
    });
    expect(r.status).toBe(0);

    const order = [
      "services enable",
      "iam workload-identity-pools create github",
      "providers create-oidc erp-repo",
      "iam service-accounts create gha-deployer",
      "service-accounts create plant8-staging-runtime",
      "service-accounts create plant8-prod-runtime",
      "projects add-iam-policy-binding",
      "add-iam-policy-binding gha-deployer@",
      "compute addresses create google-managed-services-default",
      "services vpc-peerings connect",
      "org-policies describe iam.allowedPolicyMemberDomains",
    ].map((needle) => lineIndex(r.log, needle));
    for (const idx of order) expect(idx).toBeGreaterThan(-1);
    expect(order).toEqual([...order].sort((a, b) => a - b));

    const providerLine = r.log.split("\n").find((l) => l.includes("create-oidc erp-repo"));
    expect(providerLine).toContain("assertion.repository == 'rrangjaa-eng/ERP_PLANT8_260917'");
    expect(providerLine).toContain("--issuer-uri=https://token.actions.githubusercontent.com");

    for (const env of ["staging", "prod"]) {
      for (const role of ["cloudsql.client", "cloudsql.instanceUser", "cloudsql.viewer", "logging.logWriter", "monitoring.metricWriter"]) {
        expect(r.log).toContain(`serviceAccount:plant8-${env}-runtime@test-proj.iam.gserviceaccount.com --role=roles/${role}`);
      }
    }

    // 04.2-04(D-4212): 스케줄러 SA는 소유자 bootstrap이 만들고, 배포자에게는
    // 스케줄러 관리 역할과 그 SA 사용 권한만 준다 — SA 관리 권한은 주지 않는다.
    expect(r.log).toContain("iam service-accounts create plant8-staging-scheduler ");
    expect(r.log).toContain("iam service-accounts create plant8-prod-scheduler ");
    expect(r.log).toContain("serviceAccount:gha-deployer@test-proj.iam.gserviceaccount.com --role=roles/cloudscheduler.admin");
    for (const env of ["staging", "prod"]) {
      const binding = r.log
        .split("\n")
        .find((l) => l.startsWith(`iam service-accounts add-iam-policy-binding plant8-${env}-scheduler@test-proj.iam.gserviceaccount.com `));
      expect(binding, `scheduler SA binding for ${env}`).toBeDefined();
      expect(binding).toContain("--member=serviceAccount:gha-deployer@test-proj.iam.gserviceaccount.com");
      expect(binding).toContain("--role=roles/iam.serviceAccountUser");
    }
    expect(r.log).not.toContain("serviceAccountAdmin");

    expect(r.stdout).toContain("GCP_PROJECT_ID=test-proj");
    expect(r.stdout).toContain("GCP_PROJECT_NUMBER=123456789012");
    expect(r.stdout).toContain("GCP_REGION=asia-northeast3");
  });

  it("org-policies describe iam.workloadIdentityPoolProviders가 workload-identity-pools create보다 앞에 있다", () => {
    const r = bootstrap(["--project", "test-proj", "--github-repo", "rrangjaa-eng/ERP_PLANT8_260917"], {
      "no-vpc-peering": true,
    });
    const gateIdx = lineIndex(r.log, "org-policies describe iam.workloadIdentityPoolProviders");
    const createIdx = lineIndex(r.log, "workload-identity-pools create github");
    expect(gateIdx).toBeGreaterThan(-1);
    expect(createIdx).toBeGreaterThan(gateIdx);
  });

  it("--github-repo가 없으면 exit 2", () => {
    const r = bootstrap(["--project", "test-proj"]);
    expect(r.status).toBe(2);
  });

  it("두 번째 실행(이미 존재하는 상태)도 exit 0이다", () => {
    const r = bootstrap(["--project", "test-proj", "--github-repo", "rrangjaa-eng/ERP_PLANT8_260917"], {
      "wif-pool-exists": true,
      "wif-provider-exists": true,
      "sa-exists": true,
      "network-exists": true,
      "address-exists": true,
    });
    expect(r.status).toBe(0);
  });

  it("프로젝트가 없으면(D-03) exit 1, 아무 리소스도 만들지 않는다", () => {
    const r = bootstrap(["--project", "test-proj", "--github-repo", "rrangjaa-eng/ERP_PLANT8_260917"], {
      "project-missing": true,
    });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("not found");
    expect(r.stderr).toContain("D-03");
    expect(r.log).not.toMatch(/services enable|create/);
  });

  it("결제가 연결돼 있지 않으면 exit 1, services enable을 호출하지 않는다", () => {
    const r = bootstrap(["--project", "test-proj", "--github-repo", "rrangjaa-eng/ERP_PLANT8_260917"], {
      "billing-disabled": true,
    });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("billing");
    expect(r.log).not.toContain("services enable");
  });
});

describe("bootstrap-gcp.sh — 단일 파일(names.sh 미의존) + 이름 상수 일치", () => {
  it("infra/names.sh를 source하지 않는다", () => {
    const script = readFileSync(SCRIPT_PATH, "utf8");
    expect(script).not.toMatch(/source .*names\.sh/);
  });

  it("스케줄러 SA 이름이 infra/names.sh scheduler_sa와 같다(04.2-04)", () => {
    const r = bootstrap(["--project", "test-proj", "--github-repo", "rrangjaa-eng/ERP_PLANT8_260917"], {
      "no-vpc-peering": true,
    });
    for (const env of ["staging", "prod"]) {
      const out = spawnSync("bash", ["-c", `source "${NAMES_PATH}"; scheduler_sa ${env}`], { encoding: "utf8" });
      const name = out.stdout.trim();
      expect(name).toBe(`plant8-${env}-scheduler`);
      expect(r.log).toContain(`iam service-accounts create ${name} `);
    }
  });

  it("WIF_POOL·WIF_PROVIDER·DEPLOYER_SA·REGION_DEFAULT·VPC_RANGE·NETWORK 값이 infra/names.sh와 같다", () => {
    const script = readFileSync(SCRIPT_PATH, "utf8");
    const names = readFileSync(NAMES_PATH, "utf8");

    for (const key of ["WIF_POOL", "WIF_PROVIDER", "DEPLOYER_SA", "REGION_DEFAULT", "VPC_RANGE", "NETWORK"]) {
      const scriptMatch = script.match(new RegExp(`^${key}=(\\S+)`, "m"));
      const namesMatch = names.match(new RegExp(`^${key}=(\\S+)`, "m"));
      expect(scriptMatch, `${key} not found in bootstrap-gcp.sh`).not.toBeNull();
      expect(namesMatch, `${key} not found in infra/names.sh`).not.toBeNull();
      expect(scriptMatch![1]).toBe(namesMatch![1]);
    }
  });
});
