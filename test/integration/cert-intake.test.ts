import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import type { DbOrTx } from "@/db/client";
import { db } from "@/db/client";
import { certEvents, certSignatureUploads, certSubmissions } from "@/db/schema";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { loadIntake, submitCertificate, type SubmitCertificateInput } from "@/domain/certs/intake";
import { CERT_CONSENT_VERSION } from "@/domain/certs/consent";
import { getSettingValue, setSettingValue } from "@/domain/settings/registry";
import { CERT_CONTACT_PHONE, CERT_ENABLED, CERT_RETENTION_YEARS } from "@/domain/settings/keys";
import { listStaleSignatureUploadIntents } from "@/repositories/cert-submissions";
import { getSignatureStore, type SignatureStore } from "@/lib/storage/signature-store";
import {
  createCertEvent,
  seedSubmittedCert,
  signaturePngFixture,
  withCertFeatureOff,
} from "@/test/e2e/helpers/cert";

// 04.3-02 Task 2 ⓪(d) · 04.3-15 — 확인증 공개 흐름 통합 테스트(실제 Postgres). 명단 · 이름 고르기 · 전화번호
// 확인이 없어져(5909578685) 경품 id로 제출한다. 액션 파일(app/c/[token]/actions.ts)은 import하지 않는다
// (leak-scan 사실 — server-only 사슬 때문에 Vitest가 import할 수 없다). 액션 첫 줄의 가드는 E2E 직접 POST가 증명한다.

// 규약 C1 — 환경 게이트는 global-setup.ts가 CERT_FEATURE_ALLOWED=true로
// 켜지만 설정 cert.enabled는 기본 꺼짐이다(각 테스트가 직접 켠다).
beforeEach(async () => {
  await setSettingValue(SYSTEM_VIEWER, CERT_ENABLED, true);
});

const IP = "203.0.113.9";

// 경품 하나(현장) 열린 행사.
async function makeEvent(overrides: { delivery?: "onsite" | "parcel" } = {}) {
  const event = await createCertEvent({ prizes: [{ delivery: overrides.delivery ?? "onsite" }] });
  const prizeId = event.prizeIds[0];
  if (!event.token || !prizeId) throw new Error("열린 행사를 만들지 못했다");
  return { eventId: event.eventId, token: event.token, prizeId };
}

async function terms() {
  return { consentVersion: CERT_CONSENT_VERSION, retentionYears: await getSettingValue(CERT_RETENTION_YEARS) };
}

async function submissionInputFor(prizeId: string): Promise<SubmitCertificateInput> {
  const t = await terms();
  return {
    prizeId,
    name: "김하늘",
    rrnFront6: "930412",
    rrnBack7: "2123458",
    phone: "010-4821-7730",
    consent: true as const,
    signaturePngBase64: signaturePngFixture().toString("base64"),
    idempotencyKey: randomUUID(),
    consentVersion: t.consentVersion,
    retentionYears: t.retentionYears,
  };
}

async function submissionsOf(eventId: string) {
  return db.select().from(certSubmissions).where(eq(certSubmissions.eventId, eventId));
}

describe("확인증 공개 흐름 — 정상 제출", () => {
  it("정상 제출: createCertEvent → loadIntake → submitCertificate → saved, 제출 행 1", async () => {
    const { eventId, token, prizeId } = await makeEvent();
    expect((await loadIntake(token)).kind).toBe("open");
    const result = await submitCertificate(token, await submissionInputFor(prizeId), IP);
    expect(result.kind).toBe("saved");
    expect(await submissionsOf(eventId)).toHaveLength(1);
  });
});

