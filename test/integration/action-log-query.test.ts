import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { DEFAULT_ROLE_ID, SYSADMIN_ROLE_ID } from "@/domain/permissions/roles";
import { recordAction } from "@/domain/action-log/record";
import { queryActionLog, pruneActionLog, parseActionLogDateBoundary, ForbiddenError } from "@/domain/action-log";
import { exportActionLog } from "@/domain/action-log/export";
import { createVendor } from "@/domain/vendors";

function uniqueDocumentId(): string {
  return `doc-${randomUUID()}`;
}

async function makeTestUser(): Promise<{ id: string; roleId: string; name: string }> {
  const id = `action-log-actor-${randomUUID()}`;
  const name = `행동로그테스터-${randomUUID().slice(0, 8)}`;
  await db.insert(users).values({ id, name, email: `${randomUUID()}@test.local`, roleId: SYSADMIN_ROLE_ID });
  return { id, roleId: SYSADMIN_ROLE_ID, name };
}

// action_log.actor_id는 users.id에 FK를 건다 — 실제 행위자 필터 테스트는
// 진짜 users 행이 있는 viewer로 기록해야 한다(vendors.test.ts의
// makeTestPmViewer와 같은 패턴).
async function recordDocumentCreate(actor: { id: string; roleId: string }, documentId: string): Promise<void> {
  await recordAction(actor, { actionType: "document_create", documentId });
}

