// D-20 + 04.6 스킨 A: 화면·컴포넌트 CSS가 토큰 척도 안에서만 값을 쓰게 강제한다.
//   · 날 px(미디어 쿼리 폭 조건 제외) · 날 색(hex 포함) · 원시 토큰(--g- --n- --red- --amber- --blue- --ink-) 직접 참조
//   · 간격(margin·padding·gap)은 --s-* 척도·역할 간격 토큰 · font-size는 --text-* · 굵기 --fw-* · 행간 --lh-*
//   · radius --radius-* · 그림자 --shadow-*/--inset-* · z-index --z-*
//   · font-variant-numeric은 ui/num · ui/input · app/print 밖 금지(숫자는 Num 컴포넌트)
// 정규식은 토큰 「이름」만 본다 — 토큰 값(tokens.css)과 무관하다.
//
// 이관 전 표시(R3): 아직 새 규칙으로 옮기지 않은 CSS는 파일 첫 줄 표시 한 줄(CSS_LEGACY_MARKER)로 표시한다.
// 표시는 규칙을 끄는 주석(stylelint-disable)이 아니다 — 불러올 때 lint 범위 CSS의 첫 줄을 훑어 표시 파일 목록을 만들고,
// 그 파일들에만 마지막 overrides로 오늘의 D-20 규칙(글꼴 · --fs-* 글자 크기 · radius 허용 목록 + 리터럴 색 부분 매치)을 다시 건다.
// 날 색 규칙(color-no-hex · 색 함수 · 이름 색)은 표시와 무관하게 모든 파일에 켜져 있다.
// docs/design/tokens.css는 별도 예외 처리하지 않는다 — package.json의 lint 스크립트가 넘기는 glob을
// 앱 CSS(ui/**/*.module.css · app/globals.css · app/**/*.module.css)로 한정해 docs/가 스캔 대상에 들지 않는다.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

export const CSS_LEGACY_MARKER = "/* 04.6 스킨 A 이관 전: CSS */";

const CONFIG_DIR = fileURLToPath(new URL(".", import.meta.url));

// ── 표시 훑기 ────────────────────────────────────────────────────────────

function walk(dir, out) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    if (name === "node_modules" || name === ".next") continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
}

/**
 * package.json `lint` 글롭과 같은 범위(ui/**\/*.module.css · app/globals.css · app/**\/*.module.css)의
 * CSS 파일을 root 기준 posix 상대 경로로 정렬해 돌려준다.
 * @param {string} root
 * @returns {string[]}
 */
export function collectLintCssFiles(root) {
  const found = [];
  for (const top of ["ui", "app"]) {
    const all = [];
    walk(join(root, top), all);
    for (const abs of all) {
      const rel = relative(root, abs).split("\\").join("/");
      if (rel.endsWith(".module.css") || rel === "app/globals.css") found.push(rel);
    }
  }
  return found.sort();
}

/**
 * lint 범위 CSS 중 첫 줄이 CSS_LEGACY_MARKER인 파일(root 기준 posix 상대 경로)을 돌려준다.
 * @param {string} root
 * @returns {string[]}
 */
export function collectMarkedCssFiles(root) {
  return collectLintCssFiles(root).filter((rel) => {
    const text = readFileSync(join(root, rel), "utf8").replace(/^\uFEFF/, "");
    const first = text.split("\n", 1)[0] ?? "";
    return first.trimEnd() === CSS_LEGACY_MARKER;
  });
}

// ── 규칙 조립 ────────────────────────────────────────────────────────────

/** 정규식 → stylelint 문자열 정규식("/…/flags") */
const re = (r) => `/${r.source}/${r.flags}`;

// 간격 토큰: --s-N 척도 · 역할 간격 토큰(--pad-* --cell-pad-* --field-gap --label-gap --panel-pad-* --gap-*)
const SP_TOKEN = String.raw`var\(--(?:s-\d+|pad-[\w-]+|cell-pad-[\w-]+|field-gap|label-gap|panel-pad-[\w-]+|gap-[\w-]+)\)`;
const SP_CALC = String.raw`calc\((?:[-+*/\s\d.()]|${SP_TOKEN})+\)`;
const SP_ATOM = `(?:0|auto|${SP_TOKEN}|${SP_CALC})`;
// 셸 없는 외부 수령자 화면(app/c/**)에서만 더하는 안전 영역 대체값 꼴(Q10)
const SP_ENV_ATOM = String.raw`calc\(var\(--s-\d+\) \+ env\(safe-area-inset-(?:top|right|bottom|left), 0px\)\)`;

