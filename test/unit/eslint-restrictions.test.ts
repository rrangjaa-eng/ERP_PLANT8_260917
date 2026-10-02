import { ESLint } from "eslint";
import { resolve } from "node:path";
import tseslint from "typescript-eslint";
import { describe, expect, it } from "vitest";
import restrictions from "../../eslint/restrictions.mjs";
import {
  MARKERS,
  collectMarked,
  stripMark,
} from "../../scripts/design/mark-legacy.mjs";
import { readFileSync } from "node:fs";

// app/**의 <table>·<dialog> 직접 그리기 금지(04.6 SC 2) 규칙과 TSX 이관 전 표시 래칫(공통 §3).
// 타입 정보가 필요 없는 규칙이라 ESLint API에 이 설정 배열과 TS 파서만 올려 lintText로 검증한다.

const ROOT = process.cwd();

const eslint = new ESLint({
  cwd: ROOT,
  overrideConfigFile: true,
  overrideConfig: [
    {
      files: ["**/*.{ts,tsx}"],
      languageOptions: {
        parser: tseslint.parser,
        parserOptions: { ecmaFeatures: { jsx: true } },
      },
    },
    ...restrictions,
  ],
});

async function errors(code: string, filePath: string) {
  const [result] = await eslint.lintText(code, { filePath: resolve(ROOT, filePath) });
  // 파일 안의 다른 규칙 disable 주석(이 최소 설정에는 없는 규칙)이 낳는 「규칙 정의 없음」 오류는 세지 않는다
  return (result?.messages ?? []).filter((m) => m.ruleId === "no-restricted-syntax");
}

const TABLE = `export default function P() { return <table><tbody /></table>; }\n`;
const DIALOG = `export default function P() { return <dialog open>x</dialog>; }\n`;

describe("eslint: app/**에서 <table>·<dialog> 직접 금지", () => {
  it("app/(app)/x/page.tsx의 <table>은 no-restricted-syntax 오류다", async () => {
    const found = await errors(TABLE, "app/(app)/x/page.tsx");
    expect(found.map((m) => m.ruleId)).toContain("no-restricted-syntax");
    expect(found[0]?.message).toContain("ui/table/Table");
  });

  it("app/(app)/x/page.tsx의 <dialog>는 오류다", async () => {
    const found = await errors(DIALOG, "app/(app)/x/page.tsx");
    expect(found.map((m) => m.ruleId)).toContain("no-restricted-syntax");
    expect(found[0]?.message).toContain("ui/confirm-dialog");
  });

  it("ui/table/Table.tsx 경로는 같은 코드가 통과한다", async () => {
    expect(await errors(TABLE, "ui/table/Table.tsx")).toHaveLength(0);
    expect(await errors(DIALOG, "ui/side-panel/SidePanel.tsx")).toHaveLength(0);
  });

  it("컴포넌트 <Table>은 걸리지 않는다", async () => {
    const code = `export default function P() { return <Table rows={[]} />; }\n`;
    expect(await errors(code, "app/(app)/x/page.tsx")).toHaveLength(0);
  });

  it("첫 줄 TSX 이관 전 표시가 있으면 통과한다", async () => {
    expect(await errors(`${MARKERS.tsx}\n${TABLE}`, "app/(app)/x/page.tsx")).toHaveLength(0);
  });

  it("\"use client\" 지시문 앞의 표시도 통과한다", async () => {
    const code = `${MARKERS.tsx}\n"use client";\n${TABLE}`;
    expect(await errors(code, "app/(app)/x/client.tsx")).toHaveLength(0);
  });
});

describe("eslint: TSX 이관 전 표시 래칫(공통 §3)", () => {
  const marked = collectMarked(ROOT, "tsx");

  it("표시 파일 수가 10 이상이다(공허 방지)", () => {
    expect(marked.length).toBeGreaterThanOrEqual(10);
  });

  it("표시를 떼면 오류가 ≥ 1이다 — 0이면 표시를 지워라", async () => {
    const stale: string[] = [];
    for (const file of marked) {
      const stripped = stripMark(readFileSync(resolve(ROOT, file), "utf8"), MARKERS.tsx);
      if ((await errors(stripped, file)).length === 0) stale.push(file);
    }
    expect(stale, `위반이 없는데 표시가 남은 파일 — 표시를 떼라: ${stale.join(", ")}`).toEqual([]);
  });

  it("표시 문구는 공통 §3 형식 하나뿐이다", () => {
    for (const file of marked) {
      const head = readFileSync(resolve(ROOT, file), "utf8").split("\n").slice(0, 3);
      const lines = head.filter((l) => l.includes("eslint-disable") && l.includes("이관 전"));
      expect(lines, file).toEqual([MARKERS.tsx]);
    }
  });
});
