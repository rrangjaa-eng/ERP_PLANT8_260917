import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import tseslint from "typescript-eslint";
import boundaries from "eslint-plugin-boundaries";
import plant8 from "./eslint/index.mjs";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    settings: {
      "boundaries/elements": [
        { type: "app", pattern: "app/**" },
        { type: "domain", pattern: "domain/**" },
        { type: "repositories", pattern: "repositories/**" },
        { type: "db", pattern: "db/**" },
        { type: "lib", pattern: "lib/**" },
        { type: "scripts", pattern: "scripts/**" },
        { type: "test", pattern: "test/**" },
        { type: "eslint", pattern: "eslint/**" },
        { type: "ui", pattern: "ui/**" },
      ],
    },
    plugins: { boundaries, plant8 },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      // 4계층 경계(app→domain/lib만, domain→app 금지, db는 아무도 import 안 함) — Issue 1·13A
      "boundaries/element-types": [
        "error",
        {
          default: "disallow",
          rules: [
            { from: "app", allow: ["app", "domain", "lib", "ui"] },
            { from: "domain", allow: ["domain", "repositories", "lib"] },
            { from: "repositories", allow: ["repositories", "db", "domain"] },
            // db/client.ts는 lib/env.ts(환경 변수 계약)를 읽어야 한다 — lib는 횡단 모듈
            // 이므로 db→lib 한 방향은 허용(db→domain은 여전히 금지, 01-01 기존 코드).
            { from: "db", allow: ["db", "lib"] },
            { from: "lib", allow: ["lib", "domain", "repositories", "db"] },
            { from: "scripts", allow: ["scripts", "domain", "repositories", "db", "lib"] },
            {
              from: "test",
              // eslint-rules 테스트가 eslint/rules/*.mjs를 직접 import해 규칙을 검증한다.
              // ui는 D-24의 「내 차례」 단위 테스트가 ui/next-turn/build-next-turn-view.ts를
              // import해야 해서 더했다(02-RESEARCH.md 교차 의존 발견).
              allow: [
                "test",
                "app",
                "domain",
                "repositories",
                "db",
                "lib",
                "scripts",
                "eslint",
                "ui",
              ],
            },
            { from: "eslint", allow: ["eslint"] },
            // ui는 순수 표현 계층 — domain/repositories/db/app을 import할 수 없다(D-26).
            { from: "ui", allow: ["ui", "lib"] },
          ],
        },
      ],
      "plant8/require-action-client": "error",
      "plant8/repository-viewer-param": "error",
      "plant8/money-boundary": "error",
    },
  },
  // *.mjs는 tsconfig project service 밖(타입 정보 없음) — type-checked 규칙 제외.
  // money-boundary는 타입 정보가 필수라 그 자체를 끈다(설정 오류로 오인되지 않게).
  {
    files: ["**/*.mjs"],
    extends: [tseslint.configs.disableTypeChecked],
    rules: {
      "plant8/money-boundary": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "dist/**",
    "playwright-report/**",
    "test-results/**",
    // 벤더링된 GSD·gstack 도구 — 이 앱의 코드가 아니다.
    ".claude/**",
    // eslint-rules 규칙 테스트 픽스처 — 의도적으로 규칙을 위반하는 예시 코드라
    // pnpm lint(실제 앱 스캔) 대상이 아니다. RuleTester가 직접 읽어 검증한다.
    "test/unit/eslint-rules/fixtures/**",
  ]),
]);

export default eslintConfig;
