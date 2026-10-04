import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import stylelint from "stylelint";
import { describe, expect, it } from "vitest";
import config, {
  CSS_LEGACY_MARKER,
  collectLintCssFiles,
  collectMarkedCssFiles,
  createConfig,
} from "../../stylelint.config.mjs";

// D-20 규칙(색·서체·radius) + 04.6 스킨 A 새 규칙(날 px · 척도 밖 값 · 원시 토큰 · 직접 그리기)의 단위 테스트.
// test/unit/eslint-rules/*.test.ts 전례(규칙에도 테스트를 붙인다)를 stylelint의 standalone API로 적용한다.
// 정규식은 토큰 「이름」만 보므로 토큰 값과 무관하다.

const ROOT = process.cwd();
const UI_PATH = "ui/x/X.module.css";
const APP_PATH = "app/(app)/projects/[id]/x.module.css";
const APP_C_PATH = "app/c/[token]/x.module.css";
const PRINT_PATH = "app/print/x.module.css";

async function lintAt(
  code: string,
  codeFilename: string = UI_PATH,
  cfg: unknown = createConfig([]),
) {
  const { results } = await stylelint.lint({
    code,
    config: cfg as never,
    codeFilename: resolve(ROOT, codeFilename),
  });
  const [result] = results;
  if (!result) throw new Error("stylelint.lint()가 결과를 반환하지 않았다");
  return result.warnings;
}

const lint = (code: string) => lintAt(code);

describe("stylelint: 색 리터럴 금지", () => {
  it("색 리터럴(#fff)을 쓴 선언은 경고가 1개 이상이다", async () => {
    expect((await lint(".x { color: #fff; }")).length).toBeGreaterThan(0);
  });

  it("같은 자리에 역할 토큰(var(--text-strong))을 쓰면 경고가 0개다", async () => {
    expect(await lint(".x { color: var(--text-strong); }")).toHaveLength(0);
  });

  it("box-shadow의 inset 역할 토큰은 경고가 0개다", async () => {
    expect(await lint(".x { box-shadow: var(--inset-tab); }")).toHaveLength(0);
  });

  it("box-shadow 안에 색 리터럴이 있으면 경고가 1개 이상이다", async () => {
    expect((await lint(".x { box-shadow: inset 0 -2px 0 #123456; }")).length).toBeGreaterThan(0);
  });

  it("날 hex는 표시 파일에서도 경고다(color-no-hex는 표시와 무관 — T-04.6-03)", async () => {
    const cfg = createConfig([APP_PATH]);
    expect((await lintAt(".x { color: #fff; }", APP_PATH, cfg)).length).toBeGreaterThan(0);
  });
});

