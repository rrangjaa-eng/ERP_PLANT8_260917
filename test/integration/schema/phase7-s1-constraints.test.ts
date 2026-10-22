import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { expenses, vendors } from "@/db/schema";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { insertVendor } from "@/repositories/vendors";
import { makePerson } from "../approvals-fixtures";

// 07-02(스키마 S1) — 희망 지급일 · 사유 쌍(D-714 · D18), 수동 지정 기록 칸(C6), 기존 예정일 유지(D-740), 거래처 지급 기한(J5) · version(V3)이
// DB에서 직접 막히는지(도메인을 거치지 않는 최후 방어선). 행은 db.insert · db.update로 직접 넣는다.
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

async function drafter(): Promise<string> {
  const person = await makePerson("기안자", DEFAULT_ROLE_ID, null);
  return person.id;
}

describe("07 S1 — 희망 지급일 · 사유 쌍(D-714 · D18)", () => {
  it("희망 지급일만 있으면 expenses_requested_payment_pair_check로 거부된다", async () => {
    const drafterId = await drafter();
    await expectPgError(
      () => db.insert(expenses).values({ drafterId, requestedPaymentDate: "2026-11-02" }),
      "23514",
      "expenses_requested_payment_pair_check",
    );
  });

  it("사유만 있으면 expenses_requested_payment_pair_check로 거부된다", async () => {
    const drafterId = await drafter();
    await expectPgError(
      () => db.insert(expenses).values({ drafterId, requestedPaymentReason: "거래처 요청" }),
      "23514",
      "expenses_requested_payment_pair_check",
    );
  });

  it("둘 다 있거나 둘 다 없으면 들어간다", async () => {
    const drafterId = await drafter();
    const rows = await db
      .insert(expenses)
      .values([{ drafterId, requestedPaymentDate: "2026-11-02", requestedPaymentReason: "거래처 요청" }, { drafterId }])
      .returning({ id: expenses.id });
    expect(rows).toHaveLength(2);
  });

  it("있던 쌍에서 사유만 지우는 UPDATE도 거부된다", async () => {
    const drafterId = await drafter();
    const [row] = await db
      .insert(expenses)
      .values({ drafterId, requestedPaymentDate: "2026-11-02", requestedPaymentReason: "거래처 요청" })
      .returning({ id: expenses.id });
    if (!row) throw new Error("행 없음");
    await expectPgError(
      () => db.update(expenses).set({ requestedPaymentReason: null }).where(eq(expenses.id, row.id)),
      "23514",
      "expenses_requested_payment_pair_check",
    );
  });
});

describe("07 S1 — 수동 지정 기록 칸(C6 · D-714) · 기존 예정일(D-740)", () => {
  it("set_by만 있고 set_at이 없으면 expenses_scheduled_payment_set_check로 거부된다", async () => {
    const drafterId = await drafter();
    await expectPgError(
      () => db.insert(expenses).values({ drafterId, scheduledPaymentDate: "2026-11-10", scheduledPaymentSetBy: drafterId }),
      "23514",
      "expenses_scheduled_payment_set_check",
    );
  });

  it("set_at만 있고 set_by가 없으면 expenses_scheduled_payment_set_check로 거부된다", async () => {
    const drafterId = await drafter();
    await expectPgError(
      () => db.insert(expenses).values({ drafterId, scheduledPaymentDate: "2026-11-10", scheduledPaymentSetAt: new Date() }),
      "23514",
      "expenses_scheduled_payment_set_check",
    );
  });

  it("기록 둘이 있는데 예정일이 없으면 expenses_scheduled_payment_set_check로 거부된다", async () => {
    const drafterId = await drafter();
    await expectPgError(
      () => db.insert(expenses).values({ drafterId, scheduledPaymentSetBy: drafterId, scheduledPaymentSetAt: new Date() }),
      "23514",
      "expenses_scheduled_payment_set_check",
    );
  });

  it("예정일 · 기록 둘이 함께 있으면 들어간다", async () => {
    const drafterId = await drafter();
    const at = new Date("2026-10-21T01:00:00Z");
    const [row] = await db
      .insert(expenses)
      .values({ drafterId, scheduledPaymentDate: "2026-11-10", scheduledPaymentSetBy: drafterId, scheduledPaymentSetAt: at })
      .returning({ setBy: expenses.scheduledPaymentSetBy, setAt: expenses.scheduledPaymentSetAt });
    expect(row).toEqual({ setBy: drafterId, setAt: at });
  });

  it("없는 사람 id를 기록하면 expenses_scheduled_payment_set_by_users_id_fk로 거부된다", async () => {
    const drafterId = await drafter();
    await expectPgError(
      () =>
        db.insert(expenses).values({
          drafterId,
          scheduledPaymentDate: "2026-11-10",
          scheduledPaymentSetBy: `없는-${randomUUID()}`,
          scheduledPaymentSetAt: new Date(),
        }),
      "23503",
      "expenses_scheduled_payment_set_by_users_id_fk",
    );
  });

  // D-740: 07 전 기존 값 꼴 — 예정일만 있고 기록 칸이 빈 행은 「수동 지정」으로 남는다.
  it("예정일만 있고 기록 칸이 빈 행은 들어간다", async () => {
    const drafterId = await drafter();
    const [row] = await db
      .insert(expenses)
      .values({ drafterId, scheduledPaymentDate: "2026-11-10" })
      .returning({ date: expenses.scheduledPaymentDate, setBy: expenses.scheduledPaymentSetBy, setAt: expenses.scheduledPaymentSetAt });
    expect(row).toEqual({ date: "2026-11-10", setBy: null, setAt: null });
  });
});

