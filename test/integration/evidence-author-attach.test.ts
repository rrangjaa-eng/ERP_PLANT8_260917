import { randomUUID } from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db, pool } from "@/db/client";
import { actionLog, approvalInstances, evidenceRecordLinks, expenses, projects, purchaseRequests, quoteLines } from "@/db/schema";
import { approveDocument } from "@/domain/approvals";
import { EVIDENCE_COMPLETED_PROJECT_LOCKED, EVIDENCE_LOCKED_IN_REVIEW, EVIDENCE_REMOVE_LOCKED_APPROVED, getEvidenceActions } from "@/domain/evidence";
import { ATTACH_BATCH_CAP_LINE, ATTACH_BATCH_MAX, attachEvidenceAsAuthor, attachEvidenceBatch, detachOwnEvidence } from "@/domain/evidence-records/attach";
import { listLinkedEvidence } from "@/domain/evidence-records/linked";
import { countEvidencePool, evidencePickerMode } from "@/domain/evidence-records/pool";
import { submitExpense, withdrawExpense } from "@/domain/expenses";
import { cancelPurchaseRequest, listPurchaseRequests, precheckPurchaseCancel } from "@/domain/purchase-requests";
import { PAYMENT_METHOD_EVIDENCE_PAIRS } from "@/domain/settings/keys";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { insertOrgUnit } from "@/repositories/org-units";
import { upsertSimpleValue } from "@/repositories/settings";
import { insertTeam } from "@/repositories/teams";
import { teamIdByName } from "./approvals-fixtures";
import { attachEvidence, setupExpenseProject, type ExpenseFixture } from "./fixtures/expenses";
import { createDraftExpenseFixture, createInReviewExpenseFixture, createIntakeManager, createPmInTeam, createReturnedExpenseFixture, insertLinkFixture, insertRecordFixture, setRecordArchivedFixture, setRecordVisibilityFixture } from "./fixtures/evidence";
import { setEvidenceRequired } from "./fixtures/payments";
import { purchaseProject, request as createRequest, type PurchaseFx } from "./fixtures/purchase-requests";
import { deferred, waitForLockWaiter } from "./lock-race";

// 06.1-08 Task 1(RP-4 · D-6520 · E-49): 작성자 갈래 붙이기. 05 규칙표 위 권리(작성자 칸) · 범위(1팀 공개) · 한 트랜잭션 전부-아니면-전무 ·
// 문서 금액 칸 그대로. 경영관리 갈래와 경합 · 여러 장 상한은 evidence-multi-attach.test.ts.

let fx: ExpenseFixture;
let team1: string;

beforeEach(async () => {
  await setEvidenceRequired(false);
  await upsertSimpleValue(SYSTEM_VIEWER, PAYMENT_METHOD_EVIDENCE_PAIRS.key, [], null);
  fx = await setupExpenseProject();
  team1 = await teamIdByName("기획1팀");
});

async function caught(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => undefined,
    (error: unknown) => error,
  );
}

async function messageOf(promise: Promise<unknown>): Promise<string> {
  const error = await caught(promise);
  if (!(error instanceof Error)) throw new Error("거부되지 않았다");
  return error.message;
}

async function publish(by: Awaited<ReturnType<typeof createIntakeManager>>, input: Parameters<typeof insertRecordFixture>[1] = {}): Promise<string> {
  const id = await insertRecordFixture(by, input);
  await setRecordVisibilityFixture(id, { visibility: "team", teamId: team1 });
  return id;
}

async function liveLinks(recordId: string) {
  return db
    .select()
    .from(evidenceRecordLinks)
    .where(and(eq(evidenceRecordLinks.evidenceRecordId, recordId), isNull(evidenceRecordLinks.detachedAt)));
}

async function moneyOf(expenseId: string) {
  const [row] = await db.select({ supply: expenses.supplyAmountKrw, vat: expenses.vatKrw, payable: expenses.payableKrw, version: expenses.version }).from(expenses).where(eq(expenses.id, expenseId));
  if (!row) throw new Error("지출결의 없음");
  return row;
}

async function attachLogs(expenseId: string) {
  return db
    .select({ seq: actionLog.seq, detail: actionLog.detail })
    .from(actionLog)
    .where(and(eq(actionLog.entity, "evidence_record"), eq(actionLog.documentId, expenseId), eq(actionLog.actionType, "document_update")));
}

async function instanceOf(expenseId: string): Promise<{ id: string; version: number }> {
  const [row] = await db.select({ id: approvalInstances.id, version: approvalInstances.version }).from(approvalInstances).where(eq(approvalInstances.documentId, expenseId));
  if (!row) throw new Error("결재 인스턴스 없음");
  return row;
}

async function approveFresh(expenseId: string): Promise<void> {
  const instance = await instanceOf(expenseId);
  const first = await approveDocument(fx.lead, { instanceId: instance.id, expectedVersion: instance.version });
  const final = await approveDocument(fx.ceo, { instanceId: instance.id, expectedVersion: first.version });
  if (final.status !== "approved") throw new Error(`결재 통과 안 됨: ${final.status}`);
}

const owner = (id: string) => ({ kind: "expense" as const, id });

