import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, linkSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
  DEFAULT_SECTIONS,
  PROMPT_BUDGET_BYTES,
  VIEWPORTS,
  buildPrompt,
  codexArgs,
  codexEnv,
  assertRealPaths,
  countLines,
  crossCheck,
  envFileSecrets,
  fillRoute,
  measurementsToMarkdown,
  parseArgs,
  parseCodexFindings,
  redactSecrets,
  renderReport,
  screenshotName,
  selectSystemSections,
  skipLine,
  writeReport,
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
    omitted: 0,
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
    const args = parseArgs(["/admin/people", "/admin", "--out", ".planning/r.md", "--sections", "6-10,3"]);
    expect(args.routes).toEqual(["/admin/people", "/admin"]);
    expect(args.out).toBe(".planning/r.md");
    expect(args.base).toBe("origin/main");
    expect(args.plans).toEqual([]);
    expect(args.sections).toEqual([...DEFAULT_SECTIONS, "6-10"]);
  });

  it("--plan은 반복할 수 있다", () => {
    const args = parseArgs([
      "/x",
      "--out",
      "test-results/r.md",
      "--plan",
      ".planning/p/a-PLAN.md",
      "--plan",
      "docs/design/b.md",
      "--base",
      "HEAD~1",
    ]);
    expect(args.plans).toEqual([".planning/p/a-PLAN.md", "docs/design/b.md"]);
    expect(args.base).toBe("HEAD~1");
  });

  it.each([
    [["/x", "--out", ".planning/r.md", "--base", "--output=/tmp/x"], "--base"],
    [["/x", "--out"], "--out"],
    [["/x", "--out", ".planning/r.md", "--plan"], "--plan"],
    [["--out", ".planning/r.md"], "경로"],
    [["admin/people", "--out", ".planning/r.md"], "/"],
    [["/admin/people"], "--out"],
    // 보고서는 .planning/·test-results/의 .md에만 쓴다(보호 파일 덮어쓰기 방지).
    [["/x", "--out", "CLAUDE.md"], "--out"],
    [["/x", "--out", ".claude/settings.json"], "--out"],
    [["/x", "--out", ".planning/../CLAUDE.md"], "--out"],
    [["/x", "--out", ".planning/r.txt"], "--out"],
    // 계획은 저장소 .planning/·docs/의 .md만 Codex에 보낸다(비밀 파일 전송 방지).
    [["/x", "--out", ".planning/r.md", "--plan", ".env.local"], "--plan"],
    [["/x", "--out", ".planning/r.md", "--plan", "/root/.codex/auth.json"], "--plan"],
    [["/x", "--out", ".planning/r.md", "--plan", "docs/../.env.md"], "--plan"],
    // 경로는 앱 출처 안이어야 한다 — //host·역슬래시는 다른 호스트로 풀린다.
    [["//169.254.169.254/latest/meta-data/", "--out", ".planning/r.md"], "경로"],
    [["/\\attacker.example/x", "--out", ".planning/r.md"], "경로"],
  ])("잘못된 인자 %j는 오류다", (argv, message) => {
    expect(() => parseArgs(argv)).toThrow(message);
  });
});

