import { Client } from "pg";
import { describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { actionLog, evidenceImportBatches, evidenceRecords, vendors } from "@/db/schema";
import { archive } from "@/domain/archive";
import type { EvidenceImportSuccess } from "@/domain/evidence-import";
import { EVIDENCE_IMPORT_MAX_BYTES, EVIDENCE_IMPORT_MAX_ROWS } from "@/domain/evidence-import/limits";
import { can } from "@/domain/permissions/can";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { businessNoProblem, normalizeVendorName } from "@/domain/vendors";
import type { VendorKind } from "@/domain/vendors/kind";
import { findVendorsByBusinessNoDigitsList, insertVendor, setVendorHidden } from "@/repositories/vendors";
import { ACTION_LOG_OPTIONAL_TYPES } from "@/domain/settings/keys";
import { upsertSimpleValue } from "@/repositories/settings";
import { FAKE_BUSINESS_NO, FAKE_BUSINESS_NO_BAD, hometaxTaxInvoiceFixture, lotteFixture } from "@/test/fixtures/evidence-import/build";
import { createIntakeViewer, registerFixtureFile } from "./fixtures/evidence";

// 06.1-04 Task 3(EVID-11 · D-6114 · RP-7): 홈택스 세금계산서 줄의 공급자 사업자번호 → 거래처 연결 · 되살림 · 협력사 생성 ·
// 고객 전용 올림 · 이름 다름(알림만). 새 줄만 · 잠금 하나 · 조회 한 번 · 23505면 트랜잭션 통째 한 번 다시.
// 픽스처 기본 공급자 = 공급회사가 · 123-45-67891(검증 숫자 맞음 — 06.1-02 FAKE_BUSINESS_NO).

const DIGITS = FAKE_BUSINESS_NO.replaceAll("-", "");
const BAD_NO_CHECK = "사업자번호 틀림 · 거래처 확인";
const LOCK_WAIT = "다른 저장이 끝나지 않음 · 잠시 뒤 다시 저장";

function approvalNo(i: number): string {
  return `20260615-10260615-${71_160_001 + i}`;
}

// 검증 숫자가 맞는 가짜 사업자번호(XXX-XX-XXXXX) — 앞 아홉 자리에 맞는 마지막 숫자는 하나뿐이다.
function validBusinessNo(seed: number): string {
  const head = String(200_000_000 + seed);
  for (let check = 0; check <= 9; check += 1) {
    const digits = `${head}${check}`;
    if (businessNoProblem(digits) === null) return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
  }
  throw new Error(`검증 숫자를 맞추지 못함 — ${head}`);
}

function hometax(rows: readonly Record<string, string>[], opts: Parameters<typeof hometaxTaxInvoiceFixture>[1] = {}): Uint8Array {
  return hometaxTaxInvoiceFixture(
    rows.map((row, i) => ({ 승인번호: approvalNo(i), ...row })),
    opts,
  );
}

async function addVendor(name: string, businessNo: string, kind?: VendorKind) {
  return insertVendor(SYSTEM_VIEWER, { name, normalizedName: normalizeVendorName(name), businessNo, kind });
}

async function vendorsByDigits(digits: string) {
  return (await db.select().from(vendors)).filter((row) => (row.businessNo ?? "").replaceAll(/\D/g, "") === digits);
}

async function vendorLogs(actionType: string) {
  return db
    .select()
    .from(actionLog)
    .where(and(eq(actionLog.entity, "vendor"), eq(actionLog.actionType, actionType)));
}

async function lockAutocreate(client: Client): Promise<number> {
  await client.query("BEGIN");
  const { rows } = await client.query<{ pid: number }>("SELECT pg_backend_pid() AS pid");
  const pid = rows[0]?.pid;
  if (pid === undefined) throw new Error("잠금 커넥션의 pg_backend_pid()를 읽지 못했다");
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended('vendor_autocreate', 0))");
  return pid;
}

