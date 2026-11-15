import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

// 08-02(D8-05 · Task 2): source 칸이 있는 표 9개에 쓰는 저장소 insert는 전부 rowSource로 source를 정한다 —
// 전환 뒤 새 행이 'demo'로 찍히지 않게. 새 insert가 생기면 이 고정 목록이 빨개져 rowSource 누락을 CI가 잡는다.

const ROOT = process.cwd();
const SOURCE_TABLE_VARS = [
  "projects",
  "quoteRevisions",
  "quoteLines",
  "revenueEntries",
  "revenueIssueRequests",
  "reserveEntries",
  "corpCardUsages",
  "expensePayments",
  "purchaseRequests",
];
const INSERT_PATTERN = new RegExp(`\\.insert\\((${SOURCE_TABLE_VARS.join("|")})\\)`, "g");

const EXPECTED_WRITERS: Record<string, number> = {
  "repositories/corp-card-usages.ts": 1,
  "repositories/expense-payments.ts": 1,
  "repositories/projects.ts": 1,
  "repositories/purchase-requests.ts": 1,
  "repositories/quote-lines.ts": 3,
  "repositories/quote-revisions.ts": 2,
  "repositories/reserve-entries.ts": 1,
  "repositories/revenue-entries.ts": 1,
  "repositories/revenue-issue-requests.ts": 1,
};

function tsFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return tsFiles(path);
    return path.endsWith(".ts") ? [path] : [];
  });
}

const files = tsFiles(join(ROOT, "repositories")).map((path) => ({ path: relative(ROOT, path), text: readFileSync(path, "utf8") }));

describe("source 칸 표의 쓰기 지점(08-02)", () => {
  it("source 칸 표 9개의 insert 위치가 고정 목록(파일 · 개수)과 같다", () => {
    const found: Record<string, number> = {};
    for (const file of files) {
      const count = [...file.text.matchAll(INSERT_PATTERN)].length;
      if (count > 0) found[file.path] = count;
    }
    expect(found).toEqual(EXPECTED_WRITERS);
  });

  it("쓰기 지점 파일마다 insert 수만큼 rowSource( 호출이 있다", () => {
    for (const [path, inserts] of Object.entries(EXPECTED_WRITERS)) {
      const text = files.find((file) => file.path === path)?.text ?? "";
      expect([...text.matchAll(/rowSource\(/g)].length, path).toBeGreaterThanOrEqual(inserts);
    }
  });

  it('repositories/에서 "demo" 글자는 repositories/cutover.ts 밖에 없다', () => {
    const offenders = files.filter((file) => file.path !== "repositories/cutover.ts" && file.text.includes('"demo"')).map((file) => file.path);
    expect(offenders).toEqual([]);
  });
});
