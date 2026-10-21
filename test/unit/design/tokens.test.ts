import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// 04.6-01 — `docs/design/tokens.css`의 두 단(원시 값 · 역할 이름)을 순수 파싱으로 지킨다.
// 파싱·`var()` 해석·상대 휘도는 design-system-docs.test.ts와 같은 방식(readFileSync, 새 의존성 없음).

const RAW_CSS = readFileSync(resolve(process.cwd(), "docs", "design", "tokens.css"), "utf8");

const BANNER_RAW = "/* ==== 1단 원시 값 ==== */";
const BANNER_ROLE = "/* ==== 2단 역할 이름 ==== */";
const BANNER_OTHER = "/* ==== 그 밖 기존 이름 (이 페이즈가 값을 바꾸지 않는다) ==== */";

function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

function declarations(css: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const m of stripComments(css).matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    map.set(m[1] as string, (m[2] as string).trim().replace(/\s+/g, " "));
  }
  return map;
}

function bannerSlice(from: string, to: string): string {
  const start = RAW_CSS.indexOf(from);
  if (start === -1) throw new Error(`배너를 찾을 수 없다: ${from}`);
  const end = RAW_CSS.indexOf(to, start);
  if (end === -1 || end <= start) throw new Error(`배너 구간 끝을 찾을 수 없다: ${to}`);
  return RAW_CSS.slice(start + from.length, end);
}

const ROOT_START = RAW_CSS.indexOf(":root");
const ROOT_END = RAW_CSS.indexOf("\n}", ROOT_START);
const FIRST_ROOT = RAW_CSS.slice(ROOT_START, ROOT_END);
const ALL = declarations(FIRST_ROOT);

const RAW = declarations(bannerSlice(BANNER_RAW, BANNER_ROLE));
const ROLE = declarations(bannerSlice(BANNER_ROLE, BANNER_OTHER));
const OTHER = declarations(RAW_CSS.slice(RAW_CSS.indexOf(BANNER_OTHER), ROOT_END));

const PHONE_START = RAW_CSS.indexOf("@media (max-width: 699.98px)");
const PHONE = declarations(RAW_CSS.slice(PHONE_START, RAW_CSS.indexOf("\n}\n", PHONE_START)));
const PRINT_START = RAW_CSS.indexOf("@media print");
const PRINT = declarations(RAW_CSS.slice(PRINT_START));

function resolveVar(value: string, seen: Set<string> = new Set()): string {
  const m = value.match(/^var\((--[\w-]+)\)$/);
  if (!m) return value;
  const name = m[1] as string;
  if (seen.has(name)) throw new Error(`순환 참조: ${name}`);
  seen.add(name);
  const next = ALL.get(name);
  if (next === undefined) throw new Error(`미정의 토큰: ${name}`);
  return resolveVar(next, seen);
}

function finalValue(name: string): string {
  const v = ALL.get(name);
  if (v === undefined) throw new Error(`미정의 토큰: ${name}`);
  return resolveVar(v);
}

