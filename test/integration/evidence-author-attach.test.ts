import { randomUUID } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db/client";
import { actionLog, approvalInstances, evidenceRecordLinks, expenses, projects } from "@/db/schema";
import { approveDocument } from "@/domain/approvals";
import { EVIDENCE_COMPLETED_PROJECT_LOCKED, EVIDENCE_LOCKED_IN_REVIEW } from "@/domain/evidence";
import { ATTACH_BATCH_CAP_LINE, ATTACH_BATCH_MAX, attachEvidenceAsAuthor } from "@/domain/evidence-records/attach";
import { PAYMENT_METHOD_EVIDENCE_PAIRS } from "@/domain/settings/keys";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { insertOrgUnit } from "@/repositories/org-units";
import { upsertSimpleValue } from "@/repositories/settings";
import { insertTeam } from "@/repositories/teams";
import { teamIdByName } from "./approvals-fixtures";
import { setupExpenseProject, type ExpenseFixture } from "./fixtures/expenses";
import { createDraftExpenseFixture, createInReviewExpenseFixture, createIntakeManager, createReturnedExpenseFixture, insertLinkFixture, insertRecordFixture, setRecordVisibilityFixture } from "./fixtures/evidence";
import { setEvidenceRequired } from "./fixtures/payments";

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
