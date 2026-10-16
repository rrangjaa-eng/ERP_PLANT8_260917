import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/db/client";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { makePerson } from "./approvals-fixtures";

// 06.1-01(D-6107 · D-6112) — 증빙 기록 표 셋과 칸 · 제약 · 색인이 DB에서 직접 막는지(도메인을 거치지 않는 최후 방어선).
// 행은 SQL로 직접 넣는다. drizzle 0.45는 pg 오류를 DrizzleQueryError로 감싸 원본을 .cause에 두므로 cause.code · cause.constraint로 본다.

type PgCause = { code?: unknown; constraint?: unknown };

async function pgErrorOf(run: () => Promise<unknown>): Promise<{ code: unknown; constraint: unknown }> {
  let caught: unknown = null;
  try {
    await run();
  } catch (error) {
    caught = error;
  }
  const cause = (caught instanceof Error ? caught.cause : null) as PgCause | null;
  return { code: cause?.code, constraint: cause?.constraint };
}

async function expectPgError(run: () => Promise<unknown>, code: string, constraint: string): Promise<void> {
  expect(await pgErrorOf(run)).toEqual({ code, constraint });
}

async function anyTeam(): Promise<{ teamId: string; orgUnitId: string }> {
  const rows = await db.execute<{ team_id: string; org_unit_id: string }>(sql`select id as team_id, org_unit_id from teams limit 1`);
  const row = rows.rows[0];
  if (!row) throw new Error("시드된 팀 없음");
  return { teamId: row.team_id, orgUnitId: row.org_unit_id };
}

async function insertBatch(uploadedBy: string): Promise<string> {
  const rows = await db.execute<{ id: string }>(sql`
    insert into evidence_import_batches (format, original_name, file_sha256, row_count, registered_count, skipped_duplicate_count, uploaded_by)
    values ('card-shinhan', '카드 이용내역.xlsx', ${"a".repeat(64)}, 1, 1, 0, ${uploadedBy})
    returning id
  `);
  const id = rows.rows[0]?.id;
  if (!id) throw new Error("묶음 없음");
  return id;
}

type RecordRow = {
  batchId: string;
  dedupeKey: string;
  supplyKrw: number;
  vatKrw: number;
  totalKrw: number;
  cardLast4: string | null;
  visibility: string;
  visibleTeamId: string | null;
  visibleOrgUnitId: string | null;
  visibilitySavedAt: Date | null;
  archivedAt: Date | null;
  archivedBy: string | null;
  createdBy: string;
};

async function recordRow(patch: Partial<RecordRow> = {}): Promise<RecordRow> {
  const person = patch.createdBy ? null : await makePerson("증빙 등록", DEFAULT_ROLE_ID, null);
  const createdBy = patch.createdBy ?? person?.id ?? "";
  return {
    batchId: patch.batchId ?? (await insertBatch(createdBy)),
    dedupeKey: `card-shinhan|1234|${randomUUID()}`,
    supplyKrw: 10_000,
    vatKrw: 1_000,
    totalKrw: 11_000,
    cardLast4: "1234",
    visibility: "private",
    visibleTeamId: null,
    visibleOrgUnitId: null,
    visibilitySavedAt: null,
    archivedAt: null,
    archivedBy: null,
    createdBy,
    ...patch,
  };
}

async function insertRecord(row: RecordRow, opts: { onConflictDoNothing?: boolean } = {}): Promise<string[]> {
  const rows = await db.execute<{ id: string }>(sql`
    insert into evidence_records (
      batch_id, format, evidence_type, dedupe_key, issued_on, supply_krw, vat_krw, total_krw, card_last4,
      visibility, visible_team_id, visible_org_unit_id, visibility_saved_at, archived_at, archived_by, created_by
    ) values (
      ${row.batchId}, 'card-shinhan', 'card_receipt', ${row.dedupeKey}, '2026-10-01', ${row.supplyKrw}, ${row.vatKrw}, ${row.totalKrw}, ${row.cardLast4},
      ${row.visibility}, ${row.visibleTeamId}, ${row.visibleOrgUnitId}, ${row.visibilitySavedAt}, ${row.archivedAt}, ${row.archivedBy}, ${row.createdBy}
    )
    ${opts.onConflictDoNothing ? sql`on conflict (dedupe_key) do nothing` : sql``}
    returning id
  `);
  return rows.rows.map((r) => r.id);
}