describe("stylelint: 새 규칙 — 척도·토큰 밖 값은 경고", () => {
  it.each([
    ["radius 리터럴", ".x { border-radius: 4px; }"],
    ["옛 단일 radius 토큰", ".x { border-radius: var(--radius); }"], // 옛 D-20 가드 입력
    ["날 px 여백", ".x { margin: 6px; }"],
    ["원시 토큰 gap", ".x { gap: var(--g-100); }"],
    ["원시 토큰 색", ".x { color: var(--n-900); }"],
    ["날 굵기", ".x { font-weight: 600; }"],
    ["날 행간", ".x { line-height: 1.5; }"],
    ["날 z-index", ".x { z-index: 3; }"],
    ["날 그림자", ".x { box-shadow: 0 1px 2px black; }"],
    ["옛 글자 크기 토큰", ".x { font-size: var(--fs-md); }"], // 옛 D-20 가드 입력
    ["미디어 폭 밖 날 px", ".x { width: 12px; }"],
    ["척도 밖 calc", ".x { padding: calc(var(--s-4) + 3px); }"],
    ["font-variant-numeric", ".x { font-variant-numeric: tabular-nums; }"],
  ])("%s는 경고가 1개 이상이다", async (_name, code) => {
    expect((await lint(code)).length).toBeGreaterThan(0);
  });

  it.each([
    ["간격 토큰 두 개", ".x { padding: var(--s-2) var(--s-4); }"],
    ["음수 calc", ".x { margin: calc(var(--s-2) * -1); }"],
    ["0 · auto", ".x { margin: 0 auto; }"],
    ["radius 역할 토큰", ".x { border-radius: var(--radius-surface); }"],
    ["radius 네 모서리", ".x { border-radius: var(--radius-panel) 0 0 var(--radius-panel); }"],
    ["역할 간격 토큰", ".x { padding-inline: var(--pad-page); gap: var(--field-gap); }"],
    ["굵기 토큰", ".x { font-weight: var(--fw-medium); }"],
    ["행간 토큰", ".x { line-height: var(--lh-body); }"],
    ["z-index 토큰", ".x { z-index: var(--z-modal); }"],
    ["그림자 두 개", ".x { box-shadow: var(--shadow-surface), var(--inset-tab); }"],
    ["그림자 none", ".x { box-shadow: none; }"],
    ["미디어 폭 조건의 px", "@media (max-width: 699.98px) { .x { margin: 0; } }"],
    ["글자 크기 토큰", ".x { font-size: var(--text-title); }"],
  ])("%s는 경고가 0개다", async (_name, code) => {
    expect(await lint(code)).toHaveLength(0);
  });
});

describe("stylelint: 서체 리터럴 금지", () => {
  it("서체 리터럴은 경고가 1개 이상이다", async () => {
    expect((await lint(".x { font-family: Arial, sans-serif; }")).length).toBeGreaterThan(0);
  });

  it("--font-sans 참조는 경고가 0개다", async () => {
    expect(await lint(".x { font-family: var(--font-sans); }")).toHaveLength(0);
  });
});

describe("stylelint: 실물 흰색 리터럴 사례(Pitfall 1)", () => {
  it("실물에서 상시 쓰이는 흰색 리터럴이 걸린다", async () => {
    expect((await lint(".mark { color: #fff; }")).length).toBeGreaterThan(0);
  });

  it("같은 계산값의 역할 토큰 참조는 통과한다", async () => {
    expect(await lint(".mark { color: var(--text-on-accent); }")).toHaveLength(0);
  });
});

// WR-08: D-20 가드에 뚫린 구멍 — 이름 있는 색, 최신 색 함수, font 축약
describe("stylelint: WR-08 — 이름 있는 색상 리터럴 금지", () => {
  it("named color(white)를 쓴 선언은 경고가 1개 이상이다", async () => {
    expect((await lint(".probe { color: white; }")).length).toBeGreaterThan(0);
  });

  it("named color(red)를 배경에 쓴 선언은 경고가 1개 이상이다", async () => {
    expect((await lint(".probe { background: red; }")).length).toBeGreaterThan(0);
  });

  it("currentColor는 named-color 금지에 걸리지 않는다", async () => {
    expect(await lint(".probe { color: currentColor; }")).toHaveLength(0);
  });

  it("inherit는 named-color 금지에 걸리지 않는다", async () => {
    expect(await lint(".probe { color: inherit; }")).toHaveLength(0);
  });
});

describe("stylelint: WR-08 — 최신 색상 함수(oklch 등) 금지", () => {
  it("oklch() 색상 함수는 경고가 1개 이상이다", async () => {
    expect((await lint(".probe { color: oklch(50% 0.1 120); }")).length).toBeGreaterThan(0);
  });

  it("calc()는 색상 함수 금지에 걸리지 않는다(간격 토큰과 쓴다)", async () => {
    expect(await lint(".probe { margin: calc(var(--s-1) * 2); }")).toHaveLength(0);
  });
});

