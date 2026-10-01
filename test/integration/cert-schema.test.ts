import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/db/client";

// 04.3-15 Task 1 — 명단 → 경품 목록 모델(5909578685). 재생성 마이그레이션이 새 표 · 제약을
// 실제 DB에 걸었는지 pg_constraint로 확인한다(재생성에서 손 삽입 · 제약이 빠지면 여기서 잡는다).

async function tableExists(name: string): Promise<boolean> {
  const rows = await db.execute<{ n: number }>(
    sql`select count(*)::int as n from information_schema.tables where table_name = ${name}`,
  );
  return (rows.rows[0]?.n ?? 0) > 0;
}

async function insertEventRow(values: { tokenHash: string | null; tokenEncrypted: string | null; qrCreatedAt: Date | null; expiresAt: Date | null }) {
  await db.execute(sql`
    insert into cert_events (name, won_on, token_hash, token_encrypted, qr_created_at, expires_at, contact_phone)
    values ('스키마 확인', '2026-10-01', ${values.tokenHash}, ${values.tokenEncrypted}, ${values.qrCreatedAt}, ${values.expiresAt}, '021234567')
  `);
}

describe("cert_* 표 — 경품 목록 모델", () => {
  it("cert_prizes가 있고 옛 당첨자 표는 없다", async () => {
    expect(await tableExists("cert_prizes")).toBe(true);
    expect(await tableExists("cert_winners")).toBe(false);
  });

  it("제약 여섯이 pg_constraint에 있다", async () => {
    const names = [
      "cert_events_qr_state_check",
      "cert_prizes_unit_value_krw_check",
      "cert_prizes_delivery_check",
      "cert_prizes_winner_count_check",
      "cert_submissions_quantity_check",
      "cert_submissions_event_id_idempotency_key_hash_unique",
    ];
    const rows = await db.execute<{ conname: string }>(
      sql`select conname from pg_constraint where conname in ${sql.raw(`(${names.map((n) => `'${n}'`).join(",")})`)}`,
    );
    expect(rows.rows.map((r) => r.conname).sort()).toEqual([...names].sort());
  });

  it("토큰 없는 신청됨 행사는 들어가고, 토큰만 있고 QR 생성 시각이 없는 행사는 CHECK로 거부된다", async () => {
    await insertEventRow({ tokenHash: null, tokenEncrypted: null, qrCreatedAt: null, expiresAt: null });
    await expect(
      insertEventRow({ tokenHash: randomUUID(), tokenEncrypted: "v1:x", qrCreatedAt: null, expiresAt: new Date() }),
    ).rejects.toThrow();
  });

  it("마감은 토큰이 있을 때만 — 토큰 없이 마감만 있는 행사는 거부된다", async () => {
    await expect(
      insertEventRow({ tokenHash: null, tokenEncrypted: null, qrCreatedAt: null, expiresAt: new Date() }),
    ).rejects.toThrow();
  });

  it("winner_count 0인 경품은 CHECK로 거부된다(E6 a)", async () => {
    const event = await db.execute<{ id: string }>(sql`
      insert into cert_events (name, won_on, contact_phone) values ('당첨 수 확인', '2026-10-01', '021234567') returning id
    `);
    const eventId = event.rows[0]?.id;
    await expect(
      db.execute(sql`
        insert into cert_prizes (event_id, name, unit_value_krw, delivery, winner_count)
        values (${eventId}, '갤럭시 탭 S10', 1290000, 'onsite', 0)
      `),
    ).rejects.toThrow();
  });

  it("cert_submissions에 대조 제외 칸 둘이 NULL 허용으로 있다(E1 b)", async () => {
    const rows = await db.execute<{ column_name: string; is_nullable: string }>(sql`
      select column_name, is_nullable from information_schema.columns
      where table_name = 'cert_submissions' and column_name in ('excluded_at', 'excluded_by')
    `);
    expect(rows.rows.map((r) => r.column_name).sort()).toEqual(["excluded_at", "excluded_by"]);
    expect(rows.rows.every((r) => r.is_nullable === "YES")).toBe(true);
  });
});
