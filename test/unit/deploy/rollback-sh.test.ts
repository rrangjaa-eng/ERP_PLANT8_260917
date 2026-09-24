import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, cpSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";

// scripts/rollback.sh — 현재 100% 서빙 중인 리비전보다 오래된 최신 리비전으로
// 트래픽을 되돌린다(플랜 리뷰 Eng Issue 3: "직전에 만든 것"이 아니라 "지금 서빙
// 중인 것보다 오래된 최신").

const REPO_ROOT = process.cwd();
const FAKEBIN = join(REPO_ROOT, "test/unit/deploy/fakebin");

function sh(cmd: string, args: string[], cwd: string): void {
  const result = spawnSync(cmd, args, { cwd, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`${cmd} ${args.join(" ")} failed:\n${result.stderr}`);
  }
}

function setupRepo(): string {
  const repoDir = mkdtempSync(join(tmpdir(), "rollback-repo-"));
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

interface RollbackResult {
  status: number | null;
  stdout: string;
  stderr: string;
  log: string;
}

function rollback(
  repoDir: string,
  state: {
    revisions?: string[];
    serving?: string;
    serviceExists?: boolean;
    // 리비전 이름 -> APP_GIT_SHA. 한 번의 배포가 리비전을 둘 만드는 실제 동작
    // (deploy.sh가 status.url을 확인하고 BETTER_AUTH_URL을 고쳐 재배포)을 모델링한다.
    revisionShas?: Record<string, string>;
  },
): RollbackResult {
  const stateDir = mkdtempSync(join(tmpdir(), "rollback-state-"));
  writeFileSync(join(stateDir, "service-exists"), "");
  if (state.revisions) {
    writeFileSync(join(stateDir, "revisions"), state.revisions.join("\n") + "\n");
  }
  if (state.serving !== undefined) {
    writeFileSync(join(stateDir, "serving"), state.serving);
  }
  for (const [rev, sha] of Object.entries(state.revisionShas ?? {})) {
    writeFileSync(join(stateDir, `revision-git-sha-${rev}`), sha);
  }
  const logDir = mkdtempSync(join(tmpdir(), "rollback-log-"));
  const logPath = join(logDir, "log");
  writeFileSync(logPath, "");

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PATH: `${FAKEBIN}:${process.env.PATH ?? ""}`,
    DEPLOY_FAKE_STATE: stateDir,
    DEPLOY_FAKE_LOG: logPath,
  };

  const result = spawnSync(
    "bash",
    ["scripts/rollback.sh", "--env", "staging", "--project", "test-proj", "--region", "asia-northeast3"],
    { cwd: repoDir, env, encoding: "utf8" },
  );

  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
    log: readFileSync(logPath, "utf8"),
  };
}

describe("rollback.sh", () => {
  let repoDir: string;
  beforeEach(() => {
    repoDir = setupRepo();
  });

  it("리비전 [v2, v1] 서빙 v2 -> v1로 되돌린다", () => {
    const r = rollback(repoDir, { revisions: ["v2", "v1"], serving: "v2" });
    expect(r.status).toBe(0);
    expect(r.log).toContain("--to-revisions=v1=100");
  });

  // 한 번의 배포가 리비전을 둘 만든다(01-07·01-08 실측: staging 00024→00025,
  // prod 00001→00002). 첫 리비전은 계산 URL을 BETTER_AUTH_URL로 들고 있어
  // 로그인 POST가 better-auth Origin 검사에 걸린다. "직전 리비전"으로 되돌리면
  // 사고 중에 로그인이 막힌 리비전에 착륙한다 — 배포 단위(APP_GIT_SHA)로 건너뛴다.
  it("같은 배포가 만든 중간 리비전을 건너뛰고 이전 배포로 되돌린다", () => {
    const r = rollback(repoDir, {
      revisions: ["v4", "v3", "v2", "v1"],
      serving: "v4",
      revisionShas: { v4: "shaB", v3: "shaB", v2: "shaA", v1: "shaA" },
    });
    expect(r.status).toBe(0);
    expect(r.log).toContain("--to-revisions=v2=100");
    expect(r.log).not.toContain("--to-revisions=v3=100");
  });

  it("이전 배포가 없으면(전부 같은 SHA) 거부한다", () => {
    const r = rollback(repoDir, {
      revisions: ["v2", "v1"],
      serving: "v2",
      revisionShas: { v2: "shaB", v1: "shaB" },
    });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("no previous deployment");
  });

  it("리비전 [v3, v2, v1] 서빙 v2(v3는 스모크 실패로 0% 잔존) -> v1로 되돌린다(v3 아님)", () => {
    const r = rollback(repoDir, { revisions: ["v3", "v2", "v1"], serving: "v2" });
    expect(r.status).toBe(0);
    expect(r.log).toContain("--to-revisions=v1=100");
    expect(r.log).not.toContain("--to-revisions=v3=100");
  });

  it("리비전 [v2, v1] 서빙 v1(가장 오래됨) -> no previous revision", () => {
    const r = rollback(repoDir, { revisions: ["v2", "v1"], serving: "v1" });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("no previous revision");
  });

  it("리비전 1개 -> no previous revision", () => {
    const r = rollback(repoDir, { revisions: ["v1"], serving: "v1" });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("no previous revision");
  });

  it("서빙 리비전을 못 찾으면(100% 항목 없음) no serving revision", () => {
    const r = rollback(repoDir, { revisions: ["v1"] });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("no serving revision");
  });

  it("서빙 리비전 조회는 status.traffic(JSON) 기준이다", () => {
    const rollbackSh = readFileSync(join(repoDir, "scripts/rollback.sh"), "utf8");
    expect(rollbackSh).toContain("status.traffic");
  });
});

