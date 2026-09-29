import { randomUUID } from "node:crypto";
import { existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DbOrTx } from "@/db/client";
import { db } from "@/db/client";
import { actionLog, certEvents, certSignatureUploads, certSubmissions, certWinners } from "@/db/schema";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { loadIntake, submitCertificate, verifyLast4, type SubmitCertificateInput } from "@/domain/certs/intake";
import { setSettingValue } from "@/domain/settings/registry";
import { CERT_ENABLED } from "@/domain/settings/keys";
import { listWinnersForIntake } from "@/repositories/cert-winners";
import { withTransaction } from "@/lib/db-transaction";
import { getSignatureStore, type SignatureStore } from "@/lib/storage/signature-store";
import { createCertEvent, withCertFeatureOff } from "@/test/e2e/helpers/cert";
import {
  chunkOffsets,
  encodePng,
  padPngTo,
  rgbaWithInk,
  signaturePngWithLine,
} from "@/test/fixtures/signature-png";

// 04.3-06 Task 1 — 제출 완성(서버). 같은 키 재생만 증표 전에 · 잠근 뒤 재판정 ·
// 동시 제출 · 마지막 자리 자동 닫힘 · 업로드 의도 줄(C3) · 커밋 결과 불명 ·
// 로그 원자성 · 서명 PNG · 칸 검사. 정상 경로는 cert-intake.test.ts가 이미 본다.

beforeEach(async () => {
  await setSettingValue(SYSTEM_VIEWER, CERT_ENABLED, true);
});

type Verified = Extract<Awaited<ReturnType<typeof verifyLast4>>, { kind: "ok" }>;

const WINNERS = [
  { name: "김하늘", phone: "010-4821-7730" },
  { name: "이바다", phone: "010-1111-2222" },
  { name: "박산", phone: "010-3333-4444" },
];

async function makeEvent(count: number, delivery: "onsite" | "parcel" = "onsite") {
  const winners = WINNERS.slice(0, count).map((w) => ({ ...w, delivery }));
  const event = await createCertEvent({ winners });
  const rows = await listWinnersForIntake(SYSTEM_VIEWER, event.eventId);
  const ids = winners.map((w) => {
    const row = rows.find((r) => r.name === w.name);
    if (!row) throw new Error(`당첨자 없음: ${w.name}`);
    return row.id;
  });
  return { ...event, ids };
}

async function verify(token: string, winnerId: string, index = 0): Promise<Verified> {
  const phone = WINNERS[index]!.phone;
  const verified = await verifyLast4(token, winnerId, phone.slice(-4), randomUUID(), null);
  if (verified.kind !== "ok") throw new Error(`verifyLast4 실패: ${verified.kind}`);
  return verified;
}

const GOOD_PNG = signaturePngWithLine(60);

function inputFor(winnerId: string, v: Verified, overrides: Partial<SubmitCertificateInput> = {}): SubmitCertificateInput {
  return {
    rowId: winnerId,
    proof: v.proof,
    name: "김하늘",
    rrnFront6: "930412",
    rrnBack7: "2123458",
    phone: "010-4821-7730",
    consent: true,
    signaturePngBase64: GOOD_PNG.toString("base64"),
    idempotencyKey: randomUUID(),
    winnerVersion: v.version,
    consentVersion: v.consent.version,
    retentionYears: v.consent.retentionYears,
    ...overrides,
  };
}

// 로컬 가짜 드라이버의 실제 파일 — 그 자리의 서명 객체 수.
function objectsFor(eventId: string, winnerId: string): string[] {
  const dir = join(tmpdir(), "plant8-cert-signatures", "signatures", eventId);
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.startsWith(`${winnerId}-`));
}

async function intentCount(): Promise<number> {
  return (await db.select().from(certSignatureUploads)).length;
}

async function submissionsFor(winnerId: string) {
  return db.select().from(certSubmissions).where(eq(certSubmissions.winnerId, winnerId));
}