describe("확인증 공개 흐름 — 저장소 fail-closed 순서(S3)", () => {
  it("put이 실패하고 객체 삭제가 성공하면 delete가 그 키로 불리고 의도 행이 0이다", async () => {
    const { eventId, token, prizeId } = await makeEvent();

    let deletedKey: string | undefined;
    let threw: unknown;
    try {
      await submitCertificate(token, await submissionInputFor(prizeId), IP, {
        signatureStore: {
          put: () => Promise.reject(new Error("저장소 사용 불가(주입)")),
          get: () => Promise.resolve(null),
          delete: (key) => {
            deletedKey = key;
            return Promise.resolve();
          },
        },
      });
    } catch (e) {
      threw = e;
    }

    expect(threw).toBeInstanceOf(Error);
    expect(deletedKey).toBeDefined();
    expect(deletedKey).toMatch(new RegExp(`^signatures/${eventId}/${prizeId}-`));
    const intents = await db.select().from(certSignatureUploads);
    expect(intents).toHaveLength(0);
    const submissions = await db.select().from(certSubmissions).where(eq(certSubmissions.eventId, eventId));
    expect(submissions).toHaveLength(0);
  });

  it("put이 실패하고 객체 삭제도 실패하면(고아 객체일 수 있다) 의도 행 1이 남는다", async () => {
    const { eventId, token, prizeId } = await makeEvent();

    let threw: unknown;
    try {
      await submitCertificate(token, await submissionInputFor(prizeId), IP, {
        signatureStore: {
          put: () => Promise.reject(new Error("저장소 사용 불가(주입)")),
          get: () => Promise.resolve(null),
          delete: () => Promise.reject(new Error("객체 삭제 실패(주입)")),
        },
      });
    } catch (e) {
      threw = e;
    }

    expect(threw).toBeInstanceOf(Error);
    const intents = await db.select().from(certSignatureUploads);
    expect(intents).toHaveLength(1);
    const submissions = await db.select().from(certSubmissions).where(eq(certSubmissions.eventId, eventId));
    expect(submissions).toHaveLength(0);
  });

  it("저장소 자체가 없으면(주입 없음, non-local APP_ENV) 의도 행을 커밋하기 전에 던져 0행이다", async () => {
    const { eventId, token, prizeId } = await makeEvent();

    // tx-safety.test.ts와 같은 격리 재-import 방식(codex A3) — env는 모듈
    // 최상단에서 한 번만 읽히므로(lib/env.ts), APP_ENV를 non-local로 바꾼
    // 채 모듈 그래프를 새로 불러야 getSignatureStore()가 실제로 던진다.
    vi.stubEnv("APP_ENV", "staging");
    vi.resetModules();
    const isolatedClient = await import("@/db/client");
    let threw: unknown;
    try {
      const { submitCertificate: isolatedSubmitCertificate } = await import("@/domain/certs/intake");
      await isolatedSubmitCertificate(token, await submissionInputFor(prizeId), IP);
    } catch (e) {
      threw = e;
    } finally {
      await isolatedClient.closeDb();
      vi.unstubAllEnvs();
      vi.resetModules();
    }

    expect(threw).toBeInstanceOf(Error);
    const intents = await db.select().from(certSignatureUploads);
    expect(intents).toHaveLength(0);
    const submissions = await db.select().from(certSubmissions).where(eq(certSubmissions.eventId, eventId));
    expect(submissions).toHaveLength(0);
  });
});

describe("확인증 공개 흐름 — 연락처 정규화 실패(S8)", () => {
  it("전화번호가 형식에 맞지 않으면 invalid(phone), 빈 문자열로 저장하지 않는다", async () => {
    const { eventId, token, prizeId } = await makeEvent();

    const input = { ...(await submissionInputFor(prizeId)), phone: "abc" };
    const result = await submitCertificate(token, input, IP);

    expect(result).toEqual({ kind: "invalid", fields: ["phone"] });
    const rows = await db.select().from(certSubmissions).where(eq(certSubmissions.eventId, eventId));
    expect(rows).toHaveLength(0);
  });
});

