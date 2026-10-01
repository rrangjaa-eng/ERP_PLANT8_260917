// Codex 디자인 검토의 순수 함수(사용자 결정 2026-10-01: Codex는 디자인 검토에서만).
// 실제 화면 4폭 스크린샷 + DOM 실측표 + SYSTEM.md 관련 절 + 변경(diff 또는 계획)을 하나의
// 프롬프트로 묶고, Codex 지적을 실측표와 대조한 보고서를 만든다. Codex 지적은 후보이고 결함
// 판정은 DOM 실측으로만 한다(CLAUDE.md §6 「스크린샷 육안 판정 금지」).

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
  kind: "heading" | "label" | "button" | "input" | "cell" | "row" | "nav";
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

export function parseArgs(argv: string[]): ReviewArgs {
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
    } else if (!arg.startsWith("/")) throw new Error(`경로는 /로 시작해야 한다: ${arg}`);
    else routes.push(arg);
  }
  if (routes.length === 0) throw new Error("검토할 경로를 하나 이상 준다(예: /admin/people)");
  if (!out) throw new Error("--out <보고서.md>가 필요하다");
  return { routes, out, base, plans, sections };
}

// 텍스트 노드 상자 [top, bottom]들을 줄 수로 센다. 세로 중심이 이미 센 줄 안에 들면 같은 줄이다
// (요소 범위 전체의 getClientRects는 하위 요소 상자까지 섞여 한 줄을 2줄로 센다).
export function countLines(rects: Array<[number, number]>): number | null {
  const lines: Array<[number, number]> = [];
  for (const [top, bottom] of [...rects].sort((a, b) => a[0] - b[0])) {
    const mid = (top + bottom) / 2;
    if (!lines.some(([t, b]) => mid >= t && mid <= b)) lines.push([top, bottom]);
  }
  return lines.length > 0 ? lines.length : null;
}

export function screenshotName(route: string, width: number): string {
  const slug = route.replace(/^\/+|\/+$/g, "").replace(/[^A-Za-z0-9]+/g, "_") || "root";
  return `${slug}-${width}.png`;
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
    if (used + size > room) break;
    kept.push(line);
    used += size;
  }
  return `${kept.join("\n")}\n…(잘림: ${total - used}바이트 생략)`;
}

const cell = (value: string | number | null) => String(value ?? "—").replace(/\|/g, "\\|").replace(/\n/g, " ");

export function measurementsToMarkdown(screens: ScreenMeasure[], maxBytes: number): string {
  const out: string[] = [];
  for (const s of screens) {
    out.push(`### ${s.route} · ${s.width}px (${s.screenshot})`);
    out.push(
      `- 페이지 가로: scrollWidth ${s.scrollWidth} / clientWidth ${s.clientWidth} → ${s.overflowX ? "**가로 넘침**" : "넘침 없음"}`,
    );
    const flagged = (e: ElementMeasure) => e.overflowsSelf || e.exceedsViewport || (e.lines ?? 0) >= 2;
    const ordered = [...s.elements.filter(flagged), ...s.elements.filter((e) => !flagged(e))];
    out.push("", "| 선택자 | 종류 | 글 | 너비×높이 | 줄 | 자기 넘침 | 화면 밖 | 스크롤 칸 |", "|---|---|---|---|---|---|---|---|");
    for (const e of ordered) {
      out.push(
        `| ${cell(e.selector)} | ${e.kind} | ${cell(e.text)} | ${e.width}×${e.height} | ${cell(e.lines)} | ${e.overflowsSelf ? "예" : ""} | ${e.exceedsViewport ? "예" : ""} | ${e.scrollContainer ? "예" : ""} |`,
      );
    }
    if (s.gaps.length > 0) {
      out.push("", "| 부모 | 앞 | 뒤 | 세로 간격 |", "|---|---|---|---|");
      for (const g of s.gaps) out.push(`| ${cell(g.parent)} | ${cell(g.before)} | ${cell(g.after)} | ${g.gap} |`);
    }
    out.push("");
  }
  return trimToBytes(out.join("\n"), maxBytes);
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
  return Array.isArray(parsed) ? parsed.filter(isFinding) : [];
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
      const e = s.elements.find((x) => x.selector === f.selector);
      if (e) {
        measured = `${e.width}×${e.height}px · ${e.lines ?? "—"}줄 · 자기 넘침 ${e.overflowsSelf ? "예" : "아니오"} · 화면 밖 ${e.exceedsViewport ? "예" : "아니오"}`;
      }
    }
    return { ...f, measured };
  });
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
  codexRaw: string;
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
    `- 산출물(스크린샷·measurements.json·Codex 원문): \`${input.artifactsDir}\``,
    "",
    "## 지적 후보",
    "",
  ];
  if (input.rows.length === 0) lines.push("지적 없음(또는 JSON을 읽지 못함 — 아래 원문 참고).");
  else {
    lines.push(
      "| # | 경로 | 폭 | 선택자 | 지표 | 지적 | 기대(SYSTEM.md) | 자동 대조 | 실측 확인 |",
      "|---|---|---|---|---|---|---|---|---|",
    );
    input.rows.forEach((r, i) => {
      lines.push(
        `| ${i + 1} | ${cell(r.route)} | ${r.width} | ${cell(r.selector)} | ${r.metric} | ${cell(r.claim)} | ${cell(r.expected)} | ${cell(r.measured)} |  |`,
      );
    });
  }
  lines.push(
    "",
    "## DOM 실측표",
    "",
    input.measurementsMd,
    "",
    "## Codex 원문",
    "",
    "````text",
    input.codexRaw.replace(/````/g, "'''"),
    "````",
    "",
  );
  return lines.join("\n");
}
