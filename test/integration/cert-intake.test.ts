import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, expectTypeOf, it } from "vitest";
import type { DbOrTx } from "@/db/client";
import { db } from "@/db/client";
import { certSignatureUploads, certSubmissions, certWinners } from "@/db/schema";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { loadIntake, selectWinner, submitCertificate, verifyLast4 } from "@/domain/certs/intake";
import { setSettingValue } from "@/domain/settings/registry";
import { CERT_ENABLED, CERT_RETENTION_YEARS } from "@/domain/settings/keys";
import { listWinnersForIntake } from "@/repositories/cert-winners";
import {
  createCertEvent,
  seedSubmittedCert,
  signaturePngFixture,
  withCertFeatureOff,
} from "@/test/e2e/helpers/cert";

// 04.3-02 Task 2 ⓪(d) — 확인증 공개 흐름 통합 테스트(실제 Postgres).
// 액션 파일(app/c/[token]/actions.ts)은 import하지 않는다(leak-scan 사실 —
// server-only 사슬 때문에 Vitest가 import할 수 없다). 액션 첫 줄의 가드는
// E2E 직접 POST가 증명한다.

// 규약 C1 — 환경 게이트는 global-setup.ts가 CERT_FEATURE_ALLOWED=true로
// 켜지만 설정 cert.enabled는 기본 꺼짐이다(각 테스트가 직접 켠다).
beforeEach(async () => {
  await setSettingValue(SYSTEM_VIEWER, CERT_ENABLED, true);
});

async function makeEvent(overrides?: {
  name?: string;
  phone?: string;
  prizeName?: string;
  quantity?: number;
  delivery?: "onsite" | "parcel";
}) {
  return createCertEvent({
    winners: [
      {
        name: overrides?.name ?? "김하늘",
        phone: overrides?.phone ?? "010-4821-7730",
        prizeName: overrides?.prizeName ?? "갤럭시 탭 S10",
        quantity: overrides?.quantity ?? 1,
        delivery: overrides?.delivery ?? "onsite",
      },
    ],
  });
}

async function winnerIdOf(eventId: string, name: string): Promise<string> {
  const rows = await listWinnersForIntake(SYSTEM_VIEWER, eventId);
  const row = rows.find((r) => r.name === name);
  if (!row) throw new Error(`당첨자를 찾지 못했다: ${name}`);
  return row.id;
}

function submissionInputFor(rowId: string, proof: string, consent: { version: string; retentionYears: number }) {
  return {
    rowId,
    proof,
    name: "김하늘",
    rrnFront6: "930412",
    rrnBack7: "2123458",
    phone: "010-4821-7730",
    consent: true as const,
    signaturePngBase64: signaturePngFixture().toString("base64"),
    idempotencyKey: randomUUID(),
    consentVersion: consent.version,
    retentionYears: consent.retentionYears,
  };
}

describe("확인증 공개 흐름 — 정상 제출·인증 거부", () => {
  it("정상 제출: createEvent → selectWinner → verifyLast4 → submitCertificate → submitted, 제출 행 1", async () => {
    const { eventId, token } = await makeEvent();
    const winnerId = await winnerIdOf(eventId, "김하늘");

    const selected = await selectWinner(token, winnerId);
    expect(selected.kind).toBe("ok");

    const verified = await verifyLast4(token, winnerId, "7730", randomUUID());
    expect(verified.kind).toBe("ok");
    if (verified.kind !== "ok") throw new Error("unreachable");

    const result = await submitCertificate(token, submissionInputFor(winnerId, verified.proof, verified.consent));

    expect(result.kind).toBe("submitted");
    const [submissionRow] = await db.select().from(certSubmissions).where(eq(certSubmissions.winnerId, winnerId));
    expect(submissionRow).toBeDefined();
  });

  it("인증 거부 — 증표 없이 submitCertificate를 부르면 거부되고 제출 행 0", async () => {
    const { eventId, token } = await makeEvent();
    const winnerId = await winnerIdOf(eventId, "김하늘");

    const result = await submitCertificate(
      token,
      submissionInputFor(winnerId, "not-a-real-proof", { version: "v1", retentionYears: 5 }),
    );

    expect(result.kind).toBe("expiredProof");
    const rows = await db.select().from(certSubmissions).where(eq(certSubmissions.winnerId, winnerId));
    expect(rows).toHaveLength(0);
  });
});

