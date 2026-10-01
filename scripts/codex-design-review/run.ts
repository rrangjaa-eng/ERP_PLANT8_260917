import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import {
  VIEWPORTS,
  buildPrompt,
  codexArgs,
  crossCheck,
  measurementsToMarkdown,
  parseArgs,
  parseCodexFindings,
  renderReport,
  selectSystemSections,
  skipLine,
  type ScreenMeasure,
} from "./lib";

// scripts/codex-design-review.sh가 자격 확인 뒤 부른다. 캡처(Playwright, CI=true 빌드) →
// 프롬프트 → codex exec → 실측 대조 → 보고서. Codex stderr는 파일로만 남기고 출력하지 않는다.
const args = parseArgs(process.argv.slice(2));
const stamp = new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
const artifactsDir = join("test-results/codex-design-review", stamp);
const absDir = resolve(artifactsDir);
mkdirSync(absDir, { recursive: true });

const capture = spawnSync("pnpm", ["exec", "playwright", "test", "-c", "playwright.codex-design.config.ts"], {
  env: { ...process.env, CI: "true", CODEX_REVIEW_ROUTES: args.routes.join(","), CODEX_REVIEW_DIR: absDir },
  encoding: "utf8",
  maxBuffer: 50 * 1024 * 1024,
});
const captureLog = `${capture.stdout ?? ""}${capture.stderr ?? ""}`;
writeFileSync(join(absDir, "capture.log"), captureLog);
if (capture.status !== 0) {
  console.error(captureLog.split("\n").slice(-30).join("\n"));
  console.error(`캡처 실패(exit ${capture.status}) — ${artifactsDir}/capture.log`);
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
  changeText = spawnSync("git", ["diff", `${args.base}...HEAD`, "--", "app", "ui", "docs/design"], {
    encoding: "utf8",
    maxBuffer: 50 * 1024 * 1024,
  }).stdout;
}

const measurementsMd = measurementsToMarkdown(screens, 25_000);
const images = args.routes.flatMap((route) =>
  VIEWPORTS.map((v) => {
    const screen = screens.find((s) => s.route === route && s.width === v.width);
    return { route, width: v.width, file: join(absDir, screen?.screenshot ?? "") };
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

const codex = spawnSync("codex", codexArgs(prompt, images.map((i) => i.file)), {
  stdio: ["ignore", "pipe", "pipe"],
  encoding: "utf8",
  timeout: 900_000,
  maxBuffer: 20 * 1024 * 1024,
});
const codexRaw = codex.stdout ?? "";
writeFileSync(join(absDir, "codex-output.md"), codexRaw);
writeFileSync(join(absDir, "codex-stderr.log"), codex.stderr ?? "");
const codexStatus = codex.status === 0 ? "Codex 실행: 완료(exit 0)" : skipLine(`codex exec 실패(exit ${codex.status ?? "timeout"})`);

const rows = crossCheck(parseCodexFindings(codexRaw), screens);
mkdirSync(dirname(resolve(args.out)), { recursive: true });
writeFileSync(
  args.out,
  renderReport({ mode, base: args.base, plans: args.plans, artifactsDir, codexStatus, rows, measurementsMd, codexRaw }),
);
console.log(`보고서: ${args.out} · 지적 후보 ${rows.length}건 · ${codexStatus}`);
