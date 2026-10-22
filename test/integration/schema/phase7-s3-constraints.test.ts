import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { eq, sql, TransactionRollbackError } from "drizzle-orm";
import { db } from "@/db/client";
import {
  codeItems,
  expenses,
  files,
  projectBudgetEntries,
  projectDocuments,
  projects,
  quoteRevisions,
  vendorAccountChanges,
  vendorContacts,
  vendorDocuments,
  vendors,
} from "@/db/schema";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { insertVendor } from "@/repositories/vendors";
import { makePerson, teamIdByName } from "../approvals-fixtures";

// 07-11(스키마 S3) — R20 파일 칸 files.private_to_owner(기본값 · 백필 재실행), 거래처 · 프로젝트 표 묶음 · 예산 이력 CHECK(D-729 · D-730) ·
// PO 번호 중복 허용(D-737) · 파일 주인 종류 새 값이 DB에서 직접 막히는지(도메인을 거치지 않는 최후 방어선). 행은 db.insert로 직접 넣는다.
// 단언 규칙(E-42): drizzle 0.45는 pg 오류를 DrizzleQueryError로 감싸 원본을 .cause에 두므로 cause.code · cause.constraint로 본다.

type PgCause = { code?: unknown; constraint?: unknown };

async function expectPgError(run: () => Promise<unknown>, code: string, constraint?: string): Promise<void> {
  let caught: unknown = null;
  try {
    await run();
  } catch (error) {
    caught = error;
  }
  const cause = (caught instanceof Error ? caught.cause : null) as PgCause | null;
  if (constraint === undefined) {
    expect(cause?.code).toBe(code);
    return;
  }
  expect({ code: cause?.code, constraint: cause?.constraint }).toEqual({ code, constraint });
}

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

async function vendor(label: string): Promise<string> {
  const name = `${label}-${randomUUID()}`;
  const row = await insertVendor(SYSTEM_VIEWER, { name, normalizedName: name.toLowerCase() });
  return row.id;
}

async function project(): Promise<{ id: string; pmUserId: string }> {
  const pmUserId = await person("PM");
  const [row] = await db
    .insert(projects)
    .values({ number: `S3-${randomUUID()}`, clientId: await vendor("클라이언트"), teamId: await teamIdByName("기획1팀"), pmUserId, name: "S3 시험", preEstimateAmountKrw: 0 })
    .returning({ id: projects.id });
  if (!row) throw new Error("프로젝트 행 없음");
  return { id: row.id, pmUserId };
}

describe("07 S3 — 거래처 담당자 · 서류 · 계좌 변경 기록(V7 · V8 · P9)", () => {
  it("담당자: 이름 NULL은 23502 · 없는 거래처는 23503 · 정상 행은 들어간다", async () => {
    const vendorId = await vendor("담당자");
    const createdBy = await person("쓴 사람");
    await expectPgError(() => db.insert(vendorContacts).values({ vendorId, name: sql`NULL`, createdBy }), "23502");
    await expectPgError(
      () => db.insert(vendorContacts).values({ vendorId: randomUUID(), name: "김담당", createdBy }),
      "23503",
      "vendor_contacts_vendor_id_vendors_id_fk",
    );
    const rows = await db
      .insert(vendorContacts)
      .values({ vendorId, name: "김담당", phone: "010-0000-0000", email: "kim@example.test", createdBy })
      .returning({ id: vendorContacts.id, archivedAt: vendorContacts.archivedAt });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.archivedAt).toBeNull();
  });

  it("서류: 종류 other는 vendor_documents_kind_check로 거부 · registration · bankbook은 들어간다", async () => {
    const vendorId = await vendor("서류");
    const createdBy = await person("쓴 사람");
    await expectPgError(() => db.insert(vendorDocuments).values({ vendorId, kind: sql`'other'`, createdBy }), "23514", "vendor_documents_kind_check");
    const rows = await db
      .insert(vendorDocuments)
      .values([
        { vendorId, kind: "registration", createdBy },
        { vendorId, kind: "bankbook", createdBy },
      ])
      .returning({ id: vendorDocuments.id });
    expect(rows).toHaveLength(2);
  });

  it("계좌 변경 기록: 뒤 4자리가 아닌 값 · 모르는 경로는 거부 · 정상 행은 들어간다(원값 칸 없음)", async () => {
    const vendorId = await vendor("계좌");
    const changedBy = await person("바꾼 사람");
    await expectPgError(
      () => db.insert(vendorAccountChanges).values({ vendorId, beforeLast4: "12345", afterLast4: "6789", changedBy, source: "admin" }),
      "23514",
      "vendor_account_changes_before_last4_check",
    );
    await expectPgError(
      () => db.insert(vendorAccountChanges).values({ vendorId, beforeLast4: "1234", afterLast4: "67-9", changedBy, source: "admin" }),
      "23514",
      "vendor_account_changes_after_last4_check",
    );
    await expectPgError(
      () => db.insert(vendorAccountChanges).values({ vendorId, beforeLast4: "1234", afterLast4: "6789", changedBy, source: sql`'api'` }),
      "23514",
      "vendor_account_changes_source_check",
    );
    const rows = await db
      .insert(vendorAccountChanges)
      .values([
        { vendorId, beforeLast4: null, afterLast4: "6789", changedBy, source: "workplace" },
        { vendorId, beforeLast4: "6789", afterLast4: "1234", changedBy, source: "evidence" },
      ])
      .returning({ id: vendorAccountChanges.id, changedAt: vendorAccountChanges.changedAt });
    expect(rows).toHaveLength(2);
    expect(rows[0]?.changedAt).toBeInstanceOf(Date);
    const columns = await db.execute<{ column_name: string }>(
      sql`SELECT column_name FROM information_schema.columns WHERE table_name = 'vendor_account_changes'`,
    );
    expect(columns.rows.map((r) => r.column_name).filter((name) => /account_no|account_number|encrypted/.test(name))).toEqual([]);
  });
});

