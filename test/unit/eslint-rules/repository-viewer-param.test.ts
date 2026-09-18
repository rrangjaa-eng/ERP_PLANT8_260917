import { RuleTester } from "@typescript-eslint/rule-tester";
import { afterAll, describe, it } from "vitest";
import rule from "../../../eslint/rules/repository-viewer-param.mjs";

RuleTester.afterAll = afterAll;
RuleTester.describe = describe;
RuleTester.it = it;

const ruleTester = new RuleTester();

// eslint/rules/*.mjs는 순수 JS라 meta.type 등이 리터럴로 좁혀지지 않는다 — 런타임 동작에는
// 영향 없고 RuleTester.run의 실제 파라미터 타입으로만 안전하게 좁혀 캐스팅한다.
type RuleModuleParam = Parameters<typeof ruleTester.run>[1];

ruleTester.run("repository-viewer-param", rule as unknown as RuleModuleParam, {
  valid: [
    {
      name: "viewer가 첫 인자인 function",
      filename: "repositories/x.ts",
      code: "export function f(viewer, id) {}",
    },
    {
      name: "viewer가 첫 인자인 화살표 함수(타입 포함)",
      filename: "repositories/x.ts",
      code: "export const g = async (viewer: Viewer) => {};",
    },
    {
      name: "타입 export는 무시",
      filename: "repositories/x.ts",
      code: "export type Row = {};",
    },
    {
      name: "repositories 밖 파일은 검사하지 않는다",
      filename: "domain/x.ts",
      code: "export function f(id) {}",
    },
  ],
  invalid: [
    {
      name: "viewer 없는 exported function",
      filename: "repositories/x.ts",
      code: "export function f(id) {}",
      errors: [{ messageId: "missingViewerParam" }],
    },
    {
      name: "viewer가 둘째 인자인 화살표 함수",
      filename: "repositories/x.ts",
      code: "export const g = (id, viewer) => {};",
      errors: [{ messageId: "missingViewerParam" }],
    },
  ],
});
