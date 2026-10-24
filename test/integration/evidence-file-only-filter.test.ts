import { randomBytes, randomUUID } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/db/client";
import { evidenceImportBatches, evidenceRecordLinks, evidenceRecords, expenses, files } from "@/db/schema";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { approveDocument } from "@/domain/approvals";
import { createExpenseFromLines, submitExpense } from "@/domain/expenses";
import { voidEvidence } from "@/domain/evidence";
import { listAllPaymentTargets, listPaymentTargets, parsePayReturn, parsePaymentEvidenceFilter } from "@/domain/payments/targets";
import { upsertReview } from "@/repositories/expense-evidence-reviews";
import { upsertPermission, upsertVisibility } from "@/repositories/permissions";
import { insertRole } from "@/repositories/roles";
import { makePerson } from "./approvals-fixtures";
import { resetDatabase, skipDbReset } from "./setup";
import { makeEvidenceManager, setupExpenseProject, submitReadyDraft } from "./fixtures/expenses";
import { makePaymentManager, setEvidenceRequired } from "./fixtures/payments";

// 06.1-10(EVID-12 · RP-10 · PA-FILEONLY-SET · PA-FILEONLY-WAIVED): 지급 대상 목록 `evidence=file-only`(「파일만 있음」).
// 판정은 06.1-12 judgeTargets의 묶음 읽기(evidenceSourcesOf — 파일 수 · 붙임 수) 결과만 쓴다. 증빙 종류 ∈ 파일 서식 종류 ∧ 살아 있는 파일 ≥ 1 ∧
// 살아 있는 붙임 0 ∧ 면제 아님. 문서는 케이스마다 새 프로젝트로 만들고(서로 섞이지 않게), 단언은 이 파일이 만든 id로만 거른다.

skipDbReset();

type Spec = {
  /** 살아 있는 05 파일을 붙여 제출하나(아니면 붙임만으로 제출). */
  file: boolean;
  /** 증빙 기록 붙임 — live = 살아 있음 · detached = 결재 통과 뒤 뗌 · none = 없음. */
  link: "live" | "detached" | "none";
  /** 문서 증빙 종류 칸 — 기본은 줄 거래처의 종류(세금계산서). */
  evidenceType?: string | null;
  /** 면제 확인 기록으로 닫음. */
  waived?: boolean;
  /** 결재 통과 뒤 살아 있는 05 파일을 전부 무효 처리. */
  voidFiles?: boolean;
};

type Doc = { expenseId: string; number: string; teamPm: Viewer };

let payer: Viewer;
const docs: Record<string, Doc> = {};

async function insertLink(by: Viewer, ownerId: string): Promise<string> {
  const [batch] = await db
    .insert(evidenceImportBatches)
    .values({ format: "hometax-tax-invoice", originalName: "매입 세금계산서.xls", fileSha256: randomBytes(32).toString("hex"), rowCount: 1, registeredCount: 1, skippedDuplicateCount: 0, uploadedBy: by.id })
    .returning({ id: evidenceImportBatches.id });
  if (!batch) throw new Error("등록 묶음 없음");
  const [record] = await db
    .insert(evidenceRecords)
    .values({ batchId: batch.id, format: "hometax-tax-invoice", evidenceType: "tax_invoice", dedupeKey: `test:${randomUUID()}`, issuedOn: "2026-09-20", supplyKrw: 12_400_000, vatKrw: 0, totalKrw: 12_400_000, createdBy: by.id })
    .returning({ id: evidenceRecords.id });
  if (!record) throw new Error("증빙 기록 없음");
  const [link] = await db
    .insert(evidenceRecordLinks)
    .values({ evidenceRecordId: record.id, ownerKind: "expense", ownerId, attachMode: "registrar", attachedBy: by.id })
    .returning({ id: evidenceRecordLinks.id });
  if (!link) throw new Error("붙임 없음");
  return link.id;
}

async function build(spec: Spec): Promise<Doc> {
  const fx = await setupExpenseProject();
  const created = await createExpenseFromLines(fx.pm, { lineIds: [fx.lines.withVendor], fields: { note: "행사 운영비" } });
  const expenseId = created.created[0]?.expenseId;
  if (!expenseId) throw new Error("지출결의를 만들지 못했다");
  const linkId = spec.link === "none" ? null : await insertLink(payer, expenseId);
  const submitted = spec.file
    ? await submitReadyDraft(fx.pm, expenseId)
    : await submitExpense(fx.pm, { expenseId, expectedVersion: await versionOf(expenseId) });
  if (submitted.kind !== "submitted") throw new Error("제출 안 됨");
  const first = await approveDocument(fx.lead, { instanceId: submitted.instanceId, expectedVersion: submitted.version });
  const final = await approveDocument(fx.ceo, { instanceId: submitted.instanceId, expectedVersion: first.version });
  if (final.status !== "approved") throw new Error(`결재 통과 안 됨: ${final.status}`);
  if (spec.link === "detached" && linkId) {
    await db.update(evidenceRecordLinks).set({ detachedAt: new Date(), detachedBy: payer.id, detachReason: "다른 건 증빙" }).where(eq(evidenceRecordLinks.id, linkId));
  }
  if (spec.voidFiles) {
    const voider = await makeEvidenceManager("증빙무효", { attach: false, void: true });
    const alive = await db
      .select({ id: files.id })
      .from(files)
      .where(and(eq(files.ownerKind, "expense"), eq(files.ownerId, expenseId), isNull(files.removedAt), isNull(files.voidedAt)));
    for (const file of alive) await voidEvidence(voider, { fileId: file.id, reason: "다른 건 영수증" });
  }
  if (spec.evidenceType !== undefined) await db.update(expenses).set({ evidenceType: spec.evidenceType }).where(eq(expenses.id, expenseId));
  if (spec.waived) await upsertReview(payer, { expenseId, status: "waived", amountBeforeKrw: null, amountAfterKrw: null, waiveReason: "원천징수 대상 아님", reviewedBy: payer.id }, db);
  return { expenseId, number: submitted.number, teamPm: fx.pm };
}