describe("attachEvidenceAsAuthor — 트레이서 (06.1-08 Task 1)", () => {
  it("작성자 PM이 자기 임시 지출결의에 1팀 공개 증빙 하나 → 붙임 1행(author · attached_by = PM) · 금액 · version 그대로 · 행동 로그 한 줄", async () => {
    const intake = await createIntakeManager();
    const draft = await createDraftExpenseFixture(fx);
    const recordId = await publish(intake);
    const before = await moneyOf(draft);

    expect(await attachEvidenceAsAuthor(fx.pm, { evidenceIds: [recordId], owner: owner(draft) })).toEqual({ attached: 1 });

    const links = await liveLinks(recordId);
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({ ownerKind: "expense", ownerId: draft, attachMode: "author", attachedBy: fx.pm.id });
    expect(await moneyOf(draft)).toEqual(before);
    const logs = await attachLogs(draft);
    expect(logs).toHaveLength(1);
    expect(logs[0]?.detail).toMatchObject({ change: "evidence_record_attach", attachMode: "author", recordIds: [recordId] });
  });

  it("여러 장은 한 트랜잭션 — 3건 모두 붙고 행동 로그는 한 줄이다(PA-BATCH)", async () => {
    const intake = await createIntakeManager();
    const draft = await createDraftExpenseFixture(fx);
    const ids = [await publish(intake), await publish(intake), await publish(intake)];
    expect(await attachEvidenceAsAuthor(fx.pm, { evidenceIds: ids, owner: owner(draft) })).toEqual({ attached: 3 });
    for (const id of ids) expect(await liveLinks(id)).toHaveLength(1);
    expect(await attachLogs(draft)).toHaveLength(1);
  });

  it("붙은 증빙을 같은 문서에 다시 보내면(두 탭) 붙은 증빙은 작성자 범위에서 빠져 없는 증빙 거부 · 붙임 1행 · 행동 로그 그대로", async () => {
    const intake = await createIntakeManager();
    const draft = await createDraftExpenseFixture(fx);
    const recordId = await publish(intake);
    await attachEvidenceAsAuthor(fx.pm, { evidenceIds: [recordId], owner: owner(draft) });
    expect(await messageOf(attachEvidenceAsAuthor(fx.pm, { evidenceIds: [recordId], owner: owner(draft) }))).toBe("없는 증빙 · 새로 고침");
    expect(await liveLinks(recordId)).toHaveLength(1);
    expect(await attachLogs(draft)).toHaveLength(1);
  });
});

describe("attachEvidenceAsAuthor — 거부 (RP-4 · 못 보는 대상은 같은 거부)", () => {
  it("팀장(작성자 아님)은 대리로 붙일 수 없다 — 없는 지출결의와 같은 거부 · 붙임 0", async () => {
    const intake = await createIntakeManager();
    const draft = await createDraftExpenseFixture(fx);
    const recordId = await publish(intake);
    const unseen = await messageOf(attachEvidenceAsAuthor(fx.lead, { evidenceIds: [recordId], owner: owner(draft) }));
    const missing = await messageOf(attachEvidenceAsAuthor(fx.lead, { evidenceIds: [recordId], owner: owner("00000000-0000-4000-8000-000000000000") }));
    expect(unseen).toBe(missing);
    expect(await liveLinks(recordId)).toHaveLength(0);
  });

  it("범위 밖 증빙(미공개 · 2팀 공개)이 하나라도 끼면 전체 거부 — 같은 글자 하나 · 고른 나머지도 붙지 않는다", async () => {
    const intake = await createIntakeManager();
    const draft = await createDraftExpenseFixture(fx);
    const ok = await publish(intake);
    const privateRow = await insertRecordFixture(intake);
    const otherDivision = await insertOrgUnit(SYSTEM_VIEWER, { name: `범위다른본부-${randomUUID().slice(0, 6)}` });
    const otherTeam = await insertTeam(SYSTEM_VIEWER, { orgUnitId: otherDivision.id, name: `범위다른팀-${randomUUID().slice(0, 6)}` });
    const otherTeamRow = await insertRecordFixture(intake);
    await setRecordVisibilityFixture(otherTeamRow, { visibility: "team", teamId: otherTeam.id });
    const unseenPrivate = await messageOf(attachEvidenceAsAuthor(fx.pm, { evidenceIds: [ok, privateRow], owner: owner(draft) }));
    const unseenOtherTeam = await messageOf(attachEvidenceAsAuthor(fx.pm, { evidenceIds: [ok, otherTeamRow], owner: owner(draft) }));
    expect(unseenPrivate).toBe(unseenOtherTeam);
    expect(unseenPrivate).toBe("없는 증빙 · 새로 고침");
    expect(await liveLinks(ok)).toHaveLength(0);
  });

  it("결재 중 지출결의 → 05 거부 `결재 중 · 증빙 잠김` · 붙임 0", async () => {
    const intake = await createIntakeManager();
    const doc = await createInReviewExpenseFixture(fx);
    const recordId = await publish(intake);
    expect(await messageOf(attachEvidenceAsAuthor(fx.pm, { evidenceIds: [recordId], owner: owner(doc.expenseId) }))).toBe(EVIDENCE_LOCKED_IN_REVIEW);
    expect(await liveLinks(recordId)).toHaveLength(0);
  });

  it("합계가 음수인 증빙은 작성자 길로 붙지 않는다(A-7 · PA-NEG) — 바뀐 것으로 거부 · 붙임 0", async () => {
    const intake = await createIntakeManager();
    const draft = await createDraftExpenseFixture(fx);
    const negative = await publish(intake, { supplyKrw: -50_000 });
    expect(await messageOf(attachEvidenceAsAuthor(fx.pm, { evidenceIds: [negative], owner: owner(draft) }))).toMatch(/바꿈 · 새로 고침$/);
    expect(await liveLinks(negative)).toHaveLength(0);
  });

  it(`${ATTACH_BATCH_MAX + 1}건은 트랜잭션 전에 상한 글자로 거부된다`, async () => {
    const draft = await createDraftExpenseFixture(fx);
    const ids = Array.from({ length: ATTACH_BATCH_MAX + 1 }, () => "00000000-0000-4000-8000-000000000001");
    expect(await messageOf(attachEvidenceAsAuthor(fx.pm, { evidenceIds: ids, owner: owner(draft) }))).toBe(ATTACH_BATCH_CAP_LINE);
  });

  it("사전 판독 뒤 다른 문서에 먼저 붙은 증빙이 있으면 `다른 사람이 먼저 붙임 · {거래처} 외 {k}건 · 새로 고침` · 붙은 것 0(전부-아니면-전무)", async () => {
    const intake = await createIntakeManager();
    const draft = await createDraftExpenseFixture(fx);
    const otherDocumentId = randomUUID();
    const names = new Map<string, string>();
    const takenA = await publish(intake, { nameOnDocument: "먼저상회" });
    const takenB = await publish(intake, { nameOnDocument: "먼저상회2" });
    names.set(takenA, "먼저상회");
    names.set(takenB, "먼저상회2");
    const free = await publish(intake);
    const firstTaken = [takenA, takenB].sort()[0] ?? takenA;
    const message = await messageOf(
      attachEvidenceAsAuthor(
        fx.pm,
        { evidenceIds: [free, takenA, takenB], owner: owner(draft) },
        {
          afterPreRead: async () => {
            await insertLinkFixture({ recordId: takenA, ownerId: otherDocumentId, attachedBy: intake.id });
            await insertLinkFixture({ recordId: takenB, ownerId: otherDocumentId, attachedBy: intake.id });
          },
        },
      ),
    );
    expect(message).toBe(`다른 사람이 먼저 붙임 · ${names.get(firstTaken)} 외 1건 · 새로 고침`);
    expect(await liveLinks(free)).toHaveLength(0);
    expect(await liveLinks(takenA)).toHaveLength(1);
  });
});

