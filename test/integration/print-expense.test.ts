import { describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { codeItems, expenses, files } from "@/db/schema";
import { listEvidence, voidEvidence } from "@/domain/evidence";
import { approveDocument } from "@/domain/approvals";
import { createExpenseFromLines, EXPENSE_DOCUMENT_KIND, getExpense } from "@/domain/expenses";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { upsertVisibility } from "@/repositories/permissions";
import { approvedExpenseWithEvidence } from "./fixtures/payments";
import { attachEvidence, makeEvidenceManager, setupExpenseProject, submitReadyDraft } from "./fixtures/expenses";
import { createInReviewExpenseFixture, createIntakeManager } from "./fixtures/evidence";

// 07.4-01 D-7408 · D-7412 — 지출결의서 인쇄물이 쓰는 재료: 금액 투영(키 유무가 판정 근거)과 증빙 파일 이름 목록(무효 · 숨김 제외).
// 페이지의 첨부 조건은 상세 화면과 같다 — listEvidence 결과 중 id · originalName이 있고 voidedAt이 없는 것.

const AMOUNT_KEYS = ["supply", "payableKrw", "vatKrw", "taxLine", "taxResult"] as const;
const printableNames = async (viewer: Parameters<typeof listEvidence>[0], expenseId: string) =>
  (await listEvidence(viewer, { ownerKind: EXPENSE_DOCUMENT_KIND, ownerId: expenseId })).flatMap((file) => (file.id && file.originalName && !file.voidedAt ? [file.originalName] : []));

describe("지출결의서 인쇄 재료", () => {
  it("금액을 볼 수 있으면 DTO에 supply · taxResult가 있고, 못 보는 계급은 금액 키가 하나도 없다", async () => {
    const fx = await setupExpenseProject();
    const doc = await approvedExpenseWithEvidence(fx);

    const full = await getExpense(fx.pm, { expenseId: doc.expenseId });
    expect(full).not.toBeNull();
    for (const key of AMOUNT_KEYS) expect(full, key).toHaveProperty(key);

    // 전사 보는 범위 + expense.value만 노출(expense.amount 없음) — 금액 키는 투영으로 빠진다.
    const manager = await makeEvidenceManager("금액못봄");
    if (!manager.roleId) throw new Error("계급 없음");
    await upsertVisibility(SYSTEM_VIEWER, { roleId: manager.roleId, infoItem: "expense.value", visible: true });
    const blind = await getExpense(manager, { expenseId: doc.expenseId });
    expect(blind).not.toBeNull();
    for (const key of AMOUNT_KEYS) expect(blind, key).not.toHaveProperty(key);
    expect(blind).toHaveProperty("number");
  });

  it("무효 처리된 증빙은 이름 목록에서 빠진다", async () => {
    const fx = await setupExpenseProject();
    // 승인 뒤에는 첨부를 더할 수 없어 제출 전에 두 번째 파일을 붙이고, 결재를 끝낸 뒤 그 파일을 무효 처리한다.
    const created = await createExpenseFromLines(fx.pm, { lineIds: [fx.lines.withVendor] });
    const expenseId = created.created[0]?.expenseId ?? "";
    await attachEvidence(fx.pm, expenseId, undefined, { name: "추가 전표.jpg" });
    const submitted = await submitReadyDraft(fx.pm, expenseId);
    if (submitted.kind !== "submitted") throw new Error("제출 안 됨");
    const first = await approveDocument(fx.lead, { instanceId: submitted.instanceId, expectedVersion: submitted.version });
    await approveDocument(fx.ceo, { instanceId: submitted.instanceId, expectedVersion: first.version });
    const manager = await makeEvidenceManager("증빙관리");
    const [extra] = await db.select({ id: files.id }).from(files).where(and(eq(files.ownerId, expenseId), eq(files.originalName, "추가 전표.jpg")));
    if (!extra) throw new Error("추가 증빙 없음");
    expect(await printableNames(fx.pm, expenseId)).toContain("추가 전표.jpg");

    await voidEvidence(manager, { fileId: extra.id, reason: "잘못 붙임" });
    const names = await printableNames(fx.pm, expenseId);
    expect(names).not.toContain("추가 전표.jpg");
    expect(names.length).toBeGreaterThan(0);
  });

  it("G15 숨긴 파일(올린 사람 · 경영관리만 보기)은 결재자의 목록에 없다", async () => {
    const fx = await setupExpenseProject();
    const manager = await createIntakeManager();
    const { expenseId } = await createInReviewExpenseFixture(fx);
    await attachEvidence(manager, expenseId, undefined, { name: "경영관리 전표.jpg" });
    await db.update(expenses).set({ evidenceType: "personal_card_receipt" }).where(eq(expenses.id, expenseId));
    // 개인카드 전표 종류는 올린 사람 · 경영관리만 본다 — 시드가 꺼져 있을 수 있어 켠다.
    await db.update(codeItems).set({ privateToOwner: true }).where(and(eq(codeItems.tableKey, "evidence_type"), eq(codeItems.value, "personal_card_receipt")));

    expect(await printableNames(fx.lead, expenseId)).toEqual([]);
    expect(await printableNames(manager, expenseId)).toContain("경영관리 전표.jpg");
  });
});
