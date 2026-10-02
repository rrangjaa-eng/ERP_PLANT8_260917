// 04.6 스킨 A 이관 전 표시 생성·집계·감사 도구 (공통 §3 · §4).
//   node scripts/design/mark-legacy.mjs --add                 새 규칙에 걸리는 파일 맨 위에만 표시 한 줄을 넣는다(멱등)
//   node scripts/design/mark-legacy.mjs --list                표시 파일 목록과 종류별 개수
//   node scripts/design/mark-legacy.mjs --audit <경로…>       공통 §4 마무리 조건 위반을 줄 단위로 출력, 위반이 있으면 종료 코드 1
// 열린 글롭 수작업 없이 표시는 이 스크립트가 넣고 개수를 센다. 새 의존성 없음 — 설치된 stylelint·eslint API만 쓴다.
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { isAbsolute, join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { ESLint } from "eslint";
import stylelint from "stylelint";
import tseslint from "typescript-eslint";
import restrictions from "../../eslint/restrictions.mjs";
import {
  CSS_LEGACY_MARKER,
  collectLintCssFiles,
  collectMarkedCssFiles,
  createConfig,
} from "../../stylelint.config.mjs";

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url)).replace(/\/$/, "");

/** 공통 §3 표시 세 형식 */
export const MARKERS = {
  css: CSS_LEGACY_MARKER,
  tsx: "/* eslint-disable no-restricted-syntax -- 04.6 스킨 A 이관 전 */",
  frame: "// 04.6 스킨 A 이관 전: 화면 틀",
};

/** 셸 없는 화면 — 화면 틀(ListScreen · DetailScreen)을 요구하지 않는 경로. PageHeader 직접 import 금지는 여기도 적용된다. */
export const FRAME_EXEMPT = [
  { prefix: "app/(auth)/", reason: "로그인 — 셸 없는 인증 폼(SYSTEM §6-7)" },
  { prefix: "app/c/", reason: "외부 수령자 화면 — 셸 없음(04.3, SYSTEM §6-5)" },
  { prefix: "app/print/", reason: "인쇄 라우트 — 인쇄 영구 예외, 화면 틀 없음" },
];

const HEAD_LINES = 3;

// ── 파일 훑기 ────────────────────────────────────────────────────────────

function walkFiles(dir, out) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    if (name === "node_modules" || name === ".next") continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walkFiles(full, out);
    else out.push(full);
  }
}

const toPosix = (root, abs) => relative(root, abs).split("\\").join("/");

/**
 * app/**\/*.{ts,tsx} (root 기준 posix 상대 경로, 정렬)
 * @param {string} root
 * @returns {string[]}
 */
export function collectAppSourceFiles(root) {
  const all = [];
  walkFiles(join(root, "app"), all);
  return all
    .map((abs) => toPosix(root, abs))
    .filter((rel) => rel.endsWith(".ts") || rel.endsWith(".tsx"))
    .sort();
}

// ── 표시 입출력 ──────────────────────────────────────────────────────────

const headLines = (text) => text.replace(/^\uFEFF/, "").split("\n", HEAD_LINES);

/**
 * 파일 맨 위(처음 3줄)에 그 표시 줄이 있는가 — CSS 표시는 첫 줄만(collectMarkedCssFiles와 같은 규칙).
 * @param {string} text
 * @param {string} marker
 * @returns {boolean}
 */
export function hasMark(text, marker) {
  const lines = headLines(text).map((l) => l.trimEnd());
  return marker === MARKERS.css ? lines[0] === marker : lines.includes(marker);
}

/**
 * 표시 줄을 뗀 내용(래칫 테스트가 쓴다)
 * @param {string} text
 * @param {string} marker
 * @returns {string}
 */
export function stripMark(text, marker) {
  const lines = text.split("\n");
  const index = lines.slice(0, HEAD_LINES).findIndex((l) => l.trimEnd() === marker);
  if (index === -1) return text;
  lines.splice(index, 1);
  return lines.join("\n");
}

/**
 * 표시한 파일 목록(root 기준 posix 상대 경로)
 * @param {string} root
 * @param {"css" | "tsx" | "frame"} kind
 * @returns {string[]}
 */
export function collectMarked(root, kind) {
  if (kind === "css") return collectMarkedCssFiles(root);
  return collectAppSourceFiles(root).filter((rel) =>
    hasMark(readFileSync(join(root, rel), "utf8"), MARKERS[kind]),
  );
}

// ── 화면 틀 판정 ─────────────────────────────────────────────────────────

const PAGE_HEADER_IMPORT = /from\s+["'][^"']*ui\/page-header\/PageHeader["']/;
const FRAME_IMPORT = /from\s+["'][^"']*ui\/(?:list-screen\/ListScreen|detail-screen\/DetailScreen)["']/;