describe("attachEvidenceAsAuthor — 05 규칙표 갈래 (카드 R1 · 완료 프로젝트)", () => {
  it("반려 지출결의 → 성공 · 문서 version 그대로(05 X-1)", async () => {
    const intake = await createIntakeManager();
    const doc = await createReturnedExpenseFixture(fx);
    const recordId = await publish(intake);
    const before = await moneyOf(doc.expenseId);
    expect(await attachEvidenceAsAuthor(fx.pm, { evidenceIds: [recordId], owner: owner(doc.expenseId) })).toEqual({ attached: 1 });
    expect(await moneyOf(doc.expenseId)).toEqual(before);
  });

  it("승인(완료 아닌 프로젝트) 지출결의 → 성공 · 공급가액 그대로 · 문서 version 오름(05 훅)", async () => {
    const intake = await createIntakeManager();
    const doc = await createInReviewExpenseFixture(fx);
    await approveFresh(doc.expenseId);
    const recordId = await publish(intake);
    const before = await moneyOf(doc.expenseId);
    expect(await attachEvidenceAsAuthor(fx.pm, { evidenceIds: [recordId], owner: owner(doc.expenseId) })).toEqual({ attached: 1 });
    const after = await moneyOf(doc.expenseId);
    expect({ supply: after.supply, vat: after.vat, payable: after.payable }).toEqual({ supply: before.supply, vat: before.vat, payable: before.payable });
    expect(after.version).toBeGreaterThan(before.version);
  });

  it("승인 · 완료 프로젝트 지출결의 → 작성자 거부 `완료 프로젝트 · 증빙 잠김` · 붙임 0", async () => {
    const intake = await createIntakeManager();
    const doc = await createInReviewExpenseFixture(fx);
    await approveFresh(doc.expenseId);
    await db.update(projects).set({ status: "completed" }).where(eq(projects.id, fx.projectId));
    const recordId = await publish(intake);
    expect(await messageOf(attachEvidenceAsAuthor(fx.pm, { evidenceIds: [recordId], owner: owner(doc.expenseId) }))).toBe(EVIDENCE_COMPLETED_PROJECT_LOCKED);
    expect(await liveLinks(recordId)).toHaveLength(0);
  });
});

// ── 06.1-08 Task 3 ─────────────────────────────────────────────────────────────────────────────────────────

async function documentVersions(expenseId: string): Promise<{ doc: number; instance: number | null }> {
  const [instance] = await db.select({ version: approvalInstances.version }).from(approvalInstances).where(eq(approvalInstances.documentId, expenseId));
  return { doc: (await moneyOf(expenseId)).version, instance: instance?.version ?? null };
}

