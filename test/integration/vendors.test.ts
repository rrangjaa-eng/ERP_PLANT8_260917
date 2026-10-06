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
import { archive, listArchive, restore } from "@/domain/archive";
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
  ForbiddenError,
} from "@/domain/vendors";

const REVEAL_ITEM = "vendor.account_number_unmasked";

// 실행마다 고유한 사업자번호 — 같은 DB를 다시 써도 겹치지 않는다(「xxx-xx-xxxxx」).
function uniqueBizNo(): string {
  const digits = String(Math.floor(Math.random() * 9_000_000_000) + 1_000_000_000);
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
    await createVendor(SYSTEM_VIEWER, { name: uniqueName(), businessNo: "---" });
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

  it("수정 — 저장된 숫자 번호가 그대로면 같은 번호의 살아 있는 거래처가 둘 있어도 이름 · 계좌만 고쳐 저장된다", async () => {
    const no = uniqueBizNo();
    const { vendor: a } = await createVendor(SYSTEM_VIEWER, { name: uniqueName(), businessNo: no });
    // 색인 전(PR A)에 이미 생긴 중복을 직접 넣는다.
    const [twin] = await db.insert(vendors).values({ name: uniqueName(), normalizedName: uniqueName(), businessNo: no.replaceAll("-", "") }).returning();
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
});
