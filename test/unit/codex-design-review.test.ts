import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_SECTIONS,
  PROMPT_BUDGET_BYTES,
  VIEWPORTS,
  buildPrompt,
  codexArgs,
  countLines,
  crossCheck,
  measurementsToMarkdown,
  parseArgs,
  parseCodexFindings,
  renderReport,
  screenshotName,
  selectSystemSections,
  skipLine,
  type ElementMeasure,
  type Finding,
  type ScreenMeasure,
} from "@/scripts/codex-design-review/lib";

// Codex 디자인 검토(사용자 결정 2026-10-01): 실제 화면 4폭 + DOM 실측표 + 스크린샷을 codex exec에
// 넘기고, Codex 지적은 후보로만 기록한다(판정은 DOM 실측, CLAUDE.md §6). 이 파일은 순수 함수와
// 래퍼의 「자격 없으면 한 줄 남기고 건너뜀」 계약을 고정한다.

function el(partial: Partial<ElementMeasure>): ElementMeasure {
  return {
    selector: "button.primary",
    kind: "button",
    text: "저장",
    width: 80,
    height: 36,
    lines: 1,
    overflowsSelf: false,
    exceedsViewport: false,
    scrollContainer: false,
    ...partial,
  };
}

function screen(partial: Partial<ScreenMeasure>): ScreenMeasure {
  return {
    route: "/admin/people",
    width: 375,
    screenshot: "admin_people-375.png",
    scrollWidth: 375,
    clientWidth: 375,
    overflowX: false,
    elements: [],
    gaps: [],
    ...partial,
  };
}

describe("VIEWPORTS", () => {
  it("폰 375·320, PC 768·1280 순서다", () => {
    expect(VIEWPORTS.map((v) => v.width)).toEqual([375, 320, 768, 1280]);
  });
});

describe("countLines", () => {
  it("세로로 겹치는 텍스트 상자는 한 줄로 센다(글자 크기가 섞인 줄 포함)", () => {
    expect(countLines([[22, 37]])).toBe(1);
    expect(countLines([[10, 30], [14, 28]])).toBe(1);
  });

  it("겹치지 않는 줄은 따로 센다", () => {
    expect(countLines([[53, 70], [74, 91], [95, 112], [116, 133], [137, 154]])).toBe(5);
  });

  it("텍스트 상자가 없으면 null", () => {
    expect(countLines([])).toBeNull();
  });
});

describe("parseArgs", () => {
  it("경로를 모으고 --base 기본값은 origin/main, 섹션은 기본값 + 추가(중복 없이)", () => {
    const args = parseArgs(["/admin/people", "/admin", "--out", "r.md", "--sections", "6-10,3"]);
    expect(args.routes).toEqual(["/admin/people", "/admin"]);
    expect(args.out).toBe("r.md");
    expect(args.base).toBe("origin/main");
    expect(args.plans).toEqual([]);
    expect(args.sections).toEqual([...DEFAULT_SECTIONS, "6-10"]);
  });

  it("--plan은 반복할 수 있다", () => {
    const args = parseArgs(["/x", "--out", "r.md", "--plan", "a.md", "--plan", "b.md", "--base", "HEAD~1"]);
    expect(args.plans).toEqual(["a.md", "b.md"]);
    expect(args.base).toBe("HEAD~1");
  });

  it.each([
    [["/x", "--out", "r.md", "--base", "--output=/tmp/x"], "--base"],
    [["/x", "--out"], "--out"],
    [["/x", "--out", "r.md", "--plan"], "--plan"],
    [["--out", "r.md"], "경로"],
    [["admin/people", "--out", "r.md"], "/"],
    [["/admin/people"], "--out"],
  ])("잘못된 인자 %j는 오류다", (argv, message) => {
    expect(() => parseArgs(argv)).toThrow(message);
  });
});

describe("screenshotName", () => {
  it("경로를 파일 이름으로 바꾼다", () => {
    expect(screenshotName("/admin/people", 375)).toBe("admin_people-375.png");
    expect(screenshotName("/", 320)).toBe("root-320.png");
  });
});

