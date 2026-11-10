import { randomUUID } from "node:crypto";
import { createCodeItem, setCodeItemActive } from "@/domain/code-tables";
import { SYSTEM_VIEWER } from "@/domain/viewer";

// 07.2-07 — 사유 목록은 전역 코드표라 시험이 등록한 항목은 끝에 비활성으로 돌려놓는다(다음 시험이 「항목 0건」을 볼 수 있게).
export type ReasonTableKey = "reject_reason" | "prepaid_reason" | "requested_payment_reason";

export async function seedReasonOptions(tableKey: ReasonTableKey, labels: string[]): Promise<() => Promise<void>> {
  const ids: string[] = [];
  for (const [index, label] of labels.entries()) {
    const dto = await createCodeItem(SYSTEM_VIEWER, { tableKey, value: `e2e-${randomUUID().slice(0, 8)}`, label, sortOrder: index + 1 });
    ids.push(dto.id);
  }
  return async () => {
    for (const id of ids) await setCodeItemActive(SYSTEM_VIEWER, id, false);
  };
}
