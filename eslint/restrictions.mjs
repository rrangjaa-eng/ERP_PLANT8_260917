// 04.6 스킨 A: app/**는 표·확인 창·옆 패널을 직접 그리지 않고 ui/ 컴포넌트를 쓴다(ROADMAP 04.6 SC 2).
// 아직 옮기지 않은 파일은 `ignores` 목록이 아니라 파일 첫 줄 이관 전 표시로 뺀다(공통 §3):
//   /* eslint-disable no-restricted-syntax -- 04.6 스킨 A 이관 전 */
// 표시는 scripts/design/mark-legacy.mjs --add가 넣고 test/unit/eslint-restrictions.test.ts 래칫이 지킨다.
// 주의: 한 파일에 no-restricted-syntax를 둔 설정 객체가 둘이면 뒤가 앞을 교체한다 — 이 규칙은 여기에만 둔다.
/** @type {import("eslint").Linter.Config[]} */
const restrictions = [
  {
    files: ["app/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "JSXOpeningElement[name.name='table']",
          message: "app/**에서 <table> 직접 금지 — ui/table/Table 또는 TableSkeleton을 쓴다",
        },
        {
          selector: "JSXOpeningElement[name.name='dialog']",
          message: "app/**에서 <dialog> 직접 금지 — ui/confirm-dialog 또는 ui/side-panel을 쓴다",
        },
      ],
    },
  },
];

export default restrictions;
