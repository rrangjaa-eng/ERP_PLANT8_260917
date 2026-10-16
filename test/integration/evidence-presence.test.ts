import { randomBytes, randomUUID } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db, type DbOrTx } from "@/db/client";
import { evidenceImportBatches, evidenceRecordLinks, evidenceRecords, expenses, files } from "@/db/schema";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { upsertVisibility } from "@/repositories/permissions";
import { approveDocument } from "@/domain/approvals";
import { createExpenseFromLines, submitExpense, type SubmitExpenseResult } from "@/domain/expenses";
import { confirmEvidence } from "@/domain/evidence-reviews";
import { expenseCostBasis } from "@/domain/evidence-reviews/cost-basis";
import { evidenceSourcesOf, hasEvidence } from "@/domain/evidence/has-evidence";
import { completeExpensePayment, previewPayable } from "@/domain/payments";
import { GateBlockedError } from "@/domain/rules/gate";
import { withTransaction } from "@/lib/db-transaction";
import { seoulToday } from "@/lib/dates";
import { attachEvidence, setupExpenseProject, type ExpenseFixture } from "./fixtures/expenses";
import { makePaymentManager, setEvidenceRequired } from "./fixtures/payments";

// 06.1-12(EVID-08 · EVID-09 · D-6104 · D-6105 · RP-4): 「증빙 있음」 = 살아 있는 05 파일 OR 살아 있는 증빙 기록 붙임(detached_at IS NULL).
// 판정은 domain/evidence/has-evidence.ts 한 곳 — 제출 ⑧ · 증빙 확인 · 지급 게이트가 같은 답을 낸다. 붙임 행은 이 파일 안 지역 도우미로 넣는다
// (06.1-04 fixtures/evidence.ts는 같은 웨이브 다른 플랜 몫 · 붙이기 화면 06.1-06은 아직 없다).

type LinkOwnerKind = "expense" | "purchase_request" | "corp_card_usage";
type AttachMode = "registrar" | "author" | "reconcile";

const DOC_SUPPLY = 12_400_000;

beforeEach(async () => {
  await setEvidenceRequired(false);
});

// 지급 권한자 + 금액 · 값 정보 항목 노출(06 evidence-reviews 통합과 같은 꼴).
async function makePayer(name?: string): Promise<Viewer> {
  const payer = await makePaymentManager(name);
  if (!payer.roleId) throw new Error("계급 없음");
  for (const infoItem of ["expense.value", "expense.amount"]) await upsertVisibility(SYSTEM_VIEWER, { roleId: payer.roleId, infoItem, visible: true });
  return payer;
}

// 등록 묶음 · 증빙 기록 · 붙임 한 벌(06.1-01 스키마). 합계 = 공급가 + 세액(CHECK) — 세액 0.
async function insertRecordAndLink(
  by: Viewer,
  input: { ownerKind?: LinkOwnerKind; ownerId: string; attachMode: AttachMode; supplyKrw: number; evidenceType?: string },
  tx: DbOrTx = db,
): Promise<{ recordId: string; linkId: string }> {
  const [batch] = await tx
    .insert(evidenceImportBatches)
    .values({
      format: "hometax-tax-invoice",
      originalName: "매입 세금계산서.xls",
      fileSha256: randomBytes(32).toString("hex"),
      rowCount: 1,
      registeredCount: 1,
      skippedDuplicateCount: 0,
      uploadedBy: by.id,
    })
    .returning({ id: evidenceImportBatches.id });
  if (!batch) throw new Error("등록 묶음 없음");
  const [record] = await tx
    .insert(evidenceRecords)
    .values({
      batchId: batch.id,
      format: "hometax-tax-invoice",
      evidenceType: input.evidenceType ?? "tax_invoice",
      dedupeKey: `test:${randomUUID()}`,
      issuedOn: "2026-09-20",
      supplyKrw: input.supplyKrw,
      vatKrw: 0,
      totalKrw: input.supplyKrw,
      createdBy: by.id,
    })
    .returning({ id: evidenceRecords.id });
  if (!record) throw new Error("증빙 기록 없음");
  const [link] = await tx
    .insert(evidenceRecordLinks)
    .values({ evidenceRecordId: record.id, ownerKind: input.ownerKind ?? "expense", ownerId: input.ownerId, attachMode: input.attachMode, attachedBy: by.id })
    .returning({ id: evidenceRecordLinks.id });
  if (!link) throw new Error("붙임 없음");
  return { recordId: record.id, linkId: link.id };
}

