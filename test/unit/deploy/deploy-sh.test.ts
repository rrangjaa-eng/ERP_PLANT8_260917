import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, cpSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

// scripts/deploy.sh를 가짜 gcloud/docker/curl(fakebin/) 위에서 실행해 순서·분기·
// 거부 조건을 단언한다. 실제 GCP 호출은 전혀 없다 — 01-RESEARCH.md §Pattern 7·8·10.

const REPO_ROOT = process.cwd();
const FAKEBIN = join(REPO_ROOT, "test/unit/deploy/fakebin");

function sh(cmd: string, args: string[], cwd: string): void {
  const result = spawnSync(cmd, args, { cwd, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`${cmd} ${args.join(" ")} failed:\n${result.stderr}`);
  }
}

function setupRepo(): string {
  const repoDir = mkdtempSync(join(tmpdir(), "deploy-repo-"));
  mkdirSync(join(repoDir, "scripts"), { recursive: true });
  mkdirSync(join(repoDir, "infra/monitoring"), { recursive: true });
  cpSync(join(REPO_ROOT, "scripts/deploy.sh"), join(repoDir, "scripts/deploy.sh"));
  cpSync(join(REPO_ROOT, "scripts/rollback.sh"), join(repoDir, "scripts/rollback.sh"));
  cpSync(join(REPO_ROOT, "infra/names.sh"), join(repoDir, "infra/names.sh"));
  cpSync(join(REPO_ROOT, "infra/ar-cleanup-policy.json"), join(repoDir, "infra/ar-cleanup-policy.json"));
  cpSync(join(REPO_ROOT, "infra/monitoring"), join(repoDir, "infra/monitoring"), { recursive: true });
  sh("git", ["init", "-q"], repoDir);
  sh("git", ["config", "user.email", "test@example.test"], repoDir);
  sh("git", ["config", "user.name", "test"], repoDir);
  sh("git", ["add", "-A"], repoDir);
  sh("git", ["commit", "-q", "-m", "init"], repoDir);
  return repoDir;
}

interface DeployResult {
  status: number | null;
  stdout: string;
  stderr: string;
  log: string;
  stateDir: string;
}

function deploy(
  repoDir: string,
  args: string[],
  opts: { env?: Record<string, string>; alertEmail?: string | null; state?: Record<string, string | true> } = {},
): DeployResult {
  const stateDir = mkdtempSync(join(tmpdir(), "deploy-state-"));
  for (const [name, value] of Object.entries(opts.state ?? {})) {
    writeFileSync(join(stateDir, name), value === true ? "" : value);
  }
  const logDir = mkdtempSync(join(tmpdir(), "deploy-log-"));
  const logPath = join(logDir, "log");
  writeFileSync(logPath, "");

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PATH: `${FAKEBIN}:${process.env.PATH ?? ""}`,
    DEPLOY_FAKE_STATE: stateDir,
    DEPLOY_FAKE_LOG: logPath,
  };
  if (opts.alertEmail !== null) {
    env.ALERT_EMAIL = opts.alertEmail ?? "ops@example.test";
  } else {
    delete env.ALERT_EMAIL;
  }
  Object.assign(env, opts.env ?? {});

  const result = spawnSync("bash", ["scripts/deploy.sh", ...args], {
    cwd: repoDir,
    env,
    encoding: "utf8",
  });

  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
    log: readFileSync(logPath, "utf8"),
    stateDir,
  };
}

function lineIndex(log: string, needle: string): number {
  const lines = log.split("\n");
  return lines.findIndex((line) => line.includes(needle));
}

function jobLine(log: string, jobSuffix: string): string {
  const line = log.split("\n").find((l) => l.startsWith(`run jobs deploy plant8-staging-${jobSuffix} `));
  if (!line) throw new Error(`no run jobs deploy line for ${jobSuffix}`);
  return line;
}