describe("stylelint: WR-08 — font 축약 속성 금지", () => {
  it("font 축약(font: 12px Arial)은 경고가 1개 이상이다", async () => {
    expect((await lint(".probe { font: 12px Arial; }")).length).toBeGreaterThan(0);
  });
});

describe("stylelint: WR-08 — 리뷰가 확인한 전체 프로브 문자열", () => {
  it("리뷰의 프로브 선언 전체가 최소 3개(색·radius·font) 이상 경고를 낸다", async () => {
    const warnings = await lint(
      ".probe{color:white;background:red;border-radius:9px;font:12px Arial}",
    );
    expect(warnings.length).toBeGreaterThanOrEqual(3);
  });
});

describe("stylelint: 경로 override — 글자 크기(R12 · Q7 · SYSTEM §6-5)", () => {
  const TITLE = ".x { font-size: var(--text-title); }";
  const PROSE = ".x { font-size: var(--text-prose); }";

  it("ui/**은 --text-* 전부를 쓸 수 있다", async () => {
    expect(await lintAt(TITLE, UI_PATH)).toHaveLength(0);
  });

  it("app/(app)/projects/[id]/**(괄호·대괄호 경로)는 --text-title을 쓰면 경고다", async () => {
    expect((await lintAt(TITLE, APP_PATH)).length).toBeGreaterThan(0);
  });

  it("app/**은 --text-body|aux|tag만 쓸 수 있다", async () => {
    for (const name of ["body", "aux", "tag"]) {
      expect(await lintAt(`.x { font-size: var(--text-${name}); }`, APP_PATH)).toHaveLength(0);
    }
    expect((await lintAt(PROSE, APP_PATH)).length).toBeGreaterThan(0);
  });

  it("셸 없는 외부 수령자 app/c/**는 --text-title·--text-prose를 쓸 수 있다", async () => {
    expect(await lintAt(TITLE, APP_C_PATH)).toHaveLength(0);
    expect(await lintAt(PROSE, APP_C_PATH)).toHaveLength(0);
  });

  it("--text-prose는 app/(app)에서는 경고 · ui/input에서는 통과한다(Q7)", async () => {
    expect((await lintAt(PROSE, "app/(app)/x.module.css")).length).toBeGreaterThan(0);
    expect(await lintAt(PROSE, "ui/input/x.module.css")).toHaveLength(0);
  });

  it("app/c/**에서도 날 여백은 경고다(나머지 새 규칙은 그대로)", async () => {
    expect((await lintAt(".x { margin: 6px; }", APP_C_PATH)).length).toBeGreaterThan(0);
  });
});

describe("stylelint: 경로 override — app/c/** 두 꼴(Q10 — #88 intake.module.css 문자열 그대로)", () => {
  const TOUCH_VAR = ".x { margin-block: min(0px, calc((var(--lh-body) * 1em - var(--touch-min)) / 2)); }";
  const TOUCH_LH = ".x { margin-block: min(0px, calc((1lh - var(--touch-min)) / 2)); }";
  const SAFE = ".x { padding: var(--s-4) 0 calc(var(--s-4) + env(safe-area-inset-bottom, 0px)); }";

  it.each([
    ["min(0px, … var(--touch-min) …) em 꼴", TOUCH_VAR],
    ["min(0px, … var(--touch-min) …) lh 꼴", TOUCH_LH],
    ["calc(var(--s-4) + env(safe-area-inset-bottom, 0px))", SAFE],
  ])("%s는 app/c/**에서 통과한다", async (_name, code) => {
    expect(await lintAt(code, APP_C_PATH)).toHaveLength(0);
  });

  it.each([
    ["margin-block: 6px", ".x { margin-block: 6px; }"],
    ["margin-block: min(0px, 6px)", ".x { margin-block: min(0px, 6px); }"],
    ["calc(var(--s-4) + 3px)", ".x { padding: calc(var(--s-4) + 3px); }"],
  ])("%s는 app/c/**에서도 경고다", async (_name, code) => {
    expect((await lintAt(code, APP_C_PATH)).length).toBeGreaterThan(0);
  });

  it.each([
    ["min(0px, …)", TOUCH_VAR],
    ["env(…, 0px)", SAFE],
  ])("같은 %s 선언이 app/(app)/**에서는 경고다", async (_name, code) => {
    expect((await lintAt(code, "app/(app)/x.module.css")).length).toBeGreaterThan(0);
  });
});

