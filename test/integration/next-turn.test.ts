import { describe, expect, it } from "vitest";
import { listMyInbox, loadKindDetails } from "@/domain/approvals";
import { createExpenseFromLines, EXPENSE_DOCUMENT_KIND, saveExpenseDraft } from "@/domain/expenses";
import { submitLeave } from "@/domain/leave";
import { listNextTurnItems } from "@/domain/next-turn";
import { createVisibleMemo } from "@/domain/approvals";
import { addHistorizedValue } from "@/domain/settings/registry";
import { TAX_VAT_RATE } from "@/domain/settings/keys";
import { TEAM_LEAD_ROLE_ID } from "@/domain/permissions/roles";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { upsertVisibility } from "@/repositories/permissions";
import { NOW_2026 } from "./approvals-fixtures";
import { setupExpenseProject, submitReadyDraft, type ExpenseFixture } from "./fixtures/expenses";

// 05-10 Task 1 — 「내 차례」 공급 함수의 [결재] 갈래와 결재 시트 지출결의 상세(구조 → 투영 → 문자열 행, 증빙 갈래 · 세율 바뀜).
// 판정 · 글자는 전부 종류 요약(nextTurnText · measure)에서 온다 — 함수는 종류 이름으로 분기하지 않는다.

async function submittedExpense(fx: ExpenseFixture, note?: string) {
  const created = await createExpenseFromLines(fx.pm, { lineIds: [fx.lines.withVendor] });
  const expenseId = created.created[0]?.expenseId ?? "";
  if (note) await saveExpenseDraft(fx.pm, { expenseId, expectedVersion: 1, fields: { note } });
  const submitted = await submitReadyDraft(fx.pm, expenseId);
  if (submitted.kind !== "submitted") throw new Error("제출 안 됨");
  return { expenseId, instanceId: submitted.instanceId };
}

describe("listNextTurnItems — [결재]", () => {
  it("팀장(1단 담당)에게 지출결의 한 줄 — 대상 · 상황 · 숫자 · 행동 참조(인스턴스 id · version)", async () => {
    const fx = await setupExpenseProject();
    const { instanceId } = await submittedExpense(fx);

    const items = await listNextTurnItems(fx.lead);

    expect(items).toHaveLength(1);
    const item = items[0];
    expect(item).toMatchObject({
      tag: "결재",
      label: "가을 팝업 · 무대 제작 — 지출결의, 박서연",
      reason: "",
      measureText: "12,400,000",
    });
    expect(item?.key).toBeTruthy();
    expect(item?.approval).toMatchObject({ instanceId, version: 1, kind: EXPENSE_DOCUMENT_KIND });
    expect(item?.action).toEqual({ label: "지출결의 열기", href: item?.approval?.href });
  });

  it("무관한 사람(기안자 · 같은 팀 PM)은 0줄", async () => {
    const fx = await setupExpenseProject();
    await submittedExpense(fx);

    expect(await listNextTurnItems(fx.pm)).toEqual([]);
    expect(await listNextTurnItems(fx.otherPm)).toEqual([]);
  });

  it("연차 담당이면 연차 줄도 — 대상 = 기안자, 상황 = 연차 종류 · 기간, 숫자 = 일수 글자", async () => {
    const fx = await setupExpenseProject();
    await submittedExpense(fx);
    await submitLeave(fx.pm, { kind: "full_day", startDate: "2026-10-05", endDate: "2026-10-05", half: "" }, { now: NOW_2026 });

    const items = await listNextTurnItems(fx.lead);

    expect(items.map((item) => item.label)).toEqual(["가을 팝업 · 무대 제작 — 지출결의, 박서연", "박서연 — 연차 종일 10-05"]);
    expect(items[1]?.measureText).toBe("1일");
    expect(items.every((item) => item.tag === "결재")).toBe(true);
  });
});

