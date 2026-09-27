import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// drizzle 저널 가드(04.2-04 · Codex 2차 #10) — 04.2-06의 마이그레이션 검증과 04.2-14의
// 통합 절차가 기댄다. 번호는 생성기가 붙인다: 특정 태그·개수를 고정하지 않는다.

interface JournalEntry {
  idx: number;
  when: number;
  tag: string;
}

const MIGRATIONS_DIR = join(process.cwd(), "db/migrations");
const journal = JSON.parse(readFileSync(join(MIGRATIONS_DIR, "meta/_journal.json"), "utf8")) as {
  entries: JournalEntry[];
};
const entries = journal.entries;

describe("db/migrations/meta/_journal.json", () => {
  it("항목이 있다", () => {
    expect(entries.length).toBeGreaterThan(0);
  });

  it("idx가 0..n-1로 연속이다", () => {
    entries.forEach((e, i) => expect(e.idx).toBe(i));
  });

  it("tag가 0 채운 idx + '_'로 시작한다", () => {
    for (const e of entries) expect(e.tag.startsWith(`${String(e.idx).padStart(4, "0")}_`)).toBe(true);
  });

  it("when이 앞 항목보다 엄격히 크다", () => {
    for (let i = 1; i < entries.length; i++) expect(entries[i]!.when).toBeGreaterThan(entries[i - 1]!.when);
  });

  it("tag마다 SQL 파일이 있다", () => {
    for (const e of entries) expect(existsSync(join(MIGRATIONS_DIR, `${e.tag}.sql`)), `${e.tag}.sql`).toBe(true);
  });
});
