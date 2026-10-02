// 04.6 스킨 A 이관 전 표시 생성·집계·감사 도구 (공통 §3 · §4).
//   node scripts/design/mark-legacy.mjs --add     새 규칙에 걸리는 파일 맨 위에만 표시 한 줄을 넣는다(멱등)
//   node scripts/design/mark-legacy.mjs --list    표시 파일 목록과 종류별 개수
// 열린 글롭 수작업 없이 표시는 이 스크립트가 넣고 개수를 센다. 새 의존성 없음 — 설치된 stylelint API만 쓴다.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import stylelint from "stylelint";
import {
  CSS_LEGACY_MARKER,
  collectLintCssFiles,
  collectMarkedCssFiles,
  createConfig,
} from "../../stylelint.config.mjs";

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url)).replace(/\/$/, "");

/**
 * 새 규칙(표시 없는 설정)에 경고가 있는 CSS 맨 위에 표시를 넣는다. 이미 표시가 있으면 건너뛴다.
 * @param {string} root
 * @returns {Promise<string[]>} 이번에 표시를 넣은 파일(root 기준 posix 상대 경로)
 */
export async function addCssMarks(root) {
  const config = createConfig([]);
  const already = new Set(collectMarkedCssFiles(root));
  const added = [];
  for (const rel of collectLintCssFiles(root)) {
    if (already.has(rel)) continue;
    const abs = join(root, rel);
    const code = readFileSync(abs, "utf8");
    const { results } = await stylelint.lint({ code, config, codeFilename: abs, cwd: root });
    if ((results[0]?.warnings.length ?? 0) === 0) continue;
    writeFileSync(abs, `${CSS_LEGACY_MARKER}\n${code}`);
    added.push(rel);
  }
  return added;
}

/**
 * 표시 파일 목록(종류별).
 * @param {string} root
 */
export function listMarks(root) {
  return { css: collectMarkedCssFiles(root) };
}

function printList(root) {
  const marks = listMarks(root);
  const lines = [`CSS ${marks.css.length}`, ...marks.css.map((f) => `  ${f}`)];
  console.log(lines.join("\n"));
}

async function main(argv) {
  const root = REPO_ROOT;
  if (argv.includes("--add")) {
    const added = await addCssMarks(root);
    console.log(`표시 추가: CSS ${added.length}`);
    for (const f of added) console.log(`  ${f}`);
    return 0;
  }
  if (argv.includes("--list")) {
    printList(root);
    return 0;
  }
  console.error("사용법: node scripts/design/mark-legacy.mjs --add | --list");
  return 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (error) => {
      console.error(error);
      process.exit(1);
    },
  );
}
