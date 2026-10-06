import { describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { codeItems } from "@/db/schema";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { PAYMENT_METHOD_EVIDENCE_PAIRS } from "@/domain/settings/keys";
import { getSettingValue, setSettingValue } from "@/domain/settings/registry";
import { importSettings, ImportValidationError } from "@/domain/settings/export";

// Regression: ISSUE-002 — 설정 JSON 가져오기가 setSettingValue의 짝 격자 가드(보관 값으로 새 짝 불가)를 지나지 않아
// 보관된 지급 방식으로 새 짝을 만들 수 있었다.
// Found by /qa on 2026-10-06 (PR #171)
async function archiveCode(tableKey: string, value: string) {
  await db
    .update(codeItems)
    .set({ archivedAt: new Date(), archivedBy: "qa" })
    .where(and(eq(codeItems.tableKey, tableKey), eq(codeItems.value, value)));
}

function payload(pairs: { method: string; evidence: string }[]) {
  return { schemaVersion: "1", exportedAt: new Date().toISOString(), settings: { [PAYMENT_METHOD_EVIDENCE_PAIRS.key]: pairs } };
}

describe("설정 가져오기 — 짝 격자 보관 값 가드", () => {
  it("보관된 지급 방식으로 새 짝을 가져오면 아무것도 쓰지 않고 거부한다", async () => {
    await archiveCode("payment_method", "cash");

    await expect(importSettings(SYSTEM_VIEWER, payload([{ method: "cash", evidence: "tax_invoice" }]))).rejects.toBeInstanceOf(
      ImportValidationError,
    );
    expect(await getSettingValue(PAYMENT_METHOD_EVIDENCE_PAIRS)).toEqual([]);
  });

  it("이미 저장된 보관 값의 짝은 그대로 가져올 수 있다(해제 · 유지)", async () => {
    const stored = [{ method: "cash", evidence: "tax_invoice" }];
    await setSettingValue(SYSTEM_VIEWER, PAYMENT_METHOD_EVIDENCE_PAIRS, stored);
    await archiveCode("payment_method", "cash");

    await importSettings(SYSTEM_VIEWER, payload([...stored, { method: "bank_transfer", evidence: "invoice" }]));
    expect(await getSettingValue(PAYMENT_METHOD_EVIDENCE_PAIRS)).toEqual([...stored, { method: "bank_transfer", evidence: "invoice" }]);
  });
});
