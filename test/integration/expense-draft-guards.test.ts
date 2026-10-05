import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { ZodError } from "zod";
import { db } from "@/db/client";
import { and } from "drizzle-orm";
import { codeItems, expenses } from "@/db/schema";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { ForbiddenError } from "@/domain/permissions/can";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import {
  changeExpenseVendor,
  createExpenseFromLines,
  createTeamExpenseDraft,
  ExpenseFieldError,
  getNewExpenseDefaults,
  ExpenseNotFoundError,
  listExpenseFormOptions,
  previewExpense,
  saveExpenseDraft,
  withdrawExpense,
} from "@/domain/expenses";
import { GateBlockedError } from "@/domain/rules/gate";
import { UserFacingError } from "@/lib/actions/user-facing-error";
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

describe("증빙 종류 · 지급 방식은 쓰는 코드만 (A4 · adversarial F2)", () => {
  it("코드표에 없는 증빙 종류 · 지급 방식으로는 임시 저장 · 첫 저장 · 줄 문서 만들기를 하지 못한다", async () => {
    const fx = await setupExpenseProject();
    const expenseId = await teamDraft(fx.pm);
    const { version } = await expenseRow(expenseId);
    await expect(saveExpenseDraft(fx.pm, { expenseId, expectedVersion: version, fields: { evidenceType: "zz_none" } })).rejects.toThrow(
      "쓰지 않는 증빙 종류 · 증빙 종류 고르기",
    );
    await expect(saveExpenseDraft(fx.pm, { expenseId, expectedVersion: version, fields: { paymentMethod: "zz_none" } })).rejects.toThrow(
      "쓰지 않는 지급 방식 · 지급 방식 고르기",
    );
    await expect(
      createTeamExpenseDraft(fx.pm, { idempotencyKey: randomUUID(), fields: { usageDate: "2026-09-26", paymentMethod: "zz_none" } }),
    ).rejects.toBeInstanceOf(UserFacingError);
    await expect(createExpenseFromLines(fx.pm, { lineIds: [fx.lines.withVendor], fields: { paymentMethod: "zz_none" } })).rejects.toBeInstanceOf(
      UserFacingError,
    );
    expect(await expenseRow(expenseId)).toMatchObject({ version, evidenceType: null });
  });

  it("저장 뒤 비활성이 된 증빙 종류는 그대로 저장은 되지만 제출은 `증빙 종류 비어 있음`으로 막힌다", async () => {
    const fx = await setupExpenseProject();
    const expenseId = await lineDraft(fx.pm, fx.lines.withVendor);
    const payment = (await listExpenseFormOptions(fx.pm)).payment[0]?.value ?? null;
    await saveExpenseDraft(fx.pm, {
      expenseId,
      expectedVersion: (await expenseRow(expenseId)).version,
      fields: { evidenceType: "tax_invoice", paymentMethod: payment, supply: { currency: "KRW", amount: 1_000_000, fxRate: 1 } },
    });
    await db.update(codeItems).set({ active: false }).where(and(eq(codeItems.tableKey, "evidence_type"), eq(codeItems.value, "tax_invoice")));

    // 자동 저장은 같은 값을 다시 보낸다 — 이미 저장된 값은 막지 않는다.
    await saveExpenseDraft(fx.pm, { expenseId, expectedVersion: (await expenseRow(expenseId)).version, fields: { evidenceType: "tax_invoice", note: "메모" } });
    const error = await submitReadyDraft(fx.pm, expenseId).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(GateBlockedError);
    expect(error).toMatchObject({ message: "증빙 종류 비어 있음 · 증빙 종류 고르기" });
    expect((await expenseRow(expenseId)).number).toBeNull();
  });
});