async function newRecord(patch: Partial<RecordRow> = {}): Promise<{ id: string; createdBy: string }> {
  const row = await recordRow(patch);
  const [id] = await insertRecord(row);
  if (!id) throw new Error("기록 없음");
  return { id, createdBy: row.createdBy };
}

type LinkRow = {
  recordId: string;
  ownerKind: string;
  attachMode: string;
  attachedBy: string;
  detachedAt: Date | null;
  detachedBy: string | null;
  detachReason: string | null;
};

async function insertLink(row: LinkRow): Promise<string> {
  const rows = await db.execute<{ id: string }>(sql`
    insert into evidence_record_links (evidence_record_id, owner_kind, owner_id, attach_mode, attached_by, detached_at, detached_by, detach_reason)
    values (${row.recordId}, ${row.ownerKind}, ${randomUUID()}, ${row.attachMode}, ${row.attachedBy}, ${row.detachedAt}, ${row.detachedBy}, ${row.detachReason})
    returning id
  `);
  const id = rows.rows[0]?.id;
  if (!id) throw new Error("붙임 없음");
  return id;
}

function link(recordId: string, attachedBy: string, patch: Partial<LinkRow> = {}): LinkRow {
  return { recordId, ownerKind: "expense", attachMode: "registrar", attachedBy, detachedAt: null, detachedBy: null, detachReason: null, ...patch };
}