async function submitLogsFor(entityId: string) {
  const rows = await db.select().from(actionLog).where(eq(actionLog.entityId, entityId));
  return rows.filter((r) => r.actionType === "document_submit");
}

// 실제 저장소 위에 put 뒤 끼어들기 · delete 실패를 얹는다.
function storeWith(opts: { afterPut?: () => Promise<void>; failDelete?: boolean; onPut?: (key: string) => void }): SignatureStore {
  const real = getSignatureStore();
  return {
    put: async (key, png) => {
      opts.onPut?.(key);
      await real.put(key, png);
      await opts.afterPut?.();
    },
    get: (key) => real.get(key),
    delete: (key) => (opts.failDelete ? Promise.reject(new Error("객체 삭제 실패(주입)")) : real.delete(key)),
  };
}

// 첫 트랜잭션만 망가뜨린다 — beforeCommit: 콜백을 다 돌린 뒤 커밋 전에 던져 롤백,
// afterCommit: 커밋까지 끝낸 뒤 commit 응답 유실처럼 던진다. 두 번째부터는 실제 함수.
function failFirstTransaction(mode: "beforeCommit" | "afterCommit") {
  let calls = 0;
  return async <T,>(fn: (tx: DbOrTx) => Promise<T>): Promise<T> => {
    calls++;
    if (calls > 1) return withTransaction(fn);
    if (mode === "beforeCommit") {
      return withTransaction(async (tx) => {
        await fn(tx);
        throw new Error("커밋 전 실패(주입)");
      });
    }
    await withTransaction(fn);
    throw new Error("commit 응답 유실(주입)");
  };
}

describe("제출 — 정상 저장과 같은 키 재생", () => {
  it("증표를 가진 자리의 정상 제출 → saved · 제출 줄 1 · submitted_at · 로그 1 · 의도 줄 0 · 객체 1", async () => {
    const { eventId, token, ids } = await makeEvent(2);
    const v = await verify(token, ids[0]!);

    const result = await submitCertificate(token, inputFor(ids[0]!, v));

    expect(result.kind).toBe("saved");
    const rows = await submissionsFor(ids[0]!);
    expect(rows).toHaveLength(1);
    const [winner] = await db.select().from(certWinners).where(eq(certWinners.id, ids[0]!));
    expect(winner?.submittedAt).not.toBeNull();
    expect(await submitLogsFor(rows[0]!.id)).toHaveLength(1);
    expect(await intentCount()).toBe(0);
    expect(objectsFor(eventId, ids[0]!)).toHaveLength(1);
  });

  it("같은 제출 키로 다시 → 같은 결과 · 줄 수 · 로그 · 객체 · 의도 줄 그대로", async () => {
    const { eventId, token, ids } = await makeEvent(2);
    const v = await verify(token, ids[0]!);
    const input = inputFor(ids[0]!, v);

    const first = await submitCertificate(token, input);
    const second = await submitCertificate(token, input);

    expect(first.kind).toBe("saved");
    expect(second).toEqual(first);
    const rows = await submissionsFor(ids[0]!);
    expect(rows).toHaveLength(1);
    expect(await submitLogsFor(rows[0]!.id)).toHaveLength(1);
    expect(objectsFor(eventId, ids[0]!)).toHaveLength(1);
    expect(await intentCount()).toBe(0);
  });
});