async function submitDraft(expenseId: string): Promise<void> {
  await attachEvidence(fx.pm, expenseId);
  const result = await submitExpense(fx.pm, { expenseId, expectedVersion: (await moneyOf(expenseId)).version });
  if (result.kind !== "submitted") throw new Error("제출 안 됨");
}

// 증빙 기록 한 줄의 합계를 음수로 · 공개 범위를 미공개로 — 06.1-07 금액 고침 · 06.1-05 공개 범위 저장과 같은 갱신(version 오름).
async function bumpRecord(recordId: string, change: "negative" | "private"): Promise<void> {
  if (change === "negative") await db.execute(sql`update evidence_records set supply_krw = -50000, vat_krw = 0, total_krw = -50000, version = version + 1 where id = ${recordId}`);
  else await db.execute(sql`update evidence_records set visibility = 'private', visible_team_id = null, visible_org_unit_id = null, version = version + 1 where id = ${recordId}`);
}

describe("작성자 모드 ↔ 05 규칙표 대조 (RP-4 — 두 번째 표 없음)", () => {
  it("임시 · 반려 · 회수 · 결재 중 · 승인 · 승인+완료 프로젝트 — evidencePickerMode가 author일 때와 getEvidenceActions.canAdd가 같다", async () => {
    // 줄 하나에 문서 하나만 만들 수 있어 상태마다 새 프로젝트(= 새 작성자)로 만든다. 판정은 그 작성자로 한다.
    const rows: { state: string; viewer: Viewer; expenseId: string; expected: "author" | "none"; projectId: string }[] = [];
    const next = async (state: string, expected: "author" | "none", make: () => Promise<string>) => {
      fx = await setupExpenseProject();
      rows.push({ state, viewer: fx.pm, expenseId: await make(), expected, projectId: fx.projectId });
    };
    await next("임시", "author", () => createDraftExpenseFixture(fx));
    await next("결재 중", "none", async () => (await createInReviewExpenseFixture(fx)).expenseId);
    await next("반려", "author", async () => (await createReturnedExpenseFixture(fx)).expenseId);
    await next("회수", "author", async () => {
      const doc = await createInReviewExpenseFixture(fx);
      await withdrawExpense(fx.pm, { expenseId: doc.expenseId, expectedInstanceVersion: (await instanceOf(doc.expenseId)).version });
      return doc.expenseId;
    });
    await next("승인", "author", async () => {
      const doc = await createInReviewExpenseFixture(fx);
      await approveFresh(doc.expenseId);
      return doc.expenseId;
    });

    for (const row of rows) {
      const mode = (await evidencePickerMode(row.viewer, owner(row.expenseId))).mode;
      const actions = await getEvidenceActions(row.viewer, { ownerKind: "expense", ownerId: row.expenseId });
      expect({ state: row.state, mode, canAdd: actions.canAdd }).toEqual({ state: row.state, mode: row.expected, canAdd: row.expected === "author" });
    }

    const approved = rows.find((row) => row.state === "승인");
    if (!approved) throw new Error("승인 문서 없음");
    await db.update(projects).set({ status: "completed" }).where(eq(projects.id, approved.projectId));
    const completedMode = (await evidencePickerMode(approved.viewer, owner(approved.expenseId))).mode;
    const completedActions = await getEvidenceActions(approved.viewer, { ownerKind: "expense", ownerId: approved.expenseId });
    expect({ mode: completedMode, canAdd: completedActions.canAdd, locked: completedActions.completedProjectLocked }).toEqual({ mode: "none", canAdd: false, locked: true });
  });
});

describe("PA-DONEDRAFT — 완료 프로젝트의 임시 · 반려 문서는 작성자에게 열려 있다 (05 파일 길과 같음)", () => {
  it("프로젝트를 완료로 바꿔도 임시 · 반려 지출결의는 모드 author · 붙이기 성공", async () => {
    const intake = await createIntakeManager();
    const draft = await createDraftExpenseFixture(fx);
    const returned = await createReturnedExpenseFixture(fx, { lineId: fx.lines.split });
    await db.update(projects).set({ status: "completed" }).where(eq(projects.id, fx.projectId));
    for (const expenseId of [draft, returned.expenseId]) {
      expect((await evidencePickerMode(fx.pm, owner(expenseId))).mode).toBe("author");
      const recordId = await publish(intake);
      expect(await attachEvidenceAsAuthor(fx.pm, { evidenceIds: [recordId], owner: owner(expenseId) })).toEqual({ attached: 1 });
    }
  });
});

