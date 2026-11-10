import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { actionLog, evidenceRecords } from "@/db/schema";
import { createAccount } from "@/domain/auth/accounts";
import { createCorpCard } from "@/domain/corp-cards";
import { listArchivableEvidence } from "@/domain/evidence-records";
import { archiveEvidenceBatch, EVIDENCE_BATCH_LIMIT, restoreEvidenceBatch } from "@/domain/evidence-records/batch";
import { ForbiddenError } from "@/domain/permissions/can";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { UserFacingError } from "@/lib/actions/user-facing-error";
import { lotteFixture } from "@/test/fixtures/evidence-import/build";
import { createIntakeViewer, insertLiveLinkFixture, insertRecordFixture, registerFixtureFile, setRecordArchivedFixture } from "./fixtures/evidence";

// 07.2-09(X1 · D-7281~7283): 증빙 일괄 보관 — 행마다 단건 함수를 부르는 얇은 래퍼. 붙은 줄 · 다른 사람이 먼저 바꾼 줄만 이름 대고 나머지는 보관한다.

const ATTACHED_REASON = "붙은 문서 있음 · 먼저 떼기";

async function versionOf(id: string): Promise<number> {
  const [row] = await db.select({ version: evidenceRecords.version }).from(evidenceRecords).where(eq(evidenceRecords.id, id));
  if (!row) throw new Error(`줄 없음: ${id}`);
  return row.version;
}

async function snapshot(ids: readonly string[]): Promise<{ id: string; version: number }[]> {
  return Promise.all(ids.map(async (id) => ({ id, version: await versionOf(id) })));
}

async function archivedAtOf(id: string): Promise<Date | null> {
  const [row] = await db.select({ archivedAt: evidenceRecords.archivedAt }).from(evidenceRecords).where(eq(evidenceRecords.id, id));
  return row?.archivedAt ?? null;
}