describe("stylelint: 경로 override — font-variant-numeric(Q9 · Q10)", () => {
  const NUM = ".x { font-variant-numeric: tabular-nums; }";

  it.each([
    "ui/num/Num.module.css",
    "ui/input/TextField.module.css",
    PRINT_PATH,
  ])("%s에서는 통과한다", async (path) => {
    expect(await lintAt(NUM, path)).toHaveLength(0);
  });

  it.each([
    "app/(app)/x.module.css",
    APP_C_PATH,
    "ui/table/x.module.css",
  ])("%s에서는 경고다", async (path) => {
    expect((await lintAt(NUM, path)).length).toBeGreaterThan(0);
  });
});

describe("stylelint: 경로 override — app/print/** 인쇄 영구 예외(Q9)", () => {
  it("날 px·mm·간격·글자 크기는 통과한다", async () => {
    expect(
      await lintAt(
        ".x { padding: 7px 0; width: 210mm; margin: 3px; font-size: 9pt; border: 1px solid var(--print-line); }",
        PRINT_PATH,
      ),
    ).toHaveLength(0);
  });

  it("날 색은 경고다", async () => {
    expect((await lintAt(".x { color: #000; }", PRINT_PATH)).length).toBeGreaterThan(0);
  });
});

describe("stylelint: 표시 파일 옛 D-20 가드(R3 — createConfig(markedFiles))", () => {
  const cfg = createConfig([APP_PATH]);
  const marked = (code: string) => lintAt(code, APP_PATH, cfg);

  it.each([
    ["font-family: Arial", ".x { font-family: Arial; }"],
    ["border-radius: 4px", ".x { border-radius: 4px; }"],
    ["font-size: 13px", ".x { font-size: 13px; }"],
    ["color: #fff", ".x { color: #fff; }"],
  ])("표시 파일에서 %s는 경고다", async (_name, code) => {
    expect((await marked(code)).length).toBeGreaterThan(0);
  });

  it.each([
    ["margin: 6px", ".x { margin: 6px; }"],
    ["font-size: var(--fs-md)", ".x { font-size: var(--fs-md); }"], // 옛 D-20 가드 입력
    ["border-radius: var(--radius)", ".x { border-radius: var(--radius); }"], // 옛 D-20 가드 입력
    ["font-variant-numeric", ".x { font-variant-numeric: tabular-nums; }"],
  ])("표시 파일에서 %s는 통과한다", async (_name, code) => {
    expect(await marked(code)).toHaveLength(0);
  });

  it("표시 목록 밖 경로에는 옛 override가 걸리지 않는다", async () => {
    const other = "app/(app)/projects/projects.module.css";
    expect((await lintAt(".x { margin: 6px; }", other, cfg)).length).toBeGreaterThan(0);
  });

  it("표시 목록의 괄호·대괄호 경로는 정확히 그 파일만 맞춘다(T-04.6-08)", async () => {
    const sibling = "app/(app)/projects/[id]/y.module.css";
    expect((await lintAt(".x { margin: 6px; }", sibling, cfg)).length).toBeGreaterThan(0);
  });
});