describe("attachEvidenceAsAuthor — 잠금 뒤 재판정 (A-7 · E32 · 결정적)", () => {
  it("afterPreRead에서 임시 문서를 제출하면 문서 잠금 뒤 `결재 중 · 증빙 잠김` · 붙임 0", async () => {
    const intake = await createIntakeManager();
    const draft = await createDraftExpenseFixture(fx);
    const recordId = await publish(intake);
    const message = await messageOf(attachEvidenceAsAuthor(fx.pm, { evidenceIds: [recordId], owner: owner(draft) }, { afterPreRead: () => submitDraft(draft) }));
    expect(message).toBe(EVIDENCE_LOCKED_IN_REVIEW);
    expect(await liveLinks(recordId)).toHaveLength(0);
  });

  it("afterPreRead에서 제출 + 최종 승인까지 되면 문서 잠금 뒤 다시 하기로 거부(05 N-3) · 붙임 0 · version 그대로 — 다시 보내면 승인 상태로 붙고 05 훅(문서 · 결재 인스턴스 version 오름)이 함께 돈다", async () => {
    const intake = await createIntakeManager();
    const draft = await createDraftExpenseFixture(fx);
    const recordId = await publish(intake);
    const atApproval: { value: { doc: number; instance: number | null } | null } = { value: null };
    const message = await messageOf(
      attachEvidenceAsAuthor(
        fx.pm,
        { evidenceIds: [recordId], owner: owner(draft) },
        {
          afterPreRead: async () => {
            await submitDraft(draft);
            await approveFresh(draft);
            atApproval.value = await documentVersions(draft);
          },
        },
      ),
    );
    expect(message).toMatch(/에 다른 곳에서 저장됨 · 새로 고침$/);
    const approved = atApproval.value;
    if (!approved) throw new Error("승인 시점 version 없음");
    expect(await liveLinks(recordId)).toHaveLength(0);
    expect(await documentVersions(draft)).toEqual(approved);

    expect(await attachEvidenceAsAuthor(fx.pm, { evidenceIds: [recordId], owner: owner(draft) })).toEqual({ attached: 1 });
    const after = await documentVersions(draft);
    expect(after.doc).toBeGreaterThan(approved.doc);
    expect(after.instance ?? 0).toBeGreaterThan(approved.instance ?? 0);
    expect(await liveLinks(recordId)).toHaveLength(1);
  });

  it("승인 문서의 프로젝트가 사전 판독 뒤 완료로 바뀌면 잠금 뒤 `완료 프로젝트 · 증빙 잠김` · 붙임 0", async () => {
    const intake = await createIntakeManager();
    const doc = await createInReviewExpenseFixture(fx);
    await approveFresh(doc.expenseId);
    const recordId = await publish(intake);
    const message = await messageOf(
      attachEvidenceAsAuthor(fx.pm, { evidenceIds: [recordId], owner: owner(doc.expenseId) }, { afterPreRead: async () => void (await db.update(projects).set({ status: "completed" }).where(eq(projects.id, fx.projectId))) }),
    );
    expect(message).toBe(EVIDENCE_COMPLETED_PROJECT_LOCKED);
    expect(await liveLinks(recordId)).toHaveLength(0);
  });

  it("사전 판독 뒤 증빙 합계가 음수로 고쳐지면(version 오름) 증빙 잠금 뒤 `다른 사람이 {HH:mm}에 바꿈 · 새로 고침` · 붙임 0", async () => {
    const intake = await createIntakeManager();
    const draft = await createDraftExpenseFixture(fx);
    const recordId = await publish(intake);
    const message = await messageOf(attachEvidenceAsAuthor(fx.pm, { evidenceIds: [recordId], owner: owner(draft) }, { afterPreRead: () => bumpRecord(recordId, "negative") }));
    expect(message).toMatch(/^다른 사람이 \d{2}:\d{2}에 바꿈 · 새로 고침$/);
    expect(await liveLinks(recordId)).toHaveLength(0);
  });

  it("PA-STALE: 경영관리가 사전 판독 뒤 증빙을 미공개로 되돌리면(version 오름) 같은 글자 · 고른 나머지도 붙지 않는다", async () => {
    const intake = await createIntakeManager();
    const draft = await createDraftExpenseFixture(fx);
    const flipped = await publish(intake);
    const kept = await publish(intake);
    const message = await messageOf(attachEvidenceAsAuthor(fx.pm, { evidenceIds: [flipped, kept], owner: owner(draft) }, { afterPreRead: () => bumpRecord(flipped, "private") }));
    expect(message).toMatch(/^다른 사람이 \d{2}:\d{2}에 바꿈 · 새로 고침$/);
    expect(await liveLinks(flipped)).toHaveLength(0);
    expect(await liveLinks(kept)).toHaveLength(0);
  });

  it("사전 판독 뒤 증빙이 보관되면 작성자 붙이기는 거부 · 붙임 0", async () => {
    const intake = await createIntakeManager();
    const draft = await createDraftExpenseFixture(fx);
    const recordId = await publish(intake);
    const message = await messageOf(
      attachEvidenceAsAuthor(fx.pm, { evidenceIds: [recordId], owner: owner(draft) }, { afterPreRead: () => setRecordArchivedFixture(recordId, intake.id) }),
    );
    expect(message).toBe("보관됨");
    expect(await liveLinks(recordId)).toHaveLength(0);
  });
});

