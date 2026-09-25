import { and, desc, eq, lte } from "drizzle-orm";
import type { InferSelectModel } from "drizzle-orm";
import { db, type DbOrTx } from "@/db/client";
import { settingsSimple, settingsHistorized } from "@/db/schema";
import type { Viewer } from "@/domain/viewer";

export type SettingSimpleRow = InferSelectModel<typeof settingsSimple>;
export type SettingHistorizedRow = InferSelectModel<typeof settingsHistorized>;

export async function findSimpleValue(viewer: Viewer, key: string): Promise<SettingSimpleRow | null> {
  void viewer;
  const [row] = await db.select().from(settingsSimple).where(eq(settingsSimple.key, key)).limit(1);
  return row ?? null;
}

// 복합 UNIQUE가 아니라 PK(key) 대상 onConflictDoUpdate — 같은 키를 같은
// 값으로 두 번 저장해도 행이 하나로 유지되고, 다른 값이면 마지막 쓰기가
// 이긴다(동시 저장 안전).
export async function upsertSimpleValue(
  viewer: Viewer,
  key: string,
  value: unknown,
  by: string | null,
  tx: DbOrTx = db,
): Promise<void> {
  void viewer;
  await tx
    .insert(settingsSimple)
    .values({ key, value, updatedBy: by })
    .onConflictDoUpdate({
      target: settingsSimple.key,
      set: { value, updatedAt: new Date(), updatedBy: by },
    });
}

// effective_from <= asOf 중 최댓값 한 행 — 경계 포함(적용 시작일이 조회
// 기준일과 정확히 같은 행이 유효값이다).
export async function findEffectiveValue(
  viewer: Viewer,
  key: string,
  asOf: string,
): Promise<SettingHistorizedRow | null> {
  void viewer;
  const [row] = await db
    .select()
    .from(settingsHistorized)
    .where(and(eq(settingsHistorized.key, key), lte(settingsHistorized.effectiveFrom, asOf)))
    .orderBy(desc(settingsHistorized.effectiveFrom))
    .limit(1);
  return row ?? null;
}

// 적용 시작일 내림차순 — 복합 UNIQUE(key, effectiveFrom)가 같은 키에 같은
// 시작일 두 행을 허용하지 않으므로 이 정렬은 항상 결정적이다.
export async function listHistory(viewer: Viewer, key: string): Promise<SettingHistorizedRow[]> {
  void viewer;
  return db
    .select()
    .from(settingsHistorized)
    .where(eq(settingsHistorized.key, key))
    .orderBy(desc(settingsHistorized.effectiveFrom));
}

// 복합 UNIQUE가 중복 (key, effectiveFrom)을 거부한다 — 두 번째 삽입은 이
// 함수가 그대로 throw한다(domain이 삼키지 않는다).
export async function insertHistorizedValue(
  viewer: Viewer,
  input: { key: string; effectiveFrom: string; value: unknown; by: string | null },
): Promise<SettingHistorizedRow> {
  void viewer;
  const [row] = await db
    .insert(settingsHistorized)
    .values({
      key: input.key,
      effectiveFrom: input.effectiveFrom,
      value: input.value,
      createdBy: input.by,
    })
    .returning();
  if (!row) throw new Error("settings_historized insert가 행을 반환하지 않았습니다.");
  return row;
}

// 과거 행을 수정·삭제하는 경로는 없다 — 이 함수는 domain의
// cancelHistorizedValue가 "적용 시작일이 미래"임을 확인한 뒤에만 부른다.
export async function deleteFutureHistorizedValue(
  viewer: Viewer,
  key: string,
  effectiveFrom: string,
): Promise<void> {
  void viewer;
  await db
    .delete(settingsHistorized)
    .where(and(eq(settingsHistorized.key, key), eq(settingsHistorized.effectiveFrom, effectiveFrom)));
}

// 멱등 시드 전용(onConflictDoNothing) — 이미 값이 저장돼 있으면 건드리지
// 않는다(사용자가 이미 바꾼 값을 시드가 덮어쓰지 않는다).
export async function seedSimpleValue(viewer: Viewer, key: string, value: unknown): Promise<boolean> {
  void viewer;
  const inserted = await db
    .insert(settingsSimple)
    .values({ key, value })
    .onConflictDoNothing({ target: settingsSimple.key })
    .returning({ key: settingsSimple.key });
  return inserted.length > 0;
}

export async function seedHistorizedValue(
  viewer: Viewer,
  key: string,
  effectiveFrom: string,
  value: unknown,
): Promise<boolean> {
  void viewer;
  const inserted = await db
    .insert(settingsHistorized)
    .values({ key, effectiveFrom, value })
    .onConflictDoNothing({ target: [settingsHistorized.key, settingsHistorized.effectiveFrom] })
    .returning({ id: settingsHistorized.id });
  return inserted.length > 0;
}

export type SettingsImportInput = {
  simple: Array<{ key: string; value: unknown; by: string | null }>;
  historized: Array<{ key: string; effectiveFrom: string; value: unknown; by: string | null }>;
};

// T-03-24: JSON 가져오기의 실제 적용 지점 — domain/settings/export.ts가 전
// 항목을 먼저 검증한 뒤에만 이 함수를 부른다. 한 트랜잭션 안에서 적용해
// 부분 적용 상태가 남지 않는다. 이력 항목은 이미 있는 (key, effectiveFrom)
// 이면 건너뛰어(onConflictDoNothing) 같은 JSON을 두 번 가져와도 멱등이다.
export async function applySettingsImport(viewer: Viewer, input: SettingsImportInput): Promise<void> {
  void viewer;
  await db.transaction(async (tx) => {
    for (const item of input.simple) {
      await tx
        .insert(settingsSimple)
        .values({ key: item.key, value: item.value, updatedBy: item.by })
        .onConflictDoUpdate({
          target: settingsSimple.key,
          set: { value: item.value, updatedAt: new Date(), updatedBy: item.by },
        });
    }
    for (const item of input.historized) {
      await tx
        .insert(settingsHistorized)
        .values({
          key: item.key,
          effectiveFrom: item.effectiveFrom,
          value: item.value,
          createdBy: item.by,
        })
        .onConflictDoNothing({ target: [settingsHistorized.key, settingsHistorized.effectiveFrom] });
    }
  });
}