describe("deploy.sh — 새 프로젝트(시나리오 1)", () => {
  let repoDir: string;
  beforeEach(() => {
    repoDir = setupRepo();
  });

  it("exit 0이고 인프라 ensure → 이미지 → Job → 스모크 → 경보 순서로 gcloud가 호출된다", () => {
    const r = deploy(repoDir, ["--env", "staging", "--project", "test-proj"]);
    // smoke()가 재시도 전에 /·/login·/api/health를 한 번(재시도 없이)
    // 찍어두는 진단 줄만 stderr에 남는다.
    expect(r.stderr).toContain("quick probe (no retry):");
    expect(r.stderr).not.toContain("SmokeFailed");
    expect(r.stderr).not.toContain("deploy failed at");
    expect(r.status).toBe(0);

    const order = [
      "services enable",
      "artifacts repositories create",
      "artifacts repositories set-cleanup-policies",
      "sql instances create",
      "sql databases create",
      "sql users create",
      "secrets create",
      "build --build-arg",
      "push asia-northeast3-docker.pkg.dev",
      "run jobs deploy plant8-staging-db-bootstrap",
      "run jobs execute plant8-staging-db-bootstrap",
      "run jobs execute plant8-staging-migrate",
      "run deploy plant8-staging ",
      "run services update-traffic plant8-staging ",
      "alpha monitoring policies create",
      "/api/health",
      "sign-in/email",
    ].map((needle) => lineIndex(r.log, needle));

    for (const idx of order) expect(idx).toBeGreaterThan(-1);
    expect(order).toEqual([...order].sort((a, b) => a - b));

    const deployLine = r.log.split("\n").find((l) => l.startsWith("run deploy plant8-staging "));
    expect(deployLine).toBeDefined();
    expect(deployLine).not.toContain("--no-traffic");
    expect(deployLine).toContain("--min-instances=0");
    expect(deployLine).toContain("--max-instances=3");
    expect(deployLine).toContain("--set-secrets=BETTER_AUTH_SECRET=better-auth-secret-staging:latest");

    const trafficLine = r.log.split("\n").find((l) => l.startsWith("run services update-traffic plant8-staging "));
    expect(trafficLine).toBeDefined();
    expect(trafficLine).toContain("--to-latest");

    const channelsLine = r.log.split("\n").find((l) => l.startsWith("beta monitoring channels list"));
    expect(channelsLine).toContain('--filter=displayName="');
    expect(channelsLine).not.toContain("displayName='");

    const policiesListLine = r.log.split("\n").find((l) => l.startsWith("alpha monitoring policies list"));
    expect(policiesListLine).toContain('--filter=displayName="');
    expect(policiesListLine).not.toContain("displayName='");

    const sqlCreateLine = r.log.split("\n").find((l) => l.startsWith("beta sql instances create"));
    expect(sqlCreateLine).toContain("--tier=db-f1-micro");
    expect(sqlCreateLine).toContain("--no-assign-ip");
    expect(sqlCreateLine).toContain("--database-flags=cloudsql.iam_authentication=on");
    expect(sqlCreateLine).toContain("--backup");
    expect(sqlCreateLine).toContain("--storage-auto-increase");
    expect(sqlCreateLine).toContain("--storage-auto-increase-limit=20");
    expect(sqlCreateLine).not.toContain("--min-instances");
    expect(sqlCreateLine).not.toContain("--max-instances");
    expect(deployLine).not.toContain("--no-assign-ip");
    expect(deployLine).not.toContain("--tier=");

    const cleanupLine = r.log.split("\n").find((l) => l.startsWith("artifacts repositories set-cleanup-policies"));
    expect(cleanupLine).toContain("--policy=");
    expect(cleanupLine).toContain("infra/ar-cleanup-policy.json");

    const signinLine = r.log.split("\n").find((l) => l.includes("sign-in/email"));
    expect(signinLine).toContain("-X POST");
    expect(signinLine).toMatch(/Origin: https:\/\/plant8-staging-/);

    expect(r.stdout.trim().split("\n").at(-1)).toMatch(/^SERVICE_URL=https:\/\/plant8-staging-/);
  });

  it("새 서비스의 실제 status.url이 계산한 정본 URL과 다르면 실측값으로 바로잡고 BETTER_AUTH_URL도 갱신한다(2026-09-18: run #14 진단으로 확인 — status.url이 진짜 서비스 주소)", () => {
    const r = deploy(repoDir, ["--env", "staging", "--project", "test-proj"], {
      state: { "describe-url": "https://plant8-staging-67rumhdgba-du.a.run.app" },
    });
    expect(r.status).toBe(0);
    // 최초 배포는 서비스가 없어 주소를 미리 알 수 없다 — 배포 후 교정 경로가 남는다.
    expect(r.stderr).toContain("differs from actual status.url");

    const updateLine = r.log.split("\n").find((l) => l.startsWith("run services update plant8-staging "));
    expect(updateLine).toBeDefined();
    expect(updateLine).toContain("--update-env-vars=BETTER_AUTH_URL=https://plant8-staging-67rumhdgba-du.a.run.app");

    expect(r.stdout.trim().split("\n").at(-1)).toBe("SERVICE_URL=https://plant8-staging-67rumhdgba-du.a.run.app");

    const healthLine = r.log.split("\n").find((l) => l.includes("/api/health"));
    expect(healthLine).toContain("https://plant8-staging-67rumhdgba-du.a.run.app/api/health");
  });
});