describe("selectSystemSections", () => {
  const md = [
    "# 제목",
    "## 3. 간격",
    "간격 본문",
    "## 7. 컴포넌트",
    "컴포넌트 머리",
    "### 7-1. 버튼",
    "버튼 본문",
    "### 7-2. 입력",
    "입력 본문",
    "## 8. 카피",
    "카피 본문",
  ].join("\n");

  it("요청한 절만 문서 순서대로 고르고 다음 같은·상위 제목에서 멈춘다", () => {
    const out = selectSystemSections(md, ["7-1", "3", "99"]);
    expect(out).toContain("간격 본문");
    expect(out).toContain("버튼 본문");
    expect(out).not.toContain("입력 본문");
    expect(out).not.toContain("컴포넌트 머리");
    expect(out).not.toContain("카피 본문");
    expect(out.indexOf("간격 본문")).toBeLessThan(out.indexOf("버튼 본문"));
  });
});

describe("buildPrompt", () => {
  const images = [
    { route: "/admin/people", width: 375, file: "a-375.png" },
    { route: "/admin/people", width: 320, file: "a-320.png" },
  ];

  it("변경 글이 300KB여도 바이트 상한 안이고 잘림 표시가 있다", () => {
    const changeText = "가나다라마바사 변경된 줄\n".repeat(12_000);
    const prompt = buildPrompt({ mode: "diff", changeText, systemSections: "S", measurementsMd: "M", images });
    expect(Buffer.byteLength(prompt)).toBeLessThanOrEqual(PROMPT_BUDGET_BYTES);
    expect(prompt).toContain("…(잘림:");
  });

  it("diff 모드에서 변경이 비면 현재 화면 전체를 검토하라고 적는다", () => {
    const prompt = buildPrompt({ mode: "diff", changeText: "", systemSections: "S", measurementsMd: "M", images });
    expect(prompt).toContain("변경 없음 — 현재 화면 전체를 SYSTEM.md 기준으로 검토");
  });

  it("plan 모드는 글을 계획으로 표시하고 이미지를 -i 순서대로 적는다", () => {
    const prompt = buildPrompt({ mode: "plan", changeText: "계획 본문", systemSections: "S", measurementsMd: "M", images });
    expect(prompt).toContain("계획");
    expect(prompt).not.toContain("코드 변경(diff)");
    expect(prompt).toContain("1) /admin/people 375");
    expect(prompt).toContain("2) /admin/people 320");
  });
});

describe("codexArgs", () => {
  it("프롬프트가 첫 -i보다 앞이고 이미지마다 -i가 붙는다", () => {
    const args = codexArgs("PROMPT", ["a.png", "b.png"]);
    expect(args.slice(0, 4)).toEqual(["exec", "--skip-git-repo-check", "-s", "read-only"]);
    expect(args.indexOf("PROMPT")).toBeLessThan(args.indexOf("-i"));
    expect(args.slice(args.indexOf("PROMPT") + 1)).toEqual(["-i", "a.png", "-i", "b.png"]);
  });
});

describe("measurementsToMarkdown", () => {
  it("가로 넘침·요소 넘침·줄바꿈 버튼을 적고 상한 안에 든다", () => {
    const md = measurementsToMarkdown(
      [
        screen({
          width: 320,
          scrollWidth: 352,
          clientWidth: 320,
          overflowX: true,
          elements: [
            el({ selector: "td.name", kind: "cell", overflowsSelf: true }),
            el({ selector: "button.save", lines: 2, height: 56 }),
          ],
          gaps: [{ parent: "main", before: "h1", after: "table", gap: 24 }],
        }),
      ],
      10_000,
    );
    expect(md).toContain("352");
    expect(md).toContain("td.name");
    expect(md).toContain("button.save");
    expect(Buffer.byteLength(md)).toBeLessThanOrEqual(10_000);
  });
});

describe("parseCodexFindings", () => {
  const finding: Finding = {
    route: "/admin/people",
    width: 320,
    selector: "td.name",
    metric: "overflow",
    claim: "이름 칸이 넘친다",
    expected: "§7-3 칸 안에 맞춤",
  };

  it("마지막 ```json 배열을 고른다", () => {
    const stdout = `앞\n\`\`\`json\n[]\n\`\`\`\n중간\n\`\`\`json\n${JSON.stringify([finding])}\n\`\`\`\n요약`;
    expect(parseCodexFindings(stdout)).toEqual([finding]);
  });

  it.each(["```json\n{not json\n```", '```json\n{"a":1}\n```', "펜스 없음"])("잘못된 출력 %j는 []", (stdout) => {
    expect(parseCodexFindings(stdout)).toEqual([]);
  });

  it("형태가 틀린 항목(문자열 폭·모르는 지표·빠진 필드·객체 아님)은 버린다", () => {
    const items = [finding, { ...finding, width: "320" }, { ...finding, metric: "color" }, { route: "/x" }, "문자열", null];
    expect(parseCodexFindings(`\`\`\`json\n${JSON.stringify(items)}\n\`\`\``)).toEqual([finding]);
  });
});

