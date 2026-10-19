import { randomBytes } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { files, uploadIntents } from "@/db/schema";
import { createExpenseFromLines } from "@/domain/expenses";
import { EVIDENCE_MIN_SIZE_KB } from "@/domain/settings/keys";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { upsertSimpleValue } from "@/repositories/settings";
import { completeEvidenceUpload, EvidenceUploadRefusedError, requestEvidenceUpload } from "@/domain/evidence";
import { EVIDENCE_UPLOAD_FAILED } from "@/domain/evidence/upload-checks";
import { log } from "@/lib/log";
import { createMemoryStorage, type MemoryStorage } from "./fakes/memory-storage";
import { setupExpenseProject, type ExpenseFixture } from "./fixtures/expenses";

// 06.1-14(E14 · RP-14 · T-061-141): 05 사진 · PDF 올리기의 수용 마감 — 완료 통보가 저장소 머리 16바이트로 선언 형식의 서명을
// 대조한다(어긋나면 지우고 다시 올리기). 260907 server/src/storage.ts sniffDocumentType 꼴.

const NOW = new Date("2026-10-04T01:00:00.000Z");
const PNG_HEAD = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d, 0x49, 0x48, 0x44, 0x52]);
const PDF_HEAD = Uint8Array.from(Buffer.from("%PDF-1.4\n%\xe2\xe3\xcf\xd3\n", "latin1").subarray(0, 16));

async function draftOf(fx: ExpenseFixture): Promise<string> {
  const created = await createExpenseFromLines(fx.pm, { lineIds: [fx.lines.withVendor] });
  const expenseId = created.created[0]?.expenseId;
  if (!expenseId) throw new Error("작성 중 문서 없음");
  return expenseId;
}

async function uploaded(fx: ExpenseFixture, expenseId: string, storage: MemoryStorage, head?: Uint8Array) {
  const sha256 = randomBytes(32).toString("hex");
  const declared = { size: 212_000, contentType: "image/png", sha256 };
  const intent = await requestEvidenceUpload(fx.pm, { ownerKind: "expense", ownerId: expenseId, ...declared, name: "영수증.png" }, { storage, now: NOW });
  storage.put(intent.url, head ? { ...declared, head } : declared);
  return intent;
}

function fileRowsOf(expenseId: string) {
  return db.select().from(files).where(and(eq(files.ownerKind, "expense"), eq(files.ownerId, expenseId)));
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("E14 서명 대조 — 완료 통보", () => {
  it("PNG로 선언하고 PDF 바이트를 올리면 다시 올리기 거부 · 객체 지움 · evidence/ 0 · 파일 행 0 · 의도 미완료", async () => {
    const fx = await setupExpenseProject();
    const expenseId = await draftOf(fx);
    const storage = createMemoryStorage();
    const intent = await uploaded(fx, expenseId, storage, PDF_HEAD);
    const warn = vi.spyOn(log, "warn");

    const error = await completeEvidenceUpload(fx.pm, { intentId: intent.intentId }, { storage, now: NOW }).then(
      () => null,
      (reason: unknown) => reason,
    );

    expect(error).toBeInstanceOf(EvidenceUploadRefusedError);
    expect((error as EvidenceUploadRefusedError).retry).toBe("restart");
    expect((error as Error).message).toBe(EVIDENCE_UPLOAD_FAILED);
    expect(storage.objects.has(`incoming/${intent.intentId}`)).toBe(false);
    expect([...storage.objects.keys()].filter((key) => key.startsWith("evidence/"))).toHaveLength(0);
    expect(storage.moves).toHaveLength(0);
    expect(await fileRowsOf(expenseId)).toHaveLength(0);
    const [intentRow] = await db.select().from(uploadIntents).where(eq(uploadIntents.id, intent.intentId));
    expect(intentRow?.completedAt).toBeNull();

    // 운영 로그 — 의도 id · 주인 종류 · 주인 id · 사유 낱말만(파일 이름 · 크기 · 사람 이름 없음, T-061-143).
    const calls = warn.mock.calls.filter(([event]) => event === "evidence.upload_signature_mismatch");
    expect(calls).toEqual([["evidence.upload_signature_mismatch", { intentId: intent.intentId, ownerKind: "expense", ownerId: expenseId, reason: "signature" }]]);
    const logged = JSON.stringify(calls);
    expect(logged).not.toContain("영수증");
    expect(logged).not.toContain("212000");
    expect(Object.keys(calls[0]?.[1] ?? {}).sort()).toEqual(["intentId", "ownerId", "ownerKind", "reason"]);
  });

  it("진짜 PNG 머리면 그대로 붙는다 — 파일 1", async () => {
    const fx = await setupExpenseProject();
    const expenseId = await draftOf(fx);
    const storage = createMemoryStorage();
    const intent = await uploaded(fx, expenseId, storage, PNG_HEAD);

    const file = await completeEvidenceUpload(fx.pm, { intentId: intent.intentId }, { storage, now: NOW });

    expect(await fileRowsOf(expenseId)).toHaveLength(1);
    expect(storage.objects.has(`evidence/${file.id}`)).toBe(true);
  });

  it("머리를 주지 않은 객체(기존 테스트 꼴)는 선언 형식의 서명으로 통과한다", async () => {
    const fx = await setupExpenseProject();
    const expenseId = await draftOf(fx);
    const storage = createMemoryStorage();
    const intent = await uploaded(fx, expenseId, storage);

    await completeEvidenceUpload(fx.pm, { intentId: intent.intentId }, { storage, now: NOW });

    expect(await fileRowsOf(expenseId)).toHaveLength(1);
  });
});

// 06.1-14(E14 · RP-14 · PA-MIN-WHEN): 최소 용량 설정은 올리기 요청 때 선언 크기로 본다(기본 0 = 끔).
describe("E14 최소 용량 — 올리기 요청", () => {
  const declared = (size: number) => ({ size, contentType: "image/png", sha256: randomBytes(32).toString("hex"), name: "영수증.png" });

  it("설정 20KB면 15KB 선언이 이유와 함께 막히고(의도 0) 0으로 되돌리면 통과한다", async () => {
    const fx = await setupExpenseProject();
    const expenseId = await draftOf(fx);
    const storage = createMemoryStorage();
    const owner = { ownerKind: "expense" as const, ownerId: expenseId };

    await upsertSimpleValue(SYSTEM_VIEWER, EVIDENCE_MIN_SIZE_KB.key, 20, null);
    const blocked = requestEvidenceUpload(fx.pm, { ...owner, ...declared(15 * 1024) }, { storage, now: NOW });
    await expect(blocked).rejects.toThrow("20KB 미만 · 원본 파일로 다시");
    const [none] = await db.select().from(uploadIntents).where(eq(uploadIntents.ownerId, expenseId));
    expect(none).toBeUndefined();

    await upsertSimpleValue(SYSTEM_VIEWER, EVIDENCE_MIN_SIZE_KB.key, 0, null);
    const intent = await requestEvidenceUpload(fx.pm, { ...owner, ...declared(15 * 1024) }, { storage, now: NOW });
    expect(intent.intentId).toBeTruthy();
  });
});