describe("07 S3 — 거래처 확인 칸(V9)", () => {
  it("새 거래처 행은 confirmed_at · confirmed_by가 NULL", async () => {
    const vendorId = await vendor("새 거래처");
    const [row] = await db.select({ at: vendors.confirmedAt, by: vendors.confirmedBy }).from(vendors).where(eq(vendors.id, vendorId));
    expect(row).toEqual({ at: null, by: null });
  });

  it("백필 UPDATE를 다시 돌리면 확인 전 거래처의 confirmed_at이 created_at으로 채워진다", async () => {
    const vendorId = await vendor("기존 거래처");
    const statements = updateStatements("_phase7_vendor_project_docs.sql", "vendors");
    expect(statements).toHaveLength(1);
    // 다른 시험의 「확인 전」 거래처를 건드리지 않게 트랜잭션 안에서 보고 되돌린다.
    await db
      .transaction(async (tx) => {
        for (const statement of statements) await tx.execute(sql.raw(statement));
        const [row] = await tx.select({ at: vendors.confirmedAt, created: vendors.createdAt }).from(vendors).where(eq(vendors.id, vendorId));
        expect(row?.at).not.toBeNull();
        expect(row?.at?.getTime()).toBe(row?.created.getTime());
        tx.rollback();
      })
      .catch((error: unknown) => {
        if (!(error instanceof TransactionRollbackError)) throw error;
      });
  });
});

describe("07 S3 — 프로젝트 PO 번호(D-737) · 서류(W3)", () => {
  it("같은 PO 번호를 두 프로젝트에 넣어도 들어간다(유일 제약 없음)", async () => {
    const po = `PO-${randomUUID()}`;
    const first = await project();
    const second = await project();
    await db.update(projects).set({ poNumber: po }).where(eq(projects.id, first.id));
    await db.update(projects).set({ poNumber: po }).where(eq(projects.id, second.id));
    const rows = await db.select({ id: projects.id }).from(projects).where(eq(projects.poNumber, po));
    expect(rows).toHaveLength(2);
  });

  it("서류: 종류 invoice는 project_documents_kind_check로 거부 · purchase_order · other는 여러 장 들어간다", async () => {
    const { id: projectId, pmUserId: createdBy } = await project();
    await expectPgError(() => db.insert(projectDocuments).values({ projectId, kind: sql`'invoice'`, createdBy }), "23514", "project_documents_kind_check");
    const rows = await db
      .insert(projectDocuments)
      .values([
        { projectId, kind: "purchase_order", createdBy },
        { projectId, kind: "purchase_order", createdBy },
        { projectId, kind: "other", createdBy },
      ])
      .returning({ id: projectDocuments.id });
    expect(rows).toHaveLength(3);
  });
});