describe("확인증 공개 흐름 — 저장소 fail-closed 순서(S3)", () => {
  it("주입한 저장소가 던지면 의도 행·제출 행이 모두 0이다(고아 없음)", async () => {
    const { eventId, token } = await makeEvent();
    const winnerId = await winnerIdOf(eventId, "김하늘");
    const verified = await verifyLast4(token, winnerId, "7730", randomUUID());
    if (verified.kind !== "ok") throw new Error("unreachable");

    let threw: unknown;
    try {
      await submitCertificate(token, submissionInputFor(winnerId, verified.proof, verified.consent), {
        signatureStore: {
          put: () => Promise.reject(new Error("저장소 사용 불가(주입)")),
          get: () => Promise.resolve(null),
          delete: () => Promise.resolve(),
        },
      });
    } catch (e) {
      threw = e;
    }

    expect(threw).toBeInstanceOf(Error);
    const intents = await db.select().from(certSignatureUploads);
    expect(intents).toHaveLength(0);
    const submissions = await db.select().from(certSubmissions).where(eq(certSubmissions.winnerId, winnerId));
    expect(submissions).toHaveLength(0);
  });
});

describe("확인증 공개 흐름 — 연락처 정규화 실패(S8)", () => {
  it("전화번호가 형식에 맞지 않으면 invalid(phone), 빈 문자열로 저장하지 않는다", async () => {
    const { eventId, token } = await makeEvent();
    const winnerId = await winnerIdOf(eventId, "김하늘");
    const verified = await verifyLast4(token, winnerId, "7730", randomUUID());
    if (verified.kind !== "ok") throw new Error("unreachable");

    const input = { ...submissionInputFor(winnerId, verified.proof, verified.consent), phone: "abc" };
    const result = await submitCertificate(token, input);

    expect(result).toEqual({ kind: "invalid", fields: ["phone"] });
    const rows = await db.select().from(certSubmissions).where(eq(certSubmissions.winnerId, winnerId));
    expect(rows).toHaveLength(0);
  });
});

describe("확인증 공개 흐름 — 규약 C1 domain 두 겹째(설정 꺼짐)", () => {
  it("cert.enabled를 끄면 loadIntake·selectWinner·verifyLast4·submitCertificate 넷 다 notFound, DB 변화 없음", async () => {
    const { eventId, token } = await makeEvent();
    const winnerId = await winnerIdOf(eventId, "김하늘");

    await withCertFeatureOff(async () => {
      expect((await loadIntake(token)).kind).toBe("notFound");
      expect((await selectWinner(token, winnerId)).kind).toBe("notFound");
      expect((await verifyLast4(token, winnerId, "7730", randomUUID())).kind).toBe("notFound");
      const submitResult = await submitCertificate(
        token,
        submissionInputFor(winnerId, "x", { version: "v1", retentionYears: 5 }),
      );
      expect(submitResult.kind).toBe("notFound");
    });

    const [winnerRow] = await db.select().from(certWinners).where(eq(certWinners.id, winnerId));
    expect(winnerRow?.failedAttempts).toBe(0);
    expect(winnerRow?.verifyProofHash).toBeNull();
    const submissionRows = await db.select().from(certSubmissions).where(eq(certSubmissions.winnerId, winnerId));
    expect(submissionRows).toHaveLength(0);
  });
});

describe("확인증 공개 흐름 — 동의 묶음(#15)", () => {
  it("확인 뒤 보존 연수를 바꿔도 저장된 확인증은 확인 때 묶인 값이다", async () => {
    const { eventId, token } = await makeEvent();
    const winnerId = await winnerIdOf(eventId, "김하늘");

    const verified = await verifyLast4(token, winnerId, "7730", randomUUID());
    expect(verified.kind).toBe("ok");
    if (verified.kind !== "ok") throw new Error("unreachable");
    expect(verified.consent.retentionYears).toBe(5);

    await setSettingValue(SYSTEM_VIEWER, CERT_RETENTION_YEARS, 7);

    // 받은 consent 그대로(5년) 제출 — 저장된다.
    const result = await submitCertificate(token, submissionInputFor(winnerId, verified.proof, verified.consent));
    expect(result.kind).toBe("submitted");

    const [submissionRow] = await db.select().from(certSubmissions).where(eq(certSubmissions.winnerId, winnerId));
    expect(submissionRow?.retentionYears).toBe(5);
  });

  it("돌려보낸 retentionYears가 묶인 값과 다르면 expiredProof, 제출 행 0", async () => {
    const { eventId, token } = await makeEvent();
    const winnerId = await winnerIdOf(eventId, "김하늘");
    const verified = await verifyLast4(token, winnerId, "7730", randomUUID());
    expect(verified.kind).toBe("ok");
    if (verified.kind !== "ok") throw new Error("unreachable");

    const result = await submitCertificate(
      token,
      submissionInputFor(winnerId, verified.proof, {
        version: verified.consent.version,
        retentionYears: verified.consent.retentionYears + 1, // 묶인 값과 다르게
      }),
    );
    expect(result.kind).toBe("expiredProof");
    const rows = await db.select().from(certSubmissions).where(eq(certSubmissions.winnerId, winnerId));
    expect(rows).toHaveLength(0);
  });
});