describe("deploy.sh — 기존 서비스·이미지(시나리오 2)", () => {
  let repoDir: string;
  beforeEach(() => {
    repoDir = setupRepo();
  });

  it("docker build를 건너뛰고 바로 100% 트래픽으로 재배포한 뒤 경보를 upsert하고 실제 주소로 스모크한다", () => {
    const r = deploy(repoDir, ["--env", "staging", "--project", "test-proj", "--sha", "0123456789abcdef0123456789abcdef01234567"], {
      state: {
        "service-exists": true,
        "image-exists": true,
        "policy-exists": true,
        "describe-url": "https://plant8-staging-abc123-du.a.run.app",
        serving: "plant8-staging-00001-abc",
      },
    });
    expect(r.status).toBe(0);
    expect(r.log).not.toMatch(/^(docker )?build /m);

    // 카나리(--no-traffic/--tag) 단계 없이 신규 배포와 동일하게 바로 100%
    // 트래픽으로 배포한다(2026-09-18 — 태그 전용 URL 라우팅 지연 문제로
    // 카나리 단계 자체를 없앰). 다만 과거 --no-traffic 배포가 트래픽을
    // 특정 리비전에 고정해 놨을 수 있어(실제 재현) update-traffic
    // --to-latest는 그대로 매번 호출한다.
    const deployLine = r.log.split("\n").find((l) => l.startsWith("run deploy plant8-staging "));
    expect(deployLine).not.toContain("--no-traffic");
    expect(deployLine).not.toContain("--tag=");

    const trafficLine = r.log.split("\n").find((l) => l.startsWith("run services update-traffic plant8-staging "));
    expect(trafficLine).toBeDefined();
    expect(trafficLine).toContain("--to-latest");

    // 기존 서비스는 배포 **전에** status.url을 읽어 그 값으로 배포한다(2026-09-19
    // SC6 재정의). 그래서 위 배포 호출 자체가 실측 주소를 들고 있고, 배포 후
    // 교정용 `services update`는 더 이상 없다 — 리비전이 하나만 생긴다.
    expect(deployLine).toContain("BETTER_AUTH_URL=https://plant8-staging-abc123-du.a.run.app");
    expect(r.log).not.toContain("run services update plant8-staging");

    const healthLine = r.log.split("\n").find((l) => l.includes("/api/health"));
    expect(healthLine).toContain("https://plant8-staging-abc123-du.a.run.app/api/health");

    const order = [
      "run deploy plant8-staging ",
      "run services update-traffic plant8-staging ",
      "alpha monitoring policies update",
      "/api/health",
      "sign-in/email",
    ].map((n) => lineIndex(r.log, n));
    for (const idx of order) expect(idx).toBeGreaterThan(-1);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(r.log).not.toContain("alpha monitoring policies create");

    const channelsLine = r.log.split("\n").find((l) => l.startsWith("beta monitoring channels list"));
    expect(channelsLine).toContain('--filter=displayName="');

    const policiesUpdateArgLine = r.log.split("\n").find((l) => l.startsWith("alpha monitoring policies list"));
    expect(policiesUpdateArgLine).toContain('--filter=displayName="');

    expect(r.stderr).toContain("using actual status.url");
    expect(r.stdout.trim().split("\n").at(-1)).toBe("SERVICE_URL=https://plant8-staging-abc123-du.a.run.app");
  });
});

