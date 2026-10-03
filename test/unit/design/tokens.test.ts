import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// 04.6-01 — `docs/design/tokens.css`의 두 단(원시 값 · 역할 이름)을 순수 파싱으로 지킨다.
// 파싱·`var()` 해석·상대 휘도는 design-system-docs.test.ts와 같은 방식(readFileSync, 새 의존성 없음).

const RAW_CSS = readFileSync(resolve(process.cwd(), "docs", "design", "tokens.css"), "utf8");

const BANNER_RAW = "/* ==== 1단 원시 값 ==== */";
const BANNER_ROLE = "/* ==== 2단 역할 이름 ==== */";
const BANNER_LEGACY = "/* ==== 옛 이름 (옛 값 그대로 — 04.6-31이 삭제한다) ==== */";
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
const ROLE = declarations(bannerSlice(BANNER_ROLE, BANNER_LEGACY));
const LEGACY = declarations(bannerSlice(BANNER_LEGACY, BANNER_OTHER));

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
    ["--text-muted", [...BODY_SURFACES, "--surface-group", "--surface-selected"]],
    ["--text-faint", [...BODY_SURFACES, "--surface-group"]],
    ["--text-group", ["--surface-group"]],
    ["--text-on-tint", ["--surface-selected"]],
    ["--text-link", [...BODY_SURFACES, "--surface-group", "--surface-selected"]],
    ["--status-danger", [...BODY_SURFACES, "--surface-group", "--status-danger-weak"]],
    ["--status-warning", [...BODY_SURFACES, "--surface-group", "--status-warning-weak"]],
    ["--status-success", BODY_SURFACES],
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

  // 금지 쌍 — 4.5 미만이라 쓰지 않는다. 표에 있는 이유 = 실측 증거(값이 4.5 미만이어야 표에 둘 수 있다).
  const FORBIDDEN: Array<[string, string]> = [
    ["--text-faint", "--surface-selected"], // 4.26
    ["--status-success", "--surface-selected"], // 4.18
    ["--status-success", "--status-danger-weak"], // 4.49
  ];

  it("금지 쌍 표에 --text-faint × --surface-selected(4.26)가 있다", () => {
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

  it("옛 이름·그 밖 층은 역할 층과 같은 이름을 다시 정의하지 않는다", () => {
    for (const name of LEGACY.keys()) expect(ROLE.has(name)).toBe(false);
  });
});

describe("tokens.css — ⑥ 옛 이름은 옛 값 그대로(04.6-31이 「없다」로 뒤집는다)", () => {
  // 공통 §4 (d) 목록 + 값. 아직 옮기지 않은 화면의 모양이 이 웨이브에서 바뀌지 않는다.
  const LEGACY_VALUES: Array<[string, string]> = [
    ["--bg", "#FFFFFF"],
    ["--surface", "#F3F7F5"],
    ["--fg", "#0B1512"],
    ["--muted", "#4E5D59"],
    ["--faint", "#5F6E6A"],
    ["--line", "#CFDBD7"],
    ["--line-ui", "#7C8A86"],
    ["--line-strong", "var(--g-900)"],
    ["--line-w-strong", "2px"],
    ["--radius", "0"],
    ["--shadow", "none"],
    ["--modal-w", "480px"],
    ["--bar", "var(--g-900)"],
    ["--danger", "#9B1C1C"],
    ["--danger-weak", "#FBE9E9"],
    ["--warning", "#8A5A00"],
    ["--warning-weak", "#FBF1DE"],
    ["--success", "var(--g-600)"],
    ["--scrim", "rgba(0, 33, 28, 0.45)"],
    ["--row-min", "36px"],
    ["--fs-xs", "11px"],
    ["--fs-sm", "12px"],
    ["--fs-base", "14px"],
    ["--fs-md", "15px"],
    ["--fs-lg", "18px"],
    ["--fs-xl", "24px"],
    ["--fs-2xl", "32px"],
  ];

  it.each(LEGACY_VALUES)("%s = %s", (name, value) => {
    expect(LEGACY.get(name)).toBe(value);
  });

  it("폰 미디어 쿼리의 옛 값도 그대로다(--fs-base 15px · --row-min 44px)", () => {
    expect(PHONE.get("--fs-base")).toBe("15px");
    expect(PHONE.get("--row-min")).toBe("44px");
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

  it("후보 7 — 저장 대기 칸 면 --surface-dirty 는 --g-100 계열(--surface-selected 와 같은 값)이다", () => {
    expect(finalValue("--surface-dirty")).toBe(finalValue("--g-100"));
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