describe("06.1 스키마 — 증빙 기록(evidence_records)", () => {
  it("같은 dedupe_key를 두 번 넣으면 ON CONFLICT DO NOTHING이 두 번째에 0행을 돌려준다", async () => {
    const first = await recordRow();
    expect(await insertRecord(first, { onConflictDoNothing: true })).toHaveLength(1);
    const second = await recordRow({ dedupeKey: first.dedupeKey, createdBy: first.createdBy, batchId: first.batchId });
    expect(await insertRecord(second, { onConflictDoNothing: true })).toHaveLength(0);
  });

  it("공개 범위 짝이 어긋나면(팀 공개 · 팀 없음 / 미공개 · 본부 있음 / 본부 공개 · 팀 있음) CHECK로 거부되고 맞는 짝은 들어간다", async () => {
    const { teamId, orgUnitId } = await anyTeam();
    const base = await recordRow();
    const again = (patch: Partial<RecordRow>) => ({ ...base, dedupeKey: `k|${randomUUID()}`, ...patch });
    const constraint = "evidence_records_visibility_target_check";
    await expectPgError(() => insertRecord(again({ visibility: "team" })), "23514", constraint);
    await expectPgError(() => insertRecord(again({ visibility: "private", visibleOrgUnitId: orgUnitId })), "23514", constraint);
    await expectPgError(() => insertRecord(again({ visibility: "division", visibleOrgUnitId: orgUnitId, visibleTeamId: teamId })), "23514", constraint);
    await expectPgError(() => insertRecord(again({ visibility: "company" })), "23514", "evidence_records_visibility_check");
    expect(await insertRecord(again({ visibility: "team", visibleTeamId: teamId }))).toHaveLength(1);
    expect(await insertRecord(again({ visibility: "division", visibleOrgUnitId: orgUnitId }))).toHaveLength(1);
    expect(await insertRecord(again({}))).toHaveLength(1);
  });

  it("합계가 공급가 + 세액과 다르면 CHECK로 거부되고 음수 금액(취소 줄)은 들어간다", async () => {
    const base = await recordRow();
    await expectPgError(
      () => insertRecord({ ...base, totalKrw: 11_001 }),
      "23514",
      "evidence_records_amount_sum_check",
    );
    expect(await insertRecord({ ...base, supplyKrw: -10_000, vatKrw: -1_000, totalKrw: -11_000 })).toHaveLength(1);
  });

  it("카드 끝 네 자리가 숫자 네 자리가 아니면('12345' · '12ab') CHECK로 거부된다", async () => {
    const base = await recordRow();
    await expectPgError(() => insertRecord({ ...base, cardLast4: "12345" }), "23514", "evidence_records_card_last4_check");
    await expectPgError(() => insertRecord({ ...base, dedupeKey: `k|${randomUUID()}`, cardLast4: "12ab" }), "23514", "evidence_records_card_last4_check");
  });

  it("카드 번호 칸은 card_last4 하나뿐이고 전체 카드 번호 · 계좌번호 · 원본 바이트 · source 칸이 없다", async () => {
    const rows = await db.execute<{ column_name: string }>(sql`
      select column_name from information_schema.columns
      where table_schema = 'public' and table_name in ('evidence_records', 'evidence_import_batches', 'evidence_record_links')
    `);
    const names = rows.rows.map((r) => r.column_name);
    expect(names).toContain("card_last4");
    expect(names.filter((name) => /card_number|account|bytes|blob|content|^source$/.test(name))).toEqual([]);
  });

  it("(C1) visibility_saved_at은 기본 null이고 시각을 넣으면 받는다", async () => {
    const { id } = await newRecord();
    const before = await db.execute<{ saved: Date | null }>(sql`select visibility_saved_at as saved from evidence_records where id = ${id}`);
    expect(before.rows[0]?.saved).toBeNull();
    const at = new Date("2026-10-16T01:00:00Z");
    await db.execute(sql`update evidence_records set visibility_saved_at = ${at} where id = ${id}`);
    const after = await db.execute<{ saved: Date | null }>(sql`select visibility_saved_at as saved from evidence_records where id = ${id}`);
    expect(new Date(String(after.rows[0]?.saved)).toISOString()).toBe(at.toISOString());
  });

  it("(C2) archived_at만 채우고 archived_by가 비면 CHECK로 거부되고 둘 다 채움 · 둘 다 빈 값은 들어간다", async () => {
    const base = await recordRow();
    await expectPgError(
      () => insertRecord({ ...base, archivedAt: new Date() }),
      "23514",
      "evidence_records_archived_pair_check",
    );
    expect(await insertRecord({ ...base, archivedAt: new Date(), archivedBy: base.createdBy })).toHaveLength(1);
    expect(await insertRecord({ ...base, dedupeKey: `k|${randomUUID()}` })).toHaveLength(1);
  });

  it("(A8) 공개 범위 부분 색인 둘과 (format, issued_on) 색인이 있다", async () => {
    const rows = await db.execute<{ indexname: string; indexdef: string }>(sql`
      select indexname, indexdef from pg_indexes where tablename = 'evidence_records'
    `);
    const defs = Object.fromEntries(rows.rows.map((r) => [r.indexname, r.indexdef]));
    expect(defs.evidence_records_visible_team_idx).toContain("(visible_team_id) WHERE (visibility = 'team'::text)");
    expect(defs.evidence_records_visible_org_unit_idx).toContain("(visible_org_unit_id) WHERE (visibility = 'division'::text)");
    expect(defs.evidence_records_format_issued_idx).toContain("(format, issued_on)");
    expect(Object.keys(defs)).toEqual(
      expect.arrayContaining(["evidence_records_visibility_idx", "evidence_records_batch_idx", "evidence_records_card_issued_idx"]),
    );
  });
});

