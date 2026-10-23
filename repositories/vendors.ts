import { and, asc, eq, ilike, inArray, isNull, isNotNull, ne, or, sql } from "drizzle-orm";
import type { InferSelectModel } from "drizzle-orm";
import { db, type DbOrTx } from "@/db/client";
import { vendors } from "@/db/schema";
import type { Viewer } from "@/domain/viewer";
import type { Scope } from "@/domain/permissions/scope-for";
import type { VendorKind } from "@/domain/vendors/kind";

export type VendorRow = InferSelectModel<typeof vendors>;

// 07-20 V2: 목록 거르개 — 갈래(kinds) · 검색어(정규화 이름 부분 일치, digitsQuery가 있으면 사업자 번호 숫자 앞부분 일치도). 검색어는 매개변수이고
// `%` · `_` · `\`는 글자로 막는다(ILIKE 와일드카드 아님). 260907은 이름 ILIKE 또는 번호 앞부분 일치(server/src/vendors.ts:541-542).
export type VendorListOpts = {
  scope: Scope;
  includeHidden: boolean;
  kinds?: readonly VendorKind[] | null;
  nameQuery?: string;
  digitsQuery?: string | null;
};

function likeContains(value: string): string {
  return `%${value.replace(/[\\%_]/g, "\\$&")}%`;
}

function listConditions(opts: VendorListOpts) {
  const conditions = [];
  if (!opts.scope.includeArchived) conditions.push(isNull(vendors.archivedAt));
  if (!opts.includeHidden) conditions.push(eq(vendors.hidden, false));
  if (opts.kinds) conditions.push(inArray(vendors.kind, [...opts.kinds]));
  if (opts.nameQuery) {
    const byName = ilike(vendors.normalizedName, likeContains(opts.nameQuery));
    conditions.push(
      opts.digitsQuery
        ? or(byName, sql`regexp_replace(${vendors.businessNo}, '[^0-9]', '', 'g') LIKE ${`${opts.digitsQuery}%`}`)
        : byName,
    );
  }
  return conditions.length ? and(...conditions) : undefined;
}

export async function listVendors(viewer: Viewer, opts: VendorListOpts): Promise<VendorRow[]> {
  if (opts.scope.rows === "none") return [];
  return db.select().from(vendors).where(listConditions(opts)).orderBy(vendors.normalizedName, vendors.id);
}

// 07-20 D-736: 파일 받기 상한 판정 — listVendors와 같은 거르개로 수만 센다.
export async function countVendors(viewer: Viewer, opts: VendorListOpts): Promise<number> {
  if (opts.scope.rows === "none") return 0;
  const [row] = await db.select({ count: sql<number>`count(*)::int` }).from(vendors).where(listConditions(opts));
  return row?.count ?? 0;
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

// 05-07 골라내기 — 숨김 · 보관 아닌 거래처, 이름 부분 일치(검색어 없으면 전체), 정렬은 이름 → id, 최대 limit행.
export async function listVendorsForPick(
  viewer: Viewer,
  opts: { normalizedQuery: string; limit: number; kinds: readonly VendorKind[] },
): Promise<VendorRow[]> {
  void viewer;
  const conditions = [eq(vendors.hidden, false), isNull(vendors.archivedAt), inArray(vendors.kind, [...opts.kinds])];
  if (opts.normalizedQuery !== "") conditions.push(ilike(vendors.normalizedName, `%${opts.normalizedQuery}%`));
  return db
    .select()
    .from(vendors)
    .where(and(...conditions))
    .orderBy(vendors.normalizedName, vendors.id)
    .limit(opts.limit);
}

export async function findVendorById(viewer: Viewer, id: string): Promise<VendorRow | null> {
  const [row] = await db.select().from(vendors).where(eq(vendors.id, id)).limit(1);
  return row ?? null;
}

// 04.5-05(T-04.5-41): 커스텀 값 합치기 · 쓰기를 한 트랜잭션으로 묶는 행 잠금 조회 — 트랜잭션 안에서만 부른다(tx 필수).
// 키를 바꾸지 않는 갱신이라 NO KEY UPDATE — 이 거래처를 가리키는 FK 검사(KEY SHARE)를 막지 않는다(선례 reserve-entries.ts).
export async function findVendorByIdForUpdate(viewer: Viewer, id: string, tx: DbOrTx): Promise<VendorRow | null> {
  const [row] = await tx.select().from(vendors).where(eq(vendors.id, id)).for("no key update");
  return row ?? null;
}

// /qa ISSUE-001 — 견적 줄이 이미 가리키는 거래처의 이름(id → 이름). 보관 · 숨김도 넣는다 — 선택지가 아니라
// 이미 고른 값의 이름이다. 노출 판정은 호출자가 한다(DTO 명세 projectMany · 충돌 이유는 vendorNamesVisible).
export async function findVendorNamesByIds(viewer: Viewer, ids: string[], tx: DbOrTx = db): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const rows = await tx.select({ id: vendors.id, name: vendors.name }).from(vendors).where(inArray(vendors.id, ids));
  return new Map(rows.map((row) => [row.id, row.name]));
}

