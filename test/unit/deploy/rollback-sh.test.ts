import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, cpSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
  state: { revisions?: string[]; serving?: string; serviceExists?: boolean },
): RollbackResult {
  const stateDir = mkdtempSync(join(tmpdir(), "rollback-state-"));
  writeFileSync(join(stateDir, "service-exists"), "");
  if (state.revisions) {
    writeFileSync(join(stateDir, "revisions"), state.revisions.join("\n") + "\n");
  }
  if (state.serving !== undefined) {
    writeFileSync(join(stateDir, "serving"), state.serving);
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
