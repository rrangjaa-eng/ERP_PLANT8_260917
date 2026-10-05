import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { expenses } from "@/db/schema";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { ForbiddenError } from "@/domain/permissions/can";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { createExpenseFromLines, createTeamExpenseDraft, ExpenseNotFoundError, previewExpense, saveExpenseDraft } from "@/domain/expenses";
import { insertVendor, setVendorArchived, setVendorHidden } from "@/repositories/vendors";
import { upsertPermission } from "@/repositories/permissions";
import { setupExpenseProject, submitReadyDraft } from "./fixtures/expenses";

// 05 /review 배치 A — 임시 저장 경로의 가드(거래처 바꿔치기 · 쓰기 권한).

async function expenseRow(id: string) {
  const [row] = await db.select().from(expenses).where(eq(expenses.id, id));
  if (!row) throw new Error("지출결의 행 없음");
  return row;
}

async function vendorNamed(name: string) {
  return insertVendor(SYSTEM_VIEWER, { name, normalizedName: `${name}-${randomUUID()}`.toLowerCase(), defaultEvidenceType: "tax_invoice" });
}

async function lineDraft(viewer: Viewer, lineId: string): Promise<string> {
  const created = await createExpenseFromLines(viewer, { lineIds: [lineId] });
  const expenseId = created.created[0]?.expenseId;
  if (!expenseId) throw new Error(`작성 중 문서 없음: ${JSON.stringify(created.blocked)}`);
  return expenseId;
}

async function teamDraft(viewer: Viewer): Promise<string> {
  const { expenseId } = await createTeamExpenseDraft(viewer, {
    idempotencyKey: randomUUID(),
    fields: { teamExpenseKind: "team_overhead", usageDate: "2026-09-26", content: "팀 회식" },
  });
  return expenseId;
}

describe("거래처 바꿔치기 (A1 · adversarial F1)", () => {
  it("견적 줄 문서는 임시 저장으로 거래처를 바꾸지 못한다(거래처는 줄이 정한다)", async () => {
    const fx = await setupExpenseProject();
    const expenseId = await lineDraft(fx.pm, fx.lines.withVendor);
    const other = await vendorNamed("바꿔치기거래처");
    const before = await expenseRow(expenseId);

    await expect(saveExpenseDraft(fx.pm, { expenseId, expectedVersion: before.version, fields: { vendorId: other.id } })).rejects.toBeInstanceOf(
      ExpenseNotFoundError,
    );
    expect(await expenseRow(expenseId)).toMatchObject({ vendorId: fx.stageOneId, version: before.version });
  });

  it("팀 비용 문서도 숨김 · 보관 거래처로는 임시 저장하지 못한다", async () => {
    const fx = await setupExpenseProject();
    const expenseId = await teamDraft(fx.pm);
    const hidden = await vendorNamed("숨김거래처");
    await setVendorHidden(SYSTEM_VIEWER, hidden.id, true);
    const archived = await vendorNamed("보관거래처");
    await setVendorArchived(SYSTEM_VIEWER, archived.id, true);

    for (const vendor of [hidden, archived]) {
      const { version } = await expenseRow(expenseId);
      await expect(saveExpenseDraft(fx.pm, { expenseId, expectedVersion: version, fields: { vendorId: vendor.id } })).rejects.toBeInstanceOf(
        ExpenseNotFoundError,
      );
    }
    expect((await expenseRow(expenseId)).vendorId).toBeNull();

    const usable = await vendorNamed("쓸수있는거래처");
    await saveExpenseDraft(fx.pm, { expenseId, expectedVersion: (await expenseRow(expenseId)).version, fields: { vendorId: usable.id } });
    expect((await expenseRow(expenseId)).vendorId).toBe(usable.id);
  });

  it("팀 비용 첫 저장도 숨김 거래처를 받지 않는다", async () => {
    const fx = await setupExpenseProject();
    const hidden = await vendorNamed("첫저장숨김");
    await setVendorHidden(SYSTEM_VIEWER, hidden.id, true);
    await expect(
      createTeamExpenseDraft(fx.pm, {
        idempotencyKey: randomUUID(),
        fields: { teamExpenseKind: "team_overhead", usageDate: "2026-09-26", content: "팀 회식", vendorId: hidden.id },
      }),
    ).rejects.toBeInstanceOf(ExpenseNotFoundError);
  });

  it("제출하면 견적 줄 문서의 거래처는 줄의 거래처로 맞춰진다", async () => {
    const fx = await setupExpenseProject();
    const expenseId = await lineDraft(fx.pm, fx.lines.withVendor);
    // 고치기 전 경로로 어긋난 행(줄 거래처 ≠ 문서 거래처)을 재현한다.
    const drifted = await vendorNamed("어긋난거래처");
    await db.update(expenses).set({ vendorId: drifted.id }).where(eq(expenses.id, expenseId));

    expect(await submitReadyDraft(fx.pm, expenseId)).toMatchObject({ kind: "submitted" });
    expect((await expenseRow(expenseId)).vendorId).toBe(fx.stageOneId);
  });
});

describe("임시 저장 · 미리보기 쓰기 권한 (A1 · adversarial F11)", () => {
  it("지출결의 쓰기 권한이 빠진 기안자는 자기 작성 중 문서도 저장 · 미리보기하지 못한다", async () => {
    const fx = await setupExpenseProject();
    const drafter = fx.pm;
    const expenseId = await teamDraft(drafter);
    // 테스트마다 DB를 비우고 시드를 다시 넣으므로(setup.ts) 기본 계급 권한을 바꿔도 다른 테스트로 새지 않는다.
    await upsertPermission(SYSTEM_VIEWER, { roleId: DEFAULT_ROLE_ID, menu: "expenses", action: "write", allowed: false });
    const { version } = await expenseRow(expenseId);

    await expect(saveExpenseDraft(drafter, { expenseId, expectedVersion: version, fields: { content: "고침" } })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(previewExpense(drafter, { expenseId, fields: {} })).rejects.toBeInstanceOf(ForbiddenError);
    expect(await expenseRow(expenseId)).toMatchObject({ content: "팀 회식", version });
  });
});
