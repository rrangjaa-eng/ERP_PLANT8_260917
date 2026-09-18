import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, cpSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";

// scripts/promote-guard.sh — deploy.yml의 production 잡이 부르는 승격 가드.
// "스테이징이 지금 서빙 중인 SHA만 프로덕션에 올린다"(D-05)를 강제한다.
//
// 이 테스트가 존재하는 이유(01-07 실측, DEPLOY-LOG "deploy.yml 프로덕션 가드
// 전제 — 기각됨"): 가드가 원래 리비전의 `spec.containers[0].image` 문자열
// 마지막 `:` 뒤를 git SHA로 간주했는데, Cloud Run은 배포 시점에 `app:<sha>`
// 태그를 **다이제스트로 해석해** `app@sha256:…`로 저장한다. 그래서 가드가 git
// SHA 대신 이미지 다이제스트를 얻어 비교가 항상 어긋났고 프로덕션 승격이
// 영구히 막혔다. 진짜 배포 SHA는 deploy.sh가 리비전에 심는 `APP_GIT_SHA`
// 환경변수에 있다(= /api/health가 돌려주는 sha와 같은 값).

const REPO_ROOT = process.cwd();
const FAKEBIN = join(REPO_ROOT, "test/unit/deploy/fakebin");

// Cloud Run이 실제로 저장하는 형태 — 태그가 아니라 다이제스트다(01-07 실측).
const DIGEST_IMAGE =
  "asia-northeast3-docker.pkg.dev/test-proj/plant8/app@sha256:662211fcd7672009f0e4b1b4cfd0a2f1b3c4d5e6f708192a3b4c5d6e7f809102";
const STAGING_SHA = "5ca35226bc2f75be453e8c02adbe7aeb929bc1d7";

function sh(cmd: string, args: string[], cwd: string): string {
  const result = spawnSync(cmd, args, { cwd, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`${cmd} ${args.join(" ")} failed:\n${result.stderr}`);
  }
  return result.stdout.trim();
}

interface Repo {
  dir: string;
  head: string;
}

function setupRepo(): Repo {
  const repoDir = mkdtempSync(join(tmpdir(), "guard-repo-"));
  mkdirSync(join(repoDir, "scripts"), { recursive: true });
  mkdirSync(join(repoDir, "infra"), { recursive: true });
  cpSync(join(REPO_ROOT, "scripts/promote-guard.sh"), join(repoDir, "scripts/promote-guard.sh"));
  cpSync(join(REPO_ROOT, "infra/names.sh"), join(repoDir, "infra/names.sh"));
  sh("git", ["init", "-q"], repoDir);
  sh("git", ["config", "user.email", "test@example.test"], repoDir);
  sh("git", ["config", "user.name", "test"], repoDir);
  sh("git", ["add", "-A"], repoDir);
  sh("git", ["commit", "-q", "-m", "init"], repoDir);
  return { dir: repoDir, head: sh("git", ["rev-parse", "HEAD"], repoDir) };
}

interface GuardState {
  /** 스테이징 서비스에서 percent==100으로 서빙 중인 리비전 이름. 없으면 트래픽 0건. */
  serving?: string;
  /** 그 리비전의 spec.containers[0].image (기본: 다이제스트 형태). */
  revisionImage?: string;
  /** 그 리비전의 APP_GIT_SHA 환경변수. undefined면 환경변수 자체가 없다. */
  revisionGitSha?: string;
  /** Artifact Registry에 해당 태그 이미지가 있는지. */
  imageExists?: boolean;
}

interface GuardResult {
  status: number | null;
  stdout: string;
  stderr: string;
  log: string;
}

function guard(repo: Repo, shaInput: string, state: GuardState): GuardResult {
  const stateDir = mkdtempSync(join(tmpdir(), "guard-state-"));
  writeFileSync(join(stateDir, "service-exists"), "");
  if (state.serving !== undefined) {
    writeFileSync(join(stateDir, "serving"), state.serving);
  }
  writeFileSync(join(stateDir, "revision-image"), state.revisionImage ?? DIGEST_IMAGE);
  if (state.revisionGitSha !== undefined) {
    writeFileSync(join(stateDir, "revision-git-sha"), state.revisionGitSha);
  }
  if (state.imageExists !== false) {
    writeFileSync(join(stateDir, "image-exists"), "");
  }

  const logDir = mkdtempSync(join(tmpdir(), "guard-log-"));
  const logPath = join(logDir, "log");
  writeFileSync(logPath, "");

  const result = spawnSync(
    "bash",
    [
      "scripts/promote-guard.sh",
      "--project",
      "test-proj",
      "--region",
      "asia-northeast3",
      "--sha",
      shaInput,
    ],
    {
      cwd: repo.dir,
      env: {
        ...process.env,
        PATH: `${FAKEBIN}:${process.env.PATH ?? ""}`,
        DEPLOY_FAKE_STATE: stateDir,
        DEPLOY_FAKE_LOG: logPath,
      },
      encoding: "utf8",
    },
  );

  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
    log: readFileSync(logPath, "utf8"),
  };
}