describe("06.1 스키마 — 사업자번호 · 파일 지문 · 묶음 삭제", () => {
  it("사업자번호가 숫자 열 자리가 아니면('123456789' · '123-45-67890') CHECK로 거부되고 열 자리 숫자는 들어간다", async () => {
    const { id } = await newRecord();
    const setDigits = (digits: string) => db.execute(sql`update evidence_records set business_no_digits = ${digits} where id = ${id}`);
    await expectPgError(() => setDigits("123456789"), "23514", "evidence_records_business_no_digits_check");
    await expectPgError(() => setDigits("123-45-67890"), "23514", "evidence_records_business_no_digits_check");
    await setDigits("1234567890");
    const rows = await db.execute<{ digits: string | null }>(sql`select business_no_digits as digits from evidence_records where id = ${id}`);
    expect(rows.rows[0]?.digits).toBe("1234567890");
  });

  it("묶음 파일 지문이 소문자 16진 64자가 아니면(대문자 · 63자) CHECK로 거부된다", async () => {
    const person = await makePerson("증빙 등록", DEFAULT_ROLE_ID, null);
    const insertWithSha = (sha: string) =>
      db.execute(sql`
        insert into evidence_import_batches (format, original_name, file_sha256, row_count, registered_count, skipped_duplicate_count, uploaded_by)
        values ('card-shinhan', '카드 이용내역.xlsx', ${sha}, 1, 1, 0, ${person.id})
      `);
    await expectPgError(() => insertWithSha("A".repeat(64)), "23514", "evidence_import_batches_file_sha256_check");
    await expectPgError(() => insertWithSha("a".repeat(63)), "23514", "evidence_import_batches_file_sha256_check");
  });

  // PostgreSQL 외래 키 트리거는 RESTRICT도 23503(foreign_key_violation)으로 거부한다 — RESTRICT인지는 pg_constraint.confdeltype('r')로 본다.
  it("기록이 남아 있는 묶음은 지울 수 없다(batch_id ON DELETE restrict)", async () => {
    const row = await recordRow();
    await insertRecord(row);
    await expectPgError(
      () => db.execute(sql`delete from evidence_import_batches where id = ${row.batchId}`),
      "23503",
      "evidence_records_batch_id_evidence_import_batches_id_fk",
    );
    const fk = await db.execute<{ confdeltype: string }>(sql`
      select confdeltype from pg_constraint where conname = 'evidence_records_batch_id_evidence_import_batches_id_fk'
    `);
    expect(fk.rows).toEqual([{ confdeltype: "r" }]);
  });
});

describe("06.1 스키마 — 붙임 이력(evidence_record_links)", () => {
  it("같은 증빙에 떼지 않은 붙임 둘은 부분 유니크로 거부되고, 첫 붙임을 뗀 뒤 새 붙임은 들어간다", async () => {
    const { id, createdBy } = await newRecord();
    const firstId = await insertLink(link(id, createdBy));
    await expectPgError(() => insertLink(link(id, createdBy)), "23505", "evidence_record_links_live_uniq");
    await db.execute(sql`
      update evidence_record_links set detached_at = now(), detached_by = ${createdBy}, detach_reason = '잘못 붙임' where id = ${firstId}
    `);
    await expect(insertLink(link(id, createdBy))).resolves.toEqual(expect.any(String));
  });

  it("owner_kind가 세 값 밖('vendor')이면 CHECK로 거부되고 expense · purchase_request · corp_card_usage는 들어간다", async () => {
    const { id, createdBy } = await newRecord();
    await expectPgError(() => insertLink(link(id, createdBy, { ownerKind: "vendor" })), "23514", "evidence_record_links_owner_kind_check");
    for (const ownerKind of ["expense", "purchase_request", "corp_card_usage"]) {
      const other = await newRecord({ createdBy });
      await expect(insertLink(link(other.id, createdBy, { ownerKind }))).resolves.toEqual(expect.any(String));
    }
  });

  it("뗀 칸 셋은 함께 채워지고 사유가 빈 글자면 거부된다 · attach_mode는 세 값만", async () => {
    const { id, createdBy } = await newRecord();
    await expectPgError(
      () => insertLink(link(id, createdBy, { detachedAt: new Date(), detachedBy: createdBy })),
      "23514",
      "evidence_record_links_detached_check",
    );
    await expectPgError(
      () => insertLink(link(id, createdBy, { detachedAt: new Date(), detachedBy: createdBy, detachReason: "" })),
      "23514",
      "evidence_record_links_detached_check",
    );
    await expectPgError(() => insertLink(link(id, createdBy, { attachMode: "auto" })), "23514", "evidence_record_links_attach_mode_check");
  });
});

