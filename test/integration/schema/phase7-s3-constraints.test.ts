import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { codeItems, expenses, files } from "@/db/schema";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { makePerson } from "../approvals-fixtures";

// 07-11(스키마 S3) — R20 파일 칸 files.private_to_owner(기본값 · 백필 재실행), 거래처 · 프로젝트 표 묶음 · 예산 이력 CHECK(D-729 · D-730) ·
// PO 번호 중복 허용(D-737) · 파일 주인 종류 새 값이 DB에서 직접 막히는지(도메인을 거치지 않는 최후 방어선). 행은 db.insert로 직접 넣는다.
// 단언 규칙(E-42): drizzle 0.45는 pg 오류를 DrizzleQueryError로 감싸 원본을 .cause에 두므로 cause.code · cause.constraint로 본다.

async function person(label: string): Promise<string> {
  const made = await makePerson(label, DEFAULT_ROLE_ID, null);
  return made.id;
}

// 마이그레이션 원문에서 백필 UPDATE 문만 뽑는다 — 번호가 아니라 꼬리 이름으로 찾는다(PR-S 재생성 뒤에도 같다 · vendor-kind.test.ts 꼴).
function updateStatements(tail: string, table: string): string[] {
  const dir = path.join(process.cwd(), "db/migrations");
  const file = readdirSync(dir).find((name) => name.endsWith(tail));
  if (!file) throw new Error(`*${tail} 마이그레이션이 없습니다`);
  return readFileSync(path.join(dir, file), "utf8")
    .split("--> statement-breakpoint")
    .map((chunk) =>
      chunk
        .split("\n")
        .filter((line) => !line.trim().startsWith("--"))
        .join("\n")
        .trim(),
    )
    .filter((statement) => new RegExp(`^UPDATE "?${table}"? `).test(statement));
}

async function insertFile(ownerKind: string, ownerId: string, uploadedBy: string): Promise<string> {
  const [row] = await db
    .insert(files)
    .values({
      ownerKind,
      ownerId,
      objectKey: `evidence/${randomUUID()}`,
      sha256: "a".repeat(64),
      sizeBytes: 10,
      contentType: "application/pdf",
      originalName: "증빙.pdf",
      uploadedBy,
    })
    .returning({ id: files.id });
  if (!row) throw new Error("파일 행 없음");
  return row.id;
}

async function evidenceType(privateToOwner: boolean): Promise<string> {
  const value = `s3-${randomUUID()}`;
  await db.insert(codeItems).values({ tableKey: "evidence_type", value, label: `종류-${value}`, privateToOwner });
  return value;
}

async function expenseWith(drafterId: string, type: string | null): Promise<string> {
  const [row] = await db.insert(expenses).values({ drafterId, evidenceType: type }).returning({ id: expenses.id });
  if (!row) throw new Error("지출결의 행 없음");
  return row.id;
}

describe("07 S3 — R20 파일 칸 files.private_to_owner(AQ-15)", () => {
  it("새로 넣은 파일 행은 private_to_owner = false(기본값)", async () => {
    const uploader = await person("올린 사람");
    const fileId = await insertFile("expense", randomUUID(), uploader);
    const [row] = await db.execute<{ private_to_owner: boolean }>(sql`SELECT private_to_owner FROM files WHERE id = ${fileId}`).then((r) => r.rows);
    expect(row?.private_to_owner).toBe(false);
  });

  it("백필 UPDATE를 다시 돌리면 비공개 종류 지출결의 파일만 true · 공개 종류 · 다른 주인 종류는 false · 두 번 돌려도 같다", async () => {
    const uploader = await person("올린 사람");
    const privateType = await evidenceType(true);
    const publicType = await evidenceType(false);
    const privateExpense = await expenseWith(uploader, privateType);
    const publicExpense = await expenseWith(uploader, publicType);
    const noTypeExpense = await expenseWith(uploader, null);

    const privateFile = await insertFile("expense", privateExpense, uploader);
    const publicFile = await insertFile("expense", publicExpense, uploader);
    const noTypeFile = await insertFile("expense", noTypeExpense, uploader);
    // 다른 주인 종류 — owner_id가 비공개 종류 지출결의 id와 같아도 주인 종류가 다르면 대상이 아니다.
    const revisionFile = await insertFile("quote_revision", privateExpense, uploader);
    const reserveFile = await insertFile("reserve_entry", privateExpense, uploader);
    const cardFile = await insertFile("corp_card_usage", privateExpense, uploader);
    const ids = [privateFile, publicFile, noTypeFile, revisionFile, reserveFile, cardFile];

    const statements = updateStatements("_phase7_file_private_flag.sql", "files");
    expect(statements).toHaveLength(1);

    const flags = async () => {
      const rows = await db.execute<{ id: string; private_to_owner: boolean }>(
        sql`SELECT id, private_to_owner FROM files WHERE id IN (${sql.join(
          ids.map((id) => sql`${id}`),
          sql`, `,
        )})`,
      );
      return Object.fromEntries(rows.rows.map((r) => [r.id, r.private_to_owner]));
    };
    const expected = {
      [privateFile]: true,
      [publicFile]: false,
      [noTypeFile]: false,
      [revisionFile]: false,
      [reserveFile]: false,
      [cardFile]: false,
    };

    await db.execute(sql`UPDATE files SET private_to_owner = false WHERE id IN (${sql.join(
      ids.map((id) => sql`${id}`),
      sql`, `,
    )})`);
    for (const statement of statements) await db.execute(sql.raw(statement));
    expect(await flags()).toEqual(expected);

    for (const statement of statements) await db.execute(sql.raw(statement));
    expect(await flags()).toEqual(expected);

  });
});
