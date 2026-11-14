import { and, asc, eq, gte, inArray, isNotNull, isNull, or } from "drizzle-orm";
import { sql } from "drizzle-orm";
import type { InferSelectModel } from "drizzle-orm";
import { db } from "@/db/client";
import { projects, revenueEntries, users } from "@/db/schema";
import type { Viewer } from "@/domain/viewer";
import type { DbOrTx } from "@/repositories/document-counters";

export type RevenueEntryRow = InferSelectModel<typeof revenueEntries>;

// 04-02 Task 2 ② — repositories/vendors.ts 형태를 복제한다(viewer 첫 인자,
// 보관 조건부 UPDATE, InferSelectModel 행 타입 export). 프로젝트별 목록은
// kind·entry_date 순으로 정렬한다.
// 07.1-13(#316 P2): 매출 줄 저장 로그 순번이 같은 tx에서 이 순서(= 매출 표 순서)를 읽는다 — tx를 받는다.
// 07.6-01(R1): 보관 줄 제외 — 매출 표 · 합계 · 로그 순번은 화면에 보이는 줄. 같은 날짜 줄은 넣은 순서(createdAt, 같으면 id)로 고정한다.
export async function listRevenueEntriesByProject(viewer: Viewer, projectId: string, tx: DbOrTx = db): Promise<RevenueEntryRow[]> {
  void viewer;
  return tx
    .select()
    .from(revenueEntries)
    .where(and(eq(revenueEntries.projectId, projectId), isNull(revenueEntries.archivedAt)))
    .orderBy(asc(revenueEntries.kind), asc(revenueEntries.entryDate), asc(revenueEntries.createdAt), asc(revenueEntries.id));
}

export type CollectionRow = Pick<RevenueEntryRow, "id" | "projectId" | "kind" | "entryDate" | "amountAmountKrw" | "createdAt">;

// 07-22(D-746) — 수금 지연 판정 재료. 주어진 프로젝트들의 보관 안 된 발행 · 입금 줄을 한 질의로(N+1 없음). 프로젝트 id는 호출자가 범위를
// 판정한 뒤의 것(목록 쪽 · 상세 · 알림 종류의 SYSTEM_VIEWER).
export async function listCollectionRows(viewer: Viewer, projectIds: readonly string[], tx: DbOrTx = db): Promise<CollectionRow[]> {
  void viewer;
  if (projectIds.length === 0) return [];
  return tx
    .select({
      id: revenueEntries.id,
      projectId: revenueEntries.projectId,
      kind: revenueEntries.kind,
      entryDate: revenueEntries.entryDate,
      amountAmountKrw: revenueEntries.amountAmountKrw,
      createdAt: revenueEntries.createdAt,
    })
    .from(revenueEntries)
    .where(and(inArray(revenueEntries.projectId, [...projectIds]), isNull(revenueEntries.archivedAt)));
}

// 07-22(N22 · D-716) — 수금 지연 알림 후보: 보관 안 된 프로젝트 가운데 보관 안 된 발행 줄이 하나라도 있는 것(상태로 거르지 않는다 — 완료도 덜
// 받았으면 지연, 배지와 같은 정의). 가장 이른 발행 순 · id 순으로 limit개. 담당 PM이 활성(보관 안 됨 · 퇴직일이 오늘 이후)이 아니면 pmRoleId는 null.
// 시스템 tick(SYSTEM_VIEWER, domain/notify/kinds/collection-overdue.ts)만 부르고 행을 화면에 내지 않는다.
export type CollectionCandidateProject = { id: string; name: string; pmUserId: string | null; pmRoleId: string | null };

export async function listCollectionCandidateProjects(
  viewer: Viewer,
  input: { limit: number; today: string },
  tx: DbOrTx = db,
): Promise<CollectionCandidateProject[]> {
  void viewer;
  const firstIssue = sql<string>`(select min(${revenueEntries.entryDate}) from ${revenueEntries} where ${revenueEntries.projectId} = ${projects.id} and ${revenueEntries.kind} = 'issue' and ${revenueEntries.archivedAt} is null)`;
  return tx
    .select({ id: projects.id, name: projects.name, pmUserId: projects.pmUserId, pmRoleId: users.roleId })
    .from(projects)
    .leftJoin(
      users,
      and(
        eq(users.id, projects.pmUserId),
        isNull(users.archivedAt),
        or(isNull(users.resignationDate), gte(users.resignationDate, input.today)),
      ),
    )
    .where(and(isNull(projects.archivedAt), sql`${firstIssue} is not null`))
    .orderBy(asc(firstIssue), asc(projects.id))
    .limit(input.limit);
}