describe("attachEvidenceAsAuthor — 경합 · 짝 (E06)", () => {
  it("경영관리가 다른 문서에 같은 증빙을 잠근 채 멈춘 동안 작성자 출발 → waitForLockWaiter → 경영관리 커밋 → 작성자 거부 · 붙임 1행(경영관리)", async () => {
    const intake = await createIntakeManager();
    const draft = await createDraftExpenseFixture(fx);
    const returned = await createReturnedExpenseFixture(fx, { lineId: fx.lines.split });
    const recordId = await publish(intake, { nameOnDocument: "경합상회" });
    const gate = deferred();
    const reached = deferred();
    const registrar = attachEvidenceBatch(intake, { evidenceIds: [recordId], owner: owner(returned.expenseId) }, { afterLock: () => (reached.resolve(), gate.promise) });
    await reached.promise;
    const author = caught(attachEvidenceAsAuthor(fx.pm, { evidenceIds: [recordId], owner: owner(draft) }));
    await waitForLockWaiter(pool);
    gate.resolve();
    expect(await registrar).toEqual({ attached: 1 });
    const refused = await author;
    expect((refused as Error).message).toBe("다른 사람이 먼저 붙임 · 경합상회 · 새로 고침");
    const links = await liveLinks(recordId);
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({ ownerId: returned.expenseId, attachMode: "registrar" });
  });

  it("지급 방식이 있는 문서에 짝 아닌 종류가 섞이면 작성자 3건 전부 거부(06.1-06과 같은 글자) · 붙임 0", async () => {
    const intake = await createIntakeManager();
    const draft = await createDraftExpenseFixture(fx);
    await db.execute(sql`update expenses set payment_method = 'bank_transfer' where id = ${draft}`);
    await upsertSimpleValue(SYSTEM_VIEWER, PAYMENT_METHOD_EVIDENCE_PAIRS.key, [{ method: "bank_transfer", evidence: "tax_invoice" }], null);
    const paired = await publish(intake);
    const mismatchedA = await publish(intake, { evidenceType: "cash_receipt" });
    const mismatchedB = await publish(intake, { evidenceType: "cash_receipt" });
    const message = await messageOf(attachEvidenceAsAuthor(fx.pm, { evidenceIds: [paired, mismatchedA, mismatchedB], owner: owner(draft) }));
    expect(message).toContain("짝 아님");
    for (const id of [paired, mismatchedA, mismatchedB]) expect(await liveLinks(id)).toHaveLength(0);
    expect(await countEvidencePool(fx.pm, { kind: "expense", id: draft })).toBe(1);
  });
});

async function teamOfProject(projectId: string): Promise<string> {
  const [row] = await db.select({ teamId: projects.teamId }).from(projects).where(eq(projects.id, projectId));
  if (!row?.teamId) throw new Error("프로젝트 팀 없음");
  return row.teamId;
}

async function publishTo(intake: Awaited<ReturnType<typeof createIntakeManager>>, teamId: string): Promise<string> {
  const id = await insertRecordFixture(intake);
  await setRecordVisibilityFixture(id, { visibility: "team", teamId });
  return id;
}

async function requestSnapshot(requestId: string, lineId: string) {
  const [request] = await db.select().from(purchaseRequests).where(eq(purchaseRequests.id, requestId));
  const [line] = await db.select({ amount: quoteLines.executionAmountKrw, unit: quoteLines.unitPriceAmountKrw }).from(quoteLines).where(eq(quoteLines.id, lineId));
  return { request, line };
}

async function authorIdsOf(pfx: PurchaseFx): Promise<string[]> {
  return (await listPurchaseRequests(pfx.pm, { status: "all", month: null, page: "1", keepId: null })).evidenceAuthorIds;
}

