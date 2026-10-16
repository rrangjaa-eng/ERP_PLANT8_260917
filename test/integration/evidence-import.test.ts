import { createHash, randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { actionLog, evidenceImportBatches, evidenceRecords } from "@/db/schema";
import { createAccount } from "@/domain/auth/accounts";
import { registerEvidenceFile, registerEvidenceUpload } from "@/domain/evidence-import";
import { EVIDENCE_IMPORT_MAX_BYTES, sizeRefusalHeadline } from "@/domain/evidence-import/limits";
import { finalizeAmounts, parseWorkbook } from "@/domain/evidence-import/registry";
import { loadTaxRates } from "@/domain/money/tax";
import { ForbiddenError } from "@/domain/permissions/can";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { upsertPermission } from "@/repositories/permissions";
import { insertRole } from "@/repositories/roles";
import { lotteFixture } from "@/test/fixtures/evidence-import/build";
import { createIntakeViewer, registerFixtureFile } from "./fixtures/evidence";

// 06.1-04: 증빙 등록 서비스 — 파일 하나 → 권한 · 크기 · 읽기 · 한 트랜잭션(묶음 + 기록) · 결과 DTO(실제 Postgres).
// 픽스처는 06.1-02 생성기의 가짜 값이다(카드 번호 9999000011112222 → 끝 4자리 2222, 매입일 2026-04-30, 204,100원 · 부가세 18,554원).

const FULL_CARD_NUMBER = "9999000011112222";

function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function lotteLines(approvalNos: readonly string[]): Uint8Array {
  return lotteFixture(approvalNos.map((approvalNo) => ({ 승인번호: approvalNo })));
}

// 픽스처 바이트(Uint8Array<ArrayBufferLike>)를 File 조각으로 — ArrayBuffer 바탕 사본이어야 BlobPart다.
function fileOf(bytes: Uint8Array, name: string): File {
  return new File([new Uint8Array(bytes)], name);
}

async function recordsInOrder() {
  return db.select().from(evidenceRecords).orderBy(asc(evidenceRecords.dedupeKey));
}

async function viewOnlyViewer(): Promise<Viewer> {
  const roleId = `role-evidence-view-${randomUUID().slice(0, 8)}`;
  await insertRole(SYSTEM_VIEWER, { id: roleId, name: `증빙 보기 ${roleId.slice(-8)}` });
  await upsertPermission(SYSTEM_VIEWER, { roleId, menu: "evidence", action: "view", allowed: true });
  await upsertPermission(SYSTEM_VIEWER, { roleId, menu: "evidence.intake", action: "view", allowed: true });
  const { userId } = await createAccount(SYSTEM_VIEWER, { email: `view-${randomUUID()}@example.test`, name: "증빙 보기만", roleId });
  return { id: userId, roleId };
}

describe("domain/evidence-import — 트레이서: 롯데 파일 하나 → 묶음 한 행 + 기록 (06.1-04 Task 1)", () => {
  it("롯데 3줄 → 등록 3 · 이미 등록 0 · 같은 파일 아님, 묶음 1행과 끝 4자리만 담은 기록 3행", async () => {
    const viewer = await createIntakeViewer();
    const bytes = lotteLines(["10000001", "10000002", "10000003"]);

    const result = await registerFixtureFile(viewer, bytes, "롯데카드_4월.xls");

    expect(result).toMatchObject({ registered: 3, skippedDuplicate: 0, sameFile: false, offsetPairs: 0, needsCheck: 0, nameMismatchLines: [] });
    const batches = await db.select().from(evidenceImportBatches);
    expect(batches).toHaveLength(1);
    expect(batches[0]).toMatchObject({
      id: result.batchId,
      format: "card-lotte",
      originalName: "롯데카드_4월.xls",
      fileSha256: sha256Hex(bytes),
      rowCount: 3,
      registeredCount: 3,
      skippedDuplicateCount: 0,
      uploadedBy: viewer.id,
    });
    const records = await recordsInOrder();
    expect(records.map((record) => record.dedupeKey)).toEqual([
      "card-lotte|2222|10000001|2026-04-30|204100",
      "card-lotte|2222|10000002|2026-04-30|204100",
      "card-lotte|2222|10000003|2026-04-30|204100",
    ]);
    for (const record of records) {
      expect(record).toMatchObject({
        batchId: result.batchId,
        format: "card-lotte",
        evidenceType: "card_receipt",
        issuedOn: "2026-04-30",
        totalKrw: 204_100,
        vatKrw: 18_554,
        supplyKrw: 185_546,
        cardLast4: "2222",
        visibility: "private",
        createdBy: viewer.id,
        version: 1,
      });
    }
    // 카드 전체 번호는 묶음 · 기록 · 결과 어디에도 없다(T-061-35).
    expect(JSON.stringify({ batches, records, result })).not.toContain(FULL_CARD_NUMBER);
  });

  it("같은 파일을 다시 올리면 등록 0 · 이미 등록 3 · 같은 파일이고 기록은 그대로 3행", async () => {
    const viewer = await createIntakeViewer();
    const bytes = lotteLines(["10000001", "10000002", "10000003"]);
    await registerFixtureFile(viewer, bytes);

    const again = await registerFixtureFile(viewer, bytes);

    expect(again).toMatchObject({ registered: 0, skippedDuplicate: 3, sameFile: true });
    expect(await recordsInOrder()).toHaveLength(3);
    const [secondBatch] = await db.select().from(evidenceImportBatches).where(eq(evidenceImportBatches.id, again.batchId));
    expect(secondBatch).toMatchObject({ rowCount: 3, registeredCount: 0, skippedDuplicateCount: 3 });
  });

  it("앞 파일의 2줄 + 새 1줄 파일 → 등록 1 · 이미 등록 2 · 같은 파일 아님", async () => {
    const viewer = await createIntakeViewer();
    await registerFixtureFile(viewer, lotteLines(["10000001", "10000002", "10000003"]));

    const overlap = await registerFixtureFile(viewer, lotteLines(["10000001", "10000002", "10000004"]));

    expect(overlap).toMatchObject({ registered: 1, skippedDuplicate: 2, sameFile: false });
    const added = await db.select().from(evidenceRecords).where(eq(evidenceRecords.batchId, overlap.batchId));
    expect(added.map((record) => record.approvalNo)).toEqual(["10000004"]);
  });

  it("줄 오류 파일은 거절 결과(거절 · 오류 1줄)로 돌아오고 묶음 · 기록 행이 하나도 없다", async () => {
    const viewer = await createIntakeViewer();

    const result = await registerEvidenceFile(viewer, { bytes: lotteFixture([{ 승인번호: "10000001" }, { 매입일자: "날짜아님" }]), fileName: "롯데.xls" });

    expect(result.refused).toMatchObject({ kind: "line-errors", headline: "거절 · 오류 1줄" });
    expect(result.refused?.lines[0]).toContain("매입일 읽지 못함");
    expect(await db.select().from(evidenceImportBatches)).toHaveLength(0);
    expect(await recordsInOrder()).toHaveLength(0);
  });

  it("(E2) 1MB를 넘는 File은 바이트를 읽지 않고 크기 거절 결과로 돌아오고 묶음이 없다", async () => {
    const viewer = await createIntakeViewer();
    const big = new File([new Uint8Array(EVIDENCE_IMPORT_MAX_BYTES + 1)], "큰파일.xls");
    const arrayBuffer = vi.spyOn(big, "arrayBuffer");
    const parse = vi.fn(parseWorkbook);

    const result = await registerEvidenceUpload(viewer, big, { parseWorkbook: parse });

    expect(result).toEqual({ refused: { kind: "size", headline: sizeRefusalHeadline(EVIDENCE_IMPORT_MAX_BYTES + 1), lines: [], restCount: 0 } });
    expect(parse).not.toHaveBeenCalled();
    expect(arrayBuffer).not.toHaveBeenCalled();
    expect(await db.select().from(evidenceImportBatches)).toHaveLength(0);
  });

  it("(E2) 파일 칸이 File이 아니면(글자 · 없음) 「엑셀·CSV 파일 아님」 거절 결과다 — 던지지 않는다", async () => {
    const viewer = await createIntakeViewer();
    const notExcel = { refused: { kind: "not-excel", headline: "엑셀·CSV 파일 아님 · 내려받은 파일 그대로", lines: [], restCount: 0 } };

    expect(await registerEvidenceUpload(viewer, "롯데.xls")).toEqual(notExcel);
    expect(await registerEvidenceUpload(viewer, null)).toEqual(notExcel);
    expect(await db.select().from(evidenceImportBatches)).toHaveLength(0);
  });

  it("(E2) 한도 안 File은 그 바이트로 등록된다(파일 이름 = File.name)", async () => {
    const viewer = await createIntakeViewer();
    const bytes = lotteLines(["10000001"]);

    const result = await registerEvidenceUpload(viewer, fileOf(bytes, "롯데카드.xls"));

    expect(result).toMatchObject({ refused: null, registered: 1 });
    const [batch] = await db.select().from(evidenceImportBatches);
    expect(batch).toMatchObject({ originalName: "롯데카드.xls", fileSha256: sha256Hex(bytes) });
  });

  it("(E8) parseWorkbook → finalizeAmounts 차례로 부르고 · 롯데는 세율 조회 0 · 셋째 인자 규칙 맵에 card_receipt가 있다", async () => {
    const viewer = await createIntakeViewer();
    const calls: string[] = [];
    const parse = vi.fn((bytes: Uint8Array) => {
      calls.push("parse");
      return parseWorkbook(bytes);
    });
    const finalize = vi.fn((...args: Parameters<typeof finalizeAmounts>) => {
      calls.push("finalize");
      return finalizeAmounts(...args);
    });
    const rates = vi.fn(loadTaxRates);

    await registerFixtureFile(viewer, lotteLines(["10000001"]), "롯데.xls", { parseWorkbook: parse, finalizeAmounts: finalize, loadTaxRates: rates });

    expect(calls).toEqual(["parse", "finalize"]);
    expect(rates).not.toHaveBeenCalled();
    expect(finalize.mock.calls[0]?.[2].has("card_receipt")).toBe(true);
  });

  it("evidence.intake write가 없는 계급(보기만)은 파일 · 업로드 둘 다 거부되고 행이 0이다", async () => {
    const viewer = await viewOnlyViewer();
    const bytes = lotteLines(["10000001"]);

    await expect(registerEvidenceFile(viewer, { bytes, fileName: "롯데.xls" })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(registerEvidenceUpload(viewer, fileOf(bytes, "롯데.xls"))).rejects.toBeInstanceOf(ForbiddenError);
    expect(await db.select().from(evidenceImportBatches)).toHaveLength(0);
    expect(await recordsInOrder()).toHaveLength(0);
  });

  it("등록 한 번에 행동 로그 document_create(evidence_import_batch) 한 줄 — 상세는 건수만", async () => {
    const viewer = await createIntakeViewer();

    const result = await registerFixtureFile(viewer, lotteLines(["10000001", "10000002"]), "롯데카드_비밀_가맹점.xls");

    const rows = await db.select().from(actionLog).where(eq(actionLog.entity, "evidence_import_batch"));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ actionType: "document_create", entityId: result.batchId, actorId: viewer.id });
    const detail = rows[0]?.detail as Record<string, unknown>;
    expect(Object.values(detail).every((value) => typeof value === "number")).toBe(true);
    expect(detail).toMatchObject({ rowCount: 2, registered: 2, skippedDuplicate: 0 });
  });

  it("파일 이름은 경로를 떼고 255자로 잘라 묶음에 둔다", async () => {
    const viewer = await createIntakeViewer();

    await registerFixtureFile(viewer, lotteLines(["10000001"]), "C:\\fakepath\\내려받기/롯데.xls");
    await registerFixtureFile(viewer, lotteLines(["10000002"]), `${"가".repeat(300)}.xls`);

    const names = (await db.select().from(evidenceImportBatches).orderBy(asc(evidenceImportBatches.createdAt))).map((batch) => batch.originalName);
    expect(names[0]).toBe("롯데.xls");
    expect(names[1]).toBe("가".repeat(255));
  });
});
