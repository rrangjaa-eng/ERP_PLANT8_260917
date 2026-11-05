import { randomBytes, randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { expenses, files, quoteLines } from "@/db/schema";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { firstSelectableSubcategory } from "@/test/support/quote-subcategory";
import { makePerson } from "./approvals-fixtures";
import { setupExpenseProject } from "./fixtures/expenses";

// 07.2-01(R1) — 07.2 새 칸 · 표 · CHECK가 DB에서 직접 막는지(도메인을 거치지 않는 최후 방어선). 쓰는 길은 뒤 플랜이 만든다.
// 단언 규칙(E-42): drizzle 0.45는 pg 오류를 DrizzleQueryError로 감싸 원본을 .cause에 두므로 cause.code · cause.constraint로 본다.

type PgCause = { code?: unknown; constraint?: unknown };

async function expectPgError(run: () => Promise<unknown>, code: string, constraint: string): Promise<void> {
  let caught: unknown = null;
  try {
    await run();
  } catch (error) {
    caught = error;
  }
  const cause = (caught instanceof Error ? caught.cause : null) as PgCause | null;
  expect({ code: cause?.code, constraint: cause?.constraint }).toEqual({ code, constraint });
}

type LineInsert = typeof quoteLines.$inferInsert;

async function lineRow(revisionId: string, patch: Partial<LineInsert> = {}): Promise<LineInsert> {
  return {
    revisionId,
    subcategory: (await firstSelectableSubcategory()).value,
    itemName: "무대 설치",
    unitPriceAmountKrw: 100_000,
    executionAmountKrw: 80_000,
    quoteAmountKrw: 100_000,
    profitKrw: 20_000,
    ...patch,
  };
}

async function insertLine(revisionId: string, patch: Partial<LineInsert> = {}): Promise<string> {
  const [row] = await db.insert(quoteLines).values(await lineRow(revisionId, patch)).returning({ id: quoteLines.id });
  if (!row) throw new Error("줄 없음");
  return row.id;
}

describe("07.2 스키마 — 견적 줄 일수(PU6 · D-7230 · D-7231)", () => {
  it("일수를 주지 않은 줄은 days = 1.00이다(기존 견적가가 바뀌지 않는다)", async () => {
    const fx = await setupExpenseProject();
    const id = await insertLine(fx.revisionId);
    const result = await db.execute<{ days: string }>(sql`SELECT days FROM quote_lines WHERE id = ${id}`);
    expect(result.rows[0]?.days).toBe("1.00");
  });

  it("일수 0 · −1은 quote_lines_days_check로 거부된다", async () => {
    const fx = await setupExpenseProject();
    const id = await insertLine(fx.revisionId);
    for (const days of ["0", "-1"]) {
      await expectPgError(
        () => db.execute(sql`UPDATE quote_lines SET days = ${days}::numeric WHERE id = ${id}`),
        "23514",
        "quote_lines_days_check",
      );
    }
  });
});

describe("07.2 스키마 — 견적 줄 고객 비고 · 대 · 중분류 · 수수료 종류(PU6 D-7232 · X2 D-7240 · PU3 D-7222)", () => {
  it("고객 비고 500자는 저장되고 501자는 quote_lines_client_remark_length_check로 거부된다", async () => {
    const fx = await setupExpenseProject();
    const id = await insertLine(fx.revisionId);
    await db.execute(sql`UPDATE quote_lines SET client_remark = ${"가".repeat(500)} WHERE id = ${id}`);
    const result = await db.execute<{ len: number }>(sql`SELECT char_length(client_remark) AS len FROM quote_lines WHERE id = ${id}`);
    expect(Number(result.rows[0]?.len)).toBe(500);
    await expectPgError(
      () => db.execute(sql`UPDATE quote_lines SET client_remark = ${"가".repeat(501)} WHERE id = ${id}`),
      "23514",
      "quote_lines_client_remark_length_check",
    );
  });

  it("고객 비고 · 대분류 · 중분류는 주지 않으면 NULL이다", async () => {
    const fx = await setupExpenseProject();
    const id = await insertLine(fx.revisionId);
    const result = await db.execute<{ client_remark: string | null; major_category: string | null; mid_category: string | null }>(
      sql`SELECT client_remark, major_category, mid_category FROM quote_lines WHERE id = ${id}`,
    );
    expect(result.rows[0]).toEqual({ client_remark: null, major_category: null, mid_category: null });
  });

  it("줄 종류 commission은 들어가고 foo는 quote_lines_line_kind_check로 거부된다", async () => {
    const fx = await setupExpenseProject();
    const id = await insertLine(fx.revisionId);
    await db.execute(sql`UPDATE quote_lines SET line_kind = 'commission' WHERE id = ${id}`);
    const result = await db.execute<{ line_kind: string }>(sql`SELECT line_kind FROM quote_lines WHERE id = ${id}`);
    expect(result.rows[0]?.line_kind).toBe("commission");
    await expectPgError(() => db.execute(sql`UPDATE quote_lines SET line_kind = 'foo' WHERE id = ${id}`), "23514", "quote_lines_line_kind_check");
  });
});

describe("07.2 스키마 — 조정 쌍(D7298-B · D-7300)", () => {
  it("adjustment_pair_id만 있고 counterpart_project_id가 없으면 quote_lines_adjustment_pair_check로 거부된다", async () => {
    const fx = await setupExpenseProject();
    const id = await insertLine(fx.revisionId, { lineKind: "adjustment" });
    await expectPgError(
      () => db.execute(sql`UPDATE quote_lines SET adjustment_pair_id = ${randomUUID()} WHERE id = ${id}`),
      "23514",
      "quote_lines_adjustment_pair_check",
    );
  });

  it("둘 다 있어도 줄 종류가 quote면 quote_lines_adjustment_pair_check로 거부된다", async () => {
    const fx = await setupExpenseProject();
    const id = await insertLine(fx.revisionId, { lineKind: "quote" });
    await expectPgError(
      () =>
        db.execute(sql`UPDATE quote_lines SET adjustment_pair_id = ${randomUUID()}, counterpart_project_id = ${fx.projectId} WHERE id = ${id}`),
      "23514",
      "quote_lines_adjustment_pair_check",
    );
  });

  it("둘 다 있고 줄 종류가 adjustment면 들어간다 · 없는 프로젝트는 FK로 거부된다", async () => {
    const fx = await setupExpenseProject();
    const id = await insertLine(fx.revisionId, { lineKind: "adjustment" });
    const pairId = randomUUID();
    await db.execute(sql`UPDATE quote_lines SET adjustment_pair_id = ${pairId}, counterpart_project_id = ${fx.projectId} WHERE id = ${id}`);
    const result = await db.execute<{ adjustment_pair_id: string }>(sql`SELECT adjustment_pair_id FROM quote_lines WHERE id = ${id}`);
    expect(result.rows[0]?.adjustment_pair_id).toBe(pairId);
    await expectPgError(
      () => db.execute(sql`UPDATE quote_lines SET counterpart_project_id = ${randomUUID()} WHERE id = ${id}`),
      "23503",
      "quote_lines_counterpart_project_id_projects_id_fk",
    );
  });
});

describe("07.2 스키마 — 로고 파일 · 출력 기록(PU3 D-7225 · PU4 D-7228)", () => {
  it("files owner_kind company_logo가 들어간다", async () => {
    const person = await makePerson("로고 올린 사람", DEFAULT_ROLE_ID, null);
    const id = randomUUID();
    const rows = await db
      .insert(files)
      .values({
        ownerKind: "company_logo",
        ownerId: randomUUID(),
        objectKey: `evidence/${id}`,
        sha256: randomBytes(32).toString("hex"),
        sizeBytes: 10,
        contentType: "image/png",
        originalName: "logo.png",
        uploadedBy: person.id,
      })
      .returning({ id: files.id });
    expect(rows).toHaveLength(1);
  });

  it("차수의 printed_at · printed_by는 기본 NULL이고 없는 사용자는 FK로 거부된다", async () => {
    const fx = await setupExpenseProject();
    const result = await db.execute<{ printed_at: string | null; printed_by: string | null }>(
      sql`SELECT printed_at, printed_by FROM quote_revisions WHERE id = ${fx.revisionId}`,
    );
    expect(result.rows[0]).toEqual({ printed_at: null, printed_by: null });
    await expectPgError(
      () => db.execute(sql`UPDATE quote_revisions SET printed_at = now(), printed_by = ${`no-user-${randomUUID()}`} WHERE id = ${fx.revisionId}`),
      "23503",
      "quote_revisions_printed_by_users_id_fk",
    );
    await db.execute(sql`UPDATE quote_revisions SET printed_at = now(), printed_by = ${fx.pm.id} WHERE id = ${fx.revisionId}`);
  });
});

describe("07.2 스키마 — 반반차 시작 시각(PU11 · D-7258)", () => {
  async function insertLeave(kind: string, startTime: string | null): Promise<unknown> {
    const person = await makePerson(`연차 ${kind}`, DEFAULT_ROLE_ID, null);
    return db.execute(sql`
      INSERT INTO leave_requests (drafter_id, kind, start_date, end_date, half, days_quarters, fiscal_year, start_time)
      VALUES (${person.id}, ${kind}, '2026-11-02', '2026-11-02', NULL, ${kind === "quarter_day" ? 1 : 4}, 2026, ${startTime}::time)
    `);
  }

  it("종일 연차에 시작 시각이 있으면 leave_requests_start_time_kind_check로 거부된다", async () => {
    await expectPgError(() => insertLeave("full_day", "09:00"), "23514", "leave_requests_start_time_kind_check");
  });

  it("반반차는 시작 시각이 있어도 없어도 들어간다(기존 행 호환 — 신규 필수는 도메인)", async () => {
    await expect(insertLeave("quarter_day", "14:00")).resolves.toBeDefined();
    await expect(insertLeave("quarter_day", null)).resolves.toBeDefined();
  });
});

describe("07.2 스키마 — 지급 희망일 변경 요청(X4 · D-7291)", () => {
  async function expenseFixture(): Promise<{ expenseId: string; userId: string }> {
    const person = await makePerson("희망일 기안자", DEFAULT_ROLE_ID, null);
    const [row] = await db.insert(expenses).values({ drafterId: person.id }).returning({ id: expenses.id });
    if (!row) throw new Error("지출결의 없음");
    return { expenseId: row.id, userId: person.id };
  }

  function insertRequest(expenseId: string, userId: string, patch: { status?: string; reason?: string; decided?: boolean; rejectMemo?: string | null } = {}) {
    const status = patch.status ?? "pending";
    const decided = patch.decided ?? false;
    return db.execute<{ id: string }>(sql`
      INSERT INTO expense_date_change_requests (expense_id, requested_by, new_date, reason, status, decided_by, decided_at, reject_memo)
      VALUES (${expenseId}, ${userId}, '2026-11-20', ${patch.reason ?? "거래처 요청"}, ${status},
              ${decided ? userId : null}, ${decided ? sql`now()` : sql`NULL`}, ${patch.rejectMemo ?? null})
      RETURNING id
    `);
  }

  it("같은 지출결의에 대기 요청 둘째는 expense_date_change_requests_pending_uniq로 거부되고, 첫째가 승인되면 새 대기 요청이 들어간다", async () => {
    const { expenseId, userId } = await expenseFixture();
    const first = await insertRequest(expenseId, userId);
    const firstId = first.rows[0]?.id;
    if (!firstId) throw new Error("요청 없음");
    await expectPgError(() => insertRequest(expenseId, userId), "23505", "expense_date_change_requests_pending_uniq");
    await db.execute(
      sql`UPDATE expense_date_change_requests SET status = 'approved', decided_by = ${userId}, decided_at = now() WHERE id = ${firstId}`,
    );
    const second = await insertRequest(expenseId, userId);
    expect(second.rows).toHaveLength(1);
  });

  it("사유가 빈 글자면 expense_date_change_requests_reason_length_check로 거부된다", async () => {
    const { expenseId, userId } = await expenseFixture();
    await expectPgError(() => insertRequest(expenseId, userId, { reason: "" }), "23514", "expense_date_change_requests_reason_length_check");
  });

  it("상태 foo는 expense_date_change_requests_status_check로 거부된다", async () => {
    const { expenseId, userId } = await expenseFixture();
    // 처리 칸을 채워 decided_check는 지나가게 하고 상태 목록만 어긋나게 한다.
    await expectPgError(() => insertRequest(expenseId, userId, { status: "foo", decided: true }), "23514", "expense_date_change_requests_status_check");
  });

  it("거절인데 거절 메모가 없으면 expense_date_change_requests_reject_memo_check로 거부된다", async () => {
    const { expenseId, userId } = await expenseFixture();
    await expectPgError(
      () => insertRequest(expenseId, userId, { status: "rejected", decided: true, rejectMemo: null }),
      "23514",
      "expense_date_change_requests_reject_memo_check",
    );
  });

  it("철회인데 처리 시각이 없으면 expense_date_change_requests_decided_check로 거부된다", async () => {
    const { expenseId, userId } = await expenseFixture();
    await expectPgError(
      () => insertRequest(expenseId, userId, { status: "withdrawn", decided: false }),
      "23514",
      "expense_date_change_requests_decided_check",
    );
  });
});