describe("구매 요청 작성자 붙이기 (E30 · PA-PRDONE — 상태 무관 · 실행가 불변)", () => {
  it("요청(requested) · 붙임 0 → 모드 author · 붙임 성공 · 요청 행 · 견적 줄 실행가 그대로 · 후보 수 · 목록 evidenceAuthorIds", async () => {
    const pfx = await purchaseProject();
    const intake = await createIntakeManager();
    const created = await createRequest(pfx, pfx.onlineLine);
    const recordId = await publishTo(intake, await teamOfProject(pfx.projectId));
    const before = await requestSnapshot(created.id, pfx.onlineLine);
    expect((await evidencePickerMode(pfx.pm, { kind: "purchase_request", id: created.id })).mode).toBe("author");
    expect(await countEvidencePool(pfx.pm, { kind: "purchase_request", id: created.id })).toBe(1);
    expect(await countEvidencePool(pfx.pm, { kind: "purchase_request" })).toBe(1);
    expect(await authorIdsOf(pfx)).toContain(created.id);

    expect(await attachEvidenceAsAuthor(pfx.pm, { evidenceIds: [recordId], owner: { kind: "purchase_request", id: created.id } })).toEqual({ attached: 1 });
    expect(await liveLinks(recordId)).toMatchObject([{ ownerKind: "purchase_request", ownerId: created.id, attachMode: "author", attachedBy: pfx.pm.id }]);
    expect(await requestSnapshot(created.id, pfx.onlineLine)).toEqual(before);
    expect((await evidencePickerMode(pfx.pm, { kind: "purchase_request", id: created.id })).mode).toBe("none");
    expect(await authorIdsOf(pfx)).not.toContain(created.id);
    const linked = await listLinkedEvidence(pfx.pm, { kind: "purchase_request", id: created.id });
    expect(linked.items).toHaveLength(1);
  });

  it("구매 완료(purchased) · 붙임 0 요청도 모드 author(상태 무관) · 붙임 성공 · 실행가 그대로", async () => {
    const pfx = await purchaseProject();
    const intake = await createIntakeManager();
    const created = await createRequest(pfx, pfx.onlineLine);
    await db.execute(sql`update purchase_requests set status = 'purchased', completed_by = ${pfx.pm.id}, completed_at = now() where id = ${created.id}`);
    const recordId = await publishTo(intake, await teamOfProject(pfx.projectId));
    const before = await requestSnapshot(created.id, pfx.onlineLine);
    expect((await evidencePickerMode(pfx.pm, { kind: "purchase_request", id: created.id })).mode).toBe("author");
    expect(await attachEvidenceAsAuthor(pfx.pm, { evidenceIds: [recordId], owner: { kind: "purchase_request", id: created.id } })).toEqual({ attached: 1 });
    expect(await requestSnapshot(created.id, pfx.onlineLine)).toEqual(before);
  });

  it("이미 붙임이 있는 요청 · 취소된 요청 · 남의 요청 · 완료 프로젝트 줄 요청은 모드 none · 붙이기 거부 · 목록 evidenceAuthorIds에 없다", async () => {
    const pfx = await purchaseProject();
    const intake = await createIntakeManager();
    const teamId = await teamOfProject(pfx.projectId);
    const linkedRequest = await createRequest(pfx, pfx.onlineLine);
    const cancelled = await createRequest(pfx, pfx.onlineLine);
    const others = await createRequest(pfx, pfx.onlineLine);
    const done = await createRequest(pfx, pfx.onlineLine);
    const first = await publishTo(intake, teamId);
    const second = await publishTo(intake, teamId);
    await insertLinkFixture({ recordId: first, ownerKind: "purchase_request", ownerId: linkedRequest.id, attachedBy: intake.id });
    const [cancelRow] = await db.select({ version: purchaseRequests.version }).from(purchaseRequests).where(eq(purchaseRequests.id, cancelled.id));
    await cancelPurchaseRequest(pfx.pm, { id: cancelled.id, version: cancelRow?.version ?? 0 }, await precheckPurchaseCancel(pfx.pm, { id: cancelled.id }));
    const stranger = await createPmInTeam(teamId);

    const modeOf = async (viewer: Awaited<ReturnType<typeof createPmInTeam>>, id: string) => (await evidencePickerMode(viewer, { kind: "purchase_request", id })).mode;
    expect(await modeOf(pfx.pm, linkedRequest.id)).toBe("none");
    expect(await modeOf(pfx.pm, cancelled.id)).toBe("none");
    expect(await modeOf(stranger, others.id)).toBe("none");
    expect(await messageOf(attachEvidenceAsAuthor(pfx.pm, { evidenceIds: [second], owner: { kind: "purchase_request", id: linkedRequest.id } }))).toBe("없는 구매 요청 · 새로 고침");
    expect(await messageOf(attachEvidenceAsAuthor(pfx.pm, { evidenceIds: [second], owner: { kind: "purchase_request", id: cancelled.id } }))).toBe("구매 요청 취소됨 · 새로 고침");
    expect(await messageOf(attachEvidenceAsAuthor(stranger, { evidenceIds: [second], owner: { kind: "purchase_request", id: others.id } }))).toBe("없는 구매 요청 · 새로 고침");

    await db.update(projects).set({ status: "completed" }).where(eq(projects.id, pfx.projectId));
    expect(await modeOf(pfx.pm, done.id)).toBe("none");
    expect(await messageOf(attachEvidenceAsAuthor(pfx.pm, { evidenceIds: [second], owner: { kind: "purchase_request", id: done.id } }))).toBe("없는 구매 요청 · 새로 고침");
    expect(await authorIdsOf(pfx)).toEqual([]);
    expect(await liveLinks(second)).toHaveLength(0);
  });

  it("구매 요청 붙임은 작성자 떼기 갈래가 없다 — 작성자가 붙인 구매 요청 붙임도 404 꼴(없는 붙임) · 붙임 그대로(PA-PRFIX)", async () => {
    const pfx = await purchaseProject();
    const intake = await createIntakeManager();
    const created = await createRequest(pfx, pfx.onlineLine);
    const recordId = await publishTo(intake, await teamOfProject(pfx.projectId));
    await attachEvidenceAsAuthor(pfx.pm, { evidenceIds: [recordId], owner: { kind: "purchase_request", id: created.id } });
    const [link] = await liveLinks(recordId);
    if (!link) throw new Error("붙임 없음");
    expect(await messageOf(detachOwnEvidence(pfx.pm, { linkId: link.id, reason: "잘못 붙임" }))).toBe("없는 붙임 · 새로 고침");
    expect(await liveLinks(recordId)).toHaveLength(1);
  });
});