describe("07 S1 — 거래처 지급 기한(J5) · version(V3)", () => {
  async function vendor(kind: "client" | "supplier" | "both"): Promise<string> {
    const name = `거래처-${randomUUID()}`;
    const row = await insertVendor(SYSTEM_VIEWER, { name, normalizedName: name });
    await db.update(vendors).set({ kind }).where(eq(vendors.id, row.id));
    return row.id;
  }

  function vendorRow(kind: "client" | "supplier" | "both", paymentTermDays: number | null) {
    const name = `거래처-${randomUUID()}`;
    return { name, normalizedName: name, kind, paymentTermDays };
  }

  it("클라이언트 거래처에 기한 30을 넣으면 vendors_payment_term_days_supplier_check로 거부된다", async () => {
    await expectPgError(() => db.insert(vendors).values(vendorRow("client", 30)), "23514", "vendors_payment_term_days_supplier_check");
  });

  it("기한이 있는 협력사를 클라이언트로 바꾸면 vendors_payment_term_days_supplier_check로 거부된다", async () => {
    const [row] = await db.insert(vendors).values(vendorRow("supplier", 30)).returning({ id: vendors.id });
    if (!row) throw new Error("행 없음");
    await expectPgError(
      () => db.update(vendors).set({ kind: "client" }).where(eq(vendors.id, row.id)),
      "23514",
      "vendors_payment_term_days_supplier_check",
    );
  });

  it("협력사 기한 0 · 181은 vendors_payment_term_days_range_check로 거부된다", async () => {
    await expectPgError(() => db.insert(vendors).values(vendorRow("supplier", 0)), "23514", "vendors_payment_term_days_range_check");
    await expectPgError(() => db.insert(vendors).values(vendorRow("supplier", 181)), "23514", "vendors_payment_term_days_range_check");
  });

  it("협력사 · 둘 다 갈래에 기한 1 · 180은 들어간다", async () => {
    const rows = await db
      .insert(vendors)
      .values([vendorRow("supplier", 1), vendorRow("supplier", 180), vendorRow("both", 1), vendorRow("both", 180)])
      .returning({ days: vendors.paymentTermDays });
    expect(rows.map((r) => r.days)).toEqual([1, 180, 1, 180]);
  });

  it("기한 null은 모든 갈래에서 들어간다", async () => {
    const rows = await db
      .insert(vendors)
      .values([vendorRow("client", null), vendorRow("supplier", null), vendorRow("both", null)])
      .returning({ id: vendors.id });
    expect(rows).toHaveLength(3);
  });

  it("새 거래처 행의 version은 1이다", async () => {
    const id = await vendor("both");
    const [row] = await db.select({ version: vendors.version }).from(vendors).where(eq(vendors.id, id));
    expect(row?.version).toBe(1);
  });

  // 기존 시드 · 시험 이전 행 꼴: version을 주지 않고 넣은 모든 행이 1이다(상수 기본값 — 마이그레이션이 기존 행을 다시 쓰지 않음).
  it("version을 주지 않은 거래처 행은 모두 version 1이다", async () => {
    await vendor("client");
    await vendor("supplier");
    const rows = await db.select({ version: vendors.version }).from(vendors);
    expect(rows.length).toBeGreaterThanOrEqual(2);
    expect(new Set(rows.map((r) => r.version))).toEqual(new Set([1]));
  });
});
