import { eq, getTableName, sql } from "drizzle-orm";
import { PgTable, type TableConfig } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db/client";
import { actionLog, certEvents, certPrizes, certSubmissions } from "@/db/schema";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { decrypt } from "@/lib/crypto";
import { setSettingValue } from "@/domain/settings/registry";
import { CERT_ENABLED } from "@/domain/settings/keys";
import { seedSubmittedCert } from "@/test/e2e/helpers/cert";
import { env } from "@/lib/env";
import { appendActionLog } from "@/repositories/action-log";
import { recordRrnReopen, revealRrn } from "@/domain/certs/review";
import { deferred } from "@/test/integration/lock-race";
import { FULL_GRANT, countLogs, decryptSpy, makeReviewer } from "@/test/integration/cert-review-fixtures";

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

    const tables: PgTable<TableConfig>[] = [certEvents, certPrizes, certSubmissions];

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

// 04.3-07 Task 1 — 전체 보기(revealRrn) · 고친 값 재열람(recordRrnReopen). 순서는
// vendors revealAccountNumber와 같다: 권한 → 기록(mask_reveal, 잠금을 쥔 같은 tx) → 복호화.
describe("cert-crypto — 전체 보기는 기록 먼저 · 같은 tx(04.3-07)", () => {
  it("권한 있는 viewer(테스트 계급에 켬 — 시드 기본값 아님)는 930412-2123458을 받고 mask_reveal이 정확히 1줄 · detail에 번호 없음", async () => {
    const seeded = await seedSubmittedCert({ rrn: "9304122123458" });
    const viewer = await makeReviewer(FULL_GRANT);

    const result = await revealRrn(viewer, seeded.submissionId);

    expect(result).toEqual({ kind: "revealed", rrn: "930412-2123458" });
    const rows = (await db.select().from(actionLog)).filter(
      (row) => row.actionType === "mask_reveal" && row.entityId === seeded.submissionId,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.entity).toBe("cert_submission");
    expect(JSON.stringify(rows[0]?.detail)).not.toContain("2123458");
  });

  it("권한 없는 viewer(정보 항목 cert.rrn_unmasked 꺼짐) → 거부 · 로그 0줄 · 복호화 0번", async () => {
    const seeded = await seedSubmittedCert();
    const viewer = await makeReviewer({ view: true, write: true, value: true, unmasked: false });
    const spy = decryptSpy();

    const result = await revealRrn(viewer, seeded.submissionId, { decrypt: spy.fn });

    expect(result).toEqual({ kind: "denied" });
    expect(spy.calls).toBe(0);
    expect(await countLogs("mask_reveal", seeded.submissionId)).toBe(0);
  });

  it("메뉴 certs.submissions 보기를 거두고 cert.rrn_unmasked만 남긴 viewer → revealRrn · recordRrnReopen 둘 다 거부 · 복호화 0번 · 로그 0줄(codex r2 C4)", async () => {
    const seeded = await seedSubmittedCert();
    const viewer = await makeReviewer({ view: false, write: true, value: true, unmasked: true });
    const spy = decryptSpy();

    expect(await revealRrn(viewer, seeded.submissionId, { decrypt: spy.fn })).toEqual({ kind: "denied" });
    expect(await recordRrnReopen(viewer, seeded.submissionId)).toEqual({ kind: "denied" });
    expect(spy.calls).toBe(0);
    expect(await countLogs("mask_reveal", seeded.submissionId)).toBe(0);
  });

  it("기록 함수가 던지면 revealRrn도 던지고 복호화는 0번(기록 먼저)", async () => {
    const seeded = await seedSubmittedCert();
    const viewer = await makeReviewer(FULL_GRANT);
    const spy = decryptSpy();

    await expect(
      revealRrn(viewer, seeded.submissionId, {
        decrypt: spy.fn,
        appendActionLog: () => Promise.reject(new Error("기록 실패(주입)")),
      }),
    ).rejects.toThrow("기록 실패(주입)");
    expect(spy.calls).toBe(0);
    expect(await countLogs("mask_reveal", seeded.submissionId)).toBe(0);
  });

  it("파기된 확인증 → 거부 · 복호화 0번 · 로그 0줄", async () => {
    const seeded = await seedSubmittedCert();
    await db.update(certSubmissions).set({ purgedAt: new Date() }).where(eq(certSubmissions.id, seeded.submissionId));
    const viewer = await makeReviewer(FULL_GRANT);
    const spy = decryptSpy();

    expect(await revealRrn(viewer, seeded.submissionId, { decrypt: spy.fn })).toEqual({ kind: "denied" });
    expect(await recordRrnReopen(viewer, seeded.submissionId)).toEqual({ kind: "denied" });
    expect(spy.calls).toBe(0);
    expect(await countLogs("mask_reveal", seeded.submissionId)).toBe(0);
  });

  it("recordRrnReopen(고친 값 재열람) → 복호화 없이 mask_reveal 1줄", async () => {
    const seeded = await seedSubmittedCert();
    const viewer = await makeReviewer(FULL_GRANT);

    expect(await recordRrnReopen(viewer, seeded.submissionId)).toEqual({ kind: "recorded" });
    expect(await countLogs("mask_reveal", seeded.submissionId)).toBe(1);
  });

  it(
    "풀 한도(DB_POOL_MAX)만큼 동시에 누르고 기록 단계에서 모두를 기다려도 10초 안에 끝나고 mask_reveal이 그 수만큼(codex r2 C5)",
    async () => {
      const seeded = await seedSubmittedCert();
      const viewer = await makeReviewer(FULL_GRANT);
      const count = env.DB_POOL_MAX;
      const barrier = deferred();
      let arrived = 0;

      const appendAtBarrier: typeof appendActionLog = async (v, entry, tx) => {
        if (!tx) throw new Error("recordAction이 tx를 넘기지 않았다");
        arrived += 1;
        if (arrived === count) barrier.resolve();
        await barrier.promise;
        return appendActionLog(v, entry, tx);
      };

      const all = Promise.all(
        Array.from({ length: count }, () => revealRrn(viewer, seeded.submissionId, { appendActionLog: appendAtBarrier })),
      );
      const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error("10초 시간 초과")), 10_000));
      const results = await Promise.race([all, timeout]);

      expect(results.every((r) => r.kind === "revealed")).toBe(true);
      expect(await countLogs("mask_reveal", seeded.submissionId)).toBe(count);
    },
    20_000,
  );

  it("행 읽기가 FOR SHARE 잠금 안이다 — 기록 단계에서 멈춘 동안 다른 연결의 purged_at UPDATE가 잠금 대기로 실패한다", async () => {
    const seeded = await seedSubmittedCert();
    const viewer = await makeReviewer(FULL_GRANT);
    const reached = deferred();
    const release = deferred();

    const pending = revealRrn(viewer, seeded.submissionId, {
      appendActionLog: async (v, entry, tx) => {
        reached.resolve();
        await release.promise;
        return appendActionLog(v, entry, tx);
      },
    });
    await reached.promise;

    try {
      await expect(
        db.transaction(async (tx) => {
          await tx.execute(sql`SET LOCAL lock_timeout = '300ms'`);
          await tx.update(certSubmissions).set({ purgedAt: new Date() }).where(eq(certSubmissions.id, seeded.submissionId));
        }),
      ).rejects.toThrow();
    } finally {
      release.resolve();
    }
    expect(await pending).toEqual({ kind: "revealed", rrn: "930412-2123458" });
  });
});