async function detachLinkRow(linkId: string, by: Viewer): Promise<void> {
  await db.update(evidenceRecordLinks).set({ detachedAt: new Date(), detachedBy: by.id, detachReason: "다른 건 증빙" }).where(eq(evidenceRecordLinks.id, linkId));
}

async function versionOf(expenseId: string): Promise<number> {
  const [row] = await db.select({ version: expenses.version }).from(expenses).where(eq(expenses.id, expenseId));
  if (!row) throw new Error("지출결의 없음");
  return row.version;
}

async function aliveFileCount(expenseId: string): Promise<number> {
  const rows = await db
    .select({ id: files.id })
    .from(files)
    .where(and(eq(files.ownerKind, "expense"), eq(files.ownerId, expenseId), isNull(files.removedAt), isNull(files.voidedAt)));
  return rows.length;
}

async function newDraft(fx: ExpenseFixture, lineId: string = fx.lines.withVendor): Promise<string> {
  const created = await createExpenseFromLines(fx.pm, { lineIds: [lineId] });
  const expenseId = created.created[0]?.expenseId;
  if (!expenseId) throw new Error("지출결의를 만들지 못했다");
  return expenseId;
}

// 파일 없이 제출 — submitReadyDraft는 05 파일을 붙이므로 같은 꼴에서 붙이기만 뺐다.
async function submitWithoutFile(viewer: Viewer, expenseId: string): Promise<SubmitExpenseResult> {
  return submitExpense(viewer, { expenseId, expectedVersion: await versionOf(expenseId) });
}

async function approveAll(fx: ExpenseFixture, submitted: SubmitExpenseResult): Promise<void> {
  if (submitted.kind !== "submitted") throw new Error("제출 안 됨");
  const first = await approveDocument(fx.lead, { instanceId: submitted.instanceId, expectedVersion: submitted.version });
  const final = await approveDocument(fx.ceo, { instanceId: submitted.instanceId, expectedVersion: first.version });
  if (final.status !== "approved") throw new Error(`결재 통과 안 됨: ${final.status}`);
}

async function payableOf(payer: Viewer, expenseId: string): Promise<number> {
  const preview = await previewPayable(payer, { expenseId, payDate: seoulToday() });
  if (preview.payableKrw === undefined || preview.payableKrw === null) throw new Error("지급 총액을 셈할 수 없는 문서");
  return preview.payableKrw;
}

async function caught(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => undefined,
    (error: unknown) => error,
  );
}

