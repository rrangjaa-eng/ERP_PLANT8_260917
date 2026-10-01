import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import {
  VIEWPORTS,
  assertRealPaths,
  buildPrompt,
  codexArgs,
  codexEnv,
  crossCheck,
  envFileSecrets,
  measurementsToMarkdown,
  parseArgs,
  parseCodexFindings,
  redactSecrets,
  renderReport,
  selectSystemSections,
  skipLine,
  type ScreenMeasure,
} from "./lib";

// scripts/codex-design-review.sh가 자격 확인 뒤 부른다. 캡처(Playwright, CI=true 빌드) →
// 프롬프트 → codex exec → 실측 대조 → 보고서. Codex stderr는 파일로만 남기고 출력하지 않는다.
const args = parseArgs(process.argv.slice(2));
assertRealPaths(args);
const stamp = `${new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15)}-${process.pid}`;
const artifactsDir = join("test-results/codex-design-review", stamp);
const absDir = resolve(artifactsDir);
mkdirSync(dirname(absDir), { recursive: true });
mkdirSync(absDir); // 이미 있으면 실패 — 이전 실행의 측정 파일이 섞이지 않게

// 자격 원본은 빌드·서버·브라우저·codex 어디에도 넘기지 않는다.
const { CODEX_AUTH_JSON_B64: authB64, ...baseEnv } = process.env;
const capture = spawnSync("pnpm", ["exec", "playwright", "test", "-c", "playwright.codex-design.config.ts"], {
  env: { ...baseEnv, CI: "true", CODEX_REVIEW_ROUTES: JSON.stringify(args.routes), CODEX_REVIEW_DIR: absDir },
  encoding: "utf8",
  maxBuffer: 50 * 1024 * 1024,
  timeout: 1_200_000,
});
const captureLog = `${capture.stdout ?? ""}${capture.stderr ?? ""}`;
writeFileSync(join(absDir, "capture.log"), captureLog);
if (capture.status !== 0) {
  console.error(captureLog.split("\n").slice(-30).join("\n"));
  console.error(`캡처 실패(exit ${capture.status ?? capture.error?.message ?? "timeout"}) — ${artifactsDir}/capture.log`);
  process.exit(1);
}

const screens: ScreenMeasure[] = readdirSync(absDir)
  .filter((f) => /^measurements-.+\.json$/.test(f))
  .flatMap((f) => JSON.parse(readFileSync(join(absDir, f), "utf8")) as ScreenMeasure[]);
writeFileSync(join(absDir, "measurements.json"), JSON.stringify(screens, null, 2));

const mode = args.plans.length > 0 ? "plan" : "diff";
let changeText: string;
if (mode === "plan") {
  changeText = args.plans.map((p) => `### ${p}\n${readFileSync(p, "utf8")}`).join("\n\n");
} else {
  if (spawnSync("git", ["rev-parse", "--verify", "--quiet", args.base]).status !== 0) {
    console.error(`기준 ref가 없다: ${args.base} (git fetch origin main 또는 --base)`);
    process.exit(1);
  }
  const diff = spawnSync("git", ["diff", `${args.base}...HEAD`, "--", "app", "ui", "docs/design"], {
    encoding: "utf8",
    maxBuffer: 50 * 1024 * 1024,
  });
  if (diff.status !== 0 || diff.error) {
    console.error(`git diff 실패: ${diff.error?.message ?? diff.stderr}`);
    process.exit(1);
  }
  changeText = diff.stdout;
}

const measurementsMd = measurementsToMarkdown(screens, 25_000);
const images = args.routes.flatMap((route) =>
  VIEWPORTS.map((v) => {
    const screen = screens.find((s) => s.route === route && s.width === v.width);
    if (!screen) {
      console.error(`측정 누락: ${route} ${v.width}px — ${artifactsDir}/capture.log`);
      process.exit(1);
    }
    return { route, width: v.width, file: join(absDir, screen.screenshot) };
  }),
);
const prompt = buildPrompt({
  mode,
  changeText,
  systemSections: selectSystemSections(readFileSync("docs/design/SYSTEM.md", "utf8"), args.sections),
  measurementsMd,
  images,
});
writeFileSync(join(absDir, "prompt.md"), prompt);

// Codex는 저장소 밖 빈 임시 폴더에서 돌린다(스크린샷 사본만 둔다). 읽기 전용 샌드박스도 파일은 읽을 수
// 있어서, 저장소에서 돌리면 .env.local 같은 비밀 파일을 읽을 수 있다. 프롬프트에 필요한 것은 다 들어 있다.
const codexDir = mkdtempSync(join(tmpdir(), "codex-design-review-"));
const codexImages = images.map((img, i) => {
  const copy = join(codexDir, `${i + 1}-${img.width}.png`);
  copyFileSync(img.file, copy);
  return copy;
});
const codex = spawnSync("codex", codexArgs(prompt, codexImages), {
  cwd: codexDir,
  env: codexEnv(process.env),
  stdio: ["ignore", "pipe", "pipe"],
  encoding: "utf8",
  timeout: 900_000,
  maxBuffer: 20 * 1024 * 1024,
});
rmSync(codexDir, { recursive: true, force: true });
// Codex 출력은 파일로 남기기 전에 비밀을 가린다(자격 원본, auth.json 토큰 값, 저장소 .env* 값, 토큰 모양).
const secrets = [
  authB64 ?? "",
  ...envFileSecrets(
    readdirSync(".")
      .filter((f) => /^\.env/.test(f))
      .map((f) => readFileSync(f, "utf8")),
  ),
];
try {
  const auth = JSON.parse(readFileSync(join(process.env.CODEX_HOME ?? join(homedir(), ".codex"), "auth.json"), "utf8")) as {
    tokens?: Record<string, unknown>;
  };
  for (const value of Object.values(auth.tokens ?? {})) if (typeof value === "string") secrets.push(value);
} catch {
  // 읽지 못하면 토큰 모양 가림만 쓴다(오류 내용은 출력하지 않는다).
}
const codexRaw = redactSecrets(codex.stdout ?? "", secrets);
const codexOutputPath = join(artifactsDir, "codex-output.md");
writeFileSync(join(absDir, "codex-output.md"), codexRaw);
writeFileSync(join(absDir, "codex-stderr.log"), redactSecrets(codex.stderr ?? "", secrets));
const codexFailure = codex.error ? (codex.error as NodeJS.ErrnoException).code ?? codex.error.message : codex.signal ?? `exit ${codex.status}`;
const codexStatus = codex.status === 0 ? "Codex 실행: 완료(exit 0)" : skipLine(`codex exec 실패(${codexFailure})`);

const rows = crossCheck(parseCodexFindings(codexRaw), screens);
mkdirSync(dirname(resolve(args.out)), { recursive: true });
writeFileSync(
  args.out,
  renderReport({ mode, base: args.base, plans: args.plans, artifactsDir, codexStatus, rows, measurementsMd, codexOutputPath }),
);
console.log(`보고서: ${args.out} · 지적 후보 ${rows.length}건 · ${codexStatus}`);
