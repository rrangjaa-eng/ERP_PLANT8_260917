import path from "node:path";
import { RuleTester } from "@typescript-eslint/rule-tester";
import { afterAll, describe, it } from "vitest";
import rule from "../../../eslint/rules/money-boundary.mjs";

RuleTester.afterAll = afterAll;
RuleTester.describe = describe;
RuleTester.it = it;

const fixturesDir = path.join(import.meta.dirname, "fixtures");

const ruleTester = new RuleTester({
  languageOptions: {
    parserOptions: {
      project: "./tsconfig.json",
      tsconfigRootDir: fixturesDir,
    },
  },
});

// eslint/rules/*.mjs는 순수 JS라 meta.type 등이 리터럴로 좁혀지지 않는다 — 런타임 동작에는
// 영향 없고 RuleTester.run의 실제 파라미터 타입으로만 안전하게 좁혀 캐스팅한다.
type RuleModuleParam = Parameters<typeof ruleTester.run>[1];

ruleTester.run("money-boundary", rule as unknown as RuleModuleParam, {
  valid: [
    {
      name: "숫자 산술은 통과",
      filename: "plain-arithmetic.ts",
      code: "export const n = 1 + 2;",
    },
    {
      name: "domain/money 안의 Money 산술은 예외(경로 exempt)",
      filename: "domain/money/index.ts",
      code: 'import type { Money } from "../../money";\n\ndeclare const a: Money;\ndeclare const b: Money;\n\nexport const c = a + b;',
    },
    {
      name: "Money가 아닌 branded 타입 산술은 통과",
      filename: "other-brand-arithmetic.ts",
      code: 'import type { OtherBrand } from "./money";\n\ndeclare const x: OtherBrand;\ndeclare const y: OtherBrand;\n\nexport const z = x + y;',
    },
  ],
  invalid: [
    {
      name: "Money + Money",
      filename: "money-add.ts",
      code: 'import type { Money } from "./money";\n\ndeclare const a: Money;\ndeclare const b: Money;\n\nexport const c = a + b;',
      errors: [{ messageId: "moneyArithmeticOutsideModule" }],
    },
    {
      name: "Money 복합 할당(+=)",
      filename: "money-compound-assign.ts",
      code: "import type { Money } from \"./money\";\n\ndeclare let total: number;\ndeclare const fee: Money;\n\ntotal += fee;",
      errors: [{ messageId: "moneyArithmeticOutsideModule" }],
    },
    {
      name: "Money 단항 마이너스",
      filename: "money-unary.ts",
      code: 'import type { Money } from "./money";\n\ndeclare const price: Money;\n\nexport const negated = -price;',
      errors: [{ messageId: "moneyArithmeticOutsideModule" }],
    },
  ],
});
