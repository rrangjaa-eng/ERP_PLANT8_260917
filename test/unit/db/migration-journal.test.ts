import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// journal 가드(오케스트레이터 사실 2, 04.3-RESEARCH.md Pitfall 4) — drizzle의
// migrate()는 마지막으로 적용된 항목보다 `when`이 새로운 항목만 적용한다
// (node_modules/drizzle-orm/pg-core/dialect.js). idx 연속성 · tag 접두어 =
// idx 네 자리 · when 엄격 증가가 어긋나면 스테이징·프로덕션이 마이그레이션을
// 조용히 건너뛴다 — 이 테스트가 그 불변식을 고정한다.

const JOURNAL_PATH = resolve(process.cwd(), "db/migrations/meta/_journal.json");

type JournalEntry = { idx: number; tag: string; when: number };

describe("db/migrations/meta/_journal.json 무결성", () => {
  const journal = JSON.parse(readFileSync(JOURNAL_PATH, "utf8")) as { entries: JournalEntry[] };

  it("entries를 하나 이상 읽었다", () => {
    expect(journal.entries.length).toBeGreaterThan(0);
  });

  it("idx가 0부터 연속이다", () => {
    journal.entries.forEach((entry, i) => {
      expect(entry.idx).toBe(i);
    });
  });

  it("각 tag가 idx를 네 자리로 채운 접두어로 시작한다", () => {
    for (const entry of journal.entries) {
      const prefix = String(entry.idx).padStart(4, "0");
      expect(entry.tag.startsWith(prefix)).toBe(true);
    }
  });

  it("when이 엄격히 증가한다", () => {
    for (let i = 1; i < journal.entries.length; i++) {
      expect(journal.entries[i]!.when).toBeGreaterThan(journal.entries[i - 1]!.when);
    }
  });
});