describe("detachOwnEvidence — 작성자 자기 떼기 (A9 · RP-4 · D-6110)", () => {
  async function authorLink(expenseId: string, recordId: string): Promise<string> {
    await attachEvidenceAsAuthor(fx.pm, { evidenceIds: [recordId], owner: owner(expenseId) });
    const [link] = await liveLinks(recordId);
    if (!link) throw new Error("붙임 없음");
    return link.id;
  }

  it("임시 문서 — 자기 author 붙임을 사유와 함께 떼면 붙임이 닫히고 금액 · version 그대로 · 행동 로그 한 줄 더 · 사유 공백은 거부", async () => {
    const intake = await createIntakeManager();
    const draft = await createDraftExpenseFixture(fx);
    const recordId = await publish(intake);
    const linkId = await authorLink(draft, recordId);
    const before = await moneyOf(draft);
    await expect(detachOwnEvidence(fx.pm, { linkId, reason: "   " })).rejects.toBeInstanceOf(Error);
    expect(await liveLinks(recordId)).toHaveLength(1);
    expect(await detachOwnEvidence(fx.pm, { linkId, reason: "잘못 붙임" })).toEqual({ detached: true });
    expect(await liveLinks(recordId)).toHaveLength(0);
    expect(await moneyOf(draft)).toEqual(before);
    expect(await attachLogs(draft)).toHaveLength(2);
    expect(await detachOwnEvidence(fx.pm, { linkId, reason: "잘못 붙임" })).toEqual({ detached: false });
  });

  it("반려 · 회수 문서 — 자기 author 붙임을 뗄 수 있고 문서 version 그대로(05 X-1)", async () => {
    const intake = await createIntakeManager();
    for (const state of ["returned", "withdrawn"] as const) {
      // 줄 하나에 문서 하나만 만들 수 있어 문서마다 새 프로젝트(= 새 작성자)로 만든다.
      fx = await setupExpenseProject();
      const doc = state === "returned" ? await createReturnedExpenseFixture(fx) : await createInReviewExpenseFixture(fx);
      if (state === "withdrawn") await withdrawExpense(fx.pm, { expenseId: doc.expenseId, expectedInstanceVersion: (await instanceOf(doc.expenseId)).version });
      const recordId = await publish(intake);
      const linkId = await authorLink(doc.expenseId, recordId);
      const before = await moneyOf(doc.expenseId);
      expect(await detachOwnEvidence(fx.pm, { linkId, reason: "다른 건 증빙" })).toEqual({ detached: true });
      expect(await moneyOf(doc.expenseId)).toEqual(before);
      expect(await liveLinks(recordId)).toHaveLength(0);
    }
  });

  it("경영관리 registrar 붙임 · 남의 author 붙임은 같은 거부 `없는 붙임 · 새로 고침` · 붙임 그대로", async () => {
    const intake = await createIntakeManager();
    const returned = await createReturnedExpenseFixture(fx);
    const registrarRecord = await publish(intake);
    const registrarLink = await insertLinkFixture({ recordId: registrarRecord, ownerId: returned.expenseId, attachMode: "registrar", attachedBy: intake.id });
    const otherPm = await createPmInTeam(team1);
    const otherRecord = await publish(intake);
    const otherLink = await insertLinkFixture({ recordId: otherRecord, ownerId: returned.expenseId, attachMode: "author", attachedBy: otherPm.id });
    expect(await messageOf(detachOwnEvidence(fx.pm, { linkId: registrarLink, reason: "내 것 아님" }))).toBe("없는 붙임 · 새로 고침");
    expect(await messageOf(detachOwnEvidence(fx.pm, { linkId: otherLink, reason: "내 것 아님" }))).toBe("없는 붙임 · 새로 고침");
    expect(await liveLinks(registrarRecord)).toHaveLength(1);
    expect(await liveLinks(otherRecord)).toHaveLength(1);
  });

  it("결재 중 → 05 거부 `결재 중 · 증빙 잠김` · 승인 → 05 거부 `승인 뒤 · 증빙 삭제 잠김` · 붙임 그대로", async () => {
    const intake = await createIntakeManager();
    const draft = await createDraftExpenseFixture(fx);
    const recordId = await publish(intake);
    const linkId = await authorLink(draft, recordId);
    await submitDraft(draft);
    expect(await messageOf(detachOwnEvidence(fx.pm, { linkId, reason: "잘못 붙임" }))).toBe(EVIDENCE_LOCKED_IN_REVIEW);
    await approveFresh(draft);
    expect(await messageOf(detachOwnEvidence(fx.pm, { linkId, reason: "잘못 붙임" }))).toBe(EVIDENCE_REMOVE_LOCKED_APPROVED);
    expect(await liveLinks(recordId)).toHaveLength(1);
  });

  it("사전 판독 뒤 문서가 제출되면(afterPreRead) 문서 잠금 뒤 같은 05 거부 · 붙임 그대로", async () => {
    const intake = await createIntakeManager();
    const returned = await createReturnedExpenseFixture(fx);
    const recordId = await publish(intake);
    const linkId = await authorLink(returned.expenseId, recordId);
    const resubmit = async () => {
      const result = await submitExpense(fx.pm, { expenseId: returned.expenseId, expectedVersion: (await moneyOf(returned.expenseId)).version });
      if (result.kind !== "submitted") throw new Error("다시 올리기 안 됨");
    };
    expect(await messageOf(detachOwnEvidence(fx.pm, { linkId, reason: "잘못 붙임" }, { afterPreRead: resubmit }))).toBe(EVIDENCE_LOCKED_IN_REVIEW);
    expect(await liveLinks(recordId)).toHaveLength(1);
  });
});