describe("제출 — 증표 전 제출 여부 비노출(Codex #6)", () => {
  it("제출된 자리 · 제출되지 않은 자리에 임의 키 + 임의 증표 → 둘 다 같은 expiredProof · 옛 증표 + 다른 키도 expiredProof", async () => {
    const { token, ids } = await makeEvent(2);
    const oldProof = await verify(token, ids[0]!);
    expect((await submitCertificate(token, inputFor(ids[0]!, oldProof))).kind).toBe("saved");
    const vB = await verify(token, ids[1]!, 1);

    const put = vi.fn();
    const spy: SignatureStore = { put, get: vi.fn(), delete: vi.fn() };
    const intentsBefore = await intentCount();

    const onSubmitted = await submitCertificate(token, inputFor(ids[0]!, oldProof, { proof: "random-proof" }), {
      signatureStore: spy,
    });
    const onOpen = await submitCertificate(token, inputFor(ids[1]!, vB, { proof: "random-proof" }), {
      signatureStore: spy,
    });
    const withOldProof = await submitCertificate(token, inputFor(ids[0]!, oldProof), { signatureStore: spy });

    expect(onSubmitted).toEqual({ kind: "expiredProof" });
    expect(onOpen).toEqual({ kind: "expiredProof" });
    expect(Object.keys(onSubmitted).sort()).toEqual(Object.keys(onOpen).sort());
    expect(withOldProof).toEqual({ kind: "expiredProof" });
    expect(put).not.toHaveBeenCalled();
    expect(await intentCount()).toBe(intentsBefore);
  });
});

describe("제출 — 동시 제출(T-04.3-07)", () => {
  it("같은 자리에 서로 다른 키 둘을 같은 증표로 동시에 → saved 하나 + alreadySubmitted 하나 · 줄 1 · 객체 1 · 의도 줄 0", async () => {
    const { eventId, token, ids } = await makeEvent(2);
    const v = await verify(token, ids[0]!);

    const results = await Promise.all([
      submitCertificate(token, inputFor(ids[0]!, v)),
      submitCertificate(token, inputFor(ids[0]!, v)),
    ]);

    expect(results.map((r) => r.kind).sort()).toEqual(["alreadySubmitted", "saved"]);
    expect(await submissionsFor(ids[0]!)).toHaveLength(1);
    expect(objectsFor(eventId, ids[0]!)).toHaveLength(1);
    expect(await intentCount()).toBe(0);
  });

  it("미제출 둘 남은 행사에서 둘을 동시에 제출 → 둘 다 saved · 행사가 all_submitted로 한 번 닫힘 · loadIntake 닫힘", async () => {
    const { eventId, token, ids } = await makeEvent(2);
    const vA = await verify(token, ids[0]!);
    const vB = await verify(token, ids[1]!, 1);

    const results = await Promise.all([
      submitCertificate(token, inputFor(ids[0]!, vA)),
      submitCertificate(token, inputFor(ids[1]!, vB, { phone: "010-1111-2222" })),
    ]);

    expect(results.map((r) => r.kind)).toEqual(["saved", "saved"]);
    const [event] = await db.select().from(certEvents).where(eq(certEvents.id, eventId));
    expect(event?.closedAt).not.toBeNull();
    expect(event?.closedReason).toBe("all_submitted");
    const intake = await loadIntake(token);
    expect(intake.kind).toBe("closed");
    if (intake.kind === "closed") expect(intake.reason).toBe("all_submitted");
  });

  it("마지막 자리 제출 결과를 잃고 같은 키로 다시 → 링크가 닫혔어도 saved(E6-b 아님)", async () => {
    const { token, ids } = await makeEvent(1);
    const v = await verify(token, ids[0]!);
    const input = inputFor(ids[0]!, v);

    const first = await submitCertificate(token, input);
    expect((await loadIntake(token)).kind).toBe("closed");
    const again = await submitCertificate(token, input);

    expect(first.kind).toBe("saved");
    expect(again).toEqual(first);
  });

  it("마지막 자리에 같은 키 · 같은 증표 둘이 잠그기 전 검사를 함께 통과 → 둘 다 saved(같은 결과) · 줄 1 · 한 번 닫힘 · 객체 1 · 의도 줄 0", async () => {
    const { eventId, token, ids } = await makeEvent(1);
    const v = await verify(token, ids[0]!);
    const input = inputFor(ids[0]!, v);

    let arrived = 0;
    let release: () => void = () => {};
    const barrier = new Promise<void>((resolve) => {
      release = resolve;
    });
    const store = storeWith({
      afterPut: async () => {
        arrived++;
        if (arrived === 2) release();
        await barrier;
      },
    });

    const [a, b] = await Promise.all([
      submitCertificate(token, input, { signatureStore: store }),
      submitCertificate(token, input, { signatureStore: store }),
    ]);

    expect(a.kind).toBe("saved");
    expect(b).toEqual(a);
    expect(await submissionsFor(ids[0]!)).toHaveLength(1);
    const [event] = await db.select().from(certEvents).where(eq(certEvents.id, eventId));
    expect(event?.closedReason).toBe("all_submitted");
    expect(objectsFor(eventId, ids[0]!)).toHaveLength(1);
    expect(await intentCount()).toBe(0);
  });
});

