import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { Viewer } from "@/domain/viewer";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { DEFAULT_ROLE_ID, DIVISION_HEAD_ROLE_ID, TEAM_LEAD_ROLE_ID } from "@/domain/permissions/roles";
import { CODE_ITEM_DTO_SPEC, createCodeItem } from "@/domain/code-tables";
import { project, type DtoSpec } from "@/domain/permissions/project";
import { findVisibility, upsertVisibility } from "@/repositories/permissions";
import { insertCodeItem, type CodeItemRow } from "@/repositories/code-tables";
import { insertRole } from "@/repositories/roles";
import { visible } from "@/domain/permissions/visible";
import { seedMasterData } from "@/domain/seed";

const TABLE_KEY = `visibility_test_${randomUUID()}`;

// ADMN-02·ADMN-03: 노출 판정이 domain 출구(project)에서 실제로 필드를
// 가리고 남기는지 증명한다. 03-01의 코드표 DTO를 대상으로 삼는다(leak-scan은
// 등록 완전성만 보고, 이 파일은 값의 정합성을 본다).
describe("노출 판정의 실제 효과 (ADMN-02·ADMN-03)", () => {
  it("(a) 시스템 관리자는 spec의 모든 필드를 받는다", async () => {
    const dto = await createCodeItem(SYSTEM_VIEWER, { tableKey: TABLE_KEY, value: "a", label: "A" });
    const specKeys = CODE_ITEM_DTO_SPEC.fields.map((field) => field.key).sort();
    expect(Object.keys(dto).sort()).toEqual(specKeys);
  });

  it("(b) 노출표에서 한 항목을 끄면 그 계급의 결과에서 그 필드가 사라지고 나머지는 남는다", async () => {
    const row = await insertCodeItem(SYSTEM_VIEWER, { tableKey: TABLE_KEY, value: "b", label: "B" });
    const pmViewer: Viewer = { id: "pm-vis-tester-b", roleId: DEFAULT_ROLE_ID };

    // 기획본부(role-pm) 기본값: code_item.value·code_item.label 둘 다 참(시드).
    const before = await project(pmViewer, row, CODE_ITEM_DTO_SPEC);
    expect(before.label).toBe("B");
    expect(before.value).toBe("b");

    await upsertVisibility(SYSTEM_VIEWER, {
      roleId: DEFAULT_ROLE_ID,
      infoItem: "code_item.label",
      visible: false,
    });

    const after = await project(pmViewer, row, CODE_ITEM_DTO_SPEC);
    expect(after.label).toBeUndefined();
    expect(after.value).toBe("b"); // 끄지 않은 나머지 필드는 그대로 남는다
  });

  it("(c) 노출표에 행이 없는 계급은 그 필드를 못 받는다", async () => {
    const row = await insertCodeItem(SYSTEM_VIEWER, { tableKey: TABLE_KEY, value: "c", label: "C" });
    // 04-20부터 시드가 시드 계급 다섯 전부에 노출 행을 넣는다 — 관리자가 새로 만든
    // 계급은 시드가 건드리지 않아 노출표 행이 전혀 없다.
    const role = await insertRole(SYSTEM_VIEWER, { id: `role-${randomUUID()}`, name: `노출 없는 계급-${randomUUID()}` });
    const noRowViewer: Viewer = { id: "no-row-vis-tester", roleId: role.id };

    const dto = await project(noRowViewer, row, CODE_ITEM_DTO_SPEC);
    expect(dto.value).toBeUndefined();
    expect(dto.label).toBeUndefined();
  });

  it("(d) 같은 정보 항목이 두 DTO에 쓰일 때 한 번의 노출표 변경이 둘 다에 적용된다", async () => {
    // 프로덕션 레지스트리를 오염시키지 않도록 두 번째 DTO spec은 테스트 안의
    // 지역 상수로만 만든다 — code_item.label을 재사용하는 가상의 두 번째 DTO.
    type SecondDto = { label: string };
    const secondSpec: DtoSpec<CodeItemRow, SecondDto> = {
      fields: [{ key: "label", from: "label", infoItem: "code_item.label" }],
    };

    const row = await insertCodeItem(SYSTEM_VIEWER, { tableKey: TABLE_KEY, value: "d", label: "D" });
    const pmViewer: Viewer = { id: "pm-vis-tester-d", roleId: DEFAULT_ROLE_ID };

    await upsertVisibility(SYSTEM_VIEWER, {
      roleId: DEFAULT_ROLE_ID,
      infoItem: "code_item.label",
      visible: false,
    });

    const firstOff = await project(pmViewer, row, CODE_ITEM_DTO_SPEC);
    const secondOff = await project(pmViewer, row, secondSpec);
    expect(firstOff.label).toBeUndefined();
    expect(secondOff.label).toBeUndefined();

    await upsertVisibility(SYSTEM_VIEWER, {
      roleId: DEFAULT_ROLE_ID,
      infoItem: "code_item.label",
      visible: true,
    });

    const firstOn = await project(pmViewer, row, CODE_ITEM_DTO_SPEC);
    const secondOn = await project(pmViewer, row, secondSpec);
    expect(firstOn.label).toBe("D");
    expect(secondOn.label).toBe("D");
  });

  // 04-16(D-85 · T-04-87) — 발행액은 기획본부 기본 공개, 입금액은 기본 숨김. 시드가 기획 PM의 발행액 행을 upsert하므로
  // 시드를 다시 돌린 기존 DB에도 반영된다. 팀장·본부 책임자 행은 없을 때만 숨김으로 넣고 이미 있으면 건드리지 않는다(CEO 리뷰 B-29).
  it("(e) 시드된 새 DB에서 기획 PM은 revenue.issued_amount를 보고 revenue.paid_amount는 못 본다 — 팀장·본부 책임자는 발행액 숨김(D-85 · B-29)", async () => {
    const pmViewer: Viewer = { id: "pm-vis-tester-e", roleId: DEFAULT_ROLE_ID };
    expect(await visible(pmViewer, "revenue.issued_amount")).toBe(true);
    expect(await visible(pmViewer, "revenue.paid_amount")).toBe(false);
    for (const roleId of [TEAM_LEAD_ROLE_ID, DIVISION_HEAD_ROLE_ID]) {
      expect((await findVisibility(SYSTEM_VIEWER, roleId, "revenue.issued_amount"))?.visible).toBe(false);
    }
  });

  it("(f) 기획 PM 발행액 행이 숨김인 기존 DB에서 시드를 다시 돌리면 공개가 되고, 팀장·본부 책임자 행은 건드리지 않는다(D-85 · B-29)", async () => {
    await upsertVisibility(SYSTEM_VIEWER, { roleId: DEFAULT_ROLE_ID, infoItem: "revenue.issued_amount", visible: false });
    await upsertVisibility(SYSTEM_VIEWER, { roleId: TEAM_LEAD_ROLE_ID, infoItem: "revenue.issued_amount", visible: true });
    await seedMasterData(SYSTEM_VIEWER);
    const pmViewer: Viewer = { id: "pm-vis-tester-f", roleId: DEFAULT_ROLE_ID };
    expect(await visible(pmViewer, "revenue.issued_amount")).toBe(true);
    expect((await findVisibility(SYSTEM_VIEWER, TEAM_LEAD_ROLE_ID, "revenue.issued_amount"))?.visible).toBe(true);
    expect((await findVisibility(SYSTEM_VIEWER, DIVISION_HEAD_ROLE_ID, "revenue.issued_amount"))?.visible).toBe(false);
  });
});