describe("결재 시트 상세 — 증빙 갈래 · 세율 바뀜 (05-05 문자열 행에 덧붙임)", () => {
  const LABEL_ORDER = ["프로젝트", "견적 줄", "거래처", "증빙 종류", "공급가액", "지급 예정일", "지급 방식", "증빙", "비고"];
  const uniqueLabels = (rows: { label: string }[]) => [...new Set(rows.map((row) => row.label))];

  it("loadKindDetails와 listMyInbox(withDetails)가 같은 행을 돌려준다 — 증빙 행은 파일 id · 이름 · 크기 · 형식만, 주소 없음", async () => {
    const fx = await setupExpenseProject();
    const { expenseId } = await submittedExpense(fx, "1차 선금");

    const inbox = await listMyInbox(fx.lead, { withDetails: true });
    const rows = inbox.mine[0]?.detail?.rows ?? [];
    expect(uniqueLabels(rows)).toEqual(LABEL_ORDER);

    const evidence = rows.find((row) => "files" in row);
    expect(evidence).toEqual({
      kind: "evidence",
      label: "증빙",
      files: [{ id: expect.any(String), name: "세금계산서.jpg", sizeBytes: 212_000, contentType: "image/jpeg" }],
    });
    expect(JSON.stringify(evidence)).not.toMatch(/https?:|objectKey|sha256|url/i);

    const direct = await loadKindDetails(fx.lead, EXPENSE_DOCUMENT_KIND, [expenseId], { visible: createVisibleMemo() });
    expect(direct.get(expenseId)?.rows).toEqual(rows);
  });

  it("증빙이 아직 없는 문서는 증빙 행이 없다", async () => {
    const fx = await setupExpenseProject();
    const created = await createExpenseFromLines(fx.pm, { lineIds: [fx.lines.withVendor] });
    const expenseId = created.created[0]?.expenseId ?? "";
    const direct = await loadKindDetails(fx.pm, EXPENSE_DOCUMENT_KIND, [expenseId], { visible: createVisibleMemo() });
    expect(direct.get(expenseId)?.rows.some((row) => "files" in row)).toBe(false);
  });

  it("세율이 바뀌면 계산 한 줄 바로 아래에 세율 바뀜 한 줄(warning)", async () => {
    const fx = await setupExpenseProject();
    await addHistorizedValue(SYSTEM_VIEWER, TAX_VAT_RATE, { effectiveFrom: "2026-01-01", value: 0.1 });
    await submittedExpense(fx);
    await addHistorizedValue(SYSTEM_VIEWER, TAX_VAT_RATE, { effectiveFrom: "2026-06-01", value: 0.12 });

    const inbox = await listMyInbox(fx.lead, { withDetails: true });
    const supplyRows = (inbox.mine[0]?.detail?.rows ?? []).filter((row) => row.label === "공급가액");
    expect(supplyRows.map((row) => ("value" in row ? row.value : ""))).toEqual([
      "12,400,000",
      "부가세 10% 1,240,000 · 지급 총액 13,640,000 · 세금계산서 규칙",
      "세율 바뀜 · 부가세 10% → 12% · 지급 총액 13,640,000 → 13,888,000",
    ]);
    expect(supplyRows[2] && "tone" in supplyRows[2] ? supplyRows[2].tone : null).toBe("warning");
  });

  it("expense.amount 노출을 끈 계급의 결재 담당에게는 어떤 행 문자열에도 금액이 없고 증빙 행은 남는다", async () => {
    const fx = await setupExpenseProject();
    await addHistorizedValue(SYSTEM_VIEWER, TAX_VAT_RATE, { effectiveFrom: "2026-01-01", value: 0.1 });
    await submittedExpense(fx);
    await addHistorizedValue(SYSTEM_VIEWER, TAX_VAT_RATE, { effectiveFrom: "2026-06-01", value: 0.12 });
    await upsertVisibility(SYSTEM_VIEWER, { roleId: TEAM_LEAD_ROLE_ID, infoItem: "expense.amount", visible: false });

    const inbox = await listMyInbox(fx.lead, { withDetails: true });
    const rows = inbox.mine[0]?.detail?.rows ?? [];
    const text = JSON.stringify(rows);
    for (const digits of ["12,400,000", "1,240,000", "13,640,000", "13,888,000", "12400000", "세율 바뀜"]) expect(text).not.toContain(digits);
    expect(uniqueLabels(rows)).toEqual(LABEL_ORDER.filter((label) => label !== "공급가액"));
    expect(rows.some((row) => "files" in row)).toBe(true);
  });
});
