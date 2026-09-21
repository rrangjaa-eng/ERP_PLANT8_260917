import path from "node:path";
import { RuleTester } from "@typescript-eslint/rule-tester";
import { afterAll, describe, it } from "vitest";
import rule from "../../../eslint/rules/no-row-type-escape.mjs";

RuleTester.afterAll = afterAll;
RuleTester.describe = describe;
RuleTester.it = it;

const fixturesDir = path.join(import.meta.dirname, "fixtures");

// money-boundary.test.ts와 같은 골격: 이 규칙도 type-aware라 파서에 프로젝트
// 정보(tsconfig)를 붙인다. 픽스처 파일은 실제로 fixtures/ 아래 존재해야 한다
// (RuleTester가 project 모드에서 디스크의 파일을 읽어 타입을 계산한다).
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

ruleTester.run("no-row-type-escape", rule as unknown as RuleModuleParam, {
  valid: [
    {
      name: "domain에서 Dto 반환은 통과",
      filename: "domain/dto-return.ts",
      code: 'export type ItemDto = { id: string; label: string };\n\nexport function getItemDto(): ItemDto {\n  return { id: "1", label: "x" };\n}\n',
    },
    {
      name: "domain에서 Promise<Dto | null> 반환은 통과",
      filename: "domain/promise-dto.ts",
      code: "export type ItemDto = { id: string; label: string };\n\nexport async function findItemDto(): Promise<ItemDto | null> {\n  return null;\n}\n",
    },
    {
      name: "domain에서 Dto[] 반환은 통과",
      filename: "domain/array-dto.ts",
      code: "export type ItemDto = { id: string; label: string };\n\nexport function listItemDtos(): ItemDto[] {\n  return [];\n}\n",
    },
    {
      name: "repositories 계층에서 Row 반환은 그 계층의 일이라 통과(domain 밖)",
      filename: "repositories/row-return.ts",
      code: "export type ItemRow = { id: string; label: string };\n\nexport function findItemRow(): ItemRow | null {\n  return null;\n}\n",
    },
  ],
  invalid: [
    {
      name: "domain에서 Row 직접 반환",
      filename: "domain/row-direct.ts",
      code: 'export type ItemRow = { id: string; label: string };\n\nexport function getItemRow(): ItemRow {\n  return { id: "1", label: "x" };\n}\n',
      errors: [{ messageId: "rowTypeLeak" }],
    },
    {
      name: "domain에서 Row 배열 반환",
      filename: "domain/row-array.ts",
      code: "export type ItemRow = { id: string; label: string };\n\nexport function listItemRows(): ItemRow[] {\n  return [];\n}\n",
      errors: [{ messageId: "rowTypeLeak" }],
    },
    {
      name: "domain에서 Promise<Row> 반환",
      filename: "domain/row-promise-direct.ts",
      code: 'export type ItemRow = { id: string; label: string };\n\nexport async function findItemRow(): Promise<ItemRow> {\n  return { id: "1", label: "x" };\n}\n',
      errors: [{ messageId: "rowTypeLeak" }],
    },
    {
      name: "domain에서 Promise<Row[]> 반환(배열 + Promise 둘 다)",
      filename: "domain/row-promise-array.ts",
      code: "export type ItemRow = { id: string; label: string };\n\nexport async function listItemRowsAsync(): Promise<ItemRow[]> {\n  return [];\n}\n",
      errors: [{ messageId: "rowTypeLeak" }],
    },
    {
      name: "domain에서 유니언 갈래 하나만 Row(repositories/permissions.ts findPermission과 같은 모양)",
      filename: "domain/row-union.ts",
      code: "export type ItemRow = { id: string; label: string };\n\nexport async function findItemRowOrNull(): Promise<ItemRow | null> {\n  return null;\n}\n",
      errors: [{ messageId: "rowTypeLeak" }],
    },
    {
      name: "domain에서 화살표 함수(export const)로 Row 반환",
      filename: "domain/row-arrow.ts",
      code: 'export type ItemRow = { id: string; label: string };\n\nexport const getItemRowArrow = (): ItemRow => ({ id: "1", label: "x" });\n',
      errors: [{ messageId: "rowTypeLeak" }],
    },
  ],
});

// 타입 정보가 없는 파일에서 조용히 통과하지 않는다 — project 없이(기본 파서
// 설정, repository-viewer-param.test.ts와 같은 형태) domain 파일을 검사하면
// 설정 오류를 파일당 한 번 보고해야 한다.
const ruleTesterNoTypeInfo = new RuleTester();

ruleTesterNoTypeInfo.run("no-row-type-escape (타입 정보 없음)", rule as unknown as RuleModuleParam, {
  valid: [
    {
      name: "domain 밖 파일은 타입 정보가 없어도 검사하지 않는다",
      filename: "lib/x.ts",
      code: "export function f() { return 1; }",
    },
  ],
  invalid: [
    {
      name: "타입 정보 없는 domain 파일은 설정 오류를 보고한다(조용히 통과하지 않는다)",
      filename: "domain/no-type-info.ts",
      code: "export function f() { return 1; }",
      errors: [{ messageId: "missingTypeInformation" }],
    },
  ],
});
