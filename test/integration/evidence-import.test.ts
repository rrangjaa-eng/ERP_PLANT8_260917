import { createHash, randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { actionLog, evidenceImportBatches, evidenceRecords, vendors } from "@/db/schema";
import { archive } from "@/domain/archive";
import { createAccount } from "@/domain/auth/accounts";
import { setEvidenceTypeTaxRule } from "@/domain/code-tables";
import { taxRuleSchema } from "@/domain/code-tables/tax-rule";
import { splitCardTotal } from "@/domain/corp-card-usages/amounts";
import { createCorpCard, setCorpCardActive } from "@/domain/corp-cards";
import { registerEvidenceFile, registerEvidenceUpload } from "@/domain/evidence-import";
import { EVIDENCE_IMPORT_MAX_BYTES, EVIDENCE_IMPORT_MAX_ROWS, sizeRefusalHeadline } from "@/domain/evidence-import/limits";
import { finalizeAmounts, parseWorkbook } from "@/domain/evidence-import/registry";
import { loadTaxRates } from "@/domain/money/tax";
import { can, ForbiddenError } from "@/domain/permissions/can";
import { TAX_VAT_RATE } from "@/domain/settings/keys";
import { addHistorizedValue } from "@/domain/settings/registry";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { normalizeVendorName } from "@/domain/vendors";
import type { VendorKind } from "@/domain/vendors/kind";
import { listCodeItems } from "@/repositories/code-tables";
import { findCardsByLast4 } from "@/repositories/corp-cards";
import { upsertPermission } from "@/repositories/permissions";
import { insertRole } from "@/repositories/roles";
import { insertVendor } from "@/repositories/vendors";
import {
  bcFixture,
  FAKE_BUSINESS_NO,
  FAKE_BUSINESS_NO_BAD,
  FAKE_COMPANY_BUSINESS_NO,
  hometaxCashReceiptFixture,
  hometaxTaxInvoiceFixture,
  lotteFixture,
  shinhanFixture,
} from "@/test/fixtures/evidence-import/build";
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

// ─── Task 2 ────────────────────────────────────────────────────────────────────────────────────────────────

const A10_CHECK = "같은 승인번호 다른 금액 · 원거래 확인";
const GHP1_CHECK = "같은 내용 줄 · 앞 파일과 건수 확인";
// 승인번호 없는 신한 줄 하나의 열쇠(06.1-02 baseKeyOf — 끝4 · 이용일시 · 가맹점 · 합계).
const SHINHAN_SAME = "card-shinhan|1278|2026-05-28 18:43:28|가맹점나|113400";

async function addCard(issuer: string, numberLast4: string): Promise<string> {
  const dto = await createCorpCard(SYSTEM_VIEWER, { issuer, numberLast4, label: `${issuer} ${numberLast4}`, kind: "shared" });
  return dto.id;
}

async function recordOf(dedupeKey: string) {
  const [record] = await db.select().from(evidenceRecords).where(eq(evidenceRecords.dedupeKey, dedupeKey));
  return record;
}

// 승인번호 없는 같은 내용 신한 줄 n개 — 열쇠에 들지 않는 결제예정일로 파일 바이트만 가른다(GH-P1 「다른 바이트」).
function sameContentShinhan(count: number, payDay: string): Uint8Array {
  return shinhanFixture(Array.from({ length: count }, () => ({ 승인번호: "", 결제예정일: payDay })));
}

function shaPrefix(bytes: Uint8Array): string {
  return sha256Hex(bytes).slice(0, 16);
}

describe("domain/evidence-import — 서식 넷 · 세율 · 카드 · A-10 · GH-P1 · 3000줄 (06.1-04 Task 2)", () => {
  it("신한 — 부가세율 이력이 파일 가운데 날짜에서 바뀌면 줄 날짜의 세율로 역산하고, 같은 날짜 세율 조회는 한 번이다", async () => {
    await addHistorizedValue(SYSTEM_VIEWER, TAX_VAT_RATE, { effectiveFrom: "2026-06-01", value: 0.12 });
    const viewer = await createIntakeViewer();
    const rates = vi.fn(loadTaxRates);
    const bytes = shinhanFixture([
      { 이용일시: "2026.05.28 18:43:28", 승인번호: "11110001", 이용금액: 113400 },
      { 이용일시: "2026.05.28 19:00:00", 승인번호: "11110002", 이용금액: 113400 },
      { 이용일시: "2026.06.02 10:00:00", 승인번호: "11110003", 이용금액: 112000 },
    ]);

    const result = await registerFixtureFile(viewer, bytes, "신한.xls", { loadTaxRates: rates });

    expect(result.registered).toBe(3);
    expect(rates.mock.calls.map(([asOf]) => asOf)).toEqual(["2026-05-28", "2026-06-02"]);
    const byApproval = new Map((await recordsInOrder()).map((record) => [record.approvalNo, record]));
    expect(byApproval.get("11110001")).toMatchObject({ totalKrw: 113_400, supplyKrw: 103_091, vatKrw: 10_309, cardLast4: "1278" });
    expect(byApproval.get("11110002")).toMatchObject({ totalKrw: 113_400, supplyKrw: 103_091, vatKrw: 10_309 });
    expect(byApproval.get("11110003")).toMatchObject({ totalKrw: 112_000, supplyKrw: 100_000, vatKrw: 12_000 });
  });

  it("비씨 — 면세 줄은 부가세 0 · SIGN `-` 줄은 음수 금액과 취소 표시 사유 · 결과 확인 필요 1", async () => {
    const viewer = await createIntakeViewer();
    const bytes = bcFixture([
      { 승인번호: "64706307" },
      { 승인번호: "64706308", "거래금액(원화)": "10,000", 부가세: "0" },
      { 승인번호: "64706309", 금액SIGN코드: "-", "거래금액(원화)": "5,500", 부가세: "500" },
    ]);

    const result = await registerFixtureFile(viewer, bytes, "비씨.xls");

    expect(result).toMatchObject({ registered: 3, needsCheck: 1 });
    const byApproval = new Map((await recordsInOrder()).map((record) => [record.approvalNo, record]));
    expect(byApproval.get("64706307")).toMatchObject({ format: "card-bc", totalKrw: 28_500, vatKrw: 2_591, supplyKrw: 25_909, cardLast4: "2942", needsCheck: null });
    expect(byApproval.get("64706308")).toMatchObject({ totalKrw: 10_000, vatKrw: 0, supplyKrw: 10_000, needsCheck: null });
    expect(byApproval.get("64706309")).toMatchObject({ totalKrw: -5_500, vatKrw: -500, supplyKrw: -5_000, needsCheck: "취소 표시 줄 · 원거래 확인" });
  });

  it("홈택스 세금계산서 — 파일의 합계 · 공급가 · 세액 그대로 · 음수 수정세금계산서도 그대로", async () => {
    const viewer = await createIntakeViewer();
    const bytes = hometaxTaxInvoiceFixture([
      {},
      { 승인번호: "20260620-10260620-71160002", 합계금액: -110000, 공급가액: -100000, 세액: -10000, 전자세금계산서분류: "수정세금계산서" },
    ]);

    const result = await registerFixtureFile(viewer, bytes, "홈택스.xls");

    expect(result).toMatchObject({ registered: 2, cardUnknown: 0 });
    const byApproval = new Map((await recordsInOrder()).map((record) => [record.approvalNo, record]));
    expect(byApproval.get("20260615-10260615-71160001")).toMatchObject({
      format: "hometax-tax-invoice",
      evidenceType: "tax_invoice",
      totalKrw: 110_000,
      supplyKrw: 100_000,
      vatKrw: 10_000,
      businessNoDigits: "1234567891",
      nameOnDocument: "공급회사가",
      cardLast4: null,
      corpCardId: null,
    });
    expect(byApproval.get("20260620-10260620-71160002")).toMatchObject({ totalKrw: -110_000, supplyKrw: -100_000, vatKrw: -10_000 });
  });

  it("카드 연결 — 등록자에게 법인카드 관리 권한이 없어도 파일의 끝 4자리 · 발급사(롯데)로 카드가 붙는다", async () => {
    const cardId = await addCard("롯데카드", "2222");
    const viewer = await createIntakeViewer();
    expect(await can(viewer, "admin.corp-cards", "view")).toBe(false);

    const result = await registerFixtureFile(viewer, lotteLines(["10000001"]));

    expect(result).toMatchObject({ registered: 1, cardUnknown: 0 });
    expect((await recordsInOrder())[0]?.corpCardId).toBe(cardId);
  });

  it("(B-F15) 별칭이 맞는 카드가 보관된 것뿐이면 카드 미등록 — findCardsByLast4는 보관 카드를 빼고 비활성 카드는 담는다", async () => {
    const archivedId = await addCard("롯데카드", "2222");
    await archive(SYSTEM_VIEWER, "corp_card", archivedId);
    const inactiveId = await addCard("신한카드", "2222");
    await setCorpCardActive(SYSTEM_VIEWER, inactiveId, false);
    const viewer = await createIntakeViewer();

    const result = await registerFixtureFile(viewer, lotteLines(["10000001"]));

    expect(result).toMatchObject({ registered: 1, cardUnknown: 1 });
    expect((await recordsInOrder())[0]?.corpCardId).toBeNull();
    const candidates = await findCardsByLast4(viewer, ["2222"]);
    expect(candidates.map((candidate) => candidate.id)).toEqual([inactiveId]);
    expect(candidates[0]).toMatchObject({ issuer: "신한카드", numberLast4: "2222", active: false });
  });

  it("(E1) 끝 4자리를 못 읽은 줄 · 짝 카드가 없는 줄은 corp_card_id null로 등록되고 결과 카드 미등록에 센다", async () => {
    await addCard("롯데카드", "2222");
    const viewer = await createIntakeViewer();
    const bytes = lotteFixture([{ 승인번호: "10000001" }, { 승인번호: "10000002", 카드번호: "9999-****-****-****" }, { 승인번호: "10000003", 카드번호: "9999000011113333" }]);

    const result = await registerFixtureFile(viewer, bytes);

    expect(result).toMatchObject({ registered: 3, cardUnknown: 2 });
    const byApproval = new Map((await recordsInOrder()).map((record) => [record.approvalNo, record]));
    expect(byApproval.get("10000001")?.corpCardId).not.toBeNull();
    expect(byApproval.get("10000002")).toMatchObject({ cardLast4: null, corpCardId: null });
    expect(byApproval.get("10000003")).toMatchObject({ cardLast4: "3333", corpCardId: null });
  });

  it(`(A-10) 같은 끝 4자리 · 같은 승인번호 · 같은 부호 · 다른 금액의 앞 기록이 있으면 등록하고 「${A10_CHECK}」`, async () => {
    const viewer = await createIntakeViewer();
    await registerFixtureFile(viewer, lotteFixture([{ 승인번호: "30000001" }]), "롯데A.xls");

    const result = await registerFixtureFile(viewer, lotteFixture([{ 승인번호: "30000001", 매입금액: "200,000", 부가세: "18,182" }]), "롯데B.xls");

    expect(result).toMatchObject({ registered: 1, needsCheck: 1 });
    expect(await recordOf("card-lotte|2222|30000001|2026-04-30|200000")).toMatchObject({ needsCheck: "같은 승인번호 다른 금액 · 원거래 확인" });
    expect((await recordOf("card-lotte|2222|30000001|2026-04-30|204100"))?.needsCheck).toBeNull();
  });

  it("(A-10) 부호가 다른 같은 승인번호 줄(부분 취소)은 확인 필요가 서지 않는다", async () => {
    const viewer = await createIntakeViewer();
    await registerFixtureFile(viewer, lotteFixture([{ 승인번호: "30000001" }]), "롯데A.xls");

    const result = await registerFixtureFile(viewer, lotteFixture([{ 승인번호: "30000001", 매입일자: "2026.05.02", 매입금액: "-4,100", 부가세: "-373" }]), "롯데C.xls");

    expect(result).toMatchObject({ registered: 1, needsCheck: 0 });
    expect((await recordOf("card-lotte|2222|30000001|2026-05-02|-4100"))?.needsCheck).toBeNull();
  });

  it("(GH-P1) 파일 X = [A,B] 뒤 파일 Y = [B,C] → Y 두 줄 다 @{Y sha 앞 16자} 열쇠 · 확인 필요로 등록(이미 등록 0)", async () => {
    const viewer = await createIntakeViewer();
    const first = await registerFixtureFile(viewer, sameContentShinhan(2, "2026.06.15"), "X.xls");
    expect(first).toMatchObject({ registered: 2, needsCheck: 0 });
    const y = sameContentShinhan(2, "2026.06.16");

    const second = await registerFixtureFile(viewer, y, "Y.xls");

    expect(second).toMatchObject({ registered: 2, skippedDuplicate: 0, sameFile: false, needsCheck: 2 });
    const added = await db.select().from(evidenceRecords).where(eq(evidenceRecords.batchId, second.batchId));
    expect(added.map((record) => record.dedupeKey).sort()).toEqual([`${SHINHAN_SAME}#2@${shaPrefix(y)}`, `${SHINHAN_SAME}@${shaPrefix(y)}`]);
    expect(added.map((record) => record.needsCheck)).toEqual([GHP1_CHECK, GHP1_CHECK]);
  });

  it("(GH-P1) Y를 다시 올리면 등록 0 · 이미 등록 2 · 같은 파일 — @ 줄을 또 만들지 않는다", async () => {
    const viewer = await createIntakeViewer();
    await registerFixtureFile(viewer, sameContentShinhan(2, "2026.06.15"), "X.xls");
    const y = sameContentShinhan(2, "2026.06.16");
    await registerFixtureFile(viewer, y, "Y.xls");

    const again = await registerFixtureFile(viewer, y, "Y.xls");

    expect(again).toMatchObject({ registered: 0, skippedDuplicate: 2, sameFile: true, needsCheck: 0 });
    expect(await recordsInOrder()).toHaveLength(4);
  });

  it("(GH-P1) X 뒤 파일 Z = [C] → 기존 #2가 있어 @ 열쇠 · 확인 필요로 등록 1", async () => {
    const viewer = await createIntakeViewer();
    await registerFixtureFile(viewer, sameContentShinhan(2, "2026.06.15"), "X.xls");
    const z = sameContentShinhan(1, "2026.06.17");

    const result = await registerFixtureFile(viewer, z, "Z.xls");

    expect(result).toMatchObject({ registered: 1, skippedDuplicate: 0, needsCheck: 1 });
    expect(await recordOf(`${SHINHAN_SAME}@${shaPrefix(z)}`)).toMatchObject({ needsCheck: GHP1_CHECK });
  });

  it("(GH-P1) X 뒤 파일 W = [A,B,C] → 등록 3(C는 #3) · 확인 필요 3", async () => {
    const viewer = await createIntakeViewer();
    await registerFixtureFile(viewer, sameContentShinhan(2, "2026.06.15"), "X.xls");
    const w = sameContentShinhan(3, "2026.06.18");

    const result = await registerFixtureFile(viewer, w, "W.xls");

    expect(result).toMatchObject({ registered: 3, skippedDuplicate: 0, needsCheck: 3 });
    const added = await db.select().from(evidenceRecords).where(eq(evidenceRecords.batchId, result.batchId));
    expect(added.map((record) => record.dedupeKey).sort()).toEqual([`${SHINHAN_SAME}#2@${shaPrefix(w)}`, `${SHINHAN_SAME}#3`, `${SHINHAN_SAME}@${shaPrefix(w)}`]);
  });

  it("(GH-P1) 홑 줄 하나가 든 두 파일(다른 바이트) → 둘째는 이미 등록 1 · 확인 필요 0(같은 거래)", async () => {
    const viewer = await createIntakeViewer();
    await registerFixtureFile(viewer, sameContentShinhan(1, "2026.06.15"), "한줄1.xls");

    const result = await registerFixtureFile(viewer, sameContentShinhan(1, "2026.06.16"), "한줄2.xls");

    expect(result).toMatchObject({ registered: 0, skippedDuplicate: 1, sameFile: false, needsCheck: 0 });
    expect(await recordsInOrder()).toHaveLength(1);
  });

  it("(앞 파일 대조) 9/1~15 파일로 원거래가 먼저 등록된 뒤 9/1~30 파일에 원거래 · 취소 쌍이 오면 취소 줄을 등록해 합이 0이 된다", async () => {
    const viewer = await createIntakeViewer();
    const original = { 승인번호: "20000001", 매입일자: "2026.09.05", 매입금액: "50,000", 부가세: "4,545" };
    const early = { 승인번호: "20000002", 매입일자: "2026.09.10" };
    await registerFixtureFile(viewer, lotteFixture([original, early]), "롯데_0901-0915.xls");

    const result = await registerFixtureFile(
      viewer,
      lotteFixture([original, early, { 승인번호: "20000001", 매입일자: "2026.09.20", 매입금액: "-50,000", 부가세: "-4,545" }, { 승인번호: "20000003", 매입일자: "2026.09.25" }]),
      "롯데_0901-0930.xls",
    );

    expect(result).toMatchObject({ registered: 2, skippedDuplicate: 2, offsetPairs: 0 });
    const pair = (await recordsInOrder()).filter((record) => record.approvalNo === "20000001");
    expect(pair.map((record) => record.totalKrw).sort((a, b) => a - b)).toEqual([-50_000, 50_000]);
    expect(pair.reduce((sum, record) => sum + record.totalKrw, 0)).toBe(0);
    expect(await recordOf("card-lotte|2222|20000001|2026-09-20|-50000")).toMatchObject({ batchId: result.batchId, vatKrw: -4_545, supplyKrw: -45_455 });
  });

  it("(앞 파일 대조 · 역순) 취소 줄만 든 파일이 먼저 등록된 뒤 원거래 · 취소 쌍이 든 파일이 오면 원거래를 등록해 합이 0이 된다", async () => {
    const viewer = await createIntakeViewer();
    const cancel = { 승인번호: "20000001", 매입일자: "2026.09.20", 매입금액: "-50,000", 부가세: "-4,545" };
    await registerFixtureFile(viewer, lotteFixture([cancel]), "롯데_취소만.xls");

    const result = await registerFixtureFile(
      viewer,
      lotteFixture([{ 승인번호: "20000001", 매입일자: "2026.09.05", 매입금액: "50,000", 부가세: "4,545" }, cancel, { 승인번호: "20000003" }]),
      "롯데_0901-0930.xls",
    );

    expect(result).toMatchObject({ registered: 2, skippedDuplicate: 1, offsetPairs: 0 });
    const pair = (await recordsInOrder()).filter((record) => record.approvalNo === "20000001");
    expect(pair.map((record) => record.totalKrw).sort((a, b) => a - b)).toEqual([-50_000, 50_000]);
    expect(await recordOf("card-lotte|2222|20000001|2026-09-05|50000")).toMatchObject({ batchId: result.batchId });
  });

  it("(앞 파일 대조) 원거래 · 취소 줄이 둘 다 앞 파일로 등록돼 있으면 쌍은 둘 다 이미 등록이고 상쇄로 세지 않는다", async () => {
    const viewer = await createIntakeViewer();
    const original = { 승인번호: "20000001", 매입일자: "2026.09.05", 매입금액: "50,000", 부가세: "4,545" };
    const cancel = { 승인번호: "20000001", 매입일자: "2026.09.20", 매입금액: "-50,000", 부가세: "-4,545" };
    await registerFixtureFile(viewer, lotteFixture([original]), "롯데_원거래.xls");
    await registerFixtureFile(viewer, lotteFixture([cancel]), "롯데_취소.xls");

    const result = await registerFixtureFile(viewer, lotteFixture([original, cancel, { 승인번호: "20000003" }]), "롯데_전체.xls");

    expect(result).toMatchObject({ registered: 1, skippedDuplicate: 2, offsetPairs: 0 });
    const pair = (await recordsInOrder()).filter((record) => record.approvalNo === "20000001");
    expect(pair.reduce((sum, record) => sum + record.totalKrw, 0)).toBe(0);
    expect(pair).toHaveLength(2);
  });

  it("(앞 파일 대조) 원거래가 아직 등록되지 않은 상쇄 쌍은 둘 다 등록하지 않고 상쇄 1쌍에 센다", async () => {
    const viewer = await createIntakeViewer();

    const result = await registerFixtureFile(
      viewer,
      lotteFixture([
        { 승인번호: "20000001", 매입일자: "2026.09.05", 매입금액: "50,000", 부가세: "4,545" },
        { 승인번호: "20000001", 매입일자: "2026.09.20", 매입금액: "-50,000", 부가세: "-4,545" },
        { 승인번호: "20000003" },
      ]),
    );

    expect(result).toMatchObject({ registered: 1, skippedDuplicate: 0, offsetPairs: 1 });
    expect((await recordsInOrder()).map((record) => record.approvalNo)).toEqual(["20000003"]);
    const [batch] = await db.select().from(evidenceImportBatches).where(eq(evidenceImportBatches.id, result.batchId));
    expect(batch).toMatchObject({ rowCount: 3, registeredCount: 1, skippedDuplicateCount: 0 });
  });

  it("(앞 파일 대조 · 보관) 앞 파일로 등록된 원거래가 보관돼 있으면 원거래 · 취소 쌍은 둘 다 등록하지 않고 상쇄 1쌍에 센다(−T 방지)", async () => {
    const viewer = await createIntakeViewer();
    const original = { 승인번호: "20000001", 매입일자: "2026.09.05", 매입금액: "50,000", 부가세: "4,545" };
    await registerFixtureFile(viewer, lotteFixture([original]), "롯데_원거래.xls");
    await db
      .update(evidenceRecords)
      .set({ archivedAt: new Date(), archivedBy: viewer.id })
      .where(eq(evidenceRecords.dedupeKey, "card-lotte|2222|20000001|2026-09-05|50000"));

    const result = await registerFixtureFile(
      viewer,
      lotteFixture([original, { 승인번호: "20000001", 매입일자: "2026.09.20", 매입금액: "-50,000", 부가세: "-4,545" }, { 승인번호: "20000003" }]),
      "롯데_전체.xls",
    );

    expect(result).toMatchObject({ registered: 1, skippedDuplicate: 0, offsetPairs: 1 });
    expect(await recordOf("card-lotte|2222|20000001|2026-09-20|-50000")).toBeUndefined();
    expect((await recordsInOrder()).filter((record) => record.approvalNo === "20000001")).toHaveLength(1);
  });

  it("(보관) 보관된 앞 기록도 같은 줄의 재등록은 막는다 — 다른 바이트 파일에서 이미 등록 1", async () => {
    const viewer = await createIntakeViewer();
    await registerFixtureFile(viewer, lotteLines(["20000001"]), "롯데_첫.xls");
    await db
      .update(evidenceRecords)
      .set({ archivedAt: new Date(), archivedBy: viewer.id })
      .where(eq(evidenceRecords.approvalNo, "20000001"));

    const result = await registerFixtureFile(viewer, lotteLines(["20000001", "20000002"]), "롯데_둘째.xls");

    expect(result).toMatchObject({ registered: 1, skippedDuplicate: 1, sameFile: false });
    expect((await recordsInOrder()).filter((record) => record.approvalNo === "20000001")).toHaveLength(1);
  });

  it(`(E10) ${EVIDENCE_IMPORT_MAX_ROWS}줄 롯데 파일이 한 번에 등록된다(500줄 묶음 INSERT — 바인드 변수 한도 안)`, async () => {
    const viewer = await createIntakeViewer();
    const rows = Array.from({ length: EVIDENCE_IMPORT_MAX_ROWS }, (_, i) => ({ 승인번호: String(40_000_000 + i) }));
    const bytes = lotteFixture(rows, { as: "xlsx" });
    expect(bytes.length).toBeLessThanOrEqual(EVIDENCE_IMPORT_MAX_BYTES);

    const result = await registerFixtureFile(viewer, bytes, "롯데_3000.xlsx");

    expect(result).toMatchObject({ registered: EVIDENCE_IMPORT_MAX_ROWS, skippedDuplicate: 0 });
    expect(await recordsInOrder()).toHaveLength(EVIDENCE_IMPORT_MAX_ROWS);
  }, 120_000);

  it("(P2-A5) 코드표 card_receipt 규칙의 끝처리 방식을 절사로 바꾸면 신한 역산 공급가가 같은 규칙의 splitCardTotal과 같다", async () => {
    const [item] = (await listCodeItems(SYSTEM_VIEWER, { tableKey: "evidence_type", scope: { rows: "all", includeArchived: true }, includeInactive: true })).filter(
      (one) => one.value === "card_receipt",
    );
    if (!item) throw new Error("card_receipt 코드표 항목 없음");
    const rule = { ...taxRuleSchema.parse(item.taxRule), roundingMethod: "truncate" as const };
    await setEvidenceTypeTaxRule(SYSTEM_VIEWER, item.id, rule);
    const viewer = await createIntakeViewer();

    await registerFixtureFile(viewer, shinhanFixture([{ 승인번호: "11110001", 이용금액: 113400 }]), "신한.xls");

    const expected = splitCardTotal({ money: { currency: "KRW", amount: 113_400, fxRate: 1 }, rule }, await loadTaxRates("2026-05-28"));
    expect(expected.supplyKrw).toBe(103_090);
    expect((await recordsInOrder())[0]).toMatchObject({ supplyKrw: expected.supplyKrw, vatKrw: expected.vatKrw });
  });
});

// 06.1-11: 홈택스 매입 현금영수증 · 계산서 목록 → 등록 서비스(06.1-04) → 거래처 자동 생성(D-6114 · RP-7 · D31) → 기록.
// 픽스처 가맹점 · 공급자 번호는 06.1-02 상수(FAKE_BUSINESS_NO — 검증 숫자 맞음 · FAKE_BUSINESS_NO_BAD — 틀림)만 쓴다.
const FAKE_DIGITS = FAKE_BUSINESS_NO.replaceAll("-", "");

async function addVendor(name: string, businessNo: string, kind: VendorKind) {
  return insertVendor(SYSTEM_VIEWER, { name, normalizedName: normalizeVendorName(name), businessNo, kind });
}

async function vendorsByDigits(digits: string) {
  return (await db.select().from(vendors)).filter((row) => (row.businessNo ?? "").replaceAll(/\D/g, "") === digits);
}

describe("domain/evidence-import — 홈택스 매입 현금영수증 등록 (06.1-11 Task 1)", () => {
  it("현금영수증 2줄 → 기록 2(현금영수증 종류 · 봉사료는 공급가에) · 없는 번호의 협력사 생성(기본 종류 현금영수증) · 이름 다름 1 · 다시 올리면 이미 등록 2", async () => {
    await addVendor("등록된가맹점", FAKE_COMPANY_BUSINESS_NO, "supplier");
    const viewer = await createIntakeViewer();
    const bytes = hometaxCashReceiptFixture([
      {},
      { 승인번호: "A10000002", 가맹점사업자번호: FAKE_COMPANY_BUSINESS_NO, 가맹점명: "다른이름가맹점", 공급가액: 9091, 부가세: 909, 봉사료: 500, 매입금액: 10500 },
    ]);

    const result = await registerFixtureFile(viewer, bytes, "현금영수증.xls");

    expect(result).toMatchObject({ registered: 2, skippedDuplicate: 0, vendorCreated: 1, vendorRestored: 0, needsCheck: 0, cardUnknown: 0 });
    expect(result.nameMismatchLines).toEqual(["999-99-99997 · 파일 다른이름가맹점 · 등록 등록된가맹점"]);
    const created = await vendorsByDigits(FAKE_DIGITS);
    expect(created).toMatchObject([{ name: "가맹점가", businessNo: FAKE_BUSINESS_NO, kind: "supplier", defaultEvidenceType: "cash_receipt", archivedAt: null }]);
    const byApproval = new Map((await recordsInOrder()).map((record) => [record.approvalNo, record]));
    expect(byApproval.get("A10000001")).toMatchObject({
      format: "hometax-cash-receipt",
      evidenceType: "cash_receipt",
      dedupeKey: "hometax-cash-receipt|A10000001|2026-07-15|1234567891|10000",
      issuedOn: "2026-07-15",
      supplyKrw: 9091,
      vatKrw: 909,
      totalKrw: 10000,
      businessNoDigits: FAKE_DIGITS,
      nameOnDocument: "가맹점가",
      vendorId: created[0]?.id,
      needsCheck: null,
      corpCardId: null,
      cardLast4: null,
    });
    expect(byApproval.get("A10000002")).toMatchObject({ supplyKrw: 9591, vatKrw: 909, totalKrw: 10500, nameOnDocument: "다른이름가맹점" });

    const again = await registerFixtureFile(viewer, bytes, "현금영수증.xls");

    expect(again).toMatchObject({ registered: 0, skippedDuplicate: 2, sameFile: true, vendorCreated: 0, vendorRestored: 0 });
    expect(await recordsInOrder()).toHaveLength(2);
    expect(await vendorsByDigits(FAKE_DIGITS)).toHaveLength(1);
  });

  it("(E17 · DA-5) 취소거래 줄 → 그 기록 확인 필요 「취소거래 · 원거래 확인」 · 합계 음수(합계 = 공급가 + 세액) · 결과 확인 필요 1", async () => {
    const viewer = await createIntakeViewer();

    const result = await registerFixtureFile(viewer, hometaxCashReceiptFixture([{}, { 거래구분: "취소거래" }]), "현금영수증.xls");

    expect(result).toMatchObject({ registered: 2, needsCheck: 1 });
    const cancel = (await recordsInOrder()).find((record) => record.totalKrw < 0);
    expect(cancel).toMatchObject({ totalKrw: -10000, supplyKrw: -9091, vatKrw: -909, needsCheck: "취소거래 · 원거래 확인" });
  });

  it("(RP-7 · D31) 가맹점 번호가 숨기지 않은 고객 전용 거래처면 붙이고 둘 다(both)로 올리며 evidence_vendor_kind_change 한 줄", async () => {
    const client = await addVendor("가맹점가", FAKE_BUSINESS_NO, "client");
    const viewer = await createIntakeViewer();

    const result = await registerFixtureFile(viewer, hometaxCashReceiptFixture([{}]), "현금영수증.xls");

    expect(result).toMatchObject({ registered: 1, vendorCreated: 0 });
    expect(await vendorsByDigits(FAKE_DIGITS)).toMatchObject([{ id: client.id, kind: "both" }]);
    expect(await recordsInOrder()).toMatchObject([{ vendorId: client.id }]);
    const logs = await db
      .select()
      .from(actionLog)
      .where(and(eq(actionLog.entity, "vendor"), eq(actionLog.actionType, "evidence_vendor_kind_change")));
    expect(logs).toMatchObject([{ entityId: client.id, actorId: viewer.id, detail: { batchId: result.batchId, kind: { from: "client", to: "both" } } }]);
  });

  it("(RP-7) 10자리지만 검증 숫자가 틀린 가맹점 번호 줄 → 거래처 생성 0 · vendor_id null · 「사업자번호 틀림 · 거래처 확인」", async () => {
    const viewer = await createIntakeViewer();

    const result = await registerFixtureFile(viewer, hometaxCashReceiptFixture([{ 가맹점사업자번호: FAKE_BUSINESS_NO_BAD }]), "현금영수증.xls");

    expect(result).toMatchObject({ registered: 1, vendorCreated: 0, needsCheck: 1 });
    expect(await vendorsByDigits(FAKE_BUSINESS_NO_BAD.replaceAll("-", ""))).toHaveLength(0);
    expect(await recordsInOrder()).toMatchObject([{ vendorId: null, businessNoDigits: "1234567890", needsCheck: "사업자번호 틀림 · 거래처 확인" }]);
  });
});