describe("deploy.sh — 거부·실패 경로", () => {
  let repoDir: string;
  beforeEach(() => {
    repoDir = setupRepo();
  });
  afterEach(() => {
    // no-op — 각 테스트가 자기 repoDir을 새로 만든다.
  });

  it("더티 트리에서는 gcloud 호출 전에 exit 2로 거부한다", () => {
    writeFileSync(join(repoDir, "untracked.txt"), "dirty");
    const r = deploy(repoDir, ["--env", "staging", "--project", "test-proj"]);
    expect(r.status).toBe(2);
    expect(r.log).toBe("");
    expect(r.stderr).toContain("dirty");
  });

  it("migrate Job이 exit 3(PoolRuleViolation 로그)로 실패하면 PoolRuleViolation으로 중단한다", () => {
    const r = deploy(repoDir, ["--env", "staging", "--project", "test-proj"], {
      state: { "fail-migrate": "3" },
    });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("PoolRuleViolation");
    expect(r.log).not.toMatch(/^run deploy /m);
  });

  it("migrate Job이 일반 실패(로그에 pool_rule 없음)면 migration failed로 중단한다", () => {
    const r = deploy(repoDir, ["--env", "staging", "--project", "test-proj"], {
      state: { "fail-migrate": "1" },
    });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("migration failed");
  });

  it("기존 서비스에서 health가 503이면 SmokeFailed로 exit 1하고 롤백을 한 번 시도한다", () => {
    const r = deploy(repoDir, ["--env", "staging", "--project", "test-proj"], {
      state: { "service-exists": true, "image-exists": true, health: "503" },
    });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("SmokeFailed");
    // SC6 재정의: 나쁜 리비전을 100%에 남겨두지 않는다. 이 시나리오에는 되돌릴
    // 리비전 상태를 주지 않았으므로 롤백은 실패하지만, 시도 자체와 그 실패가
    // 조용히 넘어가지 않고 stderr에 남는 것이 계약이다.
    expect(r.stderr).toContain("rolling back to the previous deployment");
    expect(r.stderr).toContain("rollback FAILED");
  });

  it("sign-in이 403이면 origin 불일치로 SmokeFailed하고 BETTER_AUTH_URL을 stderr에 남긴다", () => {
    const r = deploy(repoDir, ["--env", "staging", "--project", "test-proj"], {
      state: { "service-exists": true, "image-exists": true, signin: "403" },
    });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("SmokeFailed: origin check");
    expect(r.stderr).toContain("BETTER_AUTH_URL");
  });

  it("임의 gcloud 하위 명령이 실패하면 exit 1과 'deploy failed at <함수명>'을 stderr 마지막 줄에 남긴다", () => {
    const r = deploy(repoDir, ["--env", "staging", "--project", "test-proj"], {
      state: { "fail-gcloud": "beta sql instances create" },
    });
    expect(r.status).toBe(1);
    const lastLine = r.stderr.trim().split("\n").at(-1);
    expect(lastLine).toBe("deploy failed at ensure_sql_instance");
  });

  it("--dry-run은 실제 명령을 실행하지 않고 '+ …'만 출력한다", () => {
    const r = deploy(repoDir, ["--env", "staging", "--project", "test-proj", "--dry-run"]);
    expect(r.status).toBe(0);
    expect(r.log).toBe("");
    expect(r.stdout).toMatch(/^\+ gcloud run deploy/m);
  });

  it("--env가 staging|prod가 아니면 exit 2", () => {
    const r = deploy(repoDir, ["--env", "qa", "--project", "test-proj"]);
    expect(r.status).toBe(2);
  });

  it("--project가 없으면 exit 2", () => {
    const r = deploy(repoDir, ["--env", "staging"]);
    expect(r.status).toBe(2);
  });

  it("ALERT_EMAIL이 없으면 exit 2", () => {
    const r = deploy(repoDir, ["--env", "staging", "--project", "test-proj"], { alertEmail: null });
    expect(r.status).toBe(2);
  });
});