describe("확인증 공개 흐름 — 규약 C1 domain 두 겹째(설정 꺼짐)", () => {
  it("cert.enabled를 끄면 loadIntake · submitCertificate 둘 다 notFound, DB 변화 없음", async () => {
    const { eventId, token, prizeId } = await makeEvent();

    const { queryActionLog } = await import("@/repositories/action-log");
    const intentsBefore = await db.select().from(certSignatureUploads);
    const logsBefore = await queryActionLog(SYSTEM_VIEWER, { actionType: "document_submit" });

    await withCertFeatureOff(async () => {
      expect((await loadIntake(token)).kind).toBe("notFound");
      const submitResult = await submitCertificate(token, await submissionInputFor(prizeId), IP);
      expect(submitResult.kind).toBe("notFound");
    });

    expect(await submissionsOf(eventId)).toHaveLength(0);

    // T12 — 의도 행 · 행동 로그 수가 그대로다(C1-off).
    const intentsAfter = await db.select().from(certSignatureUploads);
    expect(intentsAfter).toHaveLength(intentsBefore.length);
    const logsAfter = await queryActionLog(SYSTEM_VIEWER, { actionType: "document_submit" });
    expect(logsAfter).toHaveLength(logsBefore.length);
  });
});

describe("확인증 공개 흐름 — E3-27 순서(서식 읽기 실패)", () => {
  it("서식 읽기가 실패하면 put·의도 행·제출 행이 모두 0이다(고아 없음)", async () => {
    const { eventId, token, prizeId } = await makeEvent();

    let putCalled = 0;
    let threw: unknown;
    try {
      await submitCertificate(token, await submissionInputFor(prizeId), IP, {
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
    const submissions = await db.select().from(certSubmissions).where(eq(certSubmissions.eventId, eventId));
    expect(submissions).toHaveLength(0);
  });
});

describe("확인증 공개 흐름 — 규약 C3 서명 업로드 의도 행(T1)", () => {
  it("정상 제출 — put이 불리는 순간 그 키의 의도 행이 이미 커밋돼 있고, 끝나면 의도 행 0", async () => {
    const { token, prizeId } = await makeEvent();

    const realStore = getSignatureStore();
    let sawIntentDuringPut = false;
    const spyStore: SignatureStore = {
      put: async (key, png) => {
        const [row] = await db.select().from(certSignatureUploads).where(eq(certSignatureUploads.objectKey, key));
        sawIntentDuringPut = Boolean(row);
        return realStore.put(key, png);
      },
      get: (key) => realStore.get(key),
      delete: (key) => realStore.delete(key),
    };

    const result = await submitCertificate(token, await submissionInputFor(prizeId), IP, {
      signatureStore: spyStore,
    });
    expect(result.kind).toBe("saved");
    expect(sawIntentDuringPut).toBe(true);

    const intents = await db.select().from(certSignatureUploads);
    expect(intents).toHaveLength(0);
  });

  it("put 뒤 트랜잭션이 실패하면 객체가 지워지고 의도 행 1이 남는다(예외 갈래 — 04.3-12가 치운다)", async () => {
    const { token, prizeId } = await makeEvent();

    const realStore = getSignatureStore();
    let key: string | undefined;
    const spyStore: SignatureStore = {
      put: async (k, png) => {
        key = k;
        return realStore.put(k, png);
      },
      get: (k) => realStore.get(k),
      delete: (k) => realStore.delete(k),
    };

    let threw: unknown;
    try {
      await submitCertificate(token, await submissionInputFor(prizeId), IP, {
        appendActionLog: () => {
          throw new Error("로그 실패(주입)");
        },
        signatureStore: spyStore,
      });
    } catch (e) {
      threw = e;
    }
    expect(threw).toBeInstanceOf(Error);
    if (!key) throw new Error("put이 불리지 않았다");

    expect(await realStore.get(key)).toBeNull();
    const intents = await db.select().from(certSignatureUploads);
    expect(intents).toHaveLength(1);
  });

  it("트랜잭션 실패 + 객체 지우기 실패를 함께 주입하면 의도 행 1이 남고 listStaleSignatureUploadIntents가 그 키를 돌려준다", async () => {
    const { token, prizeId } = await makeEvent();

    let key: string | undefined;
    const spyStore: SignatureStore = {
      put: async (k, png) => {
        key = k;
        return getSignatureStore().put(k, png);
      },
      get: (k) => getSignatureStore().get(k),
      delete: () => Promise.reject(new Error("객체 삭제 실패(주입)")),
    };

    let threw: unknown;
    try {
      await submitCertificate(token, await submissionInputFor(prizeId), IP, {
        appendActionLog: () => {
          throw new Error("로그 실패(주입)");
        },
        signatureStore: spyStore,
      });
    } catch (e) {
      threw = e;
    }
    expect(threw).toBeInstanceOf(Error);
    if (!key) throw new Error("put이 불리지 않았다");

    const intents = await db.select().from(certSignatureUploads).where(eq(certSignatureUploads.objectKey, key));
    expect(intents).toHaveLength(1);

    const stale = await listStaleSignatureUploadIntents(SYSTEM_VIEWER, new Date(Date.now() + 24 * 60 * 60 * 1000));
    expect(stale).toContain(key);
  });
});

describe("확인증 공개 흐름 — E3-32 표본 도우미", () => {
  it("seedSubmittedCert() — 현장 수령, rrnMasked 형식, 제출 행 1", async () => {
    const seeded = await seedSubmittedCert();
    expect(seeded.rrnMasked).toBe("930412-2******");

    const [row, ...rest] = await submissionsOf(seeded.eventId);
    expect(rest).toHaveLength(0);
    expect(row?.address).toBeNull();
    expect(row?.prizeId).toBe(seeded.prizeId);
    expect(row?.certNo).toBe(seeded.certNo);
    expect(row?.id).toBe(seeded.submissionId);
  });

  it("seedSubmittedCert({delivery: parcel}) — 주소 있음", async () => {
    const seeded = await seedSubmittedCert({ delivery: "parcel" });
    const [row] = await submissionsOf(seeded.eventId);
    expect(row?.address).not.toBeNull();
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

      const { eventId, token, prizeId } = await makeEvent();
      const input = await submissionInputFor(prizeId);

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
        Array.from({ length: concurrency }, (_, i) =>
          submitCertificate(
            token,
            { ...input, name: "동시제출", phone: `010${String(20000000 + i).padStart(8, "0")}`, idempotencyKey: randomUUID() },
            `198.51.100.${i + 1}`,
            { signatureStore: barrierStore },
          ),
        ),
      );

      expect(results.every((r) => r.kind === "saved")).toBe(true);
      const submissionRows = await db.select().from(certSubmissions).where(eq(certSubmissions.eventId, eventId));
      expect(submissionRows).toHaveLength(concurrency);
      expect(new Set(submissionRows.map((r) => r.certNo)).size).toBe(concurrency);

      // T12 — 의도 행 0(전부 정상 제출로 끝났다).
      const intents = await db.select().from(certSignatureUploads);
      expect(intents).toHaveLength(0);
    },
    20_000,
  );
});

describe("확인증 공개 흐름 — E3-02 제출 로그 같은 tx(로그 실패 롤백 · 재제출)", () => {
  it("로그 INSERT가 실패하면 제출이 롤백되고, 같은 키 · 같은 입력으로 다시 제출하면 저장된다(T4)", async () => {
    const { eventId, token, prizeId } = await makeEvent();

    const input = await submissionInputFor(prizeId);

    const { findDocumentCounter } = await import("@/repositories/document-counters");
    const { kstYear } = await import("@/lib/kst-date");
    const period = String(kstYear(new Date()));
    const counterBefore = await findDocumentCounter(SYSTEM_VIEWER, "cert", period);

    const realStore = getSignatureStore();
    let key: string | undefined;
    const spyStore: SignatureStore = {
      put: async (k, png) => {
        key = k;
        return realStore.put(k, png);
      },
      get: (k) => realStore.get(k),
      delete: (k) => realStore.delete(k),
    };

    let threw: unknown;
    try {
      await submitCertificate(token, input, IP, {
        appendActionLog: () => {
          throw new Error("행동 로그 실패(주입)");
        },
        signatureStore: spyStore,
      });
    } catch (e) {
      threw = e;
    }
    expect(threw).toBeInstanceOf(Error);

    const afterFailure = await db.select().from(certSubmissions).where(eq(certSubmissions.eventId, eventId));
    expect(afterFailure).toHaveLength(0);

    // T4 — 문서 번호 카운터가 나가지 않고, 가짜 저장소의 객체가 지워진다.
    const counterAfterFailure = await findDocumentCounter(SYSTEM_VIEWER, "cert", period);
    expect(counterAfterFailure?.value).toBe(counterBefore?.value);
    if (!key) throw new Error("put이 불리지 않았다");
    expect(await realStore.get(key)).toBeNull();

    // 같은 키 · 같은 입력으로 다시 제출 — 롤백이라 저장된 행이 없어 새로 판정해 저장한다.
    const retry = await submitCertificate(token, input, IP);
    expect(retry.kind).toBe("saved");
    const afterRetry = await db.select().from(certSubmissions).where(eq(certSubmissions.eventId, eventId));
    expect(afterRetry).toHaveLength(1);

    // T4 — 재시도 뒤 document_submit 로그가 정확히 1건이다.
    const { queryActionLog } = await import("@/repositories/action-log");
    const logs = await queryActionLog(SYSTEM_VIEWER, { actionType: "document_submit" });
    expect(logs.filter((l) => l.entityId === afterRetry[0]!.id)).toHaveLength(1);
  });

  it("설정에서 document_submit을 끄면 제출은 저장되고 로그는 0건이다", async () => {
    const { queryActionLog } = await import("@/repositories/action-log");
    const { ACTION_LOG_OPTIONAL_TYPES } = await import("@/domain/settings/keys");
    await setSettingValue(SYSTEM_VIEWER, ACTION_LOG_OPTIONAL_TYPES, []);

    const { eventId, token, prizeId } = await makeEvent();

    const result = await submitCertificate(token, await submissionInputFor(prizeId), IP);
    expect(result.kind).toBe("saved");

    const logs = await queryActionLog(SYSTEM_VIEWER, { actionType: "document_submit" });
    const [submissionRow] = await db.select().from(certSubmissions).where(eq(certSubmissions.eventId, eventId));
    const logsForThisSubmission = logs.filter((l) => l.entityId === submissionRow!.id);
    expect(logsForThisSubmission).toHaveLength(0);
  });
});

describe("확인증 공개 흐름 — 같은 키 두 번째 제출(T2)", () => {
  it("같은 멱등 키로 순서대로 다시 제출하면 첫 결과를 재생하고(04.3-06), 행 · 카운터 · 의도 행 · 로그가 늘지 않는다", async () => {
    const { eventId, token, prizeId } = await makeEvent();

    const input = await submissionInputFor(prizeId);
    const first = await submitCertificate(token, input, IP);
    expect(first.kind).toBe("saved");

    const { findDocumentCounter } = await import("@/repositories/document-counters");
    const { kstYear } = await import("@/lib/kst-date");
    const period = String(kstYear(new Date()));
    const counterBefore = await findDocumentCounter(SYSTEM_VIEWER, "cert", period);

    const second = await submitCertificate(token, input, IP);
    expect(second).toEqual(first);

    const rows = await db.select().from(certSubmissions).where(eq(certSubmissions.eventId, eventId));
    expect(rows).toHaveLength(1);

    const counterAfter = await findDocumentCounter(SYSTEM_VIEWER, "cert", period);
    expect(counterAfter?.value).toBe(counterBefore?.value);

    const intents = await db.select().from(certSignatureUploads);
    expect(intents).toHaveLength(0);

    const { queryActionLog } = await import("@/repositories/action-log");
    const logs = await queryActionLog(SYSTEM_VIEWER, { actionType: "document_submit" });
    const logsForThisSubmission = logs.filter((l) => l.entityId === rows[0]!.id);
    expect(logsForThisSubmission).toHaveLength(1);
    expect(Object.keys(logsForThisSubmission[0]!.detail as Record<string, unknown>)).toEqual(["eventId"]);
  });
});

describe("확인증 공개 흐름 — Task 3 ⑦ 주민등록번호 되묻기", () => {
  it("검증번호 mismatch 번호로 제출하면 rrnRecheck, 제출 행 0 · 같은 번호 재제출(rrnRecheckConfirmed) → submitted", async () => {
    const { eventId, token, prizeId } = await makeEvent();

    const input = { ...(await submissionInputFor(prizeId)), rrnBack7: "2123459" };

    const first = await submitCertificate(token, input, IP);
    expect(first.kind).toBe("rrnRecheck");
    const rowsAfterFirst = await db.select().from(certSubmissions).where(eq(certSubmissions.eventId, eventId));
    expect(rowsAfterFirst).toHaveLength(0);

    const second = await submitCertificate(token, { ...input, rrnRecheckConfirmed: true }, IP);
    expect(second.kind).toBe("saved");
    const rowsAfterSecond = await db.select().from(certSubmissions).where(eq(certSubmissions.eventId, eventId));
    expect(rowsAfterSecond).toHaveLength(1);
  });
});

describe("확인증 공개 흐름 — 문의 전화 사본(T9)", () => {
  it("문의 전화는 행사에 사본으로 복사되고, 그 뒤 설정을 바꿔도 loadIntake의 contactPhone은 그대로다", async () => {
    await setSettingValue(SYSTEM_VIEWER, CERT_CONTACT_PHONE, "02-123-4567");
    const { token } = await makeEvent();

    await setSettingValue(SYSTEM_VIEWER, CERT_CONTACT_PHONE, "031-123-4567");

    const intake = await loadIntake(token);
    expect(intake.kind).toBe("open");
    if (intake.kind !== "open") throw new Error("unreachable");
    expect(intake.contactPhone).toBe("021234567");
  });
});

describe("확인증 공개 흐름 — 제출 확인과 트랜잭션 사이 경합(/review TOCTOU)", () => {
  function storeThatRunsDuringPut(during: () => Promise<void>): SignatureStore {
    const realStore = getSignatureStore();
    return {
      put: async (k, png) => {
        await realStore.put(k, png);
        await during();
      },
      get: (k) => realStore.get(k),
      delete: (k) => realStore.delete(k),
    };
  }

  it("검사를 통과한 뒤 트랜잭션 전에 담당자가 링크를 닫으면 closed, 제출 행 0 · 의도 행 0", async () => {
    const { eventId, token, prizeId } = await makeEvent();

    const result = await submitCertificate(token, await submissionInputFor(prizeId), IP, {
      signatureStore: storeThatRunsDuringPut(async () => {
        await db.update(certEvents).set({ closedAt: new Date() }).where(eq(certEvents.id, eventId));
      }),
    });

    expect(result).toMatchObject({ kind: "closed", reason: "manual" });
    expect(await db.select().from(certSubmissions).where(eq(certSubmissions.eventId, eventId))).toHaveLength(0);
    expect(await db.select().from(certSignatureUploads)).toHaveLength(0);
  });
});

describe("확인증 공개 흐름 — 닫힌 행사에는 제출하지 않는다(/review 보강)", () => {
  it.each([
    ["수동으로 닫힘", { closedAt: new Date(), closedReason: "manual" as const }, "manual"],
    ["기한 지남", { expiresAt: new Date(Date.now() - 60_000) }, "expired"],
  ])("페이지를 연 뒤 %s → closed · 사유 그대로, put 0 · 제출 행 0", async (_label, patch, reason) => {
    const { eventId, token, prizeId } = await makeEvent();
    await db.update(certEvents).set(patch).where(eq(certEvents.id, eventId));

    const put = vi.fn();
    const result = await submitCertificate(token, await submissionInputFor(prizeId), IP, {
      signatureStore: { put, get: vi.fn(), delete: vi.fn() },
    });

    expect(result).toMatchObject({ kind: "closed", reason });
    expect(put).not.toHaveBeenCalled();
    expect(await db.select().from(certSubmissions).where(eq(certSubmissions.eventId, eventId))).toHaveLength(0);
  });
});
