import { RuleTester } from "@typescript-eslint/rule-tester";
import { afterAll, describe, it } from "vitest";
import rule from "../../../eslint/rules/require-action-client.mjs";

RuleTester.afterAll = afterAll;
RuleTester.describe = describe;
RuleTester.it = it;

const ruleTester = new RuleTester();

// eslint/rules/*.mjs는 순수 JS라 meta.type 등이 리터럴로 좁혀지지 않는다 — 런타임 동작에는
// 영향 없고 RuleTester.run의 실제 파라미터 타입으로만 안전하게 좁혀 캐스팅한다(새 패키지
// 의존성 없이 @typescript-eslint/utils의 RuleModule 타입을 우회).
type RuleModuleParam = Parameters<typeof ruleTester.run>[1];

const jsxOptions = { languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } } };

ruleTester.run("require-action-client", rule as unknown as RuleModuleParam, {
  valid: [
    {
      name: "authedActionClient로 감싼 use server export",
      code: '"use server";\nexport const a = authedActionClient.schema(z.object({})).action(async () => {});',
    },
    {
      name: "디렉티브 없는 파일의 export function",
      code: "export function f() {}",
    },
    {
      name: "함수 본문 첫 문장이 use client인 경우는 통과(use server만 검사)",
      filename: "app/x/page.tsx",
      ...jsxOptions,
      code: 'export default function Page() {\n  async function save() {\n    "use client";\n  }\n  return null;\n}',
    },
  ],
  invalid: [
    {
      name: "use server 파일의 export async function은 항상 report",
      code: '"use server";\nexport async function f() {}',
      errors: [{ messageId: "missingActionClient" }],
    },
    {
      name: "승인 목록 밖 클라이언트로 감싼 export",
      code: '"use server";\nexport const g = actionClient.action(async () => {});',
      errors: [{ messageId: "missingActionClient" }],
    },
    {
      name: "export default는 항상 report",
      code: '"use server";\nexport default authedActionClient.action(async () => {});',
      errors: [{ messageId: "missingActionClient" }],
    },
    {
      name: "디렉티브 없는 파일의 인라인 서버 액션(중첩 함수 선언)",
      filename: "app/x/page.tsx",
      ...jsxOptions,
      code: 'export default function Page() {\n  async function save() {\n    "use server";\n  }\n  return null;\n}',
      errors: [{ messageId: "inlineUseServer" }],
    },
    {
      name: "디렉티브 없는 파일의 인라인 서버 액션(화살표 함수 본문)",
      filename: "app/x/page.tsx",
      ...jsxOptions,
      code: 'const f = async () => {\n  "use server";\n};',
      errors: [{ messageId: "inlineUseServer" }],
    },
  ],
});