describe("assertRealPaths", () => {
  function repo() {
    const root = mkdtempSync(join(tmpdir(), "codex-dr-root-"));
    mkdirSync(join(root, ".planning"));
    mkdirSync(join(root, "docs"));
    writeFileSync(join(root, "CLAUDE.md"), "x");
    writeFileSync(join(root, "docs", "plan.md"), "p");
    return root;
  }

  it("실제 파일·없는 보고서 경로는 통과한다", () => {
    const root = repo();
    expect(() => assertRealPaths({ out: ".planning/new.md", plans: ["docs/plan.md"] }, root)).not.toThrow();
  });

  it("--out이 심볼릭 링크면 거부한다(보호 파일 덮어쓰기)", () => {
    const root = repo();
    symlinkSync(join(root, "CLAUDE.md"), join(root, ".planning", "r.md"));
    expect(() => assertRealPaths({ out: ".planning/r.md", plans: [] }, root)).toThrow("--out");
  });

  it("--out 상위 폴더가 링크로 저장소 밖을 가리키면 거부한다", () => {
    const root = repo();
    const outside = mkdtempSync(join(tmpdir(), "codex-dr-outside-"));
    symlinkSync(outside, join(root, ".planning", "esc"));
    expect(() => assertRealPaths({ out: ".planning/esc/r.md", plans: [] }, root)).toThrow("--out");
  });

  it("이미 있는 일반 보고서(링크 수 1)는 다시 써도 통과한다", () => {
    const root = repo();
    writeFileSync(join(root, ".planning", "r.md"), "old");
    expect(() => assertRealPaths({ out: ".planning/r.md", plans: [] }, root)).not.toThrow();
  });

  it("--out이 하드링크(링크 수 > 1)면 거부한다(보호 파일 덮어쓰기)", () => {
    const root = repo();
    linkSync(join(root, "CLAUDE.md"), join(root, ".planning", "r.md"));
    expect(() => assertRealPaths({ out: ".planning/r.md", plans: [] }, root)).toThrow("--out");
  });

  it("--plan이 심볼릭 링크면 거부한다(비밀 파일 전송)", () => {
    const root = repo();
    const secret = join(mkdtempSync(join(tmpdir(), "codex-dr-secret-")), "auth.json");
    writeFileSync(secret, "{}");
    symlinkSync(secret, join(root, "docs", "leak.md"));
    expect(() => assertRealPaths({ out: ".planning/r.md", plans: ["docs/leak.md"] }, root)).toThrow("--plan");
  });
});

describe("writeReport", () => {
  // 검사(assertRealPaths)와 쓰기 사이(캡처·codex로 수십 분)에 링크가 생겨도 링크 대상을 덮지 않는다.
  function dirWith(protectedText: string) {
    const dir = mkdtempSync(join(tmpdir(), "codex-dr-write-"));
    writeFileSync(join(dir, "CLAUDE.md"), protectedText);
    return dir;
  }

  it("보고서 자리에 심볼릭 링크가 생겨도 대상 대신 링크 자리를 바꾼다", () => {
    const dir = dirWith("원본");
    symlinkSync(join(dir, "CLAUDE.md"), join(dir, "r.md"));
    writeReport(join(dir, "r.md"), "보고서");
    expect(readFileSync(join(dir, "CLAUDE.md"), "utf8")).toBe("원본");
    expect(readFileSync(join(dir, "r.md"), "utf8")).toBe("보고서");
  });

  it("보고서 자리에 하드링크가 생겨도 공유 내용을 덮지 않는다", () => {
    const dir = dirWith("원본");
    linkSync(join(dir, "CLAUDE.md"), join(dir, "r.md"));
    writeReport(join(dir, "r.md"), "보고서");
    expect(readFileSync(join(dir, "CLAUDE.md"), "utf8")).toBe("원본");
    expect(readFileSync(join(dir, "r.md"), "utf8")).toBe("보고서");
  });

  it("상위 폴더가 없으면 만들고 쓴다", () => {
    const dir = dirWith("x");
    writeReport(join(dir, "a", "b", "r.md"), "보고서");
    expect(readFileSync(join(dir, "a", "b", "r.md"), "utf8")).toBe("보고서");
  });
});