describe("제출 — 잠근 뒤 재판정(Codex #7)", () => {
  it("ⓐ put 동안 행사를 manual로 닫음 → closed · 제출 줄 0 · 객체 지워짐 · 의도 줄 0", async () => {
    const { eventId, token, ids } = await makeEvent(2);
    const v = await verify(token, ids[0]!);

    const result = await submitCertificate(token, inputFor(ids[0]!, v), {
      signatureStore: storeWith({
        afterPut: async () => {
          await db.update(certEvents).set({ closedAt: new Date(), closedReason: "manual" }).where(eq(certEvents.id, eventId));
        },
      }),
    });

    expect(result).toMatchObject({ kind: "closed", reason: "manual" });
    expect(await submissionsFor(ids[0]!)).toHaveLength(0);
    expect(objectsFor(eventId, ids[0]!)).toHaveLength(0);
    expect(await intentCount()).toBe(0);
  });

  it("ⓑ put 동안 담당자 편집으로 version이 오름(onsite → parcel) → expiredProof · 저장 없음", async () => {
    const { token, ids } = await makeEvent(2);
    const v = await verify(token, ids[0]!);

    const result = await submitCertificate(token, inputFor(ids[0]!, v), {
      signatureStore: storeWith({
        afterPut: async () => {
          await db
            .update(certWinners)
            .set({ delivery: "parcel", version: v.version + 1 })
            .where(eq(certWinners.id, ids[0]!));
        },
      }),
    });

    expect(result).toEqual({ kind: "expiredProof" });
    expect(await submissionsFor(ids[0]!)).toHaveLength(0);
  });

  it("ⓒ put 동안 그 자리의 증표 해시를 비움 → expiredProof", async () => {
    const { token, ids } = await makeEvent(2);
    const v = await verify(token, ids[0]!);

    const result = await submitCertificate(token, inputFor(ids[0]!, v), {
      signatureStore: storeWith({
        afterPut: async () => {
          await db.update(certWinners).set({ verifyProofHash: null }).where(eq(certWinners.id, ids[0]!));
        },
      }),
    });

    expect(result).toEqual({ kind: "expiredProof" });
    expect(await submissionsFor(ids[0]!)).toHaveLength(0);
  });

  it("ⓓ put 동안 기한을 요청 도착 시각보다 과거로 당김 → closed(expired)", async () => {
    const { eventId, token, ids } = await makeEvent(2);
    const v = await verify(token, ids[0]!);
    const before = new Date();

    const result = await submitCertificate(token, inputFor(ids[0]!, v), {
      signatureStore: storeWith({
        afterPut: async () => {
          await db
            .update(certEvents)
            .set({ expiresAt: new Date(before.getTime() - 60_000) })
            .where(eq(certEvents.id, eventId));
        },
      }),
    });

    expect(result).toMatchObject({ kind: "closed", reason: "expired" });
    expect(await submissionsFor(ids[0]!)).toHaveLength(0);
  });

  it("확인 응답의 version과 다른 winnerVersion → expiredProof · 동의 묶음이 다르면 expiredProof", async () => {
    const { token, ids } = await makeEvent(2);
    const v = await verify(token, ids[0]!);

    expect(await submitCertificate(token, inputFor(ids[0]!, v, { winnerVersion: v.version + 1 }))).toEqual({
      kind: "expiredProof",
    });
    expect(await submitCertificate(token, inputFor(ids[0]!, v, { consentVersion: "v0" }))).toEqual({
      kind: "expiredProof",
    });
    expect(await submissionsFor(ids[0]!)).toHaveLength(0);
  });
});

