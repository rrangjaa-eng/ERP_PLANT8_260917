import { getTableName } from "drizzle-orm";
import { PgTable, type TableConfig } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db/client";
import { certEvents, certSubmissions, certWinners } from "@/db/schema";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { decrypt } from "@/lib/crypto";
import { setSettingValue } from "@/domain/settings/registry";
import { CERT_ENABLED } from "@/domain/settings/keys";
import { seedSubmittedCert } from "@/test/e2e/helpers/cert";

// 04.3-02 Task 3 ⑥ — 평문 부재·가린 값 형식·토큰 해시 저장을 증명한다.
// 제출 표본은 규약 C4 seedSubmittedCert()로 만든다(submitCertificate를
// 이 파일에서 직접 부르지 않는다 — 04.3-07 Task 1 verify가 이 파일의
// 직접 호출 0줄을 강제한다, /review RB-P2b).

// 규약 C1 — 환경 게이트는 global-setup.ts가 켜지만 설정 cert.enabled는
// 기본 꺼짐이다(cert-intake.test.ts와 같은 규약).
beforeEach(async () => {
  await setSettingValue(SYSTEM_VIEWER, CERT_ENABLED, true);
});

describe("cert-crypto — 평문 부재 · 가린 값 · 토큰 해시(Task 3 ⑥)", () => {
  it("세 표의 모든 text 칸에 13자리 평문·뒤 7자리·토큰 평문이 없다(스키마에서 text 칸을 모은다)", async () => {
    const seeded = await seedSubmittedCert({ rrn: "9304122123458", name: "김하늘", phone: "010-4821-7730" });

    const rrn13 = "9304122123458";
    const rrnTail7 = rrn13.slice(6);

    const tables: PgTable<TableConfig>[] = [certEvents, certWinners, certSubmissions];

    for (const table of tables) {
      const rows = await db.select().from(table);
      for (const row of rows) {
        for (const [key, value] of Object.entries(row as Record<string, unknown>)) {
          if (typeof value !== "string") continue;
          expect(value, `${getTableName(table)}.${key}에 13자리 평문이 있다`).not.toContain(rrn13);
          expect(value, `${getTableName(table)}.${key}에 뒤 7자리 평문이 있다`).not.toContain(rrnTail7);
          // T7 — 링크 토큰 평문도 세 표 어느 칸에도 없다.
          expect(value, `${getTableName(table)}.${key}에 토큰 평문이 있다`).not.toContain(seeded.token);
        }
      }
    }
  });

  it("cert_submissions.rrn_encrypted는 v1:로 시작하고 decrypt() 왕복이 원문과 같다", async () => {
    await seedSubmittedCert({ rrn: "9304122123458" });
    const [row] = await db.select().from(certSubmissions);
    expect(row?.rrnEncrypted).toMatch(/^v1:/);
    expect(row?.rrnEncrypted && decrypt(row.rrnEncrypted)).toBe("9304122123458");
  });

  it("cert_submissions.rrn_masked은 930412-2****** 형식이다", async () => {
    await seedSubmittedCert({ rrn: "9304122123458" });
    const [row] = await db.select().from(certSubmissions);
    expect(row?.rrnMasked).toBe("930412-2******");
  });

  it("cert_events.token_hash는 SHA-256 hex(64자)이고 토큰 평문은 어느 칸에도 없다", async () => {
    const seeded = await seedSubmittedCert();
    const [event] = await db.select().from(certEvents);
    expect(event?.tokenHash).toMatch(/^[0-9a-f]{64}$/);

    for (const key of ["name", "tokenHash", "tokenEncrypted", "contactPhone"] as const) {
      const value = event?.[key];
      if (typeof value === "string") expect(value).not.toContain(seeded.token);
    }
  });
});