describe("deploy.sh — 다른 프로젝트/리전으로도 같은 시퀀스", () => {
  let repoDir: string;
  beforeEach(() => {
    repoDir = setupRepo();
  });

  it("--project other-proj --region us-central1이 전 gcloud 자원 호출과 이미지 경로에 반영된다", () => {
    const r = deploy(repoDir, ["--env", "staging", "--project", "other-proj", "--region", "us-central1"]);
    expect(r.status).toBe(0);
    const resourceLines = r.log
      .split("\n")
      .filter((l) => /^(services|artifacts|sql|secrets|run) /.test(l) && l !== "");
    for (const line of resourceLines) {
      expect(line).toContain("--project=other-proj");
    }
    expect(r.log).toMatch(/us-central1-docker\.pkg\.dev\/other-proj\/plant8\/app:[0-9a-f]+/);
  });
});

describe("deploy.sh — Job 환경 계약(시나리오 9)", () => {
  let repoDir: string;
  beforeEach(() => {
    repoDir = setupRepo();
  });

  it("Job 3개 모두 APP_ENV·BETTER_AUTH_URL·BETTER_AUTH_SECRET을 갖고, DB_ADMIN_PASSWORD는 db-bootstrap에만 있다", () => {
    const r = deploy(repoDir, ["--env", "staging", "--project", "test-proj"]);
    expect(r.status).toBe(0);

    const deployLines = r.log.split("\n").filter((l) => l.startsWith("run jobs deploy plant8-staging-"));
    expect(deployLines).toHaveLength(3);
    for (const line of deployLines) {
      expect(line).toContain("APP_ENV=staging");
      expect(line).toContain("BETTER_AUTH_URL=https://plant8-staging-");
      expect(line).toContain("BETTER_AUTH_SECRET=better-auth-secret-staging:latest");
    }

    const dbBootstrap = jobLine(r.log, "db-bootstrap");
    const migrate = jobLine(r.log, "migrate");
    const account = jobLine(r.log, "account");

    expect(dbBootstrap).toContain("DB_ADMIN_PASSWORD=db-admin-password-staging:latest");
    expect(migrate).not.toContain("DB_ADMIN_PASSWORD");
    expect(account).not.toContain("DB_ADMIN_PASSWORD");

    expect(migrate).toContain("MAX_INSTANCES=3");
    expect(migrate).toContain("DB_POOL_MAX=5");
    expect(dbBootstrap).not.toContain("MAX_INSTANCES=");
    expect(account).not.toContain("MAX_INSTANCES=");

    expect(account).toContain("--command=node,dist/cli/account-cli.mjs");
    expect(account).not.toContain("--args=");
    expect(dbBootstrap).toContain("--command=node ");
    expect(dbBootstrap).toContain("--args=dist/cli/db-bootstrap.mjs");
    expect(migrate).toContain("--command=node ");
    expect(migrate).toContain("--args=dist/cli/migrate-runner.mjs");
  });
});

describe("deploy.sh — --domain 자리만(시나리오 10)", () => {
  let repoDir: string;
  beforeEach(() => {
    repoDir = setupRepo();
  });

  it("도메인 매핑 명령을 호출하지 않고 stderr에 deferred·Phase 2 안내만 남긴다", () => {
    const r = deploy(repoDir, ["--env", "staging", "--project", "test-proj", "--domain", "erp.example.test"]);
    expect(r.status).toBe(0);
    expect(r.log).not.toContain("domain-mappings");
    expect(r.stderr).toContain("deferred");
    expect(r.stderr).toContain("Phase 2");
  });
});