describe("promote-guard.sh", () => {
  let repo: Repo;
  beforeEach(() => {
    repo = setupRepo();
  });

  it("리비전 이미지가 다이제스트로 저장돼 있어도 APP_GIT_SHA에서 git SHA를 읽는다 (01-07 회귀)", () => {
    const r = guard(repo, "", {
      serving: "plant8-staging-00021-jxr",
      revisionImage: DIGEST_IMAGE,
      revisionGitSha: STAGING_SHA,
    });
    expect(r.stderr).not.toContain("not found");
    expect(r.status).toBe(0);
    expect(r.stdout).toContain(`PROMOTE_SHA=${STAGING_SHA}`);
    expect(r.stdout).toContain(`STAGING_SHA=${STAGING_SHA}`);
    // 다이제스트가 SHA로 새어 나오면 안 된다.
    expect(r.stdout).not.toContain("662211fc");
    expect(r.stdout).not.toContain("sha256");
  });

  it("sha 입력이 비면 스테이징이 서빙 중인 SHA를 그대로 승격 대상으로 쓴다", () => {
    const r = guard(repo, "", { serving: "rev-a", revisionGitSha: STAGING_SHA });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain(`PROMOTE_SHA=${STAGING_SHA}`);
    // 승격 대상 SHA 태그가 Artifact Registry에 있는지 확인한다.
    expect(r.log).toContain(`artifacts docker images describe`);
    expect(r.log).toContain(`plant8/app:${STAGING_SHA}`);
  });

  it("스테이징 서비스를 이름으로 조회한다(plant8-staging)", () => {
    const r = guard(repo, "", { serving: "rev-a", revisionGitSha: STAGING_SHA });
    expect(r.status).toBe(0);
    expect(r.log).toContain("run services describe plant8-staging");
  });

  it("전체 40자 SHA를 명시하면 스테이징과 같을 때 통과한다", () => {
    const r = guard(repo, STAGING_SHA, { serving: "rev-a", revisionGitSha: STAGING_SHA });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain(`PROMOTE_SHA=${STAGING_SHA}`);
  });

  it("짧은 SHA를 명시하면 git으로 40자로 펼쳐 비교한다", () => {
    const short = repo.head.slice(0, 7);
    const r = guard(repo, short, { serving: "rev-a", revisionGitSha: repo.head });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain(`PROMOTE_SHA=${repo.head}`);
  });

  it("스테이징이 다른 SHA를 서빙 중이면 거부한다", () => {
    const other = "0".repeat(40);
    const r = guard(repo, other, { serving: "rev-a", revisionGitSha: STAGING_SHA });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain(`staging is serving ${STAGING_SHA}`);
    expect(r.stdout).not.toContain("PROMOTE_SHA=");
  });

  it("sha 입력이 hex 7~40자가 아니면 거부한다", () => {
    for (const bad of ["zzzzzzz", "abc", "abcdef", "../../etc", "abcdefg1234567890123456789012345678901234567"]) {
      const r = guard(repo, bad, { serving: "rev-a", revisionGitSha: STAGING_SHA });
      expect(r.status, `입력 "${bad}"`).toBe(1);
      expect(r.stderr).toContain("sha must be 7-40 hex chars");
    }
  });

  it("스테이징이 100% 서빙 중인 리비전이 없으면 거부한다", () => {
    const r = guard(repo, "", { revisionGitSha: STAGING_SHA });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("staging is not serving");
    expect(r.stdout).not.toContain("PROMOTE_SHA=");
  });

  it("서빙 리비전에 APP_GIT_SHA가 없으면 다이제스트를 SHA로 쓰지 않고 거부한다", () => {
    const r = guard(repo, "", { serving: "rev-a" });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("APP_GIT_SHA");
    expect(r.stdout).not.toContain("PROMOTE_SHA=");
  });

  it("Artifact Registry에 이미지가 없으면 거부한다", () => {
    const r = guard(repo, "", { serving: "rev-a", revisionGitSha: STAGING_SHA, imageExists: false });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("not found in Artifact Registry");
    expect(r.stdout).not.toContain("PROMOTE_SHA=");
  });

  it("가드는 읽기만 한다 — deploy/update/create 류 gcloud 하위 명령을 부르지 않는다", () => {
    const r = guard(repo, "", { serving: "rev-a", revisionGitSha: STAGING_SHA });
    expect(r.status).toBe(0);
    for (const line of r.log.split("\n").filter(Boolean)) {
      expect(line).toMatch(/^(run services describe|run revisions describe|artifacts docker images describe)/);
    }
  });
});