describe("증빙 기록 붙임 = 증빙 있음 (06.1-12 Task 1 트레이서)", () => {
  it("파일 0 · 경영관리 붙임 하나 → 증빙 필수 제출 통과 → 결재 통과 → 증빙 확인(공급가액과 같음) → 지급 완료", async () => {
    await setEvidenceRequired(true);
    const fx = await setupExpenseProject();
    const payer = await makePayer();
    const expenseId = await newDraft(fx);
    await insertRecordAndLink(payer, { ownerId: expenseId, attachMode: "registrar", supplyKrw: DOC_SUPPLY });

    const submitted = await submitWithoutFile(fx.pm, expenseId);
    expect(submitted.kind).toBe("submitted");
    await approveAll(fx, submitted);
    expect(await aliveFileCount(expenseId)).toBe(0);

    const confirmed = await confirmEvidence(payer, { expenseId, version: await versionOf(expenseId) });
    expect(confirmed.evidenceStatus).toBe("확인됨");
    const paid = await completeExpensePayment(payer, { expenseId, expectedPayableKrw: await payableOf(payer, expenseId), version: confirmed.version });
    expect(paid.version).toBe(confirmed.version + 1);
  });

  it("뗀 붙임만 → 제출이 ⑧로 막힌다 · 결재 통과 뒤 떼면 지급 게이트가 「증빙 없음 · 기안자 박서연」으로 막는다", async () => {
    await setEvidenceRequired(true);
    const fx = await setupExpenseProject();
    const payer = await makePayer();

    const detachedOnly = await newDraft(fx);
    const early = await insertRecordAndLink(payer, { ownerId: detachedOnly, attachMode: "registrar", supplyKrw: DOC_SUPPLY });
    await detachLinkRow(early.linkId, payer);
    const versionBefore = await versionOf(detachedOnly);
    const refused = await caught(submitWithoutFile(fx.pm, detachedOnly));
    expect(refused).toBeInstanceOf(GateBlockedError);
    expect((refused as Error).message).toBe("증빙 없음 · 증빙 올리기 Ctrl+U");
    expect(await versionOf(detachedOnly)).toBe(versionBefore);

    const approvedId = await newDraft(fx, fx.lines.split);
    const late = await insertRecordAndLink(payer, { ownerId: approvedId, attachMode: "registrar", supplyKrw: 10_000_000 });
    await approveAll(fx, await submitWithoutFile(fx.pm, approvedId));
    const expectedPayableKrw = await payableOf(payer, approvedId);
    await detachLinkRow(late.linkId, payer);
    const blocked = await caught(completeExpensePayment(payer, { expenseId: approvedId, expectedPayableKrw, version: await versionOf(approvedId) }));
    expect(blocked).toBeInstanceOf(GateBlockedError);
    expect((blocked as Error).message).toBe("증빙 없음 · 기안자 박서연");
  });

  it("evidenceSourcesOf — 파일 1 · 붙임 2(경영관리 1 · 작성자 1) · 뗀 붙임만인 셋을 한 번에(질의 둘) · 증빙 0인 주인은 맵에 없다", async () => {
    const fx = await setupExpenseProject();
    const payer = await makePayer();
    const withFile = await newDraft(fx, fx.lines.withVendor);
    await attachEvidence(fx.pm, withFile);
    const withLinks = await newDraft(fx, fx.lines.split);
    await insertRecordAndLink(payer, { ownerId: withLinks, attachMode: "registrar", supplyKrw: 7_000_000 });
    await insertRecordAndLink(fx.pm, { ownerId: withLinks, attachMode: "author", supplyKrw: 3_000_000 });
    const detachedOnly = await newDraft(await setupExpenseProject());
    const gone = await insertRecordAndLink(payer, { ownerId: detachedOnly, attachMode: "registrar", supplyKrw: 1_000_000 });
    await detachLinkRow(gone.linkId, payer);

    let selects = 0;
    const counted = new Proxy(db, {
      get(target, prop, receiver) {
        if (prop === "select") selects += 1;
        return Reflect.get(target, prop, receiver) as unknown;
      },
    });
    const sources = await evidenceSourcesOf(SYSTEM_VIEWER, { ownerKind: "expense", ownerIds: [withFile, withLinks, detachedOnly] }, counted);

    expect(selects).toBe(2);
    expect(sources.get(withFile)).toMatchObject({ fileCount: 1, linkCount: 0 });
    expect(sources.get(withLinks)).toMatchObject({ fileCount: 0, linkCount: 2, authorLinkCount: 1, recordSupplyKrw: 10_000_000 });
    expect(sources.has(detachedOnly)).toBe(false);
    expect([...sources.keys()].sort()).toEqual([withFile, withLinks].sort());
  });

  it("hasEvidence · evidenceSourcesOf는 받은 tx로 붙임을 읽는다 — 트랜잭션 안에서 넣은 붙임을 같은 tx 읽기만 본다", async () => {
    const fx = await setupExpenseProject();
    const payer = await makePayer();
    const expenseId = await newDraft(fx);
    const owner = { ownerKind: "expense", ownerId: expenseId };
    const rollback = new Error("되돌림");

    const seen = await caught(
      withTransaction(async (tx) => {
        await insertRecordAndLink(payer, { ownerId: expenseId, attachMode: "registrar", supplyKrw: DOC_SUPPLY }, tx);
        expect(await hasEvidence(SYSTEM_VIEWER, owner, tx)).toBe(true);
        expect((await evidenceSourcesOf(SYSTEM_VIEWER, { ownerKind: "expense", ownerIds: [expenseId] }, tx)).get(expenseId)).toMatchObject({ fileCount: 0, linkCount: 1 });
        expect(await hasEvidence(SYSTEM_VIEWER, owner)).toBe(false);
        throw rollback;
      }),
    );
    expect(seen).toBe(rollback);
    expect(await hasEvidence(SYSTEM_VIEWER, owner)).toBe(false);
  });

  it("비용 기준(D-6520 · EVID-09) — 붙임만 있으면 같은 공급가가 확정, 떼면 예상", async () => {
    const fx = await setupExpenseProject();
    const payer = await makePayer();
    const expenseId = await newDraft(fx);
    const { linkId } = await insertRecordAndLink(payer, { ownerId: expenseId, attachMode: "registrar", supplyKrw: 9_000_000 });
    const owner = { ownerKind: "expense", ownerId: expenseId };
    const basis = async () => expenseCostBasis({ hasEvidence: await hasEvidence(SYSTEM_VIEWER, owner), supplyKrw: DOC_SUPPLY, lineExecutionKrw: 12_400_000 });

    expect(await basis()).toEqual({ kind: "confirmed", amountKrw: DOC_SUPPLY });
    await detachLinkRow(linkId, payer);
    expect(await basis()).toEqual({ kind: "expected", amountKrw: DOC_SUPPLY });
  });
});