async function versionOf(expenseId: string): Promise<number> {
  const [row] = await db.select({ version: expenses.version }).from(expenses).where(eq(expenses.id, expenseId));
  if (!row) throw new Error("지출결의 없음");
  return row.version;
}

const MINE = () => new Set(Object.values(docs).map((doc) => doc.expenseId));

async function fileOnlyIds(viewer: Viewer, q?: string): Promise<string[]> {
  const mine = MINE();
  const all = await listAllPaymentTargets(viewer, { evidence: "file-only", ...(q ? { q } : {}) });
  return all.map((target) => target.row.id).filter((id) => mine.has(id));
}

beforeAll(async () => {
  await resetDatabase();
  await setEvidenceRequired(false);
  payer = await makePaymentManager("경영관리");
  if (!payer.roleId) throw new Error("계급 없음");
  for (const infoItem of ["expense.value", "expense.amount"]) await upsertVisibility(SYSTEM_VIEWER, { roleId: payer.roleId, infoItem, visible: true });
  docs.fileOnly = await build({ file: true, link: "none" });
  docs.fileAndLink = await build({ file: true, link: "live" });
  docs.linkOnly = await build({ file: false, link: "live" });
  docs.otherType = await build({ file: true, link: "none", evidenceType: "business_income" });
  docs.noType = await build({ file: true, link: "none", evidenceType: null });
  docs.waived = await build({ file: true, link: "none", waived: true });
  docs.detachedLink = await build({ file: true, link: "detached" });
  docs.voidedFile = await build({ file: true, link: "none", voidFiles: true });
  docs.cashReceipt = await build({ file: true, link: "none", evidenceType: "cash_receipt" });
}, 300_000);

describe("지급 대상 `파일만 있음` (06.1-10)", () => {
  it("열거 — 값 file-only가 알려지고 모르는 값은 필터 없음", () => {
    expect(parsePaymentEvidenceFilter("file-only")).toBe("file-only");
    expect(parsePaymentEvidenceFilter("zzz")).toBeNull();
  });

  it("문서 왕복 — parsePayReturn이 evidence=file-only를 backHref와 docQuery에 남긴다", () => {
    const back = parsePayReturn({ from: "pay", evidence: "file-only" });
    expect(back?.evidence).toBe("file-only");
    expect(back?.backHref).toContain("evidence=file-only");
    expect(back?.docQuery).toContain("evidence=file-only");
  });

  it("파일 1 · 붙임 0 · 파일 서식 종류만 든다 — 세금계산서 · 현금영수증 든다 / 파일+붙임 · 붙임만 · 집합 밖 종류 · 종류 빈 칸 · 면제 · 지운 파일은 빠진다", async () => {
    const ids = await fileOnlyIds(payer);
    expect(ids.sort()).toEqual([docs.fileOnly?.expenseId, docs.detachedLink?.expenseId, docs.cashReceipt?.expenseId].sort());
  });

  it("뗀 붙임만 있는 문서는 붙임 0으로 세어 든다 · 지운 파일만 있는 문서는 파일 0으로 세어 빠진다", async () => {
    const ids = await fileOnlyIds(payer);
    expect(ids).toContain(docs.detachedLink?.expenseId);
    expect(ids).not.toContain(docs.voidedFile?.expenseId);
  });

  it("06.5 검색 q와 AND — 번호가 맞는 문서만, 맞아도 조건 밖이면 안 나온다", async () => {
    expect(await fileOnlyIds(payer, docs.fileOnly?.number)).toEqual([docs.fileOnly?.expenseId]);
    expect(await fileOnlyIds(payer, docs.fileAndLink?.number)).toEqual([]);
  });

  it("보는 범위와 AND — 범위 밖 팀 계급에는 안 보이고 같은 팀 계급에는 보인다", async () => {
    const roleId = `role-${randomUUID()}`;
    await insertRole(SYSTEM_VIEWER, { id: roleId, name: `팀지급-${randomUUID().slice(0, 8)}`, workScope: "team", viewScope: "team" });
    await upsertPermission(SYSTEM_VIEWER, { roleId, menu: "expenses", action: "view", allowed: true });
    await upsertPermission(SYSTEM_VIEWER, { roleId, menu: "expenses.payments", action: "write", allowed: true });
    const outsider = await makePerson("범위밖", roleId, "경영관리팀");
    const insider = await makePerson("범위안", roleId, "기획1팀");
    expect(await fileOnlyIds(outsider)).toEqual([]);
    expect((await fileOnlyIds(insider)).length).toBeGreaterThanOrEqual(1);
  });

  it("지급 대상 목록(listPaymentTargets)도 같은 값으로 거른다 — 합계 건수 · 행", async () => {
    const list = await listPaymentTargets(payer, { evidence: "file-only", q: docs.fileOnly?.number ?? "" });
    const rows = list.groups.flatMap((group) => group.rows);
    expect(rows.map((row) => row.id)).toEqual([docs.fileOnly?.expenseId]);
    expect(list.total?.count).toBe(1);
  });
});