const spValue = (atom) => new RegExp(String.raw`^${atom}(?:\s+${atom})*$`);

const SPACING_PROPS =
  /^(?:(?:margin|padding)(?:-(?:top|right|bottom|left|inline|block)(?:-(?:start|end))?)?|gap|row-gap|column-gap)$/;

// app/c/** 한정 — 터치 높이 보정 min(0px, calc(… var(--touch-min) …)) 꼴. 숫자 단위는 em·lh뿐.
const TOUCH_MARGIN_BLOCK = new RegExp(
  String.raw`^min\(0px,\s*calc\((?=[\s\S]*var\(--touch-min\))(?:[-+*/\s\d.()]|em|lh|var\(--(?:lh-[\w-]+|touch-min)\))+\)\)$`,
);

const FONT_SIZE_UI = /^var\(--text-[\w-]+\)$/;
const FONT_SIZE_APP = /^var\(--text-(?:body|aux|tag)\)$/;
const FONT_SIZE_RECIPIENT = /^var\(--text-(?:title|subtitle|body|aux|tag|prose)\)$/;

/**
 * 범위별 허용 목록 전체 맵. overrides는 규칙 옵션을 통째로 교체하므로 범위마다 전체를 다시 적는다.
 * @param {{ fontSize: RegExp | null, spacing: RegExp | null, extra?: Record<string, string[]> }} scope
 */
function allowed({ fontSize, spacing, extra = {} }) {
  const map = {};
  if (spacing) map[re(SPACING_PROPS)] = [re(spacing)];
  map["font-family"] = [re(/^var\(--font-sans\)$/)];
  if (fontSize) map["font-size"] = [re(fontSize)];
  map["font-weight"] = [re(/^var\(--fw-[\w-]+\)$/)];
  map["line-height"] = [re(/^var\(--lh-[\w-]+\)$/)];
  map[re(/^border(?:-(?:top|bottom|start|end)-(?:left|right|start|end))?-radius$/)] = [
    re(/^(?:0|var\(--radius-[\w-]+\))(?:\s+(?:0|var\(--radius-[\w-]+\))){0,3}$/),
  ];
  map["box-shadow"] = [
    "none",
    re(/^var\(--(?:shadow|inset)-[\w-]+\)(?:,\s*var\(--(?:shadow|inset)-[\w-]+\))*$/),
  ];
  map["z-index"] = [re(/^var\(--z-[\w-]+\)$/)];
  return { ...map, ...extra };
}

const LITERAL_COLOR_PROPS =
  "/^(color|background|background-color|.*border.*color.*|outline-color|fill|stroke|accent-color|caret-color|box-shadow|border|outline|background-image)$/";
const LITERAL_COLOR = ["/#[0-9a-f]{3,8}\\b/i", "/\\brgba?\\(/i", "/\\bhsla?\\(/i"];