// db/migrations/*.sql 첫 줄에 `-- rollback-floor: <이유>`가 있는 가장 최신 파일을
// 더한 커밋을 스키마 하한으로 삼는다(엔지 r2 E2-04). 후보(PREV)의 APP_GIT_SHA가 그
// 커밋을 조상으로 갖지 않으면(또는 SHA가 없거나 이력에 없으면) update-traffic 전에
// 거부한다.
function headSha(repoDir: string): string {
  const result = spawnSync("git", ["rev-parse", "HEAD"], { cwd: repoDir, encoding: "utf8" });
  return result.stdout.trim();
}

function commitFile(repoDir: string, path: string, content: string): string {
  const fullPath = join(repoDir, path);
  mkdirSync(dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, content);
  sh("git", ["add", "-A"], repoDir);
  sh("git", ["commit", "-q", "-m", `add ${path}`], repoDir);
  return headSha(repoDir);
}

describe("스키마 하한(E2-04)", () => {
  let repoDir: string;
  beforeEach(() => {
    repoDir = setupRepo();
  });

  it("하한 아래(0012 이전) 후보로는 트래픽을 옮기지 않는다", () => {
    const beforeFloor = headSha(repoDir); // C1 — init, 하한 이전
    const floorSha = commitFile(repoDir, "db/migrations/0012_x.sql", "-- rollback-floor: 상태 재매핑\n"); // C2
    const serving = commitFile(repoDir, "src/noop.txt", "noop"); // C3

    const r = rollback(repoDir, {
      revisions: ["v2", "v1"],
      serving: "v2",
      revisionShas: { v2: serving, v1: beforeFloor },
    });

    expect(r.status).toBe(1);
    expect(r.stderr).toContain("0012_x.sql");
    expect(r.stderr).toContain(floorSha);
    expect(r.stderr).toContain("v1");
    expect(r.stderr).toContain("DECISIONS.md");
    expect(r.log).not.toContain("update-traffic");
  });

  it("하한 커밋을 포함하는(그 자체이거나 뒤인) 후보는 허용한다", () => {
    const beforeFloor = headSha(repoDir);
    void beforeFloor;
    const floorSha = commitFile(repoDir, "db/migrations/0012_x.sql", "-- rollback-floor: 상태 재매핑\n"); // C2
    const serving = commitFile(repoDir, "src/noop.txt", "noop"); // C3

    const r = rollback(repoDir, {
      revisions: ["v2", "v1"],
      serving: "v2",
      revisionShas: { v2: serving, v1: floorSha },
    });

    expect(r.status).toBe(0);
    expect(r.log).toContain("--to-revisions=v1=100");
  });

  it("후보에 APP_GIT_SHA가 없으면 거부한다", () => {
    commitFile(repoDir, "db/migrations/0012_x.sql", "-- rollback-floor: 상태 재매핑\n"); // C2
    const serving = commitFile(repoDir, "src/noop.txt", "noop"); // C3

    const r = rollback(repoDir, {
      revisions: ["v2", "v1"],
      serving: "v2",
      revisionShas: { v2: serving }, // v1은 SHA 없음
    });

    expect(r.status).toBe(1);
    expect(r.stderr).toContain("APP_GIT_SHA");
    expect(r.stderr).toContain("0012_x.sql");
    expect(r.log).not.toContain("update-traffic");
  });

  it("후보 SHA가 로컬 git 이력에 없으면 거부한다(최신 main 체크아웃에서 다시)", () => {
    commitFile(repoDir, "db/migrations/0012_x.sql", "-- rollback-floor: 상태 재매핑\n"); // C2
    const serving = commitFile(repoDir, "src/noop.txt", "noop"); // C3
    const unknownSha = "1234567890abcdef1234567890abcdef12345678";

    const r = rollback(repoDir, {
      revisions: ["v2", "v1"],
      serving: "v2",
      revisionShas: { v2: serving, v1: unknownSha },
    });

    expect(r.status).toBe(1);
    expect(r.stderr).toContain("git fetch");
    expect(r.log).not.toContain("update-traffic");
  });

  it("표시 둘(0012·0015) — 가장 최신 표시가 하한이다", () => {
    commitFile(repoDir, "db/migrations/0012_x.sql", "-- rollback-floor: 상태 재매핑\n"); // C2
    const midSha = commitFile(repoDir, "src/noop1.txt", "noop"); // C3
    const floor0015Sha = commitFile(repoDir, "db/migrations/0015_y.sql", "-- rollback-floor: 계약 컬럼 삭제\n"); // C4
    const serving = commitFile(repoDir, "src/noop2.txt", "noop"); // C5

    const rejected = rollback(repoDir, {
      revisions: ["v3", "v2", "v1"],
      serving: "v3",
      revisionShas: { v3: serving, v2: midSha },
    });
    expect(rejected.status).toBe(1);
    expect(rejected.stderr).toContain("0015_y.sql");
    expect(rejected.log).not.toContain("update-traffic");

    const allowed = rollback(repoDir, {
      revisions: ["v3", "v2", "v1"],
      serving: "v3",
      revisionShas: { v3: serving, v2: floor0015Sha },
    });
    expect(allowed.status).toBe(0);
    expect(allowed.log).toContain("--to-revisions=v2=100");
  });
});
