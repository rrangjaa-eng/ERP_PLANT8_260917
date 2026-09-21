import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { db } from "@/db/client";
import { vendors, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { upsertVisibility, upsertPermission } from "@/repositories/permissions";
import { recordAction } from "@/domain/action-log/record";
import { queryActionLog } from "@/repositories/action-log";
import { archive, restore } from "@/domain/archive";
import {
  listVendors,
  searchVendors,
  createVendor,
  updateVendor,
  setVendorHidden,
  revealAccountNumber,
  normalizeVendorName,
  ForbiddenError,
} from "@/domain/vendors";

const REVEAL_ITEM = "vendor.account_number_unmasked";

function uniqueName(): string {
  return `거래처-${randomUUID()}`;
}

// action_log.actor_id가 users.id에 FK를 걸므로, 실제로 recordAction까지
// 도달하는 pmViewer는 진짜 users 행이 있어야 한다(corp-cards.test.ts의
// makeTestUser와 같은 패턴).
async function makeTestPmViewer(): Promise<{ id: string; roleId: string }> {
  const id = `vendor-pm-${randomUUID()}`;
  await db.insert(users).values({ id, name: "거래처 테스터", email: `${randomUUID()}@test.local`, roleId: DEFAULT_ROLE_ID });
  return { id, roleId: DEFAULT_ROLE_ID };
}

// queryActionLog는 entityId 필터를 지원하지 않는다(actorId·actionType·
// documentId·from·to만) — actionType으로 좁힌 뒤 entityId는 클라이언트에서
// 다시 거른다.
async function countMaskRevealLogs(vendorId: string): Promise<number> {
  const rows = await queryActionLog(SYSTEM_VIEWER, { actionType: "mask_reveal" });
  return rows.filter((row) => row.entityId === vendorId).length;
}

describe("vendors (MAST-01, 실제 Postgres)", () => {
  it("등록 후 DB의 계좌번호 컬럼이 평문을 담지 않고, 암호문 형식(v1: 또는 v2:)을 따른다", async () => {
    const plaintext = "110-222-333444";
    const { vendor } = await createVendor(SYSTEM_VIEWER, {
      name: uniqueName(),
      accountBank: "국민",
      accountHolder: "홍길동",
      accountNumber: plaintext,
    });

    const [row] = await db.select().from(vendors).where(eq(vendors.id, vendor.id)).limit(1);
    expect(row?.accountNumberEncrypted).not.toBeNull();
    expect(row?.accountNumberEncrypted).not.toBe(plaintext);
    expect(row?.accountNumberEncrypted).not.toContain(plaintext);
    expect(row?.accountNumberEncrypted?.startsWith("v1:") || row?.accountNumberEncrypted?.startsWith("v2:")).toBe(
      true,
    );
  });

  it("뒤 4자리 컬럼이 채워진다", async () => {
    const plaintext = "110-222-339999";
    const { vendor } = await createVendor(SYSTEM_VIEWER, { name: uniqueName(), accountNumber: plaintext });
    expect(vendor.accountNumberLast4).toBe("9999");
  });

  it("계좌번호가 없는 거래처의 마스킹이 빈 문자열이고, 해제 시도가 기록·복호화 없이 끝난다", async () => {
    const { vendor } = await createVendor(SYSTEM_VIEWER, { name: uniqueName() });
    expect(vendor.accountNumberLast4).toBeNull();

    const before = await countMaskRevealLogs(vendor.id);
    const revealed = await revealAccountNumber(SYSTEM_VIEWER, vendor.id);
    expect(revealed).toBe("");
    const after = await countMaskRevealLogs(vendor.id);
    expect(after).toBe(before);
  });

  it("같은 이름의 거래처 둘이 자동완성에 둘 다 나온다 — 하나로 합쳐지지 않는다", async () => {
    const name = uniqueName();
    const a = await createVendor(SYSTEM_VIEWER, { name, businessNo: "111-11-11111" });
    const b = await createVendor(SYSTEM_VIEWER, { name, businessNo: "222-22-22222" });

    const results = await searchVendors(SYSTEM_VIEWER, name, 10);
    const ids = results.map((r) => r.id);
    expect(ids).toContain(a.vendor.id);
    expect(ids).toContain(b.vendor.id);
  });

  it("조합형(NFD)으로 적은 검색어가 완성형(NFC)으로 저장된 이름과 일치한다", async () => {
    const suffix = randomUUID().slice(0, 8);
    const nfcName = `삼성전자-${suffix}`.normalize("NFC");
    const { vendor } = await createVendor(SYSTEM_VIEWER, { name: nfcName });

    const nfdQuery = nfcName.normalize("NFD");
    expect(nfdQuery).not.toBe(nfcName); // 조합형과 완성형이 실제로 다른 바이트 시퀀스인지 확인

    const results = await searchVendors(SYSTEM_VIEWER, nfdQuery, 10);
    expect(results.some((r) => r.id === vendor.id)).toBe(true);
  });

  it("normalizeVendorName이 NFC 정규화 + 소문자로 낮춘다", () => {
    expect(normalizeVendorName("ABC Vendor")).toBe("abc vendor");
    expect(normalizeVendorName(" 공백거래처 ")).toBe("공백거래처");
  });

  it("일치 점수가 같은 항목들의 순서가 두 번 조회에서 같다(결정적 정렬)", async () => {
    const suffix = randomUUID().slice(0, 8);
    const shared = `공통접두어-${suffix}`;
    await createVendor(SYSTEM_VIEWER, { name: `${shared}-가` });
    await createVendor(SYSTEM_VIEWER, { name: `${shared}-나` });
    await createVendor(SYSTEM_VIEWER, { name: `${shared}-다` });

    const first = await searchVendors(SYSTEM_VIEWER, shared, 10);
    const second = await searchVendors(SYSTEM_VIEWER, shared, 10);
    expect(first.map((r) => r.id)).toEqual(second.map((r) => r.id));
  });

  it("마스킹 해제가 권한 없는 계급에서 거부되고 기록이 남지 않는다", async () => {
    const plaintext = "110-222-345678";
    const { vendor } = await createVendor(SYSTEM_VIEWER, { name: uniqueName(), accountNumber: plaintext });
    const pmViewer = { id: `vendor-pm-${randomUUID()}`, roleId: DEFAULT_ROLE_ID };

    const before = await countMaskRevealLogs(vendor.id);
    await expect(revealAccountNumber(pmViewer, vendor.id)).rejects.toBeInstanceOf(ForbiddenError);
    const after = await countMaskRevealLogs(vendor.id);
    expect(after).toBe(before);
  });

  it("마스킹 해제가 권한 있는 계급에서 평문을 돌려주고 기록을 남긴다", async () => {
    const plaintext = "110-222-349876";
    const { vendor } = await createVendor(SYSTEM_VIEWER, { name: uniqueName(), accountNumber: plaintext });
    const pmViewer = await makeTestPmViewer();
    await upsertVisibility(SYSTEM_VIEWER, { roleId: DEFAULT_ROLE_ID, infoItem: REVEAL_ITEM, visible: true });

    const before = await countMaskRevealLogs(vendor.id);
    const revealed = await revealAccountNumber(pmViewer, vendor.id);
    expect(revealed).toBe(plaintext);
    const after = await countMaskRevealLogs(vendor.id);
    expect(after).toBe(before + 1);

    // 원상복구 — 다른 테스트에 영향을 주지 않는다.
    await upsertVisibility(SYSTEM_VIEWER, { roleId: DEFAULT_ROLE_ID, infoItem: REVEAL_ITEM, visible: false });
  });

  it("설정 조회를 throw로 스텁해도 해제 기록이 남는다 — mask_reveal은 끌 수 없는 종류라 조회 자체가 없다", async () => {
    const plaintext = "110-222-341111";
    const { vendor } = await createVendor(SYSTEM_VIEWER, { name: uniqueName(), accountNumber: plaintext });

    const before = await countMaskRevealLogs(vendor.id);
    const revealed = await revealAccountNumber(SYSTEM_VIEWER, vendor.id, {
      recordAction: (viewer, entry) =>
        recordAction(viewer, entry, {
          isActionTypeEnabled: () => {
            throw new Error("mask_reveal은 항상 켬 종류라 설정 조회를 부르면 안 된다");
          },
        }),
    });
    expect(revealed).toBe(plaintext);
    const after = await countMaskRevealLogs(vendor.id);
    expect(after).toBe(before + 1);
  });

  it("숨김 항목이 기본 목록·자동완성에서 빠진다", async () => {
    const name = uniqueName();
    const { vendor } = await createVendor(SYSTEM_VIEWER, { name });
    await setVendorHidden(SYSTEM_VIEWER, vendor.id, true);

    const list = await listVendors(SYSTEM_VIEWER);
    expect(list.some((v) => v.id === vendor.id)).toBe(false);

    const listWithHidden = await listVendors(SYSTEM_VIEWER, { includeHidden: true });
    expect(listWithHidden.some((v) => v.id === vendor.id)).toBe(true);

    const search = await searchVendors(SYSTEM_VIEWER, name, 10);
    expect(search.some((v) => v.id === vendor.id)).toBe(false);
  });

  it("동시 갱신 후 암호문이 복호화 가능하다 — 컬럼을 통째로 교체해 섞이지 않는다", async () => {
    const { vendor } = await createVendor(SYSTEM_VIEWER, {
      name: uniqueName(),
      accountNumber: "110-222-340000",
    });

    const valueA = "999-888-770001";
    const valueB = "999-888-770002";
    await Promise.all([
      updateVendor(SYSTEM_VIEWER, vendor.id, { name: vendor.name, accountNumber: valueA }),
      updateVendor(SYSTEM_VIEWER, vendor.id, { name: vendor.name, accountNumber: valueB }),
    ]);

    await upsertVisibility(SYSTEM_VIEWER, { roleId: "role-sysadmin", infoItem: REVEAL_ITEM, visible: true });
    const revealed = await revealAccountNumber(SYSTEM_VIEWER, vendor.id);
    expect([valueA, valueB]).toContain(revealed);
  });

  it("보관 후 기본 조회에서 빠지고 복원하면 다시 보인다", async () => {
    const { vendor } = await createVendor(SYSTEM_VIEWER, { name: uniqueName() });
    await archive(SYSTEM_VIEWER, "vendor", vendor.id);

    await restore(SYSTEM_VIEWER, "vendor", vendor.id);
    const list = await listVendors(SYSTEM_VIEWER);
    expect(list.some((v) => v.id === vendor.id)).toBe(true);
  });

  it("거래처 메뉴 쓰기 권한이 없는 계급은 거래처를 등록할 수 없다", async () => {
    const pmViewer = { id: `vendor-pm-write-${randomUUID()}`, roleId: DEFAULT_ROLE_ID };
    await expect(createVendor(pmViewer, { name: uniqueName() })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("거래처 Dto의 키 집합에 평문 계좌번호 필드가 없다", async () => {
    const { vendor } = await createVendor(SYSTEM_VIEWER, {
      name: uniqueName(),
      accountNumber: "110-222-349999",
    });
    const keys = Object.keys(vendor);
    expect(keys).not.toContain("accountNumber");
    expect(keys).not.toContain("accountNumberEncrypted");
    expect(keys).toContain("accountNumberLast4");
  });

  // 결함 3: updateVendor가 document_create를 재사용해 수정을 생성처럼 남겼다
  // (독립 감사 실측 — 수정 8건이 document_create 9건으로 보였다). 수정은
  // document_update로, document_create로는 남지 않아야 한다.
  it("거래처 수정은 document_update로 기록되고 document_create를 추가로 남기지 않는다(결함 3)", async () => {
    const { vendor } = await createVendor(SYSTEM_VIEWER, { name: uniqueName() });

    const createRowsBefore = await queryActionLog(SYSTEM_VIEWER, { actionType: "document_create" });
    const updateRowsBefore = await queryActionLog(SYSTEM_VIEWER, { actionType: "document_update" });

    await updateVendor(SYSTEM_VIEWER, vendor.id, { name: `${vendor.name}-수정` });

    const createRowsAfter = await queryActionLog(SYSTEM_VIEWER, { actionType: "document_create" });
    const updateRowsAfter = await queryActionLog(SYSTEM_VIEWER, { actionType: "document_update" });

    // 생성 종류 행 수는 그대로다 — 수정이 생성으로 잘못 잡히지 않는다.
    expect(createRowsAfter.length).toBe(createRowsBefore.length);
    // 수정 종류 행이 이 거래처를 대상으로 하나 늘었다.
    const newUpdateRows = updateRowsAfter.filter(
      (row) => row.entityId === vendor.id && !updateRowsBefore.some((before) => before.seq === row.seq),
    );
    expect(newUpdateRows.length).toBe(1);
  });

  // 권한표 판정이 실제로 도는지 확인 — upsertPermission을 직접 부르는 것
  // 자체가 뷰용 픽스처가 아니라 이 테스트의 게이트 대상이다.
  it("권한표에서 기본 계급의 거래처 보기 칸을 켜면 같은 viewer의 목록 조회가 성공한다", async () => {
    const pmViewer = { id: `vendor-pm-view-${randomUUID()}`, roleId: DEFAULT_ROLE_ID };
    const before = await listVendors(pmViewer);
    expect(before).toEqual([]);

    await upsertPermission(SYSTEM_VIEWER, { roleId: DEFAULT_ROLE_ID, menu: "admin.vendors", action: "view", allowed: true });

    const { vendor } = await createVendor(SYSTEM_VIEWER, { name: uniqueName() });
    const after = await listVendors(pmViewer);
    expect(after.some((v) => v.id === vendor.id)).toBe(true);

    await upsertPermission(SYSTEM_VIEWER, { roleId: DEFAULT_ROLE_ID, menu: "admin.vendors", action: "view", allowed: false });
  });
});