function hex(name: string): string {
  const v = finalValue(name);
  if (!/^#[0-9A-Fa-f]{6}$/.test(v)) throw new Error(`${name}이 색(#RRGGBB)으로 풀리지 않는다: ${v}`);
  return v;
}

function luminance(color: string): number {
  const channels = [1, 3, 5]
    .map((i) => parseInt(color.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * (channels[0] as number) + 0.7152 * (channels[1] as number) + 0.0722 * (channels[2] as number);
}

function ratio(a: string, b: string): number {
  const [hi, lo] = [luminance(hex(a)), luminance(hex(b))].sort((p, q) => q - p) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

const isColor = (v: string): boolean => /^#[0-9A-Fa-f]{6}$/.test(v) || /^rgba?\(/.test(v);

describe("tokens.css — 두 단 구조(공허 방지)", () => {
  it("원시 층 --n-* 10개 이상 · 역할 층 30개 이상을 찾았다", () => {
    expect([...RAW.keys()].filter((k) => k.startsWith("--n-")).length).toBeGreaterThanOrEqual(10);
    expect(ROLE.size).toBeGreaterThanOrEqual(30);
  });

  it("원시 층은 원시 이름만(--g-* --n-* --red-* --amber-* --blue-* --ink-a*) 담는다", () => {
    for (const name of RAW.keys()) {
      expect(name).toMatch(/^--(g|n|red|amber|blue)-\d+$|^--ink-a\d+$/);
    }
  });

  it("역할 층은 원시 이름을 정의하지 않는다", () => {
    for (const name of ROLE.keys()) {
      expect(name).not.toMatch(/^--(g|n|red|amber|blue)-\d+$|^--ink-a\d+$/);
    }
  });
});

describe("tokens.css — ① 웜톤 금지(R ≤ G · R ≤ B)", () => {
  // `--status-warning-weak`는 상태 틴트라 면 역할이 아니다(이름이 `--surface-`로 시작하지 않아 대상 밖).
  const targets = [...ALL.keys()].filter((k) => /^--surface-/.test(k) || /^--n-\d+$/.test(k));

  it("대상이 20개 이상이다(공허 방지)", () => {
    expect(targets.length).toBeGreaterThanOrEqual(18);
  });

  it.each(targets)("%s 는 따뜻한 쪽으로 기울지 않는다", (name) => {
    const v = hex(name);
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(v.slice(i, i + 2), 16)) as [number, number, number];
    expect(r).toBeLessThanOrEqual(g);
    expect(r).toBeLessThanOrEqual(b);
  });
});

describe("tokens.css — ② 역할 간격 토큰은 --s-* 척도만 참조한다", () => {
  const spacing = [...ROLE.keys()].filter((k) => /^--(pad-|cell-pad-|field-gap|label-gap|panel-pad-)/.test(k));

  it("대상이 5개 이상이다(공허 방지)", () => {
    expect(spacing.length).toBeGreaterThanOrEqual(5);
  });

  it.each(spacing)("%s 는 var(--s-n)만 참조한다", (name) => {
    expect(ROLE.get(name)).toMatch(/^var\(--s-\d+\)$/);
    expect(ALL.has((ROLE.get(name) as string).slice(4, -1))).toBe(true);
  });

  // 폰 미디어 쿼리가 덮는 역할 간격 값도 척도다(14→16 · 10→12 — UQ-1 A 매핑).
  const phoneSpacing = [...PHONE.keys()].filter((k) => spacing.includes(k));

  it("폰이 덮는 역할 간격 토큰이 있다(공허 방지)", () => {
    expect(phoneSpacing.length).toBeGreaterThanOrEqual(2);
  });

  it.each(phoneSpacing)("폰 %s 는 var(--s-n)만 참조한다", (name) => {
    expect(PHONE.get(name)).toMatch(/^var\(--s-\d+\)$/);
    expect(ALL.has((PHONE.get(name) as string).slice(4, -1))).toBe(true);
  });
});

describe("tokens.css — ③ 글자 × 면 대비 쌍(허용 쌍 표 · 금지 쌍 표)", () => {
  const BODY_SURFACES = [
    "--surface-canvas",
    "--surface-base",
    "--surface-head",
    "--surface-foot",
    "--surface-actions",
    "--surface-muted",
  ];
  const ALLOWED: Array<[string, string[]]> = [
    ["--text-strong", [...BODY_SURFACES, "--surface-group", "--surface-selected"]],
    // `--accent-weak`는 06 SP-1 고른 행 면(범위 선택과 같은 면) — 아래 다섯 글자 토큰이 그 위에서 4.5 이상이다(r2 F16)
    ["--text-muted", [...BODY_SURFACES, "--surface-group", "--surface-selected", "--accent-weak"]],
    ["--text-faint", [...BODY_SURFACES, "--surface-group", "--accent-weak"]],
    ["--text-group", ["--surface-group"]],
    ["--text-on-tint", ["--surface-selected"]],
    ["--text-link", [...BODY_SURFACES, "--surface-group", "--surface-selected"]],
    ["--status-danger", [...BODY_SURFACES, "--surface-group", "--status-danger-weak", "--accent-weak"]],
    ["--status-warning", [...BODY_SURFACES, "--surface-group", "--status-warning-weak", "--accent-weak"]],
    ["--status-success", [...BODY_SURFACES, "--accent-weak"]],
    ["--status-accent", BODY_SURFACES],
    ["--status-muted", [...BODY_SURFACES, "--surface-group"]],
  ];
  const allowedPairs = ALLOWED.flatMap(([fg, bgs]) => bgs.map((bg): [string, string] => [fg, bg]));

  it("허용 쌍이 40개 이상이다(공허 방지)", () => {
    expect(allowedPairs.length).toBeGreaterThanOrEqual(40);
  });

  it.each(allowedPairs)("%s on %s 대비 4.5 이상", (fg, bg) => {
    expect(ratio(fg, bg)).toBeGreaterThanOrEqual(4.5);
  });

  it("고른 행 면(--accent-weak) 위 실측이 UI-SPEC · SYSTEM §1-4 문장 값과 같다(소수 둘째 자리)", () => {
    const measured = Object.fromEntries(
      ["--status-success", "--status-warning", "--status-danger", "--text-muted", "--text-faint"].map((fg) => [
        fg,
        Math.round(ratio(fg, "--accent-weak") * 100) / 100,
      ]),
    );
    expect(measured).toEqual({
      "--status-success": 4.63,
      "--status-warning": 5.22,
      "--status-danger": 7.18,
      "--text-muted": 5.74,
      "--text-faint": 4.71,
    });
  });

  it("--status-warning × --surface-group이 허용 쌍 표에 있다(그룹 줄 `예정일 지남` 덧붙임)", () => {
    expect(allowedPairs).toContainEqual(["--status-warning", "--surface-group"]);
  });

  it("흰 글자 on 강조 면(--text-on-accent on --accent) 4.5 이상", () => {
    expect(ratio("--text-on-accent", "--accent")).toBeGreaterThanOrEqual(4.5);
  });

  it("제목은 700 · 18.66px 이상이라 큰 글자 기준 3 이상(제목 쌍)", () => {
    expect(finalValue("--text-title")).toBe("22px");
    expect(finalValue("--fw-bold")).toBe("700");
    expect(parseFloat(finalValue("--text-title"))).toBeGreaterThanOrEqual(18.66);
    for (const bg of [...BODY_SURFACES]) {
      expect(ratio("--text-strong", bg)).toBeGreaterThanOrEqual(3);
    }
  });

  it("부제 18px은 큰 글자(18.66) 아래라 4.5 표를 따른다 — 부제 쌍은 허용 쌍 표 안에 있다", () => {
    expect(parseFloat(finalValue("--text-subtitle"))).toBeLessThan(18.66);
    expect(allowedPairs).toContainEqual(["--text-strong", "--surface-base"]);
  });

  // 07 개정 11 — 표 면 역할 토큰 셋이 중립 원시 값(n-50 · n-100 · n-60)을 가리킨 뒤의 실측(소수 둘째 자리).
  it("개정 11 새 면 위 실측: text-on-tint × selected(n-100) 13.95 · text-faint × selected 4.39 · status-warning × group(n-50) 5.56", () => {
    const measured = (fg: string, bg: string) => Math.round(ratio(fg, bg) * 100) / 100;
    expect(measured("--text-on-tint", "--surface-selected")).toBe(13.95);
    expect(measured("--text-faint", "--surface-selected")).toBe(4.39);
    expect(measured("--status-success", "--surface-selected")).toBe(4.31);
    expect(measured("--status-warning", "--surface-group")).toBe(5.56);
  });

  // 금지 쌍 — 4.5 미만이라 쓰지 않는다. 표에 있는 이유 = 실측 증거(값이 4.5 미만이어야 표에 둘 수 있다).
  const FORBIDDEN: Array<[string, string]> = [
    ["--text-faint", "--surface-selected"], // 4.39 (07 개정 11 — n-100 위. 옛 g-100 위 4.26)
    ["--status-success", "--surface-selected"], // 4.31 (07 개정 11 — 옛 4.18)
    ["--status-success", "--status-danger-weak"], // 4.49
  ];

  it("금지 쌍 표에 --text-faint × --surface-selected(4.39)가 있다", () => {
    expect(FORBIDDEN).toContainEqual(["--text-faint", "--surface-selected"]);
  });

  it.each(FORBIDDEN)("금지 쌍 %s on %s 는 실제로 4.5 미만이다", (fg, bg) => {
    expect(ratio(fg, bg)).toBeLessThan(4.5);
  });
});

describe("tokens.css — ④ 입력 테두리(UQ-7 A — 04.6-ANSWERS.md)", () => {
  it("--border-control 은 --n-500(#7C8A86)을 가리킨다", () => {
    expect(ROLE.get("--border-control")).toBe("var(--n-500)");
    expect(hex("--border-control").toUpperCase()).toBe("#7C8A86");
  });

  it("--border-control on --surface-base 대비 3 이상(UI 경계 3:1)", () => {
    expect(ratio("--border-control", "--surface-base")).toBeGreaterThanOrEqual(3);
  });

  it("2차 버튼 테두리 --border-button 은 글자 라벨이 있어 3:1 대상이 아니다 — n-300을 가리킨다", () => {
    expect(ROLE.get("--border-button")).toBe("var(--n-300)");
  });
});

describe("tokens.css — ⑤ 미정의 · 순환 없음, 역할 층은 원시·역할 토큰만 참조", () => {
  it("첫 :root 의 모든 토큰이 미정의·순환 없이 해석된다", () => {
    for (const name of ALL.keys()) {
      expect(() => finalValue(name)).not.toThrow();
    }
  });

  it("역할 층 값이 참조하는 var()는 원시 층 또는 역할 층에 있다(옛 이름 참조 금지)", () => {
    const allowed = new Set([...RAW.keys(), ...ROLE.keys()]);
    for (const [name, value] of ROLE) {
      for (const m of value.matchAll(/var\((--[\w-]+)\)/g)) {
        expect(allowed.has(m[1] as string), `${name} → ${m[1]}`).toBe(true);
      }
    }
  });

  it("그 밖 층은 역할 층과 같은 이름을 다시 정의하지 않는다", () => {
    expect(OTHER.size).toBeGreaterThan(0);
    for (const name of OTHER.keys()) expect(ROLE.has(name)).toBe(false);
  });
});

const LEGACY_NAME = /^--(bg|surface|fg|muted|faint|line|line-ui|line-strong|line-w-strong|radius|shadow|modal-w|bar|fs-[a-z0-9]+|danger|danger-weak|warning|warning-weak|success|scrim|row-min)$/; // 옛 이름 목록(공통 §4 (d))

describe("tokens.css — ⑥ 옛 이름은 정의돼 있지 않다(04.6-31) — 스킨 값은 역할 층 한 곳에서만 온다", () => {
  const names = [...RAW_CSS.matchAll(/--[\w-]+/g)].map((m) => m[0]);

  it("파일 어디에도(주석 · 첫 :root · 폰 미디어 쿼리 · @media print · var() 참조) 옛 이름이 없다", () => {
    expect(names.length).toBeGreaterThan(100);
    expect(names.filter((n) => LEGACY_NAME.test(n))).toEqual([]);
  });

  it("역할 이름과 이름이 비슷한 토큰은 옛 이름으로 오인하지 않는다(--bar-bg · --line-w · --surface-base · --radius-control)", () => {
    for (const ok of ["--bar-bg", "--bar-h", "--line-w", "--surface-base", "--radius-control", "--shadow-pop", "--status-danger"]) {
      expect(LEGACY_NAME.test(ok), ok).toBe(false);
    }
    // 옛 이름이 실제로 잡히는지(공허 방지) — 이 파일의 다른 줄에 옛 이름을 쓰지 않으려 이어 붙인다.
    expect(LEGACY_NAME.test(["-", "-bg"].join(""))).toBe(true);
    expect(LEGACY_NAME.test(["-", "-fs-md"].join(""))).toBe(true);
  });

  it("브라우저 기본 표면 파생 토큰은 역할 이름을 가리킨다(--sel-fg → --text-strong · --scrollbar → --border-control)", () => {
    expect(OTHER.get("--sel-fg")).toBe("var(--text-strong)");
    expect(OTHER.get("--scrollbar")).toBe("var(--border-control)");
  });

  it("폰 미디어 쿼리는 역할 이름만 덮는다(--text-body 15px · --control-h 40px)", () => {
    expect(PHONE.get("--text-body")).toBe("15px");
    expect(PHONE.get("--control-h")).toBe("40px");
  });

  it("--print-rule-w 는 2px 이다(인쇄 구조 선 — 인쇄 템플릿은 스킨 대상이 아니다)", () => {
    expect(ALL.get("--print-rule-w")).toBe("2px");
  });

  it.each([
    ["--surface-canvas", "#FFFFFF"], // 인쇄 라우트 화면 바탕 — 옛 화면 바탕 토큰이 접히던 값
    ["--surface-base", "#FFFFFF"], // 종이 면 — 옛 종이 면 토큰이 접히던 값
    ["--border-surface", "var(--print-ink)"], // 종이 외곽 — 옛 장식선 토큰이 접히던 값
    ["--status-danger", "var(--print-ink)"], // 오류 글자 — 옛 오류 색 토큰이 접히던 값
  ])("인쇄 CSS가 쓰는 %s 는 @media print 에서 %s 로 접힌다(옛 이름이 접히던 값과 같다)", (name, value) => {
    expect(PRINT.get(name)).toBe(value);
  });
});

describe("tokens.css — ⑦ 인쇄 접기(R16): 색 역할 토큰은 잉크·흰색으로, 그림자는 none", () => {
  const colorRoles = [...ROLE.entries()].filter(([name]) => isColor(finalValue(name))).map(([name]) => name);
  const shadowRoles = [...ROLE.keys()].filter((k) => /^--shadow-/.test(k));

  it("대상 색 역할 토큰이 20개 이상이다(공허 방지)", () => {
    expect(colorRoles.length).toBeGreaterThanOrEqual(20);
    expect(shadowRoles.length).toBeGreaterThanOrEqual(2);
  });

  it.each(colorRoles)("%s 는 @media print 에서 var(--print-ink) 또는 #FFFFFF 로 다시 정의된다", (name) => {
    expect(["var(--print-ink)", "#FFFFFF"]).toContain(PRINT.get(name));
  });

  it.each(shadowRoles)("%s 는 @media print 에서 none 이다", (name) => {
    expect(PRINT.get(name)).toBe("none");
  });
});

describe("tokens.css — ⑧ Round 2 역할 토큰 넷(M1 · Q7 · Q10 · M5) · 시트 높이(D11)", () => {
  it.each([
    ["--underline-w-hover", "2px"],
    ["--text-prose", "15px"],
    ["--recipient-w", "480px"],
    ["--row-number-w", "28px"],
    ["--sheet-max-h", "88dvh"],
  ])("%s = %s (역할 층)", (name, value) => {
    expect(ROLE.get(name)).toBe(value);
  });

  it("폰 미디어 쿼리는 --text-prose 를 다시 정의하지 않는다(PC·폰 모두 15 — 외부 수령자 글자는 줄지 않는다)", () => {
    expect(PHONE.has("--text-prose")).toBe(false);
  });
});

describe("tokens.css — 사용자 답 값(UQ-1·2·3·6 A — 04.6-ANSWERS.md)", () => {
  it.each([
    ["--s-1", "4px"],
    ["--s-2", "8px"],
    ["--s-3", "12px"],
    ["--s-4", "16px"],
    ["--s-5", "20px"],
    ["--s-6", "24px"],
    ["--s-8", "32px"],
    ["--s-12", "48px"],
    ["--text-title", "22px"],
    ["--text-subtitle", "18px"],
    ["--text-body", "14px"],
    ["--text-aux", "13px"],
    ["--text-tag", "11px"],
    ["--text-kpi", "32px"],
    ["--fw-regular", "400"],
    ["--fw-medium", "600"],
    ["--fw-bold", "700"],
    ["--fw-mark", "800"],
    ["--dialog-w", "480px"],
    ["--panel-w", "480px"],
    ["--row-h", "44px"],
    ["--bar-h", "48px"],
  ])("%s = %s", (name, value) => {
    expect(ROLE.get(name)).toBe(value);
  });

  it("폰에서 본문은 15px(--text-body)", () => {
    expect(PHONE.get("--text-body")).toBe("15px");
  });
});

// 04.6-26 — UQ-4 완화 후보 답(04.6-ANSWERS.md 「2026-10-03 답」): 5 · 7 · 8 넣음, 4 · 6 · 9 뺌.
describe("tokens.css — UQ-4 완화 후보(5 · 7 · 8 넣음 / 4 · 6 · 9 뺌)", () => {
  it("후보 5 — --shadow-pop 은 원시 --ink-a30 그림자다(원안의 .32는 원시 층에 없다)", () => {
    expect(ROLE.get("--shadow-pop")).toBe("0 12px 28px -8px var(--ink-a30)");
  });

  it("후보 5 — --shadow-pop 은 인쇄에서 none 이다", () => {
    expect(PRINT.get("--shadow-pop")).toBe("none");
  });

  it("후보 7 — 저장 대기 칸 면 --surface-dirty 는 인쇄에서 흰색이다(07 개정 11: 화면 값은 n-60 중립 — 아래 개정 11 절)", () => {
    expect(PRINT.get("--surface-dirty")).toBe("#FFFFFF");
  });

  it("후보 8 — 열림 모션은 기존 --dur-sheet(200ms)와 --ease-sheet를 쓰고 새 모션 토큰은 없다", () => {
    expect(ROLE.get("--dur-sheet") ?? ALL.get("--dur-sheet")).toBe("200ms");
    expect(ALL.has("--dur-open")).toBe(false);
    expect(ALL.has("--motion-shift")).toBe(false);
  });

  it("후보 4 · 6 · 9 는 토큰이 없다 — 하단 탭 높이·PC 본문 15·네 숫자 19", () => {
    expect(ALL.has("--tab-h")).toBe(false);
    expect(ALL.has("--tabbar-h")).toBe(false);
    expect(ALL.get("--text-body")).toBe("14px");
    expect(ALL.has("--text-number-lead")).toBe(false);
    expect(ALL.has("--text-numbers")).toBe(false);
  });
});

// 07-12 개정 11(N9 · 사용자 10/7 13:04 · 13:09 · 13:12) — 표 안에 초록 면이 없다. 표 면 역할 토큰 셋은 중립 원시 값을 가리키고
// 표 CSS는 강조 약한 면(--accent-weak, g-50)을 배경으로 쓰지 않으며 포커스 칸은 흰 바탕 + 안쪽 2px --accent 선이다.
describe("tokens.css · ui/table — 개정 11 표 모양 확정(표 안 초록 면 0)", () => {
  it("--surface-group → n-50 · --surface-selected → n-100 · --surface-dirty → n-60", () => {
    expect(ROLE.get("--surface-group")).toBe("var(--n-50)");
    expect(ROLE.get("--surface-selected")).toBe("var(--n-100)");
    expect(ROLE.get("--surface-dirty")).toBe("var(--n-60)");
  });

  it("셋 다 원시 초록(--g-*)을 가리키지 않는다", () => {
    for (const name of ["--surface-group", "--surface-selected", "--surface-dirty"]) {
      expect(ROLE.get(name), name).not.toMatch(/var\(--g-/);
    }
  });

  const TABLE_CSS = stripComments(readFileSync(resolve(process.cwd(), "ui", "table", "Table.module.css"), "utf8"));
  const backgrounds = [...TABLE_CSS.matchAll(/(?:^|[\s;{])background(?:-color)?\s*:\s*([^;}]+)[;}]/g)].map((m) => (m[1] as string).trim());

  it("Table.module.css의 background 선언을 모았다(공허 방지)", () => {
    expect(backgrounds.length).toBeGreaterThan(10);
  });

  it("Table.module.css 배경이 강조 약한 면(--accent-weak) · 원시 초록을 쓰지 않는다", () => {
    expect(backgrounds.filter((v) => /--accent-weak|--g-\d+/.test(v))).toEqual([]);
  });

  // 07-12 D1 — 고른 행 면 위 금지 쌍(--status-success 4.31 · --text-faint 4.39)을 시스템 규칙으로 막는다:
  // .selectedRow가 두 역할을 더 진한 기존 역할로 다시 가리키고, 그 대체 쌍이 4.5 이상임을 토큰 수학으로 잠근다.
  it("고른 행(.selectedRow)은 --status-success → --status-accent · --text-faint → --text-muted로 다시 가리킨다", () => {
    const rule = /(?:^|\n)\.selectedRow\s*\{([^}]*)\}/.exec(TABLE_CSS)?.[1] ?? "";
    expect(rule).toMatch(/background:\s*var\(--surface-selected\)/);
    expect(rule).toMatch(/--status-success:\s*var\(--status-accent\)/);
    expect(rule).toMatch(/--text-faint:\s*var\(--text-muted\)/);
  });

  // 07-12 게이트 /review — 같은 면(--surface-selected)인 범위 선택 칸(.selectedCell, Shift+화살표)에서도 「확인됨」이 4.31로 렌더됐다(지급 대상 표 DOM 실측).
  it("범위 선택 칸(.selectedCell)도 --status-success → --status-accent · --text-faint → --text-muted로 다시 가리킨다", () => {
    const rule = /(?:^|\n)\.selectedCell\s*\{([^}]*)\}/.exec(TABLE_CSS)?.[1] ?? "";
    expect(rule).toMatch(/background:\s*var\(--surface-selected\)/);
    expect(rule).toMatch(/--status-success:\s*var\(--status-accent\)/);
    expect(rule).toMatch(/--text-faint:\s*var\(--text-muted\)/);
  });

  it("고른 행 면 위 대체 쌍 실측: status-accent 7.31 · text-muted 5.34, 모두 4.5 이상", () => {
    const measured = (fg: string, bg: string) => Math.round(ratio(fg, bg) * 100) / 100;
    expect(ratio("--status-accent", "--surface-selected")).toBeGreaterThanOrEqual(4.5);
    expect(ratio("--text-muted", "--surface-selected")).toBeGreaterThanOrEqual(4.5);
    expect(measured("--text-muted", "--surface-selected")).toBe(5.34);
    expect(measured("--status-accent", "--surface-selected")).toBe(7.31);
    // 오류 · 충돌 칸 면(고정 빨강)에서도 대체 글자는 4.5 이상이다 — 옛 --status-success는 4.49였다.
    expect(ratio("--status-accent", "--status-danger-weak")).toBeGreaterThanOrEqual(4.5);
    expect(ratio("--text-muted", "--status-danger-weak")).toBeGreaterThanOrEqual(4.5);
  });

  it("포커스 칸은 흰 바탕(--surface-base) + 안쪽 --focus-w --accent 선이다", () => {
    const rule = /\.cell:focus-visible[^{]*\{([^}]*)\}/.exec(TABLE_CSS)?.[1] ?? "";
    expect(rule).toMatch(/background:\s*var\(--surface-base\)/);
    expect(rule).toMatch(/outline:\s*var\(--focus-w\) solid var\(--accent\)/);
    expect(rule).toMatch(/outline-offset:\s*calc\(-1 \* var\(--focus-w\)\)/);
  });
});