export async function findRevenueEntryById(viewer: Viewer, id: string, tx: DbOrTx = db): Promise<RevenueEntryRow | null> {
  void viewer;
  const [row] = await tx.select().from(revenueEntries).where(eq(revenueEntries.id, id)).limit(1);
  return row ?? null;
}

// 07.1-13 S8(E-P2-39) — 매출 줄 저장 로그의 이전 값. 고치는 줄 id들을 쓰기 전 같은 tx로 한 질의에 읽는다(잠금 없음 —
// 쓰기는 조건 UPDATE가 version으로 지킨다). id가 없으면 질의하지 않는다.
export async function findRevenueEntriesByIds(viewer: Viewer, ids: readonly string[], tx: DbOrTx = db): Promise<RevenueEntryRow[]> {
  void viewer;
  if (ids.length === 0) return [];
  return tx.select().from(revenueEntries).where(inArray(revenueEntries.id, [...ids]));
}

// 07-22(W7) — 계산서 파일 붙이기 · 교체가 매출 줄 한 행을 잠근다(같은 줄의 교체 두 건이 차례로 — 살아 있는 파일 하나).
export async function lockRevenueEntryForUpdate(viewer: Viewer, id: string, tx: DbOrTx): Promise<RevenueEntryRow | null> {
  void viewer;
  const [row] = await tx.select().from(revenueEntries).where(eq(revenueEntries.id, id)).for("update");
  return row ?? null;
}

// 07-22(W7) — 프로젝트의 보관 안 된 발행 줄 id(계산서 링크 재료).
export async function listLiveIssueEntryIds(viewer: Viewer, projectId: string): Promise<string[]> {
  void viewer;
  const rows = await db
    .select({ id: revenueEntries.id })
    .from(revenueEntries)
    .where(and(eq(revenueEntries.projectId, projectId), eq(revenueEntries.kind, "issue"), isNull(revenueEntries.archivedAt)));
  return rows.map((row) => row.id);
}

export type RevenueEntryInsertInput = {
  /** 04-41(ENG-D10) — 화면이 만든 uuid. 이미 있으면 넣지 않는다(null). */
  id?: string;
  projectId: string;
  kind: string;
  entryDate: string;
  amountCurrency: string;
  amountForeignAmount: string | null;
  amountFxRate: string;
  amountAmountKrw: number;
  note?: string | null;
  source?: string;
  customFields?: Record<string, unknown>;
};

export async function insertRevenueEntry(
  viewer: Viewer,
  input: RevenueEntryInsertInput,
  tx: DbOrTx = db,
): Promise<RevenueEntryRow | null> {
  void viewer;
  const [row] = await tx
    .insert(revenueEntries)
    .values({
      ...(input.id ? { id: input.id } : {}),
      projectId: input.projectId,
      kind: input.kind,
      entryDate: input.entryDate,
      amountCurrency: input.amountCurrency,
      amountForeignAmount: input.amountForeignAmount,
      amountFxRate: input.amountFxRate,
      amountAmountKrw: input.amountAmountKrw,
      note: input.note ?? null,
      source: input.source ?? "demo",
      customFields: input.customFields ?? {},
    })
    .onConflictDoNothing({ target: revenueEntries.id })
    .returning();
  return row ?? null;
}

export type RevenueEntryUpdateInput = Omit<RevenueEntryInsertInput, "id" | "projectId" | "kind" | "source">;