describe("fillRoute · envFileSecrets", () => {
  it("{adminId} 자리를 캡처 때 만든 관리자 id로 바꾼다", () => {
    expect(fillRoute("/admin/people/{adminId}", { adminId: "u-1" })).toBe("/admin/people/u-1");
    expect(fillRoute("/admin/people", { adminId: "u-1" })).toBe("/admin/people");
  });

  it(".env 파일의 값(8자 이상)을 가릴 비밀로 모은다", () => {
    const secrets = envFileSecrets(['BETTER_AUTH_SECRET="a1b2c3d4e5f6"\n# 주석\nAPP_ENV=local\nDATABASE_URL=postgres://erp:erp@127.0.0.1:5432/erp']);
    expect(secrets).toContain("a1b2c3d4e5f6");
    expect(secrets).toContain("postgres://erp:erp@127.0.0.1:5432/erp");
    expect(secrets).not.toContain("local");
  });

  it("dotenv 문법대로 인라인 주석을 떼고 따옴표 안 #은 값으로 둔다", () => {
    const secrets = envFileSecrets(["SECRET=abcdefgh # local credential\nQUOTED='p#ss word 99' # 주석\nexport TOKEN=\"x1y2z3w4\"#c"]);
    expect(secrets).toContain("abcdefgh");
    expect(secrets).toContain("p#ss word 99");
    expect(secrets).toContain("x1y2z3w4");
    expect(secrets.some((v) => v.includes("credential") || v.includes("주석"))).toBe(false);
  });

  it("따옴표 없는 값에 붙은 #도 dotenv처럼 그 앞에서 자른다", () => {
    expect(envFileSecrets(["SECRET=longsecretvalue#note"])).toEqual(["longsecretvalue"]);
  });

  it("큰따옴표 안 이스케이프된 따옴표를 값 끝으로 보지 않는다", () => {
    expect(envFileSecrets(['A="abc\\"defghijklmn"'])).toEqual(['abc\\"defghijklmn']);
  });

  it("여러 줄 따옴표 값(개인 키)은 전체와 줄마다 가린다", () => {
    const secrets = envFileSecrets(['PK="-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0B\n-----END PRIVATE KEY-----"\nNEXT=abcdefghij']);
    expect(secrets).toContain("MIIEvQIBADANBgkqhkiG9w0B");
    expect(secrets.some((v) => v.includes("BEGIN") && v.includes("MIIEvQIBADANBgkqhkiG9w0B"))).toBe(true);
    expect(secrets).toContain("abcdefghij");
  });
});