describe("제출 — 증표 만료 판정 시각은 요청 도착 시각 하나(X-10 교차 M-2)", () => {
  it("deps.now가 첫 호출 29:59 · 그 뒤 30:01을 돌려줘도 saved(잠근 뒤 다시 읽지 않는다)", async () => {
    const { token, ids } = await makeEvent(2);
    const v = await verify(token, ids[0]!);
    const issuedAt = new Date(v.verifiedUntil).getTime() - 30 * 60_000;
    let calls = 0;
    const now = () => {
      calls++;
      return new Date(issuedAt + (calls === 1 ? 30 * 60_000 - 1_000 : 30 * 60_000 + 1_000));
    };

    const result = await submitCertificate(token, inputFor(ids[0]!, v), { now });

    expect(result.kind).toBe("saved");
  });

  it("발급 후 정확히 30분에 도착한 요청 → expiredProof(연장 없음)", async () => {
    const { token, ids } = await makeEvent(2);
    const v = await verify(token, ids[0]!);

    const result = await submitCertificate(token, inputFor(ids[0]!, v), { now: () => new Date(v.verifiedUntil) });

    expect(result).toEqual({ kind: "expiredProof" });
  });

  it("verified_until이 지난 증표 → expiredProof · 저장 없음", async () => {
    const { token, ids } = await makeEvent(2);
    const v = await verify(token, ids[0]!);
    await db.update(certWinners).set({ verifiedUntil: new Date(Date.now() - 1_000) }).where(eq(certWinners.id, ids[0]!));

    expect(await submitCertificate(token, inputFor(ids[0]!, v))).toEqual({ kind: "expiredProof" });
    expect(await submissionsFor(ids[0]!)).toHaveLength(0);
  });
});

describe("제출 — 업로드 의도 줄(C3) · 판정 갈래와 예외 갈래", () => {
  it.each([
    [false, 0],
    [true, 1],
  ])("판정 갈래(잠근 뒤 closed) — delete 실패=%s → 의도 줄 %i", async (failDelete, expectedIntents) => {
    const { eventId, token, ids } = await makeEvent(2);
    const v = await verify(token, ids[0]!);

    const result = await submitCertificate(token, inputFor(ids[0]!, v), {
      signatureStore: storeWith({
        failDelete,
        afterPut: async () => {
          await db.update(certEvents).set({ closedAt: new Date(), closedReason: "manual" }).where(eq(certEvents.id, eventId));
        },
      }),
    });

    expect(result.kind).toBe("closed");
    expect(await intentCount()).toBe(expectedIntents);
  });

  it.each([
    [false, 0],
    [true, 1],
  ])(
    "예외 갈래(tx 안 의도 줄 삭제 뒤 커밋 전 실패) — delete 실패=%s → 제출 줄 0 · 의도 줄 1(롤백으로 되살아남) · 객체 %i",
    async (failDelete, expectedObjects) => {
      const { eventId, token, ids } = await makeEvent(2);
      const v = await verify(token, ids[0]!);

      await expect(
        submitCertificate(token, inputFor(ids[0]!, v), {
          signatureStore: storeWith({ failDelete }),
          withTransaction: failFirstTransaction("beforeCommit"),
        }),
      ).rejects.toThrow("커밋 전 실패(주입)");

      expect(await submissionsFor(ids[0]!)).toHaveLength(0);
      expect(await intentCount()).toBe(1);
      expect(objectsFor(eventId, ids[0]!)).toHaveLength(expectedObjects);
    },
  );
});