describe("stylelint: 표시 훑기 — collectMarkedCssFiles", () => {
  it("lint 범위 CSS 중 첫 줄이 표시인 파일만 목록에 넣는다", () => {
    const dir = mkdtempSync(join(tmpdir(), "stylelint-marks-"));
    mkdirSync(join(dir, "ui/a"), { recursive: true });
    mkdirSync(join(dir, "app/(app)/b"), { recursive: true });
    mkdirSync(join(dir, "docs"), { recursive: true });
    writeFileSync(join(dir, "ui/a/A.module.css"), `${CSS_LEGACY_MARKER}\n.a { margin: 6px; }\n`);
    writeFileSync(join(dir, "ui/a/B.module.css"), `.a { margin: 0; }\n${CSS_LEGACY_MARKER}\n`);
    writeFileSync(join(dir, "app/(app)/b/b.module.css"), `${CSS_LEGACY_MARKER}\n.b {}\n`);
    writeFileSync(join(dir, "app/globals.css"), `.g {}\n`);
    writeFileSync(join(dir, "docs/tokens.css"), `${CSS_LEGACY_MARKER}\n`);
    expect(collectMarkedCssFiles(dir)).toEqual(["app/(app)/b/b.module.css", "ui/a/A.module.css"]);
    expect(collectLintCssFiles(dir)).toEqual([
      "app/(app)/b/b.module.css",
      "app/globals.css",
      "ui/a/A.module.css",
      "ui/a/B.module.css",
    ]);
  });
});

// ── 래칫 ──────────────────────────────────────────────────────────────────
// 표시가 있는 파일은 표시를 떼면 새 규칙 경고가 ≥ 1이어야 한다(0이면 「표시를 지워라」).
// 표시가 없는 파일은 기본 설정으로 경고 0이어야 하고, 표시 파일은 기본 설정(옛 D-20 override)으로 경고 0이다.
describe("stylelint: 이관 전 표시 래칫(공통 §3)", () => {
  const files = collectLintCssFiles(ROOT);
  const markedFiles = collectMarkedCssFiles(ROOT);

  it("훑은 CSS 파일 수가 40 이상이다(공허 방지)", () => {
    expect(files.length).toBeGreaterThanOrEqual(40);
  });

  // SC 1 끝 상태 — CSS 이관 전 표시는 저장소에 하나도 없다(04.6-28). 다시 생기면 이 단언이 빨개진다.
  it("저장소에 CSS 이관 전 표시 파일이 0개다", () => {
    expect(markedFiles, `표시가 남은 파일: ${markedFiles.join(", ")}`).toEqual([]);
  });

  it("기본 설정에 표시 파일용 옛 D-20 override가 붙지 않는다 — overrides 수가 createConfig([])와 같다(R3)", () => {
    expect(config.overrides).toHaveLength(createConfig([]).overrides.length);
  });

  it("표시 문구는 공통 §3 형식 하나뿐이다", () => {
    for (const file of files) {
      const first = readFileSync(resolve(ROOT, file), "utf8").split("\n")[0] ?? "";
      if (first.includes("이관 전")) {
        expect(first, file).toBe(CSS_LEGACY_MARKER);
      }
    }
  });

  it("기본 설정으로 lint 범위 전체가 경고 0이다(표시 없는 파일은 새 규칙, 표시 파일은 옛 D-20 규칙)", async () => {
    const offenders: string[] = [];
    for (const file of files) {
      const code = readFileSync(resolve(ROOT, file), "utf8");
      const warnings = await lintAt(code, file, config);
      if (warnings.length > 0) offenders.push(`${file}: ${warnings[0]?.text}`);
    }
    expect(offenders).toEqual([]);
  });

  it("표시를 떼면 새 규칙 경고가 ≥ 1이다 — 0이면 표시를 지워라", async () => {
    const stale: string[] = [];
    for (const file of markedFiles) {
      const stripped = readFileSync(resolve(ROOT, file), "utf8").split("\n").slice(1).join("\n");
      const warnings = await lintAt(stripped, file, createConfig([]));
      if (warnings.length === 0) stale.push(file);
    }
    expect(stale, `위반이 없는데 표시가 남은 파일 — 표시를 떼라: ${stale.join(", ")}`).toEqual([]);
  });
});
