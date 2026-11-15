import { eq, inArray, notInArray, sql } from "drizzle-orm";
import { db, type DbOrTx } from "@/db/client";
import { documentCounters, files, settingsSimple } from "@/db/schema";
import type { Viewer } from "@/domain/viewer";
import { DEMO_SOURCE, LIVE_SOURCE } from "@/domain/cutover/tables";
import { lockSimpleKey, upsertSimpleValue } from "@/repositories/settings";

// 08-02(D8-05 · C4): 전환 표시 = settings_simple 키 하나(값 = 서울 시각 ISO, 비면 전환 전). 설정 레지스트리에는 올리지 않는다(D3 = A).
export const CUTOVER_MARKER_KEY = "cutover.at";

// 표 이름은 domain/cutover/tables.ts 상수에서만 온다(바깥 입력 없음 — T-08-02-09).

function isMarkerSet(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

// 쓰기 지점이 새 행의 source를 정한다. 공유 잠금(apply는 배타)을 잡은 뒤 **다음 문장에서** 표시를 읽는다 — 한 문장으로
// 합치면 스냅숏이 잠금 대기 전에 잡혀 apply 커밋 뒤에도 'demo'를 쓴다(eng 검토 1회차 2026-11-04 E3).
export async function rowSource(viewer: Viewer, tx: DbOrTx = db): Promise<string> {
  void viewer;
  await tx.execute(sql`select pg_advisory_xact_lock_shared(hashtextextended(${`settings_simple:${CUTOVER_MARKER_KEY}`}, 0))`);
  const [row] = await tx.select({ value: settingsSimple.value }).from(settingsSimple).where(eq(settingsSimple.key, CUTOVER_MARKER_KEY)).limit(1);
  return isMarkerSet(row?.value) ? LIVE_SOURCE : DEMO_SOURCE;
}

export async function lockMarkerExclusive(viewer: Viewer, tx: DbOrTx): Promise<void> {
  await lockSimpleKey(viewer, CUTOVER_MARKER_KEY, tx);
}

// 읽기는 막지 않고 쓰기만 apply 커밋 뒤로 민다(eng 검토 1회차 2026-11-04 E2).
export async function lockDeleteTables(viewer: Viewer, tables: readonly string[], tx: DbOrTx): Promise<void> {
  void viewer;
  await tx.execute(sql`LOCK TABLE ${sql.join(tables.map((table) => sql.identifier(table)), sql`, `)} IN SHARE ROW EXCLUSIVE MODE`);
}

export async function readMarker(viewer: Viewer, tx: DbOrTx = db): Promise<string | null> {
  void viewer;
  const [row] = await tx.select({ value: settingsSimple.value }).from(settingsSimple).where(eq(settingsSimple.key, CUTOVER_MARKER_KEY)).limit(1);
  return isMarkerSet(row?.value) ? row.value : null;
}

export async function writeMarker(viewer: Viewer, at: string, tx: DbOrTx): Promise<void> {
  await upsertSimpleValue(viewer, CUTOVER_MARKER_KEY, at, null, tx);
}

export async function countRows(viewer: Viewer, table: string, tx: DbOrTx = db): Promise<number> {
  void viewer;
  const result = await tx.execute<{ n: number }>(sql`select count(*)::int as n from ${sql.identifier(table)}`);
  return Number(result.rows[0]?.n ?? 0);
}

export async function deleteAll(viewer: Viewer, table: string, tx: DbOrTx): Promise<number> {
  void viewer;
  const result = await tx.execute(sql`delete from ${sql.identifier(table)}`);
  return result.rowCount ?? 0;
}

// files · upload_intents — 지울 소유 종류의 행만(거래처 서류 · 회사 로고는 남는다).
export async function countByOwnerKinds(viewer: Viewer, table: string, kinds: readonly string[], tx: DbOrTx = db): Promise<number> {
  void viewer;
  const result = await tx.execute<{ n: number }>(
    sql`select count(*)::int as n from ${sql.identifier(table)} where owner_kind in (${sql.join(kinds.map((kind) => sql`${kind}`), sql`, `)})`,
  );
  return Number(result.rows[0]?.n ?? 0);
}

export async function deleteByOwnerKinds(viewer: Viewer, table: string, kinds: readonly string[], tx: DbOrTx): Promise<number> {
  void viewer;
  const result = await tx.execute(sql`delete from ${sql.identifier(table)} where owner_kind in (${sql.join(kinds.map((kind) => sql`${kind}`), sql`, `)})`);
  return result.rowCount ?? 0;
}

// 지울 증빙 파일의 저장소 키 — apply가 삭제 전에 같은 트랜잭션에서 읽는다(커밋 뒤 객체 정리).
export async function listFileObjectKeys(viewer: Viewer, kinds: readonly string[], tx: DbOrTx = db): Promise<string[]> {
  void viewer;
  const rows = await tx.select({ objectKey: files.objectKey }).from(files).where(inArray(files.ownerKind, [...kinds])).orderBy(files.objectKey);
  return rows.map((row) => row.objectKey);
}

export async function countCounterRowsExcept(viewer: Viewer, keepKeys: readonly string[], tx: DbOrTx = db): Promise<number> {
  void viewer;
  const [row] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(documentCounters)
    .where(notInArray(documentCounters.counterKey, [...keepKeys]));
  return Number(row?.n ?? 0);
}

export async function resetCountersExcept(viewer: Viewer, keepKeys: readonly string[], tx: DbOrTx): Promise<number> {
  void viewer;
  const result = await tx.delete(documentCounters).where(notInArray(documentCounters.counterKey, [...keepKeys]));
  return result.rowCount ?? 0;
}

// 전환 뒤 dry-run의 확인 — source 칸이 있는 표(예외 제외)에 남은 demo 행 수의 합.
export async function countDemoRows(viewer: Viewer, exceptTables: readonly string[], tx: DbOrTx = db): Promise<number> {
  void viewer;
  const tables = await tx.execute<{ table_name: string }>(
    sql`select table_name from information_schema.columns where table_schema = 'public' and column_name = 'source' order by table_name`,
  );
  let total = 0;
  for (const { table_name: table } of tables.rows) {
    if (exceptTables.includes(table)) continue;
    const result = await tx.execute<{ n: number }>(sql`select count(*)::int as n from ${sql.identifier(table)} where source = ${DEMO_SOURCE}`);
    total += Number(result.rows[0]?.n ?? 0);
  }
  return total;
}
