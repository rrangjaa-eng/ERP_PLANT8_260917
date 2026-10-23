import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { db } from "@/db/client";
import { vendors, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { Pool } from "pg";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { upsertVisibility, upsertPermission } from "@/repositories/permissions";
import { recordAction } from "@/domain/action-log/record";
import { queryActionLog } from "@/repositories/action-log";
import { archive, listArchive, restore } from "@/domain/archive";
import { insertRole } from "@/repositories/roles";
import {
  listVendors,
  searchVendors,
  createVendor,
  updateVendor,
  setVendorHidden,
  revealAccountNumber,
  normalizeVendorName,
  addVendorKind,
  ArchivedVendorError,
  DuplicateBusinessNoError,
  InvalidBusinessNoError,
  ForbiddenError,
  VendorVersionConflictError,
  PaymentTermDaysError,
} from "@/domain/vendors";

import { AccountFieldsError } from "@/domain/vendors/account-fields";
import {
  insertVendor,
  listPaymentTermDays,
  updateVendor as repoUpdateVendor,
  updateVendorAccountNumber as repoUpdateVendorAccountNumber,
  setVendorHidden as repoSetVendorHidden,
  setVendorArchived as repoSetVendorArchived,
} from "@/repositories/vendors";

const REVEAL_ITEM = "vendor.account_number_unmasked";

// 사업자번호 마지막 검증 숫자 — 앞 아홉 자리로 셈한다(domain 규칙과 같은 셈을 테스트가 따로 쓴다).
function checkDigit(nine: string): number {
  const weights = [1, 3, 7, 1, 3, 7, 1, 3, 5];
  let sum = nine.split("").reduce((acc, ch, i) => acc + Number(ch) * (weights[i] ?? 0), 0);
  sum += Math.floor((Number(nine[8]) * 5) / 10);
  return (10 - (sum % 10)) % 10;
}

// 실행마다 고유한 사업자번호 — 같은 DB를 다시 써도 겹치지 않는다(「xxx-xx-xxxxx」).
function uniqueBizNo(): string {
  const base = String(Math.floor(Math.random() * 900_000_000) + 100_000_000);
  const digits = base + checkDigit(base);
  return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
}

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
    const a = await createVendor(SYSTEM_VIEWER, { name, businessNo: uniqueBizNo() });
    const b = await createVendor(SYSTEM_VIEWER, { name, businessNo: uniqueBizNo() });

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
    // 07-20 C-35: 하이픈 · 공백을 지운 숫자로 저장한다.
    expect(revealed).toBe(plaintext.replaceAll("-", ""));
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
    expect(revealed).toBe(plaintext.replaceAll("-", ""));
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

    // 07-20 C-35: 저장은 숫자만이라 숫자로 비교한다.
    const valueA = "999888770001";
    const valueB = "999888770002";
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

describe("vendors 사업자번호 중복 막기 (실제 Postgres)", () => {
  async function countByName(name: string): Promise<number> {
    return (await db.select().from(vendors).where(eq(vendors.name, name))).length;
  }

  it("같은 숫자 번호(하이픈 다름)로 등록하면 막히고 행이 늘지 않는다", async () => {
    const no = uniqueBizNo();
    const { vendor } = await createVendor(SYSTEM_VIEWER, { name: uniqueName(), businessNo: no });
    const name = uniqueName();
    const error = await createVendor(SYSTEM_VIEWER, { name, businessNo: no.replaceAll("-", "") }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DuplicateBusinessNoError);
    expect((error as DuplicateBusinessNoError).existing).toMatchObject({ id: vendor.id, name: vendor.name, hidden: false, archived: false });
    expect(await countByName(name)).toBe(0);
  });

  it("다른 번호 · 번호 없음 둘은 통과한다", async () => {
    await createVendor(SYSTEM_VIEWER, { name: uniqueName(), businessNo: uniqueBizNo() });
    await createVendor(SYSTEM_VIEWER, { name: uniqueName(), businessNo: uniqueBizNo() });
    await createVendor(SYSTEM_VIEWER, { name: uniqueName() });
    await createVendor(SYSTEM_VIEWER, { name: uniqueName() });
    await createVendor(SYSTEM_VIEWER, { name: uniqueName(), businessNo: "" });
  });

  it("숨긴 거래처와 같은 번호도 막힌다", async () => {
    const no = uniqueBizNo();
    const { vendor } = await createVendor(SYSTEM_VIEWER, { name: uniqueName(), businessNo: no });
    await setVendorHidden(SYSTEM_VIEWER, vendor.id, true);
    const error = await createVendor(SYSTEM_VIEWER, { name: uniqueName(), businessNo: no }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DuplicateBusinessNoError);
    expect((error as DuplicateBusinessNoError).existing).toMatchObject({ id: vendor.id, hidden: true, archived: false });
  });

  it("숨긴 거래처는 다른 갈래로만 있어도 「구분 더하기」 대신 그 거래처 열기다(계획 §8)", async () => {
    const no = uniqueBizNo();
    const { vendor } = await createVendor(SYSTEM_VIEWER, { name: uniqueName(), businessNo: no, kind: "client" });
    await setVendorHidden(SYSTEM_VIEWER, vendor.id, true);
    const error = await createVendor(SYSTEM_VIEWER, { name: uniqueName(), businessNo: no, kind: "supplier" }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DuplicateBusinessNoError);
    expect((error as DuplicateBusinessNoError).addSide).toBeNull();
    expect((error as DuplicateBusinessNoError).message).toBe(`같은 사업자번호 거래처 있음 · ${vendor.name}(숨김)`);
  });

  it("보관된 거래처와 같은 번호도 막히고 보관됨으로 알린다", async () => {
    const no = uniqueBizNo();
    const { vendor } = await createVendor(SYSTEM_VIEWER, { name: uniqueName(), businessNo: no });
    await archive(SYSTEM_VIEWER, "vendor", vendor.id);
    const error = await createVendor(SYSTEM_VIEWER, { name: uniqueName(), businessNo: no }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DuplicateBusinessNoError);
    expect((error as DuplicateBusinessNoError).existing).toMatchObject({ id: vendor.id, archived: true });
    expect((error as DuplicateBusinessNoError).addSide).toBeNull();
  });

  it("다른 갈래로만 있으면 더할 갈래를 알린다", async () => {
    const no = uniqueBizNo();
    await createVendor(SYSTEM_VIEWER, { name: uniqueName(), businessNo: no, kind: "client" });
    const error = await createVendor(SYSTEM_VIEWER, { name: uniqueName(), businessNo: no, kind: "supplier" }).catch((e: unknown) => e);
    expect((error as DuplicateBusinessNoError).addSide).toBe("supplier");
    const covered = await createVendor(SYSTEM_VIEWER, { name: uniqueName(), businessNo: no, kind: "client" }).catch((e: unknown) => e);
    expect((covered as DuplicateBusinessNoError).addSide).toBeNull();
  });

  it("「거래처 정보」를 못 보는 사람에게는 기존 거래처의 이름 · id · 숨김 · 보관 · 더할 갈래를 싣지 않는다", async () => {
    const no = uniqueBizNo();
    await createVendor(SYSTEM_VIEWER, { name: uniqueName(), businessNo: no, kind: "client" });
    const blind = { id: `vendor-blind-${randomUUID()}`, roleId: DEFAULT_ROLE_ID };
    await upsertVisibility(SYSTEM_VIEWER, { roleId: DEFAULT_ROLE_ID, infoItem: "vendor.value", visible: false });
    const error = await createVendor(blind, { name: uniqueName(), businessNo: no, kind: "supplier" }, { can: () => Promise.resolve(true) }).catch((e: unknown) => e);
    await upsertVisibility(SYSTEM_VIEWER, { roleId: DEFAULT_ROLE_ID, infoItem: "vendor.value", visible: true });
    expect(error).toBeInstanceOf(DuplicateBusinessNoError);
    expect((error as DuplicateBusinessNoError).existing).toBeNull();
    expect((error as DuplicateBusinessNoError).addSide).toBeNull();
    expect((error as DuplicateBusinessNoError).message).toBe("같은 사업자번호 거래처 있음");
  });

  it("수정 — 자기 번호 그대로는 통과하고 남의 번호(보관 포함)로 바꾸면 막힌다", async () => {
    const mine = uniqueBizNo();
    const other = uniqueBizNo();
    const archivedNo = uniqueBizNo();
    const a = await createVendor(SYSTEM_VIEWER, { name: uniqueName(), businessNo: mine });
    const b = await createVendor(SYSTEM_VIEWER, { name: uniqueName(), businessNo: other });
    const c = await createVendor(SYSTEM_VIEWER, { name: uniqueName(), businessNo: archivedNo });
    await archive(SYSTEM_VIEWER, "vendor", c.vendor.id);

    await updateVendor(SYSTEM_VIEWER, a.vendor.id, { name: `${a.vendor.name}-수정`, businessNo: mine.replaceAll("-", "") });
    await expect(updateVendor(SYSTEM_VIEWER, a.vendor.id, { name: a.vendor.name, businessNo: other })).rejects.toBeInstanceOf(DuplicateBusinessNoError);
    await expect(updateVendor(SYSTEM_VIEWER, a.vendor.id, { name: a.vendor.name, businessNo: archivedNo })).rejects.toBeInstanceOf(DuplicateBusinessNoError);
    await expect(
      updateVendor(SYSTEM_VIEWER, a.vendor.id, { name: a.vendor.name, businessNo: other, customFields: {} }),
    ).rejects.toBeInstanceOf(DuplicateBusinessNoError);
    const [row] = await db.select().from(vendors).where(eq(vendors.id, a.vendor.id));
    expect(row?.businessNo).toBe(mine.replaceAll("-", ""));
    expect(b.vendor.businessNo).toBe(other);
  });

  it("수정 — 저장된 숫자 번호가 그대로면 같은 번호의 보관된 거래처가 있어도 이름 · 계좌만 고쳐 저장된다", async () => {
    const no = uniqueBizNo();
    const { vendor: a } = await createVendor(SYSTEM_VIEWER, { name: uniqueName(), businessNo: no });
    // 선검사는 보관 행도 막는다 — 숫자가 그대로면 선검사를 건너뛰는지 보관된 같은 번호로 본다(살아 있는 중복은 유일 색인이 막는다).
    const [twin] = await db
      .insert(vendors)
      .values({ name: uniqueName(), normalizedName: uniqueName(), businessNo: no.replaceAll("-", ""), archivedAt: new Date() })
      .returning();
    const renamed = `${a.name}-고침`;
    await updateVendor(SYSTEM_VIEWER, a.id, { name: renamed, businessNo: no.replaceAll("-", ""), accountBank: "국민" });
    const [row] = await db.select().from(vendors).where(eq(vendors.id, a.id));
    expect(row?.name).toBe(renamed);
    // 숫자가 바뀌면 여전히 막는다.
    const other = uniqueBizNo();
    await createVendor(SYSTEM_VIEWER, { name: uniqueName(), businessNo: other });
    await expect(updateVendor(SYSTEM_VIEWER, a.id, { name: renamed, businessNo: other })).rejects.toBeInstanceOf(DuplicateBusinessNoError);
    await db.delete(vendors).where(eq(vendors.id, twin?.id ?? ""));
  });

  it("보관함 보기 권한이 없는 사람에게는 보관된 거래처 이름 · id를 싣지 않고 문구만 준다", async () => {
    const no = uniqueBizNo();
    const { vendor } = await createVendor(SYSTEM_VIEWER, { name: uniqueName(), businessNo: no });
    await archive(SYSTEM_VIEWER, "vendor", vendor.id);
    const noArchiveView = (_viewer: unknown, menu: string) => Promise.resolve(menu !== "admin.archive");
    const error = await createVendor(SYSTEM_VIEWER, { name: uniqueName(), businessNo: no }, { can: noArchiveView }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DuplicateBusinessNoError);
    expect((error as DuplicateBusinessNoError).existing).toBeNull();
    expect((error as DuplicateBusinessNoError).message).toBe("보관함에 같은 사업자번호 거래처 있음");
  });

  it("addVendorKind — 갈래만 켜고 로그 1건, 이미 덮으면 그대로, 보관이면 막는다", async () => {
    const pm = await makeTestPmViewer();
    await upsertPermission(SYSTEM_VIEWER, { roleId: DEFAULT_ROLE_ID, menu: "admin.vendors", action: "write", allowed: true });
    const bizNo = uniqueBizNo();
    const { vendor } = await createVendor(SYSTEM_VIEWER, { name: uniqueName(), businessNo: bizNo, kind: "supplier" });

    const logsBefore = (await queryActionLog(SYSTEM_VIEWER, { actionType: "document_update" })).filter((row) => row.entityId === vendor.id).length;
    const added = await addVendorKind(pm, vendor.id, "client", bizNo);
    expect(added?.kind).toBe("both");
    const logsAfter = (await queryActionLog(SYSTEM_VIEWER, { actionType: "document_update" })).filter((row) => row.entityId === vendor.id).length;
    expect(logsAfter - logsBefore).toBe(1);

    const again = await addVendorKind(pm, vendor.id, "supplier", bizNo);
    expect(again?.kind).toBe("both");
    const logsSame = (await queryActionLog(SYSTEM_VIEWER, { actionType: "document_update" })).filter((row) => row.entityId === vendor.id).length;
    expect(logsSame).toBe(logsAfter);

    await archive(SYSTEM_VIEWER, "vendor", vendor.id);
    await expect(addVendorKind(pm, vendor.id, "client", bizNo)).rejects.toBeInstanceOf(ArchivedVendorError);
    await upsertPermission(SYSTEM_VIEWER, { roleId: DEFAULT_ROLE_ID, menu: "admin.vendors", action: "write", allowed: false });
  });

  it("같은 번호의 다른 거래처가 보관돼 있을 뿐이면 복원된다(살아 있는 거래처만 막는다)", async () => {
    const no = uniqueBizNo();
    const { vendor: a } = await createVendor(SYSTEM_VIEWER, { name: uniqueName(), businessNo: no });
    await archive(SYSTEM_VIEWER, "vendor", a.id);
    const peerName = uniqueName();
    await db.insert(vendors).values({ name: peerName, normalizedName: peerName, businessNo: no, archivedAt: new Date() });

    await restore(SYSTEM_VIEWER, "vendor", a.id);

    const [row] = await db.select().from(vendors).where(eq(vendors.id, a.id));
    expect(row?.archivedAt).toBeNull();
  });

  it("addVendorKind — 그 사이 번호가 바뀌었거나 숨겨진 거래처는 갈래를 바꾸지 않는다", async () => {
    const pm = await makeTestPmViewer();
    await upsertPermission(SYSTEM_VIEWER, { roleId: DEFAULT_ROLE_ID, menu: "admin.vendors", action: "write", allowed: true });
    const no = uniqueBizNo();
    const { vendor } = await createVendor(SYSTEM_VIEWER, { name: uniqueName(), businessNo: no, kind: "supplier" });

    await expect(addVendorKind(pm, vendor.id, "client", uniqueBizNo())).rejects.toThrow("같은 사업자번호 거래처 아님");
    await db.update(vendors).set({ hidden: true }).where(eq(vendors.id, vendor.id));
    await expect(addVendorKind(pm, vendor.id, "client", no)).rejects.toThrow("같은 사업자번호 거래처 아님");

    const [row] = await db.select().from(vendors).where(eq(vendors.id, vendor.id));
    expect(row?.kind).toBe("supplier");
    await upsertPermission(SYSTEM_VIEWER, { roleId: DEFAULT_ROLE_ID, menu: "admin.vendors", action: "write", allowed: false });
  });

  it("보관함 목록 — 같은 번호의 살아 있는 거래처가 생긴 보관 행은 복원 불가로 표시한다", async () => {
    const no = uniqueBizNo();
    const { vendor: a } = await createVendor(SYSTEM_VIEWER, { name: uniqueName(), businessNo: no });
    const { vendor: free } = await createVendor(SYSTEM_VIEWER, { name: uniqueName(), businessNo: uniqueBizNo() });
    await archive(SYSTEM_VIEWER, "vendor", a.id);
    await archive(SYSTEM_VIEWER, "vendor", free.id);
    // 색인 전(PR A)에는 같은 번호의 살아 있는 행을 선검사 없이 직접 넣어 목록 판정만 확인한다.
    const [taker] = await db.insert(vendors).values({ name: uniqueName(), normalizedName: uniqueName(), businessNo: no.replaceAll("-", "") }).returning();

    const rows = await listArchive(SYSTEM_VIEWER);
    expect(rows.find((row) => row.id === a.id)?.restorable).toBe(false);
    expect(rows.find((row) => row.id === free.id)?.restorable).toBe(true);
    await db.delete(vendors).where(eq(vendors.id, taker?.id ?? ""));
  });

  it("동시 등록 둘(같은 숫자 번호) — 선검사를 둘 다 지나도 유일 색인이 하나만 남기고 다른 하나는 DuplicateBusinessNoError", async () => {
    const no = uniqueBizNo();
    // 다른 연결이 vendors에 SHARE 잠금을 쥐고 있으면 두 등록이 선검사(읽기)는 지나고 INSERT에서 멈춘다 — 경합을 매번 만든다.
    const holder = new Pool({ connectionString: process.env.DATABASE_URL ?? "postgres://erp:erp@127.0.0.1:5432/erp_test" });
    const client = await holder.connect();
    try {
      await client.query("BEGIN");
      await client.query("LOCK TABLE vendors IN SHARE MODE");
      const both = Promise.allSettled([
        createVendor(SYSTEM_VIEWER, { name: uniqueName(), businessNo: no }),
        createVendor(SYSTEM_VIEWER, { name: uniqueName(), businessNo: no.replaceAll("-", "") }),
      ]);
      for (let waited = 0; ; waited += 50) {
        const { rows } = await client.query<{ n: number }>(
          "SELECT count(*)::int AS n FROM pg_locks WHERE database = (SELECT oid FROM pg_database WHERE datname = current_database()) AND relation = 'vendors'::regclass AND NOT granted",
        );
        if ((rows[0]?.n ?? 0) >= 2) break;
        if (waited > 3_000) throw new Error("두 등록이 INSERT 잠금 대기에 들어가지 않았다");
        await new Promise((done) => setTimeout(done, 50));
      }
      await client.query("COMMIT");
      const results = await both;
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      const rejected = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
      expect(rejected).toHaveLength(1);
      expect(rejected[0]?.reason).toBeInstanceOf(DuplicateBusinessNoError);
    } finally {
      client.release();
      await holder.end();
    }
  });
});

describe("vendors 사업자번호 10자리 · 검증 숫자 (실제 Postgres)", () => {
  async function countByName(name: string): Promise<number> {
    return (await db.select().from(vendors).where(eq(vendors.name, name))).length;
  }

  it("등록 — 검증 숫자가 틀리면 InvalidBusinessNoError이고 저장되지 않는다", async () => {
    const name = uniqueName();
    const good = uniqueBizNo().replaceAll("-", "");
    const bad = good.slice(0, 9) + String((Number(good[9]) + 1) % 10);
    const error = await createVendor(SYSTEM_VIEWER, { name, businessNo: bad }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(InvalidBusinessNoError);
    expect((error as Error).message).toBe("사업자 번호 확인 · 다시 입력");
    expect(await countByName(name)).toBe(0);
  });

  it("등록 — 열 자리가 아니거나 숫자가 없으면 막는다", async () => {
    await expect(createVendor(SYSTEM_VIEWER, { name: uniqueName(), businessNo: "123-45-6789" })).rejects.toBeInstanceOf(InvalidBusinessNoError);
    await expect(createVendor(SYSTEM_VIEWER, { name: uniqueName(), businessNo: "---" })).rejects.toBeInstanceOf(InvalidBusinessNoError);
  });

  it("수정 — 숫자를 틀린 번호로 바꾸면 막는다", async () => {
    const { vendor } = await createVendor(SYSTEM_VIEWER, { name: uniqueName(), businessNo: uniqueBizNo() });
    await expect(updateVendor(SYSTEM_VIEWER, vendor.id, { name: vendor.name, businessNo: "214-86-10231" })).rejects.toBeInstanceOf(InvalidBusinessNoError);
  });

  it("수정 — 저장된 번호가 틀려도 숫자를 안 바꾸면 이름만 고쳐 저장된다", async () => {
    const name = uniqueName();
    const [row] = await db.insert(vendors).values({ name, normalizedName: name, businessNo: "2148610231" }).returning();
    await updateVendor(SYSTEM_VIEWER, row!.id, { name: `${name}-고침`, businessNo: "214-86-10231" });
    const [after] = await db.select().from(vendors).where(eq(vendors.id, row!.id));
    expect(after?.name).toBe(`${name}-고침`);
  });
});

// 06.5-04(D-6506 · REVIEWS DH-3 · EP2-B9): 계좌 칸을 새로 넣거나 바꾼 저장만 서버가 판정한다 — 저장 결과와 같은 실효값으로, 첫 쓰기 전에.
describe("계좌 칸 저장 판정(06.5 D-6506 · DH-3)", () => {
  async function fieldErrorsOf(promise: Promise<unknown>): Promise<Record<string, string>> {
    try {
      await promise;
    } catch (error) {
      if (error instanceof AccountFieldsError) return { ...error.fieldErrors };
      throw error;
    }
    throw new Error("AccountFieldsError가 나지 않았다");
  }

  async function rowsNamed(name: string) {
    return db.select().from(vendors).where(eq(vendors.name, name));
  }

  it("등록 — 은행 + 번호 + 예금주 없음은 거절되고 행이 생기지 않는다", async () => {
    const name = uniqueName();
    expect(await fieldErrorsOf(createVendor(SYSTEM_VIEWER, { name, accountBank: "신한", accountNumber: "110-222-330001" }))).toEqual({
      accountHolder: "예금주 없음 · 예금주 적기",
    });
    expect(await rowsNamed(name)).toEqual([]);
  });

  it("등록 — 은행만 · 번호만은 생성된다", async () => {
    await expect(createVendor(SYSTEM_VIEWER, { name: uniqueName(), accountBank: "신한" })).resolves.toBeTruthy();
    await expect(createVendor(SYSTEM_VIEWER, { name: uniqueName(), accountNumber: "110-222-330002" })).resolves.toBeTruthy();
  });

  it("등록 — 코드로 안 풀리는 은행 이름은 거절", async () => {
    const name = uniqueName();
    expect(await fieldErrorsOf(createVendor(SYSTEM_VIEWER, { name, accountBank: "없는은행" }))).toEqual({
      accountBank: "은행 코드 없음 · 은행 이름 고치기",
    });
    expect(await rowsNamed(name)).toEqual([]);
  });

  it("수정 — 예금주만 지운 저장(keep)은 거절되고 이름 등 본문도 그대로(반쯤 저장 0)", async () => {
    const { vendor } = await createVendor(SYSTEM_VIEWER, {
      name: uniqueName(),
      accountBank: "신한",
      accountHolder: "홍길동",
      accountNumber: "110-222-330003",
    });
    const errors = await fieldErrorsOf(
      updateVendor(SYSTEM_VIEWER, vendor.id, { name: `${vendor.name}-고침`, accountBank: "신한", accountHolder: "" }),
    );
    expect(errors).toEqual({ accountHolder: "예금주 없음 · 예금주 적기" });
    const [row] = await db.select().from(vendors).where(eq(vendors.id, vendor.id));
    expect(row?.name).toBe(vendor.name);
    expect(row?.accountHolder).toBe("홍길동");
  });

  it("수정 — 번호를 지우며 예금주를 비우면 통과, 은행 칸 생략(07-20 B-P2-4: 저장값 유지) + keep도 통과", async () => {
    const { vendor } = await createVendor(SYSTEM_VIEWER, {
      name: uniqueName(),
      accountBank: "신한",
      accountHolder: "홍길동",
      accountNumber: "110-222-330004",
    });
    await updateVendor(SYSTEM_VIEWER, vendor.id, { name: vendor.name, accountBank: "신한", accountHolder: "", accountNumber: null });
    let [row] = await db.select().from(vendors).where(eq(vendors.id, vendor.id));
    expect(row?.accountNumberEncrypted).toBeNull();
    expect(row?.accountHolder).toBeNull();

    const { vendor: other } = await createVendor(SYSTEM_VIEWER, {
      name: uniqueName(),
      accountBank: "신한",
      accountHolder: "홍길동",
      accountNumber: "110-222-330005",
    });
    await updateVendor(SYSTEM_VIEWER, other.id, { name: other.name });
    [row] = await db.select().from(vendors).where(eq(vendors.id, other.id));
    expect(row?.accountBank).toBe("신한");
    expect(row?.accountNumberEncrypted).not.toBeNull();
  });

  it("판정한 값 그대로 저장 — 앞뒤 공백은 잘라 저장(10글자 + 공백 = 21바이트가 그대로 남지 않는다)", async () => {
    const holder = "가나다라마바사아자차";
    const { vendor } = await createVendor(SYSTEM_VIEWER, {
      name: uniqueName(),
      accountBank: " 신한 ",
      accountHolder: `${holder} `,
      accountNumber: "110-222-330007",
    });
    let [row] = await db.select().from(vendors).where(eq(vendors.id, vendor.id));
    expect(row?.accountBank).toBe("신한");
    expect(row?.accountHolder).toBe(holder);

    await updateVendor(SYSTEM_VIEWER, vendor.id, { name: vendor.name, accountBank: "신한 ", accountHolder: ` ${holder}` });
    [row] = await db.select().from(vendors).where(eq(vendors.id, vendor.id));
    expect(row?.accountBank).toBe("신한");
    expect(row?.accountHolder).toBe(holder);
  });

  it("DH-3 stale — 옛 거래처(풀리지 않는 은행 · 번호 · 예금주 없음)의 이름만 고친 저장은 통과, 은행을 고친 저장은 예금주 없음", async () => {
    const name = uniqueName();
    const old = await insertVendor(SYSTEM_VIEWER, {
      name,
      normalizedName: normalizeVendorName(name),
      accountBank: "없는은행",
      accountNumberEncrypted: "v1:old-cipher",
      accountNumberLast4: "0006",
    });
    await updateVendor(SYSTEM_VIEWER, old.id, { name: `${name}-고침`, accountBank: "없는은행" });
    const [row] = await db.select().from(vendors).where(eq(vendors.id, old.id));
    expect(row?.name).toBe(`${name}-고침`);

    expect(await fieldErrorsOf(updateVendor(SYSTEM_VIEWER, old.id, { name: `${name}-고침`, accountBank: "신한" }))).toEqual({
      accountHolder: "예금주 없음 · 예금주 적기",
    });
  });
});


// 07-20 Task 1(J5 · V3 · B-P2-6): 지급 기한 · version — 패널 저장은 읽은 version을 보내고, 거래처 행을 고치는 쓰기는 모두 version을 올린다.
describe("거래처 지급 기한 · version(07-20 J5 · V3 · B-P2-6)", () => {
  async function versionOf(id: string): Promise<number> {
    const [row] = await db.select({ version: vendors.version }).from(vendors).where(eq(vendors.id, id));
    if (!row) throw new Error("거래처 행 없음");
    return row.version;
  }

  async function termOf(id: string): Promise<number | null> {
    const [row] = await db.select({ days: vendors.paymentTermDays }).from(vendors).where(eq(vendors.id, id));
    return row?.days ?? null;
  }

  it("협력사 지급 기한 30을 읽은 version으로 저장 → version + 1 · 지급 일정 계산이 30을 읽는다", async () => {
    const { vendor } = await createVendor(SYSTEM_VIEWER, { name: uniqueName(), kind: "supplier" });
    const before = await versionOf(vendor.id);
    await updateVendor(SYSTEM_VIEWER, vendor.id, { name: vendor.name, paymentTermDays: 30, expectedVersion: before });
    expect(await versionOf(vendor.id)).toBe(before + 1);
    expect((await listPaymentTermDays(SYSTEM_VIEWER, [vendor.id])).get(vendor.id)).toBe(30);
  });

  it("지급 기한 0 · 181 · 소수는 거부 `지급 기한 1~180 · 다시 입력` — 값 그대로", async () => {
    const { vendor } = await createVendor(SYSTEM_VIEWER, { name: uniqueName(), kind: "supplier", paymentTermDays: 45 });
    for (const days of [0, 181, 1.5]) {
      await expect(updateVendor(SYSTEM_VIEWER, vendor.id, { name: vendor.name, paymentTermDays: days })).rejects.toThrow(
        new PaymentTermDaysError("지급 기한 1~180 · 다시 입력"),
      );
    }
    expect(await termOf(vendor.id)).toBe(45);
  });

  it("클라이언트 갈래에 지급 기한 → 거부 · 클라이언트로 바꾸면 저장된 기한이 비워진다 · 빈 값(null)은 회사 기본(NULL)", async () => {
    await expect(createVendor(SYSTEM_VIEWER, { name: uniqueName(), kind: "client", paymentTermDays: 30 })).rejects.toBeInstanceOf(
      PaymentTermDaysError,
    );
    const { vendor } = await createVendor(SYSTEM_VIEWER, { name: uniqueName(), kind: "both", paymentTermDays: 30 });
    await updateVendor(SYSTEM_VIEWER, vendor.id, { name: vendor.name, kind: "client" });
    expect(await termOf(vendor.id)).toBeNull();

    const { vendor: supplier } = await createVendor(SYSTEM_VIEWER, { name: uniqueName(), kind: "supplier", paymentTermDays: 20 });
    await updateVendor(SYSTEM_VIEWER, supplier.id, { name: supplier.name, paymentTermDays: null });
    expect(await termOf(supplier.id)).toBeNull();
    // 보내지 않으면(undefined) 그대로
    await updateVendor(SYSTEM_VIEWER, supplier.id, { name: supplier.name, paymentTermDays: 15 });
    await updateVendor(SYSTEM_VIEWER, supplier.id, { name: `${supplier.name}-고침` });
    expect(await termOf(supplier.id)).toBe(15);
  });

  it("같은 version으로 두 번 저장 → 두 번째는 VendorVersionConflictError이고 값이 그대로", async () => {
    const { vendor } = await createVendor(SYSTEM_VIEWER, { name: uniqueName(), kind: "supplier" });
    const read = await versionOf(vendor.id);
    await updateVendor(SYSTEM_VIEWER, vendor.id, { name: `${vendor.name}-A`, expectedVersion: read });
    await expect(
      updateVendor(SYSTEM_VIEWER, vendor.id, { name: `${vendor.name}-B`, paymentTermDays: 90, expectedVersion: read }),
    ).rejects.toBeInstanceOf(VendorVersionConflictError);
    const [row] = await db.select().from(vendors).where(eq(vendors.id, vendor.id));
    expect(row?.name).toBe(`${vendor.name}-A`);
    expect(row?.paymentTermDays).toBeNull();
    expect(row?.version).toBe(read + 1);
  });

  it("커스텀 칸을 보내는(행을 잠그는) 저장도 오래된 version이면 VendorVersionConflictError", async () => {
    const { vendor } = await createVendor(SYSTEM_VIEWER, { name: uniqueName(), kind: "supplier" });
    const read = await versionOf(vendor.id);
    await updateVendor(SYSTEM_VIEWER, vendor.id, { name: vendor.name, expectedVersion: read });
    await expect(
      updateVendor(SYSTEM_VIEWER, vendor.id, { name: `${vendor.name}-B`, customFields: {}, expectedVersion: read }),
    ).rejects.toBeInstanceOf(VendorVersionConflictError);
  });

  it("B-P2-6 — 저장소 쓰기 다섯(일반 갱신 · 계좌번호 · 숨김 · 보관 · 복원)이 각각 version을 1 올리고, 그 앞에 읽은 version의 패널 저장은 충돌", async () => {
    const { vendor } = await createVendor(SYSTEM_VIEWER, { name: uniqueName(), kind: "client" });
    const writes: [string, () => Promise<unknown>][] = [
      ["updateVendor(자동 등록 꼴)", () => repoUpdateVendor(SYSTEM_VIEWER, vendor.id, { kind: "both" })],
      ["updateVendorAccountNumber", () => repoUpdateVendorAccountNumber(SYSTEM_VIEWER, vendor.id, { accountNumberEncrypted: null, accountNumberLast4: null })],
      ["setVendorHidden", () => repoSetVendorHidden(SYSTEM_VIEWER, vendor.id, true)],
      ["setVendorArchived(true)", () => repoSetVendorArchived(SYSTEM_VIEWER, vendor.id, true)],
      ["setVendorArchived(false)", () => repoSetVendorArchived(SYSTEM_VIEWER, vendor.id, false)],
    ];
    for (const [label, write] of writes) {
      const before = await versionOf(vendor.id);
      await write();
      expect(await versionOf(vendor.id), label).toBe(before + 1);
    }
    await repoSetVendorHidden(SYSTEM_VIEWER, vendor.id, false);
    const stale = (await versionOf(vendor.id)) - 1;
    await expect(updateVendor(SYSTEM_VIEWER, vendor.id, { name: vendor.name, expectedVersion: stale })).rejects.toBeInstanceOf(
      VendorVersionConflictError,
    );
  });
});

// 07-20 Task 2(R8 · B-P2-4 · C-35 · V5 · V6): 계좌 권한 · 보내지 않은 칸 유지 · 계좌번호 자릿수 · 사업자 번호 문구.
describe("거래처 계좌 권한 · 자릿수 · 사업자 번호 문구(07-20 R8 · B-P2-4 · C-35 · V5)", () => {
  // 거래처 쓰기(admin.vendors write)는 있고 계좌 수정(vendors.account write)은 없는 새 계급의 실제 사람.
  async function makeVendorWriterWithoutAccount(): Promise<{ id: string; roleId: string }> {
    const roleId = `role-vendor-writer-${randomUUID()}`;
    await insertRole(SYSTEM_VIEWER, { id: roleId, name: `거래처 쓰기 ${roleId.slice(-8)}` });
    for (const action of ["view", "write"]) {
      await upsertPermission(SYSTEM_VIEWER, { roleId, menu: "admin.vendors", action, allowed: true });
    }
    await upsertVisibility(SYSTEM_VIEWER, { roleId, infoItem: "vendor.value", visible: true });
    const id = `vendor-writer-${randomUUID()}`;
    await db.insert(users).values({ id, name: "거래처 쓰기", email: `${randomUUID()}@test.local`, roleId });
    return { id, roleId };
  }

  async function seeded() {
    const { vendor } = await createVendor(SYSTEM_VIEWER, {
      name: uniqueName(),
      accountBank: "신한",
      accountHolder: "홍길동",
      accountNumber: "110-222-345678",
    });
    const [row] = await db.select().from(vendors).where(eq(vendors.id, vendor.id));
    if (!row) throw new Error("거래처 행 없음");
    return row;
  }

  it("계좌 권한 없는 사람이 기존 거래처 계좌번호 · 은행 · 예금주를 바꾸면 ForbiddenError(`계좌 수정 권한 없음`) · 값 그대로", async () => {
    const writer = await makeVendorWriterWithoutAccount();
    const row = await seeded();
    for (const change of [{ accountNumber: "3333-01-1234567" }, { accountBank: "국민" }, { accountHolder: "김철수" }]) {
      await expect(updateVendor(writer, row.id, { name: row.name, ...change })).rejects.toThrow(new ForbiddenError("계좌 수정 권한 없음"));
    }
    const [after] = await db.select().from(vendors).where(eq(vendors.id, row.id));
    expect(after).toMatchObject({ accountBank: "신한", accountHolder: "홍길동", accountNumberEncrypted: row.accountNumberEncrypted, name: row.name });
  });

  it("B-P2-4 — 같은 사람이 계좌 세 칸을 보내지 않고 이름만 저장하면 성공하고 세 칸이 그대로", async () => {
    const writer = await makeVendorWriterWithoutAccount();
    const row = await seeded();
    await updateVendor(writer, row.id, { name: `${row.name}-고침` });
    const [after] = await db.select().from(vendors).where(eq(vendors.id, row.id));
    expect(after).toMatchObject({
      name: `${row.name}-고침`,
      accountBank: "신한",
      accountHolder: "홍길동",
      accountNumberEncrypted: row.accountNumberEncrypted,
      accountNumberLast4: "5678",
    });
  });

  it("같은 사람이 저장값과 같은 세 칸을 보내면 바뀐 것이 없어 성공", async () => {
    const writer = await makeVendorWriterWithoutAccount();
    const row = await seeded();
    await expect(updateVendor(writer, row.id, { name: row.name, accountBank: "신한 ", accountHolder: "홍길동" })).resolves.toBeTruthy();
  });

  it("새 거래처 등록 + 계좌는 등록 권한으로 된다(계좌 권한 없어도)", async () => {
    const writer = await makeVendorWriterWithoutAccount();
    const { vendor } = await createVendor(writer, { name: uniqueName(), accountBank: "신한", accountHolder: "홍길동", accountNumber: "1101234567" });
    expect(vendor.accountNumberLast4).toBe("4567");
  });

  it("C-35 — 계좌번호는 하이픈 · 공백을 지운 숫자로 저장하고(뒤 4자리 숫자), 10~16자리 밖이면 칸 오류 `숫자 10~16자리 · 다시 입력`", async () => {
    const { vendor } = await createVendor(SYSTEM_VIEWER, { name: uniqueName(), accountBank: "신한", accountHolder: "홍길동", accountNumber: "110-123 456789" });
    await upsertVisibility(SYSTEM_VIEWER, { roleId: "role-sysadmin", infoItem: REVEAL_ITEM, visible: true });
    expect(await revealAccountNumber(SYSTEM_VIEWER, vendor.id)).toBe("110123456789");

    for (const bad of ["123456789", "12345678901234567", "110-12a-456789"]) {
      const error = await createVendor(SYSTEM_VIEWER, { name: uniqueName(), accountNumber: bad }).catch((e: unknown) => e);
      expect(error, bad).toBeInstanceOf(AccountFieldsError);
      expect((error as AccountFieldsError).fieldErrors).toEqual({ accountNumber: "숫자 10~16자리 · 다시 입력" });
    }
    const error = await updateVendor(SYSTEM_VIEWER, vendor.id, { name: vendor.name, accountNumber: "12-34" }).catch((e: unknown) => e);
    expect((error as AccountFieldsError).fieldErrors).toEqual({ accountNumber: "숫자 10~16자리 · 다시 입력" });
  });

  it("V5 — 같은 번호 문구 `이미 등록됨 · {이름}` · 다른 갈래면 `이미 등록됨 · {이름}({갈래})` · 검증합 틀림은 `사업자 번호 확인 · 다시 입력`", async () => {
    const no = uniqueBizNo();
    const { vendor } = await createVendor(SYSTEM_VIEWER, { name: uniqueName(), businessNo: no, kind: "supplier" });
    const same = await createVendor(SYSTEM_VIEWER, { name: uniqueName(), businessNo: no, kind: "supplier" }).catch((e: unknown) => e);
    expect((same as DuplicateBusinessNoError).message).toBe(`이미 등록됨 · ${vendor.name}`);
    const other = await createVendor(SYSTEM_VIEWER, { name: uniqueName(), businessNo: no, kind: "client" }).catch((e: unknown) => e);
    expect((other as DuplicateBusinessNoError).message).toBe(`이미 등록됨 · ${vendor.name}(협력사)`);
    const bad = await createVendor(SYSTEM_VIEWER, { name: uniqueName(), businessNo: "214-86-10231" }).catch((e: unknown) => e);
    expect(bad).toBeInstanceOf(InvalidBusinessNoError);
    expect((bad as InvalidBusinessNoError).message).toBe("사업자 번호 확인 · 다시 입력");
  });

  it("V6 — 갈래 · 번호를 그대로 둔 이름 저장은 갈래 · 중복 검사 없이 통과(같은 번호의 보관 거래처가 있어도)", async () => {
    const no = uniqueBizNo();
    const { vendor } = await createVendor(SYSTEM_VIEWER, { name: uniqueName(), businessNo: no, kind: "client" });
    await updateVendor(SYSTEM_VIEWER, vendor.id, { name: `${vendor.name}-고침`, kind: "client", businessNo: no.replaceAll("-", "") });
    const [after] = await db.select().from(vendors).where(eq(vendors.id, vendor.id));
    expect(after?.name).toBe(`${vendor.name}-고침`);
    expect(after?.kind).toBe("client");
  });
});
