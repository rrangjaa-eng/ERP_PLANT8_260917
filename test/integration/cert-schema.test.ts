import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/db/client";

// 코디네이터 지시(PR #88) — Task 1 커밋 c268541(스키마·마이그레이션 0017·
// 0018)이 DEFERRABLE 상태를 커밋된 테스트가 아니라 계획의 <verify> ad-hoc
// node 스크립트로만 확인했다. 이 파일이 그 빈자리를 메운다 — 재생성에서
// 절이 사라지면(T-04.3-180) 이 테스트가 잡는다.
describe("cert_winners_event_id_name_phone_unique — DEFERRABLE INITIALLY IMMEDIATE(백필)", () => {
  it("condeferrable=true, condeferred=false다", async () => {
    const rows = await db.execute<{ condeferrable: boolean; condeferred: boolean }>(
      sql`select condeferrable, condeferred from pg_constraint where conname = ${"cert_winners_event_id_name_phone_unique"}`,
    );
    const [row] = rows.rows;
    expect(row).toBeDefined();
    expect(row?.condeferrable).toBe(true);
    expect(row?.condeferred).toBe(false);
  });
});
