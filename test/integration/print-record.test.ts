import { describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { actionLog } from "@/db/schema";
import { createExpenseFromLines, getExpense } from "@/domain/expenses";
import { getLeave, submitLeave } from "@/domain/leave";
import { getSettlement } from "@/domain/settlements";
import { recordDocumentPrint } from "@/domain/print/record";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { ACTION_LOG_OPTIONAL_TYPES } from "@/domain/settings/keys";
import { setSettingValue } from "@/domain/settings/registry";
import { UserFacingError } from "@/lib/actions/user-facing-error";
import { makePerson, NOW_2026 } from "./approvals-fixtures";
import { setupExpenseProject, submitReadyDraft } from "./fixtures/expenses";
import { setupSettlementProject } from "./fixtures/settlements";

// 07.4-01 D-7415 — 서류 인쇄 기록: 볼 수 있는 서류만 1행, 볼 수 없으면 UserFacingError + 0행, 끌 수 없는 종류.

async function printRows(documentId: string) {
  return db.select().from(actionLog).where(and(eq(actionLog.actionType, "document_print"), eq(actionLog.documentId, documentId)));
}

describe("recordDocumentPrint", () => {
  it("볼 수 있는 지출결의는 document_print 1행(actor · entity_id · detail.kind · detail.number)", async () => {
    const fx = await setupExpenseProject();
    const created = await createExpenseFromLines(fx.pm, { lineIds: [fx.lines.withVendor] });
    const expenseId = created.created[0]?.expenseId ?? "";
    await submitReadyDraft(fx.pm, expenseId);
    const number = (await getExpense(fx.pm, { expenseId }))?.number;

    await recordDocumentPrint(fx.pm, { kind: "expense", id: expenseId });
    const rows = await printRows(expenseId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ actorId: fx.pm.id, entity: "expense", entityId: expenseId });
    expect(rows[0]?.detail).toEqual({ kind: "expense", number });
  });

  it("볼 수 없는 계급이 부르면 UserFacingError이고 0행이다", async () => {
    const fx = await setupExpenseProject();
    const created = await createExpenseFromLines(fx.pm, { lineIds: [fx.lines.withVendor] });
    const expenseId = created.created[0]?.expenseId ?? "";
    await submitReadyDraft(fx.pm, expenseId);
    const stranger = await makePerson("외부직원", DEFAULT_ROLE_ID, null);

    await expect(recordDocumentPrint(stranger, { kind: "expense", id: expenseId })).rejects.toBeInstanceOf(UserFacingError);
    expect(await printRows(expenseId)).toHaveLength(0);
    await expect(recordDocumentPrint(fx.pm, { kind: "expense", id: "00000000-0000-4000-8000-000000000000" })).rejects.toBeInstanceOf(UserFacingError);
  });

  it("연차는 detail.number에 연차 번호가 실린다", async () => {
    const drafter = await makePerson("박서연", DEFAULT_ROLE_ID, "기획1팀");
    const deps = { now: NOW_2026 };
    const submitted = await submitLeave(drafter, { kind: "full_day", startDate: "2026-09-21", endDate: "2026-09-23", half: "" }, deps);
    const number = (await getLeave(drafter, submitted.leaveId, deps))?.number;

    await recordDocumentPrint(drafter, { kind: "leave", id: submitted.leaveId });
    const rows = await printRows(submitted.leaveId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ actorId: drafter.id, entity: "leave_request", entityId: submitted.leaveId });
    expect(rows[0]?.detail).toEqual({ kind: "leave", number });
  });

  it("정산서는 프로젝트 id로 부르고 detail.number는 프로젝트 번호다", async () => {
    const fx = await setupSettlementProject();
    await recordDocumentPrint(fx.pm, { kind: "settlement", id: fx.projectId });
    const rows = await printRows(fx.projectId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ actorId: fx.pm.id, entity: "project", entityId: fx.projectId });
    expect(rows[0]?.detail).toEqual({ kind: "settlement", number: (await getSettlement(fx.pm, { projectId: fx.projectId }))?.projectNumber ?? null });
    const stranger = await makePerson("외부직원", DEFAULT_ROLE_ID, null);
    await expect(recordDocumentPrint(stranger, { kind: "settlement", id: fx.projectId })).rejects.toBeInstanceOf(UserFacingError);
    expect(await printRows(fx.projectId)).toHaveLength(1);
  });

  it("행동 로그 선택 목록이 빈 배열이어도 1행이 남는다(끌 수 없음)", async () => {
    await setSettingValue(SYSTEM_VIEWER, ACTION_LOG_OPTIONAL_TYPES, []);
    const fx = await setupExpenseProject();
    const created = await createExpenseFromLines(fx.pm, { lineIds: [fx.lines.withVendor] });
    const expenseId = created.created[0]?.expenseId ?? "";
    await submitReadyDraft(fx.pm, expenseId);
    await recordDocumentPrint(fx.pm, { kind: "expense", id: expenseId });
    expect(await printRows(expenseId)).toHaveLength(1);
  });
});
