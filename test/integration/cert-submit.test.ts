import { randomUUID } from "node:crypto";
import { existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DbOrTx } from "@/db/client";
import { db } from "@/db/client";
import { actionLog, certEvents, certSignatureUploads, certSubmissions } from "@/db/schema";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { submitCertificate, type SubmitCertificateInput } from "@/domain/certs/intake";
import { CERT_CONSENT_VERSION } from "@/domain/certs/consent";
import { getSettingValue, setSettingValue } from "@/domain/settings/registry";
import { CERT_ENABLED, CERT_RETENTION_YEARS } from "@/domain/settings/keys";
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

// 04.3-06 Task 1 · 04.3-15 — 제출 완성(서버). 같은 키 재생 · 잠근 뒤 재판정 · 동시 제출 · 업로드 의도 줄(C3) ·
// 커밋 결과 불명 · 로그 원자성 · 서명 PNG · 칸 검사. 명단 · 증표가 없어져(5909578685) 경품 id로 제출한다.
// 정상 경로는 cert-intake.test.ts가, 경품 갈래 · 속도 제한 · 누수 스윕은 cert-prize-intake.test.ts가 본다.

beforeEach(async () => {
  await setSettingValue(SYSTEM_VIEWER, CERT_ENABLED, true);
});

const IP = "203.0.113.9";

async function makeEvent(delivery: "onsite" | "parcel" = "onsite") {
  const event = await createCertEvent({ prizes: [{ delivery }] });
  const prizeId = event.prizeIds[0];
  if (!event.token || !prizeId) throw new Error("열린 행사를 만들지 못했다");
  return { eventId: event.eventId, token: event.token, prizeId };
}

const GOOD_PNG = signaturePngWithLine(60);

async function inputFor(prizeId: string, overrides: Partial<SubmitCertificateInput> = {}): Promise<SubmitCertificateInput> {
  return {
    prizeId,
    name: "김하늘",
    rrnFront6: "930412",
    rrnBack7: "2123458",
    phone: "010-4821-7730",
    consent: true,
    signaturePngBase64: GOOD_PNG.toString("base64"),
    idempotencyKey: randomUUID(),
    consentVersion: CERT_CONSENT_VERSION,
    retentionYears: await getSettingValue(CERT_RETENTION_YEARS),
    ...overrides,
  };
}

// 로컬 가짜 드라이버의 실제 파일 — 그 경품의 서명 객체 수.
function objectsFor(eventId: string, prizeId: string): string[] {
  const dir = join(tmpdir(), "plant8-cert-signatures", "signatures", eventId);
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.startsWith(`${prizeId}-`));
}

async function intentCount(): Promise<number> {
  return (await db.select().from(certSignatureUploads)).length;
}

async function submissionsFor(eventId: string) {
  return db.select().from(certSubmissions).where(eq(certSubmissions.eventId, eventId));
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
  it("정상 제출 → saved · 제출 줄 1 · 로그 1 · 의도 줄 0 · 객체 1", async () => {
    const { eventId, token, prizeId } = await makeEvent();

    const result = await submitCertificate(token, await inputFor(prizeId), IP);

    expect(result.kind).toBe("saved");
    const rows = await submissionsFor(eventId);
    expect(rows).toHaveLength(1);
    expect(await submitLogsFor(rows[0]!.id)).toHaveLength(1);
    expect(await intentCount()).toBe(0);
    expect(objectsFor(eventId, prizeId)).toHaveLength(1);
  });

  it("같은 제출 키로 다시 → 같은 결과 · 줄 수 · 로그 · 객체 · 의도 줄 그대로", async () => {
    const { eventId, token, prizeId } = await makeEvent();
    const input = await inputFor(prizeId);

    const first = await submitCertificate(token, input, IP);
    const second = await submitCertificate(token, input, IP);

    expect(first.kind).toBe("saved");
    expect(second).toEqual(first);
    const rows = await submissionsFor(eventId);
    expect(rows).toHaveLength(1);
    expect(await submitLogsFor(rows[0]!.id)).toHaveLength(1);
    expect(objectsFor(eventId, prizeId)).toHaveLength(1);
    expect(await intentCount()).toBe(0);
  });
});

describe("제출 — 동시 제출(T-04.3-07)", () => {
  it("같은 키 둘이 잠그기 전 검사를 함께 통과 → 둘 다 saved(같은 결과) · 줄 1 · 객체 1 · 의도 줄 0", async () => {
    const { eventId, token, prizeId } = await makeEvent();
    const input = await inputFor(prizeId);

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
      submitCertificate(token, input, IP, { signatureStore: store }),
      submitCertificate(token, input, IP, { signatureStore: store }),
    ]);

    expect(a.kind).toBe("saved");
    expect(b).toEqual(a);
    expect(await submissionsFor(eventId)).toHaveLength(1);
    expect(objectsFor(eventId, prizeId)).toHaveLength(1);
    expect(await intentCount()).toBe(0);
  });
});

