import { describe, expect, it } from "vitest";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { createRole } from "@/domain/permissions/roles";
import { setPermissionCell } from "@/domain/permissions/matrix";
import { can } from "@/domain/permissions/can";
import { ForbiddenError, listPairGridAxisItems } from "@/domain/settings/registry";
import { listCodeItems } from "@/repositories/code-tables";
import { makePerson } from "./approvals-fixtures";

// PR #171 Codex 지적 — 짝 격자 축을 코드표 메뉴 권한(listCodeItems → scopeFor("code_items"))으로 읽으면
// 설정 권한만 있는 계급은 빈 격자를 본다. 결재선 옵션(listApprovalRouteOptions)처럼 설정 보기 권한으로 읽는다.
describe("짝 격자 축 = 설정 보기 권한으로(PR #171 Codex)", () => {
  it("admin.settings view만 있는 계급도 두 코드표 값을 빠짐없이 받고, view가 없으면 ForbiddenError", async () => {
    const settingsOnly = await createRole(SYSTEM_VIEWER, { name: `설정만-짝-${Date.now()}` });
    await setPermissionCell(SYSTEM_VIEWER, { roleId: settingsOnly.id, menu: "admin.settings", action: "view", allowed: true });
    const viewer = await makePerson("설정담당", settingsOnly.id, null);
    expect(await can(viewer, "admin.code-tables", "view")).toBe(false);

    for (const tableKey of ["payment_method", "evidence_type"]) {
      const all = await listCodeItems(SYSTEM_VIEWER, { tableKey, scope: { rows: "all", includeArchived: true }, includeInactive: true });
      expect(all.length).toBeGreaterThan(0);
      const items = await listPairGridAxisItems(viewer, tableKey);
      expect(items).toEqual(all.map((row) => ({ value: row.value, label: row.label, active: row.active, archivedAt: row.archivedAt })));
    }

    const noView = await createRole(SYSTEM_VIEWER, { name: `권한없음-짝-${Date.now()}` });
    const outsider = await makePerson("외부인", noView.id, null);
    await expect(listPairGridAxisItems(outsider, "evidence_type")).rejects.toBeInstanceOf(ForbiddenError);
  });
});
