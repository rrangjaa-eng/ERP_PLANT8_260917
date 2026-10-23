import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// 07-24 감사 #12: loading 뼈대는 표와 같은 열 수로 선다(뼈대 6열 → 표 7열로 머리 폭이 바뀌던 것) — 소스 검사.
// 이 저장소에 React 렌더 테스트 러너가 없다(vendor-form-reason.test.ts 머리 주석). 실제 표 머리는 E2E가 잰다.
const DIR = resolve(process.cwd(), "app/(app)/projects/budget");

function keysIn(text: string): string[] {
  return [...text.matchAll(/\bkey: "(\w+)"/g)].map((match) => match[1] ?? "");
}

describe("예산 현황 loading 뼈대 열 (07-24 감사 #12)", () => {
  it("뼈대 열 key가 표 열 key와 같은 차례로 같다(행동 열 포함)", () => {
    const loading = readFileSync(resolve(DIR, "loading.tsx"), "utf8");
    const table = readFileSync(resolve(DIR, "budget-table.tsx"), "utf8");
    const start = table.indexOf("function columns(");
    const columnsSource = table.slice(start, table.indexOf("\n}\n", start));
    expect(keysIn(columnsSource)).toEqual(["project", "remaining", "status", "budget", "used", "po", "actions"]);
    expect(keysIn(loading)).toEqual(keysIn(columnsSource));
  });
});