describe("거래처 바꾸기의 기본 증빙 종류도 쓰는 코드만 (C5 · rereview 3)", () => {
  it("거래처 기본 증빙 종류가 비활성 코드면 거래처만 바뀌고 증빙 종류는 그대로다", async () => {
    const fx = await setupExpenseProject();
    const expenseId = await teamDraft(fx.pm);
    await saveExpenseDraft(fx.pm, { expenseId, expectedVersion: (await expenseRow(expenseId)).version, fields: { evidenceType: "other_income" } });
    const vendor = await vendorNamed("비활성기본집");
    await db.update(codeItems).set({ active: false }).where(and(eq(codeItems.tableKey, "evidence_type"), eq(codeItems.value, "tax_invoice")));

    const changed = await changeExpenseVendor(fx.pm, { expenseId, vendorId: vendor.id, expectedVersion: (await expenseRow(expenseId)).version });
    expect(changed).toMatchObject({ evidenceType: "other_income" });
    expect(await expenseRow(expenseId)).toMatchObject({ vendorId: vendor.id, evidenceType: "other_income" });
  });
});

describe("번호 있는 문서의 공급가액 (A5 · adversarial F4)", () => {
  it("회수된 문서에서 공급가액을 비우거나 0으로 저장하면 DB 오류가 아니라 공급가액 칸 오류다", async () => {
    const fx = await setupExpenseProject();
    const expenseId = await lineDraft(fx.pm, fx.lines.withVendor);
    expect(await submitReadyDraft(fx.pm, expenseId)).toMatchObject({ kind: "submitted" });
    await withdrawExpense(fx.pm, { expenseId, undo: true, round: 1 });
    const before = await expenseRow(expenseId);

    const cleared = await saveExpenseDraft(fx.pm, { expenseId, expectedVersion: before.version, fields: { supply: null } }).catch((e: unknown) => e);
    expect(cleared).toBeInstanceOf(ExpenseFieldError);
    expect(cleared).toMatchObject({ field: "supplyAmount", message: "공급가액 비어 있음 · 공급가액 적기" });

    const zero = await saveExpenseDraft(fx.pm, { expenseId, expectedVersion: before.version, fields: { supply: { currency: "KRW", amount: 0, fxRate: 1 } } }).catch(
      (e: unknown) => e,
    );
    expect(zero).toBeInstanceOf(ExpenseFieldError);
    expect(zero).toMatchObject({ field: "supplyAmount", message: "공급가액이 0 · 0보다 크게" });
    expect(await expenseRow(expenseId)).toMatchObject({ version: before.version, supplyAmountKrw: before.supplyAmountKrw });
  });
});

describe("달력에 없는 날짜 (A6 · red-team)", () => {
  it("팀 비용 사용일 2026-02-30은 DB 오류가 아니라 입력 검증 오류이고, 새 문서 화면 사용일은 칸 오류 한 줄이다", async () => {
    const fx = await setupExpenseProject();
    const expenseId = await teamDraft(fx.pm);
    const { version } = await expenseRow(expenseId);
    await expect(saveExpenseDraft(fx.pm, { expenseId, expectedVersion: version, fields: { usageDate: "2026-02-30" } })).rejects.toBeInstanceOf(ZodError);
    await expect(saveExpenseDraft(fx.pm, { expenseId, expectedVersion: version, fields: { scheduledPaymentDate: "2026-13-01" } })).rejects.toBeInstanceOf(ZodError);
    expect(await getNewExpenseDefaults(fx.pm, { usageDate: "2026-02-30" })).toMatchObject({ usageDateError: "날짜 형식 오류 · 2026-09-19처럼" });
  });

  it("0000년 지급 예정일은 PostgreSQL date 범위 오류(500)가 아니라 입력 검증 오류다 (C2)", async () => {
    const fx = await setupExpenseProject();
    const expenseId = await teamDraft(fx.pm);
    const { version } = await expenseRow(expenseId);
    await expect(saveExpenseDraft(fx.pm, { expenseId, expectedVersion: version, fields: { scheduledPaymentDate: "0000-01-01" } })).rejects.toBeInstanceOf(ZodError);
  });
});