describe("06.1 스키마 — 사람 칸 다섯은 users.id를 가리킨다(A-11)", () => {
  const ghost = "no-such-user";

  it("묶음 uploaded_by에 없는 사용자 → FK 위반", async () => {
    await expectPgError(() => insertBatch(ghost), "23503", "evidence_import_batches_uploaded_by_users_id_fk");
  });

  it("기록 created_by에 없는 사용자 → FK 위반", async () => {
    const base = await recordRow();
    await expectPgError(() => insertRecord({ ...base, createdBy: ghost }), "23503", "evidence_records_created_by_users_id_fk");
  });

  it("기록 archived_by에 없는 사용자 → FK 위반", async () => {
    const base = await recordRow();
    await expectPgError(
      () => insertRecord({ ...base, archivedAt: new Date(), archivedBy: ghost }),
      "23503",
      "evidence_records_archived_by_users_id_fk",
    );
  });

  it("붙임 attached_by에 없는 사용자 → FK 위반", async () => {
    const { id } = await newRecord();
    await expectPgError(() => insertLink(link(id, ghost)), "23503", "evidence_record_links_attached_by_users_id_fk");
  });

  it("붙임 detached_by에 없는 사용자 → FK 위반", async () => {
    const { id, createdBy } = await newRecord();
    await expectPgError(
      () => insertLink(link(id, createdBy, { detachedAt: new Date(), detachedBy: ghost, detachReason: "잘못 붙임" })),
      "23503",
      "evidence_record_links_detached_by_users_id_fk",
    );
  });
});

describe("06.1 스키마 — 기존 표에 더한 칸", () => {
  it("corp_card_usages.approval_no 칸이 있고 null을 받는다 · (corp_card_id, approval_no) 색인이 있다", async () => {
    const cols = await db.execute<{ is_nullable: string; column_default: string | null }>(sql`
      select is_nullable, column_default from information_schema.columns
      where table_name = 'corp_card_usages' and column_name = 'approval_no'
    `);
    expect(cols.rows).toEqual([{ is_nullable: "YES", column_default: null }]);
    const idx = await db.execute<{ indexdef: string }>(sql`
      select indexdef from pg_indexes where indexname = 'corp_card_usages_card_approval_idx'
    `);
    expect(idx.rows[0]?.indexdef).toContain("(corp_card_id, approval_no)");
  });

  it("(RP-15) code_items.private_to_owner는 NOT NULL DEFAULT false이고 개인카드 전표를 뺀 증빙 종류 일곱 값은 모두 거짓이다", async () => {
    const cols = await db.execute<{ is_nullable: string; column_default: string | null }>(sql`
      select is_nullable, column_default from information_schema.columns
      where table_name = 'code_items' and column_name = 'private_to_owner'
    `);
    expect(cols.rows).toEqual([{ is_nullable: "NO", column_default: "false" }]);
    const items = await db.execute<{ value: string; private_to_owner: boolean }>(sql`
      select value, private_to_owner from code_items
      where table_key = 'evidence_type' and value <> 'personal_card_receipt' order by sort_order
    `);
    expect(items.rows).toHaveLength(7);
    expect(items.rows.filter((r) => r.private_to_owner)).toEqual([]);
  });
});
