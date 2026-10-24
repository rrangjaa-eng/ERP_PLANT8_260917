import { and, asc, desc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { db, type DbOrTx } from "@/db/client";
import { expensePayments, expenses, files, users, vendorAccountChanges, vendorContacts, vendorDocuments, vendors } from "@/db/schema";
import type { Viewer } from "@/domain/viewer";

// 07-23: 거래처 묶음 표(07-11 S3) 읽기 · 쓰기 — 계좌 변경 기록 · 담당자 · 서류. 판정(권한 · 노출)은 domain/vendors가 한다.

export type AccountChangeSource = "admin" | "workplace" | "evidence";

// 계좌 변경 기록 한 줄 — 원값 없이 뒤 4자리만(07-11 CHECK `^[0-9]{4}$` 또는 NULL). 저장 트랜잭션 안에서만 부른다(tx 필수).
export async function insertAccountChange(
  viewer: Viewer,
  input: { vendorId: string; beforeLast4: string | null; afterLast4: string | null; source: AccountChangeSource },
  tx: DbOrTx,
): Promise<void> {
  await tx.insert(vendorAccountChanges).values({ ...input, changedBy: viewer.id });
}

export type AccountChangeRow = { id: string; beforeLast4: string | null; afterLast4: string | null; changedAt: Date; changedByName: string };

// 한 거래처의 변경 기록 — 최신 위(같은 시각이면 id 순으로 결정적).
export async function listAccountChanges(viewer: Viewer, vendorId: string): Promise<AccountChangeRow[]> {
  void viewer;
  return db
    .select({
      id: vendorAccountChanges.id,
      beforeLast4: vendorAccountChanges.beforeLast4,
      afterLast4: vendorAccountChanges.afterLast4,
      changedAt: vendorAccountChanges.changedAt,
      changedByName: users.name,
    })
    .from(vendorAccountChanges)
    .innerJoin(users, eq(users.id, vendorAccountChanges.changedBy))
    .where(eq(vendorAccountChanges.vendorId, vendorId))
    .orderBy(desc(vendorAccountChanges.changedAt), desc(vendorAccountChanges.id));
}

// AQ-36: 거래처마다 가장 늦은 계좌 변경이 그 거래처로 처리된(취소 안 된) 가장 늦은 지급보다 뒤인 거래처 id — 한 질의.
// 지급은 거래처가 지급처인 문서만 센다(직원 지급처 문서는 그 거래처 계좌로 나간 돈이 아니다).
export async function findVendorsChangedSinceLastPayment(viewer: Viewer, vendorIds: readonly string[]): Promise<string[]> {
  void viewer;
  if (vendorIds.length === 0) return [];
  const lastPaid = sql`(select max(${expensePayments.processedAt}) from ${expensePayments} inner join ${expenses} on ${expenses.id} = ${expensePayments.expenseId}
    where ${expenses.vendorId} = ${vendorAccountChanges.vendorId} and ${expenses.payeeUserId} is null and ${expensePayments.cancelledAt} is null)`;
  const rows = await db
    .select({ vendorId: vendorAccountChanges.vendorId })
    .from(vendorAccountChanges)
    .where(inArray(vendorAccountChanges.vendorId, [...vendorIds]))
    .groupBy(vendorAccountChanges.vendorId)
    .having(sql`max(${vendorAccountChanges.changedAt}) > coalesce(${lastPaid}, '-infinity'::timestamp)`);
  return rows.map((row) => row.vendorId);
}

// N14 · 계좌 바뀜 알림(NOTI-03) — 되돌아보기 하한(ctx.since) 뒤 변경 기록을 오래된 순으로(보관 거래처 제외). 상한 + 1행까지 읽어 넘침을 안다.
export type AccountChangeSinceRow = { vendorId: string; vendorName: string; changedAt: Date };

export async function listAccountChangesSince(viewer: Viewer, since: Date, limit: number, tx: DbOrTx = db): Promise<AccountChangeSinceRow[]> {
  void viewer;
  return tx
    .select({ vendorId: vendorAccountChanges.vendorId, vendorName: vendors.name, changedAt: vendorAccountChanges.changedAt })
    .from(vendorAccountChanges)
    .innerJoin(vendors, eq(vendors.id, vendorAccountChanges.vendorId))
    .where(and(isNull(vendors.archivedAt), sql`${vendorAccountChanges.changedAt} >= ${since.toISOString()}::timestamp`))
    .orderBy(asc(vendorAccountChanges.changedAt), asc(vendorAccountChanges.id))
    .limit(limit + 1);
}

// ── 담당자(V7) ──────────────────────────────────────────────────────────

export type VendorContactRow = typeof vendorContacts.$inferSelect;

// 살아 있는(보관 아님) 담당자 — 정한 순서대로.
function liveContactsQuery(vendorId: string, tx: DbOrTx) {
  return tx
    .select()
    .from(vendorContacts)
    .where(and(eq(vendorContacts.vendorId, vendorId), isNull(vendorContacts.archivedAt)))
    .orderBy(asc(vendorContacts.sortOrder), asc(vendorContacts.createdAt));
}

export async function listLiveContacts(viewer: Viewer, vendorId: string): Promise<VendorContactRow[]> {
  void viewer;
  return liveContactsQuery(vendorId, db);
}

// 저장 트랜잭션 안 — 줄을 잠가 같은 거래처의 저장 둘이 차례로 판정한다.
export async function lockLiveContacts(viewer: Viewer, vendorId: string, tx: DbOrTx): Promise<VendorContactRow[]> {
  void viewer;
  return liveContactsQuery(vendorId, tx).for("update");
}

export type ContactValues = { name: string; phone: string | null; email: string | null; sortOrder: number };

export async function insertContact(viewer: Viewer, vendorId: string, values: ContactValues, tx: DbOrTx): Promise<void> {
  await tx.insert(vendorContacts).values({ vendorId, ...values, createdBy: viewer.id });
}

export async function updateContact(viewer: Viewer, id: string, values: ContactValues, tx: DbOrTx): Promise<void> {
  await tx
    .update(vendorContacts)
    .set({ ...values, updatedBy: viewer.id, updatedAt: new Date() })
    .where(eq(vendorContacts.id, id));
}

// 빠진 줄은 지우지 않고 보관한다(07-11 archived_at — 누가 언제 뺐나가 남는다).
export async function archiveContacts(viewer: Viewer, ids: readonly string[], tx: DbOrTx): Promise<void> {
  if (ids.length === 0) return;
  await tx
    .update(vendorContacts)
    .set({ archivedAt: new Date(), archivedBy: viewer.id })
    .where(and(inArray(vendorContacts.id, [...ids]), isNull(vendorContacts.archivedAt)));
}

// ── 서류(V8) ────────────────────────────────────────────────────────────

export type VendorDocumentKind = (typeof vendorDocuments.$inferSelect)["kind"];
export type VendorDocumentRow = typeof vendorDocuments.$inferSelect;

const DOCUMENT_OWNER_KIND = "vendor_document";

export async function insertVendorDocument(viewer: Viewer, input: { vendorId: string; kind: VendorDocumentKind }, tx: DbOrTx = db): Promise<VendorDocumentRow> {
  const [row] = await tx.insert(vendorDocuments).values({ ...input, createdBy: viewer.id }).returning();
  if (!row) throw new Error("vendor_documents insert가 행을 반환하지 않았습니다.");
  return row;
}

export async function findVendorDocumentById(viewer: Viewer, id: string, tx: DbOrTx = db): Promise<VendorDocumentRow | null> {
  void viewer;
  const [row] = await tx.select().from(vendorDocuments).where(eq(vendorDocuments.id, id)).limit(1);
  return row ?? null;
}

// 선언이 거부된 붙이기 시작의 행을 버린다(파일이 없는 행).
export async function markVendorDocumentRemoved(viewer: Viewer, id: string, tx: DbOrTx = db): Promise<void> {
  await tx
    .update(vendorDocuments)
    .set({ removedAt: new Date(), removedBy: viewer.id })
    .where(and(eq(vendorDocuments.id, id), isNull(vendorDocuments.removedAt)));
}

// 교체 — 같은 거래처 · 같은 종류의 다른 살아 있는 서류 행을 버리고 그 행들의 살아 있는 파일도 함께 지운다(한 트랜잭션 · 지운 사람 = 올린 사람).
export async function replaceOtherVendorDocuments(
  viewer: Viewer,
  input: { keepId: string; vendorId: string; kind: VendorDocumentKind; at: Date },
  tx: DbOrTx,
): Promise<void> {
  const dropped = await tx
    .update(vendorDocuments)
    .set({ removedAt: input.at, removedBy: viewer.id })
    .where(
      and(
        eq(vendorDocuments.vendorId, input.vendorId),
        eq(vendorDocuments.kind, input.kind),
        ne(vendorDocuments.id, input.keepId),
        isNull(vendorDocuments.removedAt),
      ),
    )
    .returning({ id: vendorDocuments.id });
  if (dropped.length === 0) return;
  await tx
    .update(files)
    .set({ removedAt: input.at, removedBy: viewer.id })
    .where(
      and(
        eq(files.ownerKind, DOCUMENT_OWNER_KIND),
        inArray(
          files.ownerId,
          dropped.map((row) => row.id),
        ),
        isNull(files.removedAt),
      ),
    );
}

export type VendorDocumentFileRow = {
  kind: VendorDocumentKind;
  fileId: string;
  name: string;
  sizeBytes: number;
  createdAt: Date;
};

// 살아 있는(지우지도 무효도 아닌) 파일이 있는 살아 있는 서류 — 올린 순(같은 종류가 둘이면 마지막 것이 그 자리).
export async function listVendorDocumentFiles(viewer: Viewer, vendorId: string): Promise<VendorDocumentFileRow[]> {
  void viewer;
  return db
    .select({ kind: vendorDocuments.kind, fileId: files.id, name: files.originalName, sizeBytes: files.sizeBytes, createdAt: files.createdAt })
    .from(vendorDocuments)
    .innerJoin(files, and(eq(files.ownerKind, DOCUMENT_OWNER_KIND), eq(files.ownerId, vendorDocuments.id)))
    .where(and(eq(vendorDocuments.vendorId, vendorId), isNull(vendorDocuments.removedAt), isNull(files.removedAt), isNull(files.voidedAt)))
    .orderBy(asc(files.createdAt), asc(files.id));
}
