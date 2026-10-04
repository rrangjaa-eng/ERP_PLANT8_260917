import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { SYSTEM_VIEWER, type Viewer } from "@/domain/viewer";
import { createAccount } from "@/domain/auth/accounts";
import { insertRole } from "@/repositories/roles";
import { upsertPermission } from "@/repositories/permissions";
import { insertCodeItem, setCodeItemActive, setCodeItemArchived } from "@/repositories/code-tables";
import { listProjectFormReferences, QUOTE_SUBCATEGORY_TABLE_KEY } from "@/domain/projects/references";

// quick 261001-hfi(MAST-04) — 견적 분류를 코드표 화면에서 끄거나 보관해도 그 분류를 쓰던 줄은 이름으로 읽힌다.
// 선택지(subcategories)는 활성 · 미보관만, 이름표(subcategoryLabels)는 전부.
async function makeViewer(): Promise<Viewer> {
  const role = await insertRole(SYSTEM_VIEWER, { id: `role-${randomUUID()}`, name: `분류 계급-${randomUUID()}`, workScope: "company" });
  await upsertPermission(SYSTEM_VIEWER, { roleId: role.id, menu: "projects", action: "view", allowed: true });
  const { userId } = await createAccount(SYSTEM_VIEWER, {
    email: `subcat-${randomUUID()}@example.test`,
    name: `분류 사람-${randomUUID()}`,
    roleId: role.id,
  });
  return { id: userId, roleId: role.id };
}

async function makeItem(label: string) {
  const suffix = randomUUID().slice(0, 8);
  return insertCodeItem(SYSTEM_VIEWER, { tableKey: QUOTE_SUBCATEGORY_TABLE_KEY, value: `subcat_${suffix}`, label: `${label}-${suffix}` });
}

describe("프로젝트 화면 견적 분류 선택지 · 이름표(MAST-04, 실제 Postgres)", () => {
  it("(s1) 선택지는 활성 · 미보관만, 이름표는 비활성 · 보관까지 전부 value · label로 싣는다", async () => {
    const active = await makeItem("활성 분류");
    const inactive = await makeItem("꺼진 분류");
    await setCodeItemActive(SYSTEM_VIEWER, inactive.id, false);
    const archived = await makeItem("보관 분류");
    await setCodeItemArchived(SYSTEM_VIEWER, archived.id, true);

    const references = await listProjectFormReferences(await makeViewer());

    const optionValues = references.subcategories.map((option) => option.value);
    expect(optionValues).toContain(active.value);
    expect(optionValues).not.toContain(inactive.value);
    expect(optionValues).not.toContain(archived.value);

    // /design-review(#138) — 고를 수 없는 분류는 코드표 화면 배지와 같은 상태 이름을 싣는다(편집 선택지에서 구분).
    expect(references.subcategoryLabels).toContainEqual({ value: active.value, label: active.label });
    expect(references.subcategoryLabels).toContainEqual({ value: inactive.value, label: inactive.label, status: "비활성" });
    expect(references.subcategoryLabels).toContainEqual({ value: archived.value, label: archived.label, status: "보관됨" });
  });
});
