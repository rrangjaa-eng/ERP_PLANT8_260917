import { and, eq, ilike, isNull, isNotNull } from "drizzle-orm";
import type { InferSelectModel } from "drizzle-orm";
import { db } from "@/db/client";
import { vendors } from "@/db/schema";
import type { Viewer } from "@/domain/viewer";
import type { Scope } from "@/domain/permissions/scope-for";

export type VendorRow = InferSelectModel<typeof vendors>;

export async function listVendors(
  viewer: Viewer,
  opts: { scope: Scope; includeHidden: boolean },
): Promise<VendorRow[]> {
  if (opts.scope.rows === "none") return [];

  const conditions = [];
  if (!opts.scope.includeArchived) conditions.push(isNull(vendors.archivedAt));
  if (!opts.includeHidden) conditions.push(eq(vendors.hidden, false));

  return db
    .select()
    .from(vendors)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(vendors.normalizedName, vendors.id);
}

// 자동완성 후보 — 정렬은 domain(searchVendors)이 점수로 다시 매긴다. 여기서는
// ILIKE 부분 일치로 후보만 좁힌다(NFC 정규화 + 소문자는 호출자가 이미 끝냈다).
export async function searchVendorsByNormalizedName(
  viewer: Viewer,
  opts: { normalizedQuery: string; scope: Scope },
): Promise<VendorRow[]> {
  if (opts.scope.rows === "none") return [];

  const conditions = [ilike(vendors.normalizedName, `%${opts.normalizedQuery}%`)];
  if (!opts.scope.includeArchived) conditions.push(isNull(vendors.archivedAt));
  // 자동완성은 숨김 거래처를 서버가 제외한다(03-UI-SPEC.md 비활성화 표현 규칙).
  conditions.push(eq(vendors.hidden, false));

  return db
    .select()
    .from(vendors)
    .where(and(...conditions))
    .orderBy(vendors.normalizedName, vendors.id);
}

export async function findVendorById(viewer: Viewer, id: string): Promise<VendorRow | null> {
  const [row] = await db.select().from(vendors).where(eq(vendors.id, id)).limit(1);
  return row ?? null;
}

// 등록 시 중복 후보 경고에 쓴다 — 이름 unique 제약이 없으므로(같은 이름의
// 다른 거래처가 실제로 존재할 수 있다) 완전 일치하는 기존 행을 찾아 보여주되
// 등록 자체는 막지 않는다.
export async function findVendorsByNormalizedName(viewer: Viewer, normalizedName: string): Promise<VendorRow[]> {
  return db
    .select()
    .from(vendors)
    .where(and(eq(vendors.normalizedName, normalizedName), isNull(vendors.archivedAt)));
}

export type VendorInsertInput = {
  name: string;
  normalizedName: string;
  businessNo?: string | null;
  defaultEvidenceType?: string | null;
  accountBank?: string | null;
  accountHolder?: string | null;
  accountNumberEncrypted?: string | null;
  accountNumberLast4?: string | null;
  customFields?: Record<string, unknown>;
};

export async function insertVendor(viewer: Viewer, input: VendorInsertInput): Promise<VendorRow> {
  const [row] = await db
    .insert(vendors)
    .values({
      name: input.name,
      normalizedName: input.normalizedName,
      businessNo: input.businessNo ?? null,
      defaultEvidenceType: input.defaultEvidenceType ?? null,
      accountBank: input.accountBank ?? null,
      accountHolder: input.accountHolder ?? null,
      accountNumberEncrypted: input.accountNumberEncrypted ?? null,
      accountNumberLast4: input.accountNumberLast4 ?? null,
      customFields: input.customFields ?? {},
    })
    .returning();
  if (!row) throw new Error("vendors insert가 행을 반환하지 않았습니다.");
  return row;
}

export type VendorUpdateInput = Partial<{
  name: string;
  normalizedName: string;
  businessNo: string | null;
  defaultEvidenceType: string | null;
  accountBank: string | null;
  accountHolder: string | null;
  customFields: Record<string, unknown>;
}>;

// 계좌번호를 바꾸지 않는 일반 갱신 — 암호문·뒤 4자리 두 컬럼을 아예 건드리지
// 않는다(T-03-33과 같은 결: 두 번의 쓰기로 나누지 않는다).
export async function updateVendor(viewer: Viewer, id: string, input: VendorUpdateInput): Promise<void> {
  await db
    .update(vendors)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(vendors.id, id));
}

// 계좌번호를 바꿀 때 전용 — 암호문 컬럼과 뒤 4자리 컬럼을 같은 UPDATE 문에서
// 함께 교체한다. null을 넘기면 계좌번호를 지운다(둘 다 null).
export async function updateVendorAccountNumber(
  viewer: Viewer,
  id: string,
  input: { accountNumberEncrypted: string | null; accountNumberLast4: string | null },
): Promise<void> {
  await db
    .update(vendors)
    .set({
      accountNumberEncrypted: input.accountNumberEncrypted,
      accountNumberLast4: input.accountNumberLast4,
      updatedAt: new Date(),
    })
    .where(eq(vendors.id, id));
}

export async function setVendorHidden(viewer: Viewer, id: string, hidden: boolean): Promise<void> {
  await db.update(vendors).set({ hidden, updatedAt: new Date() }).where(eq(vendors.id, id));
}

// 보관·복원 둘 다 조건부 UPDATE로 멱등·경합 안전을 확보한다(repositories/roles.ts와 같은 패턴).
export async function setVendorArchived(viewer: Viewer, id: string, value: boolean): Promise<void> {
  if (value) {
    await db
      .update(vendors)
      .set({ archivedAt: new Date(), archivedBy: viewer.id })
      .where(and(eq(vendors.id, id), isNull(vendors.archivedAt)));
  } else {
    await db
      .update(vendors)
      .set({ archivedAt: null, archivedBy: null })
      .where(and(eq(vendors.id, id), isNotNull(vendors.archivedAt)));
  }
}