describe("domain/evidence-records/batch — 일괄 보관 · 되돌리기 (07.2-09)", () => {
  it("3건(1건 붙음) → 2건 보관 · 붙은 줄은 이름 대고 막힘 · 한 줄 실패가 나머지를 막지 않는다", async () => {
    const intake = await createIntakeViewer();
    const [a, b, attached] = [await insertRecordFixture(intake), await insertRecordFixture(intake), await insertRecordFixture(intake)] as [string, string, string];
    await insertLiveLinkFixture(attached, intake.id);

    // 붙은 줄을 맨 앞에 둬 앞 줄 실패가 뒤 줄을 막지 않는지 본다.
    const result = await archiveEvidenceBatch(intake, await snapshot([attached, a, b]));

    expect(result.processed.map((row) => row.id).sort()).toEqual([a, b].sort());
    expect(result.blocked).toEqual([{ id: attached, reason: ATTACHED_REASON }]);
    expect(await archivedAtOf(a)).toBeInstanceOf(Date);
    expect(await archivedAtOf(b)).toBeInstanceOf(Date);
    expect(await archivedAtOf(attached)).toBeNull();
    // 처리된 줄은 보관이 돌려준 새 version이다(되돌리기 입력).
    expect(result.processed.find((row) => row.id === a)?.version).toBe(await versionOf(a));
  });

  it("화면 version으로 보낸 뒤 그 줄이 붙으면(version도 오름) 붙음이 version 다름보다 먼저 이유가 된다", async () => {
    const intake = await createIntakeViewer();
    const id = await insertRecordFixture(intake);
    const seen = await snapshot([id]);
    await insertLiveLinkFixture(id, intake.id);
    await db.update(evidenceRecords).set({ version: sql`${evidenceRecords.version} + 1` }).where(eq(evidenceRecords.id, id));

    const result = await archiveEvidenceBatch(intake, seen);

    expect(result.processed).toEqual([]);
    expect(result.blocked).toEqual([{ id, reason: ATTACHED_REASON }]);
  });

  it("다른 사람이 먼저 바꾼 줄(붙지 않고 version만 다름)은 단건 충돌 글자 그대로 막힘", async () => {
    const intake = await createIntakeViewer();
    const [stale, fine] = [await insertRecordFixture(intake), await insertRecordFixture(intake)] as [string, string];
    const seen = await snapshot([stale, fine]);
    await db.update(evidenceRecords).set({ version: sql`${evidenceRecords.version} + 1` }).where(eq(evidenceRecords.id, stale));

    const result = await archiveEvidenceBatch(intake, seen);

    expect(result.processed.map((row) => row.id)).toEqual([fine]);
    expect(result.blocked).toHaveLength(1);
    expect(result.blocked[0]?.id).toBe(stale);
    expect(result.blocked[0]?.reason).toMatch(/^다른 사람이 .+ 바꿈 · 새로 고침$/);
  });

  it("모르는 오류는 한 글자 `보관 실패 · 다시 시도`로 막힘 · 없는 id도 나머지를 막지 않는다", async () => {
    const intake = await createIntakeViewer();
    const good = await insertRecordFixture(intake);
    const seen = await snapshot([good]);

    const result = await archiveEvidenceBatch(intake, [{ id: randomUUID(), version: 1 }, ...seen]);

    expect(result.processed.map((row) => row.id)).toEqual([good]);
    expect(result.blocked).toHaveLength(1);
    expect(result.blocked[0]?.reason).toEqual(expect.any(String));
  });

  it("같은 id를 두 번 보내도 한 번만 처리한다", async () => {
    const intake = await createIntakeViewer();
    const id = await insertRecordFixture(intake);
    const [seen] = await snapshot([id]);
    if (!seen) throw new Error("스냅숏 없음");

    const result = await archiveEvidenceBatch(intake, [seen, seen]);

    expect(result.processed).toHaveLength(1);
    expect(result.blocked).toEqual([]);
  });

  it("되돌리기 한 번 — 보관 결과 전체가 복귀 · 하나가 그새 바뀌었으면 막힘 1건", async () => {
    const intake = await createIntakeViewer();
    const ids = [await insertRecordFixture(intake), await insertRecordFixture(intake), await insertRecordFixture(intake)];
    const archived = await archiveEvidenceBatch(intake, await snapshot(ids));
    expect(archived.processed).toHaveLength(3);

    const all = await restoreEvidenceBatch(intake, archived.processed);
    expect(all.processed).toHaveLength(3);
    expect(all.blocked).toEqual([]);
    for (const id of ids) expect(await archivedAtOf(id)).toBeNull();

    // 다시 보관한 뒤 한 줄을 그새 바꾸면 되돌림 n건 · 막힘 1건.
    const again = await archiveEvidenceBatch(intake, await snapshot(ids));
    const touched = again.processed[0];
    if (!touched) throw new Error("처리 줄 없음");
    await db.update(evidenceRecords).set({ version: sql`${evidenceRecords.version} + 1` }).where(eq(evidenceRecords.id, touched.id));
    const partial = await restoreEvidenceBatch(intake, again.processed);
    expect(partial.processed).toHaveLength(2);
    expect(partial.blocked.map((row) => row.id)).toEqual([touched.id]);
  });

  it("행동 로그는 처리한 줄마다 archive 한 줄 · 막힌 줄은 0", async () => {
    const intake = await createIntakeViewer();
    const [ok, attached] = [await insertRecordFixture(intake), await insertRecordFixture(intake)] as [string, string];
    await insertLiveLinkFixture(attached, intake.id);
    await archiveEvidenceBatch(intake, await snapshot([ok, attached]));

    const logs = await db.select().from(actionLog).where(inArray(actionLog.entityId, [ok, attached]));
    expect(logs.map((log) => [log.entityId, log.actionType])).toEqual([[ok, "archive"]]);
  });

  it("`evidence.intake` 권한 행이 없는 계정은 ForbiddenError · 아무것도 바뀌지 않는다", async () => {
    const intake = await createIntakeViewer();
    const id = await insertRecordFixture(intake);
    const { userId } = await createAccount(SYSTEM_VIEWER, { email: `batch-${randomUUID()}@example.test`, name: "권한 없음", roleId: "role-pm" });
    const pm: Viewer = { id: userId, roleId: "role-pm" };
    const seen = await snapshot([id]);

    await expect(archiveEvidenceBatch(pm, seen)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(restoreEvidenceBatch(pm, seen)).rejects.toBeInstanceOf(ForbiddenError);
    expect(await archivedAtOf(id)).toBeNull();
  });

  it("301건은 한 건도 처리하지 않고 `300건까지`로 거부", async () => {
    const intake = await createIntakeViewer();
    const id = await insertRecordFixture(intake);
    const [seen] = await snapshot([id]);
    if (!seen) throw new Error("스냅숏 없음");
    const items = Array.from({ length: EVIDENCE_BATCH_LIMIT + 1 }, (_, index) => (index === 0 ? seen : { id: randomUUID(), version: 1 }));

    await expect(archiveEvidenceBatch(intake, items)).rejects.toThrow("300건까지");
    await expect(archiveEvidenceBatch(intake, items)).rejects.toBeInstanceOf(UserFacingError);
    expect(await archivedAtOf(id)).toBeNull();
  });

  it("`?batch=` 묶음 전체 고르기 읽기 — 붙은 줄 · 보관된 줄을 빼고 id · version만, 상한 301까지", async () => {
    const intake = await createIntakeViewer();
    await createCorpCard(SYSTEM_VIEWER, { issuer: "롯데카드", numberLast4: "9201", label: "롯데 9201", kind: "shared" });
    const lines = ["92010001", "92010002", "92010003", "92010004"].map((approval) => ({ 카드번호: "9999000011119201", 승인번호: approval }));
    const { batchId } = await registerFixtureFile(intake, lotteFixture(lines), "묶음.xls");
    const stored = await db.select({ id: evidenceRecords.id, version: evidenceRecords.version }).from(evidenceRecords).where(eq(evidenceRecords.batchId, batchId));
    const [ok1, ok2, attached, archived] = stored as [(typeof stored)[number], (typeof stored)[number], (typeof stored)[number], (typeof stored)[number]];
    await insertLiveLinkFixture(attached.id, intake.id);
    await setRecordArchivedFixture(archived.id, intake.id);

    const items = await listArchivableEvidence(intake, { state: "all", batch: batchId });

    expect(items.map((row) => row.id).sort()).toEqual([ok1.id, ok2.id].sort());
    expect(items.find((row) => row.id === ok1.id)).toEqual({ id: ok1.id, version: ok1.version });
  });

  it("`?batch=` 읽기도 `evidence.intake` 쓰기가 없으면 빈 목록", async () => {
    const { userId } = await createAccount(SYSTEM_VIEWER, { email: `batch-${randomUUID()}@example.test`, name: "권한 없음", roleId: "role-pm" });
    expect(await listArchivableEvidence({ id: userId, roleId: "role-pm" }, { state: "all", batch: randomUUID() })).toEqual([]);
  });
});