/**
 * 파일 내용이 화면 틀 규칙을 어기는 이유 목록(표시 여부와 무관).
 *  · page.tsx는 ListScreen 또는 DetailScreen을 import해야 한다(FRAME_EXEMPT 경로 제외)
 *  · 어떤 app/** 파일도 PageHeader를 직접 import하지 않는다
 * @param {string} rel root 기준 posix 상대 경로
 * @param {string} text
 * @returns {string[]}
 */
export function frameViolations(rel, text) {
  const reasons = [];
  if (PAGE_HEADER_IMPORT.test(text)) reasons.push("PageHeader 직접 import");
  const isPage = rel.split("/").pop() === "page.tsx";
  const exempt = FRAME_EXEMPT.some((e) => rel.startsWith(e.prefix));
  if (isPage && !exempt && !FRAME_IMPORT.test(text)) reasons.push("ListScreen·DetailScreen 미사용");
  return reasons;
}

// ── 표시 넣기 ────────────────────────────────────────────────────────────

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
    writeFileSync(abs, `${MARKERS.css}\n${code}`);
    added.push(rel);
  }
  return added;
}

function createEslint(root) {
  return new ESLint({
    cwd: root,
    overrideConfigFile: true,
    overrideConfig: [
      {
        files: ["**/*.{ts,tsx}"],
        languageOptions: {
          parser: tseslint.parser,
          parserOptions: { ecmaFeatures: { jsx: true } },
        },
      },
      ...restrictions,
    ],
  });
}

/**
 * eslint 새 규칙(<table>·<dialog> 직접 그리기) 오류가 있는 app/** 파일에 TSX 표시를 넣는다.
 * @param {string} root
 * @returns {Promise<string[]>}
 */
export async function addTsxMarks(root) {
  const eslint = createEslint(root);
  const added = [];
  for (const rel of collectAppSourceFiles(root)) {
    const abs = join(root, rel);
    const code = readFileSync(abs, "utf8");
    if (hasMark(code, MARKERS.tsx)) continue;
    const [result] = await eslint.lintText(code, { filePath: abs });
    // 파일 안의 다른 규칙 disable 주석(이 최소 설정에는 없는 규칙)이 낳는 「규칙 정의 없음」 오류는 세지 않는다
    if (!(result?.messages ?? []).some((m) => m.ruleId === "no-restricted-syntax")) continue;
    writeFileSync(abs, `${MARKERS.tsx}\n${code}`);
    added.push(rel);
  }
  return added;
}

/**
 * 화면 틀을 쓰지 않는 page.tsx · PageHeader를 직접 import하는 파일에 화면 틀 표시를 넣는다(FRAME_EXEMPT 경로는 틀 요구에서 제외).
 * @param {string} root
 * @returns {Promise<string[]>}
 */
export async function addFrameMarks(root) {
  const added = [];
  for (const rel of collectAppSourceFiles(root)) {
    if (!rel.endsWith(".tsx")) continue;
    const abs = join(root, rel);
    const code = readFileSync(abs, "utf8");
    if (hasMark(code, MARKERS.frame)) continue;
    if (frameViolations(rel, code).length === 0) continue;
    writeFileSync(abs, `${MARKERS.frame}\n${code}`);
    added.push(rel);
  }
  return added;
}

/**
 * 표시 파일 목록(종류별).
 * @param {string} root
 */
export function listMarks(root) {
  return {
    css: collectMarked(root, "css"),
    tsx: collectMarked(root, "tsx"),
    frame: collectMarked(root, "frame"),
  };
}

// ── 감사(공통 §4 (a)~(f)) ────────────────────────────────────────────────