describe("screenshotName", () => {
  it("경로를 읽을 수 있는 이름 + 경로 해시로 바꾼다", () => {
    expect(screenshotName("/admin/people", 375)).toMatch(/^admin_people-[0-9a-f]{8}-375\.png$/);
    expect(screenshotName("/", 320)).toMatch(/^root-[0-9a-f]{8}-320\.png$/);
  });

  it("긴 경로도 파일 이름이 255바이트 안이다(읽기용 부분만 줄이고 해시는 유지)", () => {
    const long = `/projects?filter=${"a".repeat(300)}`;
    const name = screenshotName(long, 1280);
    expect(Buffer.byteLength(name)).toBeLessThanOrEqual(255);
    expect(name).not.toBe(screenshotName(`/projects?filter=${"a".repeat(299)}b`, 1280));
  });

  it("문장부호만 다른 경로도 이름이 겹치지 않는다", () => {
    expect(screenshotName("/projects?new=1&editId=x", 375)).not.toBe(screenshotName("/projects?new=1/editId=x", 375));
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

  it("상한보다 긴 한 줄도 앞부분은 남긴다", () => {
    const changeText = "가".repeat(60_000);
    const prompt = buildPrompt({ mode: "diff", changeText, systemSections: "S", measurementsMd: "M", images });
    expect(Buffer.byteLength(prompt)).toBeLessThanOrEqual(PROMPT_BUDGET_BYTES);
    expect(prompt).toContain("가".repeat(1000));
    expect(prompt).not.toContain("\uFFFD");
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
    expect(args.slice(0, 5)).toEqual(["exec", "--ephemeral", "--skip-git-repo-check", "-s", "read-only"]);
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

  it("상한을 폭마다 나눠 모든 폭의 머리와 넘침 줄이 남고, 생략된 요소 수를 적는다", () => {
    const many = Array.from({ length: 300 }, (_, i) => el({ selector: `td.c${i}`, kind: "cell" }));
    const screens = [375, 320, 768, 1280].map((width) =>
      screen({ width, omitted: 7, elements: [...many, el({ selector: `button.w${width}`, overflowsSelf: true })] }),
    );
    const md = measurementsToMarkdown(screens, 8_000);
    expect(Buffer.byteLength(md)).toBeLessThanOrEqual(8_000);
    for (const width of [375, 320, 768, 1280]) {
      expect(md).toContain(`· ${width}px`);
      expect(md).toContain(`button.w${width}`);
    }
    expect(md).toContain("측정 생략 7개");
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

  it("형태가 틀린 항목(모르는 지표·빠진 필드·객체 아님)은 버리고 숫자 문자열 폭은 숫자로 읽는다", () => {
    const items = [finding, { ...finding, width: "320" }, { ...finding, metric: "color" }, { route: "/x" }, "문자열", null];
    expect(parseCodexFindings(`\`\`\`json\n${JSON.stringify(items)}\n\`\`\``)).toEqual([finding, finding]);
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

  it("같은 선택자가 여럿이면 첫 값을 붙이지 않고 모호하다고 적는다", () => {
    const twice = [screen({ width: 320, elements: [el({ selector: "td > button" }), el({ selector: "td > button" })] })];
    const [row] = crossCheck([{ ...base, selector: "td > button", metric: "height" }], twice);
    expect(row?.measured).toBe("모호(2개 일치) — 실측 필요");
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
      codexOutputPath: "test-results/codex-design-review/x/codex-output.md",
    });
    expect(report).toContain("Codex 지적은 후보다");
    expect(report).toContain("| 자동 대조 | 실측 확인 |");
    expect(report).toMatch(/\| 측정표에 없음 — 실측 필요 \|\s*\|\n/);
    expect(report).toContain("Codex 실행: 완료(exit 0)");
    expect(report).toContain("test-results/codex-design-review/x");
    expect(report).toContain("test-results/codex-design-review/x/codex-output.md");
  });

  it("Codex 문자열의 마크다운·HTML을 무력화하고 길이를 자른다", () => {
    const report = renderReport({
      mode: "diff",
      base: "origin/main",
      plans: [],
      artifactsDir: "d",
      codexStatus: "s",
      rows: [
        {
          route: "/x",
          width: 320,
          selector: "td",
          metric: "visual",
          claim: `![b](https://evil.example/?d=1) <img src=x> [l](http://a) \`c\`\r${"가".repeat(500)}`,
          expected: "e",
          measured: "m",
        },
      ],
      measurementsMd: "",
      codexOutputPath: "d/codex-output.md",
    });
    expect(report).not.toContain("![");
    expect(report).not.toContain("<img");
    expect(report).not.toContain("](http");
    expect(report).not.toContain("\r");
    expect(report).not.toContain("가".repeat(400));
  });

  it("skipLine은 한 줄 접두어를 붙인다", () => {
    expect(skipLine("사유")).toBe("Codex 디자인 검토 건너뜀: 사유");
  });
});

describe("redactSecrets · codexEnv", () => {
  it("비밀 값 그대로·JWT·refresh 토큰 모양을 가린다", () => {
    const secret = "QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVo=";
    const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.c2lnbmF0dXJlLXZhbHVl";
    const out = redactSecrets(`a ${secret} b ${jwt} c rt_abcdefghijklmnopqrstu d`, [secret, ""]);
    expect(out).not.toContain(secret);
    expect(out).not.toContain(jwt);
    expect(out).not.toContain("rt_abcdefghijklmnopqrstu");
    expect(out).toContain("[가림]");
  });

  it("codex에는 허용 목록 환경 변수만 넘긴다(자격 원본·DB 주소 제외)", () => {
    const env = codexEnv({
      PATH: "/bin",
      HOME: "/root",
      HTTPS_PROXY: "http://p",
      NODE_EXTRA_CA_CERTS: "/ca",
      CODEX_AUTH_JSON_B64: "secret",
      DATABASE_URL: "postgres://x",
      BETTER_AUTH_SECRET: "s",
    });
    expect(env).toEqual({ PATH: "/bin", HOME: "/root", HTTPS_PROXY: "http://p", NODE_EXTRA_CA_CERTS: "/ca" });
  });
});

describe("scripts/codex-design-review.sh 건너뜀 계약", () => {
  const SCRIPT = resolve(process.cwd(), "scripts/codex-design-review.sh");
  const written: string[] = [];
  afterAll(() => {
    for (const file of written) rmSync(dirname(file), { recursive: true, force: true });
  });

  function run(args: string[], stubCodex?: string) {
    const dir = mkdtempSync(join(tmpdir(), "codex-dr-"));
    if (stubCodex !== undefined) {
      writeFileSync(join(dir, "codex"), `#!/bin/sh\n${stubCodex}\n`);
      chmodSync(join(dir, "codex"), 0o755);
    }
    const out = join("test-results", `codex-dr-unit-${process.pid}-${Math.random().toString(36).slice(2)}`, "report.md");
    const result = spawnSync("/bin/bash", [SCRIPT, ...args.map((a) => (a === "OUT" ? out : a))], {
      env: { ...process.env, PATH: `${dir}:/usr/bin:/bin`, HOME: dir },
      encoding: "utf8",
    });
    written.push(out);
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

  it("API 키 로그인은 구독 로그인이 아니므로 건너뛴다", () => {
    const { result, out } = run(["/admin/people", "--out", "OUT"], 'echo "Logged in using an API key - sk-***"');
    expect(result.status).toBe(0);
    expect(readFileSync(out, "utf8")).toContain("로그인");
  });

  it("--out이 없으면 2로 끝난다", () => {
    const { result } = run(["/admin/people"]);
    expect(result.status).toBe(2);
  });

  it("--out이 보호 파일을 가리키는 링크면 2로 끝나고 대상을 쓰지 않는다", () => {
    const dir = join("test-results", `codex-dr-link-${process.pid}`);
    mkdirSync(dir, { recursive: true });
    const target = join(mkdtempSync(join(tmpdir(), "codex-dr-target-")), "CLAUDE.md");
    writeFileSync(target, "원본");
    symlinkSync(target, join(dir, "r.md"));
    written.push(join(dir, "r.md"));
    const { result } = run(["/admin/people", "--out", join(dir, "r.md")]);
    expect(result.status).toBe(2);
    expect(readFileSync(target, "utf8")).toBe("원본");
  });

  it("--out이 보호 파일의 하드링크면 2로 끝나고 대상을 쓰지 않는다", () => {
    const dir = join("test-results", `codex-dr-hard-${process.pid}`);
    mkdirSync(dir, { recursive: true });
    const target = join(dir, "CLAUDE.md");
    writeFileSync(target, "원본");
    linkSync(target, join(dir, "r.md"));
    written.push(join(dir, "r.md"));
    const { result } = run(["/admin/people", "--out", join(dir, "r.md")]);
    expect(result.status).toBe(2);
    expect(readFileSync(target, "utf8")).toBe("원본");
  });

  it("--out이 일반 파일이면 그 자리를 새 파일로 바꿔 쓴다(링크 대상 덮기 방지)", () => {
    const { result, out } = run(["/admin/people", "--out", "OUT"]);
    expect(result.status).toBe(0);
    const again = spawnSync("/bin/bash", [SCRIPT, "/admin/people", "--out", out], {
      env: { ...process.env, PATH: "/usr/bin:/bin", HOME: tmpdir() },
      encoding: "utf8",
    });
    expect(again.status).toBe(0);
    expect(readFileSync(out, "utf8")).toMatch(/^Codex 디자인 검토 건너뜀: /);
    expect(readdirSync(dirname(out))).toEqual(["report.md"]);
  });

  it("--out이 .planning/·test-results/의 .md가 아니면 2로 끝나고 쓰지 않는다", () => {
    const dir = mkdtempSync(join(tmpdir(), "codex-dr-out-"));
    const { result } = run(["/admin/people", "--out", join(dir, "CLAUDE.md")]);
    expect(result.status).toBe(2);
    expect(existsSync(join(dir, "CLAUDE.md"))).toBe(false);
  });
});
