// Codex 디자인 검토의 순수 함수(사용자 결정 2026-10-01: Codex는 디자인 검토에서만).
// 실제 화면 4폭 스크린샷 + DOM 실측표 + SYSTEM.md 관련 절 + 변경(diff 또는 계획)을 하나의
// 프롬프트로 묶고, Codex 지적을 실측표와 대조한 보고서를 만든다. Codex 지적은 후보이고 결함
// 판정은 DOM 실측으로만 한다(CLAUDE.md §6 「스크린샷 육안 판정 금지」).

import { createHash } from "node:crypto";
import { existsSync, lstatSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";

export const VIEWPORTS = [
  { width: 375, height: 800 },
  { width: 320, height: 800 },
  { width: 768, height: 1024 },
  { width: 1280, height: 800 },
] as const;

// 0 방향 · 3 간격 · 4-1 radius · 6-0 공통 셸 · 6-1 목록 · 7-1 버튼 · 7-2 입력 · 7-3 표
export const DEFAULT_SECTIONS = ["0", "3", "4-1", "6-0", "6-1", "7-1", "7-2", "7-3"];

// 리눅스 인자 하나의 상한(MAX_ARG_STRLEN 131072바이트) 아래로 둔다.
export const PROMPT_BUDGET_BYTES = 100_000;
const MEASUREMENTS_BUDGET_BYTES = 25_000;
const SECTIONS_BUDGET_BYTES = 55_000;

export type ElementMeasure = {
  selector: string;
  kind: "heading" | "label" | "button" | "input" | "cell" | "row" | "nav" | "link";
  text: string;
  width: number;
  height: number;
  lines: number | null;
  overflowsSelf: boolean;
  exceedsViewport: boolean;
  scrollContainer: boolean;
};
export type GapMeasure = { parent: string; before: string; after: string; gap: number };
export type ScreenMeasure = {
  route: string;
  width: number;
  screenshot: string;
  scrollWidth: number;
  clientWidth: number;
  overflowX: boolean;
  elements: ElementMeasure[];
  gaps: GapMeasure[];
  omitted: number; // 측정 상한(400개)을 넘어 빠진 요소 수
};
export type Finding = {
  route: string;
  width: number;
  selector: string;
  metric: "overflowX" | "overflow" | "height" | "lines" | "gap" | "visual";
  claim: string;
  expected: string;
};
export type ReviewArgs = { routes: string[]; out: string; base: string; plans: string[]; sections: string[] };

// root 아래 dirs 중 하나에 들고 .md로 끝나는 상대 경로인지 본다(.. 탈출·절대 경로·점 파일 거부).
function insideMd(path: string, dirs: string[], root: string): boolean {
  const rel = relative(root, resolve(root, path));
  if (isAbsolute(path) || rel.startsWith("..") || !rel.endsWith(".md")) return false;
  if (rel.split("/").some((part, i) => i > 0 && part.startsWith("."))) return false;
  return dirs.some((dir) => rel.startsWith(`${dir}/`));
}

export function parseArgs(argv: string[], root = process.cwd()): ReviewArgs {
  const routes: string[] = [];
  const plans: string[] = [];
  const sections = [...DEFAULT_SECTIONS];
  let out = "";
  let base = "origin/main";
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] ?? "";
    const value = argv[i + 1] ?? "";
    if (arg === "--out" || arg === "--base" || arg === "--plan" || arg === "--sections") {
      // 값이 비었거나 -로 시작하면 거부한다 — --base 값은 git diff 인자로 들어가 옵션(--output=…)이 될 수 있다.
      if (!value || value.startsWith("-")) throw new Error(`${arg} 뒤에 값이 필요하다`);
      i++;
      if (arg === "--out") out = value;
      else if (arg === "--base") base = value;
      else if (arg === "--plan") plans.push(value);
      else for (const id of value.split(",").map((s) => s.trim())) if (id && !sections.includes(id)) sections.push(id);
    } else if (!arg.startsWith("/") || arg.startsWith("//") || arg.includes("\\")) {
      // //host·역슬래시는 URL 해석에서 다른 호스트로 풀린다 — 앱 출처 안의 경로만 받는다.
      throw new Error(`경로는 /로 시작하는 앱 안 경로여야 한다: ${arg}`);
    }
    else routes.push(arg);
  }
  if (routes.length === 0) throw new Error("검토할 경로를 하나 이상 준다(예: /admin/people)");
  if (!out) throw new Error("--out <보고서.md>가 필요하다");
  // 보고서는 .planning/·test-results/의 .md에만 쓴다 — 보호 파일(CLAUDE.md·.claude/)을 덮지 않게.
  if (!insideMd(out, [".planning", "test-results"], root)) throw new Error(`--out은 .planning/·test-results/ 아래 .md여야 한다: ${out}`);
  // 계획 글은 Codex로 나간다 — 저장소 .planning/·docs/의 .md만(비밀 파일 전송 방지).
  for (const plan of plans) {
    if (!insideMd(plan, [".planning", "docs"], root)) throw new Error(`--plan은 .planning/·docs/ 아래 .md여야 한다: ${plan}`);
  }
  return { routes, out, base, plans, sections };
}