describe("07 S3 — 예산 이력(W4 · D-729 직접 수정 · D-730 증액만 자동)", () => {
  const auto = { baseAmountKrw: 10_000_000, costRatePct: "70.0" };

  it("직접 수정: 메모 · 0이 아닌 음수 증감 · 기준 금액 · 원가율 없음 → 들어간다", async () => {
    const { id: projectId, pmUserId: createdBy } = await project();
    const rows = await db
      .insert(projectBudgetEntries)
      .values({ projectId, reason: "manual", memo: "오입력 정정", deltaKrw: -500_000, baseAmountKrw: null, costRatePct: null, createdBy })
      .returning({ id: projectBudgetEntries.id });
    expect(rows).toHaveLength(1);
  });

  it("직접 수정: 메모 NULL · 공백만이면 project_budget_entries_manual_memo_check로 거부", async () => {
    const { id: projectId, pmUserId: createdBy } = await project();
    await expectPgError(
      () => db.insert(projectBudgetEntries).values({ projectId, reason: "manual", memo: null, deltaKrw: -500_000, createdBy }),
      "23514",
      "project_budget_entries_manual_memo_check",
    );
    await expectPgError(
      () => db.insert(projectBudgetEntries).values({ projectId, reason: "manual", memo: "  ", deltaKrw: -500_000, createdBy }),
      "23514",
      "project_budget_entries_manual_memo_check",
    );
  });

  it("직접 수정: 증감 0은 project_budget_entries_delta_check로 거부", async () => {
    const { id: projectId, pmUserId: createdBy } = await project();
    await expectPgError(
      () => db.insert(projectBudgetEntries).values({ projectId, reason: "manual", memo: "정정", deltaKrw: 0, createdBy }),
      "23514",
      "project_budget_entries_delta_check",
    );
  });

  it("모르는 사유는 project_budget_entries_reason_check로 거부", async () => {
    const { id: projectId, pmUserId: createdBy } = await project();
    await expectPgError(
      () => db.insert(projectBudgetEntries).values({ projectId, reason: sql`'other'`, deltaKrw: 1_000, ...auto, createdBy }),
      "23514",
      "project_budget_entries_reason_check",
    );
  });

  it("자동 줄: 음수 · 0 증감은 project_budget_entries_delta_check로 거부(D-730)", async () => {
    const { id: projectId, pmUserId: createdBy } = await project();
    await expectPgError(
      () => db.insert(projectBudgetEntries).values({ projectId, reason: "po_amount_change", deltaKrw: -1_000, ...auto, createdBy }),
      "23514",
      "project_budget_entries_delta_check",
    );
    await expectPgError(
      () => db.insert(projectBudgetEntries).values({ projectId, reason: "initial", deltaKrw: 0, ...auto, createdBy }),
      "23514",
      "project_budget_entries_delta_check",
    );
  });

  it("자동 줄: 양수 증감 + 기준 금액 · 원가율 → 들어가고, 원가율 NULL은 project_budget_entries_auto_base_check로 거부", async () => {
    const { id: projectId, pmUserId: createdBy } = await project();
    const rows = await db
      .insert(projectBudgetEntries)
      .values({ projectId, reason: "new_approved_revision", deltaKrw: 1_000, ...auto, createdBy })
      .returning({ id: projectBudgetEntries.id });
    expect(rows).toHaveLength(1);
    await expectPgError(
      () => db.insert(projectBudgetEntries).values({ projectId, reason: "initial", deltaKrw: 1_000, baseAmountKrw: 10_000_000, costRatePct: null, createdBy }),
      "23514",
      "project_budget_entries_auto_base_check",
    );
  });

  it("원가율 100.1은 project_budget_entries_cost_rate_pct_check로 거부", async () => {
    const { id: projectId, pmUserId: createdBy } = await project();
    await expectPgError(
      () => db.insert(projectBudgetEntries).values({ projectId, reason: "initial", deltaKrw: 1_000, baseAmountKrw: 10_000_000, costRatePct: "100.1", createdBy }),
      "23514",
      "project_budget_entries_cost_rate_pct_check",
    );
  });
});

describe("07 S3 — 차수 고객 승인 근거(W6) · 파일 주인 종류(V8 · W3 · W7)", () => {
  it("승인 근거 phone은 quote_revisions_customer_approval_basis_check로 거부 · NULL과 정해진 값은 들어간다", async () => {
    const { id: projectId } = await project();
    await expectPgError(
      () => db.insert(quoteRevisions).values({ projectId, seq: 1, customerApprovalBasis: sql`'phone'` }),
      "23514",
      "quote_revisions_customer_approval_basis_check",
    );
    const rows = await db
      .insert(quoteRevisions)
      .values([
        { projectId, seq: 1, customerApprovalBasis: null },
        { projectId, seq: 2, customerApprovalBasis: "email", customerApprovalMemo: "10/20 메일 회신" },
      ])
      .returning({ id: quoteRevisions.id });
    expect(rows).toHaveLength(2);
  });

  it("files.owner_kind는 vendor_document · project_document · revenue_entry를 받고 unknown은 거부한다", async () => {
    const uploader = await person("올린 사람");
    for (const kind of ["vendor_document", "project_document", "revenue_entry"]) {
      await insertFile(kind, randomUUID(), uploader);
    }
    await expectPgError(() => insertFile("unknown", randomUUID(), uploader), "23514", "files_owner_kind_check");
  });
});