describe("제출 — 같은 경품 다른 키 동시(N6 a — 같은 연락처 두 번째 제출을 막지 않는다)", () => {
  it("같은 경품에 다른 키 둘이 잠그기 전 검사를 함께 통과 → 둘 다 saved · 줄 2 · 확인증 번호 둘 · 객체 2 · 의도 줄 0", async () => {
    const { eventId, token, prizeId } = await makeEvent();
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

    const results = await Promise.all([
      submitCertificate(token, await inputFor(prizeId), IP, { signatureStore: store }),
      submitCertificate(token, await inputFor(prizeId), IP, { signatureStore: store }),
    ]);

    expect(results.map((r) => r.kind)).toEqual(["saved", "saved"]);
    const rows = await submissionsFor(eventId);
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((r) => r.certNo)).size).toBe(2);
    expect(objectsFor(eventId, prizeId)).toHaveLength(2);
    expect(await intentCount()).toBe(0);
  });
});

describe("제출 — 잠근 뒤 재판정(Codex #7)", () => {
  it("ⓐ put 동안 행사를 manual로 닫음 → closed · 제출 줄 0 · 객체 지워짐 · 의도 줄 0", async () => {
    const { eventId, token, prizeId } = await makeEvent();

    const result = await submitCertificate(token, await inputFor(prizeId), IP, {
      signatureStore: storeWith({
        afterPut: async () => {
          await db.update(certEvents).set({ closedAt: new Date(), closedReason: "manual" }).where(eq(certEvents.id, eventId));
        },
      }),
    });

    expect(result).toMatchObject({ kind: "closed", reason: "manual" });
    expect(await submissionsFor(eventId)).toHaveLength(0);
    expect(objectsFor(eventId, prizeId)).toHaveLength(0);
    expect(await intentCount()).toBe(0);
  });

  it("ⓓ put 동안 기한을 요청 도착 시각보다 과거로 당김 → closed(expired)", async () => {
    const { eventId, token, prizeId } = await makeEvent();
    const before = new Date();

    const result = await submitCertificate(token, await inputFor(prizeId), IP, {
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
    expect(await submissionsFor(eventId)).toHaveLength(0);
  });
});

describe("제출 — 업로드 의도 줄(C3) · 판정 갈래와 예외 갈래", () => {
  it.each([
    [false, 0],
    [true, 1],
  ])("판정 갈래(잠근 뒤 closed) — delete 실패=%s → 의도 줄 %i", async (failDelete, expectedIntents) => {
    const { eventId, token, prizeId } = await makeEvent();

    const result = await submitCertificate(token, await inputFor(prizeId), IP, {
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
      const { eventId, token, prizeId } = await makeEvent();

      await expect(
        submitCertificate(token, await inputFor(prizeId), IP, {
          signatureStore: storeWith({ failDelete }),
          withTransaction: failFirstTransaction("beforeCommit"),
        }),
      ).rejects.toThrow("커밋 전 실패(주입)");

      expect(await submissionsFor(eventId)).toHaveLength(0);
      expect(await intentCount()).toBe(1);
      expect(objectsFor(eventId, prizeId)).toHaveLength(expectedObjects);
    },
  );
});

describe("제출 — 커밋 결과 불명(codex-final3-B 1)", () => {
  it("커밋 뒤 commit 응답 유실 → saved · 제출 줄 1 · 그 줄의 객체가 남음 · 의도 줄 0 · 로그 1 → 같은 키 재전송 saved", async () => {
    const { eventId, token, prizeId } = await makeEvent();
    const input = await inputFor(prizeId);

    const result = await submitCertificate(token, input, IP, { withTransaction: failFirstTransaction("afterCommit") });

    expect(result.kind).toBe("saved");
    const rows = await submissionsFor(eventId);
    expect(rows).toHaveLength(1);
    const key = rows[0]!.signatureKey;
    if (!key) throw new Error("signature_key 없음");
    expect(await getSignatureStore().get(key)).not.toBeNull();
    expect(await intentCount()).toBe(0);
    expect(await submitLogsFor(rows[0]!.id)).toHaveLength(1);

    const again = await submitCertificate(token, input, IP);
    expect(again).toEqual(result);
    expect(await submissionsFor(eventId)).toHaveLength(1);
    expect(await getSignatureStore().get(key)).not.toBeNull();
  });

  it("커밋 뒤 예외 + 조회도 실패 → 원래 예외 · 객체 1 · 의도 줄 0 · 제출 줄 1 → 주입을 걷고 같은 키 → saved", async () => {
    const { eventId, token, prizeId } = await makeEvent();
    const input = await inputFor(prizeId);

    await expect(
      submitCertificate(token, input, IP, {
        withTransaction: failFirstTransaction("afterCommit"),
        findSubmissionBySignatureKey: () => Promise.reject(new Error("조회 실패(주입)")),
      }),
    ).rejects.toThrow("commit 응답 유실(주입)");

    expect(objectsFor(eventId, prizeId)).toHaveLength(1);
    expect(await intentCount()).toBe(0);
    expect(await submissionsFor(eventId)).toHaveLength(1);
    expect((await submitCertificate(token, input, IP)).kind).toBe("saved");
  });

  it("커밋 전 예외 + 조회도 실패 → 원래 예외 · 객체 1 · 의도 줄 1 · 제출 줄 0", async () => {
    const { eventId, token, prizeId } = await makeEvent();

    await expect(
      submitCertificate(token, await inputFor(prizeId), IP, {
        withTransaction: failFirstTransaction("beforeCommit"),
        findSubmissionBySignatureKey: () => Promise.reject(new Error("조회 실패(주입)")),
      }),
    ).rejects.toThrow("커밋 전 실패(주입)");

    expect(objectsFor(eventId, prizeId)).toHaveLength(1);
    expect(await intentCount()).toBe(1);
    expect(await submissionsFor(eventId)).toHaveLength(0);
  });
});

describe("제출 — 로그 원자성(최종 리뷰 B5)", () => {
  it("로그 INSERT 실패 → 예외 · 제출 줄 0 · 로그 0 · 객체 0 · 의도 줄 1 → 같은 키 재전송 saved · 로그 1", async () => {
    const { eventId, token, prizeId } = await makeEvent();
    const input = await inputFor(prizeId);

    await expect(
      submitCertificate(token, input, IP, {
        appendActionLog: () => Promise.reject(new Error("로그 실패(주입)")),
      }),
    ).rejects.toThrow("로그 실패(주입)");

    expect(await submissionsFor(eventId)).toHaveLength(0);
    expect(objectsFor(eventId, prizeId)).toHaveLength(0);
    expect(await intentCount()).toBe(1);

    const retry = await submitCertificate(token, input, IP);
    expect(retry.kind).toBe("saved");
    const rows = await submissionsFor(eventId);
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
    const { token, prizeId } = await makeEvent();
    const put = vi.fn();

    const result = await submitCertificate(
      token,
      await inputFor(prizeId, { signaturePngBase64: png.toString("base64") }),
      IP,
      { signatureStore: { put, get: vi.fn(), delete: vi.fn() } },
    );

    expect(result).toEqual({ kind: "invalid", fields: ["signature"] });
    expect(put).not.toHaveBeenCalled();
    expect(await intentCount()).toBe(0);
  });

  it("택배 경품에 주소 없음 → invalid(address) · 현장 경품에 주소가 와도 저장값은 null", async () => {
    const parcel = await makeEvent("parcel");
    expect(await submitCertificate(parcel.token, await inputFor(parcel.prizeId, { address: "  " }), IP)).toEqual({
      kind: "invalid",
      fields: ["address"],
    });

    const onsite = await makeEvent();
    const saved = await submitCertificate(onsite.token, await inputFor(onsite.prizeId, { address: "서울시 어딘가" }), IP);
    expect(saved.kind).toBe("saved");
    const [row] = await submissionsFor(onsite.eventId);
    expect(row?.address).toBeNull();
  });

  it("칸 오류를 받은 키로 고친 값을 다시 보내면 새로 판정해 저장한다", async () => {
    const { token, prizeId } = await makeEvent();
    const input = await inputFor(prizeId);

    expect(await submitCertificate(token, { ...input, phone: "12" }, IP)).toEqual({ kind: "invalid", fields: ["phone"] });
    expect((await submitCertificate(token, input, IP)).kind).toBe("saved");
  });

  it("(C1) 기능이 꺼지면 저장 · 업로드 · 의도 줄 없이 notFound", async () => {
    const { eventId, token, prizeId } = await makeEvent();
    const put = vi.fn();
    const input = await inputFor(prizeId);

    const result = await withCertFeatureOff(() =>
      submitCertificate(token, input, IP, { signatureStore: { put, get: vi.fn(), delete: vi.fn() } }),
    );

    expect(result).toEqual({ kind: "notFound" });
    expect(put).not.toHaveBeenCalled();
    expect(await intentCount()).toBe(0);
    expect(await submissionsFor(eventId)).toHaveLength(0);
  });
});