// 텍스트 노드 상자 [top, bottom]들을 줄 수로 센다. 세로 중심이 이미 센 줄 안에 들면 같은 줄이다
// (요소 범위 전체의 getClientRects는 하위 요소 상자까지 섞여 한 줄을 2줄로 센다).
// 파일 시스템으로 다시 확인한다: 심볼릭 링크를 거부하고, 실제 경로(상위 폴더 포함)가 허용 폴더 안인지 본다.
// 글자만 보는 parseArgs 검사는 .planning/r.md -> ../../CLAUDE.md 같은 링크를 통과시킨다.
export function assertRealPaths(args: { out: string; plans: string[] }, root = process.cwd()): void {
  const realRoot = realpathSync(root);
  const inside = (real: string, dirs: string[]) =>
    dirs.some((dir) => {
      const rel = relative(resolve(realRoot, dir), real);
      return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
    });
  const nearestReal = (path: string): string => {
    let cur = path;
    while (!existsSync(cur)) cur = dirname(cur);
    return resolve(realpathSync(cur), relative(cur, path));
  };
  const outAbs = resolve(root, args.out);
  if ((existsSync(outAbs) && lstatSync(outAbs).isSymbolicLink()) || !inside(nearestReal(outAbs), [".planning", "test-results"])) {
    throw new Error(`--out은 링크가 아닌 .planning/·test-results/ 안 파일이어야 한다: ${args.out}`);
  }
  for (const plan of args.plans) {
    const abs = resolve(root, plan);
    if (!existsSync(abs) || lstatSync(abs).isSymbolicLink() || !inside(realpathSync(abs), [".planning", "docs"])) {
      throw new Error(`--plan은 링크가 아닌 .planning/·docs/ 안 파일이어야 한다: ${plan}`);
    }
  }
}

// 동적 경로 자리 표시: {adminId} = 캡처 때 만든 관리자 계정 id(예: /admin/people/{adminId}).
export function fillRoute(route: string, vars: { adminId: string }): string {
  return route.replaceAll("{adminId}", vars.adminId);
}

