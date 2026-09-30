import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// 04.1(결정 7b · 교차 페이즈 마이그레이션 규칙): drizzle 마이그레이터는 마지막
// 적용 created_at보다 when이 오래된 항목을 조용히 건너뛰고(node_modules/drizzle-orm/
// pg-core/dialect.js), drizzle-kit은 이름순 마지막 스냅숏을 이전 스키마로 쓴다.
// 병렬 브랜치 병합으로 journal 순서나 스냅숏 짝이 어긋나면 운영 적용이 조용히
// 빠지거나 다음 생성이 다른 페이즈의 변경을 다시 만든다 — 그 불변식을 지킨다.
// 번호 범위는 단언하지 않는다(페이즈별 번호 범위 지정은 폐지됐다).

const MIGRATIONS_DIR = resolve(process.cwd(), "db/migrations");
const META_DIR = resolve(MIGRATIONS_DIR, "meta");

type JournalEntry = { idx: number; tag: string; when: number };

const journal = JSON.parse(readFileSync(resolve(META_DIR, "_journal.json"), "utf8")) as { entries: JournalEntry[] };
const entries = journal.entries;
const pad = (idx: number) => String(idx).padStart(4, "0");

describe("db/migrations/meta/_journal.json 불변식", () => {
  it("항목이 하나 이상 있다", () => {
    expect(entries.length).toBeGreaterThan(0);
  });

  it("(a) idx가 0..n-1로 빈틈없다", () => {
    const broken = entries.filter((entry, i) => entry.idx !== i).map((entry) => `${entry.idx}:${entry.tag}`);
    expect(broken, `idx가 순번과 다른 항목: ${broken.join(", ")}`).toEqual([]);
  });

  it("(b) 각 tag가 0 채운 idx + '_'로 시작한다", () => {
    const broken = entries.filter((entry) => !entry.tag.startsWith(`${pad(entry.idx)}_`)).map((entry) => entry.tag);
    expect(broken, `tag 접두가 idx와 다른 항목: ${broken.join(", ")}`).toEqual([]);
  });

  it("(c) when이 앞 항목보다 엄격히 크다", () => {
    const broken = entries.filter((entry, i) => i > 0 && entry.when <= (entries[i - 1]?.when ?? 0)).map((entry) => entry.tag);
    expect(broken, `when이 증가하지 않는 항목: ${broken.join(", ")}`).toEqual([]);
  });

  it("(d) 각 tag의 .sql 파일이 있다", () => {
    const missing = entries.filter((entry) => !existsSync(resolve(MIGRATIONS_DIR, `${entry.tag}.sql`))).map((entry) => `${entry.tag}.sql`);
    expect(missing, `없는 SQL 파일: ${missing.join(", ")}`).toEqual([]);
  });

  it("(e) 각 idx의 meta/{idx 네 자리}_snapshot.json이 있다", () => {
    const missing = entries
      .map((entry) => `${pad(entry.idx)}_snapshot.json`)
      .filter((file) => !existsSync(resolve(META_DIR, file)));
    expect(missing, `없는 스냅숏: ${missing.join(", ")}`).toEqual([]);
  });

  it("(f) meta/의 스냅숏 파일 집합이 journal idx 집합과 정확히 같다(고아 스냅숏 없음)", () => {
    const snapshots = readdirSync(META_DIR)
      .filter((file) => file.endsWith("_snapshot.json"))
      .sort();
    const expected = entries.map((entry) => `${pad(entry.idx)}_snapshot.json`).sort();
    expect(snapshots, "journal에 없는 스냅숏이 있거나 빠진 스냅숏이 있다").toEqual(expected);
  });
});
