import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { Viewer } from "@/domain/viewer";
import { SYSTEM_VIEWER } from "@/domain/viewer";
import { DEFAULT_ROLE_ID } from "@/domain/permissions/roles";
import { CODE_ITEM_DTO_SPEC, createCodeItem } from "@/domain/code-tables";
import { project, type DtoSpec } from "@/domain/permissions/project";
import { upsertVisibility } from "@/repositories/permissions";
import { insertCodeItem, type CodeItemRow } from "@/repositories/code-tables";

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
    // role-ceo는 domain/seed가 sysadmin·pm 둘만 채우므로 노출표 행이 전혀 없다.
    const ceoViewer: Viewer = { id: "ceo-vis-tester", roleId: "role-ceo" };

    const dto = await project(ceoViewer, row, CODE_ITEM_DTO_SPEC);
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
});