// 261006 「바뀔 때만 막기」 — 새로 고르거나 바꾼 거래처의 갈래(id → 갈래). 보관 · 숨김도 넣는다(판정은 호출자).
// FOR SHARE — 호출 트랜잭션이 끝날 때까지 갈래 수정(UPDATE)을 막는다(판정 뒤 저장 전 경합). 저장끼리는 막지 않는다.
export async function findVendorKindsByIds(viewer: Viewer, ids: string[], tx: DbOrTx = db): Promise<Map<string, VendorKind>> {
  if (ids.length === 0) return new Map();
  const rows = await tx.select({ id: vendors.id, kind: vendors.kind }).from(vendors).where(inArray(vendors.id, ids)).for("share");
  return new Map(rows.map((row) => [row.id, row.kind]));
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

export type VendorBusinessNoMatch = Pick<VendorRow, "id" | "name" | "kind" | "hidden" | "archivedAt">;

// 사업자번호 중복 선검사 — 숫자만 뽑은 값이 같은 거래처(숨김 · 보관 포함). 살아 있는 쪽을 먼저, 그다음 먼저 만든 순(옛 260907 vendors.ts:828-831과 같은 순서).
export async function findVendorsByBusinessNoDigits(
  viewer: Viewer,
  digits: string,
  opts: { excludeId?: string } = {},
  tx: DbOrTx = db,
): Promise<VendorBusinessNoMatch[]> {
  void viewer;
  const sameDigits = sql`regexp_replace(${vendors.businessNo}, '[^0-9]', '', 'g') = ${digits}`;
  return tx
    .select({ id: vendors.id, name: vendors.name, kind: vendors.kind, hidden: vendors.hidden, archivedAt: vendors.archivedAt })
    .from(vendors)
    .where(opts.excludeId === undefined ? sameDigits : and(sameDigits, ne(vendors.id, opts.excludeId)))
    .orderBy(sql`${vendors.archivedAt} ASC NULLS FIRST`, asc(vendors.createdAt));
}

export type VendorBusinessNoListMatch = VendorBusinessNoMatch & { digits: string };

// 배열판(06.1-04 B-F14) — 위 findVendorsByBusinessNoDigits와 같은 판정(숫자만 뽑은 식 · 같은 정렬)을 번호 여럿에 한 번 돈다.
export async function findVendorsByBusinessNoDigitsList(
  viewer: Viewer,
  digitsList: readonly string[],
  tx: DbOrTx = db,
): Promise<VendorBusinessNoListMatch[]> {
  void viewer;
  const digits = sql<string>`regexp_replace(${vendors.businessNo}, '[^0-9]', '', 'g')`;
  return tx
    .select({ id: vendors.id, name: vendors.name, kind: vendors.kind, hidden: vendors.hidden, archivedAt: vendors.archivedAt, digits })
    .from(vendors)
    .where(sql`${digits} = ANY(${sql.param([...digitsList])}::text[])`)
    .orderBy(sql`${vendors.archivedAt} ASC NULLS FIRST`, asc(vendors.createdAt));
}

// 06.1-04(B-F14): 증빙 등록의 거래처 자동 생성 잠금 하나 — 번호마다 잠그지 않는다(lockRouteStep 꼴). 관리 화면 저장은 이 잠금을
// 쓰지 않고 유일 색인(23505)이 가른다 — 등록 서비스가 그때 트랜잭션을 한 번 다시 돈다.
export async function lockVendorAutocreate(viewer: Viewer, tx: DbOrTx): Promise<void> {
  void viewer;
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${"vendor_autocreate"}, 0))`);
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
  kind?: VendorKind;
  paymentTermDays?: number | null;
  // 07-23 V4: 확인 표시 — 관리 화면 등록만 채운다. 자동 등록 · 일하는 자리 등록은 주지 않아 NULL(확인 전).
  confirmedAt?: Date | null;
  confirmedBy?: string | null;
};

export async function insertVendor(viewer: Viewer, input: VendorInsertInput, tx: DbOrTx = db): Promise<VendorRow> {
  const [row] = await tx
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
      kind: input.kind,
      paymentTermDays: input.paymentTermDays ?? null,
      confirmedAt: input.confirmedAt ?? null,
      confirmedBy: input.confirmedBy ?? null,
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
  kind: VendorKind;
  paymentTermDays: number | null;
}>;

// 07-20(B-P2-6 · G9): 거래처 행을 고치는 쓰기는 모두 version을 1 올린다 — 패널이 읽은 version과 비교해 덮어쓰기를 막는다.
const BUMP_VERSION = { version: sql`${vendors.version} + 1` };

// 계좌번호를 바꾸지 않는 일반 갱신 — 암호문·뒤 4자리 두 컬럼을 아예 건드리지
// 않는다(T-03-33과 같은 결: 두 번의 쓰기로 나누지 않는다).
// expectedVersion을 주면 그 version일 때만 고친다(07-20 V3) — 바뀐 행 수를 돌려준다(0 = 그 사이 누가 고침 · 없음).
export async function updateVendor(
  viewer: Viewer,
  id: string,
  input: VendorUpdateInput,
  tx: DbOrTx = db,
  expectedVersion?: number,
): Promise<number> {
  const rows = await tx
    .update(vendors)
    .set({ ...input, ...BUMP_VERSION, updatedAt: new Date() })
    .where(expectedVersion === undefined ? eq(vendors.id, id) : and(eq(vendors.id, id), eq(vendors.version, expectedVersion)))
    .returning({ id: vendors.id });
  return rows.length;
}

// 계좌번호를 바꿀 때 전용 — 암호문 컬럼과 뒤 4자리 컬럼을 같은 UPDATE 문에서
// 함께 교체한다. null을 넘기면 계좌번호를 지운다(둘 다 null).
export async function updateVendorAccountNumber(
  viewer: Viewer,
  id: string,
  input: { accountNumberEncrypted: string | null; accountNumberLast4: string | null },
  tx: DbOrTx = db,
): Promise<void> {
  await tx
    .update(vendors)
    .set({
      accountNumberEncrypted: input.accountNumberEncrypted,
      accountNumberLast4: input.accountNumberLast4,
      ...BUMP_VERSION,
      updatedAt: new Date(),
    })
    .where(eq(vendors.id, id));
}

// 07-23 V4: 확인 표시 켬 · 끔 — 조건부 갱신(이미 그 상태면 0행 · version 그대로)이라 연타 · 경합에도 한 번만 바뀐다. 보관된 거래처는 고치지 않는다.
// 바뀌었으면 새 version, 아니면 null.
export async function setVendorConfirmed(viewer: Viewer, id: string, confirmed: boolean, tx: DbOrTx): Promise<number | null> {
  const rows = await tx
    .update(vendors)
    .set(confirmed ? { confirmedAt: new Date(), confirmedBy: viewer.id, ...BUMP_VERSION } : { confirmedAt: null, confirmedBy: null, ...BUMP_VERSION })
    .where(and(eq(vendors.id, id), isNull(vendors.archivedAt), confirmed ? isNull(vendors.confirmedAt) : isNotNull(vendors.confirmedAt)))
    .returning({ version: vendors.version });
  return rows[0]?.version ?? null;
}

export async function setVendorHidden(viewer: Viewer, id: string, hidden: boolean): Promise<void> {
  await db.update(vendors).set({ hidden, ...BUMP_VERSION, updatedAt: new Date() }).where(eq(vendors.id, id));
}

// 보관·복원 둘 다 조건부 UPDATE로 멱등·경합 안전을 확보한다(repositories/roles.ts와 같은 패턴).
export async function setVendorArchived(viewer: Viewer, id: string, value: boolean, tx: DbOrTx = db): Promise<boolean> {
  // 조건부 갱신이 실제로 바꾼 행이 있으면 참 — 범용 복원이 「이미 복원됨」 · 로그를 이 결과로 정한다(PR #149).
  const rows = value
    ? await tx
        .update(vendors)
        .set({ archivedAt: new Date(), archivedBy: viewer.id, ...BUMP_VERSION })
        .where(and(eq(vendors.id, id), isNull(vendors.archivedAt)))
        .returning({ id: vendors.id })
    : await tx
        .update(vendors)
        .set({ archivedAt: null, archivedBy: null, ...BUMP_VERSION })
        .where(and(eq(vendors.id, id), isNotNull(vendors.archivedAt)))
        .returning({ id: vendors.id });
  return rows.length > 0;
}

// 07-06(J5): 지급 일정 계산의 거래처 지급 기한 — 협력사 갈래(supplier · both) · 칸 있는 것만(id → 일수). 보관 · 숨김도 읽는다(이미 고른 거래처).
export async function listPaymentTermDays(viewer: Viewer, vendorIds: readonly string[]): Promise<Map<string, number>> {
  void viewer;
  if (vendorIds.length === 0) return new Map();
  const rows = await db
    .select({ id: vendors.id, days: vendors.paymentTermDays })
    .from(vendors)
    .where(and(inArray(vendors.id, [...vendorIds]), inArray(vendors.kind, ["supplier", "both"]), isNotNull(vendors.paymentTermDays)));
  return new Map(rows.flatMap((row) => (row.days === null ? [] : [[row.id, row.days] as const])));
}
