import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// 04.5-08: 01이 손으로 고친 마이그레이션의 문장 순서 가드. 07의 머지 직전 재생성(`db:generate`)이
// 손 편집을 지우면 빨개진다 — 재생성 뒤 손 편집을 다시 입혔는지 확인하는 장치다.
// 판정은 SQL 문자열 안의 위치(indexOf)로 한다.
const MIGRATIONS_DIR = path.join(process.cwd(), "db/migrations");

function readMigration(): string {
  const files = readdirSync(MIGRATIONS_DIR).filter((name) => name.endsWith("_custom_field_admin.sql"));
  expect(files, "custom_field_admin 마이그레이션은 정확히 하나").toHaveLength(1);
  return readFileSync(path.join(MIGRATIONS_DIR, files[0] as string), "utf8");
}

const FILL_LABEL = 'UPDATE "field_definitions" SET "label" = "key"';
const DROP_LABEL_DEFAULT = 'ALTER COLUMN "label" DROP DEFAULT';
const LABEL_UNIQUE = "field_definitions_entity_label_key";
const VISIBILITY_FILL = 'INSERT INTO "visibility_matrix"';
const VISIBILITY_CONFLICT = 'ON CONFLICT ("role_id", "info_item") DO NOTHING';

// 순서 위반 목록(빈 배열이면 통과).
function orderViolations(sql: string): string[] {
  const violations: string[] = [];
  const fill = sql.indexOf(FILL_LABEL);
  const dropDefault = sql.indexOf(DROP_LABEL_DEFAULT);
  const unique = sql.indexOf(LABEL_UNIQUE);
  const visibility = sql.indexOf(VISIBILITY_FILL);

  if (fill < 0) violations.push("label 채움 문장이 없다");
  if (dropDefault < 0) violations.push("label 기본값 제거가 없다");
  if (unique < 0) violations.push("(entity, label) 유일 제약이 없다");
  if (visibility < 0) violations.push("노출 행 채움이 없다");
  if (violations.length > 0) return violations;

  if (fill > dropDefault) violations.push("label 채움이 기본값 제거보다 뒤다");
  if (fill > unique) violations.push("label 채움이 유일 제약보다 뒤다");
  if (visibility < dropDefault) violations.push("노출 행 채움이 기본값 제거보다 앞이다");
  if (visibility < unique) violations.push("노출 행 채움이 유일 제약보다 앞이다");
  if (!sql.slice(visibility).includes(VISIBILITY_CONFLICT)) violations.push("노출 행 채움에 ON CONFLICT DO NOTHING이 없다");
  return violations;
}

describe("0023 custom_field_admin 마이그레이션 문장 순서 (04.5-08)", () => {
  it("label 채움 → 기본값 제거 · 유일 제약 → 노출 행 채움 순서다", () => {
    expect(orderViolations(readMigration())).toEqual([]);
  });

  it("유일 제약은 유일 인덱스 + USING INDEX 모양이고 lock_timeout 머리가 있다", () => {
    const sql = readMigration();
    expect(sql).toMatch(/CREATE UNIQUE INDEX "field_definitions_entity_label_key" ON "field_definitions"/);
    expect(sql).toMatch(
      /ADD CONSTRAINT "field_definitions_entity_label_key" UNIQUE USING INDEX "field_definitions_entity_label_key"/,
    );
    expect(sql).toMatch(/SET LOCAL lock_timeout = '1s';/);
  });

  it("version은 NOT NULL 기본 1이고 archived_options는 NOT NULL 기본 빈 배열이다", () => {
    const sql = readMigration();
    expect(sql).toMatch(/ADD COLUMN "version" integer DEFAULT 1 NOT NULL/);
    expect(sql).toMatch(/ADD COLUMN "archived_options" jsonb DEFAULT '\[\]'::jsonb NOT NULL/);
  });

  it("노출 행 채움은 ON CONFLICT (role_id, info_item) DO NOTHING을 담는다", () => {
    expect(readMigration()).toContain(VISIBILITY_CONFLICT);
  });

  it("가드가 살아 있다 — 채움 줄을 지운 사본은 위반으로 잡힌다", () => {
    const mutated = readMigration().replace(FILL_LABEL, "-- removed");
    expect(orderViolations(mutated)).toContain("label 채움 문장이 없다");
  });

  it("가드가 살아 있다 — 노출 행 채움이 유일 제약 앞으로 옮겨진 사본은 위반으로 잡힌다", () => {
    const sql = readMigration();
    const visibilityStart = sql.indexOf(VISIBILITY_FILL);
    const moved = VISIBILITY_FILL + sql.slice(0, visibilityStart);
    expect(orderViolations(moved)).toContain("노출 행 채움이 기본값 제거보다 앞이다");
  });

  it("가드가 살아 있다 — ON CONFLICT를 지운 사본은 위반으로 잡힌다", () => {
    const mutated = readMigration().replace(VISIBILITY_CONFLICT, "");
    expect(orderViolations(mutated)).toContain("노출 행 채움에 ON CONFLICT DO NOTHING이 없다");
  });
});