// 견적 줄과 같은 낙관적 잠금 — WHERE version = expectedVersion. 0행이면
// 충돌 또는 존재하지 않음(null).
export async function updateRevenueEntryIfVersionMatches(
  viewer: Viewer,
  id: string,
  expectedVersion: number,
  owner: { projectId: string; kind: RevenueEntryRow["kind"] },
  input: RevenueEntryUpdateInput,
  tx: DbOrTx = db,
): Promise<RevenueEntryRow | null> {
  void viewer;
  const [row] = await tx
    .update(revenueEntries)
    .set({
      entryDate: input.entryDate,
      amountCurrency: input.amountCurrency,
      amountForeignAmount: input.amountForeignAmount,
      amountFxRate: input.amountFxRate,
      amountAmountKrw: input.amountAmountKrw,
      note: input.note ?? null,
      version: sql`${revenueEntries.version} + 1`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(revenueEntries.id, id),
        eq(revenueEntries.version, expectedVersion),
        eq(revenueEntries.projectId, owner.projectId),
        eq(revenueEntries.kind, owner.kind),
        isNull(revenueEntries.archivedAt),
      ),
    )
    .returning();
  return row ?? null;
}

// 07.6-01 — 매출 줄 지우기(보관). R6 조건 UPDATE 틀 — 이 프로젝트 · 이 version · 보관 안 된 줄만. 0행이면 null(충돌 · 이미 보관).
export async function archiveRevenueEntryIfCurrent(
  viewer: Viewer,
  input: { id: string; projectId: string; expectedVersion: number; at: Date },
  tx: DbOrTx,
): Promise<RevenueEntryRow | null> {
  const [row] = await tx
    .update(revenueEntries)
    .set({ archivedAt: input.at, archivedBy: viewer.id, version: sql`${revenueEntries.version} + 1`, updatedAt: input.at })
    .where(
      and(
        eq(revenueEntries.id, input.id),
        eq(revenueEntries.projectId, input.projectId),
        eq(revenueEntries.version, input.expectedVersion),
        isNull(revenueEntries.archivedAt),
      ),
    )
    .returning();
  return row ?? null;
}

// 07.6-01 — 보관된 매출 줄 되살리기. expectedVersion은 되돌리기만 싣는다(지운 뒤 version — 그새 움직인 줄을 되살리지 않는다, eng r1 P2-A1).
// 보관함 복원기는 싣지 않는다. 0행이면 null.
export async function restoreRevenueEntryRow(
  viewer: Viewer,
  input: { id: string; projectId: string; at: Date; expectedVersion?: number },
  tx: DbOrTx,
): Promise<RevenueEntryRow | null> {
  void viewer;
  const [row] = await tx
    .update(revenueEntries)
    .set({ archivedAt: null, archivedBy: null, version: sql`${revenueEntries.version} + 1`, updatedAt: input.at })
    .where(
      and(
        eq(revenueEntries.id, input.id),
        eq(revenueEntries.projectId, input.projectId),
        isNotNull(revenueEntries.archivedAt),
        ...(input.expectedVersion !== undefined ? [eq(revenueEntries.version, input.expectedVersion)] : []),
      ),
    )
    .returning();
  return row ?? null;
}

// 07.6-01(D-7603) — 보관함 목록(repositories/archive.ts). 이름은 금액 없는 `{프로젝트 번호} {발행|입금} {날짜}`(A3 — 보관함은 매출 노출 정보 항목 밖,
// reserve-entries.ts 선례). projectArchived · projectCompleted는 복원 가능 판정 재료(D-7612) — 화면 DTO에 싣지 않는다.
export async function listArchivedRevenueEntryNames(viewer: Viewer): Promise<
  { id: string; name: string; archivedAt: Date; archivedBy: string | null; projectId: string; projectArchived: boolean; projectCompleted: boolean }[]
> {
  void viewer;
  const rows = await db
    .select({
      id: revenueEntries.id,
      kind: revenueEntries.kind,
      entryDate: revenueEntries.entryDate,
      archivedAt: revenueEntries.archivedAt,
      archivedBy: revenueEntries.archivedBy,
      projectId: projects.id,
      number: projects.number,
      projectArchivedAt: projects.archivedAt,
      projectStatus: projects.status,
    })
    .from(revenueEntries)
    .innerJoin(projects, eq(projects.id, revenueEntries.projectId))
    .where(isNotNull(revenueEntries.archivedAt));
  return rows.map((row) => ({
    id: row.id,
    name: `${row.number} ${row.kind === "issue" ? "발행" : "입금"} ${row.entryDate}`,
    archivedAt: row.archivedAt as Date,
    archivedBy: row.archivedBy,
    projectId: row.projectId,
    projectArchived: row.projectArchivedAt !== null,
    projectCompleted: row.projectStatus === "completed",
  }));
}
