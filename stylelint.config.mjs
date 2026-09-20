// D-20: "새 색·서체·radius 생성 금지, 토큰은 tokens.css에서만"을 강제한다.
// 금지 범위는 색·서체·radius 셋뿐이다 — 간격(margin/padding/gap)은 대상이 아니다
// (02-CONTEXT.md D-20 2026-09-19 사용자 비준: 실물 HTML 간격 리터럴 283건 중
// 175건이 tokens.css 4px 배수 스케일에 대응하지 않는다).
// docs/design/tokens.css는 별도 예외 처리하지 않는다 — package.json의 lint
// 스크립트가 넘기는 glob을 앱 CSS(ui/**/*.module.css · app/globals.css ·
// app/**/*.module.css)로 한정해 docs/가 애초에 스캔 대상에 들지 않는다.
const stylelintConfig = {
  rules: {
    // ── 단일 값이어야 하는 스칼라 속성: 전체 값이 var()와 정확히 일치해야 함 ──
    "declaration-property-value-allowed-list": {
      "font-family": ["/^var\\(--font-sans\\)$/"],
      "font-size": ["/^var\\(--fs-[\\w-]+\\)$/"],
      "border-radius": ["/^(0|var\\(--radius\\))$/"],
    },
    // ── 복합/축약 속성: 값 전체 대신 "리터럴 색"만 부분 매치로 금지 ──
    // box-shadow의 px 오프셋, border의 style 키워드 등은 그대로 통과한다.
    "declaration-property-value-disallowed-list": {
      "/^(color|background|background-color|.*border.*color.*|outline-color|fill|stroke|accent-color|caret-color|box-shadow|border|outline|background-image)$/":
        ["/#[0-9a-f]{3,8}\\b/i", "/\\brgba?\\(/i", "/\\bhsla?\\(/i"],
    },
    // ── WR-08: 이름 있는 색상(white, red, rebeccapurple...) 금지.
    // currentColor/inherit/transparent는 색상 키워드 문법이 아니라서 걸리지 않는다.
    "color-named": "never",
    // ── WR-08: 최신 색상 함수도 리터럴 색이므로 hex/rgb/hsl과 동일하게 금지한다.
    // calc()는 목록에 넣지 않는다 — 간격 등에서 계속 쓰인다.
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
    // ── WR-08: font 축약은 font-family/font-size 허용 목록을 우회하므로 통째로 금지하고
    // 항상 롱핸드(font-family/font-size)를 쓰게 강제한다.
    "property-disallowed-list": ["font"],
  },
};

export default stylelintConfig;
