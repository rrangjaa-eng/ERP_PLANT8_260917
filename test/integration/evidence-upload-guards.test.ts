import { randomBytes } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { files, uploadIntents } from "@/db/schema";
import { createExpenseFromLines } from "@/domain/expenses";
import { EVIDENCE_MIN_SIZE_KB } from "@/domain/settings/keys";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { upsertSimpleValue } from "@/repositories/settings";
import { completeEvidenceUpload, EvidenceCheckError, EvidenceUploadRefusedError, requestEvidenceUpload } from "@/domain/evidence";
import { registerEvidenceUpload } from "@/domain/evidence-import";
import { EVIDENCE_UPLOAD_FAILED } from "@/domain/evidence/upload-checks";
import { log } from "@/lib/log";
import { createMemoryStorage, type MemoryStorage } from "./fakes/memory-storage";
import { setupExpenseProject, type ExpenseFixture } from "./fixtures/expenses";
import { createIntakeViewer } from "./fixtures/evidence";

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

// 07.1-12 D-7114(PF11 · W15) · PE10: 빈 파일은 정확한 이유로 — 카드 명세 등록(서버 액션 파일 칸)은 「빈 파일」, 05 사진 · PDF 올리기의
// 크기 0 선언은 지금처럼 「올리지 못함」(의도 0). 엑셀 · CSV가 아닌 파일은 지금 문구 그대로.
describe("D-7114 빈 파일 — 증빙 등록 · 05 올리기", () => {
  it("0바이트 CSV · xlsx 파일은 빈 파일, 내용 있는 PDF는 엑셀·CSV 파일 아님", async () => {
    const viewer = await createIntakeViewer();
    for (const name of ["명세.csv", "명세.xlsx"]) {
      const result = await registerEvidenceUpload(viewer, new File([], name));
      expect(result).toEqual({ refused: { kind: "not-excel", headline: "빈 파일 · 내려받은 파일 그대로", lines: [], restCount: 0 } });
    }
    const pdf = new File([Buffer.from("%PDF-1.4\n%\xe2\xe3\xcf\xd3\n\x78\x9c\x00\x01\n%%EOF\n", "latin1")], "명세.pdf");
    expect((await registerEvidenceUpload(viewer, pdf)).refused?.headline).toBe("엑셀·CSV 파일 아님 · 내려받은 파일 그대로");
  });

  it("05 올리기의 크기 0 선언은 올리지 못함 · 의도 0", async () => {
    const fx = await setupExpenseProject();
    const expenseId = await draftOf(fx);
    const blocked = await requestEvidenceUpload(
      fx.pm,
      { ownerKind: "expense", ownerId: expenseId, size: 0, contentType: "image/png", sha256: randomBytes(32).toString("hex"), name: "영수증.png" },
      { storage: createMemoryStorage(), now: NOW },
    ).then(
      () => undefined,
      (error: unknown) => error,
    );
    expect(blocked).toBeInstanceOf(EvidenceCheckError);
    expect((blocked as Error).message).toBe(EVIDENCE_UPLOAD_FAILED);
    expect(await db.select().from(uploadIntents).where(eq(uploadIntents.ownerId, expenseId))).toEqual([]);
  });
});

// 06.1-14 독립 검토 P2-2(TOCTOU) — 서명 PUT 주소는 15분 동안 다시 쓸 수 있다. 완료 통보는 메타데이터에서 읽은 세대로
// 머리 읽기 · 옮기기를 고정해, 대조한 바이트와 옮기는 바이트가 같은 객체 세대가 되게 한다.
describe("E14 세대 고정 — 대조 뒤 덮어쓰기", () => {
  const PDF_PUT = (sha256: string) => ({ size: 212_000, contentType: "image/png", sha256, head: PDF_HEAD });

  async function racedUpload(op: "getMetadata" | "readHead") {
    const fx = await setupExpenseProject();
    const expenseId = await draftOf(fx);
    const storage = createMemoryStorage();
    const sha256 = randomBytes(32).toString("hex");
    const declared = { size: 212_000, contentType: "image/png", sha256 };
    const intent = await requestEvidenceUpload(fx.pm, { ownerKind: "expense", ownerId: expenseId, ...declared, name: "영수증.png" }, { storage, now: NOW });
    storage.put(intent.url, { ...declared, head: PNG_HEAD });
    // 진짜 PNG를 올리고 완료 통보를 부르는 사이에 같은 서명 주소로 같은 크기 · 헤더의 다른 바이트를 다시 올린다.
    storage.afterNext(op, () => storage.put(intent.url, PDF_PUT(sha256)));
    const error = await completeEvidenceUpload(fx.pm, { intentId: intent.intentId }, { storage, now: NOW }).then(
      () => null,
      (reason: unknown) => reason,
    );
    return { error, storage, expenseId };
  }

  it("머리 읽기 뒤 · 옮기기 전에 덮어쓰면 옮기지 않고 거부 · evidence/ 0 · 파일 행 0", async () => {
    const { error, storage, expenseId } = await racedUpload("readHead");

    expect(error).toBeInstanceOf(EvidenceUploadRefusedError);
    expect(storage.moves).toEqual([]);
    expect([...storage.objects.keys()].filter((key) => key.startsWith("evidence/"))).toEqual([]);
    expect(await fileRowsOf(expenseId)).toEqual([]);
  });

  it("메타데이터 읽기 뒤 · 머리 읽기 전에 덮어쓰면 다시 올리기 거부 · 파일 행 0", async () => {
    const { error, storage, expenseId } = await racedUpload("getMetadata");

    expect(error).toBeInstanceOf(EvidenceUploadRefusedError);
    expect((error as EvidenceUploadRefusedError).retry).toBe("restart");
    expect(storage.moves).toEqual([]);
    expect(await fileRowsOf(expenseId)).toEqual([]);
  });
});