describe("확인증 공개 흐름 — E3-27 순서(서식 읽기 실패)", () => {
  it("서식 읽기가 실패하면 put·의도 행·제출 행이 모두 0이다(고아 없음)", async () => {
    const { eventId, token } = await makeEvent();
    const winnerId = await winnerIdOf(eventId, "김하늘");
    const verified = await verifyLast4(token, winnerId, "7730", randomUUID());
    expect(verified.kind).toBe("ok");
    if (verified.kind !== "ok") throw new Error("unreachable");

    let putCalled = 0;
    let threw: unknown;
    try {
      await submitCertificate(token, submissionInputFor(winnerId, verified.proof, verified.consent), {
        loadDocumentNumberFormat: () => {
          throw new Error("서식 읽기 실패(주입)");
        },
        signatureStore: {
          put: () => {
            putCalled++;
            return Promise.resolve();
          },
          get: () => Promise.resolve(null),
          delete: () => Promise.resolve(),
        },
      });
    } catch (e) {
      threw = e;
    }

    expect(threw).toBeInstanceOf(Error);
    expect(putCalled).toBe(0);
    const intents = await db.select().from(certSignatureUploads);
    expect(intents).toHaveLength(0);
    const submissions = await db.select().from(certSubmissions).where(eq(certSubmissions.winnerId, winnerId));
    expect(submissions).toHaveLength(0);
  });
});