// .env 계열 파일에서 가릴 값을 모은다(8자 이상). Codex 출력에 섞여도 파일로 남기기 전에 가린다.
export function envFileSecrets(texts: string[]): string[] {
  const values: string[] = [];
  for (const text of texts) {
    for (const line of text.split("\n")) {
      const match = /^\s*(?:export\s+)?[A-Za-z_][A-Za-z0-9_]*\s*=\s*(.*)$/.exec(line);
      const value = (match?.[1] ?? "").trim().replace(/^(["'])(.*)\1$/, "$2");
      if (value.length >= 8) values.push(value);
    }
  }
  return values;
}

export function countLines(rects: Array<[number, number]>): number | null {
  const lines: Array<[number, number]> = [];
  for (const [top, bottom] of [...rects].sort((a, b) => a[0] - b[0])) {
    const mid = (top + bottom) / 2;
    if (!lines.some(([t, b]) => mid >= t && mid <= b)) lines.push([top, bottom]);
  }
  return lines.length > 0 ? lines.length : null;
}

export function screenshotName(route: string, width: number): string {
  // 읽기용 부분은 80자로 자른다(파일 이름 255바이트 상한). 문장부호만 다른 경로·잘린 경로가 같은
  // 파일로 겹치지 않게 전체 경로 해시를 붙인다.
  const slug = (route.replace(/^\/+|\/+$/g, "").replace(/[^A-Za-z0-9]+/g, "_") || "root").slice(0, 80);
  const hash = createHash("sha256").update(route).digest("hex").slice(0, 8);
  return `${slug}-${hash}-${width}.png`;
}

export function selectSystemSections(systemMd: string, ids: string[]): string {
  const lines = systemMd.split("\n");
  const headingRe = /^(#{1,6}) /;
  const idRe = /^(#{2,3}) (\d+(?:-\d+)?)\. /;
  const picked: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const match = idRe.exec(lines[i] ?? "");
    if (!match || !ids.includes(match[2] ?? "")) continue;
    const level = (match[1] ?? "").length;
    let end = i + 1;
    while (end < lines.length) {
      const h = headingRe.exec(lines[end] ?? "");
      if (h && (h[1] ?? "").length <= level) break;
      end++;
    }
    picked.push(lines.slice(i, end).join("\n").trimEnd());
  }
  return picked.join("\n\n");
}

// 줄 단위로 maxBytes 안에 자르고, 잘랐으면 생략 바이트를 적은 표시 줄을 붙인다.
function trimToBytes(text: string, maxBytes: number): string {
  const total = Buffer.byteLength(text);
  if (total <= maxBytes) return text;
  const room = Math.max(0, maxBytes - 64);
  const kept: string[] = [];
  let used = 0;
  for (const line of text.split("\n")) {
    const size = Buffer.byteLength(line) + 1;
    if (used + size > room) {
      // 한 줄이 남은 자리보다 길면 UTF-8 경계에서 잘라 앞부분을 남긴다.
      if (kept.length === 0) {
        const head = Buffer.from(line).subarray(0, room - used).toString("utf8").replace(/\uFFFD+$/, "");
        kept.push(head);
        used += Buffer.byteLength(head) + 1;
      }
      break;
    }
    kept.push(line);
    used += size;
  }
  return `${kept.join("\n")}\n…(잘림: ${total - used}바이트 생략)`;
}

const cell = (value: string | number | null) => String(value ?? "—").replace(/\|/g, "\\|").replace(/[\r\n]/g, " ");

// Codex가 만든 글을 커밋되는 보고서에 넣기 전에 무력화한다: 링크·이미지·HTML·코드 기호를 바꾸고 300자로 자른다.
const untrustedCell = (value: string) =>
  cell(
    value
      .slice(0, 300)
      .replace(/[<>]/g, (c) => (c === "<" ? "‹" : "›"))
      .replace(/[[\]()!`]/g, (c) => `\\${c}`),
  );

export function measurementsToMarkdown(screens: ScreenMeasure[], maxBytes: number): string {
  // 상한을 폭마다 나눈다 — 첫 폭이 다 먹어 나머지 폭이 통째로 빠지지 않게. 폭 안에서는 머리·넘침 줄·간격이 먼저다.
  const perScreen = Math.floor(maxBytes / Math.max(1, screens.length)) - 2;
  const row = (e: ElementMeasure) =>
    `| ${cell(e.selector)} | ${e.kind} | ${cell(e.text)} | ${e.width}×${e.height} | ${cell(e.lines)} | ${e.overflowsSelf ? "예" : ""} | ${e.exceedsViewport ? "예" : ""} | ${e.scrollContainer ? "예" : ""} |`;
  const flagged = (e: ElementMeasure) => e.overflowsSelf || e.exceedsViewport || (e.lines ?? 0) >= 2;
  const header = ["| 선택자 | 종류 | 글 | 너비×높이 | 줄 | 자기 넘침 | 화면 밖 | 스크롤 칸 |", "|---|---|---|---|---|---|---|---|"];
  const blocks = screens.map((s) => {
    const out = [
      `### ${s.route} · ${s.width}px (${s.screenshot})`,
      `- 페이지 가로: scrollWidth ${s.scrollWidth} / clientWidth ${s.clientWidth} → ${s.overflowX ? "**가로 넘침**" : "넘침 없음"}`,
    ];
    if (s.omitted > 0) out.push(`- 측정 생략 ${s.omitted}개(요소 상한 400)`);
    const marked = s.elements.filter(flagged);
    if (marked.length > 0) out.push("", "넘침·줄바꿈 표시 요소", "", ...header, ...marked.map(row));
    if (s.gaps.length > 0) {
      out.push("", "| 부모 | 앞 | 뒤 | 세로 간격 |", "|---|---|---|---|");
      for (const g of s.gaps) out.push(`| ${cell(g.parent)} | ${cell(g.before)} | ${cell(g.after)} | ${g.gap} |`);
    }
    out.push("", "나머지 요소", "", ...header, ...s.elements.filter((e) => !flagged(e)).map(row), "");
    return trimToBytes(out.join("\n"), perScreen);
  });
  return blocks.join("\n");
}

export function buildPrompt(input: {
  mode: "diff" | "plan";
  changeText: string;
  systemSections: string;
  measurementsMd: string;
  images: Array<{ route: string; width: number; file: string }>;
}): string {
  const changeTitle = input.mode === "plan" ? "## 계획·UI-SPEC" : "## 코드 변경(diff)";
  const head = [
    "너는 이 ERP의 디자인 검토자다. 첨부 스크린샷(실제 CI=true 프로덕션 빌드 화면)과 DOM 실측표를 보고,",
    "아래 SYSTEM.md 절을 기준으로 높이·간격·넘침·폰 폭 줄바꿈·위계 문제를 찾아라.",
    input.mode === "plan"
      ? "계획·UI-SPEC이 지금 화면에 들어가면 SYSTEM.md와 어긋날 곳을 찾아라."
      : "코드 변경이 만든 화면을 중심으로 본다.",
    "",
    "규칙:",
    "- 모든 지적은 경로·폭·선택자(실측표에 있는 것을 그대로 복사)·지표·측정 가능한 주장·기대 SYSTEM.md 값을 갖는다.",
    "- 지표는 overflowX|overflow|height|lines|gap|visual 중 하나. 스크린샷으로만 본 것은 visual로 적는다.",
    "- 출력: ```json 배열 하나(Finding 객체: route, width, selector, metric, claim, expected) 뒤에 요약 5줄 이하.",
    "",
    "## 첨부 이미지(-i 순서)",
    ...input.images.map((img, i) => `${i + 1}) ${img.route} ${img.width}`),
    "",
    "## SYSTEM.md 관련 절",
    trimToBytes(input.systemSections, SECTIONS_BUDGET_BYTES),
    "",
    "## DOM 실측표",
    trimToBytes(input.measurementsMd, MEASUREMENTS_BUDGET_BYTES),
    "",
    changeTitle,
  ].join("\n");
  const body =
    input.mode === "diff" && input.changeText.trim() === ""
      ? "변경 없음 — 현재 화면 전체를 SYSTEM.md 기준으로 검토"
      : trimToBytes(input.changeText, PROMPT_BUDGET_BYTES - Buffer.byteLength(head) - 128);
  return `${head}\n${body}\n`;
}

export function codexArgs(prompt: string, imageFiles: string[]): string[] {
  // -i <FILE>...은 뒤 인자를 모두 파일로 먹는다 — 프롬프트를 첫 -i보다 앞에 둔다.
  return ["exec", "--skip-git-repo-check", "-s", "read-only", prompt, ...imageFiles.flatMap((f) => ["-i", f])];
}

export function parseCodexFindings(stdout: string): Finding[] {
  const blocks = [...stdout.matchAll(/```json\s*\n([\s\S]*?)```/g)];
  const last = blocks.at(-1)?.[1];
  if (last === undefined) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(last);
  } catch {
    return [];
  }
  // Codex 출력은 신뢰하지 않는다 — Finding 형태가 맞는 항목만 남긴다.
  // 폭은 숫자 문자열("375")도 숫자로 읽는다.
  if (!Array.isArray(parsed)) return [];
  return parsed
    .map((v: unknown) =>
      typeof v === "object" && v !== null && typeof (v as { width?: unknown }).width === "string" && /^\d+$/.test((v as { width: string }).width)
        ? { ...v, width: Number((v as { width: string }).width) }
        : v,
    )
    .filter(isFinding);
}

const METRICS: ReadonlyArray<Finding["metric"]> = ["overflowX", "overflow", "height", "lines", "gap", "visual"];

function isFinding(value: unknown): value is Finding {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.route === "string" &&
    typeof v.width === "number" &&
    typeof v.selector === "string" &&
    METRICS.includes(v.metric as Finding["metric"]) &&
    typeof v.claim === "string" &&
    typeof v.expected === "string"
  );
}

export function crossCheck(findings: Finding[], screens: ScreenMeasure[]): Array<Finding & { measured: string }> {
  return findings.map((f) => {
    const s = screens.find((x) => x.route === f.route && x.width === f.width);
    let measured = "측정표에 없음 — 실측 필요";
    if (f.metric === "visual") measured = "시각 지적 — 실측 필요";
    else if (s && f.metric === "overflowX") {
      measured = `scrollWidth ${s.scrollWidth} / clientWidth ${s.clientWidth} (${s.overflowX ? "넘침" : "넘침 없음"})`;
    } else if (s && f.metric === "gap") {
      const gaps = s.gaps.filter((g) => g.before === f.selector || g.after === f.selector);
      if (gaps.length > 0) measured = gaps.map((g) => `${g.before}→${g.after} ${g.gap}px`).join(", ");
    } else if (s) {
      const matches = s.elements.filter((x) => x.selector === f.selector);
      const e = matches.length === 1 ? matches[0] : undefined;
      if (matches.length > 1) measured = `모호(${matches.length}개 일치) — 실측 필요`;
      else if (e) {
        measured = `${e.width}×${e.height}px · ${e.lines ?? "—"}줄 · 자기 넘침 ${e.overflowsSelf ? "예" : "아니오"} · 화면 밖 ${e.exceedsViewport ? "예" : "아니오"}`;
      }
    }
    return { ...f, measured };
  });
}

// codex에 넘길 환경 변수 허용 목록. 자격 원본(CODEX_AUTH_JSON_B64)·DB 주소·앱 비밀은 넘기지 않는다
// (Codex 셸 도구가 env를 읽을 수 있고, 그 출력이 보고서로 들어온다).
const CODEX_ENV_KEYS = [
  "PATH",
  "HOME",
  "CODEX_HOME",
  "LANG",
  "LC_ALL",
  "TMPDIR",
  "HTTPS_PROXY",
  "HTTP_PROXY",
  "NO_PROXY",
  "https_proxy",
  "http_proxy",
  "no_proxy",
  "NODE_EXTRA_CA_CERTS",
  "SSL_CERT_FILE",
  "SSL_CERT_DIR",
];

export function codexEnv(env: Record<string, string | undefined>): NodeJS.ProcessEnv {
  const picked: Record<string, string> = {};
  for (const key of CODEX_ENV_KEYS) {
    const value = env[key];
    if (typeof value === "string") picked[key] = value;
  }
  return picked as NodeJS.ProcessEnv;
}

// 파일로 남기기 전에 비밀 값 그대로와 토큰 모양(JWT·rt_/sk- 접두 토큰)을 가린다.
export function redactSecrets(text: string, secrets: string[]): string {
  let out = text;
  for (const secret of secrets) if (secret.length >= 8) out = out.split(secret).join("[가림]");
  return out
    .replace(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*/g, "[가림]")
    .replace(/\b(?:rt|sk)[-_][A-Za-z0-9_-]{16,}/g, "[가림]");
}

export function skipLine(reason: string): string {
  return `Codex 디자인 검토 건너뜀: ${reason}`;
}

export function renderReport(input: {
  mode: "diff" | "plan";
  base: string;
  plans: string[];
  artifactsDir: string;
  codexStatus: string;
  rows: Array<Finding & { measured: string }>;
  measurementsMd: string;
  codexOutputPath: string;
}): string {
  const source = input.mode === "plan" ? `계획: ${input.plans.join(", ")}` : `diff 기준: ${input.base}...HEAD`;
  const lines = [
    "# Codex 디자인 검토",
    "",
    "> Codex 지적은 후보다 — 결함 판정은 DOM 실측으로만 한다(CLAUDE.md §6 스크린샷 육안 판정 금지).",
    "> 「자동 대조」는 실측표에서 같은 선택자를 찾아 붙인 값이고, 「실측 확인」은 검토자가 채운다.",
    "",
    `- ${input.codexStatus}`,
    `- ${source}`,
    `- 산출물(스크린샷·measurements.json): \`${input.artifactsDir}\``,
    `- Codex 원문(비밀 가림, 커밋 안 함): \`${input.codexOutputPath}\``,
    "",
    "## 지적 후보",
    "",
  ];
  if (input.rows.length === 0) lines.push("지적 없음(또는 JSON을 읽지 못함 — Codex 원문 참고).");
  else {
    lines.push(
      "| # | 경로 | 폭 | 선택자 | 지표 | 지적 | 기대(SYSTEM.md) | 자동 대조 | 실측 확인 |",
      "|---|---|---|---|---|---|---|---|---|",
    );
    input.rows.forEach((r, i) => {
      lines.push(
        `| ${i + 1} | ${untrustedCell(r.route)} | ${r.width} | ${untrustedCell(r.selector)} | ${r.metric} | ${untrustedCell(r.claim)} | ${untrustedCell(r.expected)} | ${cell(r.measured)} |  |`,
      );
    });
  }
  lines.push(
    "",
    "## DOM 실측표",
    "",
    input.measurementsMd,
    "",
  );
  return lines.join("\n");
}