describe("deploy.sh — 프로덕션은 빌드하지 않는다(시나리오 11)", () => {
  let repoDir: string;
  beforeEach(() => {
    repoDir = setupRepo();
  });

  const PROD_SHA = "0123456789abcdef0123456789abcdef01234567";

  it("이미지가 없으면 ProdImageMissing으로 즉시 중단하고 어떤 ensure 단계도 실행하지 않는다", () => {
    const r = deploy(repoDir, ["--env", "prod", "--project", "test-proj", "--sha", PROD_SHA]);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("ProdImageMissing");
    expect(r.log).not.toMatch(/build --build-arg/);
    expect(r.log).not.toMatch(/^beta sql instances create/m);
    expect(r.log).not.toMatch(/^run jobs execute/m);
    expect(r.log).not.toMatch(/^run deploy /m);
  });

  it("이미지가 있으면 docker build 없이 run deploy plant8-prod까지 진행한다", () => {
    const r = deploy(repoDir, ["--env", "prod", "--project", "test-proj", "--sha", PROD_SHA], {
      state: { "image-exists": true },
    });
    expect(r.status).toBe(0);
    expect(r.log).not.toMatch(/build --build-arg/);
    expect(r.log).toMatch(/^run deploy plant8-prod /m);
  });
});

// SC6 재정의(2026-09-19 사용자 결정): 카나리(0%→스모크→100%)는 태그 전용 URL이
// 이 프로젝트에서 라우팅되지 않아 01-07에서 제거됐다. 계약을 절차가 아니라 결과로
// 바꾼다 — "스모크에 실패한 리비전이 트래픽을 계속 받는 상태로 끝나지 않는다".
describe("deploy.sh — 배포당 리비전 하나(선행 URL 확정)", () => {
  let repoDir: string;
  beforeEach(() => {
    repoDir = setupRepo();
  });

  it("기존 서비스면 배포 전에 status.url을 읽어 BETTER_AUTH_URL에 넣고, 교정용 재배포를 하지 않는다", () => {
    const r = deploy(repoDir, ["--env", "staging", "--project", "test-proj"], {
      state: {
        "service-exists": true,
        "image-exists": true,
        "describe-url": "https://plant8-staging-hash-du.a.run.app",
      },
    });
    expect(r.status).toBe(0);

    // 배포 호출 자체가 실측 URL을 BETTER_AUTH_URL로 들고 있어야 한다.
    const deployLine = r.log.split("\n").find((l) => l.startsWith("run deploy plant8-staging "));
    expect(deployLine).toBeDefined();
    expect(deployLine).toContain("BETTER_AUTH_URL=https://plant8-staging-hash-du.a.run.app");

    // 교정용 `services update --update-env-vars BETTER_AUTH_URL=...`가 없어야 한다.
    expect(r.log).not.toContain("run services update plant8-staging");
  });

  it("최초 배포(서비스 없음)는 주소를 미리 알 수 없어 교정용 재배포가 남는다", () => {
    const r = deploy(repoDir, ["--env", "staging", "--project", "test-proj"], {
      state: { "describe-url": "https://plant8-staging-hash-du.a.run.app" },
    });
    expect(r.status).toBe(0);
    expect(r.log).toContain("run services update plant8-staging");
  });
});

describe("deploy.sh — 스모크 실패 시 자동 롤백", () => {
  let repoDir: string;
  beforeEach(() => {
    repoDir = setupRepo();
  });

  it("기존 서비스에서 스모크가 실패하면 이전 배포로 한 번 되돌리고 실패로 끝낸다", () => {
    const r = deploy(repoDir, ["--env", "staging", "--project", "test-proj"], {
      state: {
        "service-exists": true,
        "image-exists": true,
        health: "503",
        revisions: "v2\nv1\n",
        serving: "v2",
        "revision-git-sha-v2": "shaB",
        "revision-git-sha-v1": "shaA",
      },
    });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("SmokeFailed");
    // 롤백이 실제로 트래픽을 되돌렸다.
    expect(r.log).toContain("--to-revisions=v1=100");
    // 한 번만 시도한다(재시도 루프 금지).
    expect(r.log.split("\n").filter((l) => l.includes("--to-revisions=")).length).toBe(1);
    expect(r.stderr).toContain("rolled back");
  });

  it("최초 배포는 되돌릴 이전 배포가 없으므로 롤백을 시도하지 않고 실패로 끝낸다", () => {
    const r = deploy(repoDir, ["--env", "staging", "--project", "test-proj"], {
      state: { health: "503" },
    });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("SmokeFailed");
    expect(r.log).not.toContain("--to-revisions=");
    expect(r.stderr).toContain("first deploy");
  });
});