describe("확인증 공개 흐름 — E3-32 표본 도우미", () => {
  it("seedSubmittedCert() — 현장 수령, rrnMasked 형식, 제출 행 1", async () => {
    const seeded = await seedSubmittedCert();
    expect(seeded.rrnMasked).toBe("930412-2******");

    const [row] = await db.select().from(certSubmissions).where(eq(certSubmissions.winnerId, seeded.winnerId));
    expect(row).toBeDefined();
    expect(row?.address).toBeNull();
    expect(row?.certNo).toBe(seeded.certNo);
    expect(row?.id).toBe(seeded.submissionId);
  });

  it("seedSubmittedCert({delivery: parcel, extraWinners}) — 주소 있음, 추가 당첨자는 미제출", async () => {
    const seeded = await seedSubmittedCert({
      delivery: "parcel",
      extraWinners: [{ name: "이도윤", phone: "010-2231-0045" }],
    });
    expect(seeded.extraWinnerIds).toHaveLength(1);

    const [row] = await db.select().from(certSubmissions).where(eq(certSubmissions.winnerId, seeded.winnerId));
    expect(row?.address).not.toBeNull();

    const [extraRow] = await db.select().from(certWinners).where(eq(certWinners.id, seeded.extraWinnerIds[0]!));
    expect(extraRow?.submittedAt).toBeNull();
  });

  it("signaturePngFixture() — 1040×400, 184320바이트 이하, PNG 시그니처", () => {
    const png = signaturePngFixture();
    expect(png.length).toBeLessThanOrEqual(184_320);
    expect(png.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  });
});

describe("DbOrTx 타입 — delete·execute를 담는다(04.3-02 ⑨)", () => {
  it("타입 확인", () => {
    expectTypeOf<DbOrTx>().toHaveProperty("delete");
    expectTypeOf<DbOrTx>().toHaveProperty("execute");
  });
});

describe("확인증 공개 흐름 — 풀 교착 없음(T-04.3-140)", () => {
  it(
    "풀 크기 + 1건 동시 제출이 전부 저장된다",
    async () => {
      const { env } = await import("@/lib/env");
      const concurrency = env.DB_POOL_MAX + 1;

      const winners = Array.from({ length: concurrency }, (_, i) => ({
        name: `동시${i}`,
        phone: `010${String(20000000 + i).padStart(8, "0")}`,
      }));

      const { eventId, token } = await createCertEvent({ winners });
      const rows = await listWinnersForIntake(SYSTEM_VIEWER, eventId);

      const prepared = await Promise.all(
        winners.map(async (w) => {
          const winnerRow = rows.find((r) => r.name === w.name);
          if (!winnerRow) throw new Error(`당첨자를 찾지 못했다: ${w.name}`);
          const verified = await verifyLast4(token, winnerRow.id, w.phone.slice(-4), randomUUID());
          if (verified.kind !== "ok") throw new Error(`verifyLast4 실패: ${verified.kind}`);
          return { winnerId: winnerRow.id, proof: verified.proof, consent: verified.consent, phone: w.phone };
        }),
      );

      // 여섯이 같은 순간에 트랜잭션을 열게 하는 장벽 — 모든 요청의 put이
      // 들어온 뒤에야 풀린다.
      let arrived = 0;
      let releaseAll: () => void = () => {};
      const barrier = new Promise<void>((resolve) => {
        releaseAll = resolve;
      });
      const barrierStore = {
        put: async () => {
          arrived++;
          if (arrived === concurrency) releaseAll();
          await barrier;
        },
        get: () => Promise.resolve(null),
        delete: () => Promise.resolve(),
      };

      const results = await Promise.all(
        prepared.map((p) =>
          submitCertificate(
            token,
            {
              rowId: p.winnerId,
              proof: p.proof,
              name: "동시제출",
              rrnFront6: "930412",
              rrnBack7: "2123458",
              phone: p.phone,
              consent: true,
              signaturePngBase64: signaturePngFixture().toString("base64"),
              idempotencyKey: randomUUID(),
              consentVersion: p.consent.version,
              retentionYears: p.consent.retentionYears,
            },
            { signatureStore: barrierStore },
          ),
        ),
      );

      expect(results.every((r) => r.kind === "submitted")).toBe(true);
      const submissionRows = await db.select().from(certSubmissions).where(eq(certSubmissions.eventId, eventId));
      expect(submissionRows).toHaveLength(concurrency);
      expect(new Set(submissionRows.map((r) => r.certNo)).size).toBe(concurrency);
    },
    20_000,
  );
});

describe("확인증 공개 흐름 — E3-02 제출 로그 같은 tx(로그 실패 롤백 · 재제출)", () => {
  it("로그 INSERT가 실패하면 제출이 롤백되고, 같은 증표·같은 입력으로 다시 제출하면 저장된다", async () => {
    const { eventId, token } = await makeEvent();
    const winnerId = await winnerIdOf(eventId, "김하늘");
    const verified = await verifyLast4(token, winnerId, "7730", randomUUID());
    expect(verified.kind).toBe("ok");
    if (verified.kind !== "ok") throw new Error("unreachable");

    const input = submissionInputFor(winnerId, verified.proof, verified.consent);

    let threw: unknown;
    try {
      await submitCertificate(token, input, {
        appendActionLog: () => {
          throw new Error("행동 로그 실패(주입)");
        },
      });
    } catch (e) {
      threw = e;
    }
    expect(threw).toBeInstanceOf(Error);

    const afterFailure = await db.select().from(certSubmissions).where(eq(certSubmissions.winnerId, winnerId));
    expect(afterFailure).toHaveLength(0);
    const [winnerAfterFailure] = await db.select().from(certWinners).where(eq(certWinners.id, winnerId));
    expect(winnerAfterFailure?.submittedAt).toBeNull();

    // 같은 증표 · 같은 입력으로 다시 제출 — 롤백이 증표를 되살렸다.
    const retry = await submitCertificate(token, input);
    expect(retry.kind).toBe("submitted");
    const afterRetry = await db.select().from(certSubmissions).where(eq(certSubmissions.winnerId, winnerId));
    expect(afterRetry).toHaveLength(1);
  });

  it("설정에서 document_submit을 끄면 제출은 저장되고 로그는 0건이다", async () => {
    const { queryActionLog } = await import("@/repositories/action-log");
    const { ACTION_LOG_OPTIONAL_TYPES } = await import("@/domain/settings/keys");
    await setSettingValue(SYSTEM_VIEWER, ACTION_LOG_OPTIONAL_TYPES, []);

    const { eventId, token } = await makeEvent();
    const winnerId = await winnerIdOf(eventId, "김하늘");
    const verified = await verifyLast4(token, winnerId, "7730", randomUUID());
    if (verified.kind !== "ok") throw new Error("unreachable");

    const result = await submitCertificate(token, submissionInputFor(winnerId, verified.proof, verified.consent));
    expect(result.kind).toBe("submitted");

    const logs = await queryActionLog(SYSTEM_VIEWER, { actionType: "document_submit" });
    const logsForThisSubmission = logs.filter((l) => l.entityId === winnerId);
    expect(logsForThisSubmission).toHaveLength(0);
  });
});

describe("확인증 공개 흐름 — Task 3 ⑦ 주민등록번호 되묻기", () => {
  it("검증번호 mismatch 번호로 제출하면 rrnRecheck, 제출 행 0 · 같은 번호 재제출(rrnRecheckConfirmed) → submitted", async () => {
    const { eventId, token } = await makeEvent();
    const winnerId = await winnerIdOf(eventId, "김하늘");
    const verified = await verifyLast4(token, winnerId, "7730", randomUUID());
    if (verified.kind !== "ok") throw new Error("unreachable");

    const input = { ...submissionInputFor(winnerId, verified.proof, verified.consent), rrnBack7: "2123459" };

    const first = await submitCertificate(token, input);
    expect(first.kind).toBe("rrnRecheck");
    const rowsAfterFirst = await db.select().from(certSubmissions).where(eq(certSubmissions.winnerId, winnerId));
    expect(rowsAfterFirst).toHaveLength(0);

    const second = await submitCertificate(token, { ...input, rrnRecheckConfirmed: true });
    expect(second.kind).toBe("submitted");
    const rowsAfterSecond = await db.select().from(certSubmissions).where(eq(certSubmissions.winnerId, winnerId));
    expect(rowsAfterSecond).toHaveLength(1);
  });
});

describe("확인증 공개 흐름 — Task 3 ⑦ 행사 경계 · 남의 증표 · 만료 증표 · DTO 허용 목록", () => {
  it("행사 A의 토큰 + 행사 B의 당첨자 id → notFound(행사 경계)", async () => {
    const eventA = await makeEvent();
    const eventB = await makeEvent();
    const winnerBId = await winnerIdOf(eventB.eventId, "김하늘");

    const result = await selectWinner(eventA.token, winnerBId);
    expect(result.kind).toBe("notFound");
  });

  it("남의 증표로 제출 → 거부, 제출 행 없음", async () => {
    const eventA = await makeEvent();
    const winnerAId = await winnerIdOf(eventA.eventId, "김하늘");
    const verifiedA = await verifyLast4(eventA.token, winnerAId, "7730", randomUUID());
    if (verifiedA.kind !== "ok") throw new Error("unreachable");

    const eventB = await makeEvent({ phone: "010-2231-0045" });
    const winnerBId = await winnerIdOf(eventB.eventId, "김하늘");

    // 행사 B의 당첨자에 행사 A에서 받은 증표를 써서 제출 시도 — 증표는
    // 그 당첨자 행(winnerAId)에 묶여 있으므로 winnerBId 자리에서는 거부된다.
    const result = await submitCertificate(
      eventB.token,
      submissionInputFor(winnerBId, verifiedA.proof, verifiedA.consent),
    );
    expect(result.kind).toBe("expiredProof");
    const rows = await db.select().from(certSubmissions).where(eq(certSubmissions.winnerId, winnerBId));
    expect(rows).toHaveLength(0);
  });

  it("만료된 증표로 제출 → 거부, 제출 행 없음", async () => {
    const { eventId, token } = await makeEvent();
    const winnerId = await winnerIdOf(eventId, "김하늘");
    const past = new Date(Date.now() - 60 * 60 * 1000); // 1시간 전
    const verified = await verifyLast4(token, winnerId, "7730", randomUUID(), past);
    if (verified.kind !== "ok") throw new Error("unreachable");

    const result = await submitCertificate(token, submissionInputFor(winnerId, verified.proof, verified.consent));
    expect(result.kind).toBe("expiredProof");
    const rows = await db.select().from(certSubmissions).where(eq(certSubmissions.winnerId, winnerId));
    expect(rows).toHaveLength(0);
  });

  it("loadIntake rows[] 각 원소의 키는 허용 목록(rowId·maskedName·prizeLine?·label?)의 부분집합이다", async () => {
    const { token } = await makeEvent();
    const result = await loadIntake(token);
    expect(result.kind).toBe("open");
    if (result.kind !== "open") throw new Error("unreachable");
    const allowedKeys = new Set(["rowId", "maskedName", "prizeLine", "label"]);
    for (const row of result.rows) {
      for (const key of Object.keys(row)) {
        expect(allowedKeys.has(key)).toBe(true);
      }
    }
  });
});