const OLD_TOKEN = new RegExp(
  String.raw`(?<![\w-])--(?:bg|surface|fg|muted|faint|line|line-ui|line-strong|line-w-strong|radius|shadow|modal-w|bar|fs-[\w-]+|danger|danger-weak|warning|warning-weak|success|success-weak|scrim|row-min)(?![\w-])`,
  "g",
);
const RAW_TOKEN = /(?<![\w-])--(?:g|n|red|amber|blue|ink)-[\w-]+/g;
const STATUS_TAG_KIND = /<StatusTag\b[^>]*?\bkind\s*=/gs;
const RAW_TABLE_DIALOG = /<(table|dialog)\b/g;
const PANEL_LINK_HASH = /(?:\bnew|\beditId)=[^"'`\s}]*#/g;

function lineOf(text, index) {
  return text.slice(0, index).split("\n").length;
}

function* matches(text, re) {
  for (const m of text.matchAll(re)) yield m;
}

/**
 * 공통 §4 마무리 조건 위반 목록.
 * (a) 이관 전 표시 · (b) PageHeader 직접 import · (c) StatusTag kind · (d) 옛 토큰 이름·원시 토큰 ·
 * (e) app/** 표·dialog · (f) 패널 링크 해시
 * @param {string} root
 * @param {string[]} paths root 기준(또는 절대) 파일·폴더
 * @returns {{ file: string, line: number, kind: "a"|"b"|"c"|"d"|"e"|"f", message: string }[]}
 */
export function auditPaths(root, paths) {
  const files = new Set();
  for (const p of paths) {
    const abs = isAbsolute(p) ? p : join(root, p);
    let stat;
    try {
      stat = statSync(abs);
    } catch {
      throw new Error(`경로가 없다: ${p}`);
    }
    if (stat.isDirectory()) {
      const all = [];
      walkFiles(abs, all);
      for (const f of all) files.add(f);
    } else {
      files.add(abs);
    }
  }

  const found = [];
  const add = (file, line, kind, message) => found.push({ file, line, kind, message });

  for (const abs of [...files].sort()) {
    const file = toPosix(root, abs);
    const isCss = file.endsWith(".css");
    const isTs = file.endsWith(".ts") || file.endsWith(".tsx");
    if (!isCss && !isTs) continue;
    const text = readFileSync(abs, "utf8");

    const markers = isCss ? [MARKERS.css] : [MARKERS.tsx, MARKERS.frame];
    for (const marker of markers) {
      if (hasMark(text, marker)) {
        const at = text.replace(/^\uFEFF/, "").split("\n", HEAD_LINES).findIndex((l) => l.trimEnd() === marker);
        add(file, at + 1, "a", `이관 전 표시가 남았다 — ${marker}`);
      }
    }

    if (isCss) {
      for (const m of matches(text, OLD_TOKEN)) {
        add(file, lineOf(text, m.index), "d", `옛 토큰 이름 ${m[0]}`);
      }
      for (const m of matches(text, RAW_TOKEN)) {
        add(file, lineOf(text, m.index), "d", `원시 토큰 직접 참조 ${m[0]}`);
      }
      continue;
    }

    text.split("\n").forEach((line, i) => {
      if (PAGE_HEADER_IMPORT.test(line)) add(file, i + 1, "b", "PageHeader 직접 import");
    });
    for (const m of matches(text, STATUS_TAG_KIND)) {
      add(file, lineOf(text, m.index), "c", "StatusTag에 kind — status 낱말만 쓴다");
    }
    if (file.startsWith("app/")) {
      for (const m of matches(text, RAW_TABLE_DIALOG)) {
        add(file, lineOf(text, m.index), "e", `app/**에서 <${m[1]}> 직접 사용`);
      }
    }
    for (const m of matches(text, PANEL_LINK_HASH)) {
      add(file, lineOf(text, m.index), "f", "패널을 여는 링크에 해시");
    }
  }

  return found.sort(
    (x, y) => x.file.localeCompare(y.file) || x.line - y.line || x.kind.localeCompare(y.kind),
  );
}

// ── CLI ──────────────────────────────────────────────────────────────────

function printList(root) {
  const marks = listMarks(root);
  const section = (label, list) => [`${label} ${list.length}`, ...list.map((f) => `  ${f}`)];
  console.log(
    [
      ...section("CSS", marks.css),
      ...section("TSX", marks.tsx),
      ...section("화면 틀", marks.frame),
    ].join("\n"),
  );
}

async function main(argv) {
  const root = REPO_ROOT;
  if (argv.includes("--add")) {
    const css = await addCssMarks(root);
    const tsx = await addTsxMarks(root);
    const frame = await addFrameMarks(root);
    console.log(`표시 추가: CSS ${css.length} · TSX ${tsx.length} · 화면 틀 ${frame.length}`);
    for (const f of [...css, ...tsx, ...frame]) console.log(`  ${f}`);
    return 0;
  }
  if (argv.includes("--list")) {
    printList(root);
    return 0;
  }
  const auditAt = argv.indexOf("--audit");
  if (auditAt !== -1) {
    const paths = argv.slice(auditAt + 1).filter((a) => !a.startsWith("--"));
    if (paths.length === 0) {
      console.error("사용법: node scripts/design/mark-legacy.mjs --audit <경로…>");
      return 2;
    }
    const found = auditPaths(root, paths);
    for (const v of found) console.log(`${v.file}:${v.line}: (${v.kind}) ${v.message}`);
    return found.length > 0 ? 1 : 0;
  }
  console.error("사용법: node scripts/design/mark-legacy.mjs --add | --list | --audit <경로…>");
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
