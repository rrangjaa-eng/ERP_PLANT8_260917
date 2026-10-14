import { randomBytes, randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { corpCards, corpCardUsages, expenses, purchaseRequests, quoteLines, users } from "@/db/schema";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { insertVendor } from "@/repositories/vendors";
import { firstSelectableSubcategory } from "@/test/support/quote-subcategory";
import { makePerson } from "./approvals-fixtures";
import { setupExpenseProject } from "./fixtures/expenses";

// 06.5-01 — 06.5 새 칸 · 제약 · 색인이 DB에서 직접 막는지(도메인을 거치지 않는 최후 방어선). 행은 db.insert로 직접 넣는다.
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

describe("06.5 스키마 — 조정 줄 연결 칸(D-6502)", () => {
  type LineInsert = typeof quoteLines.$inferInsert;

  async function lineRow(revisionId: string, patch: Partial<LineInsert> = {}): Promise<LineInsert> {
    return {
      revisionId,
      subcategory: (await firstSelectableSubcategory()).value,
      itemName: "기타소득세 대납",
      lineKind: "adjustment",
      unitPriceAmountKrw: 14_100,
      executionAmountKrw: 14_100,
      quoteAmountKrw: 14_100,
      profitKrw: 0,
      ...patch,
    };
  }

  // source_expense_id에는 FK가 없다 — 실제 지출결의 행이 아닌 임의 uuid로도 들어간다.
  it("보관 안 된 조정 줄에 source_expense_id · source_synced_version을 넣을 수 있다", async () => {
    const fx = await setupExpenseProject();
    const expenseId = randomUUID();
    const [row] = await db
      .insert(quoteLines)
      .values(await lineRow(fx.revisionId, { sourceExpenseId: expenseId, sourceSyncedVersion: 1 }))
      .returning({ sourceExpenseId: quoteLines.sourceExpenseId, sourceSyncedVersion: quoteLines.sourceSyncedVersion });
    expect(row).toEqual({ sourceExpenseId: expenseId, sourceSyncedVersion: 1 });
  });

  it("같은 지출결의의 보관 안 된 둘째 연결 줄은 quote_lines_source_expense_live_uniq로 거부되고 첫 줄을 보관하면 들어간다", async () => {
    const fx = await setupExpenseProject();
    const expenseId = randomUUID();
    const [first] = await db
      .insert(quoteLines)
      .values(await lineRow(fx.revisionId, { sourceExpenseId: expenseId, sourceSyncedVersion: 1 }))
      .returning({ id: quoteLines.id });
    if (!first) throw new Error("줄 없음");
    const second = await lineRow(fx.revisionId, { sourceExpenseId: expenseId, sourceSyncedVersion: 1 });
    await expectPgError(() => db.insert(quoteLines).values(second), "23505", "quote_lines_source_expense_live_uniq");
    await db.update(quoteLines).set({ archivedAt: new Date(), archivedBy: fx.pm.id }).where(eq(quoteLines.id, first.id));
    await expect(db.insert(quoteLines).values(second).returning({ id: quoteLines.id })).resolves.toHaveLength(1);
  });

  it("견적 줄(quote)에 source_expense_id를 넣으면 quote_lines_source_expense_kind_check로 거부된다", async () => {
    const fx = await setupExpenseProject();
    const row = await lineRow(fx.revisionId, { lineKind: "quote", sourceExpenseId: randomUUID(), sourceSyncedVersion: 1 });
    await expectPgError(() => db.insert(quoteLines).values(row), "23514", "quote_lines_source_expense_kind_check");
  });

  it("source_expense_id만 있고 source_synced_version이 비면 quote_lines_source_synced_pair_check로 거부되고 둘 다 빈 줄은 들어간다", async () => {
    const fx = await setupExpenseProject();
    const half = await lineRow(fx.revisionId, { sourceExpenseId: randomUUID(), sourceSyncedVersion: null });
    await expectPgError(() => db.insert(quoteLines).values(half), "23514", "quote_lines_source_synced_pair_check");
    await expect(
      db
        .insert(quoteLines)
        .values(await lineRow(fx.revisionId, { sourceExpenseId: null, sourceSyncedVersion: null }))
        .returning({ id: quoteLines.id }),
    ).resolves.toHaveLength(1);
  });
});

describe("06.5 스키마 — 계좌 · 번호 · 키 · 지급처 · 받는 인원", () => {
  type UserInsert = typeof users.$inferInsert;

  function userRow(patch: Partial<UserInsert> = {}): UserInsert {
    const id = randomUUID();
    return { id, name: "직원", email: `${id}@phase65.test`, ...patch };
  }

  // D-6505 · D-6506: 은행과 암호화 계좌번호가 둘 다 있을 때만 예금주가 빈 글자가 아니어야 한다.
  it("은행 · 계좌번호가 있는데 예금주가 없으면 users_account_holder_required_check로 거부된다", async () => {
    await expectPgError(
      () => db.insert(users).values(userRow({ accountBank: "신한은행", accountNumberEncrypted: "v1:x", accountHolder: null })),
      "23514",
      "users_account_holder_required_check",
    );
  });

  it("은행 · 계좌번호가 있는데 예금주가 공백뿐이면 users_account_holder_required_check로 거부된다", async () => {
    await expectPgError(
      () => db.insert(users).values(userRow({ accountBank: "신한은행", accountNumberEncrypted: "v1:x", accountHolder: "  " })),
      "23514",
      "users_account_holder_required_check",
    );
  });

  it("은행 · 계좌번호 · 예금주가 다 있으면 들어간다", async () => {
    await expect(
      db
        .insert(users)
        .values(userRow({ accountBank: "신한은행", accountNumberEncrypted: "v1:x", accountNumberLast4: "1234", accountHolder: "김OO" }))
        .returning({ id: users.id }),
    ).resolves.toHaveLength(1);
  });

  it("은행만 있고 계좌번호 · 예금주가 없으면 들어간다", async () => {
    await expect(db.insert(users).values(userRow({ accountBank: "신한은행" })).returning({ id: users.id })).resolves.toHaveLength(1);
  });

  async function cardBase() {
    const fx = await setupExpenseProject();
    const [card] = await db
      .insert(corpCards)
      .values({
        issuer: `카드사-${randomUUID()}`,
        numberLast4: String(1000 + (randomBytes(2).readUInt16BE() % 9000)),
        label: "카드",
        kind: "personal",
        holderUserId: fx.pm.id,
      })
      .returning({ id: corpCards.id });
    if (!card) throw new Error("카드 없음");
    return { fx, cardId: card.id, userId: fx.pm.id, quoteLineId: fx.lines.noVendor };
  }

  type CardBase = Awaited<ReturnType<typeof cardBase>>;

  function usageRow(b: CardBase, extra: Partial<typeof corpCardUsages.$inferInsert> = {}) {
    return {
      corpCardId: b.cardId,
      usedOn: "2026-10-01",
      totalAmountKrw: 110_000,
      supplyKrw: 100_000,
      vatKrw: 10_000,
      evidenceTypeCode: "card_slip",
      linkKind: "quote_line",
      quoteLineId: b.quoteLineId,
      usedByUserId: b.userId,
      registeredBy: b.userId,
      registeredVia: "self",
      ...extra,
    } satisfies typeof corpCardUsages.$inferInsert;
  }

  function purchaseRow(b: CardBase, extra: Partial<typeof purchaseRequests.$inferInsert> = {}) {
    return {
      number: `26001-C${randomUUID().slice(0, 8)}`,
      linkKind: "quote_line",
      projectId: b.fx.projectId,
      quoteLineId: b.quoteLineId,
      requestedBy: b.userId,
      itemName: "현수막",
      estimateAmountKrw: 50_000,
      ...extra,
    } satisfies typeof purchaseRequests.$inferInsert;
  }

  // D-6503: 카드 사용 번호는 NULL 허용 + 유일(기존 행 백필 없음).
  it("카드 사용 두 행의 같은 번호는 corp_card_usages_number_uniq로 거부된다", async () => {
    const b = await cardBase();
    const number = `26001-K${randomUUID().slice(0, 8)}`;
    await db.insert(corpCardUsages).values(usageRow(b, { number }));
    await expectPgError(() => db.insert(corpCardUsages).values(usageRow(b, { number })), "23505", "corp_card_usages_number_uniq");
  });

  it("번호가 빈 카드 사용 두 행은 들어간다", async () => {
    const b = await cardBase();
    await db.insert(corpCardUsages).values(usageRow(b, { number: null }));
    await expect(db.insert(corpCardUsages).values(usageRow(b, { number: null })).returning({ id: corpCardUsages.id })).resolves.toHaveLength(1);
  });

  // D-6509: 재전송 중복 방지 키 — 같은 키 두 번째 행은 거부, 키 없는 행은 여럿.
  it("카드 사용 두 행의 같은 idempotency_key는 corp_card_usages_idempotency_key_uniq로 거부되고 키 없는 행은 여럿 들어간다", async () => {
    const b = await cardBase();
    const key = randomUUID();
    await db.insert(corpCardUsages).values(usageRow(b, { idempotencyKey: key }));
    await expectPgError(
      () => db.insert(corpCardUsages).values(usageRow(b, { idempotencyKey: key })),
      "23505",
      "corp_card_usages_idempotency_key_uniq",
    );
    await db.insert(corpCardUsages).values(usageRow(b, { idempotencyKey: null }));
    await expect(
      db.insert(corpCardUsages).values(usageRow(b, { idempotencyKey: null })).returning({ id: corpCardUsages.id }),
    ).resolves.toHaveLength(1);
  });

  it("구매 요청 두 행의 같은 idempotency_key는 purchase_requests_idempotency_key_uniq로 거부되고 키 없는 행은 여럿 들어간다", async () => {
    const b = await cardBase();
    const key = randomUUID();
    await db.insert(purchaseRequests).values(purchaseRow(b, { idempotencyKey: key }));
    await expectPgError(
      () => db.insert(purchaseRequests).values(purchaseRow(b, { idempotencyKey: key })),
      "23505",
      "purchase_requests_idempotency_key_uniq",
    );
    await db.insert(purchaseRequests).values(purchaseRow(b, { idempotencyKey: null }));
    await expect(
      db.insert(purchaseRequests).values(purchaseRow(b, { idempotencyKey: null })).returning({ id: purchaseRequests.id }),
    ).resolves.toHaveLength(1);
  });

  async function payeeBase() {
    const drafter = await makePerson("기안자", DEFAULT_ROLE_ID, null);
    const payee = await makePerson("지급 직원", DEFAULT_ROLE_ID, null);
    const vendor = await insertVendor(SYSTEM_VIEWER, { name: `거래처-${randomUUID()}`, normalizedName: `거래처-${randomUUID()}` });
    return { drafterId: drafter.id, payeeUserId: payee.id, vendorId: vendor.id };
  }

  // D-6517: 지급처는 거래처 또는 직원 중 하나 — 둘 다 차면 거부, 둘 다 빈 행(작성 중 · 기존)은 허용.
  it("거래처와 직원 지급처가 둘 다 찬 지출결의는 expenses_payee_one_check로 거부된다", async () => {
    const p = await payeeBase();
    await expectPgError(
      () => db.insert(expenses).values({ drafterId: p.drafterId, vendorId: p.vendorId, payeeUserId: p.payeeUserId }),
      "23514",
      "expenses_payee_one_check",
    );
  });

  it("지급처가 거래처만 · 직원만 · 둘 다 빈 지출결의는 들어간다", async () => {
    const p = await payeeBase();
    const rows = await db
      .insert(expenses)
      .values([
        { drafterId: p.drafterId, vendorId: p.vendorId },
        { drafterId: p.drafterId, payeeUserId: p.payeeUserId },
        { drafterId: p.drafterId },
      ])
      .returning({ id: expenses.id });
    expect(rows).toHaveLength(3);
  });

  it("없는 사람 id를 직원 지급처로 넣으면 expenses_payee_user_id_users_id_fk로 거부된다", async () => {
    const p = await payeeBase();
    await expectPgError(
      () => db.insert(expenses).values({ drafterId: p.drafterId, payeeUserId: `없는-${randomUUID()}` }),
      "23503",
      "expenses_payee_user_id_users_id_fk",
    );
  });

  // 카드 ①(UI-SPEC V15): 받는 인원 — 기본값 1, 1 미만 거부.
  it("받는 인원을 주지 않은 지출결의는 1로 읽힌다", async () => {
    const p = await payeeBase();
    const [row] = await db.insert(expenses).values({ drafterId: p.drafterId }).returning({ recipientCount: expenses.recipientCount });
    expect(row?.recipientCount).toBe(1);
  });

  it("받는 인원 0은 expenses_recipient_count_check로 거부되고 5는 들어간다", async () => {
    const p = await payeeBase();
    await expectPgError(
      () => db.insert(expenses).values({ drafterId: p.drafterId, recipientCount: 0 }),
      "23514",
      "expenses_recipient_count_check",
    );
    const [row] = await db.insert(expenses).values({ drafterId: p.drafterId, recipientCount: 5 }).returning({ recipientCount: expenses.recipientCount });
    expect(row?.recipientCount).toBe(5);
  });
});

// 06.5-01 Task 3: 기존 표에 NOT VALID로 건 이 페이즈의 CHECK · FK 여섯은 *_payment_followup_validate.sql이 검증한다.
describe("06.5 스키마 — 제약 검증(VALIDATE)", () => {
  it("이 페이즈의 CHECK · FK 여섯이 전부 convalidated다", async () => {
    const names = [
      "quote_lines_source_expense_kind_check",
      "quote_lines_source_synced_pair_check",
      "users_account_holder_required_check",
      "expenses_payee_one_check",
      "expenses_recipient_count_check",
      "expenses_payee_user_id_users_id_fk",
    ];
    const { rows } = await db.execute<{ conname: string; convalidated: boolean }>(
      sql`SELECT conname, convalidated FROM pg_constraint WHERE conname IN (${sql.join(names.map((name) => sql`${name}`), sql`, `)}) ORDER BY conname`,
    );
    expect(Object.fromEntries(rows.map((row) => [row.conname, row.convalidated]))).toEqual(Object.fromEntries(names.map((name) => [name, true])));
  });
});