// 원시 토큰 직접 참조 금지(2단 계약) — 모든 속성
const RAW_TOKEN = re(/var\(--(?:g|n|red|amber|blue|ink)-/);

const disallowedValues = {
  "/.*/": [RAW_TOKEN],
  [LITERAL_COLOR_PROPS]: LITERAL_COLOR,
};

const PX_UNIT = ["px"];
const MEDIA_WIDTH = { px: ["width", "min-width", "max-width"] };

const common = {
  "unit-disallowed-list": [PX_UNIT, { ignoreMediaFeatureNames: MEDIA_WIDTH }],
  // 날 hex는 별도 규칙 — 표시 파일에서도 꺼지지 않는다(T-04.6-03)
  "color-no-hex": true,
  // WR-08: 이름 있는 색상(white, red, rebeccapurple...) 금지.
  // currentColor/inherit/transparent는 색상 키워드 문법이 아니라서 걸리지 않는다.
  "color-named": "never",
  // WR-08: 최신 색상 함수도 리터럴 색이므로 hex/rgb/hsl과 동일하게 금지한다.
  // calc()는 목록에 넣지 않는다 — 간격에서 계속 쓰인다.
  "function-disallowed-list": [
    "rgb",
    "rgba",
    "hsl",
    "hsla",
    "hwb",
    "lab",
    "lch",
    "oklab",
    "oklch",
    "color",
    "color-mix",
  ],
  // WR-08: font 축약은 font-family/font-size 허용 목록을 우회하므로 통째로 금지하고 항상 롱핸드를 쓴다.
  // 숫자 정렬은 Num 컴포넌트 몫이라 font-variant-numeric도 금지 — ui/num · ui/input · app/print에서만 연다.
  "property-disallowed-list": ["font", "font-variant-numeric"],
  "declaration-property-value-allowed-list": allowed({
    fontSize: FONT_SIZE_UI,
    spacing: spValue(SP_ATOM),
  }),
  "declaration-property-value-disallowed-list": disallowedValues,
};

// 오늘의 D-20 규칙 — 표시 파일에 마지막 override로 다시 건다(R3). 이전 stylelint.config.mjs 그대로.
const LEGACY_ALLOWED = {
  "font-family": ["/^var\\(--font-sans\\)$/"],
  "font-size": ["/^var\\(--fs-[\\w-]+\\)$/"],
  "border-radius": ["/^(0|var\\(--radius\\))$/"],
};
const LEGACY_DISALLOWED = {
  [LITERAL_COLOR_PROPS]: LITERAL_COLOR,
};

/** 경로의 글롭 특수 문자(괄호·대괄호 등)를 이스케이프해 정확히 그 파일만 맞춘다(T-04.6-08). */
const escapeGlob = (p) => p.replace(/[()[\]{}*?+@]/g, "[$&]");

/**
 * @param {string[]} markedFiles 이관 전 표시 파일(저장소 루트 기준 posix 상대 경로)
 */
export function createConfig(markedFiles) {
  const overrides = [
    // app/**: 글자 크기는 --text-body|aux|tag만(제목·부제는 ui/ 틀이 그린다)
    {
      files: ["app/**/*.css"],
      rules: {
        "declaration-property-value-allowed-list": allowed({
          fontSize: FONT_SIZE_APP,
          spacing: spValue(SP_ATOM),
        }),
      },
    },
    // app/c/**: 셸 없는 외부 수령자 화면(SYSTEM §6-5 · R12 · Q7 · Q10)
    {
      files: ["app/c/**/*.css"],
      rules: {
        "unit-disallowed-list": [
          PX_UNIT,
          {
            ignoreMediaFeatureNames: MEDIA_WIDTH,
            ignoreFunctions: ["env"],
            ignoreProperties: { px: ["margin-block"] },
          },
        ],
        "declaration-property-value-allowed-list": allowed({
          fontSize: FONT_SIZE_RECIPIENT,
          spacing: spValue(`(?:${SP_ATOM}|${SP_ENV_ATOM})`),
          extra: { "margin-block": [re(TOUCH_MARGIN_BLOCK)] },
        }),
      },
    },
    // ui/num · ui/input: font-variant-numeric 허용(숫자 컴포넌트 · 숫자 입력 칸 — Q10)
    {
      files: ["ui/num/**/*.css", "ui/input/**/*.css"],
      rules: { "property-disallowed-list": ["font"] },
    },
    // app/print: 인쇄 영구 예외 — px · mm · 간격 · 글자 크기 · font-variant-numeric 규칙을 끈다(Q9). 날 색은 그대로.
    {
      files: ["app/print/**/*.css"],
      rules: {
        "unit-disallowed-list": null,
        "property-disallowed-list": ["font"],
        "declaration-property-value-allowed-list": allowed({ fontSize: null, spacing: null }),
      },
    },
  ];

  // ★ 반드시 마지막 — 앞의 override가 다시 켜지 못하게
  if (markedFiles.length > 0) {
    overrides.push({
      files: markedFiles.map(escapeGlob),
      rules: {
        "unit-disallowed-list": null,
        "property-disallowed-list": ["font"],
        "declaration-property-value-allowed-list": LEGACY_ALLOWED,
        "declaration-property-value-disallowed-list": LEGACY_DISALLOWED,
      },
    });
  }

  return { rules: common, overrides };
}

export default createConfig(collectMarkedCssFiles(CONFIG_DIR));