describe("action-log 조회·필터·정리 (ADMN-10·OPS-05, 실제 Postgres)", () => {
  it("필터 축을 하나도 안 주면 정리되지 않은 전체 행이 최신 순으로 나온다", async () => {
    const actor = await makeTestUser();
    const doc1 = uniqueDocumentId();
    const doc2 = uniqueDocumentId();
    await recordDocumentCreate(actor, doc1);
    await recordDocumentCreate(actor, doc2);

    const rows = await queryActionLog(SYSTEM_VIEWER, {});
    const idx1 = rows.findIndex((row) => row.documentId === doc1);
    const idx2 = rows.findIndex((row) => row.documentId === doc2);
    expect(idx1).toBeGreaterThanOrEqual(0);
    expect(idx2).toBeGreaterThanOrEqual(0);
    // 최신(나중에 기록된) 행이 앞에 온다 — 기본 정렬이 최신 순.
    expect(idx2).toBeLessThan(idx1);
  });

  it("사람·행동 종류·문서 세 축이 함께 걸리면 결과가 교집합이다", async () => {
    const actorA = await makeTestUser();
    const actorB = await makeTestUser();
    const sharedDoc = uniqueDocumentId();
    await recordDocumentCreate(actorA, sharedDoc);
    await recordDocumentCreate(actorB, sharedDoc);

    const rows = await queryActionLog(SYSTEM_VIEWER, {
      actorId: actorA.id,
      actionType: "document_create",
      documentId: sharedDoc,
    });
    expect(rows.length).toBe(1);
    expect(rows[0]?.actorId).toBe(actorA.id);
    expect(rows[0]?.actorName).toBe(actorA.name);
  });

  it("기간 필터(오늘 하루)가 방금 기록된 행을 포함하고, 어제까지의 기간은 제외한다 — 밀리초 단위 경계 포함 자체는 단위 테스트(filter.test.ts)가 증명한다", async () => {
    const actor = await makeTestUser();
    const doc = uniqueDocumentId();
    await recordDocumentCreate(actor, doc);

    const todayIso = new Date().toISOString().slice(0, 10);
    const rows = await queryActionLog(SYSTEM_VIEWER, {
      documentId: doc,
      from: parseActionLogDateBoundary(todayIso, "start"),
      to: parseActionLogDateBoundary(todayIso, "end"),
    });
    expect(rows.length).toBe(1);

    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const rowsBeforeToday = await queryActionLog(SYSTEM_VIEWER, {
      documentId: doc,
      to: parseActionLogDateBoundary(yesterday, "end"),
    });
    expect(rowsBeforeToday.length).toBe(0);
  });

  it("정리 후 기본 조회에서 빠지고, 정리 포함 옵션에서만 나온다", async () => {
    const actor = await makeTestUser();
    const doc = uniqueDocumentId();
    await recordDocumentCreate(actor, doc);

    const beforePrune = await queryActionLog(SYSTEM_VIEWER, { documentId: doc });
    expect(beforePrune.length).toBe(1);

    await pruneActionLog(SYSTEM_VIEWER, { documentId: doc });

    const afterPrune = await queryActionLog(SYSTEM_VIEWER, { documentId: doc });
    expect(afterPrune.length).toBe(0);

    const withPruned = await queryActionLog(SYSTEM_VIEWER, { documentId: doc, includePruned: true });
    expect(withPruned.length).toBe(1);
    expect(withPruned[0]?.prunedAt).not.toBeNull();
  });

  it("정리 행위 자체가 행동 로그 행 하나로 추가되고, 그 행은 다음 정리의 대상이 아니다(두 번 정리해도 첫 기록이 남는다)", async () => {
    const actor = await makeTestUser();
    const doc = uniqueDocumentId();
    await recordDocumentCreate(actor, doc);

    const result = await pruneActionLog(SYSTEM_VIEWER, { documentId: doc });
    expect(result.count).toBe(1);

    const pruneLogs = await queryActionLog(SYSTEM_VIEWER, { actionType: "action_log_prune" });
    const firstPruneLog = pruneLogs.find(
      (row) => (row.detail as { filter?: { documentId?: string } }).filter?.documentId === doc,
    );
    expect(firstPruneLog).toBeTruthy();

    // 두 번째 정리 — 대상이 없으므로(문서 필터가 이미 정리된 행만 가리킨다)
    // 0건이어야 하고, 첫 정리 기록 자체는 정리 대상이 아니므로 여전히 존재한다.
    const second = await pruneActionLog(SYSTEM_VIEWER, { documentId: doc });
    expect(second.count).toBe(0);

    const pruneLogsAfter = await queryActionLog(SYSTEM_VIEWER, {
      actionType: "action_log_prune",
      includePruned: true,
    });
    const stillThere = pruneLogsAfter.find((row) => row.seq === firstPruneLog?.seq);
    expect(stillThere).toBeTruthy();
    expect(stillThere?.prunedAt).toBeNull();
  });

  it("열람 권한이 없는 계급의 조회가 거부된다", async () => {
    const pmViewer = { id: `pm-${randomUUID()}`, roleId: DEFAULT_ROLE_ID };
    await expect(queryActionLog(pmViewer, {})).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("정리 쓰기 권한이 없는 계급의 정리 요청이 거부된다", async () => {
    const pmViewer = { id: `pm-${randomUUID()}`, roleId: DEFAULT_ROLE_ID };
    await expect(pruneActionLog(pmViewer, {})).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("내보내기가 excel_export 행동 로그 행 하나를 남긴다 — 설정 조회를 throw로 스텁해도 남는다(ALWAYS_ON)", async () => {
    const before = await queryActionLog(SYSTEM_VIEWER, { actionType: "excel_export" });
    const file = await exportActionLog(
      SYSTEM_VIEWER,
      {},
      {
        recordAction: (viewer, entry) =>
          recordAction(viewer, entry, {
            isActionTypeEnabled: () => {
              throw new Error("excel_export는 항상 켬 종류라 설정 조회를 부르면 안 된다");
            },
          }),
      },
    );
    expect(file.body.charCodeAt(0)).toBe(0xfeff);
    const after = await queryActionLog(SYSTEM_VIEWER, { actionType: "excel_export" });
    expect(after.length).toBe(before.length + 1);
  });

  // 결함 1: 정리(prune)·Excel 내보내기가 필터에 담은 actorId(내부 사용자 id)가
  // 상세(detail)에 원문 그대로 저장돼 화면·CSV로 샜다. 사람이 관련된 상세라면
  // id가 아니라 이름을 보여줘야 한다(record.ts의 원칙 — snake_case 내부 토큰을
  // 사용자에게 그대로 보여주지 않는다 — 를 detail에도 적용한다).
  it("정리 필터에 담긴 actorId가 상세에 이름으로 나타나고 원문 id는 남지 않는다(결함 1)", async () => {
    const filterTarget = await makeTestUser();

    await pruneActionLog(SYSTEM_VIEWER, { actorId: filterTarget.id });

    const rows = await queryActionLog(SYSTEM_VIEWER, { actionType: "action_log_prune", includePruned: true });
    const pruneRow = rows.find(
      (row) => (row.detail as { filter?: { actorId?: string | null } }).filter?.actorId === filterTarget.name,
    );
    expect(pruneRow).toBeTruthy();

    const leaked = rows.some(
      (row) => (row.detail as { filter?: { actorId?: string | null } }).filter?.actorId === filterTarget.id,
    );
    expect(leaked).toBe(false);
  });

  // 결함 2: 상세 상단의 대상(entity/entityId)이 raw UUID 그대로였다 — 행동
  // 종류(ACTION_TYPE_LABELS)는 한글화됐는데 대상은 그렇지 않았다. entityName이
  // 새로 추가돼 사람이 읽을 수 있는 이름을 담아야 한다.
  it("거래처 등록 로그의 대상이 거래처 이름으로 나타난다 — entityId가 그대로 새지 않는다(결함 2)", async () => {
    const vendorName = `행동로그거래처-${randomUUID()}`;
    const { vendor } = await createVendor(SYSTEM_VIEWER, { name: vendorName });

    const rows = await queryActionLog(SYSTEM_VIEWER, { actionType: "document_create" });
    const vendorRow = rows.find((row) => row.entity === "vendor" && row.entityId === vendor.id);
    expect(vendorRow?.entityName).toBe(vendorName);
  });

  it("존재하지 않는(삭제된) 거래처를 가리키는 오래된 행은 entityId로 안전하게 내려앉는다(결함 2, 열람 불가 엔티티)", async () => {
    const missingVendorId = randomUUID();
    await recordAction(SYSTEM_VIEWER, {
      actionType: "document_create",
      entity: "vendor",
      entityId: missingVendorId,
    });

    const rows = await queryActionLog(SYSTEM_VIEWER, { actionType: "document_create" });
    const row = rows.find((r) => r.entity === "vendor" && r.entityId === missingVendorId);
    expect(row?.entityName).toBe(missingVendorId);
  });

  it("같은 필터로 두 번 조회하면 같은 순서의 같은 행 집합이 나온다", async () => {
    const actor = await makeTestUser();
    const doc = uniqueDocumentId();
    await recordDocumentCreate(actor, doc);
    await recordDocumentCreate(actor, doc);

    const first = await queryActionLog(SYSTEM_VIEWER, { documentId: doc });
    const second = await queryActionLog(SYSTEM_VIEWER, { documentId: doc });
    expect(second.map((row) => row.seq)).toEqual(first.map((row) => row.seq));
  });
});