describe("제출 — 커밋 결과 불명(codex-final3-B 1)", () => {
  it("커밋 뒤 commit 응답 유실 → saved · 제출 줄 1 · 그 줄의 객체가 남음 · 의도 줄 0 · 로그 1 → 같은 키 재전송 saved", async () => {
    const { token, ids } = await makeEvent(2);
    const v = await verify(token, ids[0]!);
    const input = inputFor(ids[0]!, v);

    const result = await submitCertificate(token, input, { withTransaction: failFirstTransaction("afterCommit") });

    expect(result.kind).toBe("saved");
    const rows = await submissionsFor(ids[0]!);
    expect(rows).toHaveLength(1);
    const key = rows[0]!.signatureKey;
    if (!key) throw new Error("signature_key 없음");
    expect(await getSignatureStore().get(key)).not.toBeNull();
    expect(await intentCount()).toBe(0);
    expect(await submitLogsFor(rows[0]!.id)).toHaveLength(1);

    const again = await submitCertificate(token, input);
    expect(again).toEqual(result);
    expect(await submissionsFor(ids[0]!)).toHaveLength(1);
    expect(await getSignatureStore().get(key)).not.toBeNull();
  });

  it("커밋 뒤 예외 + 조회도 실패 → 원래 예외 · 객체 1 · 의도 줄 0 · 제출 줄 1 → 주입을 걷고 같은 키 → saved", async () => {
    const { eventId, token, ids } = await makeEvent(2);
    const v = await verify(token, ids[0]!);
    const input = inputFor(ids[0]!, v);

    await expect(
      submitCertificate(token, input, {
        withTransaction: failFirstTransaction("afterCommit"),
        findSubmissionBySignatureKey: () => Promise.reject(new Error("조회 실패(주입)")),
      }),
    ).rejects.toThrow("commit 응답 유실(주입)");

    expect(objectsFor(eventId, ids[0]!)).toHaveLength(1);
    expect(await intentCount()).toBe(0);
    expect(await submissionsFor(ids[0]!)).toHaveLength(1);
    expect((await submitCertificate(token, input)).kind).toBe("saved");
  });

  it("커밋 전 예외 + 조회도 실패 → 원래 예외 · 객체 1 · 의도 줄 1 · 제출 줄 0", async () => {
    const { eventId, token, ids } = await makeEvent(2);
    const v = await verify(token, ids[0]!);

    await expect(
      submitCertificate(token, inputFor(ids[0]!, v), {
        withTransaction: failFirstTransaction("beforeCommit"),
        findSubmissionBySignatureKey: () => Promise.reject(new Error("조회 실패(주입)")),
      }),
    ).rejects.toThrow("커밋 전 실패(주입)");

    expect(objectsFor(eventId, ids[0]!)).toHaveLength(1);
    expect(await intentCount()).toBe(1);
    expect(await submissionsFor(ids[0]!)).toHaveLength(0);
  });
});

describe("제출 — 로그 원자성(최종 리뷰 B5)", () => {
  it("로그 INSERT 실패 → 예외 · 제출 줄 0 · submitted_at null · 자동 닫힘 없음 · 로그 0 · 객체 0 · 의도 줄 1 · 증표 그대로 → 같은 키 재전송 saved · 로그 1", async () => {
    const { eventId, token, ids } = await makeEvent(1);
    const v = await verify(token, ids[0]!);
    const input = inputFor(ids[0]!, v);
    const [before] = await db.select().from(certWinners).where(eq(certWinners.id, ids[0]!));

    await expect(
      submitCertificate(token, input, {
        appendActionLog: () => Promise.reject(new Error("로그 실패(주입)")),
      }),
    ).rejects.toThrow("로그 실패(주입)");

    expect(await submissionsFor(ids[0]!)).toHaveLength(0);
    const [after] = await db.select().from(certWinners).where(eq(certWinners.id, ids[0]!));
    expect(after?.submittedAt).toBeNull();
    expect(after?.verifyProofHash).toBe(before?.verifyProofHash);
    const [event] = await db.select().from(certEvents).where(eq(certEvents.id, eventId));
    expect(event?.closedAt).toBeNull();
    expect(objectsFor(eventId, ids[0]!)).toHaveLength(0);
    expect(await intentCount()).toBe(1);

    const retry = await submitCertificate(token, input);
    expect(retry.kind).toBe("saved");
    const rows = await submissionsFor(ids[0]!);
    expect(rows).toHaveLength(1);
    expect(await submitLogsFor(rows[0]!.id)).toHaveLength(1);
    expect(await intentCount()).toBe(1);
  });
});