// 트랜잭션 안 pg_stat_activity는 첫 조회 때 스냅숏이라 매번 버리고 다시 읽는다.
async function waitUntilBlockedBy(client: Client, blockerPid: number): Promise<void> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    await client.query("SELECT pg_stat_clear_snapshot()");
    const { rows } = await client.query<{ count: string }>("SELECT count(*)::text AS count FROM pg_stat_activity WHERE $1 = ANY(pg_blocking_pids(pid))", [
      blockerPid,
    ]);
    if (Number(rows[0]?.count ?? 0) > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("등록이 거래처 잠금을 기다리는 상태에 들어가지 않았다");
}

describe("증빙 등록 — 사업자번호 서식 거래처 연결 · 되살림 · 생성 (06.1-04 Task 3)", () => {
  it("새 사업자번호 줄 → 협력사 거래처 하나 생성(상호 · 하이픈 번호 · 줄의 증빙 종류) · 기록 연결 · evidence_vendor_create", async () => {
    const viewer = await createIntakeViewer();

    const result = await registerFixtureFile(viewer, hometax([{}]), "홈택스.xls");

    expect(result).toMatchObject({ registered: 1, vendorCreated: 1, vendorRestored: 0 });
    const created = await vendorsByDigits(DIGITS);
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({
      name: "공급회사가",
      normalizedName: normalizeVendorName("공급회사가"),
      businessNo: "123-45-67891",
      kind: "supplier",
      defaultEvidenceType: "tax_invoice",
      archivedAt: null,
    });
    expect(await db.select().from(evidenceRecords)).toMatchObject([{ vendorId: created[0]?.id }]);
    expect(await vendorLogs("evidence_vendor_create")).toMatchObject([{ entityId: created[0]?.id, actorId: viewer.id }]);
  });

  it("기존 거래처 번호가 하이픈 없이(1234567891) 있어도 파일의 123-45-67891 줄은 그 거래처에 붙고 생성은 0이다", async () => {
    const existing = await addVendor("공급회사가", DIGITS, "supplier");
    const viewer = await createIntakeViewer();

    const result = await registerFixtureFile(viewer, hometax([{}]));

    expect(result).toMatchObject({ registered: 1, vendorCreated: 0, vendorRestored: 0 });
    expect(await db.select().from(evidenceRecords)).toMatchObject([{ vendorId: existing.id }]);
    expect(await vendorsByDigits(DIGITS)).toHaveLength(1);
  });

  it("보관된 거래처만 있으면 되살려 붙이고 결과 되살림 1 · 행동 로그 evidence_vendor_restore", async () => {
    const archived = await addVendor("공급회사가", FAKE_BUSINESS_NO, "supplier");
    await archive(SYSTEM_VIEWER, "vendor", archived.id);
    const viewer = await createIntakeViewer();

    const result = await registerFixtureFile(viewer, hometax([{}]));

    expect(result).toMatchObject({ registered: 1, vendorCreated: 0, vendorRestored: 1 });
    expect(await vendorsByDigits(DIGITS)).toMatchObject([{ id: archived.id, archivedAt: null }]);
    expect(await db.select().from(evidenceRecords)).toMatchObject([{ vendorId: archived.id }]);
    expect(await vendorLogs("evidence_vendor_restore")).toMatchObject([{ entityId: archived.id, actorId: viewer.id }]);
  });

  it("번호는 같고 이름이 다르면(파일 (주)에이원 · 등록 에이원) 결과 줄로만 알리고 거래처 이름은 그대로다", async () => {
    const existing = await addVendor("에이원", FAKE_BUSINESS_NO, "supplier");
    const viewer = await createIntakeViewer();

    const result = await registerFixtureFile(viewer, hometax([{ 공급자상호: "(주)에이원" }]));

    expect(result).toMatchObject({ registered: 1, nameMismatchLines: ["123-45-67891 · 파일 (주)에이원 · 등록 에이원"], nameMismatchRest: 0 });
    expect(await vendorsByDigits(DIGITS)).toMatchObject([{ id: existing.id, name: "에이원" }]);
  });

  it("이름 다름이 7건이면 결과 줄 5개 + 나머지 2", async () => {
    const numbers = Array.from({ length: 7 }, (_, i) => validBusinessNo(i));
    for (const [i, businessNo] of numbers.entries()) await addVendor(`등록${i}`, businessNo, "supplier");
    const viewer = await createIntakeViewer();

    const result = await registerFixtureFile(viewer, hometax(numbers.map((businessNo, i) => ({ 공급자사업자등록번호: businessNo, 공급자상호: `파일${i}` }))));

    expect(result).toMatchObject({ registered: 7, vendorCreated: 0, nameMismatchRest: 2 });
    expect(result.nameMismatchLines).toHaveLength(5);
    expect(result.nameMismatchLines?.[0]).toBe(`${numbers[0]} · 파일 파일0 · 등록 등록0`);
  });

  it("숨김 거래처는 그대로 붙는다 — 숨김 유지", async () => {
    const hidden = await addVendor("공급회사가", FAKE_BUSINESS_NO, "supplier");
    await setVendorHidden(SYSTEM_VIEWER, hidden.id, true);
    const viewer = await createIntakeViewer();

    const result = await registerFixtureFile(viewer, hometax([{}]));

    expect(result).toMatchObject({ registered: 1, vendorCreated: 0, vendorRestored: 0 });
    expect(await db.select().from(evidenceRecords)).toMatchObject([{ vendorId: hidden.id }]);
    expect(await vendorsByDigits(DIGITS)).toMatchObject([{ id: hidden.id, hidden: true, kind: "supplier" }]);
  });

  it("(D31) 고객 전용(client) 거래처는 붙이면서 둘 다(both)로 올리고 evidence_vendor_kind_change 한 줄(전 · 후 구분)", async () => {
    const client = await addVendor("공급회사가", FAKE_BUSINESS_NO, "client");
    const viewer = await createIntakeViewer();

    const result = await registerFixtureFile(viewer, hometax([{}]));

    expect(await vendorsByDigits(DIGITS)).toMatchObject([{ id: client.id, kind: "both" }]);
    expect(await db.select().from(evidenceRecords)).toMatchObject([{ vendorId: client.id }]);
    expect(await vendorLogs("evidence_vendor_kind_change")).toMatchObject([
      { entityId: client.id, actorId: viewer.id, detail: { batchId: result.batchId, kind: { from: "client", to: "both" } } },
    ]);
  });

  it("(D31) 고객 전용이고 숨긴 거래처는 붙이기만 하고 갈래 client 그대로 · 구분 변경 로그 0", async () => {
    const client = await addVendor("공급회사가", FAKE_BUSINESS_NO, "client");
    await setVendorHidden(SYSTEM_VIEWER, client.id, true);
    const viewer = await createIntakeViewer();

    await registerFixtureFile(viewer, hometax([{}]));

    expect(await vendorsByDigits(DIGITS)).toMatchObject([{ id: client.id, kind: "client", hidden: true }]);
    expect(await db.select().from(evidenceRecords)).toMatchObject([{ vendorId: client.id }]);
    expect(await vendorLogs("evidence_vendor_kind_change")).toHaveLength(0);
  });

  it("(D31) 둘 다 · 협력사 거래처는 갈래 그대로 · 구분 변경 로그 0", async () => {
    const both = await addVendor("둘다회사", validBusinessNo(1), "both");
    const supplier = await addVendor("협력회사", validBusinessNo(2), "supplier");
    const viewer = await createIntakeViewer();

    await registerFixtureFile(
      viewer,
      hometax([
        { 공급자사업자등록번호: validBusinessNo(1), 공급자상호: "둘다회사" },
        { 공급자사업자등록번호: validBusinessNo(2), 공급자상호: "협력회사" },
      ]),
    );

    const byId = new Map((await db.select().from(vendors)).map((row) => [row.id, row]));
    expect(byId.get(both.id)?.kind).toBe("both");
    expect(byId.get(supplier.id)?.kind).toBe("supplier");
    expect(await vendorLogs("evidence_vendor_kind_change")).toHaveLength(0);
  });

  it("(D-6114) 행동 로그 설정에서 선택 종류를 모두 꺼도 생성 · 복원 · 구분 변경 로그가 남고 detail에 묶음 id가 있다", async () => {
    const archived = await addVendor("보관회사", validBusinessNo(1), "supplier");
    await archive(SYSTEM_VIEWER, "vendor", archived.id);
    const client = await addVendor("고객회사", validBusinessNo(2), "client");
    const viewer = await createIntakeViewer();
    await upsertSimpleValue(SYSTEM_VIEWER, ACTION_LOG_OPTIONAL_TYPES.key, [], null);
    try {
      const result = await registerFixtureFile(
        viewer,
        hometax([
          {},
          { 공급자사업자등록번호: validBusinessNo(1), 공급자상호: "보관회사" },
          { 공급자사업자등록번호: validBusinessNo(2), 공급자상호: "고객회사" },
        ]),
      );

      expect(result).toMatchObject({ registered: 3, vendorCreated: 1, vendorRestored: 1 });
      const [created] = await vendorsByDigits(DIGITS);
      expect(await vendorLogs("evidence_vendor_create")).toMatchObject([{ entityId: created?.id, actorId: viewer.id, detail: { batchId: result.batchId } }]);
      expect(await vendorLogs("evidence_vendor_restore")).toMatchObject([{ entityId: archived.id, actorId: viewer.id, detail: { batchId: result.batchId } }]);
      expect(await vendorLogs("evidence_vendor_kind_change")).toMatchObject([
        { entityId: client.id, detail: { batchId: result.batchId, kind: { from: "client", to: "both" } } },
      ]);
    } finally {
      await upsertSimpleValue(SYSTEM_VIEWER, ACTION_LOG_OPTIONAL_TYPES.key, ACTION_LOG_OPTIONAL_TYPES.default ?? [], null);
    }
  });

  it("같은 번호의 첫 줄에 상호가 없고 뒷줄에 있으면 뒷줄 상호로 만들고 두 줄 다 붙인다(260907 줄마다 판정과 같다)", async () => {
    const viewer = await createIntakeViewer();

    const result = await registerFixtureFile(viewer, hometax([{ 공급자상호: "" }, { 공급자상호: "공급회사가" }]));

    expect(result).toMatchObject({ registered: 2, vendorCreated: 1 });
    const created = await vendorsByDigits(DIGITS);
    expect(created).toMatchObject([{ name: "공급회사가" }]);
    expect((await db.select().from(evidenceRecords)).map((record) => record.vendorId)).toEqual([created[0]?.id, created[0]?.id]);
  });

  it(`(RP-7) 검증 숫자가 틀린 번호 줄은 거래처를 찾지도 만들지도 않고 vendor_id null · 사유 「${BAD_NO_CHECK}」`, async () => {
    const viewer = await createIntakeViewer();
    const lookup = vi.fn(findVendorsByBusinessNoDigitsList);

    const result = await registerFixtureFile(viewer, hometax([{ 공급자사업자등록번호: FAKE_BUSINESS_NO_BAD }]), "홈택스.xls", {
      findVendorsByBusinessNoDigitsList: lookup,
    });

    expect(result).toMatchObject({ registered: 1, vendorCreated: 0, needsCheck: 1 });
    expect(await db.select().from(evidenceRecords)).toMatchObject([{ vendorId: null, businessNoDigits: "1234567890", needsCheck: BAD_NO_CHECK }]);
    expect(lookup).not.toHaveBeenCalled();
    expect(await db.select().from(vendors)).toHaveLength(0);
  });

  it("(RP-7) 조회가 처음 한 번 빈 결과를 내도(그 사이 생긴 것처럼) 유일 색인 23505로 트랜잭션을 통째로 한 번 다시 돌아 붙는다 — 생성 0 · 기록 한 벌", async () => {
    const existing = await addVendor("공급회사가", FAKE_BUSINESS_NO, "supplier");
    const viewer = await createIntakeViewer();
    let calls = 0;
    const lookup: typeof findVendorsByBusinessNoDigitsList = async (...args) => {
      calls += 1;
      return calls === 1 ? [] : findVendorsByBusinessNoDigitsList(...args);
    };

    const result = await registerFixtureFile(viewer, hometax([{}]), "홈택스.xls", { findVendorsByBusinessNoDigitsList: lookup });

    expect(calls).toBe(2);
    expect(result).toMatchObject({ registered: 1, vendorCreated: 0, vendorRestored: 0 });
    expect(await db.select().from(evidenceRecords)).toMatchObject([{ vendorId: existing.id }]);
    expect(await db.select().from(evidenceImportBatches)).toHaveLength(1);
    expect(await vendorsByDigits(DIGITS)).toHaveLength(1);
  });

  it("같은 새 번호를 담은 두 파일을 동시에 등록하면 거래처는 하나이고 둘 다 성공한다", async () => {
    const viewer = await createIntakeViewer();

    const results = await Promise.all([
      registerFixtureFile(viewer, hometax([{ 승인번호: approvalNo(1) }]), "A.xls"),
      registerFixtureFile(viewer, hometax([{ 승인번호: approvalNo(2) }]), "B.xls"),
    ]);

    expect(results.map((result) => result.registered)).toEqual([1, 1]);
    expect(results.reduce((sum, result) => sum + result.vendorCreated, 0)).toBe(1);
    const created = await vendorsByDigits(DIGITS);
    expect(created).toHaveLength(1);
    expect((await db.select().from(evidenceRecords)).map((record) => record.vendorId)).toEqual([created[0]?.id, created[0]?.id]);
  });

  it("롯데(카드 서식) 줄의 사업자번호로는 거래처를 만들지 않고 vendor_id null", async () => {
    const viewer = await createIntakeViewer();

    const result = await registerFixtureFile(viewer, lotteFixture([{ 승인번호: "10000001" }]));

    expect(result).toMatchObject({ registered: 1, vendorCreated: 0, vendorRestored: 0 });
    expect(await db.select().from(evidenceRecords)).toMatchObject([{ businessNoDigits: DIGITS, vendorId: null }]);
    expect(await db.select().from(vendors)).toHaveLength(0);
  });

  it("같은 번호의 보관 거래처 둘 · 살아 있는 것 0이면 조회 순서 첫 보관 행 하나만 되살리고 생성 0", async () => {
    const first = await addVendor("공급회사가", FAKE_BUSINESS_NO, "supplier");
    await archive(SYSTEM_VIEWER, "vendor", first.id);
    const second = await addVendor("공급회사가 둘", DIGITS, "supplier");
    await archive(SYSTEM_VIEWER, "vendor", second.id);
    const viewer = await createIntakeViewer();

    const result = await registerFixtureFile(viewer, hometax([{}]));

    expect(result).toMatchObject({ registered: 1, vendorCreated: 0, vendorRestored: 1 });
    const byId = new Map((await vendorsByDigits(DIGITS)).map((row) => [row.id, row]));
    expect(byId.get(first.id)?.archivedAt).toBeNull();
    expect(byId.get(second.id)?.archivedAt).not.toBeNull();
    expect(await db.select().from(evidenceRecords)).toMatchObject([{ vendorId: first.id }]);
  });

  it("(D-6114) 거래처 관리 · 보관함 쓰기가 없는 등록 계급으로도 새 번호는 생성 · 보관 번호는 되살림 — 행동 로그 각 한 줄", async () => {
    const archived = await addVendor("보관회사", validBusinessNo(1), "supplier");
    await archive(SYSTEM_VIEWER, "vendor", archived.id);
    const viewer = await createIntakeViewer();
    expect(await can(viewer, "admin.vendors", "write")).toBe(false);
    expect(await can(viewer, "admin.archive", "write")).toBe(false);

    const result = await registerFixtureFile(viewer, hometax([{}, { 공급자사업자등록번호: validBusinessNo(1), 공급자상호: "보관회사" }]));

    expect(result).toMatchObject({ registered: 2, vendorCreated: 1, vendorRestored: 1 });
    expect(await vendorLogs("evidence_vendor_create")).toMatchObject([{ actorId: viewer.id }]);
    expect(await vendorLogs("evidence_vendor_restore")).toMatchObject([{ entityId: archived.id, actorId: viewer.id }]);
  });

  it("(E11) 등록한 파일의 거래처를 보관한 뒤 같은 파일을 다시 올리면 기록 0 · 되살림 0 · 복원 로그 0 · 결과 거래처 칸 모두 0", async () => {
    const viewer = await createIntakeViewer();
    const bytes = hometax([{}]);
    await registerFixtureFile(viewer, bytes);
    const [vendor] = await vendorsByDigits(DIGITS);
    if (!vendor) throw new Error("자동 생성 거래처 없음");
    await archive(SYSTEM_VIEWER, "vendor", vendor.id);

    const again = await registerFixtureFile(viewer, bytes);

    expect(again).toMatchObject({ registered: 0, skippedDuplicate: 1, sameFile: true, vendorCreated: 0, vendorRestored: 0, nameMismatchRest: 0 });
    expect(again.nameMismatchLines ?? []).toEqual([]);
    expect(await vendorLogs("evidence_vendor_restore")).toHaveLength(0);
    expect((await vendorsByDigits(DIGITS))[0]?.archivedAt).not.toBeNull();
  });

  it("(B-F14) 서로 다른 사업자번호 200개 파일 → 거래처 200 생성 · 거래처 조회 1회 · 5초 안", async () => {
    const viewer = await createIntakeViewer();
    const bytes = hometax(
      Array.from({ length: 200 }, (_, i) => ({ 공급자사업자등록번호: validBusinessNo(1_000 + i), 공급자상호: `공급${i}` })),
      { itemRows: 1 },
    );
    const lookup = vi.fn(findVendorsByBusinessNoDigitsList);

    const started = Date.now();
    const result = await registerFixtureFile(viewer, bytes, "홈택스_200.xls", { findVendorsByBusinessNoDigitsList: lookup });
    const elapsed = Date.now() - started;

    expect(result).toMatchObject({ registered: 200, vendorCreated: 200 });
    expect(lookup).toHaveBeenCalledTimes(1);
    expect(await db.select().from(vendors)).toHaveLength(200);
    expect(elapsed).toBeLessThan(5_000);
  });

  it("(eng B-P3) 거래처 잠금을 기다리는 사이 바깥에서 같은 열쇠 기록이 커밋되고 그 거래처가 보관되면 — 등록 0 · 이미 등록 1 · 되살림 0 · 복원 로그 0", async () => {
    const live = await addVendor("공급회사가", FAKE_BUSINESS_NO, "supplier");
    const viewer = await createIntakeViewer();
    const lockClient = new Client({ connectionString: process.env.DATABASE_URL });
    await lockClient.connect();
    let call: Promise<EvidenceImportSuccess> | undefined;
    try {
      const lockPid = await lockAutocreate(lockClient);
      call = registerFixtureFile(viewer, hometax([{}]), "A.xls");
      await waitUntilBlockedBy(lockClient, lockPid);

      const { rows } = await lockClient.query<{ id: string }>(
        `INSERT INTO evidence_import_batches (format, original_name, file_sha256, row_count, registered_count, skipped_duplicate_count, uploaded_by)
         VALUES ('hometax-tax-invoice', '바깥.xls', $1, 1, 1, 0, $2) RETURNING id`,
        ["0".repeat(64), viewer.id],
      );
      await lockClient.query(
        `INSERT INTO evidence_records (batch_id, format, evidence_type, approval_no, dedupe_key, issued_on, supply_krw, vat_krw, total_krw, business_no_digits, name_on_document, vendor_id, created_by)
         VALUES ($1, 'hometax-tax-invoice', 'tax_invoice', $2, $3, '2026-06-15', 100000, 10000, 110000, $4, '공급회사가', $5, $6)`,
        [rows[0]?.id, approvalNo(0), `hometax-tax-invoice|${approvalNo(0)}`, DIGITS, live.id, viewer.id],
      );
      await lockClient.query("UPDATE vendors SET archived_at = now(), archived_by = $2 WHERE id = $1", [live.id, viewer.id]);
      await lockClient.query("COMMIT");

      const result = await call;
      expect(result).toMatchObject({ registered: 0, skippedDuplicate: 1, vendorCreated: 0, vendorRestored: 0 });
      expect(await vendorLogs("evidence_vendor_restore")).toHaveLength(0);
      expect((await vendorsByDigits(DIGITS))[0]?.archivedAt).not.toBeNull();
    } finally {
      await lockClient.query("ROLLBACK").catch(() => {});
      await lockClient.end();
      await call?.catch(() => {});
    }
  }, 30_000);

  it(`(eng B-P3) 거래처 잠금을 lock_timeout보다 오래 쥐면 홈택스 등록은 「${LOCK_WAIT}」로 끝나고 아무것도 남지 않으며, 풀린 뒤 같은 파일은 성공한다`, async () => {
    const viewer = await createIntakeViewer();
    const bytes = hometax([{}]);
    const lockClient = new Client({ connectionString: process.env.DATABASE_URL });
    await lockClient.connect();
    try {
      await lockAutocreate(lockClient);

      await expect(registerFixtureFile(viewer, bytes)).rejects.toThrow(LOCK_WAIT);

      expect(await db.select().from(evidenceImportBatches)).toHaveLength(0);
      expect(await db.select().from(evidenceRecords)).toHaveLength(0);
      expect(await db.select().from(vendors)).toHaveLength(0);
    } finally {
      await lockClient.query("ROLLBACK").catch(() => {});
      await lockClient.end();
    }

    const retried = await registerFixtureFile(viewer, bytes);
    expect(retried).toMatchObject({ registered: 1, vendorCreated: 1, sameFile: false });
  }, 30_000);

  it(`서로 다른 번호 ${EVIDENCE_IMPORT_MAX_ROWS}줄 홈택스 파일 — 등록 · 거래처 생성 ${EVIDENCE_IMPORT_MAX_ROWS}(걸린 시간은 테스트 meta registerMs)`, async ({ task }) => {
    const viewer = await createIntakeViewer();
    const rows = Array.from({ length: EVIDENCE_IMPORT_MAX_ROWS }, (_, i) => ({ 공급자사업자등록번호: validBusinessNo(10_000 + i), 공급자상호: `공급${i}` }));
    // CSV — 같은 3000줄을 xlsx로 쓰면 1.2MB · xls 2.4MB라 크기 상한을 넘는다(실측). CSV는 0.9MB.
    const bytes = hometax(rows, { as: "csv-utf8", itemRows: 1 });
    expect(bytes.length).toBeLessThanOrEqual(EVIDENCE_IMPORT_MAX_BYTES);

    const started = Date.now();
    const result = await registerFixtureFile(viewer, bytes, "홈택스_3000.xlsx");
    Object.assign(task.meta, { registerMs: Date.now() - started });

    expect(result).toMatchObject({ registered: EVIDENCE_IMPORT_MAX_ROWS, vendorCreated: EVIDENCE_IMPORT_MAX_ROWS });
  }, 180_000);
});
