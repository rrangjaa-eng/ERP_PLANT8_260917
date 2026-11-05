import { recordAction } from "@/domain/action-log/record";
import { getExpense } from "@/domain/expenses";
import { getLeave } from "@/domain/leave";
import { getSettlement } from "@/domain/settlements";
import type { Viewer } from "@/domain/viewer";
import { UserFacingError } from "@/lib/actions/user-facing-error";
import { hasDocumentPrintWithin } from "@/repositories/action-log";

// 07.4-01 D-7415: 서류 인쇄 기록. 열람은 서류 읽기 함수로 매번 다시 판정한다(클라이언트가 보낸 kind · id를 믿지 않는다).
// 성능: 기록 한 번에 서류 읽기 함수 한 번(정산은 getSettlement가 두 합까지 읽는다 — 30명 규모에서 받아들인다, eng 검토 P3).
export type PrintDocumentKind = "expense" | "leave" | "settlement";

// 클라이언트 합치기 창(PrintBar COALESCE_MS 5000)과 같다 — 서버도 같은 사람 · 종류 · 서류의 5초 안 재호출은 한 행으로 합친다.
export const PRINT_RECORD_WINDOW_SECONDS = 5;

type Found = { entity: string; number: string | null };

async function findDocument(viewer: Viewer, kind: PrintDocumentKind, id: string): Promise<Found | null> {
  if (kind === "expense") {
    const expense = await getExpense(viewer, { expenseId: id });
    return expense ? { entity: "expense", number: typeof expense.number === "string" ? expense.number : null } : null;
  }
  if (kind === "leave") {
    const leave = await getLeave(viewer, id);
    return leave ? { entity: "leave_request", number: typeof leave.number === "string" ? leave.number : null } : null;
  }
  const settlement = await getSettlement(viewer, { projectId: id });
  // 정산서의 번호는 프로젝트 번호다 — 투영으로 빠진 계급은 `{}`가 온다.
  return settlement ? { entity: "project", number: typeof settlement.projectNumber === "string" ? settlement.projectNumber : null } : null;
}

// deps.windowSeconds: 시험이 짧은 창으로 「창이 지난 뒤」를 만든다(action_log는 고칠 수 없는 표라 시각을 당길 수 없다).
export async function recordDocumentPrint(viewer: Viewer, input: { kind: PrintDocumentKind; id: string }, deps?: { windowSeconds?: number }): Promise<void> {
  const found = await findDocument(viewer, input.kind, input.id);
  if (!found) throw new UserFacingError("없는 서류 · 새로 고침");
  if (await hasDocumentPrintWithin(viewer, { actorId: viewer.id, documentId: input.id, kind: input.kind, windowSeconds: deps?.windowSeconds ?? PRINT_RECORD_WINDOW_SECONDS })) return;
  await recordAction(viewer, {
    actionType: "document_print",
    entity: found.entity,
    entityId: input.id,
    documentId: input.id,
    detail: { kind: input.kind, number: found.number },
  });
}