describe("제출 — 서명 PNG · 칸 검사(저장 전 거부)", () => {
  const ink = rgbaWithInk([{ x: 100, y: 300, w: 60, h: 6 }]);
  const crcBroken = (() => {
    const png = Buffer.from(GOOD_PNG);
    const idat = chunkOffsets(png).find((c) => c.type === "IDAT")!;
    png[idat.end - 1] = (png[idat.end - 1] ?? 0) ^ 0xff;
    return png;
  })();

  it.each([
    ["빈 서명(투명)", encodePng(rgbaWithInk([]))],
    ["1040×400이 아님", encodePng(rgbaWithInk([{ x: 1, y: 1, w: 60, h: 6 }], 1040, 399), { height: 399 })],
    ["184,320바이트 초과", padPngTo(GOOD_PNG, 184_321)],
    ["PNG가 아닌 본문", Buffer.from("hello")],
    ["잉크 충분 + CRC 틀림", crcBroken],
    ["잉크 충분 + IEND 없음", GOOD_PNG.subarray(0, GOOD_PNG.length - 12)],
    ["8비트 RGB", encodePng(ink, { colorType: 2 })],
  ])("%s → invalid(signature) · put 0 · 의도 줄 0", async (_label, png) => {
    const { token, ids } = await makeEvent(2);
    const v = await verify(token, ids[0]!);
    const put = vi.fn();

    const result = await submitCertificate(token, inputFor(ids[0]!, v, { signaturePngBase64: png.toString("base64") }), {
      signatureStore: { put, get: vi.fn(), delete: vi.fn() },
    });

    expect(result).toEqual({ kind: "invalid", fields: ["signature"] });
    expect(put).not.toHaveBeenCalled();
    expect(await intentCount()).toBe(0);
  });

  it("택배 자리에 주소 없음 → invalid(address) · 현장 자리에 주소가 와도 저장값은 null", async () => {
    const parcel = await makeEvent(1, "parcel");
    const vP = await verify(parcel.token, parcel.ids[0]!);
    expect(await submitCertificate(parcel.token, inputFor(parcel.ids[0]!, vP, { address: "  " }))).toEqual({
      kind: "invalid",
      fields: ["address"],
    });

    const onsite = await makeEvent(2);
    const vO = await verify(onsite.token, onsite.ids[0]!);
    const saved = await submitCertificate(onsite.token, inputFor(onsite.ids[0]!, vO, { address: "서울시 어딘가" }));
    expect(saved.kind).toBe("saved");
    const [row] = await submissionsFor(onsite.ids[0]!);
    expect(row?.address).toBeNull();
  });

  it("칸 오류를 받은 키로 고친 값을 다시 보내면 새로 판정해 저장한다", async () => {
    const { token, ids } = await makeEvent(2);
    const v = await verify(token, ids[0]!);
    const input = inputFor(ids[0]!, v);

    expect(await submitCertificate(token, { ...input, phone: "12" })).toEqual({ kind: "invalid", fields: ["phone"] });
    expect((await submitCertificate(token, input)).kind).toBe("saved");
  });

  it("(C1) 기능이 꺼지면 저장 · 업로드 · 의도 줄 없이 notFound", async () => {
    const { token, ids } = await makeEvent(2);
    const v = await verify(token, ids[0]!);
    const put = vi.fn();

    const result = await withCertFeatureOff(() =>
      submitCertificate(token, inputFor(ids[0]!, v), { signatureStore: { put, get: vi.fn(), delete: vi.fn() } }),
    );

    expect(result).toEqual({ kind: "notFound" });
    expect(put).not.toHaveBeenCalled();
    expect(await intentCount()).toBe(0);
    expect(await submissionsFor(ids[0]!)).toHaveLength(0);
  });
});