describe("crossCheck", () => {
  const screens = [
    screen({
      width: 320,
      scrollWidth: 352,
      clientWidth: 320,
      overflowX: true,
      elements: [el({ selector: "button.save", height: 56, lines: 2 })],
    }),
  ];
  const base = { route: "/admin/people", width: 320, claim: "c", expected: "e" } as const;

  it("같은 경로·폭의 선택자 값을 붙인다", () => {
    const [row] = crossCheck([{ ...base, selector: "button.save", metric: "lines" }], screens);
    expect(row?.measured).toContain("56");
    expect(row?.measured).toContain("2줄");
  });

  it("overflowX는 페이지 scrollWidth/clientWidth를 붙인다", () => {
    const [row] = crossCheck([{ ...base, selector: "html", metric: "overflowX" }], screens);
    expect(row?.measured).toContain("352");
    expect(row?.measured).toContain("320");
  });

  it("없는 선택자·시각 지적은 실측 필요로 둔다", () => {
    const rows = crossCheck(
      [
        { ...base, selector: "div.nope", metric: "height" },
        { ...base, selector: "button.save", metric: "visual" },
      ],
      screens,
    );
    expect(rows[0]?.measured).toBe("측정표에 없음 — 실측 필요");
    expect(rows[1]?.measured).toBe("시각 지적 — 실측 필요");
  });
});

describe("renderReport · skipLine", () => {
  it("후보 원칙·대조 열·상태 줄·산출물 경로를 담는다", () => {
    const report = renderReport({
      mode: "diff",
      base: "origin/main",
      plans: [],
      artifactsDir: "test-results/codex-design-review/x",
      codexStatus: "Codex 실행: 완료(exit 0)",
      rows: [
        {
          route: "/admin/people",
          width: 320,
          selector: "td.name",
          metric: "overflow",
          claim: "넘침",
          expected: "맞춤",
          measured: "측정표에 없음 — 실측 필요",
        },
      ],
      measurementsMd: "MEASURE",
      codexRaw: "RAW",
    });
    expect(report).toContain("Codex 지적은 후보다");
    expect(report).toContain("| 자동 대조 | 실측 확인 |");
    expect(report).toMatch(/\| 측정표에 없음 — 실측 필요 \|\s*\|\n/);
    expect(report).toContain("Codex 실행: 완료(exit 0)");
    expect(report).toContain("test-results/codex-design-review/x");
  });

  it("skipLine은 한 줄 접두어를 붙인다", () => {
    expect(skipLine("사유")).toBe("Codex 디자인 검토 건너뜀: 사유");
  });
});

describe("scripts/codex-design-review.sh 건너뜀 계약", () => {
  const SCRIPT = resolve(process.cwd(), "scripts/codex-design-review.sh");

  function run(args: string[], stubCodex?: string) {
    const dir = mkdtempSync(join(tmpdir(), "codex-dr-"));
    if (stubCodex !== undefined) {
      writeFileSync(join(dir, "codex"), `#!/bin/sh\n${stubCodex}\n`);
      chmodSync(join(dir, "codex"), 0o755);
    }
    const out = join(dir, "report.md");
    const result = spawnSync("/bin/bash", [SCRIPT, ...args.map((a) => (a === "OUT" ? out : a))], {
      env: { ...process.env, PATH: `${dir}:/usr/bin:/bin`, HOME: dir },
      encoding: "utf8",
    });
    return { result, out };
  }

  it("codex CLI가 없으면 한 줄 남기고 0으로 끝난다", () => {
    const { result, out } = run(["/admin/people", "--out", "OUT"]);
    expect(result.status).toBe(0);
    const text = readFileSync(out, "utf8");
    expect(text).toMatch(/^Codex 디자인 검토 건너뜀: .+\n?$/);
    expect(text.trim().split("\n")).toHaveLength(1);
  });

  it("ChatGPT 로그인이 없으면 한 줄 남기고 0으로 끝난다", () => {
    const { result, out } = run(["/admin/people", "--out", "OUT"], 'echo "Not logged in"');
    expect(result.status).toBe(0);
    const text = readFileSync(out, "utf8");
    expect(text.trim().split("\n")).toHaveLength(1);
    expect(text).toContain("로그인");
  });

  it("--out이 없으면 2로 끝난다", () => {
    const { result } = run(["/admin/people"]);
    expect(result.status).toBe(2);
  });
});
